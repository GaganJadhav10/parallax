package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GaganJadhav10/parallax/internal/models"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

func createTestDBWithScans(t *testing.T) (string, string, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test_phase3.db")
	store, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer store.Close()

	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)

	// Scan 1 (older scan for example.com)
	rep1 := models.Report{
		Domain:          "example.com",
		Timestamp:       now.Add(-10 * time.Minute),
		TotalFound:      2,
		ResolvedEnabled: true,
		Metadata: models.RunMetadata{
			StartedAt:        now.Add(-10 * time.Minute),
			CompletedAt:      now.Add(-10*time.Minute + 2*time.Second),
			DurationMS:       2000,
			RawResults:       3,
			UniqueSubdomains: 2,
			FinalSubdomains:  2,
			SourceTimings: []models.SourceTiming{
				{ID: "crtsh", Name: "crt.sh", Status: "success", Candidates: 2, DurationMS: 1500},
			},
		},
		Subdomains: []models.Subdomain{
			{Name: "api.example.com", Sources: []string{"crt.sh"}, IPs: []string{"93.184.216.34"}},
			{Name: "old.example.com", Sources: []string{"crt.sh"}},
		},
	}
	id1, err := store.SaveScan(ctx, rep1)
	if err != nil {
		t.Fatalf("failed to save scan 1: %v", err)
	}

	// Scan 2 (newer scan for example.com)
	rep2 := models.Report{
		Domain:          "example.com",
		Timestamp:       now,
		TotalFound:      3,
		ResolvedEnabled: true,
		Metadata: models.RunMetadata{
			StartedAt:        now,
			CompletedAt:      now.Add(3 * time.Second),
			DurationMS:       3000,
			RawResults:       5,
			UniqueSubdomains: 3,
			FinalSubdomains:  3,
			SourceTimings: []models.SourceTiming{
				{ID: "crtsh", Name: "crt.sh", Status: "success", Candidates: 3, DurationMS: 2000},
			},
		},
		Subdomains: []models.Subdomain{
			{Name: "api.example.com", Sources: []string{"crt.sh"}, IPs: []string{"93.184.216.34"}},
			{Name: "dev.example.com", Sources: []string{"crt.sh"}, IPs: []string{"93.184.216.35"}},
			{Name: "staging.example.com", Sources: []string{"crt.sh"}, CNAMEs: []string{"lb.example.com"}},
		},
	}
	id2, err := store.SaveScan(ctx, rep2)
	if err != nil {
		t.Fatalf("failed to save scan 2: %v", err)
	}

	// Scan 3 (scan for other domain)
	rep3 := models.Report{
		Domain:          "otherdomain.org",
		Timestamp:       now.Add(-5 * time.Minute),
		TotalFound:      1,
		ResolvedEnabled: false,
		Metadata: models.RunMetadata{
			StartedAt:        now.Add(-5 * time.Minute),
			CompletedAt:      now.Add(-5*time.Minute + 1*time.Second),
			DurationMS:       1000,
			RawResults:       1,
			UniqueSubdomains: 1,
			FinalSubdomains:  1,
		},
		Subdomains: []models.Subdomain{
			{Name: "mail.otherdomain.org", Sources: []string{"crt.sh"}},
		},
	}
	_, err = store.SaveScan(ctx, rep3)
	if err != nil {
		t.Fatalf("failed to save scan 3: %v", err)
	}

	return dbPath, id1, id2
}

func TestCLIHistoryList(t *testing.T) {
	dbPath, _, _ := createTestDBWithScans(t)

	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"history", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history failed with code %d: %s", code, err.String())
	}
	outStr := out.String()
	if !strings.Contains(outStr, "Parallax Scan History") {
		t.Errorf("expected header in history output: %s", outStr)
	}
	if !strings.Contains(outStr, "example.com") || !strings.Contains(outStr, "otherdomain.org") {
		t.Errorf("expected both targets in history output: %s", outStr)
	}

	// Test history with target filter
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", "otherdomain.org", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history filter failed with code %d: %s", code, err.String())
	}
	if !strings.Contains(out.String(), "otherdomain.org") {
		t.Errorf("expected otherdomain.org in filtered history")
	}
	if strings.Contains(out.String(), "example.com") {
		t.Errorf("unexpected example.com in filtered history")
	}

	// Test history with limit
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", "--limit", "1", "--json", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history json failed with code %d: %s", code, err.String())
	}
	var records []models.ScanRecord
	if err := json.Unmarshal(out.Bytes(), &records); err != nil {
		t.Fatalf("invalid json from history: %v, output: %s", err, out.String())
	}
	if len(records) != 1 {
		t.Errorf("expected 1 record with --limit 1, got %d", len(records))
	}
}

func TestCLIHistoryIndividualScan(t *testing.T) {
	dbPath, id1, _ := createTestDBWithScans(t)

	// Test inspect by exact ID
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"history", id1, "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history inspect failed with code %d: %s", code, err.String())
	}
	if !strings.Contains(out.String(), "Parallax Scan Details") {
		t.Errorf("expected scan details header")
	}
	if !strings.Contains(out.String(), "api.example.com") {
		t.Errorf("expected api.example.com in scan details")
	}

	// Test inspect by prefix
	prefix := id1[:8]
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", prefix, "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history inspect by prefix failed: %s", err.String())
	}
	if !strings.Contains(out.String(), id1) {
		t.Errorf("expected full scan ID %s in output", id1)
	}

	// Test inspect as JSON
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", id1, "--json", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("history inspect json failed: %s", err.String())
	}
	var rep models.Report
	if err := json.Unmarshal(out.Bytes(), &rep); err != nil {
		t.Fatalf("invalid json report from history: %v", err)
	}
	if rep.ID != id1 || rep.Domain != "example.com" {
		t.Errorf("mismatched parsed report: %+v", rep)
	}
}

func TestCLIHistoryDelete(t *testing.T) {
	dbPath, id1, _ := createTestDBWithScans(t)

	// Missing ID
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"history", "delete", "--db", dbPath}, &out, &err)
	if code != 1 {
		t.Fatalf("expected code 1 for missing delete ID, got %d", code)
	}

	// Delete valid scan
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", "delete", id1, "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("delete failed: %s", err.String())
	}
	if !strings.Contains(out.String(), "successfully deleted") {
		t.Errorf("expected success message, got: %s", out.String())
	}

	// Delete already deleted scan -> not found
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"history", "delete", id1, "--db", dbPath}, &out, &err)
	if code != 1 {
		t.Fatalf("expected code 1 when deleting non-existent scan, got %d", code)
	}
	if !strings.Contains(err.String(), "Scan not found") {
		t.Errorf("expected Scan not found in error, got: %s", err.String())
	}
}

func TestCLICompare(t *testing.T) {
	dbPath, id1, id2 := createTestDBWithScans(t)

	// Text comparison
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"compare", id1, id2, "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("compare failed with code %d: %s", code, err.String())
	}
	outStr := out.String()
	if !strings.Contains(outStr, "Parallax Scan Comparison") {
		t.Errorf("expected comparison header, got: %s", outStr)
	}
	if !strings.Contains(outStr, "Added (2)") {
		t.Errorf("expected Added (2), got: %s", outStr)
	}
	if !strings.Contains(outStr, "Removed (1)") {
		t.Errorf("expected Removed (1), got: %s", outStr)
	}
	if !strings.Contains(outStr, "Unchanged (1)") {
		t.Errorf("expected Unchanged (1), got: %s", outStr)
	}
	if !strings.Contains(outStr, "dev.example.com") || !strings.Contains(outStr, "old.example.com") {
		t.Errorf("expected diff subdomains in output: %s", outStr)
	}

	// JSON comparison
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"compare", id1, id2, "--json", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("compare json failed: %s", err.String())
	}
	var cmp models.ScanComparison
	if err := json.Unmarshal(out.Bytes(), &cmp); err != nil {
		t.Fatalf("invalid json comparison: %v, output: %s", err, out.String())
	}
	if cmp.Counts.Added != 2 || cmp.Counts.Removed != 1 || cmp.Counts.Common != 1 {
		t.Errorf("unexpected comparison counts: %+v", cmp.Counts)
	}

	// Different targets rejection
	// Save a scan for different domain to test
	store, _ := storage.Open(dbPath)
	diffID, _ := store.SaveScan(context.Background(), models.Report{
		Domain:    "different.org",
		Timestamp: time.Now().UTC(),
	})
	store.Close()

	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"compare", id1, diffID, "--db", dbPath}, &out, &err)
	if code != 1 {
		t.Fatalf("expected code 1 for different target comparison, got %d", code)
	}
	if !strings.Contains(err.String(), "targets differ") {
		t.Errorf("expected 'targets differ' error, got: %s", err.String())
	}
}

func TestCLIReport(t *testing.T) {
	dbPath, id1, _ := createTestDBWithScans(t)

	// 1. Report JSON to stdout
	var out, err bytes.Buffer
	code := ExecuteWithWriters([]string{"report", id1, "--format", "json", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("report json failed with code %d: %s", code, err.String())
	}
	var rep models.Report
	if err := json.Unmarshal(out.Bytes(), &rep); err != nil {
		t.Fatalf("invalid json from report command: %v", err)
	}
	if rep.ID != id1 {
		t.Errorf("expected ID %s, got %s", id1, rep.ID)
	}

	// 2. Report HTML to stdout
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"report", id1, "--format", "html", "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("report html failed with code %d: %s", code, err.String())
	}
	if !strings.Contains(out.String(), "<!DOCTYPE html>") || !strings.Contains(out.String(), "example.com") {
		t.Errorf("invalid HTML report output: %s", out.String())
	}

	// 3. Report HTML to file
	outFile := filepath.Join(t.TempDir(), "report.html")
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"report", id1, "--output", outFile, "--db", dbPath}, &out, &err)
	if code != 0 {
		t.Fatalf("report to file failed with code %d: %s", code, err.String())
	}
	content, readErr := os.ReadFile(outFile)
	if readErr != nil {
		t.Fatalf("failed to read output report file: %v", readErr)
	}
	if !strings.Contains(string(content), "<!DOCTYPE html>") {
		t.Errorf("output file does not contain valid HTML")
	}

	// 4. Report non-existent scan ID
	out.Reset()
	err.Reset()
	code = ExecuteWithWriters([]string{"report", "nonexistent-id", "--db", dbPath}, &out, &err)
	if code != 1 {
		t.Fatalf("expected code 1 for missing scan report, got %d", code)
	}
	if !strings.Contains(err.String(), "Scan not found") {
		t.Errorf("expected 'Scan not found' error, got: %s", err.String())
	}
}
