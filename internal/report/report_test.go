package report

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/lumiaurora/subscan/internal/models"
)

func sampleReport() models.Report {
	return models.Report{
		ID:              "test-scan-12345678",
		Domain:          "example.com",
		Timestamp:       time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC),
		TotalFound:      2,
		ResolvedEnabled: true,
		Metadata: models.RunMetadata{
			StartedAt:        time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC),
			CompletedAt:      time.Date(2026, 10, 8, 12, 0, 2, 500, time.UTC),
			DurationMS:       2500,
			RawResults:       3,
			UniqueSubdomains: 2,
			FinalSubdomains:  2,
			SourceTimings: []models.SourceTiming{
				{
					ID:         "crtsh",
					Name:       "crt.sh",
					Status:     "success",
					Candidates: 2,
					DurationMS: 1200,
				},
			},
		},
		Subdomains: []models.Subdomain{
			{
				Name:    "api.example.com",
				Sources: []string{"crt.sh"},
				IPs:     []string{"93.184.216.34"},
				CNAMEs:  []string{"lb.example.com"},
			},
			{
				Name:    "dev.example.com",
				Sources: []string{"crt.sh"},
				IPs:     []string{"93.184.216.35"},
			},
		},
	}
}

func TestRenderJSON(t *testing.T) {
	r := sampleReport()
	out, err := RenderJSON(r)
	if err != nil {
		t.Fatalf("unexpected error rendering JSON: %v", err)
	}

	var parsed models.Report
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("failed to unmarshal JSON output: %v", err)
	}

	if parsed.Domain != "example.com" {
		t.Errorf("expected domain example.com, got %s", parsed.Domain)
	}
	if parsed.ID != "test-scan-12345678" {
		t.Errorf("expected ID test-scan-12345678, got %s", parsed.ID)
	}
	if len(parsed.Subdomains) != 2 {
		t.Errorf("expected 2 subdomains, got %d", len(parsed.Subdomains))
	}
}

func TestRenderComparisonJSON(t *testing.T) {
	cmp := models.ScanComparison{
		Target:        "example.com",
		OlderScanID:   "scan-old",
		OlderScanDate: time.Date(2026, 10, 7, 0, 0, 0, 0, time.UTC),
		NewerScanID:   "scan-new",
		NewerScanDate: time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC),
		Added:         []string{"dev.example.com"},
		Removed:       []string{"old.example.com"},
		Common:        []string{"api.example.com"},
		Counts: models.ComparisonCounts{
			Added:   1,
			Removed: 1,
			Common:  1,
		},
	}

	out, err := RenderComparisonJSON(cmp)
	if err != nil {
		t.Fatalf("unexpected error rendering comparison JSON: %v", err)
	}

	var parsed models.ScanComparison
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatalf("failed to unmarshal JSON output: %v", err)
	}

	if parsed.Counts.Added != 1 || parsed.Counts.Removed != 1 || parsed.Counts.Common != 1 {
		t.Errorf("unexpected counts: %+v", parsed.Counts)
	}
}

func TestRenderHTML(t *testing.T) {
	r := sampleReport()
	out, err := RenderHTML(r)
	if err != nil {
		t.Fatalf("unexpected error rendering HTML: %v", err)
	}

	htmlStr := string(out)
	if !strings.Contains(htmlStr, "<!DOCTYPE html>") {
		t.Error("expected doctype html in output")
	}
	if !strings.Contains(htmlStr, "example.com") {
		t.Error("expected target domain in output")
	}
	if !strings.Contains(htmlStr, "api.example.com") {
		t.Error("expected subdomain api.example.com in output")
	}
	if !strings.Contains(htmlStr, "93.184.216.34") {
		t.Error("expected IP address in output")
	}
	if !strings.Contains(htmlStr, "crt.sh") {
		t.Error("expected source crt.sh in output")
	}
	if !strings.Contains(htmlStr, "Mikael Nurminen") {
		t.Error("expected upstream attribution in output")
	}
}

func TestRenderHTMLEscaping(t *testing.T) {
	r := sampleReport()
	r.Domain = "<script>alert('xss-target')</script>"
	r.Subdomains = []models.Subdomain{
		{
			Name:    "<img src=x onerror=alert(1)>",
			Sources: []string{"<b>bold</b>"},
		},
	}

	out, err := RenderHTML(r)
	if err != nil {
		t.Fatalf("unexpected error rendering HTML: %v", err)
	}

	htmlStr := string(out)
	if strings.Contains(htmlStr, "<script>alert('xss-target')</script>") {
		t.Errorf("detected unescaped script tag in HTML output!")
	}
	if strings.Contains(htmlStr, "<img src=x onerror=alert(1)>") {
		t.Errorf("detected unescaped img tag in HTML output!")
	}
	if !strings.Contains(htmlStr, "&lt;script&gt;") {
		t.Errorf("expected escaped script tag &lt;script&gt; in HTML output")
	}
}
