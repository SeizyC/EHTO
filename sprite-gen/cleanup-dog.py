#!/usr/bin/env python3
"""Clean up legacy dog sprites that shipped with two artifacts:

  - Near-white background bleed at the edges (visible as a faint
    rectangular box around the shiba sprite).
  - A gray cast-shadow rendered into the lower portion of the sprite
    (most obvious under the white maltese).

The flow:
  1. Flood-fill the alpha=0 mark from every corner inward, eating
     contiguous near-white pixels. Stops where the sprite body begins.
  2. After flood, sweep the bottom 30% of the canvas for low-saturation
     gray pixels (the shadow region) and zero their alpha too. The
     check uses a tight saturation+brightness window so cream-colored
     dog bellies survive.

Usage:
  python3 sprite-gen/cleanup-dog.py <input.png> <output.png>
"""
import sys
from collections import deque
from PIL import Image

NEAR_WHITE_RGB_MIN = 200      # all RGB channels >= this → near-white
                              # (was 235; relaxed for shiba's off-white box)
SHADOW_BRIGHTNESS_MIN = 100    # gray shadow brightness window
SHADOW_BRIGHTNESS_MAX = 215
SHADOW_MAX_CHROMA = 18         # max(R,G,B) - min(R,G,B); shadow is low-sat
SHADOW_BOTTOM_FRACTION = 0.30  # bottom 30% only
TRANSPARENT_ALPHA_FLOOR = 8    # a <= this → snap to fully transparent (0,0,0,0)

def clear(px, x, y):
    # Zero RGB along with alpha. Some renderers (and the IDE preview)
    # composite alpha=0 pixels against a neutral background, which
    # makes the original gray/white RGB bleed through as a faint
    # shadow. Setting (0,0,0,0) guarantees a clean transparent pixel
    # everywhere.
    px[x, y] = (0, 0, 0, 0)

def is_near_white(r, g, b, a):
    return a > 0 and r >= NEAR_WHITE_RGB_MIN and g >= NEAR_WHITE_RGB_MIN and b >= NEAR_WHITE_RGB_MIN

def is_shadow_gray(r, g, b, a):
    if a == 0: return False
    bright = (r + g + b) // 3
    if bright < SHADOW_BRIGHTNESS_MIN or bright > SHADOW_BRIGHTNESS_MAX:
        return False
    chroma = max(r, g, b) - min(r, g, b)
    return chroma <= SHADOW_MAX_CHROMA

def flood_clear_edges(img):
    W, H = img.size
    px = img.load()
    visited = bytearray(W * H)
    q = deque()

    def push(x, y):
        if 0 <= x < W and 0 <= y < H and not visited[y * W + x]:
            r, g, b, a = px[x, y]
            if is_near_white(r, g, b, a):
                visited[y * W + x] = 1
                q.append((x, y))

    # Seed from every edge pixel.
    for x in range(W):
        push(x, 0); push(x, H - 1)
    for y in range(H):
        push(0, y); push(W - 1, y)

    while q:
        x, y = q.popleft()
        clear(px, x, y)
        push(x + 1, y); push(x - 1, y)
        push(x, y + 1); push(x, y - 1)

def remove_bottom_shadow(img):
    W, H = img.size
    px = img.load()
    y_start = int(H * (1.0 - SHADOW_BOTTOM_FRACTION))
    for y in range(y_start, H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if is_shadow_gray(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)

def snap_near_transparent(img):
    """Force RGB to (0,0,0) on every pixel whose alpha is at or below
    TRANSPARENT_ALPHA_FLOOR. Catches:
      - pixels that arrived already alpha=0 (their original gray/cream
        RGB would still leak through some renderers)
      - flood-skirt pixels that got partial transparency in earlier
        passes
    Removes the "faint box / shadow" rendering issue everywhere."""
    W, H = img.size
    px = img.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a <= TRANSPARENT_ALPHA_FLOOR:
                px[x, y] = (0, 0, 0, 0)

def main():
    if len(sys.argv) != 3:
        print("usage: cleanup-dog.py <in.png> <out.png>", file=sys.stderr)
        sys.exit(2)
    img = Image.open(sys.argv[1]).convert("RGBA")
    flood_clear_edges(img)
    remove_bottom_shadow(img)
    snap_near_transparent(img)
    img.save(sys.argv[2], format="PNG", optimize=True)

if __name__ == "__main__":
    main()
