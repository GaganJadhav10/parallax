package buildinfo

import (
	"fmt"
	"runtime"
	"strings"
)

var (
	version = "0.2.0-dev"
	commit  = "none"
	date    = "unknown"
	builtBy = "local"
)

type Info struct {
	Version  string `json:"version"`
	Commit   string `json:"commit"`
	Date     string `json:"date"`
	BuiltBy  string `json:"built_by"`
	Go       string `json:"go_version"`
	Platform string `json:"platform"`
}

func Current() Info {
	return Info{
		Version:  version,
		Commit:   commit,
		Date:     date,
		BuiltBy:  builtBy,
		Go:       runtime.Version(),
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
	}
}

func (info Info) String() string {
	parts := []string{
		fmt.Sprintf("Parallax v%s", info.Version),
		fmt.Sprintf("commit=%s", info.Commit),
		fmt.Sprintf("built=%s", info.Date),
		fmt.Sprintf("builder=%s", info.BuiltBy),
		fmt.Sprintf("go=%s", info.Go),
		fmt.Sprintf("platform=%s", info.Platform),
	}

	return strings.Join(parts, " ")
}

func (info Info) Detailed() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Parallax v%s\n", info.Version))
	sb.WriteString("Open-Source Signals Intelligence for External Attack Surfaces\n")
	sb.WriteString("Based on subscan by Mikael Nurminen (MIT License)\n\n")
	sb.WriteString(fmt.Sprintf("  Version:  v%s\n", info.Version))
	sb.WriteString(fmt.Sprintf("  Commit:   %s\n", info.Commit))
	sb.WriteString(fmt.Sprintf("  Built:    %s\n", info.Date))
	sb.WriteString(fmt.Sprintf("  Go:       %s\n", info.Go))
	sb.WriteString(fmt.Sprintf("  Platform: %s\n", info.Platform))
	return sb.String()
}
