package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/lumiaurora/subscan/internal/config"
	"github.com/lumiaurora/subscan/internal/models"
	"github.com/lumiaurora/subscan/internal/report"
	"github.com/lumiaurora/subscan/internal/storage"
)

// RunCompare executes the 'compare' subcommand with the provided arguments.
func RunCompare(args []string, outW io.Writer, errW io.Writer) int {
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

	fs := flag.NewFlagSet("compare", flag.ContinueOnError)
	fs.SetOutput(errW)
	fs.Usage = func() {
		PrintCompareHelp(errW)
	}

	var (
		jsonFlag       = fs.Bool("json", false, "output comparison in structured JSON")
		dbFlag         = fs.String("db", "", "path to SQLite database")
		configPathFlag = fs.String("config", configArg, "path to configuration file")
	)

	// Filter positional args vs flags
	var flagArgs []string
	var positionalArgs []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if strings.HasPrefix(arg, "-") {
			flagArgs = append(flagArgs, arg)
			if isValueFlag(arg) && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				flagArgs = append(flagArgs, args[i])
			}
		} else {
			positionalArgs = append(positionalArgs, arg)
		}
	}

	if err := fs.Parse(flagArgs); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 1
	}
	_ = configPathFlag

	if len(positionalArgs) < 2 {
		fmt.Fprintln(errW, "[!] Two scan IDs are required for comparison.")
		fmt.Fprintln(errW, "Usage: reconlens compare <scan-id-1> <scan-id-2> [options]")
		return 1
	}

	id1 := strings.TrimSpace(positionalArgs[0])
	id2 := strings.TrimSpace(positionalArgs[1])

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

	scan1, _, err := store.GetScan(ctx, id1)
	if err != nil {
		if errors.Is(err, storage.ErrScanNotFound) {
			fmt.Fprintf(errW, "[!] Scan not found: %s\n", id1)
		} else {
			fmt.Fprintf(errW, "[!] Failed to retrieve scan %s: %v\n", id1, err)
		}
		return 1
	}

	scan2, _, err := store.GetScan(ctx, id2)
	if err != nil {
		if errors.Is(err, storage.ErrScanNotFound) {
			fmt.Fprintf(errW, "[!] Scan not found: %s\n", id2)
		} else {
			fmt.Fprintf(errW, "[!] Failed to retrieve scan %s: %v\n", id2, err)
		}
		return 1
	}

	// Verify target match
	if !strings.EqualFold(scan1.Domain, scan2.Domain) {
		fmt.Fprintf(errW, "[!] Cannot compare scans: targets differ (%s vs %s)\n", scan1.Domain, scan2.Domain)
		return 1
	}

	// Order scans chronologically
	olderScan := scan1
	newerScan := scan2
	if scan2.Timestamp.Before(scan1.Timestamp) {
		olderScan = scan2
		newerScan = scan1
	}

	cmp := compareScans(olderScan, newerScan)

	if *jsonFlag {
		jsonBytes, err := report.RenderComparisonJSON(cmp)
		if err != nil {
			fmt.Fprintf(errW, "[!] Failed to serialize comparison JSON: %v\n", err)
			return 1
		}
		fmt.Fprintln(outW, string(jsonBytes))
		return 0
	}

	renderComparisonText(cmp, outW)
	return 0
}

func compareScans(older, newer *models.Report) models.ScanComparison {
	oldSet := make(map[string]struct{}, len(older.Subdomains))
	for _, s := range older.Subdomains {
		oldSet[strings.ToLower(strings.TrimSpace(s.Name))] = struct{}{}
	}

	newSet := make(map[string]struct{}, len(newer.Subdomains))
	for _, s := range newer.Subdomains {
		newSet[strings.ToLower(strings.TrimSpace(s.Name))] = struct{}{}
	}

	added := []string{}
	removed := []string{}
	common := []string{}

	for name := range newSet {
		if _, exists := oldSet[name]; exists {
			common = append(common, name)
		} else {
			added = append(added, name)
		}
	}

	for name := range oldSet {
		if _, exists := newSet[name]; !exists {
			removed = append(removed, name)
		}
	}

	sort.Strings(added)
	sort.Strings(removed)
	sort.Strings(common)

	return models.ScanComparison{
		Target:        older.Domain,
		OlderScanID:   older.ID,
		OlderScanDate: older.Timestamp,
		NewerScanID:   newer.ID,
		NewerScanDate: newer.Timestamp,
		Added:         added,
		Removed:       removed,
		Common:        common,
		Counts: models.ComparisonCounts{
			Added:   len(added),
			Removed: len(removed),
			Common:  len(common),
		},
	}
}

func renderComparisonText(cmp models.ScanComparison, outW io.Writer) {
	fmt.Fprintln(outW, "ReconLens Scan Comparison")
	fmt.Fprintln(outW)
	fmt.Fprintf(outW, "Target: %s\n", cmp.Target)
	fmt.Fprintln(outW)

	olderShort := cmp.OlderScanID
	if len(olderShort) > 8 {
		olderShort = olderShort[:8] + "..."
	}
	newerShort := cmp.NewerScanID
	if len(newerShort) > 8 {
		newerShort = newerShort[:8] + "..."
	}

	fmt.Fprintf(outW, "Older scan: %s\n", olderShort)
	fmt.Fprintf(outW, "Newer scan: %s\n", newerShort)
	fmt.Fprintln(outW)

	fmt.Fprintf(outW, "Added (%d)\n", cmp.Counts.Added)
	for _, sub := range cmp.Added {
		fmt.Fprintf(outW, "  %s\n", sub)
	}
	fmt.Fprintln(outW)

	fmt.Fprintf(outW, "Removed (%d)\n", cmp.Counts.Removed)
	for _, sub := range cmp.Removed {
		fmt.Fprintf(outW, "  %s\n", sub)
	}
	fmt.Fprintln(outW)

	fmt.Fprintf(outW, "Unchanged (%d)\n", cmp.Counts.Common)
	fmt.Fprintln(outW)

	fmt.Fprintln(outW, "Summary:")
	fmt.Fprintf(outW, "  Added:   %d\n", cmp.Counts.Added)
	fmt.Fprintf(outW, "  Removed: %d\n", cmp.Counts.Removed)
	fmt.Fprintf(outW, "  Common:  %d\n", cmp.Counts.Common)
}
