package cli

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/GaganJadhav10/parallax/internal/engine"
)

// Execute runs the Parallax CLI using standard OS streams.
func Execute(args []string) int {
	return ExecuteWithWriters(args, os.Stdout, os.Stderr)
}

// ExecuteWithWriters runs the Parallax CLI with customizable output and error writers.
func ExecuteWithWriters(args []string, outW io.Writer, errW io.Writer) int {
	if len(args) == 0 {
		PrintRootHelp(outW)
		return 0
	}

	firstArg := args[0]

	// Handle global flags
	if firstArg == "--version" || firstArg == "-version" {
		return RunVersion(args[1:], outW)
	}

	if firstArg == "--help" || firstArg == "-help" || firstArg == "-h" {
		PrintRootHelp(outW)
		return 0
	}

	// Dispatch commands
	switch firstArg {
	case "scan":
		return RunScan(args[1:], outW, errW)

	case "history":
		return RunHistory(args[1:], outW, errW)

	case "compare":
		return RunCompare(args[1:], outW, errW)

	case "report":
		return RunReport(args[1:], outW, errW)

	case "serve":
		return RunServe(args[1:], outW, errW)

	case "sources":
		return RunSources(args[1:], outW, errW)

	case "version":
		return RunVersion(args[1:], outW)

	case "help":
		if len(args) > 1 {
			switch args[1] {
			case "scan":
				PrintScanHelp(outW)
			case "serve":
				PrintServeHelp(outW)
			case "history":
				PrintHistoryHelp(outW)
			case "compare":
				PrintCompareHelp(outW)
			case "report":
				PrintReportHelp(outW)
			case "sources":
				PrintSourcesHelp(outW)
			case "version":
				PrintVersionHelp(outW)
			default:
				PrintRootHelp(outW)
			}
			return 0
		}
		PrintRootHelp(outW)
		return 0

	default:
		// Smart fallback: if first argument is a flag (e.g. -d, --domain, -i) or resembles a target domain,
		// route directly to the scan command for maximum user ergonomics.
		if strings.HasPrefix(firstArg, "-") || strings.Contains(firstArg, ".") {
			return RunScan(args, outW, errW)
		}

		fmt.Fprintf(errW, "[!] Unknown command: %q\n", firstArg)
		fmt.Fprintln(errW, "Run 'parallax --help' for usage.")
		return 1
	}
}

// ParseCSVList splits and normalizes comma-separated input lists.
func ParseCSVList(value string) []string {
	return parseCSVList(value)
}

// ParseTargetLines parses target domains from a reader, skipping comments and blanks.
func ParseTargetLines(reader io.Reader) ([]string, error) {
	return parseTargetLines(reader)
}

// QuerySourcesLegacy provides compatibility for test fixtures calling querySources.
func QuerySourcesLegacy(domain string, sourceList []engine.SourceDefinition, threads int, verbose bool) ([]engine.SourceResult, bool) {
	eng := engine.NewEngineWithRegistry(sourceList)
	handler := createCLIEventHandler(os.Stdout, os.Stderr, verbose, false)
	return eng.QuerySources(context.Background(), domain, sourceList, threads, handler)
}
