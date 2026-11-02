package cli

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/models"
	"github.com/GaganJadhav10/parallax/internal/report"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

// RunHistory executes the 'history' subcommand with the provided arguments.
func RunHistory(args []string, outW io.Writer, errW io.Writer) int {
	// Check for 'delete' subaction: parallax history delete <scan-id>
	if len(args) > 0 && args[0] == "delete" {
		return runHistoryDelete(args[1:], outW, errW)
	}

	configArg, configExplicit, err := discoverConfigPath(args)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	configFile, _, err := config.Load(configArg, configExplicit)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to load config: %v\n", err)
		return 1
	}

	flagArgs, positionalTarget := partitionArgs(args)

	fs := flag.NewFlagSet("history", flag.ContinueOnError)
	fs.SetOutput(errW)
	fs.Usage = func() {
		PrintHistoryHelp(errW)
	}

	var (
		limitFlag      = fs.Int("limit", 50, "maximum number of scans to display")
		jsonFlag       = fs.Bool("json", false, "output in structured JSON")
		idFlag         = fs.String("id", "", "inspect a specific scan by ID or prefix")
		dbFlag         = fs.String("db", "", "path to SQLite database")
		configPathFlag = fs.String("config", configArg, "path to configuration file")
	)

	if err := fs.Parse(flagArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 1
	}
	_ = configPathFlag

	dbPath, err := storage.ResolveDatabasePath(*dbFlag, configFile.DatabasePath)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to resolve database path: %v\n", err)
		return 1
	}
	store, err := storage.NewSQLiteStorage(dbPath)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to open database at %s: %v\n", dbPath, err)
		return 1
	}
	defer store.Close()

	ctx := context.Background()

	// If explicit --id flag is given, display individual scan
	targetID := strings.TrimSpace(*idFlag)
	if targetID != "" {
		return displayIndividualScan(ctx, store, targetID, *jsonFlag, outW, errW)
	}

	// If positional target is given, check whether it is a scan ID or a domain filter
	if positionalTarget != "" {
		// First check if it matches an existing scan ID or ID prefix
		sc, _, err := store.GetScan(ctx, positionalTarget)
		if err == nil {
			return renderIndividualScan(sc, *jsonFlag, outW, errW)
		}

		// Not a scan ID match; treat as target domain filter
		filter := models.ScanFilter{
			Target: positionalTarget,
			Limit:  *limitFlag,
		}
		return displayScanList(ctx, store, filter, *jsonFlag, outW, errW)
	}

	// No positional arg and no --id flag; list recent scans
	filter := models.ScanFilter{
		Limit: *limitFlag,
	}
	return displayScanList(ctx, store, filter, *jsonFlag, outW, errW)
}

func runHistoryDelete(args []string, outW io.Writer, errW io.Writer) int {
	configArg, configExplicit, err := discoverConfigPath(args)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	configFile, _, err := config.Load(configArg, configExplicit)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to load config: %v\n", err)
		return 1
	}

	flagArgs, scanID := partitionArgs(args)

	fs := flag.NewFlagSet("history delete", flag.ContinueOnError)
	fs.SetOutput(errW)

	var (
		dbFlag         = fs.String("db", "", "path to SQLite database")
		configPathFlag = fs.String("config", configArg, "path to configuration file")
	)

	if err := fs.Parse(flagArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 1
	}
	_ = configPathFlag

	if scanID == "" && fs.NArg() > 0 {
		scanID = fs.Arg(0)
	}
	scanID = strings.TrimSpace(scanID)
	if scanID == "" {
		fmt.Fprintln(errW, "[!] A scan ID is required for deletion.")
		fmt.Fprintln(errW, "Usage: parallax history delete <scan-id>")
		return 1
	}

	dbPath, err := storage.ResolveDatabasePath(*dbFlag, configFile.DatabasePath)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to resolve database path: %v\n", err)
		return 1
	}
	store, err := storage.NewSQLiteStorage(dbPath)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to open database at %s: %v\n", dbPath, err)
		return 1
	}
	defer store.Close()

	ctx := context.Background()
	if err := store.DeleteScan(ctx, scanID); err != nil {
		if errors.Is(err, storage.ErrScanNotFound) {
			fmt.Fprintf(errW, "[!] Scan not found: %s\n", scanID)
		} else {
			fmt.Fprintf(errW, "[!] Failed to delete scan %s: %v\n", scanID, err)
		}
		return 1
	}

	fmt.Fprintf(outW, "[+] Scan %s successfully deleted.\n", scanID)
	return 0
}

func displayIndividualScan(ctx context.Context, store *storage.SQLiteStorage, id string, asJSON bool, outW io.Writer, errW io.Writer) int {
	sc, _, err := store.GetScan(ctx, id)
	if err != nil {
		if errors.Is(err, storage.ErrScanNotFound) {
			fmt.Fprintf(errW, "[!] Scan not found: %s\n", id)
		} else {
			fmt.Fprintf(errW, "[!] Failed to retrieve scan %s: %v\n", id, err)
		}
		return 1
	}

	return renderIndividualScan(sc, asJSON, outW, errW)
}

func renderIndividualScan(sc *models.Report, asJSON bool, outW io.Writer, errW io.Writer) int {
	if asJSON {
		jsonBytes, err := report.RenderJSON(*sc)
		if err != nil {
			fmt.Fprintf(errW, "[!] Failed to render JSON: %v\n", err)
			return 1
		}
		fmt.Fprintln(outW, string(jsonBytes))
		return 0
	}

	fmt.Fprintln(outW, "Parallax Scan Details")
	fmt.Fprintln(outW, "──────────────────────")
	fmt.Fprintf(outW, "Scan ID:         %s\n", sc.ID)
	fmt.Fprintf(outW, "Target:          %s\n", sc.Domain)
	fmt.Fprintf(outW, "Date:            %s\n", sc.Timestamp.Format("2006-01-02 15:04:05 UTC"))
	fmt.Fprintf(outW, "Duration:        %s\n", formatDuration(time.Duration(sc.Metadata.DurationMS)*time.Millisecond))

	status := "completed"
	if sc.TotalFound == 0 && len(sc.Metadata.FailedSources) > 0 && len(sc.Metadata.EnabledSources) == len(sc.Metadata.FailedSources) {
		status = "failed"
	}
	fmt.Fprintf(outW, "Status:          %s\n", status)

	resMode := "Passive"
	if sc.ResolvedEnabled {
		resMode = "Passive + DNS Resolved"
	}
	fmt.Fprintf(outW, "Resolution:      %s\n", resMode)

	if len(sc.Metadata.SourceTimings) > 0 {
		sourcesList := make([]string, 0, len(sc.Metadata.SourceTimings))
		for _, st := range sc.Metadata.SourceTimings {
			sourcesList = append(sourcesList, fmt.Sprintf("%s (%d)", st.Name, st.Candidates))
		}
		fmt.Fprintf(outW, "Sources:         %s\n", strings.Join(sourcesList, ", "))
	}

	fmt.Fprintln(outW)
	fmt.Fprintf(outW, "Discovered Subdomains (%d):\n", len(sc.Subdomains))
	if len(sc.Subdomains) == 0 {
		fmt.Fprintln(outW, "  No subdomains recorded.")
	} else {
		for _, sub := range sc.Subdomains {
			var details []string
			if len(sub.Sources) > 0 {
				details = append(details, strings.Join(sub.Sources, ","))
			}
			if len(sub.IPs) > 0 {
				details = append(details, strings.Join(sub.IPs, ","))
			}
			if len(sub.CNAMEs) > 0 {
				details = append(details, "CNAME: "+strings.Join(sub.CNAMEs, ","))
			}

			if len(details) > 0 {
				fmt.Fprintf(outW, "  %-30s [%s]\n", sub.Name, strings.Join(details, " | "))
			} else {
				fmt.Fprintf(outW, "  %s\n", sub.Name)
			}
		}
	}

	return 0
}

func displayScanList(ctx context.Context, store *storage.SQLiteStorage, filter models.ScanFilter, asJSON bool, outW io.Writer, errW io.Writer) int {
	records, err := store.ListScans(ctx, filter)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to list scans: %v\n", err)
		return 1
	}

	if asJSON {
		if records == nil {
			records = []models.ScanRecord{}
		}
		enc := json.NewEncoder(outW)
		enc.SetIndent("", "  ")
		if err := enc.Encode(records); err != nil {
			fmt.Fprintf(errW, "[!] Failed to serialize JSON: %v\n", err)
			return 1
		}
		return 0
	}

	fmt.Fprintln(outW, "Parallax Scan History")
	fmt.Fprintln(outW)
	if len(records) == 0 {
		fmt.Fprintln(outW, "No historical scans found.")
		return 0
	}

	fmt.Fprintf(outW, "%-12s %-22s %-9s %-11s %s\n", "ID", "TARGET", "RESULTS", "STATUS", "DATE")
	for _, rec := range records {
		shortID := rec.ID
		if len(shortID) > 8 {
			shortID = shortID[:8] + "..."
		}
		dateStr := rec.StartedAt.Format("2006-01-02 15:04")
		fmt.Fprintf(outW, "%-12s %-22s %-9d %-11s %s\n",
			shortID,
			rec.Target,
			rec.FinalSubdomains,
			rec.Status,
			dateStr,
		)
	}

	return 0
}
