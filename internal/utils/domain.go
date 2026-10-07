package utils

import "strings"

// NormalizeTargetDomain cleans and normalizes a user-supplied target domain.
func NormalizeTargetDomain(domain string) string {
	domain = strings.ToLower(strings.TrimSpace(domain))
	domain = strings.TrimPrefix(domain, "*.")
	domain = strings.TrimSuffix(domain, ".")
	return domain
}

// IsValidDomain checks whether the given domain conforms to standard domain naming rules.
func IsValidDomain(domain string) bool {
	if domain == "" || strings.Contains(domain, "..") || strings.ContainsAny(domain, "/:@ ") {
		return false
	}

	labels := strings.Split(domain, ".")
	if len(labels) < 2 {
		return false
	}

	for _, label := range labels {
		if label == "" || len(label) > 63 || strings.HasPrefix(label, "-") || strings.HasSuffix(label, "-") {
			return false
		}

		for _, char := range label {
			isLetter := char >= 'a' && char <= 'z'
			isDigit := char >= '0' && char <= '9'
			if !isLetter && !isDigit && char != '-' {
				return false
			}
		}
	}

	return true
}
