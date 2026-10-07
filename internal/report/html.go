package report

import (
	"bytes"
	"fmt"
	"html/template"
	"strings"
	"time"

	"github.com/lumiaurora/subscan/internal/models"
)

const reportHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReconLens Report — {{ .Domain }}</title>
  <style>
    :root {
      --bg: #0b0f19;
      --surface: #111827;
      --surface-border: #1f2937;
      --card-bg: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --success: #22c55e;
      --success-bg: rgba(34, 197, 94, 0.15);
      --warning: #f59e0b;
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.15);
      --tag-bg: #334155;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.5;
      padding: 2rem 1.5rem;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    header {
      background: linear-gradient(180deg, var(--surface) 0%, rgba(17, 24, 39, 0.6) 100%);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 1.75rem 2rem;
      margin-bottom: 2rem;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
    }
    .brand-title {
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-title span {
      color: var(--accent);
    }
    .brand-subtitle {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .scan-target-box {
      text-align: right;
    }
    .target-domain {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .scan-id {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background-color: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      padding: 1.25rem;
      position: relative;
      overflow: hidden;
    }
    .stat-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background-color: var(--accent);
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      margin-top: 0.25rem;
    }
    .stat-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 2rem 0 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .badge {
      display: inline-block;
      padding: 0.2rem 0.55rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .badge-success {
      background-color: var(--success-bg);
      color: var(--success);
      border: 1px solid var(--success);
    }
    .badge-danger {
      background-color: var(--danger-bg);
      color: var(--danger);
      border: 1px solid var(--danger);
    }
    .badge-info {
      background-color: var(--accent-glow);
      color: var(--accent);
      border: 1px solid var(--accent);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background-color: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    th, td {
      padding: 0.85rem 1.25rem;
      text-align: left;
      border-bottom: 1px solid var(--surface-border);
    }
    th {
      background-color: rgba(30, 41, 59, 0.6);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-weight: 600;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background-color: rgba(30, 41, 59, 0.3);
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.9rem;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .tag {
      background-color: var(--tag-bg);
      color: var(--text);
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .tag-ip {
      background-color: rgba(56, 189, 248, 0.15);
      color: #7dd3fc;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .tag-cname {
      background-color: rgba(245, 158, 11, 0.15);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    footer {
      border-top: 1px solid var(--surface-border);
      padding-top: 1.5rem;
      margin-top: 3rem;
      text-align: center;
      color: var(--text-muted);
      font-size: 0.825rem;
    }
    footer a {
      color: var(--accent);
      text-decoration: none;
    }
    @media (max-width: 768px) {
      header {
        flex-direction: column;
        align-items: flex-start;
      }
      .scan-target-box {
        text-align: left;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand-title">RECON<span>LENS</span></div>
        <div class="brand-subtitle">Passive Reconnaissance & OSINT Intelligence</div>
      </div>
      <div class="scan-target-box">
        <div class="target-domain">{{ .Domain }}</div>
        {{ if .ID }}<div class="scan-id">ID: {{ .ID }}</div>{{ end }}
      </div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Discovered Subdomains</div>
        <div class="stat-value">{{ len .Subdomains }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">DNS Resolution</div>
        <div class="stat-value" style="font-size: 1.35rem; padding-top: 0.5rem;">
          {{ if .ResolvedEnabled }}
            <span class="badge badge-success">Enabled</span>
          {{ else }}
            <span class="badge badge-info">Passive Only</span>
          {{ end }}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Execution Duration</div>
        <div class="stat-value" style="font-size: 1.5rem; padding-top: 0.35rem;">{{ formatDuration .Metadata.DurationMS }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Scan Timestamp</div>
        <div class="stat-value" style="font-size: 1rem; color: var(--text-muted); padding-top: 0.75rem;">
          {{ formatTime .Timestamp }}
        </div>
      </div>
    </div>

    {{ if .Metadata.SourceTimings }}
    <h2 class="section-title">OSINT Sources Telemetry</h2>
    <table>
      <thead>
        <tr>
          <th>Source</th>
          <th>Status</th>
          <th>Candidates Found</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {{ range .Metadata.SourceTimings }}
        <tr>
          <td class="mono"><strong>{{ .Name }}</strong></td>
          <td>
            {{ if eq .Status "success" }}
              <span class="badge badge-success">Success</span>
            {{ else }}
              <span class="badge badge-danger">{{ .Status }}</span>
            {{ end }}
          </td>
          <td>{{ .Candidates }}</td>
          <td class="mono">{{ formatDuration .DurationMS }}</td>
        </tr>
        {{ end }}
      </tbody>
    </table>
    {{ end }}

    <h2 class="section-title">Discovered Subdomains ({{ len .Subdomains }})</h2>
    {{ if .Subdomains }}
    <table>
      <thead>
        <tr>
          <th>Subdomain</th>
          <th>Sources</th>
          {{ if .ResolvedEnabled }}
          <th>IP Addresses</th>
          <th>CNAMEs</th>
          {{ end }}
        </tr>
      </thead>
      <tbody>
        {{ range .Subdomains }}
        <tr>
          <td class="mono"><strong>{{ .Name }}</strong></td>
          <td>
            <div class="tags">
              {{ range .Sources }}
              <span class="tag">{{ . }}</span>
              {{ end }}
            </div>
          </td>
          {{ if $.ResolvedEnabled }}
          <td>
            <div class="tags">
              {{ range .IPs }}
              <span class="tag tag-ip">{{ . }}</span>
              {{ else }}
              <span style="color: var(--text-muted); font-size: 0.8rem;">-</span>
              {{ end }}
            </div>
          </td>
          <td>
            <div class="tags">
              {{ range .CNAMEs }}
              <span class="tag tag-cname">{{ . }}</span>
              {{ else }}
              <span style="color: var(--text-muted); font-size: 0.8rem;">-</span>
              {{ end }}
            </div>
          </td>
          {{ end }}
        </tr>
        {{ end }}
      </tbody>
    </table>
    {{ else }}
    <p style="color: var(--text-muted); padding: 1.5rem; text-align: center; background: var(--surface); border-radius: 8px;">No subdomains discovered for target domain.</p>
    {{ end }}

    <footer>
      <p>ReconLens is an extended passive reconnaissance and OSINT intelligence platform based on subscan by Mikael Nurminen.</p>
      <p style="margin-top: 0.5rem; font-size: 0.75rem;">Generated offline on {{ currentYear }} • Standalone HTML Intelligence Report</p>
    </footer>
  </div>
</body>
</html>`

// RenderHTML formats a reconnaissance report into a self-contained offline HTML report.
func RenderHTML(r models.Report) ([]byte, error) {
	tmpl, err := template.New("reconlens_report").Funcs(template.FuncMap{
		"formatDuration": func(ms int64) string {
			if ms < 1000 {
				return fmt.Sprintf("%dms", ms)
			}
			return fmt.Sprintf("%.2fs", float64(ms)/1000.0)
		},
		"formatTime": func(t time.Time) string {
			if t.IsZero() {
				return "N/A"
			}
			return t.Format("2006-01-02 15:04:05 UTC")
		},
		"currentYear": func() int {
			return time.Now().Year()
		},
		"join": strings.Join,
	}).Parse(reportHTMLTemplate)
	if err != nil {
		return nil, fmt.Errorf("parsing html report template: %w", err)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, r); err != nil {
		return nil, fmt.Errorf("executing html report template: %w", err)
	}

	return buf.Bytes(), nil
}
