# Parallax — Open-Source Signals Intelligence for External Attack Surfaces

> Maps an organisation's external attack surface from certificate transparency logs, passive DNS archives and threat intelligence feeds — correlating ten open sources into an attributed asset inventory and tracking exposure drift between engagements. **Zero packets reach the target.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Go Report Card](https://goreportcard.com/badge/github.com/PixellHacker/parallax)](https://goreportcard.com/report/github.com/PixellHacker/parallax)

`parallax` is a passive reconnaissance and open-source intelligence (OSINT) command-line platform engineered in Go for security analysts, penetration testers, CTF competitors, and cybersecurity researchers. It enumerates domain assets, aggregates passive intelligence across public datasets without active network probing, performs multi-source attribution, provides concurrent DNS verification with wildcard filtering, and exports structured reports in JSON and TXT formats.

---

## Attribution & Open Source Heritage

Parallax is an extended, modified project built upon the technical foundation of [subscan](https://github.com/lumiaurora/subscan), originally developed by **Mikael Nurminen** under the [MIT License](LICENSE).

In accordance with the MIT License:
- The original copyright notice `Copyright (c) 2026 Mikael Nurminen` and permission notices are preserved in [LICENSE](LICENSE).
- Parallax extends the upstream codebase into a decoupled, interface-independent core architecture (`internal/engine`) designed to power both a professional Kali Linux command-line interface and a future web intelligence dashboard through shared domain models (`internal/models`).

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
- **Batch Processing**: File-based inputs and Unix standard input stream pipelines (`cat domains.txt | parallax scan -`).

---

## Project Architecture

```text
Parallax
├── cmd/
│   └── parallax/             # Executable entrypoint
├── internal/
│   ├── buildinfo/             # Version, commit, build timestamp, platform
│   ├── cli/                   # Subcommand router, argument parser & terminal views
│   ├── config/                # JSON config loader (supports parallax, reconlens and subscan paths)
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
git clone https://github.com/PixellHacker/parallax.git parallax
cd parallax

# Build the Parallax binary
go build -o parallax .

# On Windows PowerShell:
go build -o parallax.exe .
```

Verify installation:
```bash
./parallax version
```

---

## CLI Usage

Parallax uses a structured command format:

```text
parallax <command> [options]
```

### 1. `parallax scan`

Perform passive reconnaissance against a domain or list of domains.

```bash
# Basic passive scan on a single domain
parallax scan example.com

# Verify live DNS records and filter wildcard hostnames
parallax scan example.com --resolve

# Select specific passive providers
parallax scan example.com --sources crtsh,certspotter,urlscan

# Exclude an intermittent provider
parallax scan example.com --exclude-source bufferover

# Export structured JSON to stdout (pipeable to jq)
parallax scan example.com --json

# Save structured JSON report to a file
parallax scan example.com --output results.json --json

# Save line-delimited subdomains to a text file
parallax scan example.com --output subdomains.txt --txt

# Tune concurrency and network timeouts
parallax scan example.com --threads 25 --timeout 20s --retries 3

# Batch scan from an input file
parallax scan -i domains.txt --resolve

# Batch scan from standard input
cat domains.txt | parallax scan -i - --json
```

### 2. `parallax sources`

Inspect the status, provider type, and authentication requirements of all supported OSINT sources.

```bash
parallax sources

# Output in machine-readable JSON format
parallax sources --json
```

### 3. `parallax version`

Display current version, commit hash, build date, Go compiler version, and platform metadata.

```bash
parallax version

# Output in JSON format
parallax version --json
```

### 4. `parallax help`

Display detailed help and examples.

```bash
parallax --help
parallax scan --help
parallax sources --help
parallax version --help
```

---

## Configuration

Parallax supports three layers of configuration:
1. **CLI Flags**: Highest precedence per execution.
2. **Environment Variables**: Overrides API keys (`OTX_API_KEY`, `VT_API_KEY`, `SHODAN_API_KEY`).
3. **JSON Configuration File**: Loaded automatically from:
   - Linux / macOS: `~/.config/parallax/config.json` (fallbacks: `~/.config/reconlens/`, `~/.config/subscan/`)
   - Windows: `%AppData%\parallax\config.json` (fallbacks: `%AppData%\reconlens\`, `%AppData%\subscan\`)
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
PARALLAX_RUN_LIVE_TESTS=1 go test -tags=integration ./...
```

---

## Disclaimer

Parallax is designed solely for passive intelligence gathering, authorized security research, educational exploration, and OSINT investigations. Users are responsible for complying with applicable local and international laws, regulations, and third-party terms of service.
