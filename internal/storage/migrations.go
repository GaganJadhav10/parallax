package storage

import (
	"database/sql"
	"fmt"
	"time"
)

type migration struct {
	version int
	name    string
	sql     string
}

var migrations = []migration{
	{
		version: 1,
		name:    "initial_schema",
		sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    resolved_enabled INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NOT NULL,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    raw_results INTEGER NOT NULL DEFAULT 0,
    unique_subdomains INTEGER NOT NULL DEFAULT 0,
    final_subdomains INTEGER NOT NULL DEFAULT 0,
    wildcard_filtered INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scans_target ON scans(target);
CREATE INDEX IF NOT EXISTS idx_scans_started_at ON scans(started_at DESC);

CREATE TABLE IF NOT EXISTS scan_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL,
    candidates INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_sources_scan_id ON scan_sources(scan_id);

CREATE TABLE IF NOT EXISTS subdomains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    hostname TEXT NOT NULL,
    UNIQUE(scan_id, hostname)
);

CREATE INDEX IF NOT EXISTS idx_subdomains_scan_id ON subdomains(scan_id);

CREATE TABLE IF NOT EXISTS subdomain_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain_id INTEGER NOT NULL REFERENCES subdomains(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL,
    UNIQUE(subdomain_id, source_name)
);

CREATE INDEX IF NOT EXISTS idx_subdomain_sources_subdomain_id ON subdomain_sources(subdomain_id);

CREATE TABLE IF NOT EXISTS dns_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subdomain_id INTEGER NOT NULL REFERENCES subdomains(id) ON DELETE CASCADE,
    record_type TEXT NOT NULL,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dns_records_subdomain_id ON dns_records(subdomain_id);
`,
	},
}

// runMigrations applies pending schema migrations sequentially in transactions.
func runMigrations(db *sql.DB) error {
	// Ensure migration tracking table exists
	_, err := db.Exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMP NOT NULL
);
`)
	if err != nil {
		return fmt.Errorf("failed to initialize schema_migrations table: %w", err)
	}

	for _, m := range migrations {
		var exists bool
		err := db.QueryRow("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?)", m.version).Scan(&exists)
		if err != nil {
			return fmt.Errorf("failed to check migration version %d: %w", m.version, err)
		}

		if exists {
			continue
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to start migration transaction %d: %w", m.version, err)
		}

		if _, err := tx.Exec(m.sql); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed executing migration %d (%s): %w", m.version, m.name, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", m.version, m.name, time.Now().UTC()); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed recording migration %d: %w", m.version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", m.version, err)
		}
	}

	return nil
}
