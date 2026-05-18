import type { FeedItem, Member, Mood } from "@/types/world";

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

function m(
  id: string,
  name: string,
  creature: Member["creature"],
  pos: { x: number; y: number },
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
    pos,
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
  m("c1", "moss", "cozy_spirit", { x: 0.32, y: 0.5 }),
  m("c2", "muz", "tiny_monster", { x: 0.45, y: 0.55 }),
  m("c3", "lull", "sleepy_blob", { x: 0.7, y: 0.65 }, { presence: "idle" }),
  m("c4", "404", "glitch_robot", { x: 0.6, y: 0.35 }),
];

const rainyMembers: Member[] = [
  m("r1", "moss", "cozy_spirit", { x: 0.28, y: 0.45 }),
  m("r2", "404", "glitch_robot", { x: 0.66, y: 0.32 }),
  m("r3", "lull", "sleepy_blob", { x: 0.48, y: 0.68 }, { presence: "idle" }),
  m("r4", "veil", "floating_ghost", { x: 0.82, y: 0.78 }, { presence: "lurking" }),
  m("r5", "muz", "tiny_monster", { x: 0.18, y: 0.78 }),
];

const chaoticMembers: Member[] = [
  m("h1", "muz", "tiny_monster", { x: 0.22, y: 0.42 }),
  m("h2", "404", "glitch_robot", { x: 0.55, y: 0.28 }),
  m("h3", "moss", "cozy_spirit", { x: 0.78, y: 0.45 }),
  m("h4", "snap", "tiny_monster", { x: 0.4, y: 0.7 }),
  m("h5", "lull", "sleepy_blob", { x: 0.7, y: 0.78 }),
  m("h6", "veil", "floating_ghost", { x: 0.18, y: 0.78 }),
];

const lonelyMembers: Member[] = [
  m("l1", "moss", "cozy_spirit", { x: 0.5, y: 0.55 }),
  m("l2", "veil", "floating_ghost", { x: 0.88, y: 0.85 }, { presence: "lurking" }),
];

// --- Social state scenarios ----------------------------------------------

const hypeMembers: Member[] = [
  m("y1", "muz", "tiny_monster", { x: 0.32, y: 0.45 }),
  m("y2", "404", "glitch_robot", { x: 0.42, y: 0.52 }),
  m("y3", "snap", "tiny_monster", { x: 0.55, y: 0.45 }),
  m("y4", "moss", "cozy_spirit", { x: 0.68, y: 0.55 }),
];

const awkwardMembers: Member[] = [
  m("a1", "moss", "cozy_spirit", { x: 0.18, y: 0.4 }),
  m("a2", "404", "glitch_robot", { x: 0.82, y: 0.42 }),
  m("a3", "lull", "sleepy_blob", { x: 0.5, y: 0.8 }, { presence: "idle" }),
];

const lurkingMembers: Member[] = [
  m("k1", "veil", "floating_ghost", { x: 0.85, y: 0.2 }, { presence: "lurking" }),
  m("k2", "veil", "floating_ghost", { x: 0.12, y: 0.78 }, { presence: "lurking" }),
  m("k3", "lull", "sleepy_blob", { x: 0.5, y: 0.5 }, { presence: "idle" }),
];

const clutterMembers: Member[] = [
  m("x1", "muz", "tiny_monster", { x: 0.2, y: 0.32 }),
  m("x2", "snap", "tiny_monster", { x: 0.35, y: 0.62 }),
  m("x3", "404", "glitch_robot", { x: 0.6, y: 0.3 }),
  m("x4", "404", "glitch_robot", { x: 0.78, y: 0.6 }),
  m("x5", "moss", "cozy_spirit", { x: 0.5, y: 0.45 }),
  m("x6", "veil", "floating_ghost", { x: 0.85, y: 0.85 }, { presence: "lurking" }),
  m("x7", "lull", "sleepy_blob", { x: 0.15, y: 0.85 }, { presence: "idle" }),
];

export const mockups: MockupScenario[] = [
  // mood 4
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

  // social state 4
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
