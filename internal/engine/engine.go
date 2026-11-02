package engine

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/GaganJadhav10/parallax/internal/models"
	"github.com/GaganJadhav10/parallax/internal/resolver"
	"github.com/GaganJadhav10/parallax/internal/sources"
	"github.com/GaganJadhav10/parallax/internal/utils"
)

const (
	DefaultThreads = 20
	DefaultRetries = 2
	DefaultTimeout = 30 * time.Second
)

// SourceDefinition specifies an intelligence provider's identity and retrieval function.
type SourceDefinition struct {
	ID         string
	Name       string
	Aliases    []string
	Fetch      func(string) ([]string, error)
	Enabled    func() bool
	EnableHint string
}

// SourceResult contains the raw candidates and execution metadata for a provider query.
type SourceResult struct {
	Index    int
	Source   SourceDefinition
	Entries  []string
	Err      error
	Duration time.Duration
}

// ScanOptions configures runtime parameters for a reconnaissance run.
type ScanOptions struct {
	Resolve        bool
	Threads        int
	Timeout        time.Duration
	Retries        int
	Verbose        bool
	IncludeSources []string
	ExcludeSources []string
	OTXAPIKey      string
	VTAPIKey       string
	ShodanAPIKey   string
}

// EventHandler receives real-time lifecycle and telemetry events during scanning.
type EventHandler func(models.Event)

// Engine is the central reconnaissance orchestrator for Parallax.
type Engine struct {
	Registry []SourceDefinition
}

// DefaultRegistry returns the built-in catalog of 10 passive OSINT providers.
func DefaultRegistry() []SourceDefinition {
	return []SourceDefinition{
		{ID: "crtsh", Name: "crt.sh", Aliases: []string{"crt.sh", "crtsh"}, Fetch: sources.FetchCRTSh},
		{ID: "otx", Name: "AlienVault OTX", Aliases: []string{"otx", "alienvault", "alienvault-otx"}, Fetch: sources.FetchOTX},
		{ID: "bufferover", Name: "BufferOver", Aliases: []string{"bufferover", "buffer-over"}, Fetch: sources.FetchBufferOver},
		{ID: "certspotter", Name: "Cert Spotter", Aliases: []string{"certspotter", "cert-spotter"}, Fetch: sources.FetchCertSpotter},
		{ID: "hackertarget", Name: "HackerTarget", Aliases: []string{"hackertarget", "hacker-target"}, Fetch: sources.FetchHackerTarget},
		{ID: "anubis", Name: "Anubis", Aliases: []string{"anubis"}, Fetch: sources.FetchAnubis},
		{ID: "urlscan", Name: "urlscan", Aliases: []string{"urlscan", "urlscan.io"}, Fetch: sources.FetchURLScan},
		{ID: "rapiddns", Name: "RapidDNS", Aliases: []string{"rapiddns", "rapid-dns"}, Fetch: sources.FetchRapidDNS},
		{ID: "virustotal", Name: "VirusTotal", Aliases: []string{"virustotal", "vt"}, Fetch: sources.FetchVirusTotal, Enabled: sources.VirusTotalEnabled, EnableHint: "set VT_API_KEY or add vt_api_key to the config file"},
		{ID: "shodan", Name: "Shodan", Aliases: []string{"shodan"}, Fetch: sources.FetchShodan, Enabled: sources.ShodanEnabled, EnableHint: "set SHODAN_API_KEY or add shodan_api_key to the config file"},
	}
}

// NewEngine constructs a reconnaissance engine initialized with the default provider registry.
func NewEngine() *Engine {
	return &Engine{
		Registry: DefaultRegistry(),
	}
}

// NewEngineWithRegistry constructs an engine with a custom provider registry.
func NewEngineWithRegistry(registry []SourceDefinition) *Engine {
	return &Engine{
		Registry: registry,
	}
}

// SelectSources filters the engine's registry based on include and exclude criteria.
func (e *Engine) SelectSources(include []string, exclude []string) ([]SourceDefinition, error) {
	return SelectSources(e.Registry, include, exclude)
}

// ScanTarget executes passive reconnaissance against a single target domain.
func (e *Engine) ScanTarget(ctx context.Context, target string, opts ScanOptions, handler EventHandler) (models.Report, []string, error) {
	normalized := utils.NormalizeTargetDomain(target)
	if !utils.IsValidDomain(normalized) {
		return models.Report{}, nil, fmt.Errorf("invalid target domain: %q", target)
	}

	var handlerMu sync.Mutex
	emit := func(ev models.Event) {
		if handler == nil {
			return
		}
		handlerMu.Lock()
		defer handlerMu.Unlock()
		handler(ev)
	}

	runStartedAt := time.Now().UTC()
	emit(models.Event{
		Type:      models.EventScanStarted,
		Target:    normalized,
		Timestamp: runStartedAt,
	})

	threads := opts.Threads
	if threads <= 0 {
		threads = DefaultThreads
	}
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	retries := opts.Retries
	if retries < 0 {
		retries = DefaultRetries
	}

	sources.Configure(sources.Options{
		Timeout:      timeout,
		Retries:      retries,
		Verbose:      opts.Verbose,
		OTXAPIKey:    opts.OTXAPIKey,
		VTAPIKey:     opts.VTAPIKey,
		ShodanAPIKey: opts.ShodanAPIKey,
	})

	selectedSources, err := e.SelectSources(opts.IncludeSources, opts.ExcludeSources)
	if err != nil {
		emit(models.Event{
			Type:      models.EventScanFailed,
			Target:    normalized,
			Error:     err.Error(),
			Timestamp: time.Now().UTC(),
		})
		return models.Report{}, nil, err
	}

	sourceResults, hadSuccess := e.QuerySources(ctx, normalized, selectedSources, threads, emit)
	if !hadSuccess {
		err := fmt.Errorf("target %s failed: all passive sources failed", normalized)
		emit(models.Event{
			Type:      models.EventScanFailed,
			Target:    normalized,
			Error:     err.Error(),
			Timestamp: time.Now().UTC(),
		})
		return models.Report{}, nil, err
	}

	rawResults, unique, attribution := AggregateSourceEntries(normalized, sourceResults)
	emit(models.Event{
		Type:        models.EventCandidatesFound,
		Target:      normalized,
		RawCount:    rawResults,
		UniqueCount: len(unique),
		Timestamp:   time.Now().UTC(),
	})

	finalResults := unique
	resolveResult := resolver.Result{}
	if opts.Resolve {
		emit(models.Event{
			Type:      models.EventDNSStarted,
			Target:    normalized,
			Timestamp: time.Now().UTC(),
		})

		resolveResult = resolver.ResolveSubdomains(unique, resolver.Options{
			Workers:       threads,
			LookupTimeout: timeout,
			TargetDomain:  normalized,
		})
		finalResults = resolveResult.Live

		emit(models.Event{
			Type:          models.EventDNSCompleted,
			Target:        normalized,
			LiveCount:     len(finalResults),
			WildcardCount: resolveResult.WildcardFiltered,
			Timestamp:     time.Now().UTC(),
		})
	}

	completedAt := time.Now().UTC()
	reportSubdomains := BuildReportSubdomains(finalResults, attribution, resolveResult.Details)
	report := models.Report{
		Domain:          normalized,
		Timestamp:       completedAt,
		TotalFound:      len(reportSubdomains),
		ResolvedEnabled: opts.Resolve,
		Metadata:        BuildRunMetadata(selectedSources, sourceResults, runStartedAt, completedAt, rawResults, len(unique), len(finalResults), resolveResult.WildcardFiltered),
		Subdomains:      reportSubdomains,
	}

	emit(models.Event{
		Type:          models.EventScanCompleted,
		Target:        normalized,
		Duration:      completedAt.Sub(runStartedAt),
		DurationMS:    completedAt.Sub(runStartedAt).Milliseconds(),
		RawCount:      rawResults,
		UniqueCount:   len(unique),
		LiveCount:     len(finalResults),
		WildcardCount: resolveResult.WildcardFiltered,
		Timestamp:     completedAt,
	})

	return report, finalResults, nil
}

// QuerySources dispatches queries concurrently to passive providers using a worker pool.
func (e *Engine) QuerySources(ctx context.Context, domain string, sourceList []SourceDefinition, threads int, handler EventHandler) ([]SourceResult, bool) {
	if threads <= 0 {
		threads = DefaultThreads
	}

	results := make(chan SourceResult, len(sourceList))
	sem := make(chan struct{}, threads)
	var wg sync.WaitGroup

	for index, source := range sourceList {
		if handler != nil {
			handler(models.Event{
				Type:       models.EventProviderStarted,
				Target:     domain,
				SourceID:   source.ID,
				SourceName: source.Name,
				Timestamp:  time.Now().UTC(),
			})
		}

		wg.Add(1)
		go func(index int, source SourceDefinition) {
			defer wg.Done()

			sem <- struct{}{}
			defer func() { <-sem }()

			startedAt := time.Now()
			entries, err := source.Fetch(domain)
			duration := time.Since(startedAt)

			results <- SourceResult{
				Index:    index,
				Source:   source,
				Entries:  entries,
				Err:      err,
				Duration: duration,
			}
		}(index, source)
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	completedResults := make([]SourceResult, 0, len(sourceList))
	hadSuccess := false

	for result := range results {
		completedResults = append(completedResults, result)

		if result.Err != nil {
			health := string(sources.ErrorHealth(result.Err))
			message := sources.ErrorMessage(result.Err)
			if handler != nil {
				handler(models.Event{
					Type:       models.EventProviderFailed,
					Target:     domain,
					SourceID:   result.Source.ID,
					SourceName: result.Source.Name,
					Duration:   result.Duration,
					DurationMS: result.Duration.Milliseconds(),
					Health:     health,
					Error:      message,
					Timestamp:  time.Now().UTC(),
				})
			}
			continue
		}

		hadSuccess = true
		if handler != nil {
			handler(models.Event{
				Type:       models.EventProviderCompleted,
				Target:     domain,
				SourceID:   result.Source.ID,
				SourceName: result.Source.Name,
				Candidates: len(result.Entries),
				Duration:   result.Duration,
				DurationMS: result.Duration.Milliseconds(),
				Health:     string(sources.HealthEnabled),
				Timestamp:  time.Now().UTC(),
			})
		}
	}

	sort.Slice(completedResults, func(i int, j int) bool {
		return completedResults[i].Index < completedResults[j].Index
	})

	return completedResults, hadSuccess
}

// SelectSources filters the registry based on user include/exclude criteria.
func SelectSources(registry []SourceDefinition, include []string, exclude []string) ([]SourceDefinition, error) {
	aliasMap := BuildSourceAliasMap(registry)

	selected := make([]SourceDefinition, 0, len(registry))
	selectedIDs := make(map[string]struct{}, len(registry))

	if len(include) == 0 {
		for _, source := range registry {
			if SourceIsEnabled(source) {
				selected = append(selected, source)
				selectedIDs[source.ID] = struct{}{}
			}
		}
	} else {
		for _, name := range include {
			source, ok := aliasMap[name]
			if !ok {
				return nil, fmt.Errorf("unknown source %q", name)
			}

			if !SourceIsEnabled(source) {
				return nil, fmt.Errorf("source %q is not available: %s", source.Name, source.EnableHint)
			}

			if _, ok := selectedIDs[source.ID]; ok {
				continue
			}

			selected = append(selected, source)
			selectedIDs[source.ID] = struct{}{}
		}
	}

	if len(exclude) == 0 {
		if len(selected) == 0 {
			return nil, errors.New("no sources are enabled")
		}
		return selected, nil
	}

	excludedIDs := make(map[string]struct{}, len(exclude))
	for _, name := range exclude {
		source, ok := aliasMap[name]
		if !ok {
			return nil, fmt.Errorf("unknown source %q", name)
		}
		excludedIDs[source.ID] = struct{}{}
	}

	filtered := make([]SourceDefinition, 0, len(selected))
	for _, source := range selected {
		if _, ok := excludedIDs[source.ID]; ok {
			continue
		}
		filtered = append(filtered, source)
	}

	if len(filtered) == 0 {
		return nil, errors.New("no sources selected after applying include/exclude filters")
	}

	return filtered, nil
}

// BuildSourceAliasMap generates a lookup table mapping IDs and aliases to source definitions.
func BuildSourceAliasMap(registry []SourceDefinition) map[string]SourceDefinition {
	aliasMap := make(map[string]SourceDefinition, len(registry)*3)
	for _, source := range registry {
		aliasMap[source.ID] = source
		for _, alias := range source.Aliases {
			aliasMap[alias] = source
		}
	}
	return aliasMap
}

// AggregateSourceEntries cleans, deduplicates, and tracks attribution for provider results.
func AggregateSourceEntries(domain string, sourceResults []SourceResult) (int, []string, map[string][]string) {
	rawResults := 0
	attributionSets := make(map[string]map[string]struct{})

	for _, result := range sourceResults {
		if result.Err != nil {
			continue
		}

		rawResults += len(result.Entries)
		cleaned := utils.Deduplicate(utils.FilterSubdomains(utils.NormalizeEntries(result.Entries), domain))
		for _, entry := range cleaned {
			if _, ok := attributionSets[entry]; !ok {
				attributionSets[entry] = make(map[string]struct{})
			}
			attributionSets[entry][result.Source.Name] = struct{}{}
		}
	}

	unique := make([]string, 0, len(attributionSets))
	attribution := make(map[string][]string, len(attributionSets))
	for subdomain, sourceSet := range attributionSets {
		unique = append(unique, subdomain)

		sourcesForSubdomain := make([]string, 0, len(sourceSet))
		for sourceName := range sourceSet {
			sourcesForSubdomain = append(sourcesForSubdomain, sourceName)
		}

		sort.Strings(sourcesForSubdomain)
		attribution[subdomain] = sourcesForSubdomain
	}

	sort.Strings(unique)
	return rawResults, unique, attribution
}

// BuildReportSubdomains builds report subdomain structures with attribution and DNS details.
func BuildReportSubdomains(subdomains []string, attribution map[string][]string, details map[string]resolver.Resolution) []models.Subdomain {
	reportSubdomains := make([]models.Subdomain, 0, len(subdomains))
	for _, subdomain := range subdomains {
		entry := models.Subdomain{
			Name:    subdomain,
			Sources: attribution[subdomain],
		}

		if detail, ok := details[subdomain]; ok {
			entry.IPs = detail.IPs
			entry.CNAMEs = detail.CNAMEs
		}

		reportSubdomains = append(reportSubdomains, entry)
	}

	return reportSubdomains
}

// BuildRunMetadata compiles execution telemetry, provider health states, and timings.
func BuildRunMetadata(selectedSources []SourceDefinition, sourceResults []SourceResult, startedAt time.Time, completedAt time.Time, rawResults int, uniqueCount int, finalCount int, wildcardFiltered int) models.RunMetadata {
	enabledSources := make([]models.SourceReference, 0, len(selectedSources))
	for _, source := range selectedSources {
		enabledSources = append(enabledSources, models.SourceReference{ID: source.ID, Name: source.Name})
	}

	failedSources := make([]models.FailedSource, 0)
	timings := make([]models.SourceTiming, 0, len(sourceResults))
	for _, result := range sourceResults {
		status := "success"
		if result.Err != nil {
			status = string(sources.ErrorHealth(result.Err))
			failedSources = append(failedSources, models.FailedSource{
				ID:         result.Source.ID,
				Name:       result.Source.Name,
				Health:     status,
				Error:      sources.ErrorMessage(result.Err),
				DurationMS: result.Duration.Milliseconds(),
			})
		}

		timings = append(timings, models.SourceTiming{
			ID:         result.Source.ID,
			Name:       result.Source.Name,
			Status:     status,
			Candidates: len(result.Entries),
			DurationMS: result.Duration.Milliseconds(),
		})
	}

	return models.RunMetadata{
		StartedAt:        startedAt,
		CompletedAt:      completedAt,
		DurationMS:       completedAt.Sub(startedAt).Milliseconds(),
		RawResults:       rawResults,
		UniqueSubdomains: uniqueCount,
		FinalSubdomains:  finalCount,
		WildcardFiltered: wildcardFiltered,
		EnabledSources:   enabledSources,
		FailedSources:    failedSources,
		SourceTimings:    timings,
	}
}

// BuildBatchReport wraps multiple target reports into a batch report structure.
func BuildBatchReport(results []models.Report, failedTargets []models.TargetFailure, resolvedEnabled bool, startedAt time.Time, completedAt time.Time) models.BatchReport {
	return models.BatchReport{
		Timestamp:       completedAt,
		TotalTargets:    len(results) + len(failedTargets),
		ResolvedEnabled: resolvedEnabled,
		Metadata: models.BatchMetadata{
			StartedAt:         startedAt,
			CompletedAt:       completedAt,
			DurationMS:        completedAt.Sub(startedAt).Milliseconds(),
			SuccessfulTargets: len(results),
			FailedTargets:     len(failedTargets),
		},
		Results:       results,
		FailedTargets: failedTargets,
	}
}

// PrepareTargets normalizes and validates target domain inputs, filtering out invalid targets.
func PrepareTargets(targetInputs []string) ([]string, []models.TargetFailure) {
	targets := make([]string, 0, len(targetInputs))
	invalid := make([]models.TargetFailure, 0)
	seen := make(map[string]struct{}, len(targetInputs))

	for _, target := range targetInputs {
		normalized := utils.NormalizeTargetDomain(target)
		if !utils.IsValidDomain(normalized) {
			invalid = append(invalid, models.TargetFailure{Domain: target, Error: "invalid domain"})
			continue
		}

		if _, ok := seen[normalized]; ok {
			continue
		}

		seen[normalized] = struct{}{}
		targets = append(targets, normalized)
	}

	return targets, invalid
}

// DisabledOptionalSources filters the registry for optional sources currently lacking configuration.
func DisabledOptionalSources(registry []SourceDefinition) []SourceDefinition {
	disabled := make([]SourceDefinition, 0)
	for _, source := range registry {
		if source.Enabled == nil || source.Enabled() {
			continue
		}
		disabled = append(disabled, source)
	}
	return disabled
}

// SourceIsEnabled checks whether a source is enabled for use.
func SourceIsEnabled(source SourceDefinition) bool {
	if source.Enabled == nil {
		return true
	}
	return source.Enabled()
}

// SourceAvailability returns the health status of a source.
func SourceAvailability(source SourceDefinition) sources.Health {
	if SourceIsEnabled(source) {
		return sources.HealthEnabled
	}
	return sources.HealthDisabled
}
