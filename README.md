# ReconLens

> **Passive Reconnaissance & OSINT Intelligence**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go Report Card](https://goreportcard.com/badge/github.com/lumiaurora/subscan)](https://goreportcard.com/report/github.com/lumiaurora/subscan)

`reconlens` is a passive reconnaissance and open-source intelligence (OSINT) command-line platform engineered in Go for security analysts, penetration testers, CTF competitors, and cybersecurity researchers. It enumerates domain assets, aggregates passive intelligence across public datasets without active network probing, performs multi-source attribution, provides concurrent DNS verification with wildcard filtering, and exports structured reports in JSON and TXT formats.

---

## Attribution & Open Source Heritage

ReconLens is an extended, modified project built upon the technical foundation of [subscan](https://github.com/lumiaurora/subscan), originally developed by **Mikael Nurminen** under the [MIT License](LICENSE).

In accordance with the MIT License:
- The original copyright notice `Copyright (c) 2026 Mikael Nurminen` and permission notices are preserved in [LICENSE](LICENSE).
- ReconLens extends the upstream codebase into a decoupled, interface-independent core architecture (`internal/engine`) designed to power both a professional Kali Linux command-line interface and a future web intelligence dashboard through shared domain models (`internal/models`).

---

## Why Passive Reconnaissance Matters

Passive enumeration maps an organization's attack surface and external perimeter using public and third-party datasets (Certificate Transparency logs, DNS archives, search telemetry) without transmitting aggressive, intrusive, or probing packets to the target's servers.

- **Non-intrusive & Quiet**: Operates purely through public third-party APIs and public resolvers.
- **Safety**: Does not trigger intrusion detection systems (IDS) or web application firewalls (WAF) on the target organization.
- **Asset Discovery**: Surfaces forgotten development environments, staging subdomains, cloud mirrors, and CDN endpoints.

---

## Features

- **Strictly Passive**: No port scanning, brute force, credential testing, or vulnerability probing.
- **10 OSINT Providers**:
  - **Public (No API key needed)**: `crt.sh`, `AlienVault OTX`, `BufferOver`, `Cert Spotter`, `HackerTarget`, `Anubis`, `urlscan.io`, `RapidDNS`
  - **Optional Authenticated**: `VirusTotal` (`VT_API_KEY`), `Shodan` (`SHODAN_API_KEY`)
- **First-Class Kali CLI**: Structured subcommand architecture (`scan`, `sources`, `version`, `help`).
- **Decoupled Core Engine**: Thread-safe event system powering real-time terminal telemetry.
- **Multi-Source Attribution**: Every discovered host tracks exactly which providers reported it.
- **DNS Resolution & Wildcard Detection**: Concurrent A/AAAA and CNAME verification with automated wildcard DNS fingerprint filtering.
- **Resilient Network Client**: Exponential backoff, retry handling, rate-limit classification, and non-fatal provider failure isolation.
- **Export Formats**: Standard terminal output, structured JSON, and line-delimited TXT.
- **Batch Processing**: File-based inputs and Unix standard input stream pipelines (`cat domains.txt | reconlens scan -`).

---

## Project Architecture

```text
ReconLens
├── cmd/
│   └── reconlens/             # Executable entrypoint
├── internal/
│   ├── buildinfo/             # Version, commit, build timestamp, platform
│   ├── cli/                   # Subcommand router, argument parser & terminal views
│   ├── config/                # JSON config loader (supports reconlens and subscan paths)
│   ├── engine/                # Core reconnaissance orchestrator & event streaming
│   ├── models/                # Unified domain models (Report, Subdomain, Event, RunMetadata)
│   ├── output/                # Exporters (JSON, TXT, Batch TXT)
│   ├── resolver/              # Concurrent DNS resolver & wildcard fingerprint detector
│   ├── sources/               # 10 passive OSINT providers, HTTP client & health classification
│   │   └── testdata/          # Offline mock fixtures for parser regression tests
│   └── utils/                 # Normalization, domain validation, deduplication, filtering
├── LICENSE                    # MIT License (upstream copyright preserved)
├── README.md
└── go.mod
```

---

## Installation & Build

### Requirements
- Go 1.22+ (pure Go standard library, zero external CGO dependencies)

### Build from Source
```bash
# Clone the repository
git clone https://github.com/lumiaurora/subscan.git reconlens
cd reconlens

# Build the ReconLens binary
go build -o reconlens .

# On Windows PowerShell:
go build -o reconlens.exe .
```

Verify installation:
```bash
./reconlens version
```

---

## CLI Usage

ReconLens uses a structured command format:

```text
reconlens <command> [options]
```

### 1. `reconlens scan`

Perform passive reconnaissance against a domain or list of domains.

```bash
# Basic passive scan on a single domain
reconlens scan example.com

# Verify live DNS records and filter wildcard hostnames
reconlens scan example.com --resolve

# Select specific passive providers
reconlens scan example.com --sources crtsh,certspotter,urlscan

# Exclude an intermittent provider
reconlens scan example.com --exclude-source bufferover

# Export structured JSON to stdout (pipeable to jq)
reconlens scan example.com --json

# Save structured JSON report to a file
reconlens scan example.com --output results.json --json

# Save line-delimited subdomains to a text file
reconlens scan example.com --output subdomains.txt --txt

# Tune concurrency and network timeouts
reconlens scan example.com --threads 25 --timeout 20s --retries 3

# Batch scan from an input file
reconlens scan -i domains.txt --resolve

# Batch scan from standard input
cat domains.txt | reconlens scan -i - --json
```

### 2. `reconlens sources`

Inspect the status, provider type, and authentication requirements of all supported OSINT sources.

```bash
reconlens sources

# Output in machine-readable JSON format
reconlens sources --json
```

### 3. `reconlens version`

Display current version, commit hash, build date, Go compiler version, and platform metadata.

```bash
reconlens version

# Output in JSON format
reconlens version --json
```

### 4. `reconlens help`

Display detailed help and examples.

```bash
reconlens --help
reconlens scan --help
reconlens sources --help
reconlens version --help
```

---

## Configuration

ReconLens supports three layers of configuration:
1. **CLI Flags**: Highest precedence per execution.
2. **Environment Variables**: Overrides API keys (`OTX_API_KEY`, `VT_API_KEY`, `SHODAN_API_KEY`).
3. **JSON Configuration File**: Loaded automatically from:
   - Linux / macOS: `~/.config/reconlens/config.json` (fallback: `~/.config/subscan/config.json`)
   - Windows: `%AppData%\reconlens\config.json` (fallback: `%AppData%\subscan\config.json`)
   - Custom path: `--config /path/to/config.json`

### Example Configuration (`config.json`)
```json
{
  "otx_api_key": "your_alienvault_key",
  "vt_api_key": "your_virustotal_key",
  "shodan_api_key": "your_shodan_key",
  "defaults": {
    "resolve": false,
    "json": false,
    "txt": false,
    "output": "",
    "threads": 20,
    "timeout_seconds": 30,
    "retries": 2,
    "verbose": false,
    "include_sources": ["crtsh", "certspotter", "rapiddns"],
    "exclude_sources": ["bufferover"]
  }
}
```

---

## Testing

Run the standard offline test suite:
```bash
go test -count=1 ./...
```

Run package-specific verification:
```bash
go test -v ./internal/engine/...
go test -v ./internal/cli/...
go test -v ./internal/sources/...
```

Run live integration tests against public networks (opt-in):
```bash
SUBSCAN_RUN_LIVE_TESTS=1 go test -tags=integration ./...
```

---

## Disclaimer

ReconLens is designed solely for passive intelligence gathering, authorized security research, educational exploration, and OSINT investigations. Users are responsible for complying with applicable local and international laws, regulations, and third-party terms of service.
