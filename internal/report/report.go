package report

import (
	"encoding/json"

	"github.com/GaganJadhav10/parallax/internal/models"
)

// RenderJSON formats a reconnaissance report into indented JSON.
func RenderJSON(r models.Report) ([]byte, error) {
	return json.MarshalIndent(r, "", "  ")
}

// RenderComparisonJSON formats a scan comparison into indented JSON.
func RenderComparisonJSON(c models.ScanComparison) ([]byte, error) {
	return json.MarshalIndent(c, "", "  ")
}
