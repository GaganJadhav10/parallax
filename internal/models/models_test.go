package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestReportJSONSerialization(t *testing.T) {
	report := Report{
		Domain:          "example.com",
		Timestamp:       time.Date(2026, 10, 8, 0, 0, 0, 0, time.UTC),
		TotalFound:      1,
		ResolvedEnabled: true,
		Metadata: RunMetadata{
			RawResults:       10,
			UniqueSubdomains: 5,
			FinalSubdomains:  1,
		},
		Subdomains: []Subdomain{
			{
				Name:    "api.example.com",
				Sources: []string{"crtsh", "otx"},
				IPs:     []string{"1.2.3.4"},
				CNAMEs:  []string{"cloud.example.net"},
			},
		},
	}

	data, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("failed to marshal report: %v", err)
	}

	var parsed Report
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal report: %v", err)
	}

	if parsed.Domain != "example.com" || parsed.TotalFound != 1 {
		t.Fatalf("unexpected parsed report: %+v", parsed)
	}
	if len(parsed.Subdomains) != 1 || parsed.Subdomains[0].Name != "api.example.com" {
		t.Fatalf("unexpected subdomain: %+v", parsed.Subdomains)
	}
}

func TestEventCreation(t *testing.T) {
	ev := NewEvent(EventScanStarted, "example.com")
	if ev.Type != EventScanStarted || ev.Target != "example.com" {
		t.Fatalf("unexpected event: %+v", ev)
	}
	if ev.Timestamp.IsZero() {
		t.Fatalf("expected event timestamp to be non-zero")
	}
}
