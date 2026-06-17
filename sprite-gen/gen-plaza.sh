#!/usr/bin/env bash
# Generate a plaza scene variant for a given time-of-day bucket.
# Usage: ./gen-plaza.sh <bucket-name> "<time-of-day prompt fragment>"

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${OPENAI_API_KEY:-}" ]; then
  set -a; . "$ROOT/.env.local"; set +a
fi

BUCKET="$1"
TIME_PHRASE="$2"

TMP_REQ=$(mktemp)
TMP_RESP=$(mktemp)
trap 'rm -f "$TMP_REQ" "$TMP_RESP"' EXIT

# Build request JSON via Python (handles escaping safely)
python3 - "$TIME_PHRASE" <<'PY' > "$TMP_REQ"
import sys, json
time_phrase = sys.argv[1]
prompt = (
  "A wide isometric pixel art small public plaza, painterly soft pixel art style, "
  "3/4 isometric perspective from above-front, panoramic wider than tall, "
  "center features a small stone fountain with gently flowing water, "
  "surrounded by an open paved plaza floor with subtle cobblestone or tile pattern, "
  "low building facades visible at the back left and back right — small shop fronts and kiosks, "
  "their flat front walls clearly designed as surfaces for posters or banners later, "
  "a few small potted trees and wooden benches at the edges, "
  f"{time_phrase}, "
  "quiet atmospheric mood, not dramatic, comfortable urban, "
  "soft 1px outline edges, painterly pixel feel like Stardew Valley town or Habbo plaza, "
  "contemporary urban small Asian or European plaza, not fantasy not medieval, "
  "absolutely NO characters NO people NO animals in the scene, "
  "ample wide open floor space designed to hold many small people standing, "
  "the plaza occupies center 90% of the frame"
)
print(json.dumps({
  "model": "gpt-image-1",
  "prompt": prompt,
  "n": 1,
  "size": "1536x1024",
  "quality": "high",
}))
PY

# Inspect helpers — take response file as argv, no stdin conflict
extract_err() {
  python3 - "$1" <<'PY'
import json, sys
try:
  with open(sys.argv[1]) as f:
    d = json.load(f)
except Exception as e:
  print(f"parse: {e}"); sys.exit()
e = d.get("error")
if isinstance(e, dict): print(e.get("message",""))
elif e: print(str(e))
else: print("")
PY
}

decode_image() {
  python3 - "$1" "$2" <<'PY'
import json, sys, base64
with open(sys.argv[1]) as f:
  d = json.load(f)
img = d["data"][0]["b64_json"]
with open(sys.argv[2], "wb") as out:
  out.write(base64.b64decode(img))
PY
}

MAX=4; TRY=1
while :; do
  curl -sS -X POST https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    --data @"$TMP_REQ" > "$TMP_RESP"
  ERR=$(extract_err "$TMP_RESP")
  if [ -z "$ERR" ]; then break; fi
  if [ "$TRY" -ge "$MAX" ]; then
    echo "FAIL $BUCKET: $ERR" >&2
    echo "response head:" >&2
    head -c 400 "$TMP_RESP" >&2
    exit 1
  fi
  echo "  retry $TRY in $((TRY*6))s — $ERR" >&2
  sleep $((TRY*6)); TRY=$((TRY+1))
done

OUT="$ROOT/public/sprites/rooms/plaza_$BUCKET.png"
decode_image "$TMP_RESP" "$OUT"
echo "✓ $OUT"
