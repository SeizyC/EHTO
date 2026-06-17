#!/usr/bin/env bash
# Run 1차 테스트 세트 — 5 sprites for feasibility judgment

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

./generate.sh test_01 "fair" "short messy black hair" "oversized white t-shirt and black baggy jeans"
./generate.sh test_02 "tan" "long straight brown hair" "hooded grey sweatshirt, sweatpants"
./generate.sh test_03 "olive" "bleached buzz cut" "denim jacket over a band tee, slim black pants"
./generate.sh test_04 "deep brown" "dark curly afro" "vintage tracksuit, two-tone"
./generate.sh test_05 "medium-fair" "slicked back navy hair" "pastel cardigan, pleated skirt"

echo ""
echo "✓ batch done. open ./out/test_*.png for visual review"
