#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm install
bash scripts/sync-wasm.sh
bash scripts/download-model.sh
echo "Ready. Run: npm run dev"
