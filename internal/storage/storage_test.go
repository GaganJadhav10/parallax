package storage

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/GaganJadhav10/parallax/internal/models"
)

func sampleTestReport(domain string) models.Report {
	now := time.Now().UTC().Truncate(time.Second)
	return models.Report{
		Domain:          domain,
		Timestamp:       now,
		TotalFound:      2,
		ResolvedEnabled: true,
		Metadata: models.RunMetadata{
			StartedAt:        now.Add(-2 * time.Second),
			CompletedAt:      now,
			DurationMS:       2000,
			RawResults:       10,
			UniqueSubdomains: 3,
			FinalSubdomains:  2,
			WildcardFiltered: 1,
			EnabledSources: []models.SourceReference{
				{ID: "crtsh", Name: "crt.sh"},
				{ID: "certspotter", Name: "Cert Spotter"},
			},
			FailedSources: []models.FailedSource{
				{ID: "otx", Name: "AlienVault OTX", Health: "rate-limited", Error: "rate limit exceeded", DurationMS: 500},
			},
			SourceTimings: []models.SourceTiming{
				{ID: "crtsh", Name: "crt.sh", Status: "success", Candidates: 5, DurationMS: 600},
				{ID: "certspotter", Name: "Cert Spotter", Status: "success", Candidates: 5, DurationMS: 700},
				{ID: "otx", Name: "AlienVault OTX", Status: "rate-limited", Candidates: 0, DurationMS: 500},
			},
		},
		Subdomains: []models.Subdomain{
			{
				Name:    "api." + domain,
				Sources: []string{"Cert Spotter", "crt.sh"},
				IPs:     []string{"1.2.3.4", "1.2.3.5"},
				CNAMEs:  []string{"cloud." + domain},
			},
			{
				Name:    "mail." + domain,
				Sources: []string{"crt.sh"},
				IPs:     []string{"5.6.7.8"},
			},
		},
	}
}

func TestStorageLifecycle(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "parallax_test.db")

	store, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}
	defer store.Close()

	// 1. Save scan
	report := sampleTestReport("example.com")
	scanID, err := store.SaveScan(ctx, report)
	if err != nil {
		t.Fatalf("failed to save scan: %v", err)
	}
	if scanID == "" {
		t.Fatalf("expected non-empty scan ID")
	}

	// 2. Retrieve scan by exact ID
	retrieved, record, err := store.GetScan(ctx, scanID)
	if err != nil {
		t.Fatalf("failed to get scan: %v", err)
	}
	if retrieved.Domain != "example.com" || retrieved.TotalFound != 2 {
		t.Fatalf("unexpected retrieved report: %+v", retrieved)
	}
	if record.ID != scanID || record.Target != "example.com" {
		t.Fatalf("unexpected retrieved scan record: %+v", record)
	}
	if len(retrieved.Subdomains) != 2 {
		t.Fatalf("expected 2 subdomains, got %d", len(retrieved.Subdomains))
	}

	// Verify DNS and attribution details
	var apiSub *models.Subdomain
	for i := range retrieved.Subdomains {
		if retrieved.Subdomains[i].Name == "api.example.com" {
			apiSub = &retrieved.Subdomains[i]
		}
	}
	if apiSub == nil {
		t.Fatalf("api.example.com not found in retrieved subdomains")
	}
	if len(apiSub.Sources) != 2 || len(apiSub.IPs) != 2 || len(apiSub.CNAMEs) != 1 {
		t.Fatalf("unexpected details for api.example.com: %+v", apiSub)
	}

	// 3. Retrieve scan by prefix
	prefix := scanID[:8]
	byPrefix, _, err := store.GetScan(ctx, prefix)
	if err != nil {
		t.Fatalf("failed to retrieve scan by prefix: %v", err)
	}
	if byPrefix.ID != scanID {
		t.Fatalf("expected prefix to match full ID %s, got %s", scanID, byPrefix.ID)
	}

	// 4. Save second scan for different domain
	report2 := sampleTestReport("example.org")
	scanID2, err := store.SaveScan(ctx, report2)
	if err != nil {
		t.Fatalf("failed to save second scan: %v", err)
	}

	// 5. List scans
	allScans, err := store.ListScans(ctx, models.ScanFilter{})
	if err != nil {
		t.Fatalf("failed to list scans: %v", err)
	}
	if len(allScans) != 2 {
		t.Fatalf("expected 2 scans in history, got %d", len(allScans))
	}

	// Filter by target
	filtered, err := store.ListScans(ctx, models.ScanFilter{Target: "example.org"})
	if err != nil {
		t.Fatalf("failed to list filtered scans: %v", err)
	}
	if len(filtered) != 1 || filtered[0].ID != scanID2 {
		t.Fatalf("unexpected filtered scans: %+v", filtered)
	}

	// 6. Delete scan & verify cascade
	if err := store.DeleteScan(ctx, scanID); err != nil {
		t.Fatalf("failed to delete scan: %v", err)
	}

	// Should be not found now
	_, _, err = store.GetScan(ctx, scanID)
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got: %v", err)
	}

	// Remaining scans should be 1
	remaining, err := store.ListScans(ctx, models.ScanFilter{})
	if err != nil {
		t.Fatalf("failed to list remaining scans: %v", err)
	}
	if len(remaining) != 1 || remaining[0].ID != scanID2 {
		t.Fatalf("unexpected remaining scans: %+v", remaining)
	}
}

func TestStoragePersistenceReopen(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "parallax_persist.db")

	store1, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open database: %v", err)
	}

	report := sampleTestReport("persist.example")
	scanID, err := store1.SaveScan(ctx, report)
	if err != nil {
		t.Fatalf("failed to save scan: %v", err)
	}
	store1.Close()

	// Reopen database from same file
	store2, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to reopen database: %v", err)
	}
	defer store2.Close()

	retrieved, _, err := store2.GetScan(ctx, scanID)
	if err != nil {
		t.Fatalf("failed to get scan after reopen: %v", err)
	}
	if retrieved.Domain != "persist.example" {
		t.Fatalf("expected persist.example, got: %s", retrieved.Domain)
	}
}

func TestResolveDatabasePath(t *testing.T) {
	// 1. Explicit CLI path overrides everything
	p, err := ResolveDatabasePath("custom/test.db", "config/test.db")
	if err != nil || p != filepath.Clean("custom/test.db") {
		t.Fatalf("unexpected path: %s", p)
	}

	// 2. Config path when CLI is empty
	p, err = ResolveDatabasePath("", "config/test.db")
	if err != nil || p != filepath.Clean("config/test.db") {
		t.Fatalf("unexpected path: %s", p)
	}

	// 3. Fallback default. A machine that still has a pre-rename database keeps
	// using it, so the legacy filenames are valid answers here too.
	p, err = ResolveDatabasePath("", "")
	if err != nil || !slices.Contains([]string{"parallax.db", "reconlens.db", "subscan.db"}, filepath.Base(p)) {
		t.Fatalf("unexpected default path: %s", p)
	}
}
