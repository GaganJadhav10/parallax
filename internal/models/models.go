package models

import "time"

// ScanStatus represents the lifecycle state of a reconnaissance investigation.
type ScanStatus string

const (
	StatusPending   ScanStatus = "pending"
	StatusRunning   ScanStatus = "running"
	StatusCompleted ScanStatus = "completed"
	StatusFailed    ScanStatus = "failed"
)

// Report represents a structured reconnaissance report for a single target domain.
type Report struct {
	ID              string      `json:"id,omitempty"`
	Domain          string      `json:"domain"`
	Timestamp       time.Time   `json:"timestamp"`
	TotalFound      int         `json:"total_found"`
	ResolvedEnabled bool        `json:"resolved_enabled"`
	Metadata        RunMetadata `json:"metadata"`
	Subdomains      []Subdomain `json:"subdomains"`
}

// BatchReport represents a multi-target reconnaissance report.
type BatchReport struct {
	Timestamp       time.Time       `json:"timestamp"`
	TotalTargets    int             `json:"total_targets"`
	ResolvedEnabled bool            `json:"resolved_enabled"`
	Metadata        BatchMetadata   `json:"metadata"`
	Results         []Report        `json:"results"`
	FailedTargets   []TargetFailure `json:"failed_targets,omitempty"`
}

// BatchMetadata holds timing and summary metrics for a batch scan.
type BatchMetadata struct {
	StartedAt         time.Time `json:"started_at"`
	CompletedAt       time.Time `json:"completed_at"`
	DurationMS        int64     `json:"duration_ms"`
	SuccessfulTargets int       `json:"successful_targets"`
	FailedTargets     int       `json:"failed_targets"`
}

// TargetFailure records an invalid or unresolvable target domain in batch operations.
type TargetFailure struct {
	Domain string `json:"domain"`
	Error  string `json:"error"`
}

// RunMetadata contains execution telemetry, timings, and provider health states.
type RunMetadata struct {
	StartedAt        time.Time         `json:"started_at"`
	CompletedAt      time.Time         `json:"completed_at"`
	DurationMS       int64             `json:"duration_ms"`
	RawResults       int               `json:"raw_results"`
	UniqueSubdomains int               `json:"unique_subdomains"`
	FinalSubdomains  int               `json:"final_subdomains"`
	WildcardFiltered int               `json:"wildcard_filtered,omitempty"`
	EnabledSources   []SourceReference `json:"enabled_sources"`
	FailedSources    []FailedSource    `json:"failed_sources,omitempty"`
	SourceTimings    []SourceTiming    `json:"source_timings"`
}

// SourceReference identifies an active passive intelligence provider.
type SourceReference struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// FailedSource captures provider errors with health categorization.
type FailedSource struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Health     string `json:"health"`
	Error      string `json:"error"`
	DurationMS int64  `json:"duration_ms"`
}

// SourceTiming records candidate yield and latency for a single provider.
type SourceTiming struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	Candidates int    `json:"candidates"`
	DurationMS int64  `json:"duration_ms"`
}

// Subdomain holds discovered hostname details, attribution sources, and DNS records.
type Subdomain struct {
	Name    string   `json:"name"`
	Sources []string `json:"sources"`
	IPs     []string `json:"ips,omitempty"`
	CNAMEs  []string `json:"cnames,omitempty"`
}

// SubdomainRecord is an extended domain model for persistent storage and UI display.
type SubdomainRecord struct {
	ID           string    `json:"id,omitempty"`
	ScanID       string    `json:"scan_id,omitempty"`
	Domain       string    `json:"domain"`
	Name         string    `json:"name"`
	Sources      []string  `json:"sources"`
	IsLive       bool      `json:"is_live"`
	IPAddresses  []string  `json:"ip_addresses,omitempty"`
	CNAMEs       []string  `json:"cnames,omitempty"`
	DiscoveredAt time.Time `json:"discovered_at"`
}

// ScanRecord represents an index entry for historical scan listings.
type ScanRecord struct {
	ID               string     `json:"id"`
	Target           string     `json:"target"`
	Status           ScanStatus `json:"status"`
	ResolvedEnabled  bool       `json:"resolved_enabled"`
	StartedAt        time.Time  `json:"started_at"`
	CompletedAt      time.Time  `json:"completed_at"`
	DurationMS       int64      `json:"duration_ms"`
	RawResults       int        `json:"raw_results"`
	UniqueSubdomains int        `json:"unique_subdomains"`
	FinalSubdomains  int        `json:"final_subdomains"`
	WildcardFiltered int        `json:"wildcard_filtered"`
}

// ScanFilter specifies filtering criteria for historical scan queries.
type ScanFilter struct {
	Target string
	Limit  int
}

// ScanComparison represents the structural diff between two historical scans of the same target.
type ScanComparison struct {
	Target        string           `json:"target"`
	OlderScanID   string           `json:"older_scan_id"`
	OlderScanDate time.Time        `json:"older_scan_date"`
	NewerScanID   string           `json:"newer_scan_id"`
	NewerScanDate time.Time        `json:"newer_scan_date"`
	Added         []string         `json:"added"`
	Removed       []string         `json:"removed"`
	Common        []string         `json:"common"`
	Counts        ComparisonCounts `json:"counts"`
}

// ComparisonCounts summarizes change metrics for scan comparisons.
type ComparisonCounts struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
	Common  int `json:"common"`
}
