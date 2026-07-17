#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/node_modules/@litertjs/core/wasm"
DEST="$ROOT/public/wasm"

if [[ ! -d "$SRC" ]]; then
  echo "Missing $SRC — run npm install first." >&2
  exit 1
fi

mkdir -p "$DEST"
rsync -a --delete "$SRC/" "$DEST/"
echo "Synced LiteRT.wasm assets to public/wasm/"
