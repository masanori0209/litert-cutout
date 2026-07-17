#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/public/models/u2net_fp16.tflite"
URL="https://huggingface.co/litert-community/U-2-Net/resolve/main/u2net_fp16.tflite"

mkdir -p "$(dirname "$DEST")"
if [[ -f "$DEST" ]]; then
  echo "Model already exists: $DEST"
  ls -lh "$DEST"
  exit 0
fi

echo "Downloading U²-Net LiteRT model (~88MB)..."
curl -L --fail -o "$DEST" "$URL"
ls -lh "$DEST"
echo "Saved to $DEST"
