# EHTO Sprite Generation — Prompt Design

## 목표

`gpt-image-1` (또는 `dall-e-3`)로 EHTO 캐릭터 미니미 sprite 생성.
디자인 문서 기준: **Habbo 풍 3/4 아이소메트릭 픽셀 미니미**, 약 32×56 그리드.

## 시각 정체성 정의

| 축 | 안 |
|---|---|
| Perspective | 3/4 front view, slightly above eye-level (isometric room에 자연스럽게 서있는 각도) |
| Proportion | head:body ≈ 1:2 (살짝 chibi지만 과하지 않게) |
| Style 기반 | 모던 Habbo Origins / Townscaper / Hytale의 pixel character 톤 |
| 톤 | 도시적 / 사회적 / 약간의 weirdness. RPG / 판타지 / 동물 아님. |
| Outline | soft single-pixel outline (검은색 강제 아님) |
| Palette | 8-12색 limited palette per sprite |
| Background | 단일 색 (chroma key 가능하도록) — 권장 #00FF00 또는 transparent |

## 프롬프트 템플릿 (v1)

### Base character (face/skin)

```
A small pixel art character sprite, Habbo Hotel modern style, 3/4 front isometric view,
standing idle pose on flat ground, head-to-body ratio about 1:2,
visible face with simple readable features (no detailed shading), {SKIN_TONE} skin,
limited color palette 8-10 colors, soft 1px outline, no anti-aliasing,
{HAIR_DESC}, {OUTFIT_DESC},
centered on a solid flat #00FF00 chroma green background,
full body visible from head to feet, no shadow, no environment,
pixel-perfect, clean lines, retro pixel game aesthetic but contemporary urban not fantasy,
512x512 image with the character occupying the center 70% of the frame
```

### Hair 변형 examples
- `short messy black hair`
- `long straight brown hair`
- `bleached buzz cut`
- `dark curly afro`
- `slicked back navy hair`

### Outfit 변형 examples
- `oversized white t-shirt and black baggy jeans`
- `hooded grey sweatshirt, sweatpants`
- `denim jacket over a band tee, slim black pants`
- `pastel cardigan over a plain shirt, pleated skirt`
- `vintage tracksuit, two-tone`

### Skin tone 변형
- `fair`, `medium-fair`, `olive`, `tan`, `deep brown`, `dark`

## 피해야 할 키워드 (negative-style)

명시 안 해도 자주 등장해서 의도와 어긋나는 것들:
- `cute mascot`, `chibi anime`, `kawaii`
- `fantasy adventurer`, `RPG hero`, `medieval`
- `furry`, `animal ears`, `VTuber`
- `realistic shading`, `oil painting`, `cell shaded`
- `dynamic action pose`

가능하면 프롬프트 끝에 `not cute mascot, not anime chibi, not fantasy RPG, no animal features, contemporary social character` 명시.

## 생성 → 후처리 파이프라인

```
[1] DALL-E generate at 1024×1024 (quality: high)
  ↓
[2] Detect character bounding box (chroma green or alpha)
  ↓
[3] Crop to tight character box
  ↓
[4] Downscale nearest-neighbor to target sprite size (예: 64×112, 32×56의 2배)
  ↓
[5] Background removal — replace chroma green with transparent alpha
  ↓
[6] Save as PNG with metadata (hair / outfit / skin tone tags)
```

후처리는 Python + Pillow 또는 ImageMagick으로 가능.

## 검증 기준 (퀄 OK / NG 판단)

샘플 3-5장 생성 후 다음 체크:

- [ ] **Perspective**: 3/4 isometric front view로 일관되게 나오는가? (top-down / 측면 X)
- [ ] **Style fidelity**: 모던 Habbo / 도시적 인디 pixel 느낌인가? RPG/판타지 톤이 빠졌는가?
- [ ] **Proportion**: head:body 비율 일관성
- [ ] **Readability**: 32×56 (또는 표시용 96×168)로 줄였을 때 캐릭터가 인식되는가?
- [ ] **Variation**: hair/outfit/skin tone 변경 시 같은 베이스 캐릭터로 보이는가? (consistency)
- [ ] **Background**: chroma key가 깔끔하게 분리되는가?

3개 이상 NG → 프롬프트 v2 또는 모델 변경 또는 로컬 SD 경로 재고려.

## 테스트 세트 (1차)

다음 5개 조합으로 시작:

| # | Skin | Hair | Outfit |
|---|---|---|---|
| 1 | fair | short messy black hair | oversized white t-shirt and black baggy jeans |
| 2 | tan | long straight brown hair | hooded grey sweatshirt, sweatpants |
| 3 | olive | bleached buzz cut | denim jacket over a band tee, slim black pants |
| 4 | deep brown | dark curly afro | vintage tracksuit, two-tone |
| 5 | medium-fair | slicked back navy hair | pastel cardigan, pleated skirt |

비용 예상 (gpt-image-1, high quality, 1024×1024): 약 $0.19 × 5 = **$0.95**
