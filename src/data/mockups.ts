import type { FeedItem, Member, Mood, Outfit } from "@/types/world";

export interface MockupScenario {
  id: string;
  group: "mood" | "social";
  title: string;
  subtitle: string;
  mood: Mood;
  worldTitle: string;
  socialEnergy: number;
  members: Member[];
  bubbles: Record<string, string | null>;
  feed: FeedItem[];
  ambient?: {
    rain?: boolean;
    clutter?: boolean;
    warm?: boolean;
    void?: boolean;
  };
}

const W = "w_mock";

const OUTFITS: Record<string, Outfit> = {
  earth: { shirt: "#7a4a2a", pants: "#3a2418", hat: { kind: "beanie", color: "#d09060" } },
  cyan: { shirt: "#2a4ac8", pants: "#1a1f3a" },
  green: { shirt: "#5a7a4a", pants: "#2c3a22" },
  grey: { shirt: "#3a3a4a", pants: "#1a1a26" },
  pink: { shirt: "#c8385a", pants: "#3a1a26", hat: { kind: "cap", color: "#ffd55a" } },
  yellow: { shirt: "#d4a83a", pants: "#5a3e15", hat: { kind: "halo" } },
  purple: { shirt: "#6a3aa8", pants: "#2c1858" },
};

function m(
  id: string,
  name: string,
  creature: Member["creature"],
  tile: { col: number; row: number },
  outfit: Outfit,
  overrides: Partial<Member> = {},
): Member {
  return {
    id,
    worldId: W,
    name,
    role: "core",
    creature,
    persona: "",
    speechStyle: "",
    presence: "active",
    activityWeight: 0.5,
    tile,
    outfit,
    ...overrides,
  };
}

function f(
  id: string,
  type: FeedItem["type"],
  content: string,
  minutesAgo: number,
  actorId?: string,
): FeedItem {
  return {
    id,
    worldId: W,
    type,
    actorId,
    content,
    createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  };
}

// --- Mood scenarios -------------------------------------------------------

const cozyMembers: Member[] = [
  m("c1", "moss", "cozy_spirit", { col: 2, row: 3 }, OUTFITS.earth),
  m("c2", "muz", "tiny_monster", { col: 4, row: 4 }, OUTFITS.pink),
  m("c3", "lull", "sleepy_blob", { col: 5, row: 6 }, OUTFITS.green, { presence: "idle" }),
  m("c4", "404", "glitch_robot", { col: 6, row: 2 }, OUTFITS.cyan),
];

const rainyMembers: Member[] = [
  m("r1", "moss", "cozy_spirit", { col: 2, row: 3 }, OUTFITS.earth),
  m("r2", "404", "glitch_robot", { col: 5, row: 2 }, OUTFITS.cyan),
  m("r3", "lull", "sleepy_blob", { col: 4, row: 5 }, OUTFITS.green, { presence: "idle" }),
  m("r4", "veil", "floating_ghost", { col: 6, row: 6 }, OUTFITS.grey, { presence: "lurking" }),
  m("r5", "muz", "tiny_monster", { col: 1, row: 6 }, OUTFITS.pink),
];

const chaoticMembers: Member[] = [
  m("h1", "muz", "tiny_monster", { col: 2, row: 3 }, OUTFITS.pink),
  m("h2", "404", "glitch_robot", { col: 5, row: 2 }, OUTFITS.cyan),
  m("h3", "moss", "cozy_spirit", { col: 6, row: 4 }, OUTFITS.earth),
  m("h4", "snap", "tiny_monster", { col: 3, row: 5 }, OUTFITS.yellow),
  m("h5", "lull", "sleepy_blob", { col: 6, row: 6 }, OUTFITS.green),
  m("h6", "veil", "floating_ghost", { col: 1, row: 6 }, OUTFITS.purple),
];

const lonelyMembers: Member[] = [
  m("l1", "moss", "cozy_spirit", { col: 4, row: 4 }, OUTFITS.earth),
  m("l2", "veil", "floating_ghost", { col: 6, row: 7 }, OUTFITS.grey, { presence: "lurking" }),
];

// --- Social state scenarios ----------------------------------------------

const hypeMembers: Member[] = [
  m("y1", "muz", "tiny_monster", { col: 3, row: 4 }, OUTFITS.pink),
  m("y2", "404", "glitch_robot", { col: 4, row: 4 }, OUTFITS.cyan),
  m("y3", "snap", "tiny_monster", { col: 4, row: 3 }, OUTFITS.yellow),
  m("y4", "moss", "cozy_spirit", { col: 3, row: 3 }, OUTFITS.earth),
];

const awkwardMembers: Member[] = [
  m("a1", "moss", "cozy_spirit", { col: 1, row: 2 }, OUTFITS.earth),
  m("a2", "404", "glitch_robot", { col: 7, row: 2 }, OUTFITS.cyan),
  m("a3", "lull", "sleepy_blob", { col: 4, row: 7 }, OUTFITS.green, { presence: "idle" }),
];

const lurkingMembers: Member[] = [
  m("k1", "veil", "floating_ghost", { col: 7, row: 1 }, OUTFITS.grey, { presence: "lurking" }),
  m("k2", "veil", "floating_ghost", { col: 1, row: 7 }, OUTFITS.grey, { presence: "lurking" }),
  m("k3", "lull", "sleepy_blob", { col: 4, row: 4 }, OUTFITS.green, { presence: "idle" }),
];

const clutterMembers: Member[] = [
  m("x1", "muz", "tiny_monster", { col: 2, row: 2 }, OUTFITS.pink),
  m("x2", "snap", "tiny_monster", { col: 3, row: 5 }, OUTFITS.yellow),
  m("x3", "404", "glitch_robot", { col: 5, row: 2 }, OUTFITS.cyan),
  m("x4", "404", "glitch_robot", { col: 6, row: 5 }, OUTFITS.cyan),
  m("x5", "moss", "cozy_spirit", { col: 4, row: 4 }, OUTFITS.earth),
  m("x6", "veil", "floating_ghost", { col: 6, row: 7 }, OUTFITS.grey, { presence: "lurking" }),
  m("x7", "lull", "sleepy_blob", { col: 1, row: 6 }, OUTFITS.green, { presence: "idle" }),
];

export const mockups: MockupScenario[] = [
  {
    id: "mood-cozy",
    group: "mood",
    title: "Cozy",
    subtitle: "warm lighting · 느린 이동",
    mood: "cozy",
    worldTitle: "따뜻한 방",
    socialEnergy: 0.55,
    members: cozyMembers,
    bubbles: { c1: "오늘 좀 따뜻하네", c2: "응응" },
    feed: [
      f("cf1", "presence", "lull이 잠시 졸기 시작", 8),
      f("cf2", "conversation", "오늘 좀 따뜻하네", 5, "c1"),
      f("cf3", "conversation", "응응", 4, "c2"),
      f("cf4", "drift", "방 전체에 미온이 깔림", 2),
    ],
    ambient: { warm: true },
  },
  {
    id: "mood-rainy",
    group: "mood",
    title: "Rainy",
    subtitle: "blue tone · 정적이 길어짐",
    mood: "rainy",
    worldTitle: "새벽 음악방",
    socialEnergy: 0.32,
    members: rainyMembers,
    bubbles: { r1: "이 노래 좋네", r2: "나 아직 안 잠" },
    feed: [
      f("rf1", "presence", "veil이 조용히 들어왔다", 23),
      f("rf2", "conversation", "이 노래 좋네", 18, "r1"),
      f("rf3", "media", "muz가 playlist를 흘려보냄", 12, "r5"),
      f("rf4", "drift", "방의 분위기가 점점 가라앉음", 7),
      f("rf5", "conversation", "나 아직 안 잠", 2, "r2"),
    ],
    ambient: { rain: true },
  },
  {
    id: "mood-chaotic",
    group: "mood",
    title: "Chaotic",
    subtitle: "clutter 증가 · 빠른 박자",
    mood: "chaotic",
    worldTitle: "정신없는 인터넷 방",
    socialEnergy: 0.92,
    members: chaoticMembers,
    bubbles: { h1: "ㄴㄴㄴㄴ", h2: "1111", h3: "잠시만요", h4: "ㄹㅇ" },
    feed: [
      f("hf1", "event", "muz가 갑자기 밈을 던졌다", 4),
      f("hf2", "conversation", "ㄴㄴㄴㄴ", 3, "h1"),
      f("hf3", "conversation", "1111", 3, "h2"),
      f("hf4", "conversation", "잠시만요", 2, "h3"),
      f("hf5", "conversation", "ㄹㅇ", 1, "h4"),
      f("hf6", "drift", "방의 박자가 빨라지는 중", 0),
    ],
    ambient: { clutter: true },
  },
  {
    id: "mood-lonely",
    group: "mood",
    title: "Lonely",
    subtitle: "빈 공간 강조 · 거의 침묵",
    mood: "lonely",
    worldTitle: "오늘은 다들 없네",
    socialEnergy: 0.08,
    members: lonelyMembers,
    bubbles: {},
    feed: [
      f("lf1", "presence", "veil이 멀리서 떠있다", 47),
      f("lf2", "drift", "이 방은 조용해지고 있다", 30),
      f("lf3", "presence", "오랫동안 아무도 말하지 않았다", 12),
    ],
    ambient: { void: true },
  },
  {
    id: "social-hype",
    group: "social",
    title: "Hype burst",
    subtitle: "proximity 좁아짐 · 연속 bubble",
    mood: "chaotic",
    worldTitle: "방금 뭐가 터졌다",
    socialEnergy: 0.95,
    members: hypeMembers,
    bubbles: { y1: "ㅋㅋㅋㅋㅋ", y2: "ㄹㅇ", y3: "이거 봐봐", y4: "?????" },
    feed: [
      f("yf1", "event", "snap이 무언가 공유함", 2),
      f("yf2", "conversation", "이거 봐봐", 1, "y3"),
      f("yf3", "conversation", "?????", 1, "y4"),
      f("yf4", "conversation", "ㅋㅋㅋㅋㅋ", 0, "y1"),
      f("yf5", "conversation", "ㄹㅇ", 0, "y2"),
    ],
  },
  {
    id: "social-awkward",
    group: "social",
    title: "Awkward silence",
    subtitle: "거리 유지 · 긴 침묵",
    mood: "lonely",
    worldTitle: "방금 분위기가 묘해짐",
    socialEnergy: 0.15,
    members: awkwardMembers,
    bubbles: {},
    feed: [
      f("af1", "conversation", "...", 6, "a1"),
      f("af2", "presence", "404가 멀리 이동함", 4),
      f("af3", "drift", "방의 거리감이 늘어남", 1),
    ],
  },
  {
    id: "social-lurking",
    group: "social",
    title: "Lurking only",
    subtitle: "전부 lurking · 가끔 깜빡임",
    mood: "rainy",
    worldTitle: "지켜만 보는 방",
    socialEnergy: 0.2,
    members: lurkingMembers,
    bubbles: {},
    feed: [
      f("kf1", "presence", "veil이 두 명 됨", 22),
      f("kf2", "presence", "아무도 말하지 않음", 10),
      f("kf3", "drift", "분위기가 유지되는 중", 3),
    ],
  },
  {
    id: "social-clutter",
    group: "social",
    title: "Chaotic clutter",
    subtitle: "겹치는 위치 · 정신없음",
    mood: "chaotic",
    worldTitle: "다 같이 떠드는 방",
    socialEnergy: 0.88,
    members: clutterMembers,
    bubbles: { x1: "ㅋㅋ", x3: "ㄴㄴ", x4: "ㄱㄱ", x5: "잠시" },
    feed: [
      f("xf1", "event", "동시에 여러 명이 등장", 3),
      f("xf2", "conversation", "ㅋㅋ", 2, "x1"),
      f("xf3", "conversation", "ㄴㄴ", 2, "x3"),
      f("xf4", "conversation", "ㄱㄱ", 1, "x4"),
      f("xf5", "drift", "방이 좁아 보이는 중", 0),
    ],
    ambient: { clutter: true },
  },
];

export const mockupGroups = {
  mood: mockups.filter((m) => m.group === "mood"),
  social: mockups.filter((m) => m.group === "social"),
};

export function findMockup(id: string) {
  return mockups.find((m) => m.id === id);
}
