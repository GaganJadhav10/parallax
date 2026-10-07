package models

import "time"

// EventType defines the classification of a reconnaissance lifecycle event.
type EventType string

const (
	EventScanStarted       EventType = "scan:started"
	EventProviderStarted   EventType = "provider:started"
	EventProviderCompleted EventType = "provider:completed"
	EventProviderFailed    EventType = "provider:failed"
	EventCandidatesFound   EventType = "candidates:found"
	EventDNSStarted        EventType = "dns:started"
	EventDNSCompleted      EventType = "dns:completed"
	EventScanCompleted     EventType = "scan:completed"
	EventScanFailed        EventType = "scan:failed"
)

// Event carries structured telemetry and progress information during reconnaissance.
type Event struct {
	Type          EventType     `json:"type"`
	Target        string        `json:"target"`
	SourceID      string        `json:"source_id,omitempty"`
	SourceName    string        `json:"source_name,omitempty"`
	Candidates    int           `json:"candidates,omitempty"`
	RawCount      int           `json:"raw_count,omitempty"`
	UniqueCount   int           `json:"unique_count,omitempty"`
	LiveCount     int           `json:"live_count,omitempty"`
	WildcardCount int           `json:"wildcard_count,omitempty"`
	Duration      time.Duration `json:"duration,omitempty"`
	DurationMS    int64         `json:"duration_ms,omitempty"`
	Health        string        `json:"health,omitempty"`
	Error         string        `json:"error,omitempty"`
	Message       string        `json:"message,omitempty"`
	Timestamp     time.Time     `json:"timestamp"`
}

// NewEvent creates a new Event with current UTC timestamp.
func NewEvent(eventType EventType, target string) Event {
	return Event{
		Type:      eventType,
		Target:    target,
		Timestamp: time.Now().UTC(),
	}
}
