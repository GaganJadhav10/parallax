package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/GaganJadhav10/parallax/internal/api"
	"github.com/GaganJadhav10/parallax/internal/config"
	"github.com/GaganJadhav10/parallax/internal/engine"
	"github.com/GaganJadhav10/parallax/internal/storage"
)

// RunServe executes the 'serve' subcommand starting the HTTP REST and SSE backend.
func RunServe(args []string, outW io.Writer, errW io.Writer) int {
	configArg, configExplicit, err := discoverConfigPath(args)
	if err != nil {
		fmt.Fprintf(errW, "[!] %v\n", err)
		return 1
	}

	configFile, _, err := config.Load(configArg, configExplicit)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to load config: %v\n", err)
		return 1
	}

	// Environment variable overrides for provider API keys in server mode
	if vt := resolveServerAPIKey([]string{"PARALLAX_VT_API_KEY", "VT_API_KEY"}, configFile.VTAPIKey); vt != "" {
		configFile.VTAPIKey = vt
	}
	if shodan := resolveServerAPIKey([]string{"PARALLAX_SHODAN_API_KEY", "SHODAN_API_KEY"}, configFile.ShodanAPIKey); shodan != "" {
		configFile.ShodanAPIKey = shodan
	}
	if otx := resolveServerAPIKey([]string{"PARALLAX_OTX_API_KEY", "OTX_API_KEY"}, configFile.OTXAPIKey); otx != "" {
		configFile.OTXAPIKey = otx
	}

	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(errW)
	fs.Usage = func() {
		PrintServeHelp(errW)
	}

	var (
		hostFlag          = fs.String("host", "", "bind address (default: 127.0.0.1)")
		portFlag          = fs.Int("port", 0, "listening port (default: 8080)")
		corsFlag          = fs.String("cors-origins", "", "allowed CORS origins (comma-separated)")
		dbFlag            = fs.String("db", "", "path to SQLite database")
		configPathFlag    = fs.String("config", configArg, "path to configuration file")
		maxConcurrentFlag = fs.Int("max-concurrent-scans", 0, "maximum concurrent scans allowed (default: 10)")
	)

	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 1
	}
	_ = configPathFlag

	serverCfg, err := api.ResolveConfig(*hostFlag, *portFlag, *dbFlag, *corsFlag, configFile)
	if err != nil {
		fmt.Fprintf(errW, "[!] Configuration error: %v\n", err)
		return 1
	}
	if *maxConcurrentFlag > 0 {
		serverCfg.MaxConcurrentScans = *maxConcurrentFlag
	}

	store, err := storage.NewSQLiteStorage(serverCfg.DatabasePath)
	if err != nil {
		fmt.Fprintf(errW, "[!] Failed to open database at %s: %v\n", serverCfg.DatabasePath, err)
		return 1
	}
	defer store.Close()

	eng := engine.NewEngine()
	srv := api.NewServer(serverCfg, eng, store, configFile)

	fmt.Fprintln(outW, "Parallax Server")
	fmt.Fprintln(outW, "Open-Source Signals Intelligence for External Attack Surfaces")
	fmt.Fprintln(outW)
	fmt.Fprintln(outW, "Listening on:")
	fmt.Fprintf(outW, "http://%s\n", srv.Addr())

	// Handle graceful shutdown on interruption signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- srv.Start()
	}()

	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			fmt.Fprintf(errW, "[!] Server error: %v\n", err)
			return 1
		}
		return 0

	case sig := <-sigChan:
		fmt.Fprintf(outW, "\n[+] Received signal %s, shutting down gracefully...\n", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			fmt.Fprintf(errW, "[!] Shutdown error: %v\n", err)
			return 1
		}
		return 0
	}
}

// PrintServeHelp outputs usage and configuration instructions for the serve command.
func PrintServeHelp(w io.Writer) {
	fmt.Fprintln(w, "Usage: parallax serve [options]")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Start the Parallax HTTP REST API and Server-Sent Events backend server.")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Options:")
	fmt.Fprintln(w, "  --host string                 Network bind address (default: 127.0.0.1)")
	fmt.Fprintln(w, "  --port int                    Network listening port (default: 8080)")
	fmt.Fprintln(w, "  --cors-origins string         Comma-separated allowed CORS origins")
	fmt.Fprintln(w, "  --db path                     Path to SQLite database file")
	fmt.Fprintln(w, "  --config path                 Path to custom JSON configuration file")
	fmt.Fprintln(w, "  --max-concurrent-scans int    Maximum concurrent scans allowed (default: 10)")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Environment Variables:")
	fmt.Fprintln(w, "  PARALLAX_HOST                Default bind address")
	fmt.Fprintln(w, "  PARALLAX_PORT                Default listening port")
	fmt.Fprintln(w, "  PARALLAX_CORS_ORIGINS        Allowed CORS origins")
	fmt.Fprintln(w, "  PARALLAX_DB                  Path to SQLite database")
	fmt.Fprintln(w, "  PARALLAX_MAX_CONCURRENT_SCANS Maximum concurrent active scans")
	fmt.Fprintln(w, "  VT_API_KEY / PARALLAX_VT_API_KEY VirusTotal API Key")
	fmt.Fprintln(w, "  SHODAN_API_KEY / PARALLAX_SHODAN_API_KEY Shodan API Key")
	fmt.Fprintln(w, "  OTX_API_KEY / PARALLAX_OTX_API_KEY AlienVault OTX API Key")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Examples:")
	fmt.Fprintln(w, "  parallax serve")
	fmt.Fprintln(w, "  parallax serve --host 127.0.0.1 --port 8080")
	fmt.Fprintln(w, "  parallax serve --host 0.0.0.0 --port 8080 --cors-origins https://parallax.netlify.app")
}

func resolveServerAPIKey(names []string, configValue string) string {
	for _, name := range names {
		if val := strings.TrimSpace(os.Getenv(name)); val != "" {
			return val
		}
	}
	return strings.TrimSpace(configValue)
}
