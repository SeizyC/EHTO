#!/usr/bin/env bash
# Build the initial character sprite library for /character page.
#
# Mask is TIGHT (top ~27%) — covers hair-zone only, leaves face untouched
# so the AI doesn't redraw eyes/mouth and break facial identity.
# Final compositing in postprocess.sh layers variant-head atop base-body.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PUB="$ROOT/../public/sprites/character"
mkdir -p "$PUB"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  set -a; . "$ROOT/../.env.local"; set +a
fi

MODEL="gpt-image-1"
SIZE="1024x1024"
QUALITY="high"

retry () {
  local label="$1"; shift
  local max=4; local try=1
  while :; do
    out=$("$@" 2>&1) && { echo "$out"; return 0; }
    err=$(echo "$out" | python3 -c "
import json,sys
raw=sys.stdin.read()
try: d=json.loads(raw); print(d.get('error',{}).get('message',''))
except: print(raw[:120])
" || true)
    if [ "$try" -ge "$max" ]; then echo "FAIL $label: $err" >&2; return 1; fi
    echo "  retry $try/$max in $((try*6))s — $err" >&2
    sleep $((try*6)); try=$((try+1))
  done
}

call_gen () {
  curl -sS https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json
print(json.dumps({'model':'$MODEL','prompt':'''$1'''.replace(chr(10),' '),'n':1,'size':'$SIZE','quality':'$QUALITY'}))
")"
}

call_edit () {
  local prompt="$1"
  curl -sS https://api.openai.com/v1/images/edits \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F "model=$MODEL" \
    -F "image[]=@$PUB/base.png" \
    -F "mask=@$PUB/_hair_mask.png" \
    -F "prompt=$prompt" \
    -F "n=1" -F "size=$SIZE" -F "quality=$QUALITY"
}

save_b64 () {
  python3 -c "import json,sys,base64;d=json.loads(sys.stdin.read());sys.stdout.buffer.write(base64.b64decode(d['data'][0]['b64_json']))"
}

# --- 1. Base (only if missing) ---
if [ ! -f "$PUB/base.png" ]; then
  BASE_PROMPT="A small pixel art character sprite, Habbo Hotel modern style, 3/4 front isometric view, \
  standing idle pose on flat ground, head-to-body ratio about 1:2, \
  visible neutral face with simple readable features clear small eyes and mouth, medium-fair skin, \
  completely BALD no hair on head, plain white short-sleeve t-shirt and dark blue jeans, brown shoes, \
  limited color palette 8-10 colors, soft 1px outline, no anti-aliasing, \
  centered on solid flat green #00FF00 chroma background, \
  full body visible from head to feet, no shadow, no environment, \
  pixel-perfect clean lines, retro pixel game aesthetic, contemporary, \
  the character occupies the center 70% of the frame"
  echo "→ generating base..."
  RESP=$(retry "base" call_gen "$BASE_PROMPT")
  echo "$RESP" | save_b64 > "$PUB/base.png"
  echo "  ✓ $PUB/base.png"
else
  echo "→ base.png exists, skipping. Delete it to regenerate."
fi

# --- 2. Hair mask (top ~27% only — hair zone, not face) ---
echo "→ creating tight hair-zone mask..."
python3 <<PY
from PIL import Image
img = Image.open('$PUB/base.png').convert('RGBA')
W,H = img.size
mask = Image.new('RGBA',(W,H),(255,255,255,255))
# Wide mask (top 40%) — give the model room for full-volume hair (afro, etc.).
# Face modifications in this region are OK; postprocess uses diff-extraction
# to keep only the new-hair pixels and discard any face-region changes.
cutoff = int(H*0.40)
for y in range(cutoff):
    for x in range(W):
        mask.putpixel((x,y),(0,0,0,0))
mask.save('$PUB/_hair_mask.png')
print('  ✓ mask cutoff y=', cutoff)
PY

# --- 3. Hair variants ---
HAIRS=(
  "01|short messy black hair on top of the head"
  "02|long straight brown hair tied back in a ponytail, hair visible at top of head"
  "03|short side-parted blonde undercut hairstyle on top of head"
  "04|dark curly afro hairstyle on top of head"
  "05|shoulder length wavy auburn hair on top of head"
  "06|slicked back jet black hair on top of head"
)

for entry in "${HAIRS[@]}"; do
  IFS='|' read -r idx desc <<< "$entry"
  echo "→ hair-$idx ($desc)..."
  PROMPT="Add $desc to this bald pixel art character. Keep the face, body, skin tone, clothing, and pose exactly the same. Only add hair on the top of the head. Pixel art, Habbo style, 3/4 isometric, soft 1px outline, limited palette."
  RESP=$(retry "hair-$idx" call_edit "$PROMPT")
  echo "$RESP" | save_b64 > "$PUB/hair-$idx.png"
  echo "  ✓ $PUB/hair-$idx.png"
done

echo ""
echo "✓ library rebuilt."
