package api

import (
	"os"
	"strconv"
	"strings"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

// Config represents runtime configuration settings for the Parallax HTTP API server.
type Config struct {
	Host               string
	Port               int
	DatabasePath       string
	CORSOrigins        []string
	MaxConcurrentScans int
}

// DefaultConfig provides standard local-only defaults for the API server.
func DefaultConfig() Config {
	return Config{
		Host: "127.0.0.1",
		Port: 8080,
		CORSOrigins: []string{
			"http://127.0.0.1:3000",
			"http://127.0.0.1:3001",
			"http://localhost:3000",
			"http://localhost:3001",
			"http://127.0.0.1:5173",
			"http://localhost:5173",
		},
		MaxConcurrentScans: 10,
	}
}

// ResolveConfig reconciles server settings from defaults, configuration files,
// environment variables, and explicit command-line flags.
func ResolveConfig(cliHost string, cliPort int, cliDB string, cliCORS string, cfgFile config.File) (Config, error) {
	cfg := DefaultConfig()

	// 1. Config file values
	if strings.TrimSpace(cfgFile.Server.Host) != "" {
		cfg.Host = strings.TrimSpace(cfgFile.Server.Host)
	}
	if cfgFile.Server.Port > 0 {
		cfg.Port = cfgFile.Server.Port
	}
	if len(cfgFile.Server.CORSOrigins) > 0 {
		cfg.CORSOrigins = append([]string(nil), cfgFile.Server.CORSOrigins...)
	}

	// 2. Environment variables
	if envHost := firstEnv("PARALLAX_HOST", "RECONLENS_HOST"); envHost != "" {
		cfg.Host = envHost
	}
	// PORT is the convention used by container platforms (Render, Railway,
	// Cloud Run, Koyeb, Heroku); an explicit PARALLAX_PORT still wins.
	for _, key := range []string{"PORT", "RECONLENS_PORT", "PARALLAX_PORT"} {
		if envPort := strings.TrimSpace(os.Getenv(key)); envPort != "" {
			if p, err := strconv.Atoi(envPort); err == nil && p > 0 && p <= 65535 {
				cfg.Port = p
			}
		}
	}
	if envCORS := firstEnv("PARALLAX_CORS_ORIGINS", "RECONLENS_CORS_ORIGINS"); envCORS != "" {
		cfg.CORSOrigins = parseCSV(envCORS)
	}
	if envMax := firstEnv("PARALLAX_MAX_CONCURRENT_SCANS", "RECONLENS_MAX_CONCURRENT_SCANS"); envMax != "" {
		if m, err := strconv.Atoi(envMax); err == nil && m >= 0 {
			cfg.MaxConcurrentScans = m
		}
	}

	// 3. Command-line overrides
	if strings.TrimSpace(cliHost) != "" {
		cfg.Host = strings.TrimSpace(cliHost)
	}
	if cliPort > 0 && cliPort <= 65535 {
		cfg.Port = cliPort
	}
	if strings.TrimSpace(cliCORS) != "" {
		cfg.CORSOrigins = parseCSV(cliCORS)
	}

	// Resolve database path
	dbPath, err := storage.ResolveDatabasePath(cliDB, cfgFile.DatabasePath)
	if err != nil {
		return cfg, err
	}
	cfg.DatabasePath = dbPath

	return cfg, nil
}

func parseCSV(val string) []string {
	parts := strings.Split(val, ",")
	var result []string
	for _, p := range parts {
		trimmed := strings.TrimSpace(p)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

// firstEnv returns the first non-empty value among the given variable names.
// The RECONLENS_* spellings are the pre-rename names, kept so existing
// deployments keep working after upgrading.
func firstEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}
