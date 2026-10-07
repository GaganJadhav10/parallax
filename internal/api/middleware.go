package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

// APIErrorResponse standardizes JSON error payloads across all API endpoints.
type APIErrorResponse struct {
	Error APIErrorDetail `json:"error"`
}

// APIErrorDetail holds error categorization and human-readable explanation.
type APIErrorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, APIErrorResponse{
		Error: APIErrorDetail{
			Code:    code,
			Message: message,
		},
	})
}

// CORSMiddleware applies configurable cross-origin resource sharing policies.
func CORSMiddleware(allowedOrigins []string) func(http.Handler) http.Handler {
	allowAll := false
	originsMap := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		trimmed := strings.TrimSpace(o)
		if trimmed == "*" {
			allowAll = true
		} else if trimmed != "" {
			originsMap[strings.ToLower(trimmed)] = struct{}{}
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" {
				allowed := allowAll
				if !allowed {
					_, allowed = originsMap[strings.ToLower(origin)]
				}

				if allowed {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
					w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization")
					w.Header().Set("Access-Control-Max-Age", "86400")
				}
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeadersMiddleware attaches standard hardening headers to HTTP responses.
func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}
