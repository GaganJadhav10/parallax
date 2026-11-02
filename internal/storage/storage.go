package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/models"
)

var (
	// ErrNotFound is returned when a requested scan ID does not exist.
	ErrNotFound     = errors.New("scan not found")
	ErrScanNotFound = ErrNotFound
)

// Storage defines the contract for persistent scan history and intelligence retrieval.
type Storage interface {
	SaveScan(ctx context.Context, report models.Report) (string, error)
	GetScan(ctx context.Context, id string) (*models.Report, *models.ScanRecord, error)
	ListScans(ctx context.Context, filter models.ScanFilter) ([]models.ScanRecord, error)
	DeleteScan(ctx context.Context, id string) error
	Close() error
}

// Open creates and connects to the Parallax SQLite database at the specified path,
// creating parent directories and applying schema migrations automatically.
func Open(dbPath string) (*SQLiteStorage, error) {
	return NewSQLiteStorage(dbPath)
}

// ResolveDatabasePath determines the active database path based on CLI flag, environment variable,
// configuration file, or system default directory.
func ResolveDatabasePath(cliPath string, configDBPath string) (string, error) {
	if strings.TrimSpace(cliPath) != "" {
		return filepath.Clean(cliPath), nil
	}

	if envPath := firstEnvPath("PARALLAX_DB", "RECONLENS_DB"); envPath != "" {
		return filepath.Clean(envPath), nil
	}

	if strings.TrimSpace(configDBPath) != "" {
		return filepath.Clean(configDBPath), nil
	}

	defaultPath, err := config.DefaultDatabasePath()
	if err != nil {
		return "", err
	}

	return filepath.Clean(defaultPath), nil
}

// firstEnvPath returns the first non-empty value among the given variable
// names. RECONLENS_DB is the pre-rename spelling, honoured so existing
// deployments keep pointing at their database after upgrading.
func firstEnvPath(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}
