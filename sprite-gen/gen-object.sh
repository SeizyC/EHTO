#!/usr/bin/env bash
# Generate a single transparent plaza object sprite.
# Usage: ./gen-object.sh <name> "<object description>"
# Output: public/sprites/rooms/objects/<name>.png (chroma-keyed transparent)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${OPENAI_API_KEY:-}" ]; then
  set -a; . "$ROOT/.env.local"; set +a
fi

NAME="$1"
OBJECT_DESC="$2"

TMP_REQ=$(mktemp); TMP_RESP=$(mktemp); TMP_RAW=$(mktemp).png
trap 'rm -f "$TMP_REQ" "$TMP_RESP" "$TMP_RAW"' EXIT

python3 - "$OBJECT_DESC" <<'PY' > "$TMP_REQ"
import sys, json
desc = sys.argv[1]
prompt = (
  f"A single isolated {desc}, isometric pixel art 3/4 perspective view from above-front, "
  "painterly soft pixel art style matching Stardew Valley town or Habbo plaza aesthetic, "
  "the object is centered in the frame and occupies the center 50% of the frame, "
  "soft 1px outline edges, painterly pixel feel, "
  "contemporary urban small plaza style, not fantasy not medieval, "
  "soft natural afternoon daylight tone, "
  "ABSOLUTELY NO characters NO people NO animals NO other objects, just this one single object, "
  "centered on a solid flat #00FF00 chroma green background, "
  "the rest of the frame is solid flat green for chroma key extraction, "
  "no cast shadow on the ground, no decorative frame, no text"
)
print(json.dumps({
  "model": "gpt-image-1",
  "prompt": prompt,
  "n": 1,
  "size": "1024x1024",
  "quality": "high",
}))
PY

extract_err() {
  python3 - "$1" <<'PY'
import json, sys
try:
  with open(sys.argv[1]) as f: d = json.load(f)
except Exception as e:
  print(f"parse: {e}"); sys.exit()
e = d.get("error")
print(e.get("message","") if isinstance(e, dict) else (str(e) if e else ""))
PY
}

decode_image() {
  python3 - "$1" "$2" <<'PY'
import json, sys, base64
with open(sys.argv[1]) as f: d = json.load(f)
with open(sys.argv[2], "wb") as out:
  out.write(base64.b64decode(d["data"][0]["b64_json"]))
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
    echo "FAIL $NAME: $ERR" >&2; head -c 400 "$TMP_RESP" >&2; exit 1
  fi
  echo "  retry $TRY in $((TRY*6))s — $ERR" >&2
  sleep $((TRY*6)); TRY=$((TRY+1))
done

decode_image "$TMP_RESP" "$TMP_RAW"

OUT="$ROOT/public/sprites/rooms/objects/$NAME.png"
mkdir -p "$(dirname "$OUT")"
cat "$TMP_RAW" | python3 "$ROOT/sprite-gen/chroma.py" > "$OUT"
echo "✓ $OUT"
