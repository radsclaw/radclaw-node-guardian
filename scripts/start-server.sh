#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HOST=127.0.0.1
export PORT=8765
export PUBLIC_DIR="$ROOT/public"
export STATUS_PATH="$ROOT/runtime/status.json"
exec /opt/homebrew/bin/node "$ROOT/server.js"
