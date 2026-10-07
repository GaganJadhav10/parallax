# ReconLens Production Deployment Guide

**ReconLens: Passive Reconnaissance & OSINT Intelligence**

This guide provides instructions for deploying the ReconLens Web Dashboard and the ReconLens Go REST API server to production environments.

---

## 1. Architecture Overview

ReconLens is designed with a decoupled architecture where the browser frontend and reconnaissance backend are deployed independently:

```
User Browser
     │
     │ HTTPS
     ▼
Netlify (Global Edge CDN)
ReconLens React/TypeScript Dashboard (SPA)
     │
     │ HTTPS REST + SSE Streaming
     ▼
Reverse Proxy (Caddy / Nginx / Cloudflare)
     │
     │ HTTP (localhost / internal network)
     ▼
ReconLens Go API Server (reconlens serve)
     │
     ▼
Reconnaissance Engine (internal/engine)
     │
     ▼
Passive OSINT Providers (10 sources)
     │
     ▼
Persistent SQLite Database (/var/lib/reconlens/reconlens.db)
```

- **Frontend**: Lightweight React/TypeScript Single Page Application hosted on Netlify Edge CDN.
- **Backend**: Go executable running on a dedicated Linux VPS or container host with access to persistent storage.
- **Zero Reconnaissance in Browser**: The browser never executes DNS resolvers, scrapes search engines, or accesses OSINT provider credentials.

---

## 2. Frontend Deployment (Netlify)

### A. Repository Configuration
The frontend source code is located in the `web/` directory. ReconLens includes a root-level `netlify.toml` and `web/public/_redirects` configured for automated builds.

`netlify.toml` settings:
- **Base directory**: `web`
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: `20`

### B. Single Page Application (SPA) Fallback
Because ReconLens uses client-side routing via React Router (`/`, `/scans/new`, `/scans/:id`, `/history`, `/compare`, `/reports`, `/sources`, `/about`), all direct browser navigations and refreshes are redirected to `/index.html` with HTTP status `200` via:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
This is mirrored in `web/public/_redirects` to ensure reliable SPA routing across all Netlify deployment methods.

### C. Environment Variable
In the Netlify dashboard under **Site configuration > Environment variables**, define:

| Variable | Description | Example |
|---|---|---|
| `VITE_API_BASE_URL` | Public HTTPS URL of the ReconLens Go API | `https://api.reconlens.io` |

> **IMPORTANT**: The API URL must use `https://`. Do not include a trailing slash.

---

## 3. Backend Deployment (Linux VPS / Server)

The Go backend requires a standard 64-bit Linux server (Ubuntu, Debian, Alpine, Fedora, Rocky, Arch, etc.) with persistent disk storage.

### A. Binary Installation
Compile the binary for the target architecture or download from releases:

```bash
# Cross-compile for Linux 64-bit
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o reconlens main.go

# Install on Linux server
sudo mv reconlens /usr/local/bin/
sudo chmod +x /usr/local/bin/reconlens
```

### B. Dedicated User and Storage Directory
Create a dedicated system user and persistent directory for the SQLite database:

```bash
sudo useradd -r -s /bin/false reconlens
sudo mkdir -p /var/lib/reconlens
sudo chown -R reconlens:reconlens /var/lib/reconlens
sudo chmod 700 /var/lib/reconlens
```

---

## 4. Environment Variables Reference

Configure server settings via environment variables (e.g. in `/etc/reconlens/reconlens.env` or systemd service):

| Variable | Required | Default | Description |
|---|---|---|---|
| `RECONLENS_HOST` | No | `127.0.0.1` | Network bind address. Set to `127.0.0.1` when using a local reverse proxy, or `0.0.0.0` for containerized environments. |
| `RECONLENS_PORT` | No | `8080` | Port for the HTTP API server. |
| `RECONLENS_DB` | **Yes** | User config dir | Absolute path to SQLite database on **persistent storage**. |
| `RECONLENS_CORS_ORIGINS` | **Yes** | `""` | Comma-separated list of allowed frontend origins (e.g. `https://reconlens.netlify.app`). |
| `RECONLENS_MAX_CONCURRENT_SCANS` | No | `10` | Maximum active concurrent scans allowed before returning `429 Too Many Requests`. |
| `VT_API_KEY` | No | `""` | VirusTotal API Key for enhanced subdomain discovery. |
| `SHODAN_API_KEY` | No | `""` | Shodan API Key for host intelligence. |
| `OTX_API_KEY` | No | `""` | AlienVault OTX Key for threat intelligence. |

---

## 5. Reverse Proxy & HTTPS Configuration

The public API **must** be served over HTTPS. Never expose the Go application port directly over plaintext HTTP to the public internet.

### Option 1: Caddy (Recommended)
Caddy automatically manages Let's Encrypt TLS certificates and natively streams Server-Sent Events without response buffering.

Example `/etc/caddy/Caddyfile`:
```caddy
api.reconlens.io {
    reverse_proxy 127.0.0.1:8080 {
        # Flush headers immediately for SSE streaming
        flush_interval -1
    }
}
```

### Option 2: Nginx
If using Nginx with Certbot, ensure response buffering is explicitly disabled for SSE streaming.

Example `/etc/nginx/sites-available/reconlens`:
```nginx
server {
    server_name api.reconlens.io;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CRITICAL for Server-Sent Events (SSE) streaming:
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        chunked_transfer_encoding on;
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/api.reconlens.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.reconlens.io/privkey.pem;
}
```

---

## 6. Systemd Service Setup

Create `/etc/systemd/system/reconlens.service`:

```ini
[Unit]
Description=ReconLens OSINT Intelligence API Server
After=network.target

[Service]
Type=simple
User=reconlens
Group=reconlens
WorkingDirectory=/var/lib/reconlens
ExecStart=/usr/local/bin/reconlens serve \
    --host 127.0.0.1 \
    --port 8080 \
    --db /var/lib/reconlens/reconlens.db \
    --cors-origins https://reconlens.netlify.app \
    --max-concurrent-scans 10

# Pass optional API keys securely
Environment="VT_API_KEY=your_virustotal_key"
Environment="SHODAN_API_KEY=your_shodan_key"
Environment="OTX_API_KEY=your_otx_key"

Restart=always
RestartSec=5s
LimitNOFILE=65535

# Sandboxing
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/reconlens
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now reconlens
sudo systemctl status reconlens
```

---

## 7. Database Persistence Requirements

- **SQLite Safety**: ReconLens stores scans, subdomains, and DNS resolution records in an embedded SQLite database using WAL (Write-Ahead Logging) mode.
- **Persistent Volume Requirement**: SQLite **must** reside on persistent block storage. Do not deploy the database onto ephemeral container filesystems (e.g. standard Heroku dynos or ephemeral Render instances) that reset upon restart or redeployment.
- **Backups**: To backup the live database safely without locking writes, use SQLite's online backup tool or copy the database while WAL checkpointing:
  ```bash
  sqlite3 /var/lib/reconlens/reconlens.db ".backup '/var/backups/reconlens-$(date +%F).db'"
  ```

---

## 8. Server-Sent Events (SSE) Requirements

The Scan Details page communicates with the server via `GET /api/scans/{id}/events` using an `EventSource` connection.

1. **Proxy Buffering**: The Go API sets `X-Accel-Buffering: no` on all SSE responses. Reverse proxies (Nginx, HAProxy) must have proxy buffering disabled (`proxy_buffering off;`).
2. **Timeouts**: Ensure reverse proxy `proxy_read_timeout` is at least 300 seconds (or 24h) to avoid dropping idle or long-running scans.
3. **HTTP/2**: Using HTTP/2 on the reverse proxy is strongly recommended because HTTP/1.1 restricts browsers to 6 concurrent open connections per domain.

---

## 9. Security Review & Threat Model

### A. Unauthenticated API Analysis
> [!WARNING]
> In Phase 5/6, ReconLens does not implement user accounts or authentication. Anyone who can reach the API endpoint can invoke `POST /api/scans`.

If deployed directly to the public internet without network restrictions:
- **Target Probing**: Anonymous internet users could trigger reconnaissance scans against arbitrary domains.
- **Provider API Quota Exhaustion**: If `VT_API_KEY` or `SHODAN_API_KEY` are configured, untrusted users could deplete rate limits or paid quota pools.
- **Network Bandwidth / DNS Load**: High-frequency DNS resolution could lead to outbound bandwidth consumption or DNS rate limiting from recursive resolvers.

### B. Protections Implemented in Phase 6
- **Strict Hostname Validation**: All domain inputs are sanitized with `utils.NormalizeTargetDomain` and validated against RFC hostname specifications. Special characters, path traversals, protocol prefixes, and IP addresses are rejected with `400 Bad Request`.
- **Request Size Limiting**: `http.MaxBytesReader` restricts all incoming request bodies to 1 MB.
- **Concurrency Rate Limiting**: `RECONLENS_MAX_CONCURRENT_SCANS` (default: 10) prevents concurrent process flooding by rejecting additional scans with `429 Too Many Requests`.
- **Restrictive CORS**: The API only responds with `Access-Control-Allow-Origin` matching explicitly configured origins in `RECONLENS_CORS_ORIGINS`.
- **No Secret Leakage**: The API never transmits provider API keys to the browser.
- **No Stack Traces**: All error outputs use standardized JSON error structures (`APIErrorResponse`).

### C. Recommended Public Exposure Strategy
Until user authentication is implemented:
1. **Network Layer Isolation**: Restrict backend access to authorized team members using a VPN, Tailscale, WireGuard, or Cloudflare Zero Trust Access.
2. **Reverse Proxy Basic Auth or IP Whitelisting**: Add HTTP Basic Authentication on the reverse proxy (`proxy_pass` layer) or whitelist trusted client IPs.
3. **Strict Origin Policy**: Configure `RECONLENS_CORS_ORIGINS` strictly to your specific Netlify domain (`https://<your-subdomain>.netlify.app`).

---

## 10. Local Development & Verification

### Running Backend Locally
```bash
# Terminal 1
cd reconlens
go run main.go serve --host 127.0.0.1 --port 8080 --cors-origins http://localhost:3000
```

### Running Frontend Locally
```bash
# Terminal 2
cd reconlens/web
npm install
npm run dev
```

Visit `http://localhost:3000` to interact with the dashboard.

---

## 11. Production Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| Frontend shows "Backend Disconnected" | `VITE_API_BASE_URL` is incorrect or CORS is blocking the request. | 1. Check browser developer console for CORS errors.<br>2. Confirm `RECONLENS_CORS_ORIGINS` matches the exact frontend origin (including `https://`).<br>3. Verify `curl -k https://api.example.com/api/health` returns `200 OK`. |
| SSE progress stops updating or events arrive all at once upon completion | Reverse proxy is buffering responses. | Set `proxy_buffering off;` in Nginx or verify `flush_interval -1` in Caddy. Confirm `X-Accel-Buffering: no` header is present. |
| Scan fails with `429 Too Many Requests` | Max concurrent scans exceeded. | Wait for running scans to complete or increase `RECONLENS_MAX_CONCURRENT_SCANS` on the server. |
| Routes 404 when refreshed in browser | Netlify SPA rewrite missing. | Verify `netlify.toml` contains `[[redirects]] from = "/*" to = "/index.html" status = 200` or `web/public/_redirects` exists. |
| Scans disappear after server restart | Database was placed on an ephemeral volume. | Set `RECONLENS_DB` to a persistent directory (e.g. `/var/lib/reconlens/reconlens.db`). |
