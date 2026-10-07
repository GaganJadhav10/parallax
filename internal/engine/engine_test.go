package engine

import (
	"context"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/lumiaurora/subscan/internal/models"
)

func TestEngineSourceSelection(t *testing.T) {
	customRegistry := []SourceDefinition{
		{ID: "src1", Name: "Source 1", Aliases: []string{"src1", "source1"}},
		{ID: "src2", Name: "Source 2", Aliases: []string{"src2"}},
		{ID: "src3", Name: "Source 3", Aliases: []string{"src3"}, Enabled: func() bool { return false }, EnableHint: "needs api key"},
	}

	eng := NewEngineWithRegistry(customRegistry)

	// All enabled sources when no filter
	selected, err := eng.SelectSources(nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(selected) != 2 {
		t.Fatalf("expected 2 enabled sources, got %d", len(selected))
	}

	// Include and exclude filters
	selected, err = eng.SelectSources([]string{"source1", "src2"}, []string{"src2"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(selected) != 1 || selected[0].ID != "src1" {
		t.Fatalf("expected only src1, got %v", selected)
	}

	// Including a disabled source should fail
	_, err = eng.SelectSources([]string{"src3"}, nil)
	if err == nil {
		t.Fatalf("expected error selecting disabled source")
	}

	// Unknown source should fail
	_, err = eng.SelectSources([]string{"nonexistent"}, nil)
	if err == nil {
		t.Fatalf("expected error selecting nonexistent source")
	}
}

func TestEngineScanTargetWithEvents(t *testing.T) {
	customRegistry := []SourceDefinition{
		{
			ID:      "mock1",
			Name:    "Mock Source 1",
			Aliases: []string{"mock1"},
			Fetch: func(domain string) ([]string, error) {
				return []string{"api." + domain, "dev." + domain}, nil
			},
		},
		{
			ID:      "mock2",
			Name:    "Mock Source 2",
			Aliases: []string{"mock2"},
			Fetch: func(domain string) ([]string, error) {
				return []string{"dev." + domain, "mail." + domain}, nil
			},
		},
	}

	eng := NewEngineWithRegistry(customRegistry)

	var eventsMu sync.Mutex
	receivedEvents := make([]models.Event, 0)
	handler := func(ev models.Event) {
		eventsMu.Lock()
		defer eventsMu.Unlock()
		receivedEvents = append(receivedEvents, ev)
	}

	opts := ScanOptions{
		Resolve: false,
		Threads: 2,
	}

	report, subdomains, err := eng.ScanTarget(context.Background(), "example.com", opts, handler)
	if err != nil {
		t.Fatalf("ScanTarget returned unexpected error: %v", err)
	}

	if report.Domain != "example.com" {
		t.Fatalf("expected domain example.com, got %s", report.Domain)
	}

	wantSubdomains := []string{"api.example.com", "dev.example.com", "mail.example.com"}
	if !slices.Equal(subdomains, wantSubdomains) {
		t.Fatalf("expected subdomains %v, got %v", wantSubdomains, subdomains)
	}

	if report.TotalFound != 3 {
		t.Fatalf("expected TotalFound 3, got %d", report.TotalFound)
	}

	// Verify events were emitted
	eventsMu.Lock()
	defer eventsMu.Unlock()
	eventTypes := make(map[models.EventType]int)
	for _, ev := range receivedEvents {
		eventTypes[ev.Type]++
	}

	if eventTypes[models.EventScanStarted] != 1 {
		t.Errorf("expected 1 EventScanStarted, got %d", eventTypes[models.EventScanStarted])
	}
	if eventTypes[models.EventProviderStarted] != 2 {
		t.Errorf("expected 2 EventProviderStarted, got %d", eventTypes[models.EventProviderStarted])
	}
	if eventTypes[models.EventProviderCompleted] != 2 {
		t.Errorf("expected 2 EventProviderCompleted, got %d", eventTypes[models.EventProviderCompleted])
	}
	if eventTypes[models.EventCandidatesFound] != 1 {
		t.Errorf("expected 1 EventCandidatesFound, got %d", eventTypes[models.EventCandidatesFound])
	}
	if eventTypes[models.EventScanCompleted] != 1 {
		t.Errorf("expected 1 EventScanCompleted, got %d", eventTypes[models.EventScanCompleted])
	}
}

func TestEngineInvalidTargetDomain(t *testing.T) {
	eng := NewEngine()
	_, _, err := eng.ScanTarget(context.Background(), "invalid..domain", ScanOptions{}, nil)
	if err == nil {
		t.Fatalf("expected error for invalid domain")
	}
}

func TestPrepareTargets(t *testing.T) {
	inputs := []string{"Example.com", "bad domain", "example.com", "*.api.example.com"}
	valid, invalid := PrepareTargets(inputs)

	wantValid := []string{"example.com", "api.example.com"}
	if !slices.Equal(valid, wantValid) {
		t.Fatalf("unexpected valid targets: got %v, want %v", valid, wantValid)
	}

	if len(invalid) != 1 || invalid[0].Domain != "bad domain" {
		t.Fatalf("unexpected invalid targets: %v", invalid)
	}
}

func TestBuildBatchReport(t *testing.T) {
	startedAt := time.Unix(100, 0).UTC()
	completedAt := startedAt.Add(2 * time.Second)
	report := BuildBatchReport(
		[]models.Report{{Domain: "example.com"}},
		[]models.TargetFailure{{Domain: "bad", Error: "invalid domain"}},
		true,
		startedAt,
		completedAt,
	)

	if report.TotalTargets != 2 {
		t.Fatalf("expected total targets 2, got %d", report.TotalTargets)
	}

	if report.Metadata.SuccessfulTargets != 1 || report.Metadata.FailedTargets != 1 {
		t.Fatalf("unexpected batch metadata: %+v", report.Metadata)
	}

	if !report.ResolvedEnabled {
		t.Fatalf("expected resolved flag to be true")
	}
}
