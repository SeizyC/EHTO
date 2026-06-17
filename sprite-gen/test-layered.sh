#!/usr/bin/env bash
# Test B-path feasibility: base character + edit-based hair swap
#
# Workflow:
#   1. Generate base (bald, basic clothes)
#   2. Auto-generate mask covering head region
#   3. Call /v1/images/edits with base + mask + new hair prompt (x2)
#   4. Result: 3 images for comparison

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/out/layered"
mkdir -p "$OUT"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  set -a; . "$ROOT/../.env.local"; set +a
fi

MODEL="gpt-image-1"
SIZE="1024x1024"
QUALITY="high"

# --- Step 1: Generate BASE ---
BASE_PROMPT="A small pixel art character sprite, Habbo Hotel modern style, 3/4 front isometric view, \
standing idle pose on flat ground, head-to-body ratio about 1:2, \
visible neutral face with simple readable features, medium-fair skin, \
completely BALD no hair on head, plain white tank top and grey shorts only, \
limited color palette 8-10 colors, soft 1px outline, no anti-aliasing, \
centered on solid flat green #00FF00 chroma background, \
full body visible from head to feet, no shadow, no environment, \
pixel-perfect clean lines, retro pixel game aesthetic, contemporary, \
the character occupies the center 70% of the frame, \
not cute mascot, not anime, no animal features, no weapons"

echo "→ [1/3] generating base (bald)..."
REQ=$(python3 -c "
import json
print(json.dumps({'model':'$MODEL','prompt':'''$BASE_PROMPT'''.replace(chr(10),' '),'n':1,'size':'$SIZE','quality':'$QUALITY'}))
")
MAX_TRIES=4; TRY=1
while :; do
  RESP=$(curl -sS https://api.openai.com/v1/images/generations \
    -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" -d "$REQ")
  ERR=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error',{}).get('message','') if isinstance(d.get('error'),dict) else '')")
  if [ -z "$ERR" ]; then break; fi
  if [ "$TRY" -ge "$MAX_TRIES" ]; then echo "FAIL base: $ERR" >&2; exit 2; fi
  echo "  retry $TRY in $((TRY*6))s — $ERR" >&2; sleep $((TRY*6)); TRY=$((TRY+1))
done
echo "$RESP" | python3 -c "import json,sys,base64; d=json.load(sys.stdin); sys.stdout.buffer.write(base64.b64decode(d['data'][0]['b64_json']))" > "$OUT/base.png"
echo "  ✓ saved $OUT/base.png"

# --- Step 2: Create mask (head region) ---
# OpenAI mask convention: TRANSPARENT pixels = edit region, OPAQUE pixels = keep unchanged.
# Mask must be same size as input, PNG with alpha.
echo "→ [2/3] generating head mask (transparent top 45%)..."
python3 <<PY
from PIL import Image
import os
out = '$OUT'
img = Image.open(os.path.join(out,'base.png')).convert('RGBA')
W,H = img.size
mask = Image.new('RGBA',(W,H),(255,255,255,255))  # fully opaque = keep
# Top 45% transparent = editable head region
for y in range(int(H*0.45)):
    for x in range(W):
        mask.putpixel((x,y),(0,0,0,0))
mask.save(os.path.join(out,'head_mask.png'))
print('  ✓ saved head_mask.png  size=', mask.size)
PY

# --- Step 3: Edit base with new hair, x2 ---
edit_with_hair () {
  local NAME="$1"
  local HAIR_DESC="$2"
  local PROMPT="A small pixel art character sprite, Habbo Hotel modern style, 3/4 front isometric view, standing idle, with $HAIR_DESC, pixel-perfect retro game style, soft 1px outline, limited palette, contemporary"
  echo "→ edit: $NAME ($HAIR_DESC)"
  MAX_TRIES=4; TRY=1
  while :; do
    RESP=$(curl -sS https://api.openai.com/v1/images/edits \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -F "model=$MODEL" \
      -F "image[]=@$OUT/base.png" \
      -F "mask=@$OUT/head_mask.png" \
      -F "prompt=$PROMPT" \
      -F "n=1" \
      -F "size=$SIZE" \
      -F "quality=$QUALITY")
    ERR=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('error',{}).get('message','') if isinstance(d.get('error'),dict) else '')")
    if [ -z "$ERR" ]; then break; fi
    if [ "$TRY" -ge "$MAX_TRIES" ]; then echo "  FAIL $NAME: $ERR" >&2; return 1; fi
    echo "  retry $TRY in $((TRY*6))s — $ERR" >&2; sleep $((TRY*6)); TRY=$((TRY+1))
  done
  echo "$RESP" | python3 -c "import json,sys,base64;d=json.load(sys.stdin);sys.stdout.buffer.write(base64.b64decode(d['data'][0]['b64_json']))" > "$OUT/$NAME.png"
  echo "  ✓ saved $OUT/$NAME.png"
}

edit_with_hair "variant_A_buzzcut" "short bleached buzz cut"
edit_with_hair "variant_B_afro" "dark curly afro hairstyle"

echo ""
echo "✓ done. compare: $OUT/base.png  vs  variant_A_buzzcut.png  vs  variant_B_afro.png"
