package cli

import (
	"encoding/json"
	"fmt"
	"io"

	"github.com/lumiaurora/subscan/internal/buildinfo"
)

// RunVersion handles the 'version' subcommand.
func RunVersion(args []string, w io.Writer) int {
	jsonOutput := false
	for _, arg := range args {
		if arg == "--json" {
			jsonOutput = true
		}
		if arg == "--help" || arg == "-h" {
			PrintVersionHelp(w)
			return 0
		}
	}

	info := buildinfo.Current()
	if jsonOutput {
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		if err := enc.Encode(info); err != nil {
			fmt.Fprintf(w, "[!] Failed to serialize version JSON: %v\n", err)
			return 1
		}
		return 0
	}

	fmt.Fprint(w, info.Detailed())
	return 0
}
