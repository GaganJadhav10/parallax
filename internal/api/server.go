package api

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/lumiaurora/subscan/internal/config"
	"github.com/lumiaurora/subscan/internal/storage"
)

// Server coordinates the ReconLens HTTP REST API and Server-Sent Events engine.
type Server struct {
	config     Config
	manager    *ScanManager
	storage    storage.Storage
	httpServer *http.Server
}

// NewServer constructs an API server instance bound to the provided engine and storage.
func NewServer(cfg Config, eng ScannerEngine, store storage.Storage, cfgFile config.File) *Server {
	return &Server{
		config:  cfg,
		manager: NewScanManager(eng, store, cfgFile, cfg.MaxConcurrentScans),
		storage: store,
	}
}

// Routes constructs and returns the HTTP routing handler configured with CORS and security headers.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/sources", s.handleSources)
	mux.HandleFunc("POST /api/scans", s.handleCreateScan)
	mux.HandleFunc("GET /api/scans", s.handleListScans)
	mux.HandleFunc("GET /api/scans/compare", s.handleCompareScans)
	mux.HandleFunc("GET /api/scans/{id}", s.handleGetScanStatus)
	mux.HandleFunc("GET /api/scans/{id}/results", s.handleGetScanResults)
	mux.HandleFunc("GET /api/scans/{id}/events", s.handleScanEvents)
	mux.HandleFunc("GET /api/scans/{id}/report", s.handleScanReport)
	mux.HandleFunc("DELETE /api/scans/{id}", s.handleDeleteScan)

	var handler http.Handler = mux
	handler = SecurityHeadersMiddleware(handler)
	handler = CORSMiddleware(s.config.CORSOrigins)(handler)

	return handler
}

// Addr returns the configured host:port network address.
func (s *Server) Addr() string {
	return fmt.Sprintf("%s:%d", s.config.Host, s.config.Port)
}

// Start launches the HTTP server listening on the configured address.
func (s *Server) Start() error {
	s.httpServer = &http.Server{
		Addr:              s.Addr(),
		Handler:           s.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	return s.httpServer.ListenAndServe()
}

// Shutdown gracefully stops the running HTTP server.
func (s *Server) Shutdown(ctx context.Context) error {
	if s.httpServer != nil {
		return s.httpServer.Shutdown(ctx)
	}
	return nil
}
