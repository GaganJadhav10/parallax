package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lumiaurora/subscan/internal/buildinfo"
	"github.com/lumiaurora/subscan/internal/engine"
	"github.com/lumiaurora/subscan/internal/models"
	"github.com/lumiaurora/subscan/internal/report"
	"github.com/lumiaurora/subscan/internal/storage"
)

// HealthResponse represents the payload returned by GET /api/health.
type HealthResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

// SourceInfo describes a passive intelligence provider's operational characteristics.
type SourceInfo struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Enabled      bool   `json:"enabled"`
	AuthRequired bool   `json:"auth_required"`
	Status       string `json:"status"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	info := buildinfo.Current()
	writeJSON(w, http.StatusOK, HealthResponse{
		Status:  "ok",
		Service: "reconlens",
		Version: info.Version,
		Time:    time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleSources(w http.ResponseWriter, r *http.Request) {
	registry := engine.DefaultRegistry()
	sources := make([]SourceInfo, 0, len(registry))

	for _, src := range registry {
		enabled := true
		if src.Enabled != nil {
			enabled = src.Enabled()
		}

		authRequired := src.ID == "virustotal" || src.ID == "shodan"
		status := "available"
		if authRequired && !enabled {
			status = "api_key_required"
		}

		sources = append(sources, SourceInfo{
			ID:           src.ID,
			Name:         src.Name,
			Enabled:      enabled,
			AuthRequired: authRequired,
			Status:       status,
		})
	}

	writeJSON(w, http.StatusOK, sources)
}

func (s *Server) handleCreateScan(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "failed to parse JSON request body")
		return
	}

	active, err := s.manager.StartScan(r.Context(), req)
	if err != nil {
		if errors.Is(err, ErrMaxScansExceeded) {
			writeError(w, http.StatusTooManyRequests, "rate_limited", err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, "invalid_target", err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"id":     active.ID,
		"target": active.Target,
		"status": string(active.Status),
	})
}

func (s *Server) handleListScans(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if val, err := strconv.Atoi(l); err == nil && val > 0 {
			limit = val
		}
	}

	filter := models.ScanFilter{
		Target: strings.TrimSpace(r.URL.Query().Get("target")),
		Limit:  limit,
	}

	records, err := s.storage.ListScans(r.Context(), filter)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "storage_error", "failed to list scans")
		return
	}

	if records == nil {
		records = []models.ScanRecord{}
	}

	writeJSON(w, http.StatusOK, records)
}

func (s *Server) handleGetScanStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, rep, err := s.manager.GetScanStatus(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrScanNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "scan not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve scan status")
		}
		return
	}

	resp := map[string]any{
		"id":               rec.ID,
		"target":           rec.Target,
		"status":           string(rec.Status),
		"resolved_enabled": rec.ResolvedEnabled,
		"started_at":       rec.StartedAt,
	}
	if !rec.CompletedAt.IsZero() {
		resp["completed_at"] = rec.CompletedAt
		resp["duration_ms"] = rec.DurationMS
	}
	if rep != nil {
		resp["raw_results"] = rep.Metadata.RawResults
		resp["unique_subdomains"] = rep.Metadata.UniqueSubdomains
		resp["final_subdomains"] = rep.TotalFound
		resp["wildcard_filtered"] = rep.Metadata.WildcardFiltered
	} else {
		resp["raw_results"] = rec.RawResults
		resp["unique_subdomains"] = rec.UniqueSubdomains
		resp["final_subdomains"] = rec.FinalSubdomains
		resp["wildcard_filtered"] = rec.WildcardFiltered
	}

	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleGetScanResults(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rec, rep, err := s.manager.GetScanStatus(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrScanNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "scan not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve scan")
		}
		return
	}

	if rec.Status == models.StatusRunning || rec.Status == models.StatusPending {
		writeError(w, http.StatusConflict, "scan_in_progress", "scan is currently executing")
		return
	}

	if rep == nil {
		// Try fetching directly from storage
		report, _, err := s.storage.GetScan(r.Context(), id)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				writeError(w, http.StatusNotFound, "not_found", "scan not found")
			} else {
				writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve results")
			}
			return
		}
		rep = report
	}

	writeJSON(w, http.StatusOK, rep)
}

func (s *Server) handleScanEvents(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "sse_unsupported", "streaming is unsupported by server")
		return
	}

	eventCh, pastEvents, unsubscribe, err := s.manager.Subscribe(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "scan not found")
		return
	}
	defer unsubscribe()

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// 1. Replay buffered events
	for _, ev := range pastEvents {
		writeSSE(w, ev)
	}
	flusher.Flush()

	// 2. Stream live events
	if eventCh != nil {
		for {
			select {
			case <-r.Context().Done():
				return
			case ev, open := <-eventCh:
				if !open {
					return
				}
				writeSSE(w, ev)
				flusher.Flush()

				if ev.Type == models.EventScanCompleted || ev.Type == models.EventScanFailed {
					return
				}
			}
		}
	}
}

func writeSSE(w http.ResponseWriter, ev models.Event) {
	data, _ := json.Marshal(ev)
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, data)
}

func (s *Server) handleDeleteScan(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := s.manager.DeleteScan(r.Context(), id); err != nil {
		if errors.Is(err, ErrScanNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "scan not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to delete scan")
		}
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "deleted",
		"id":     id,
	})
}

func (s *Server) handleCompareScans(w http.ResponseWriter, r *http.Request) {
	id1 := strings.TrimSpace(r.URL.Query().Get("a"))
	id2 := strings.TrimSpace(r.URL.Query().Get("b"))

	if id1 == "" || id2 == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "query parameters 'a' and 'b' are required")
		return
	}

	scan1, _, err1 := s.storage.GetScan(r.Context(), id1)
	if err1 != nil {
		if errors.Is(err1, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("scan %q not found", id1))
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve scan")
		}
		return
	}

	scan2, _, err2 := s.storage.GetScan(r.Context(), id2)
	if err2 != nil {
		if errors.Is(err2, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", fmt.Sprintf("scan %q not found", id2))
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve scan")
		}
		return
	}

	if !strings.EqualFold(scan1.Domain, scan2.Domain) {
		writeError(w, http.StatusBadRequest, "target_mismatch", fmt.Sprintf("cannot compare scans for different targets: %s vs %s", scan1.Domain, scan2.Domain))
		return
	}

	olderScan := scan1
	newerScan := scan2
	if scan2.Timestamp.Before(scan1.Timestamp) {
		olderScan = scan2
		newerScan = scan1
	}

	cmp := diffScans(olderScan, newerScan)
	writeJSON(w, http.StatusOK, cmp)
}

func diffScans(older, newer *models.Report) models.ScanComparison {
	oldSet := make(map[string]struct{}, len(older.Subdomains))
	for _, s := range older.Subdomains {
		oldSet[strings.ToLower(strings.TrimSpace(s.Name))] = struct{}{}
	}

	newSet := make(map[string]struct{}, len(newer.Subdomains))
	for _, s := range newer.Subdomains {
		newSet[strings.ToLower(strings.TrimSpace(s.Name))] = struct{}{}
	}

	added := []string{}
	removed := []string{}
	common := []string{}

	for name := range newSet {
		if _, exists := oldSet[name]; exists {
			common = append(common, name)
		} else {
			added = append(added, name)
		}
	}

	for name := range oldSet {
		if _, exists := newSet[name]; !exists {
			removed = append(removed, name)
		}
	}

	sort.Strings(added)
	sort.Strings(removed)
	sort.Strings(common)

	return models.ScanComparison{
		Target:        older.Domain,
		OlderScanID:   older.ID,
		OlderScanDate: older.Timestamp,
		NewerScanID:   newer.ID,
		NewerScanDate: newer.Timestamp,
		Added:         added,
		Removed:       removed,
		Common:        common,
		Counts: models.ComparisonCounts{
			Added:   len(added),
			Removed: len(removed),
			Common:  len(common),
		},
	}
}

func (s *Server) handleScanReport(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	rep, _, err := s.storage.GetScan(r.Context(), id)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "scan not found")
		} else {
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to retrieve scan")
		}
		return
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "json"
	}

	switch format {
	case "json":
		data, err := report.RenderJSON(*rep)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "render_error", "failed to generate JSON report")
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(data)

	case "html":
		data, err := report.RenderHTML(*rep)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "render_error", "failed to generate HTML report")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(data)

	default:
		writeError(w, http.StatusBadRequest, "invalid_format", "format must be 'json' or 'html'")
	}
}
