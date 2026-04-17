#!/usr/bin/env bash
# Standalone reminder script for external cron setups.
# Usage: add to crontab → 0 9 * * * /path/to/focus-reminder.sh
#
# If you're running Focus Five with its built-in server cron (recommended),
# you don't need this script — configure ntfy in the app's settings panel instead.

FOCUS_FIVE_URL="${FOCUS_FIVE_URL:-http://localhost:3000}"

response=$(curl -s -w "\n%{http_code}" -X POST "$FOCUS_FIVE_URL/api/remind" \
  -H "Content-Type: application/json" \
  -d '{}')

body=$(echo "$response" | head -n -1)
status=$(echo "$response" | tail -n 1)

if [ "$status" = "200" ]; then
  echo "[focus-reminder] OK: $body"
else
  echo "[focus-reminder] ERROR $status: $body" >&2
  exit 1
fi
