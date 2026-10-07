package cli

import (
	"fmt"
	"io"
)

const Banner = "ReconLens — Passive Reconnaissance & OSINT Intelligence"

// PrintRootHelp renders the main help manual for the ReconLens CLI.
func PrintRootHelp(w io.Writer) {
	fmt.Fprintln(w, Banner)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Usage:")
	fmt.Fprintln(w, "  reconlens <command> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Commands:")
	fmt.Fprintln(w, "  scan       Run passive subdomain and asset reconnaissance")
	fmt.Fprintln(w, "  serve      Start HTTP REST API and Server-Sent Events backend server")
	fmt.Fprintln(w, "  history    Inspect past reconnaissance scans and manage history")
	fmt.Fprintln(w, "  compare    Compare findings between two historical scans")
	fmt.Fprintln(w, "  report     Generate standalone JSON or offline HTML intelligence reports")
	fmt.Fprintln(w, "  sources    List supported OSINT intelligence sources and status")
	fmt.Fprintln(w, "  version    Display version, commit, and platform build details")
	fmt.Fprintln(w, "  help       Show help for reconlens or a specific command")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  reconlens scan example.com")
	fmt.Fprintln(w, "  reconlens scan example.com --resolve")
	fmt.Fprintln(w, "  reconlens scan example.com --sources crtsh,urlscan,rapiddns")
	fmt.Fprintln(w, "  reconlens serve --host 127.0.0.1 --port 8080")
	fmt.Fprintln(w, "  reconlens history")
	fmt.Fprintln(w, "  reconlens history example.com")
	fmt.Fprintln(w, "  reconlens history <scan-id>")
	fmt.Fprintln(w, "  reconlens compare <scan-id-1> <scan-id-2>")
	fmt.Fprintln(w, "  reconlens report <scan-id> --format html --output report.html")
	fmt.Fprintln(w, "  reconlens sources")
	fmt.Fprintln(w, "  reconlens version")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Use 'reconlens <command> --help' for details on a specific command.")
}

// PrintScanHelp renders the options and usage examples for the scan command.
func PrintScanHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens scan <target> [options]")
	fmt.Fprintln(w, "       reconlens scan -i <file> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Perform passive reconnaissance on a target domain without sending active probing traffic.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Target Specification:")
	fmt.Fprintln(w, "  <target>                 Target domain (e.g. example.com)")
	fmt.Fprintln(w, "  -d, --domain string      Target domain flag alternative")
	fmt.Fprintln(w, "  -i, --input string       Path to domains file (or '-' for stdin)")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Reconnaissance Options:")
	fmt.Fprintln(w, "  --resolve                Resolve discovered subdomains and verify live DNS records")
	fmt.Fprintln(w, "  --sources, --source str  Comma-separated sources to query (e.g. crtsh,urlscan)")
	fmt.Fprintln(w, "  --exclude-source str     Comma-separated sources to skip")
	fmt.Fprintln(w, "  --threads int            Maximum concurrent source requests and DNS workers (default: 20)")
	fmt.Fprintln(w, "  --timeout duration       HTTP and DNS timeout in seconds or duration string (default: 30s)")
	fmt.Fprintln(w, "  --retries int            Retry count for passive source queries (default: 2)")
	fmt.Fprintln(w, "  --verbose                Show detailed request logs and timings")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Output Options:")
	fmt.Fprintln(w, "  --json                   Export results in structured JSON")
	fmt.Fprintln(w, "  --txt                    Export results in line-delimited TXT format")
	fmt.Fprintln(w, "  -o, --output file        Write output to the specified file path")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Database & Storage:")
	fmt.Fprintln(w, "  --db path                Path to SQLite database file")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Configuration:")
	fmt.Fprintln(w, "  --config path            Path to custom JSON configuration file")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  reconlens scan example.com")
	fmt.Fprintln(w, "  reconlens scan example.com --resolve")
	fmt.Fprintln(w, "  reconlens scan example.com --sources crtsh,certspotter")
	fmt.Fprintln(w, "  reconlens scan example.com --json --output results.json")
	fmt.Fprintln(w, "  cat domains.txt | reconlens scan -i - --json")
}

// PrintHistoryHelp renders help for the history command.
func PrintHistoryHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens history [options]")
	fmt.Fprintln(w, "       reconlens history <target> [options]")
	fmt.Fprintln(w, "       reconlens history <scan-id> [options]")
	fmt.Fprintln(w, "       reconlens history delete <scan-id> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Inspect reconnaissance scan records, filter by target, or view individual scan details.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --limit int              Maximum number of historical scans to display (default: 50)")
	fmt.Fprintln(w, "  --id string              Inspect a specific scan by ID or prefix")
	fmt.Fprintln(w, "  --json                   Output records in structured JSON")
	fmt.Fprintln(w, "  --db path                Path to SQLite database file")
	fmt.Fprintln(w, "  --config path            Path to custom JSON configuration file")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  reconlens history")
	fmt.Fprintln(w, "  reconlens history --limit 20")
	fmt.Fprintln(w, "  reconlens history example.com")
	fmt.Fprintln(w, "  reconlens history a13f9104")
	fmt.Fprintln(w, "  reconlens history a13f9104 --json")
	fmt.Fprintln(w, "  reconlens history delete a13f9104")
}

// PrintCompareHelp renders help for the compare command.
func PrintCompareHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens compare <scan-id-1> <scan-id-2> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Compare findings between two historical scans of the same target domain.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --json                   Output comparison diff in structured JSON")
	fmt.Fprintln(w, "  --db path                Path to SQLite database file")
	fmt.Fprintln(w, "  --config path            Path to custom JSON configuration file")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  reconlens compare a13f9104 b82c7719")
	fmt.Fprintln(w, "  reconlens compare a13f9104 b82c7719 --json")
}

// PrintReportHelp renders help for the report command.
func PrintReportHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens report <scan-id> [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Generate a standalone JSON or offline HTML intelligence report from a stored scan.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --format string          Report format ('html' or 'json', default: html)")
	fmt.Fprintln(w, "  -o, --output file        Write report to file path (defaults to stdout)")
	fmt.Fprintln(w, "  --db path                Path to SQLite database file")
	fmt.Fprintln(w, "  --config path            Path to custom JSON configuration file")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  reconlens report a13f9104 --format json")
	fmt.Fprintln(w, "  reconlens report a13f9104 --format html --output report.html")
	fmt.Fprintln(w, "  reconlens report a13f9104 -o report.json")
}

// PrintSourcesHelp renders help for the sources command.
func PrintSourcesHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens sources [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "List all built-in passive OSINT intelligence providers and their availability.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --json                   Output source catalog in JSON format")
	fmt.Fprintln(w, "  --config path            Path to custom JSON configuration file")
}

// PrintVersionHelp renders help for the version command.
func PrintVersionHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: reconlens version [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Print version, commit, build timestamp, and compiler platform details.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --json                   Output version metadata in JSON format")
}
