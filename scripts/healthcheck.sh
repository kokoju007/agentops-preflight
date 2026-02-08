#!/bin/bash
# healthcheck.sh — Check server health, restart via PM2 if down
# Usage: Add to crontab: */5 * * * * /path/to/agentops-preflight/scripts/healthcheck.sh >> /var/log/agentops-healthcheck.log 2>&1

APP_NAME="agentops-preflight"
HEALTH_URL="http://localhost:3000/health"
TIMEOUT=5

response=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$HEALTH_URL" 2>/dev/null)

if [ "$response" = "200" ]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) OK"
else
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) FAIL (HTTP $response) — restarting $APP_NAME"
  pm2 restart "$APP_NAME" --update-env
fi
