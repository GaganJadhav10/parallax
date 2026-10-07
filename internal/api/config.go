package api

import (
	"os"
	"strconv"
	"strings"

	"github.com/lumiaurora/subscan/internal/config"
	"github.com/lumiaurora/subscan/internal/storage"
)

// Config represents runtime configuration settings for the ReconLens HTTP API server.
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
		Host:               "127.0.0.1",
		Port:               8080,
		CORSOrigins:        []string{},
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
	if envHost := strings.TrimSpace(os.Getenv("RECONLENS_HOST")); envHost != "" {
		cfg.Host = envHost
	}
	if envPort := strings.TrimSpace(os.Getenv("RECONLENS_PORT")); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil && p > 0 && p <= 65535 {
			cfg.Port = p
		}
	}
	if envCORS := strings.TrimSpace(os.Getenv("RECONLENS_CORS_ORIGINS")); envCORS != "" {
		cfg.CORSOrigins = parseCSV(envCORS)
	}
	if envMax := strings.TrimSpace(os.Getenv("RECONLENS_MAX_CONCURRENT_SCANS")); envMax != "" {
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
