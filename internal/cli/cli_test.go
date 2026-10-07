package cli

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/lumiaurora/subscan/internal/buildinfo"
)

func TestExecuteRootHelp(t *testing.T) {
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{}, &out, &err)
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out.String(), Banner) {
		t.Errorf("expected banner in help output, got: %s", out.String())
	}
	if !strings.Contains(out.String(), "reconlens <command>") {
		t.Errorf("expected usage in help output")
	}
}

func TestExecuteCommandHelp(t *testing.T) {
	commands := []string{"scan", "serve", "history", "compare", "report", "sources", "version"}
	for _, cmd := range commands {
		var out, err bytes.Buffer
		code := ExecuteWithWriters([]string{"help", cmd}, &out, &err)
		if code != 0 {
			t.Fatalf("command %s help failed with code %d", cmd, code)
		}
		if out.Len() == 0 {
			t.Fatalf("expected output for help %s", cmd)
		}
	}
}

func TestExecuteVersion(t *testing.T) {
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"version"}, &out, &err)
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out.String(), "ReconLens") {
		t.Errorf("expected ReconLens in version output, got: %s", out.String())
	}

	// Test --json flag on version
	out.Reset()
	code = ExecuteWithWriters([]string{"version", "--json"}, &out, &err)
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	var info buildinfo.Info
	if err := json.Unmarshal(out.Bytes(), &info); err != nil {
		t.Fatalf("expected valid JSON for version, got error: %v", err)
	}
}

func TestExecuteSources(t *testing.T) {
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"sources"}, &out, &err)
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	if !strings.Contains(out.String(), "PASSIVE SOURCES") {
		t.Errorf("expected PASSIVE SOURCES header, got: %s", out.String())
	}
	if !strings.Contains(out.String(), "crtsh") {
		t.Errorf("expected crtsh in sources catalog")
	}

	// Test --json flag on sources
	out.Reset()
	code = ExecuteWithWriters([]string{"sources", "--json"}, &out, &err)
	if code != 0 {
		t.Fatalf("expected code 0, got %d", code)
	}
	var items []SourceCatalogItem
	if err := json.Unmarshal(out.Bytes(), &items); err != nil {
		t.Fatalf("expected valid JSON for sources, got: %v", err)
	}
	if len(items) != 10 {
		t.Fatalf("expected 10 sources, got %d", len(items))
	}
}

func TestExecuteScanValidation(t *testing.T) {
	var out, err bytes.Buffer

	// No domain supplied
	code := ExecuteWithWriters([]string{"scan"}, &out, &err)
	if code != 1 {
		t.Fatalf("expected exit code 1 for missing domain, got %d", code)
	}
	if !strings.Contains(err.String(), "A target domain is required") {
		t.Errorf("expected target required message, got: %s", err.String())
	}

	// Invalid domain
	err.Reset()
	code = ExecuteWithWriters([]string{"scan", "invalid..domain"}, &out, &err)
	if code != 1 {
		t.Fatalf("expected exit code 1 for invalid domain, got %d", code)
	}
	if !strings.Contains(err.String(), "Invalid target domain") {
		t.Errorf("expected invalid target message, got: %s", err.String())
	}
}

func TestExecuteUnknownCommand(t *testing.T) {
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"boguscommand"}, &out, &err)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(err.String(), "Unknown command") {
		t.Errorf("expected unknown command message, got: %s", err.String())
	}
}

func TestParseTimeoutDuration(t *testing.T) {
	tests := []struct {
		input string
		want  time.Duration
	}{
		{"10s", 10 * time.Second},
		{"1m", 1 * time.Minute},
		{"45", 45 * time.Second},
		{"", 30 * time.Second},
		{"invalid", 30 * time.Second},
	}

	for _, tt := range tests {
		got := parseTimeoutDuration(tt.input)
		if got != tt.want {
			t.Errorf("parseTimeoutDuration(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}
