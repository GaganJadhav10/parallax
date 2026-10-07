package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lumiaurora/subscan/internal/models"
	_ "modernc.org/sqlite"
)

// SQLiteStorage provides SQLite-backed persistent storage for ReconLens.
type SQLiteStorage struct {
	db   *sql.DB
	path string
}

// NewSQLiteStorage opens or initializes a SQLite database connection with migrations.
func NewSQLiteStorage(dbPath string) (*SQLiteStorage, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open SQLite database: %w", err)
	}

	// Configure SQLite pragmas for concurrency, data safety, and foreign key cascades
	pragmas := []string{
		"PRAGMA foreign_keys = ON;",
		"PRAGMA journal_mode = WAL;",
		"PRAGMA busy_timeout = 5000;",
	}
	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("failed to apply pragma %q: %w", pragma, err)
		}
	}

	if err := runMigrations(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("database migration failed: %w", err)
	}

	return &SQLiteStorage{
		db:   db,
		path: dbPath,
	}, nil
}

// Close shuts down the database connection pool.
func (s *SQLiteStorage) Close() error {
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

// SaveScan records a completed reconnaissance report and its associated metadata in SQLite.
func (s *SQLiteStorage) SaveScan(ctx context.Context, report models.Report) (string, error) {
	scanID := report.ID
	if strings.TrimSpace(scanID) == "" {
		scanID = uuid.New().String()
	}

	startedAt := report.Metadata.StartedAt
	if startedAt.IsZero() {
		startedAt = report.Timestamp
	}
	completedAt := report.Metadata.CompletedAt
	if completedAt.IsZero() {
		completedAt = report.Timestamp
	}

	status := string(models.StatusCompleted)
	if report.TotalFound == 0 && len(report.Metadata.FailedSources) > 0 && len(report.Metadata.EnabledSources) == len(report.Metadata.FailedSources) {
		status = string(models.StatusFailed)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("failed to start database transaction: %w", err)
	}
	defer func() {
		if tx != nil {
			_ = tx.Rollback()
		}
	}()

	// Insert scan record
	_, err = tx.ExecContext(ctx, `
INSERT INTO scans (
    id, target, status, resolved_enabled, started_at, completed_at, duration_ms,
    raw_results, unique_subdomains, final_subdomains, wildcard_filtered
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
		scanID,
		report.Domain,
		status,
		boolToInt(report.ResolvedEnabled),
		startedAt.UTC(),
		completedAt.UTC(),
		report.Metadata.DurationMS,
		report.Metadata.RawResults,
		report.Metadata.UniqueSubdomains,
		report.TotalFound,
		report.Metadata.WildcardFiltered,
	)
	if err != nil {
		return "", fmt.Errorf("failed to insert scan: %w", err)
	}

	// Map failed sources for easy error lookup
	failedErrors := make(map[string]string, len(report.Metadata.FailedSources))
	for _, f := range report.Metadata.FailedSources {
		failedErrors[f.ID] = f.Error
	}

	// Insert scan sources
	for _, t := range report.Metadata.SourceTimings {
		errMsg := ""
		if errStr, ok := failedErrors[t.ID]; ok {
			errMsg = errStr
		}

		_, err := tx.ExecContext(ctx, `
INSERT INTO scan_sources (scan_id, source_id, source_name, status, candidates, duration_ms, error_message)
VALUES (?, ?, ?, ?, ?, ?, ?)
`,
			scanID,
			t.ID,
			t.Name,
			t.Status,
			t.Candidates,
			t.DurationMS,
			nullString(errMsg),
		)
		if err != nil {
			return "", fmt.Errorf("failed to insert source timing for %s: %w", t.ID, err)
		}
	}

	// Insert subdomains, sources, and DNS records
	for _, sub := range report.Subdomains {
		res, err := tx.ExecContext(ctx, `
INSERT INTO subdomains (scan_id, hostname) VALUES (?, ?)
`, scanID, sub.Name)
		if err != nil {
			return "", fmt.Errorf("failed to insert subdomain %s: %w", sub.Name, err)
		}

		subdomainID, err := res.LastInsertId()
		if err != nil {
			return "", fmt.Errorf("failed to retrieve subdomain insert ID: %w", err)
		}

		// Insert attribution sources
		for _, src := range sub.Sources {
			_, err := tx.ExecContext(ctx, `
INSERT OR IGNORE INTO subdomain_sources (subdomain_id, source_name) VALUES (?, ?)
`, subdomainID, src)
			if err != nil {
				return "", fmt.Errorf("failed to insert subdomain source attribution: %w", err)
			}
		}

		// Insert A / AAAA IP addresses
		for _, ip := range sub.IPs {
			_, err := tx.ExecContext(ctx, `
INSERT INTO dns_records (subdomain_id, record_type, value) VALUES (?, 'A', ?)
`, subdomainID, ip)
			if err != nil {
				return "", fmt.Errorf("failed to insert IP record: %w", err)
			}
		}

		// Insert CNAME aliases
		for _, cname := range sub.CNAMEs {
			_, err := tx.ExecContext(ctx, `
INSERT INTO dns_records (subdomain_id, record_type, value) VALUES (?, 'CNAME', ?)
`, subdomainID, cname)
			if err != nil {
				return "", fmt.Errorf("failed to insert CNAME record: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("failed to commit scan transaction: %w", err)
	}
	tx = nil

	return scanID, nil
}

// GetScan retrieves a stored scan by exact ID or unique ID prefix.
func (s *SQLiteStorage) GetScan(ctx context.Context, idOrPrefix string) (*models.Report, *models.ScanRecord, error) {
	idOrPrefix = strings.TrimSpace(idOrPrefix)
	if idOrPrefix == "" {
		return nil, nil, errors.New("scan ID cannot be empty")
	}

	// Query scan matching exact ID or prefix
	var (
		scanID           string
		target           string
		statusStr        string
		resolvedEnabled  int
		startedAt        time.Time
		completedAt      time.Time
		durationMS       int64
		rawResults       int
		uniqueSubdomains int
		finalSubdomains  int
		wildcardFiltered int
	)

	err := s.db.QueryRowContext(ctx, `
SELECT id, target, status, resolved_enabled, started_at, completed_at, duration_ms,
       raw_results, unique_subdomains, final_subdomains, wildcard_filtered
FROM scans
WHERE id = ? OR id LIKE ? || '%'
ORDER BY started_at DESC
LIMIT 1
`, idOrPrefix, idOrPrefix).Scan(
		&scanID,
		&target,
		&statusStr,
		&resolvedEnabled,
		&startedAt,
		&completedAt,
		&durationMS,
		&rawResults,
		&uniqueSubdomains,
		&finalSubdomains,
		&wildcardFiltered,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, ErrNotFound
		}
		return nil, nil, fmt.Errorf("failed to query scan: %w", err)
	}

	scanRecord := models.ScanRecord{
		ID:               scanID,
		Target:           target,
		Status:           models.ScanStatus(statusStr),
		ResolvedEnabled:  resolvedEnabled == 1,
		StartedAt:        startedAt,
		CompletedAt:      completedAt,
		DurationMS:       durationMS,
		RawResults:       rawResults,
		UniqueSubdomains: uniqueSubdomains,
		FinalSubdomains:  finalSubdomains,
		WildcardFiltered: wildcardFiltered,
	}

	// Query scan sources
	sourceRows, err := s.db.QueryContext(ctx, `
SELECT source_id, source_name, status, candidates, duration_ms, error_message
FROM scan_sources
WHERE scan_id = ?
ORDER BY id ASC
`, scanID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query scan sources: %w", err)
	}
	defer sourceRows.Close()

	timings := make([]models.SourceTiming, 0)
	failedSources := make([]models.FailedSource, 0)
	enabledSources := make([]models.SourceReference, 0)

	for sourceRows.Next() {
		var (
			sID, sName, sStatus string
			candidates          int
			durMS               int64
			errMsg              sql.NullString
		)
		if err := sourceRows.Scan(&sID, &sName, &sStatus, &candidates, &durMS, &errMsg); err != nil {
			return nil, nil, err
		}

		enabledSources = append(enabledSources, models.SourceReference{ID: sID, Name: sName})
		timings = append(timings, models.SourceTiming{
			ID:         sID,
			Name:       sName,
			Status:     sStatus,
			Candidates: candidates,
			DurationMS: durMS,
		})

		if sStatus != "success" && sStatus != "enabled" {
			failedSources = append(failedSources, models.FailedSource{
				ID:         sID,
				Name:       sName,
				Health:     sStatus,
				Error:      errMsg.String,
				DurationMS: durMS,
			})
		}
	}

	// Query subdomains
	subRows, err := s.db.QueryContext(ctx, `
SELECT id, hostname
FROM subdomains
WHERE scan_id = ?
ORDER BY hostname ASC
`, scanID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to query subdomains: %w", err)
	}
	defer subRows.Close()

	type subHelper struct {
		id       int64
		hostname string
	}
	subHelpers := make([]subHelper, 0)
	for subRows.Next() {
		var h subHelper
		if err := subRows.Scan(&h.id, &h.hostname); err != nil {
			return nil, nil, err
		}
		subHelpers = append(subHelpers, h)
	}

	subdomains := make([]models.Subdomain, 0, len(subHelpers))

	// Fetch sources and DNS records for each subdomain
	for _, sh := range subHelpers {
		srcRows, err := s.db.QueryContext(ctx, `SELECT source_name FROM subdomain_sources WHERE subdomain_id = ? ORDER BY source_name ASC`, sh.id)
		if err != nil {
			return nil, nil, err
		}
		sourcesList := make([]string, 0)
		for srcRows.Next() {
			var sn string
			if err := srcRows.Scan(&sn); err == nil {
				sourcesList = append(sourcesList, sn)
			}
		}
		srcRows.Close()

		dnsRows, err := s.db.QueryContext(ctx, `SELECT record_type, value FROM dns_records WHERE subdomain_id = ? ORDER BY value ASC`, sh.id)
		if err != nil {
			return nil, nil, err
		}
		ips := make([]string, 0)
		cnames := make([]string, 0)
		for dnsRows.Next() {
			var rType, rVal string
			if err := dnsRows.Scan(&rType, &rVal); err == nil {
				if rType == "A" {
					ips = append(ips, rVal)
				} else if rType == "CNAME" {
					cnames = append(cnames, rVal)
				}
			}
		}
		dnsRows.Close()

		subdomains = append(subdomains, models.Subdomain{
			Name:    sh.hostname,
			Sources: sourcesList,
			IPs:     ips,
			CNAMEs:  cnames,
		})
	}

	report := models.Report{
		ID:              scanID,
		Domain:          target,
		Timestamp:       completedAt,
		TotalFound:      len(subdomains),
		ResolvedEnabled: resolvedEnabled == 1,
		Metadata: models.RunMetadata{
			StartedAt:        startedAt,
			CompletedAt:      completedAt,
			DurationMS:       durationMS,
			RawResults:       rawResults,
			UniqueSubdomains: uniqueSubdomains,
			FinalSubdomains:  finalSubdomains,
			WildcardFiltered: wildcardFiltered,
			EnabledSources:   enabledSources,
			FailedSources:    failedSources,
			SourceTimings:    timings,
		},
		Subdomains: subdomains,
	}

	return &report, &scanRecord, nil
}

// ListScans retrieves scan index summaries according to the provided filter.
func (s *SQLiteStorage) ListScans(ctx context.Context, filter models.ScanFilter) ([]models.ScanRecord, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}

	var (
		rows *sql.Rows
		err  error
	)

	target := strings.TrimSpace(filter.Target)
	if target != "" {
		rows, err = s.db.QueryContext(ctx, `
SELECT id, target, status, resolved_enabled, started_at, completed_at, duration_ms,
       raw_results, unique_subdomains, final_subdomains, wildcard_filtered
FROM scans
WHERE target = ?
ORDER BY started_at DESC
LIMIT ?
`, target, limit)
	} else {
		rows, err = s.db.QueryContext(ctx, `
SELECT id, target, status, resolved_enabled, started_at, completed_at, duration_ms,
       raw_results, unique_subdomains, final_subdomains, wildcard_filtered
FROM scans
ORDER BY started_at DESC
LIMIT ?
`, limit)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list scans: %w", err)
	}
	defer rows.Close()

	records := make([]models.ScanRecord, 0)
	for rows.Next() {
		var (
			rec             models.ScanRecord
			statusStr       string
			resolvedEnabled int
		)
		err := rows.Scan(
			&rec.ID,
			&rec.Target,
			&statusStr,
			&resolvedEnabled,
			&rec.StartedAt,
			&rec.CompletedAt,
			&rec.DurationMS,
			&rec.RawResults,
			&rec.UniqueSubdomains,
			&rec.FinalSubdomains,
			&rec.WildcardFiltered,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan record row: %w", err)
		}
		rec.Status = models.ScanStatus(statusStr)
		rec.ResolvedEnabled = resolvedEnabled == 1
		records = append(records, rec)
	}

	return records, nil
}

// DeleteScan removes a scan and cascades deletion across all related subdomains and DNS records.
func (s *SQLiteStorage) DeleteScan(ctx context.Context, idOrPrefix string) error {
	idOrPrefix = strings.TrimSpace(idOrPrefix)
	if idOrPrefix == "" {
		return errors.New("scan ID cannot be empty")
	}

	// Verify scan exists
	var fullID string
	err := s.db.QueryRowContext(ctx, `
SELECT id FROM scans WHERE id = ? OR id LIKE ? || '%' LIMIT 1
`, idOrPrefix, idOrPrefix).Scan(&fullID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	_, err = s.db.ExecContext(ctx, "DELETE FROM scans WHERE id = ?", fullID)
	if err != nil {
		return fmt.Errorf("failed to delete scan: %w", err)
	}

	return nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func nullString(s string) any {
	if s == "" {
		return nil
	}
	return s
}
