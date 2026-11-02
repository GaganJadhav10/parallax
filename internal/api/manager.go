package api

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/engine"
	"github.com/GaganJadhav10/parallax/internal/models"
	"github.com/GaganJadhav10/parallax/internal/storage"
	"github.com/GaganJadhav10/parallax/internal/utils"
	"github.com/google/uuid"
)

var (
	ErrInvalidTarget    = errors.New("invalid target domain")
	ErrScanNotFound     = errors.New("scan not found")
	ErrScanInProgress   = errors.New("scan is still in progress")
	ErrMaxScansExceeded = errors.New("maximum concurrent scans reached, please wait for active scans to complete")
)

// ScannerEngine abstracts the core reconnaissance engine for API operations and test isolation.
type ScannerEngine interface {
	SelectSources(include []string, exclude []string) ([]engine.SourceDefinition, error)
	ScanTarget(ctx context.Context, target string, opts engine.ScanOptions, handler engine.EventHandler) (models.Report, []string, error)
}

// ScanRequest defines incoming payload parameters for initiating a scan via POST /api/scans.
type ScanRequest struct {
	Target  string   `json:"target"`
	Resolve bool     `json:"resolve"`
	Sources []string `json:"sources,omitempty"`
}

// ActiveScan represents an in-flight or recently completed in-memory reconnaissance task.
type ActiveScan struct {
	ID          string            `json:"id"`
	Target      string            `json:"target"`
	Status      models.ScanStatus `json:"status"`
	StartedAt   time.Time         `json:"started_at"`
	CompletedAt time.Time         `json:"completed_at,omitempty"`
	DurationMS  int64             `json:"duration_ms,omitempty"`
	Resolve     bool              `json:"resolve"`
	Sources     []string          `json:"sources,omitempty"`
	Error       string            `json:"error,omitempty"`
	Report      *models.Report    `json:"-"`

	mu          sync.RWMutex
	events      []models.Event
	subscribers map[chan models.Event]struct{}
	cancel      context.CancelFunc
}

// PublishEvent safely distributes an engine telemetry event to buffered history and active subscribers.
func (s *ActiveScan) PublishEvent(ev models.Event) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.events = append(s.events, ev)
	for ch := range s.subscribers {
		select {
		case ch <- ev:
		default:
			// Non-blocking drop if consumer buffer is saturated
		}
	}
}

// ScanManager coordinates asynchronous scan execution, state tracking, and SSE distribution.
type ScanManager struct {
	engine             ScannerEngine
	storage            storage.Storage
	config             config.File
	maxConcurrentScans int

	mu    sync.RWMutex
	scans map[string]*ActiveScan
}

// NewScanManager instantiates a thread-safe scan manager bound to the core engine and persistence layer.
func NewScanManager(eng ScannerEngine, store storage.Storage, cfg config.File, maxConcurrent ...int) *ScanManager {
	maxScans := 10
	if len(maxConcurrent) > 0 && maxConcurrent[0] >= 0 {
		maxScans = maxConcurrent[0]
	}
	return &ScanManager{
		engine:             eng,
		storage:            store,
		config:             cfg,
		maxConcurrentScans: maxScans,
		scans:              make(map[string]*ActiveScan),
	}
}

// StartScan validates request inputs, creates an active tracking record, and dispatches the scan asynchronously.
func (m *ScanManager) StartScan(ctx context.Context, req ScanRequest) (*ActiveScan, error) {
	target := strings.TrimSpace(req.Target)
	if target == "" {
		return nil, fmt.Errorf("%w: target domain is required", ErrInvalidTarget)
	}

	// Security: validate against shell metacharacters, path traversal, and protocol prefixes
	if strings.ContainsAny(target, "/\\ :;`$|&><\t\r\n") || strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
		return nil, fmt.Errorf("%w: target domain must be a valid hostname", ErrInvalidTarget)
	}

	normalized := utils.NormalizeTargetDomain(target)
	if !utils.IsValidDomain(normalized) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidTarget, target)
	}

	m.mu.Lock()
	if m.maxConcurrentScans > 0 {
		activeCount := 0
		for _, s := range m.scans {
			if s.Status == models.StatusRunning || s.Status == models.StatusPending {
				activeCount++
			}
		}
		if activeCount >= m.maxConcurrentScans {
			m.mu.Unlock()
			return nil, ErrMaxScansExceeded
		}
	}

	scanID := uuid.New().String()
	scanCtx, cancel := context.WithCancel(context.Background())

	active := &ActiveScan{
		ID:          scanID,
		Target:      normalized,
		Status:      models.StatusRunning,
		StartedAt:   time.Now().UTC(),
		Resolve:     req.Resolve,
		Sources:     req.Sources,
		events:      make([]models.Event, 0, 32),
		subscribers: make(map[chan models.Event]struct{}),
		cancel:      cancel,
	}

	m.scans[scanID] = active
	m.mu.Unlock()

	go m.executeScan(scanCtx, active, req)

	return active, nil
}

func (m *ScanManager) executeScan(ctx context.Context, active *ActiveScan, req ScanRequest) {
	opts := engine.ScanOptions{
		Resolve:        req.Resolve,
		Threads:        engine.DefaultThreads,
		Timeout:        engine.DefaultTimeout,
		Retries:        engine.DefaultRetries,
		IncludeSources: req.Sources,
		OTXAPIKey:      m.config.OTXAPIKey,
		VTAPIKey:       m.config.VTAPIKey,
		ShodanAPIKey:   m.config.ShodanAPIKey,
	}

	report, _, err := m.engine.ScanTarget(ctx, active.Target, opts, active.PublishEvent)

	active.mu.Lock()
	defer active.mu.Unlock()

	active.CompletedAt = time.Now().UTC()
	active.DurationMS = active.CompletedAt.Sub(active.StartedAt).Milliseconds()

	if err != nil {
		active.Status = models.StatusFailed
		active.Error = err.Error()
	} else {
		active.Status = models.StatusCompleted
		report.ID = active.ID
		active.Report = &report

		if m.storage != nil {
			_, _ = m.storage.SaveScan(context.Background(), report)
		}
	}

	// Close all subscriber channels to signal stream completion
	for ch := range active.subscribers {
		close(ch)
		delete(active.subscribers, ch)
	}
}

// GetScanStatus looks up a scan in memory or persistent SQLite storage.
func (m *ScanManager) GetScanStatus(ctx context.Context, id string) (*models.ScanRecord, *models.Report, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, nil, ErrScanNotFound
	}

	m.mu.RLock()
	active, inMemory := m.scans[id]
	m.mu.RUnlock()

	if inMemory {
		active.mu.RLock()
		defer active.mu.RUnlock()

		rec := &models.ScanRecord{
			ID:              active.ID,
			Target:          active.Target,
			Status:          active.Status,
			ResolvedEnabled: active.Resolve,
			StartedAt:       active.StartedAt,
			CompletedAt:     active.CompletedAt,
			DurationMS:      active.DurationMS,
		}
		if active.Report != nil {
			rec.RawResults = active.Report.Metadata.RawResults
			rec.UniqueSubdomains = active.Report.Metadata.UniqueSubdomains
			rec.FinalSubdomains = active.Report.TotalFound
			rec.WildcardFiltered = active.Report.Metadata.WildcardFiltered
		}
		return rec, active.Report, nil
	}

	// Fallback to SQLite persistent storage
	if m.storage != nil {
		report, rec, err := m.storage.GetScan(ctx, id)
		if err == nil {
			return rec, report, nil
		}
		if errors.Is(err, storage.ErrNotFound) {
			return nil, nil, ErrScanNotFound
		}
		return nil, nil, err
	}

	return nil, nil, ErrScanNotFound
}

// Subscribe returns an event channel and past buffered events for real-time SSE streaming.
func (m *ScanManager) Subscribe(scanID string) (<-chan models.Event, []models.Event, func(), error) {
	scanID = strings.TrimSpace(scanID)
	if scanID == "" {
		return nil, nil, nil, ErrScanNotFound
	}

	m.mu.RLock()
	active, found := m.scans[scanID]
	m.mu.RUnlock()

	if !found {
		// Check if it exists in SQLite as a completed scan
		if m.storage != nil {
			report, _, err := m.storage.GetScan(context.Background(), scanID)
			if err == nil && report != nil {
				// Replay synthetic completed event for past scans
				ev := models.Event{
					Type:        models.EventScanCompleted,
					Target:      report.Domain,
					DurationMS:  report.Metadata.DurationMS,
					LiveCount:   report.TotalFound,
					RawCount:    report.Metadata.RawResults,
					UniqueCount: report.Metadata.UniqueSubdomains,
					Timestamp:   report.Metadata.CompletedAt,
				}
				return nil, []models.Event{ev}, func() {}, nil
			}
		}
		return nil, nil, nil, ErrScanNotFound
	}

	active.mu.Lock()
	defer active.mu.Unlock()

	past := append([]models.Event(nil), active.events...)

	// If already completed or failed, no live events will follow
	if active.Status == models.StatusCompleted || active.Status == models.StatusFailed {
		return nil, past, func() {}, nil
	}

	ch := make(chan models.Event, 64)
	active.subscribers[ch] = struct{}{}

	unsubscribe := func() {
		active.mu.Lock()
		defer active.mu.Unlock()
		delete(active.subscribers, ch)
	}

	return ch, past, unsubscribe, nil
}

// DeleteScan terminates any running execution and removes the scan record from SQLite.
func (m *ScanManager) DeleteScan(ctx context.Context, id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return ErrScanNotFound
	}

	m.mu.Lock()
	if active, exists := m.scans[id]; exists {
		if active.cancel != nil {
			active.cancel()
		}
		delete(m.scans, id)
	}
	m.mu.Unlock()

	if m.storage != nil {
		if err := m.storage.DeleteScan(ctx, id); err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				return ErrScanNotFound
			}
			return err
		}
	}

	return nil
}
