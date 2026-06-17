// Character generation options and prompt builder.
// User picks across 6 axes: gender · skin · outfit · hair-style · hair-color
// · accessory.  ~3 × 7 × 10 × 8 × 5 × 5 = 42,000 distinct combinations.

export const GENDERS = [
  { id: "m",  label: "남",   desc: "masculine looking person" },
  { id: "f",  label: "여",   desc: "feminine looking person" },
  { id: "nb", label: "중성", desc: "androgynous looking person, gender-neutral features" },
] as const;

export const SKINS = [
  { id: "porcelain", label: "백자",   desc: "very pale porcelain skin" },
  { id: "fair",      label: "옅은",   desc: "fair pale skin" },
  { id: "olive",     label: "올리브", desc: "olive skin tone" },
  { id: "tan",       label: "구릿빛", desc: "warm tan skin" },
  { id: "bronze",    label: "브론즈", desc: "rich bronze skin tone" },
  { id: "brown",     label: "갈색",   desc: "deep brown skin" },
  { id: "dark",      label: "짙은",   desc: "very dark rich brown skin" },
] as const;

export const OUTFITS = [
  { id: "casual",  label: "캐주얼",  desc: "casual everyday outfit, simple t-shirt and jeans, sneakers" },
  { id: "street",  label: "스트릿",  desc: "streetwear outfit, oversized hoodie, baggy cargo pants, chunky sneakers" },
  { id: "minimal", label: "미니멀",  desc: "minimalist clean outfit, plain solid color top and pants, neutral palette" },
  { id: "vintage", label: "빈티지",  desc: "vintage retro outfit, two-tone tracksuit or 90s style clothing" },
  { id: "smart",   label: "댄디",    desc: "smart casual outfit, button-up shirt and chinos, loafers" },
  { id: "sporty",  label: "스포티",  desc: "athletic sporty outfit, fitted athleisure top and joggers, performance sneakers" },
  { id: "punk",    label: "펑크",    desc: "alt rocker outfit, dark cropped jacket, black slim pants, chunky boots" },
  { id: "artsy",   label: "아티",    desc: "creative bohemian outfit, oversized layered top, wide-leg pants, expressive textures" },
  { id: "cozy",    label: "포근",    desc: "cozy loungewear outfit, oversized knit sweater and soft pants, slip-on shoes" },
  { id: "preppy",  label: "프레피",  desc: "preppy outfit, fitted cardigan or polo, pleated skirt or chinos, loafers" },
] as const;

export const HAIR_STYLES = [
  { id: "short",     label: "짧음",    desc: "short cropped hair" },
  { id: "medium",    label: "단발",    desc: "medium length neat hair" },
  { id: "long",      label: "길게",    desc: "long flowing hair" },
  { id: "buzz",      label: "삭발",    desc: "buzz cut, very short hair" },
  { id: "ponytail",  label: "포니",    desc: "hair tied in a ponytail" },
  { id: "bun",       label: "올림",    desc: "hair in a small top bun" },
  { id: "curly",     label: "곱슬",    desc: "curly textured hair" },
  { id: "waves",     label: "웨이브",  desc: "shoulder length wavy hair" },
] as const;

export const HAIR_COLORS = [
  { id: "black",  label: "검정", desc: "jet black" },
  { id: "brown",  label: "갈색", desc: "warm brown" },
  { id: "blonde", label: "금발", desc: "blonde" },
  { id: "dyed",   label: "염색", desc: "bold dyed color, pastel pink or mint or lavender" },
  { id: "gray",   label: "회색", desc: "ash gray" },
] as const;

export const ACCESSORIES = [
  { id: "none",     label: "없음",   desc: "no accessories on face or head" },
  { id: "glasses",  label: "안경",   desc: "simple round eyeglasses" },
  { id: "hat",      label: "모자",   desc: "a simple cap or beanie" },
  { id: "earrings", label: "귀걸이", desc: "small subtle earrings" },
  { id: "scarf",    label: "스카프", desc: "a thin scarf around the neck" },
] as const;

export type GenderId    = (typeof GENDERS)[number]["id"];
export type SkinId      = (typeof SKINS)[number]["id"];
export type OutfitId    = (typeof OUTFITS)[number]["id"];
export type HairStyleId = (typeof HAIR_STYLES)[number]["id"];
export type HairColorId = (typeof HAIR_COLORS)[number]["id"];
export type AccessoryId = (typeof ACCESSORIES)[number]["id"];

export type CharacterChoice = {
  gender:     GenderId;
  skin:       SkinId;
  outfit:     OutfitId;
  hairStyle:  HairStyleId;
  hairColor:  HairColorId;
  accessory:  AccessoryId;
};

export function buildPrompt(choice: CharacterChoice): {
  prompt: string;
  /** Human-readable summary stored in the DB for reproducibility. */
  rolled: { hair: string };
} {
  const gender    = GENDERS.find((g) => g.id === choice.gender)!;
  const skin      = SKINS.find((s) => s.id === choice.skin)!;
  const outfit    = OUTFITS.find((o) => o.id === choice.outfit)!;
  const hairStyle = HAIR_STYLES.find((h) => h.id === choice.hairStyle)!;
  const hairColor = HAIR_COLORS.find((c) => c.id === choice.hairColor)!;
  const accessory = ACCESSORIES.find((a) => a.id === choice.accessory)!;

  const hair = `${hairColor.desc} ${hairStyle.desc}`;

  const prompt = [
    "A pixel art character sprite, modern social-app style, 3/4 front isometric view,",
    "standing idle pose on flat ground,",
    "head about 1/3 of total height — large enough that the face is clearly readable at small sizes,",
    `clearly visible front-facing face with recognizable features (two distinct eyes, nose, mouth), ${skin.desc},`,
    `${gender.desc}, ${hair},`,
    `${outfit.desc},`,
    `${accessory.desc},`,
    "limited color palette 8-10 colors, soft 1px outline, no anti-aliasing,",
    "fully transparent background — the API returns PNG with alpha channel,",
    "full body visible from head to feet, no shadow, no environment,",
    "pixel-perfect clean lines, retro pixel game aesthetic but contemporary urban not fantasy,",
    "the character occupies the center 70% of the frame,",
    "face must be readable — do NOT obscure with hat brim, hood, hair covering eyes, or facing away,",
    "not faceless, not anime chibi, not fantasy RPG, no animal features, no weapons, contemporary social character",
  ].join(" ");

  return { prompt, rolled: { hair } };
}
