package utils

import "testing"

func TestNormalizeTargetDomain(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"example.com", "example.com"},
		{"  EXAMPLE.COM  ", "example.com"},
		{"*.example.com", "example.com"},
		{"example.com.", "example.com"},
		{"*.api.example.com.", "api.example.com"},
	}

	for _, tt := range tests {
		got := NormalizeTargetDomain(tt.input)
		if got != tt.want {
			t.Errorf("NormalizeTargetDomain(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestIsValidDomain(t *testing.T) {
	tests := []struct {
		domain string
		valid  bool
	}{
		{"example.com", true},
		{"sub.example.com", true},
		{"my-domain.co.uk", true},
		{"", false},
		{"example", false},
		{"-example.com", false},
		{"example-.com", false},
		{"exam..ple.com", false},
		{"http://example.com", false},
		{"example.com:8080", false},
		{"example .com", false},
	}

	for _, tt := range tests {
		got := IsValidDomain(tt.domain)
		if got != tt.valid {
			t.Errorf("IsValidDomain(%q) = %v, want %v", tt.domain, got, tt.valid)
		}
	}
}
