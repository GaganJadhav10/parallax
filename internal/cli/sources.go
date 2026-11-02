package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/engine"
	"github.com/GaganJadhav10/parallax/internal/sources"
)

type SourceCatalogItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"` // "passive" or "api"
	Status      string `json:"status"`
	AuthReq     bool   `json:"auth_required"`
	Description string `json:"description"`
}

// RunSources handles the 'sources' command.
func RunSources(args []string, w io.Writer, errW io.Writer) int {
	jsonOutput := false
	configPath := ""

	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch {
		case arg == "--help" || arg == "-h":
			PrintSourcesHelp(w)
			return 0
		case arg == "--json":
			jsonOutput = true
		case arg == "--config":
			if i+1 < len(args) {
				configPath = args[i+1]
				i++
			}
		case strings.HasPrefix(arg, "--config="):
			configPath = strings.TrimPrefix(arg, "--config=")
		}
	}

	configFile, _, err := config.Load(configPath, configPath != "")
	if err != nil && configPath != "" {
		fmt.Fprintf(errW, "[!] Failed to load configuration file: %v\n", err)
		return 1
	}

	sources.Configure(sources.Options{
		OTXAPIKey:    resolveAPIKey("OTX_API_KEY", configFile.OTXAPIKey),
		VTAPIKey:     resolveAPIKey("VT_API_KEY", configFile.VTAPIKey),
		ShodanAPIKey: resolveAPIKey("SHODAN_API_KEY", configFile.ShodanAPIKey),
	})

	registry := engine.DefaultRegistry()
	items := make([]SourceCatalogItem, 0, len(registry))

	for _, s := range registry {
		isAuth := s.EnableHint != ""
		stype := "passive"
		if isAuth {
			stype = "api"
		}

		status := "enabled"
		if !engine.SourceIsEnabled(s) {
			status = "disabled"
		}

		desc := s.Name
		switch s.ID {
		case "crtsh":
			desc = "Certificate Transparency"
		case "otx":
			desc = "AlienVault OTX Passive DNS"
		case "bufferover":
			desc = "BufferOver Dataset"
		case "certspotter":
			desc = "SSLMate Cert Spotter"
		case "hackertarget":
			desc = "HackerTarget Host Search"
		case "anubis":
			desc = "Anubis Subdomain DB"
		case "urlscan":
			desc = "urlscan.io Web Index"
		case "rapiddns":
			desc = "RapidDNS Historical DNS"
		case "virustotal":
			desc = "VirusTotal Domain Intel"
		case "shodan":
			desc = "Shodan DNS Intelligence"
		}

		items = append(items, SourceCatalogItem{
			ID:          s.ID,
			Name:        s.Name,
			Type:        stype,
			Status:      status,
			AuthReq:     isAuth,
			Description: desc,
		})
	}

	if jsonOutput {
		enc := json.NewEncoder(w)
		enc.SetIndent("", "  ")
		if err := enc.Encode(items); err != nil {
			fmt.Fprintf(errW, "[!] Failed to encode JSON sources: %v\n", err)
			return 1
		}
		return 0
	}

	fmt.Fprintln(w, "Parallax Sources")
	fmt.Fprintln(w, "Open-Source Signals Intelligence for External Attack Surfaces")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "PASSIVE SOURCES")
	fmt.Fprintf(w, "%-15s %-30s %-12s\n", "ID", "PROVIDER", "STATUS")
	fmt.Fprintf(w, "%-15s %-30s %-12s\n", "──", "────────", "──────")

	for _, item := range items {
		if item.Type == "passive" {
			fmt.Fprintf(w, "%-15s %-30s %-12s\n", item.ID, item.Description, item.Status)
		}
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "OPTIONAL API SOURCES")
	fmt.Fprintf(w, "%-15s %-30s %-12s %-25s\n", "ID", "PROVIDER", "STATUS", "REQUIREMENT")
	fmt.Fprintf(w, "%-15s %-30s %-12s %-25s\n", "──", "────────", "──────", "───────────")

	for _, item := range items {
		if item.Type == "api" {
			req := "requires API key"
			if item.ID == "virustotal" {
				req = "set VT_API_KEY"
			} else if item.ID == "shodan" {
				req = "set SHODAN_API_KEY"
			}
			fmt.Fprintf(w, "%-15s %-30s %-12s %-25s\n", item.ID, item.Description, item.Status, req)
		}
	}

	return 0
}
