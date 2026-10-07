package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/lumiaurora/subscan/internal/config"
	"github.com/lumiaurora/subscan/internal/engine"
	"github.com/lumiaurora/subscan/internal/models"
	"github.com/lumiaurora/subscan/internal/output"
	"github.com/lumiaurora/subscan/internal/storage"
)

// RunScan executes the 'scan' subcommand with the provided arguments.
func RunScan(args []string, outW io.Writer, errW io.Writer) int {
	configArg, configExplicit, err := discoverConfigPath(args)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	configFile, loadedConfigPath, err := config.Load(configArg, configExplicit)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to load config: %v\n", err)
		return 1
	}

	flagArgs, positionalTarget := partitionArgs(args)

	fs := flag.NewFlagSet("scan", flag.ContinueOnError)
	fs.SetOutput(errW)
	fs.Usage = func() {
		PrintScanHelp(errW)
	}

	var (
		domainShort    = fs.String("d", "", "target domain")
		domainLong     = fs.String("domain", "", "target domain")
		inputShort     = fs.String("i", "", "input file or '-' for stdin")
		inputLong      = fs.String("input", "", "input file or '-' for stdin")
		resolveFlag    = fs.Bool("resolve", configBool(configFile.Defaults.Resolve, false), "resolve DNS")
		jsonFlag       = fs.Bool("json", configBool(configFile.Defaults.JSON, false), "export JSON")
		txtFlag        = fs.Bool("txt", configBool(configFile.Defaults.TXT, false), "export TXT")
		outputShort    = fs.String("o", "", "output file path")
		outputLong     = fs.String("output", configFile.Defaults.Output, "output file path")
		sourcesLong    = fs.String("sources", "", "comma-separated sources")
		sourceShort    = fs.String("source", "", "comma-separated sources")
		excludeLong    = fs.String("exclude-sources", "", "exclude sources")
		excludeShort   = fs.String("exclude-source", "", "exclude sources")
		threadsFlag    = fs.Int("threads", configInt(configFile.Defaults.Threads, engine.DefaultThreads), "max concurrent threads")
		timeoutFlag    = fs.String("timeout", strconv.Itoa(configInt(configFile.Defaults.TimeoutSeconds, 30)), "timeout duration or seconds")
		retriesFlag    = fs.Int("retries", configInt(configFile.Defaults.Retries, engine.DefaultRetries), "retry count")
		verboseFlag    = fs.Bool("verbose", configBool(configFile.Defaults.Verbose, false), "verbose logs")
		configPathFlag = fs.String("config", configArg, "config path")
		dbFlag         = fs.String("db", "", "path to SQLite database")
	)

	if err := fs.Parse(flagArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 1
	}

	_ = configPathFlag

	domain := positionalTarget
	if domain == "" && fs.NArg() > 0 {
		domain = fs.Arg(0)
	}
	if domain == "" {
		domain = pickDomain(*domainShort, *domainLong)
	}

	inputPath := pickInput(*inputShort, *inputLong)
	outputPath := *outputShort
	if outputPath == "" {
		outputPath = *outputLong
	}

	includeList := parseCSVList(*sourcesLong)
	if len(includeList) == 0 {
		includeList = parseCSVList(*sourceShort)
	}
	if len(includeList) == 0 && len(configFile.Defaults.IncludeSources) > 0 {
		includeList = configFile.Defaults.IncludeSources
	}

	excludeList := parseCSVList(*excludeLong)
	if len(excludeList) == 0 {
		excludeList = parseCSVList(*excludeShort)
	}
	if len(excludeList) == 0 && len(configFile.Defaults.ExcludeSources) > 0 {
		excludeList = configFile.Defaults.ExcludeSources
	}

	timeout := parseTimeoutDuration(*timeoutFlag)
	stdinInput := stdinHasData()

	if strings.TrimSpace(domain) != "" && strings.TrimSpace(inputPath) != "" {
		fmt.Fprintln(errW, "[!] Use either target domain or --input, not both.")
		return 1
	}

	if *threadsFlag <= 0 {
		fmt.Fprintln(errW, "[!] --threads must be greater than 0.")
		return 1
	}

	if timeout <= 0 {
		fmt.Fprintln(errW, "[!] --timeout must be greater than 0.")
		return 1
	}

	if *retriesFlag < 0 {
		fmt.Fprintln(errW, "[!] --retries cannot be negative.")
		return 1
	}

	if *jsonFlag && *txtFlag {
		fmt.Fprintln(errW, "[!] Choose either --json or --txt, not both.")
		return 1
	}

	// Collect inputs
	targetInputs, err := collectTargetInputs(domain, inputPath, stdinInput)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	if len(targetInputs) == 0 {
		fmt.Fprintln(errW, "[!] A target domain is required.")
		PrintScanHelp(errW)
		return 1
	}

	targets, invalidTargets := engine.PrepareTargets(targetInputs)
	if len(targets) == 0 {
		if len(invalidTargets) == 1 {
			fmt.Fprintf(errW, "[!] Invalid target domain: %q\n", invalidTargets[0].Domain)
		} else {
			fmt.Fprintln(errW, "[!] No valid target domains provided.")
		}
		return 1
	}

	for _, invalid := range invalidTargets {
		fmt.Fprintf(errW, "[!] %s: %s\n", invalid.Domain, invalid.Error)
	}

	batchMode := len(targets)+len(invalidTargets) > 1
	outputLabel := targets[0]
	if batchMode {
		outputLabel = "batch"
	}

	format, finalOutputPath, err := determineOutput(*jsonFlag, *txtFlag, outputPath, outputLabel)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	rawStdoutOnly := (*jsonFlag || *txtFlag) && outputPath == ""

	eng := engine.NewEngine()
	selectedSources, err := eng.SelectSources(includeList, excludeList)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	batchStartedAt := time.Now().UTC()
	scanResults := make([]models.Report, 0, len(targets))
	failedTargets := append([]models.TargetFailure(nil), invalidTargets...)

	engineOpts := engine.ScanOptions{
		Resolve:        *resolveFlag,
		Threads:        *threadsFlag,
		Timeout:        timeout,
		Retries:        *retriesFlag,
		Verbose:        *verboseFlag,
		IncludeSources: includeList,
		ExcludeSources: excludeList,
		OTXAPIKey:      resolveAPIKey("OTX_API_KEY", configFile.OTXAPIKey),
		VTAPIKey:       resolveAPIKey("VT_API_KEY", configFile.VTAPIKey),
		ShodanAPIKey:   resolveAPIKey("SHODAN_API_KEY", configFile.ShodanAPIKey),
	}

	dbPath, err := storage.ResolveDatabasePath(*dbFlag, configFile.DatabasePath)
	if err != nil && !rawStdoutOnly {
		fmt.Fprintf(errW, "[!] Warning: failed to resolve database path: %v\n", err)
	}
	var (
		store           *storage.SQLiteStorage
		dbInitAttempted bool
		dbErr           error
	)
	defer func() {
		if store != nil {
			_ = store.Close()
		}
	}()

	for index, target := range targets {
		if !rawStdoutOnly {
			if !batchMode {
				fmt.Fprintln(outW, "ReconLens")
				fmt.Fprintln(outW, "Passive Reconnaissance & OSINT Intelligence")
				fmt.Fprintln(outW)
				fmt.Fprintf(outW, "Target:  %s\n", target)
				fmt.Fprintf(outW, "Sources: %d enabled\n", len(selectedSources))
				modeStr := "passive"
				if *resolveFlag {
					modeStr = "passive + DNS verification"
				}
				fmt.Fprintf(outW, "Mode:    %s\n", modeStr)
				if *verboseFlag && loadedConfigPath != "" {
					fmt.Fprintf(outW, "Config:  %s\n", loadedConfigPath)
				}
				fmt.Fprintln(outW)
				fmt.Fprintln(outW, "Scan Progress")
				fmt.Fprintln(outW, "─────────────")
			} else {
				fmt.Fprintf(outW, "[+] Target %d/%d: %s\n", index+1, len(targets), target)
			}
		}

		handler := createCLIEventHandler(outW, errW, *verboseFlag, rawStdoutOnly)
		report, subdomains, err := eng.ScanTarget(context.Background(), target, engineOpts, handler)
		if err != nil {
			failedTargets = append(failedTargets, models.TargetFailure{Domain: target, Error: err.Error()})
			if !rawStdoutOnly {
				fmt.Fprintf(errW, "[!] %s\n", err)
			}
			if !batchMode {
				return 1
			}
			continue
		}

		// Persist successful scan to database
		if !dbInitAttempted {
			dbInitAttempted = true
			store, dbErr = storage.NewSQLiteStorage(dbPath)
			if dbErr != nil && !rawStdoutOnly {
				fmt.Fprintf(errW, "[!] Warning: failed to initialize database: %v\n", dbErr)
			}
		}
		if store != nil {
			savedID, saveErr := store.SaveScan(context.Background(), report)
			if saveErr != nil && !rawStdoutOnly {
				fmt.Fprintf(errW, "[!] Warning: failed to persist scan history: %v\n", saveErr)
			} else if saveErr == nil {
				report.ID = savedID
			}
		}

		scanResults = append(scanResults, report)

		if !rawStdoutOnly {
			fmt.Fprintln(outW)
			fmt.Fprintln(outW, "Results")
			fmt.Fprintln(outW, "───────")
			if len(subdomains) == 0 {
				fmt.Fprintln(outW, "[+] No matching subdomains found.")
			} else {
				for _, sub := range subdomains {
					fmt.Fprintln(outW, sub)
				}
			}

			fmt.Fprintln(outW)
			fmt.Fprintln(outW, "Summary")
			fmt.Fprintln(outW, "───────")
			if report.ID != "" {
				fmt.Fprintf(outW, "Scan ID:          %s\n", report.ID)
			}
			fmt.Fprintf(outW, "Subdomains found: %d\n", len(subdomains))
			fmt.Fprintf(outW, "Sources queried:  %d\n", len(selectedSources))
			fmt.Fprintf(outW, "Duration:         %s\n", formatDuration(time.Duration(report.Metadata.DurationMS)*time.Millisecond))
			if batchMode && index < len(targets)-1 {
				fmt.Fprintln(outW)
			}
		}
	}

	batchCompletedAt := time.Now().UTC()

	// Handle stdout raw output
	if rawStdoutOnly {
		if format == "json" {
			enc := json.NewEncoder(outW)
			enc.SetIndent("", "  ")
			if batchMode {
				_ = enc.Encode(engine.BuildBatchReport(scanResults, failedTargets, *resolveFlag, batchStartedAt, batchCompletedAt))
			} else if len(scanResults) > 0 {
				_ = enc.Encode(scanResults[0])
			}
		} else if format == "txt" {
			for _, r := range scanResults {
				for _, s := range r.Subdomains {
					if batchMode {
						fmt.Fprintf(outW, "%s,%s\n", r.Domain, s.Name)
					} else {
						fmt.Fprintln(outW, s.Name)
					}
				}
			}
		}
	}

	// Handle output file writing
	if finalOutputPath != "" {
		var writeErr error
		switch format {
		case "json":
			if batchMode {
				writeErr = output.WriteJSON(finalOutputPath, engine.BuildBatchReport(scanResults, failedTargets, *resolveFlag, batchStartedAt, batchCompletedAt))
			} else if len(scanResults) > 0 {
				writeErr = output.WriteJSON(finalOutputPath, scanResults[0])
			}
		case "txt":
			if batchMode {
				writeErr = output.WriteBatchTXT(finalOutputPath, scanResults)
			} else if len(scanResults) > 0 {
				writeErr = output.WriteTXT(finalOutputPath, reportNames(scanResults[0]))
			}
		}

		if writeErr != nil {
			fmt.Fprintf(errW, "[!] Failed to write output: %v\n", writeErr)
			return 1
		}

		if !rawStdoutOnly {
			fmt.Fprintf(outW, "\n[+] Results written to %s\n", finalOutputPath)
		}
	}

	if batchMode && !rawStdoutOnly {
		fmt.Fprintf(outW, "\n[+] Batch scan complete. Successful: %d, Failed: %d\n", len(scanResults), len(failedTargets))
	}

	if len(scanResults) == 0 {
		return 1
	}

	return 0
}

func partitionArgs(args []string) ([]string, string) {
	flagArgs := make([]string, 0, len(args))
	target := ""

	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flagArgs = append(flagArgs, arg)
			if isValueFlag(arg) {
				if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					i++
					flagArgs = append(flagArgs, args[i])
				}
			}
		} else if target == "" {
			target = arg
		} else {
			flagArgs = append(flagArgs, arg)
		}
	}

	return flagArgs, target
}

func isValueFlag(flag string) bool {
	if strings.Contains(flag, "=") {
		return false
	}
	switch flag {
	case "-d", "--domain", "-i", "--input", "-o", "--output",
		"-s", "--source", "--sources",
		"--exclude-source", "--exclude-sources",
		"--threads", "--timeout", "--retries", "--config",
		"--limit", "--id", "--db", "--format":
		return true
	}
	return false
}

func createCLIEventHandler(outW io.Writer, errW io.Writer, verbose bool, quiet bool) engine.EventHandler {
	return func(ev models.Event) {
		if quiet {
			return
		}

		switch ev.Type {
		case models.EventProviderStarted:
			if verbose {
				fmt.Fprintf(outW, "[+] Querying %s...\n", ev.SourceName)
			}
		case models.EventProviderCompleted:
			if verbose {
				fmt.Fprintf(outW, "[+] %s returned %d candidate(s) in %s\n", ev.SourceName, ev.Candidates, formatDuration(ev.Duration))
			} else {
				fmt.Fprintf(outW, "[+] %s returned %d candidate(s)\n", ev.SourceName, ev.Candidates)
			}
		case models.EventProviderFailed:
			if verbose {
				fmt.Fprintf(outW, "[!] %s [%s] after %s: %s\n", ev.SourceName, ev.Health, formatDuration(ev.Duration), ev.Error)
			} else {
				fmt.Fprintf(outW, "[!] %s [%s]: %s\n", ev.SourceName, ev.Health, ev.Error)
			}
		case models.EventCandidatesFound:
			fmt.Fprintf(outW, "[+] Raw results: %d\n", ev.RawCount)
			fmt.Fprintf(outW, "[+] Unique subdomains: %d\n", ev.UniqueCount)
		case models.EventDNSStarted:
			fmt.Fprintln(outW, "[+] Resolving discovered hosts...")
		case models.EventDNSCompleted:
			if ev.WildcardCount > 0 {
				fmt.Fprintf(outW, "[+] Wildcard-filtered subdomains: %d\n", ev.WildcardCount)
			}
			fmt.Fprintf(outW, "[+] Live subdomains: %d\n", ev.LiveCount)
		}
	}
}

func reportNames(report models.Report) []string {
	names := make([]string, 0, len(report.Subdomains))
	for _, subdomain := range report.Subdomains {
		names = append(names, subdomain.Name)
	}
	return names
}

func parseTimeoutDuration(value string) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 30 * time.Second
	}

	// Try duration string like "30s", "1m"
	if d, err := time.ParseDuration(value); err == nil && d > 0 {
		return d
	}

	// Try integer seconds
	if secs, err := strconv.Atoi(value); err == nil && secs > 0 {
		return time.Duration(secs) * time.Second
	}

	return 30 * time.Second
}

func parseCSVList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	list := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))

	for _, part := range parts {
		name := strings.ToLower(strings.TrimSpace(part))
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		list = append(list, name)
	}

	return list
}

func discoverConfigPath(args []string) (string, bool, error) {
	for index := 0; index < len(args); index++ {
		argument := args[index]
		switch {
		case argument == "--config" || argument == "-config":
			if index+1 >= len(args) {
				return "", true, errors.New("--config requires a path")
			}
			return args[index+1], true, nil
		case strings.HasPrefix(argument, "--config="):
			return strings.TrimPrefix(argument, "--config="), true, nil
		case strings.HasPrefix(argument, "-config="):
			return strings.TrimPrefix(argument, "-config="), true, nil
		}
	}

	return "", false, nil
}

func pickInput(short string, long string) string {
	if strings.TrimSpace(short) != "" {
		return short
	}
	return long
}

func pickDomain(short string, long string) string {
	if strings.TrimSpace(short) != "" {
		return short
	}
	return long
}

func collectTargetInputs(domain string, inputPath string, stdinInput bool) ([]string, error) {
	if strings.TrimSpace(domain) != "" {
		return []string{domain}, nil
	}

	if strings.TrimSpace(inputPath) != "" {
		if strings.TrimSpace(inputPath) == "-" {
			return parseTargetLines(os.Stdin)
		}

		file, err := os.Open(inputPath)
		if err != nil {
			return nil, err
		}
		defer file.Close()

		return parseTargetLines(file)
	}

	if stdinInput {
		return parseTargetLines(os.Stdin)
	}

	return nil, nil
}

func parseTargetLines(reader io.Reader) ([]string, error) {
	scanner := bufio.NewScanner(reader)
	targets := make([]string, 0)
	seen := make(map[string]struct{})

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		normalized := strings.ToLower(line)
		if _, ok := seen[normalized]; ok {
			continue
		}

		seen[normalized] = struct{}{}
		targets = append(targets, line)
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return targets, nil
}

func stdinHasData() bool {
	info, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return info.Mode()&os.ModeCharDevice == 0
}

func determineOutput(jsonFlag bool, txtFlag bool, outputPath string, domain string) (string, string, error) {
	if outputPath == "" && !jsonFlag && !txtFlag {
		return "", "", nil
	}

	format := ""
	switch {
	case jsonFlag:
		format = "json"
	case txtFlag:
		format = "txt"
	default:
		switch strings.ToLower(filepath.Ext(outputPath)) {
		case ".json":
			format = "json"
		case ".txt":
			format = "txt"
		default:
			return "", "", errors.New("use --json or --txt when --output does not end in .json or .txt")
		}
	}

	if outputPath == "" {
		outputPath = fmt.Sprintf("reconlens-%s.%s", domain, format)
	}

	return format, outputPath, nil
}

func configBool(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func configInt(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func resolveAPIKey(envName string, configValue string) string {
	if envValue := strings.TrimSpace(os.Getenv(envName)); envValue != "" {
		return envValue
	}
	return strings.TrimSpace(configValue)
}

func formatDuration(duration time.Duration) string {
	if duration < time.Second {
		return duration.Round(10 * time.Millisecond).String()
	}
	return duration.Round(100 * time.Millisecond).String()
}
