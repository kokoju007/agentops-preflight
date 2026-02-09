# Security Policy — agentops-preflight

## What this skill does

- Makes HTTPS calls to a single API endpoint (Preflight API)
- Passes transaction data you explicitly provide as an argument
- Returns JSON results

## What this skill does NOT do

- Does NOT read, write, or scan files on your system
- Does NOT request or handle wallet private keys
- Does NOT execute arbitrary commands or eval any input
- Does NOT connect to any server other than the configured PREFLIGHT_API_URL
- Does NOT install additional packages or dependencies
- Does NOT modify any configuration files
- Does NOT access environment variables beyond its documented set

## Security controls

### HTTPS enforced
Scripts refuse to run if PREFLIGHT_API_URL does not start with https://.

### Host allowlist
Set PREFLIGHT_API_ALLOWED_HOSTS (comma-separated hostnames) to restrict
which hosts the scripts can connect to. Recommended: set to "preflight.agentops.dev".

### Input validation
- Transaction input must be base64 characters only (A-Z, a-z, 0-9, +, /, =)
- Shell metacharacters (; | & $ ` () {} <> !) are rejected
- Input length is capped at PREFLIGHT_TX_MAX_LEN (default: 200,000 chars)

### Dependency check
Scripts verify curl and jq are available before executing.

### Payment delegation
402 responses are returned with added hint fields (_x402:true, _hint).
The skill never signs transactions or touches signing keys.

## Environment variables used

PREFLIGHT_API_URL           - API endpoint (default: https://preflight.agentops.dev)
PREFLIGHT_API_ALLOWED_HOSTS - Host allowlist, comma-separated (recommended: set this)
PREFLIGHT_TX_MAX_LEN        - Input length cap (default: 200000)
PREFLIGHT_TIMEOUT_SEC       - HTTP timeout in seconds
X_PAYMENT                   - x402 payment header (set by agent's payment system)

No other environment variables are accessed.

## Network scope

Outbound connections are limited to:
  curl -> ${PREFLIGHT_API_URL}/tx/preflight
  curl -> ${PREFLIGHT_API_URL}/solana/status

No other domains, IPs, or ports are contacted.

## How to verify

1. The source is two bash scripts, each under 100 lines
2. Read them: scripts/preflight.sh and scripts/status.sh
3. Verify: no hidden network calls, no file operations, no eval
4. Source code: https://github.com/kokoju007/agentops-preflight

## Reporting issues

GitHub: https://github.com/kokoju007/agentops-preflight/issues
X: @kokoju007
