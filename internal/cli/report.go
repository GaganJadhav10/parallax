package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/report"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

// RunReport executes the 'report' subcommand with the provided arguments.
func RunReport(args []string, outW io.Writer, errW io.Writer) int {
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

	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	fs.SetOutput(errW)
	fs.Usage = func() {
		PrintReportHelp(errW)
	}

	var (
		formatFlag     = fs.String("format", "", "report format: 'html' or 'json'")
		outputShort    = fs.String("o", "", "output file path")
		outputLong     = fs.String("output", "", "output file path")
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
		fmt.Fprintln(errW, "[!] A scan ID is required.")
		fmt.Fprintln(errW, "Usage: parallax report <scan-id> [options]")
		return 1
	}

	outputPath := *outputShort
	if outputPath == "" {
		outputPath = *outputLong
	}

	// Determine format (default: html, or inferred from extension)
	reqFormat := strings.ToLower(strings.TrimSpace(*formatFlag))
	if reqFormat == "" {
		ext := strings.ToLower(filepath.Ext(outputPath))
		if ext == ".json" {
			reqFormat = "json"
		} else {
			reqFormat = "html"
		}
	}

	if reqFormat != "json" && reqFormat != "html" {
		fmt.Fprintf(errW, "[!] Invalid format %q. Supported formats: 'html', 'json'\n", reqFormat)
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
	scan, _, err := store.GetScan(ctx, scanID)
	if err != nil {
		if errors.Is(err, storage.ErrScanNotFound) {
			fmt.Fprintf(errW, "[!] Scan not found: %s\n", scanID)
		} else {
			fmt.Fprintf(errW, "[!] Failed to retrieve scan %s: %v\n", scanID, err)
		}
		return 1
	}

	var data []byte
	switch reqFormat {
	case "json":
		data, err = report.RenderJSON(*scan)
	case "html":
		data, err = report.RenderHTML(*scan)
	}

	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to render %s report: %v\n", reqFormat, err)
		return 1
	}

	if outputPath != "" {
		if err := os.WriteFile(outputPath, data, 0o644); err != nil {
			fmt.Fprintf(errW, "[!] Failed to write report to %s: %v\n", outputPath, err)
			return 1
		}
		fmt.Fprintf(outW, "[+] %s report saved to %s\n", strings.ToUpper(reqFormat), outputPath)
		return 0
	}

	_, _ = outW.Write(data)
	if reqFormat == "json" {
		fmt.Fprintln(outW)
	}
	return 0
}
