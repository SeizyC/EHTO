#!/usr/bin/env bash
# Post-process sprites into TRUE LAYERED format:
#
#   processed/base.png       — full character (bald + face + clothes), transparent bg
#   processed/hair-XX.png    — hair-only overlay, transparent bg, same canvas as base
#
# Hair extraction: a pixel is "new hair" iff base is transparent at (x,y) AND
# variant is visible at (x,y), within the upper region.  This keeps the
# AI-drawn hair while discarding any face modifications it made.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/../public/sprites/character"
DST="$SRC/processed"
mkdir -p "$DST"

python3 <<'PY'
from PIL import Image
import os, glob

SRC = '/Users/hans1/EHTO/public/sprites/character'
DST = os.path.join(SRC, 'processed')

# Scalp zone: above the eye line. Hair sits on top of head (replacing skin)
# and above the head silhouette. Below the eye line is FACE — never replaced.
# Base eye line is around y=275 of the 1024 frame → use 24%.
SCALP_ZONE_FRAC = 0.24
# Color distance below which we consider variant unchanged (same skin/etc.).
HAIR_DIFF_THRESHOLD = 70

def chroma_to_alpha(img):
    """Cut green-keyed pixels including dark ground-shadow greens."""
    img = img.convert('RGBA')
    px = img.load()
    W, H = img.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            green_dom = g - max(r, b)
            if green_dom > 30 and g > 100:
                px[x, y] = (r, g, b, 0); continue
            if green_dom > 14 and g > 50 and r < 130 and b < 130:
                px[x, y] = (r, g, b, 0); continue
            if green_dom > 10 and g > 90:
                v = (r + b) // 2
                px[x, y] = (r, v, b, max(0, a - 80))
    return img

def bbox_visible(img, threshold=96):
    px = img.load()
    W, H = img.size
    minx, miny, maxx, maxy = W, H, 0, 0
    found = False
    for y in range(H):
        for x in range(W):
            if px[x, y][3] > threshold:
                found = True
                if x < minx: minx = x
                if y < miny: miny = y
                if x > maxx: maxx = x
                if y > maxy: maxy = y
    if not found:
        return None
    return minx, miny, maxx + 1, maxy + 1

def extract_hair_layer(base_alpha, variant_alpha):
    """Hair-only overlay within the SCALP zone (above eye line).
    Two cases:
      (a) base is transparent (sky above head) + variant visible → hair pixel
      (b) base is opaque (scalp skin) + variant differs in color → hair pixel
          (i.e. AI drew hair ON the scalp, overwriting the skin colour)
    Below the scalp zone, NOTHING is extracted — that protects face features."""
    W, H = base_alpha.size
    zmax = int(H * SCALP_ZONE_FRAC)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    bp = base_alpha.load(); vp = variant_alpha.load(); op = out.load()
    for y in range(zmax):
        for x in range(W):
            br, bg, bb, ba = bp[x, y]
            vr, vg, vb, va = vp[x, y]
            if va < 64:
                continue
            if ba < 64:
                # (a) Above the head silhouette
                op[x, y] = vp[x, y]
            else:
                # (b) On the scalp — keep if colour changed substantially
                diff = abs(br - vr) + abs(bg - vg) + abs(bb - vb)
                if diff > HAIR_DIFF_THRESHOLD:
                    op[x, y] = vp[x, y]
    return out

# ---- 1. Process base ----
print('→ base.png')
base_alpha = chroma_to_alpha(Image.open(os.path.join(SRC, 'base.png')))

# Compute COMMON crop frame (union of base extent + max hair extent).
# Use base bbox then pad upward generously for tall hair, sideways for wide hair.
base_bbox = bbox_visible(base_alpha)
if base_bbox is None:
    raise RuntimeError("base.png has no visible pixels after chroma key")
W, H = base_alpha.size
pad_top    = int(H * 0.08)   # allow tall afros above base head
pad_side   = int(W * 0.04)   # allow wide hair past base silhouette
pad_bot    = 8
frame = (
    max(0, base_bbox[0] - pad_side),
    max(0, base_bbox[1] - pad_top),
    min(W, base_bbox[2] + pad_side),
    min(H, base_bbox[3] + pad_bot),
)
print(f'  common frame: {frame}  size=({frame[2]-frame[0]}, {frame[3]-frame[1]})')

# Save common frame size for downstream
base_cropped = base_alpha.crop(frame)
base_cropped.save(os.path.join(DST, 'base.png'))
print(f'  ✓ processed/base.png')

# ---- 2. Variants: extract hair-only layer, crop to same frame ----
for src in sorted(glob.glob(os.path.join(SRC, 'hair-*.png'))):
    name = os.path.basename(src)
    print(f'→ {name}')
    variant_alpha = chroma_to_alpha(Image.open(src))
    hair = extract_hair_layer(base_alpha, variant_alpha)
    hair_cropped = hair.crop(frame)
    hair_cropped.save(os.path.join(DST, name))
    # Diagnostics
    hb = bbox_visible(hair_cropped, threshold=64)
    print(f'  ✓ processed/{name}  hair extent: {hb}')

print('done.')
PY
