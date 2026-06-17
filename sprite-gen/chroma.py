#!/usr/bin/env python3
"""Chroma-key a single PNG: stdin → stdout.

Used by the /api/generate-character route to clean raw gpt-image-1 output
before sending to the client. Same logic as postprocess.sh.
"""
import sys
from io import BytesIO
from PIL import Image

def chroma_to_alpha(img):
    img = img.convert("RGBA")
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
    if not found: return None
    return minx, miny, maxx + 1, maxy + 1

def main():
    data = sys.stdin.buffer.read()
    img = Image.open(BytesIO(data))
    img = chroma_to_alpha(img)
    bbox = bbox_visible(img)
    if bbox is not None:
        pad = 12
        bbox = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(img.size[0], bbox[2] + pad),
            min(img.size[1], bbox[3] + pad),
        )
        img = img.crop(bbox)
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    sys.stdout.buffer.write(buf.getvalue())

if __name__ == "__main__":
    main()
