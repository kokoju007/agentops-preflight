#!/usr/bin/env bash
# agentops-preflight: Solana network status check
# Security: No filesystem access, no key handling, network scope enforced
set -euo pipefail

# --- Dependencies ---
for bin in curl jq; do
  command -v "$bin" >/dev/null 2>&1 || {
    echo "{\"error\":\"Missing dependency: $bin\"}" >&2
    exit 1
  }
done

# --- Configuration ---
API_URL="${PREFLIGHT_API_URL:-https://preflight.agentops.dev}"
ENDPOINT="/solana/status"
TIMEOUT="${PREFLIGHT_TIMEOUT_SEC:-10}"
ALLOWED_HOSTS="${PREFLIGHT_API_ALLOWED_HOSTS:-}"

# --- Enforce HTTPS ---
if [[ "$API_URL" != https://* ]]; then
  echo '{"error":"PREFLIGHT_API_URL must start with https://"}' >&2
  exit 1
fi

# --- Host allowlist (optional, comma-separated) ---
if [ -n "$ALLOWED_HOSTS" ]; then
  hostport="${API_URL#https://}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  if [ -z "$host" ]; then
    echo '{"error":"Could not extract host from PREFLIGHT_API_URL"}' >&2
    exit 1
  fi
  allowed=0
  host_lc="${host,,}"
  IFS=',' read -r -a hosts_arr <<< "$ALLOWED_HOSTS"
  for h in "${hosts_arr[@]}"; do
    h_trim="${h#"${h%%[![:space:]]*}"}"
    h_trim="${h_trim%"${h_trim##*[![:space:]]}"}"
    if [ -n "$h_trim" ] && [ "${h_trim,,}" = "$host_lc" ]; then
      allowed=1
      break
    fi
  done
  if [ "$allowed" -ne 1 ]; then
    echo "{\"error\":\"Host blocked by allowlist\",\"host\":\"$host\"}" >&2
    exit 1
  fi
fi

# --- Build curl arguments ---
CURL_ARGS=(-s -w "\n%{http_code}" --max-time "$TIMEOUT" -X GET -H "Content-Type: application/json")

if [ -n "${X_PAYMENT:-}" ]; then
  CURL_ARGS+=(-H "X-PAYMENT: ${X_PAYMENT}")
fi

CURL_ARGS+=("${API_URL}${ENDPOINT}")

# --- API call (only connects to PREFLIGHT_API_URL) ---
RESPONSE="$(curl "${CURL_ARGS[@]}" 2>/dev/null)" || {
  echo "{\"error\":\"Network error: could not reach Preflight API\",\"url\":\"${API_URL}${ENDPOINT}\"}" >&2
  exit 1
}

# --- Parse response ---
HTTP_CODE="$(echo "$RESPONSE" | tail -1)"
BODY="$(echo "$RESPONSE" | sed '$d')"

if [ "$HTTP_CODE" = "402" ]; then
  echo "$BODY" | jq -c '. + {"_x402":true,"_hint":"Payment required. Use your x402/wallet skill to sign and retry with X-PAYMENT header."}' 2>/dev/null || echo "$BODY"
  exit 0
fi

if [ "$HTTP_CODE" = "200" ]; then
  echo "$BODY" | jq -c '.' 2>/dev/null || echo "$BODY"
  exit 0
fi

echo "$BODY" | jq -c '. + {"_http_status":'"$HTTP_CODE"'}' 2>/dev/null || echo "$BODY"
exit 1
