#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
umask 077
exec /usr/bin/python3 -m node_guardian.probe --output "$ROOT/runtime/status.json"
