package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type File struct {
	DatabasePath string       `json:"database_path,omitempty"`
	OTXAPIKey    string       `json:"otx_api_key"`
	VTAPIKey     string       `json:"vt_api_key"`
	ShodanAPIKey string       `json:"shodan_api_key"`
	Server       ServerConfig `json:"server,omitempty"`
	Defaults     Defaults     `json:"defaults"`
}

type ServerConfig struct {
	Host        string   `json:"host,omitempty"`
	Port        int      `json:"port,omitempty"`
	CORSOrigins []string `json:"cors_origins,omitempty"`
}

type Defaults struct {
	Resolve        *bool    `json:"resolve"`
	JSON           *bool    `json:"json"`
	TXT            *bool    `json:"txt"`
	Output         string   `json:"output"`
	Threads        *int     `json:"threads"`
	TimeoutSeconds *int     `json:"timeout_seconds"`
	Retries        *int     `json:"retries"`
	Verbose        *bool    `json:"verbose"`
	IncludeSources []string `json:"include_sources"`
	ExcludeSources []string `json:"exclude_sources"`
}

func Load(path string, explicit bool) (File, string, error) {
	if path == "" {
		defaultPath, err := DefaultPath()
		if err != nil {
			return File{}, "", err
		}
		path = defaultPath
	}

	expandedPath, err := expandPath(path)
	if err != nil {
		return File{}, "", err
	}

	data, err := os.ReadFile(expandedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) && !explicit {
			return File{}, "", nil
		}

		return File{}, "", err
	}

	var file File
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&file); err != nil {
		return File{}, "", err
	}

	return file, expandedPath, nil
}

func DefaultPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	parallaxPath := filepath.Join(configDir, "parallax", "config.json")
	if _, err := os.Stat(parallaxPath); err == nil {
		return parallaxPath, nil
	}

	// Legacy locations, newest first, so an existing install keeps working
	// after the rename without the user moving anything.
	for _, legacy := range []string{"reconlens", "subscan"} {
		legacyPath := filepath.Join(configDir, legacy, "config.json")
		if _, err := os.Stat(legacyPath); err == nil {
			return legacyPath, nil
		}
	}

	return parallaxPath, nil
}

func DefaultDatabasePath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	parallaxPath := filepath.Join(configDir, "parallax", "parallax.db")
	if _, err := os.Stat(parallaxPath); err == nil {
		return parallaxPath, nil
	}

	// Keep using a pre-rename database when one exists, so upgrading does not
	// silently strand an operator's scan history behind the new filename.
	for _, legacy := range [][2]string{{"reconlens", "reconlens.db"}, {"subscan", "subscan.db"}} {
		legacyPath := filepath.Join(configDir, legacy[0], legacy[1])
		if _, err := os.Stat(legacyPath); err == nil {
			return legacyPath, nil
		}
	}

	return parallaxPath, nil
}

func expandPath(path string) (string, error) {
	if path == "" || path[0] != '~' {
		return path, nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}

	if path == "~" {
		return homeDir, nil
	}

	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		return filepath.Join(homeDir, path[2:]), nil
	}

	return path, nil
}
