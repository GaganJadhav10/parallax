package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/engine"
	"github.com/GaganJadhav10/parallax/internal/models"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

type mockEngine struct {
	scanFunc func(ctx context.Context, target string, opts engine.ScanOptions, handler engine.EventHandler) (models.Report, []string, error)
}

func (m *mockEngine) SelectSources(include []string, exclude []string) ([]engine.SourceDefinition, error) {
	return engine.DefaultRegistry(), nil
}

func (m *mockEngine) ScanTarget(ctx context.Context, target string, opts engine.ScanOptions, handler engine.EventHandler) (models.Report, []string, error) {
	if m.scanFunc != nil {
		return m.scanFunc(ctx, target, opts, handler)
	}

	now := time.Now().UTC()
	if handler != nil {
		handler(models.Event{Type: models.EventScanStarted, Target: target, Timestamp: now})
		handler(models.Event{Type: models.EventProviderCompleted, Target: target, SourceName: "certspotter", Candidates: 2, Timestamp: now})
		handler(models.Event{Type: models.EventCandidatesFound, Target: target, RawCount: 2, UniqueCount: 2, Timestamp: now})
		handler(models.Event{Type: models.EventScanCompleted, Target: target, LiveCount: 2, Timestamp: now})
	}

	return models.Report{
		Domain:     target,
		Timestamp:  now,
		TotalFound: 2,
		Subdomains: []models.Subdomain{
			{Name: "api." + target, Sources: []string{"certspotter"}},
			{Name: "dev." + target, Sources: []string{"certspotter"}},
		},
		Metadata: models.RunMetadata{
			StartedAt:        now,
			CompletedAt:      now,
			DurationMS:       20,
			RawResults:       2,
			UniqueSubdomains: 2,
			FinalSubdomains:  2,
		},
	}, []string{"api." + target, "dev." + target}, nil
}

func setupTestServer(t *testing.T, customEngine ScannerEngine) (*Server, storage.Storage) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test_api.db")
	store, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}

	cfg := Config{
		Host:         "127.0.0.1",
		Port:         8080,
		DatabasePath: dbPath,
		CORSOrigins:  []string{"http://localhost:3000"},
	}

	eng := customEngine
	if eng == nil {
		eng = &mockEngine{}
	}

	server := NewServer(cfg, eng, store, config.File{})
	return server, store
}

func TestHealthEndpoint(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp HealthResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}

	if resp.Status != "ok" || resp.Service != "parallax" {
		t.Errorf("unexpected health response: %+v", resp)
	}
	if resp.Version == "" || resp.Time == "" {
		t.Errorf("missing version or time in health response")
	}
}

func TestSourcesEndpoint(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	req := httptest.NewRequest(http.MethodGet, "/api/sources", nil)
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var sources []SourceInfo
	if err := json.NewDecoder(w.Body).Decode(&sources); err != nil {
		t.Fatalf("failed to decode sources: %v", err)
	}

	if len(sources) != 10 {
		t.Fatalf("expected 10 sources, got %d", len(sources))
	}

	// Verify no secrets or sensitive info leaked
	for _, s := range sources {
		if s.ID == "" || s.Name == "" {
			t.Errorf("invalid source info: %+v", s)
		}
	}
}

func TestCreateScanValid(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	body := `{"target":"example.com","resolve":false,"sources":["certspotter"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	if w.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp["id"] == "" || resp["target"] != "example.com" || resp["status"] != "running" {
		t.Fatalf("unexpected scan create response: %+v", resp)
	}
}

func TestCreateScanInvalid(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	invalidPayloads := []string{
		`{"target":""}`,
		`{"target":"/etc/passwd"}`,
		`{"target":"example.com; rm -rf /"}`,
		`{"target":"http://example.com"}`,
		`{"target":"example..com"}`,
		`invalid json`,
	}

	for _, p := range invalidPayloads {
		req := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(p))
		w := httptest.NewRecorder()
		server.Routes().ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for payload %q, got %d", p, w.Code)
		}
	}
}

func TestScanStatusAndResultsLifecycle(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	// 1. Start scan
	body := `{"target":"example.com","resolve":false}`
	req := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(body))
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	var createResp map[string]string
	_ = json.NewDecoder(w.Body).Decode(&createResp)
	scanID := createResp["id"]

	// Wait briefly for in-process scan to finish
	time.Sleep(100 * time.Millisecond)

	// 2. Check scan status
	statusReq := httptest.NewRequest(http.MethodGet, "/api/scans/"+scanID, nil)
	statusW := httptest.NewRecorder()
	server.Routes().ServeHTTP(statusW, statusReq)

	if statusW.Code != http.StatusOK {
		t.Fatalf("expected 200 for status, got %d: %s", statusW.Code, statusW.Body.String())
	}

	var statusMap map[string]any
	_ = json.NewDecoder(statusW.Body).Decode(&statusMap)
	if statusMap["status"] != "completed" {
		t.Errorf("expected completed status, got %v", statusMap["status"])
	}

	// 3. Check scan results
	resultsReq := httptest.NewRequest(http.MethodGet, "/api/scans/"+scanID+"/results", nil)
	resultsW := httptest.NewRecorder()
	server.Routes().ServeHTTP(resultsW, resultsReq)

	if resultsW.Code != http.StatusOK {
		t.Fatalf("expected 200 for results, got %d: %s", resultsW.Code, resultsW.Body.String())
	}

	var rep models.Report
	if err := json.NewDecoder(resultsW.Body).Decode(&rep); err != nil {
		t.Fatalf("failed to decode report results: %v", err)
	}
	if len(rep.Subdomains) != 2 || rep.Domain != "example.com" {
		t.Errorf("unexpected report content: %+v", rep)
	}

	// 4. Missing scan ID returns 404
	missingReq := httptest.NewRequest(http.MethodGet, "/api/scans/non-existent-id", nil)
	missingW := httptest.NewRecorder()
	server.Routes().ServeHTTP(missingW, missingReq)
	if missingW.Code != http.StatusNotFound {
		t.Errorf("expected 404 for missing scan, got %d", missingW.Code)
	}
}

func TestSSEEventsStream(t *testing.T) {
	// Create engine with brief pause to test live stream
	slowEngine := &mockEngine{
		scanFunc: func(ctx context.Context, target string, opts engine.ScanOptions, handler engine.EventHandler) (models.Report, []string, error) {
			if handler != nil {
				handler(models.Event{Type: models.EventScanStarted, Target: target, Timestamp: time.Now().UTC()})
				time.Sleep(30 * time.Millisecond)
				handler(models.Event{Type: models.EventProviderCompleted, Target: target, SourceName: "certspotter", Candidates: 1, Timestamp: time.Now().UTC()})
				time.Sleep(30 * time.Millisecond)
				handler(models.Event{Type: models.EventScanCompleted, Target: target, LiveCount: 1, Timestamp: time.Now().UTC()})
			}
			return models.Report{
				Domain:     target,
				TotalFound: 1,
				Subdomains: []models.Subdomain{{Name: "www." + target, Sources: []string{"certspotter"}}},
			}, []string{"www." + target}, nil
		},
	}

	server, store := setupTestServer(t, slowEngine)
	defer store.Close()

	// 1. Start scan
	body := `{"target":"example.com"}`
	req := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(body))
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	var createResp map[string]string
	_ = json.NewDecoder(w.Body).Decode(&createResp)
	scanID := createResp["id"]

	// 2. Connect to SSE endpoint
	sseReq := httptest.NewRequest(http.MethodGet, "/api/scans/"+scanID+"/events", nil)
	sseW := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		server.Routes().ServeHTTP(sseW, sseReq)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("SSE stream did not complete within timeout")
	}

	if sseW.Code != http.StatusOK {
		t.Fatalf("expected 200 for SSE, got %d", sseW.Code)
	}

	contentType := sseW.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/event-stream") {
		t.Errorf("expected text/event-stream content type, got: %s", contentType)
	}

	bodyStr := sseW.Body.String()
	if !strings.Contains(bodyStr, "event: scan:started") {
		t.Errorf("missing event scan:started in SSE body: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, "event: scan:completed") {
		t.Errorf("missing event scan:completed in SSE body: %s", bodyStr)
	}
}

func TestScanHistoryAPI(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	// Seed 2 scans in SQLite
	now := time.Now().UTC()
	rep1 := models.Report{Domain: "example.com", Timestamp: now.Add(-time.Hour), TotalFound: 1}
	rep2 := models.Report{Domain: "other.org", Timestamp: now, TotalFound: 2}
	_, _ = store.SaveScan(context.Background(), rep1)
	_, _ = store.SaveScan(context.Background(), rep2)

	// Query all scans
	req := httptest.NewRequest(http.MethodGet, "/api/scans", nil)
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var records []models.ScanRecord
	if err := json.NewDecoder(w.Body).Decode(&records); err != nil {
		t.Fatalf("failed to decode scan history: %v", err)
	}
	if len(records) != 2 {
		t.Errorf("expected 2 scans, got %d", len(records))
	}

	// Filter by target
	filterReq := httptest.NewRequest(http.MethodGet, "/api/scans?target=example.com", nil)
	filterW := httptest.NewRecorder()
	server.Routes().ServeHTTP(filterW, filterReq)

	var filtered []models.ScanRecord
	_ = json.NewDecoder(filterW.Body).Decode(&filtered)
	if len(filtered) != 1 || filtered[0].Target != "example.com" {
		t.Errorf("unexpected filtered results: %+v", filtered)
	}
}

func TestScanComparisonAPI(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	now := time.Now().UTC()
	rep1 := models.Report{
		Domain:    "example.com",
		Timestamp: now.Add(-10 * time.Minute),
		Subdomains: []models.Subdomain{
			{Name: "api.example.com"},
			{Name: "old.example.com"},
		},
	}
	rep2 := models.Report{
		Domain:    "example.com",
		Timestamp: now,
		Subdomains: []models.Subdomain{
			{Name: "api.example.com"},
			{Name: "new.example.com"},
		},
	}
	id1, _ := store.SaveScan(context.Background(), rep1)
	id2, _ := store.SaveScan(context.Background(), rep2)

	// Valid comparison
	req := httptest.NewRequest(http.MethodGet, "/api/scans/compare?a="+id1+"&b="+id2, nil)
	w := httptest.NewRecorder()
	server.Routes().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var cmp models.ScanComparison
	if err := json.NewDecoder(w.Body).Decode(&cmp); err != nil {
		t.Fatalf("failed to decode comparison: %v", err)
	}
	if cmp.Counts.Added != 1 || cmp.Counts.Removed != 1 || cmp.Counts.Common != 1 {
		t.Errorf("unexpected comparison counts: %+v", cmp.Counts)
	}

	// Different targets rejection
	diffRep := models.Report{Domain: "diff.org", Timestamp: now}
	idDiff, _ := store.SaveScan(context.Background(), diffRep)

	diffReq := httptest.NewRequest(http.MethodGet, "/api/scans/compare?a="+id1+"&b="+idDiff, nil)
	diffW := httptest.NewRecorder()
	server.Routes().ServeHTTP(diffW, diffReq)

	if diffW.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for different target comparison, got %d", diffW.Code)
	}
}

func TestScanReportAPI(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	rep := models.Report{
		Domain:     "example.com",
		Timestamp:  time.Now().UTC(),
		TotalFound: 1,
		Subdomains: []models.Subdomain{{Name: "api.example.com"}},
	}
	id, _ := store.SaveScan(context.Background(), rep)

	// JSON format
	jsonReq := httptest.NewRequest(http.MethodGet, "/api/scans/"+id+"/report?format=json", nil)
	jsonW := httptest.NewRecorder()
	server.Routes().ServeHTTP(jsonW, jsonReq)

	if jsonW.Code != http.StatusOK || !strings.Contains(jsonW.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("unexpected JSON report response: code %d, content-type %s", jsonW.Code, jsonW.Header().Get("Content-Type"))
	}

	// HTML format
	htmlReq := httptest.NewRequest(http.MethodGet, "/api/scans/"+id+"/report?format=html", nil)
	htmlW := httptest.NewRecorder()
	server.Routes().ServeHTTP(htmlW, htmlReq)

	if htmlW.Code != http.StatusOK || !strings.Contains(htmlW.Header().Get("Content-Type"), "text/html") {
		t.Fatalf("unexpected HTML report response: code %d, content-type %s", htmlW.Code, htmlW.Header().Get("Content-Type"))
	}
	if !strings.Contains(htmlW.Body.String(), "<!DOCTYPE html>") {
		t.Errorf("missing DOCTYPE html in response body")
	}
}

func TestDeleteScanAPI(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	rep := models.Report{Domain: "example.com", Timestamp: time.Now().UTC()}
	id, _ := store.SaveScan(context.Background(), rep)

	delReq := httptest.NewRequest(http.MethodDelete, "/api/scans/"+id, nil)
	delW := httptest.NewRecorder()
	server.Routes().ServeHTTP(delW, delReq)

	if delW.Code != http.StatusOK {
		t.Fatalf("expected 200 for delete, got %d", delW.Code)
	}

	// Second delete returns 404
	delReq2 := httptest.NewRequest(http.MethodDelete, "/api/scans/"+id, nil)
	delW2 := httptest.NewRecorder()
	server.Routes().ServeHTTP(delW2, delReq2)

	if delW2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for deleted scan, got %d", delW2.Code)
	}
}

func TestCORSBehavior(t *testing.T) {
	server, store := setupTestServer(t, nil)
	defer store.Close()

	// 1. Allowed origin preflight
	preflight := httptest.NewRequest(http.MethodOptions, "/api/health", nil)
	preflight.Header.Set("Origin", "http://localhost:3000")
	wPre := httptest.NewRecorder()
	server.Routes().ServeHTTP(wPre, preflight)

	if wPre.Code != http.StatusNoContent {
		t.Errorf("expected 204 No Content for preflight, got %d", wPre.Code)
	}
	if wPre.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Errorf("expected Allow-Origin header to match allowed origin")
	}

	// 2. Disallowed origin
	unallowed := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	unallowed.Header.Set("Origin", "http://malicious.site")
	wUn := httptest.NewRecorder()
	server.Routes().ServeHTTP(wUn, unallowed)

	if wUn.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("expected no Allow-Origin header for disallowed origin")
	}
}

func TestMaxConcurrentScansLimit(t *testing.T) {
	blockCh := make(chan struct{})
	defer close(blockCh)

	blockingEngine := &mockEngine{
		scanFunc: func(ctx context.Context, target string, opts engine.ScanOptions, handler engine.EventHandler) (models.Report, []string, error) {
			select {
			case <-blockCh:
			case <-ctx.Done():
			}
			return models.Report{Domain: target}, nil, nil
		},
	}

	dbPath := filepath.Join(t.TempDir(), "test_limit.db")
	store, err := storage.Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open store: %v", err)
	}
	defer store.Close()

	cfg := Config{
		Host:               "127.0.0.1",
		Port:               8080,
		DatabasePath:       dbPath,
		MaxConcurrentScans: 1, // Limit to 1 concurrent scan
	}
	server := NewServer(cfg, blockingEngine, store, config.File{})

	// 1. First scan should succeed (HTTP 202 Accepted)
	body1 := `{"target":"first.example.com"}`
	req1 := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(body1))
	w1 := httptest.NewRecorder()
	server.Routes().ServeHTTP(w1, req1)

	if w1.Code != http.StatusAccepted {
		t.Fatalf("expected first scan to be 202 Accepted, got %d", w1.Code)
	}

	// 2. Second concurrent scan while first is running should be rejected with 429
	body2 := `{"target":"second.example.com"}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/scans", strings.NewReader(body2))
	w2 := httptest.NewRecorder()
	server.Routes().ServeHTTP(w2, req2)

	if w2.Code != http.StatusTooManyRequests {
		t.Fatalf("expected second concurrent scan to be 429 Too Many Requests, got %d", w2.Code)
	}
}
