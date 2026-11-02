package output

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/GaganJadhav10/parallax/internal/models"
)

// Aliases linking output structures to central models
type Report = models.Report
type BatchReport = models.BatchReport
type BatchMetadata = models.BatchMetadata
type TargetFailure = models.TargetFailure
type RunMetadata = models.RunMetadata
type SourceReference = models.SourceReference
type FailedSource = models.FailedSource
type SourceTiming = models.SourceTiming
type Subdomain = models.Subdomain

// WriteTXT exports a list of subdomain names as a plaintext line-delimited file.
func WriteTXT(path string, subdomains []string) error {
	if err := ensureParentDir(path); err != nil {
		return err
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	for _, subdomain := range subdomains {
		if _, err := writer.WriteString(subdomain + "\n"); err != nil {
			return err
		}
	}

	return writer.Flush()
}

// WriteBatchTXT exports batch target results in CSV format (domain,subdomain).
func WriteBatchTXT(path string, reports []Report) error {
	if err := ensureParentDir(path); err != nil {
		return err
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	for _, report := range reports {
		for _, subdomain := range report.Subdomains {
			if _, err := writer.WriteString(report.Domain + "," + subdomain.Name + "\n"); err != nil {
				return err
			}
		}
	}

	return writer.Flush()
}

// WriteJSON serializes the given reconnaissance payload to indented JSON.
func WriteJSON(path string, payload any) error {
	if err := ensureParentDir(path); err != nil {
		return err
	}

	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(payload)
}

func ensureParentDir(path string) error {
	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}

	return os.MkdirAll(dir, 0o755)
}
