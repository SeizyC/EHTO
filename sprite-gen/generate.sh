#!/usr/bin/env bash
# EHTO sprite generator — single sprite via OpenAI image API
#
# Usage:
#   ./generate.sh <name> <skin> <hair> <outfit>
#
# Example:
#   ./generate.sh test_01 fair "short messy black hair" "oversized white t-shirt and black baggy jeans"
#
# Output:
#   ./out/<name>.png    — 1024×1024 generated image
#   ./out/<name>.json   — prompt + metadata

set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <name> <skin> <hair> <outfit>" >&2
  exit 1
fi

NAME="$1"
SKIN="$2"
HAIR="$3"
OUTFIT="$4"

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out"
mkdir -p "$OUT"

# Load API key
if [ -z "${OPENAI_API_KEY:-}" ]; then
  if [ -f "$ROOT/../.env.local" ]; then
    set -a; . "$ROOT/../.env.local"; set +a
  fi
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY missing. Put it in ../.env.local or export it." >&2
  exit 1
fi

MODEL="${MODEL:-gpt-image-1}"
SIZE="${SIZE:-1024x1024}"
QUALITY="${QUALITY:-high}"

PROMPT="A small pixel art character sprite, Habbo Hotel modern style, 3/4 front isometric view, \
standing idle pose on flat ground, head-to-body ratio about 1:2, \
visible face with simple readable features no detailed shading, ${SKIN} skin, \
${HAIR}, ${OUTFIT}, \
limited color palette 8-10 colors, soft 1px outline, no anti-aliasing, \
centered on a solid flat green #00FF00 chroma background, \
full body visible from head to feet, no shadow, no environment, \
pixel-perfect clean lines, retro pixel game aesthetic but contemporary urban not fantasy, \
the character occupies the center 70% of the frame, \
not cute mascot, not anime chibi, not fantasy RPG, no animal features, no weapons, contemporary social character"

echo "→ generating: $NAME"
echo "  prompt: $PROMPT" | fold -s -w 100 | sed 's/^/  /'

# Compose JSON request safely
REQUEST=$(python3 -c "
import json, sys
print(json.dumps({
  'model': '$MODEL',
  'prompt': '''$PROMPT'''.replace(chr(10),' '),
  'n': 1,
  'size': '$SIZE',
  'quality': '$QUALITY',
}))
")

MAX_TRIES="${MAX_TRIES:-4}"
TRY=1
while :; do
  RESP=$(curl -sS https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$REQUEST")
  ERR=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',{}).get('message','') if isinstance(d.get('error'),dict) else '')")
  if [ -z "$ERR" ]; then
    break
  fi
  if [ "$TRY" -ge "$MAX_TRIES" ]; then
    echo "$RESP" > "$OUT/${NAME}.response.json"
    echo "ERROR after $TRY tries: $ERR" >&2
    exit 2
  fi
  BACKOFF=$(( TRY * 6 ))
  echo "  retry $TRY/$MAX_TRIES in ${BACKOFF}s — $ERR" >&2
  sleep "$BACKOFF"
  TRY=$(( TRY + 1 ))
done

# Save metadata
echo "$RESP" > "$OUT/${NAME}.response.json"

B64=$(echo "$RESP" | python3 -c "
import json,sys,base64
d=json.load(sys.stdin)
img=d['data'][0]
if 'b64_json' in img:
    sys.stdout.write(img['b64_json'])
elif 'url' in img:
    # signal to caller
    print('URL:'+img['url'])
")

if echo "$B64" | head -c 4 | grep -q "URL:"; then
  URL="${B64#URL:}"
  echo "  downloading from URL..."
  curl -sS "$URL" -o "$OUT/${NAME}.png"
else
  echo "$B64" | base64 --decode > "$OUT/${NAME}.png"
fi

# Save metadata
cat > "$OUT/${NAME}.json" <<EOF
{
  "name": "$NAME",
  "skin": "$SKIN",
  "hair": "$HAIR",
  "outfit": "$OUTFIT",
  "model": "$MODEL",
  "size": "$SIZE",
  "quality": "$QUALITY"
}
EOF

echo "✓ saved: $OUT/${NAME}.png"
