// Build a gpt-image-1 prompt for an ai_character's sprite. Persona-driven
// so the generated face/outfit echoes their backstory and affinity tags
// (e.g. weekendrun → athletic, casual; 심야서가 → introspective, layered).

type SpriteSpec = {
  name: string;
  affinity: string[];
  speech_style: string | null;
  backstory: string | null;
};

// Cheap deterministic hash → "stable variety" so the same character gets
// the same gender/skin presentation across regenerations unless persona
// changes.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}

const SKIN_TONES = [
  "fair pale skin",
  "warm beige skin",
  "olive skin tone",
  "warm tan skin",
  "deep brown skin",
];
const GENDER_HINTS = [
  "androgynous looking person, gender-neutral features",
  "masculine looking person",
  "feminine looking person",
];

function outfitFromPersona(p: SpriteSpec): string {
  const aff = p.affinity.map((a) => a.toLowerCase());
  const has = (...ks: string[]) => ks.some((k) => aff.includes(k));
  if (has("sports", "energy", "운동", "주말")) return "athletic athleisure: fitted tee, joggers, running sneakers";
  if (has("tech", "링크 공유", "호기심")) return "minimalist tech outfit: plain crewneck and dark slim pants, sneakers";
  if (has("book", "책", "독서", "사색", "심야")) return "layered indie outfit: open cardigan over plain tee, loose pants, soft shoes";
  if (has("food", "cozy", "위안", "주말")) return "cozy loungewear: oversized knit sweater, soft pants, slip-on shoes";
  if (has("chaotic", "밈", "playful", "농담")) return "streetwear: graphic hoodie, baggy cargo pants, chunky sneakers";
  if (has("minimal", "심플", "calm", "철학")) return "minimalist outfit: monochrome top and pants, neutral palette, clean sneakers";
  if (has("새벽", "음악", "indie", "정서", "우울")) return "moody outfit: dark hoodie or jacket, slim pants, simple sneakers";
  if (has("따뜻", "공감", "케어")) return "soft outfit: pastel cardigan or sweatshirt, comfortable pants";
  if (has("work", "야근", "출근", "피로")) return "smart casual: button-up shirt and chinos, loafers";
  return "casual everyday outfit: simple t-shirt and jeans, sneakers";
}

function hairFromPersona(p: SpriteSpec): string {
  const aff = p.affinity.map((a) => a.toLowerCase());
  const has = (...ks: string[]) => ks.some((k) => aff.includes(k));
  if (has("sports", "energy", "운동")) return "short cropped natural-brown hair";
  if (has("chaotic", "밈", "playful")) return "messy medium hair, slightly tousled";
  if (has("minimal", "심플", "calm")) return "neat short black hair";
  if (has("새벽", "심야", "indie", "우울")) return "medium dark hair, soft fringe over forehead";
  if (has("따뜻", "공감", "케어")) return "shoulder-length wavy warm-brown hair";
  if (has("책", "독서", "사색")) return "medium length neat dark hair";
  return "medium length natural hair";
}

export function buildAiSpritePrompt(p: SpriteSpec): string {
  const h = hash(p.name);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const gender = GENDERS(p, h);
  const outfit = outfitFromPersona(p);
  const hair = hairFromPersona(p);
  return [
    "A pixel art character sprite, modern social-app style, 3/4 front isometric view,",
    // Pin a CONSISTENT default facing: head and body turned slightly to the
    // RIGHT. The plaza renderer assumes right-facing sprites and only mirrors
    // (scaleX -1) when a character walks left — an unspecified/mixed facing
    // makes some characters appear to moonwalk. Keep this in lockstep with the
    // flip convention in position-drift.ts / PlazaCanvas / LivingPlaza.
    "the head and body are turned slightly to the RIGHT (facing right), consistent right-facing 3/4 orientation,",
    "standing idle pose on flat ground,",
    "head about 1/3 of total height — large enough that the face is clearly readable at small sizes,",
    `clearly visible front-facing face with recognizable features (two distinct eyes, nose, mouth), ${skin},`,
    `${gender}, ${hair},`,
    `${outfit},`,
    "no accessories on face,",
    "limited color palette 8-10 colors, soft 1px outline, no anti-aliasing,",
    "fully transparent background — the API returns PNG with alpha channel,",
    "full body visible from head to feet, no shadow, no environment,",
    "pixel-perfect clean lines, retro pixel game aesthetic but contemporary urban not fantasy,",
    "the character occupies the center 70% of the frame,",
    "face must be readable — do NOT obscure with hat brim, hood, hair covering eyes, or facing away,",
    "not faceless, not anime chibi, not big head chibi, not fantasy RPG, no animal features, no weapons, contemporary social character",
  ].join(" ");
}

function GENDERS(p: SpriteSpec, h: number): string {
  // Some explicit names suggest a presentation; otherwise stable-randomize.
  const n = p.name;
  if (/(아|연|채|민|아|지호)/.test(n)) return GENDER_HINTS[2]; // feminine bias for soft-toned KR names
  if (/(준|도현|강이|노아|haru)/.test(n)) return GENDER_HINTS[1];
  return GENDER_HINTS[h % 3];
}
