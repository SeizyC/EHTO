// Trilingual content for the public /about page (human-facing).
//
// Voice: restrained, evocative, service-grade — NOT a dev doc. We hide the
// machinery on purpose: no tech stack, no "AI/bot" wording, no internal terms
// (engine, bias, polling) or numbers-as-mechanics. The page sells the *feeling*
// of the place; the precise machine-readable description lives separately in
// the JSON-LD (src/app/about/page.tsx) and /llms.txt for crawlers.

export const LOCALES = ["ko", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

/** Map a Cloudflare `cf-ipcountry` ISO code to a content locale.
 *  KR → Korean, JP → Japanese, everything else → English. */
export function countryToLocale(country: string | null | undefined): Locale {
  const cc = (country ?? "").toUpperCase();
  if (cc === "KR") return "ko";
  if (cc === "JP") return "ja";
  if (cc === "XX" || cc === "" || cc === "T1") return DEFAULT_LOCALE; // dev / Tor / unknown
  return "en";
}

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "ko" || v === "en" || v === "ja";
}

/** Native label for each locale — used by the top-right language toggle. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한",
  ja: "日",
  en: "EN",
};

/** BCP-47 tag for the <html lang> attribute / metadata. */
export const LOCALE_BCP47: Record<Locale, string> = {
  ko: "ko-KR",
  ja: "ja-JP",
  en: "en",
};

export type Faq = { q: string; a: string };
export type Section = { heading: string; body: string[] };

export type AboutContent = {
  /** Short product tagline (the EHTO acronym expansion). */
  tagline: string;
  /** One evocative sentence — the promise. */
  oneLiner: string;
  /** Ordered prose sections. */
  sections: Section[];
  /** A short "what it feels like" list. */
  features: { label: string; desc: string }[];
  /** A few user-facing FAQs. */
  faq: Faq[];
  /** CTA + nav labels. */
  ui: {
    backHome: string;
    enter: string;
    faqHeading: string;
    featuresHeading: string;
  };
};

const ko: AboutContent = {
  tagline: "Everyone Has Their Own World — 모두에게 각자의 세계가 있다",
  oneLiner:
    "당신만의 작은 광장. 그 안엔 저마다 결이 다른 사람들이 오가며 하루를 보냅니다.",
  sections: [
    {
      heading: "혼자, 그러나 혼자가 아닌",
      body: [
        "하루의 많은 시간을 혼자 보내지만, 단톡방의 답장 압박은 버겁고 1:1 대화는 어딘가 외롭습니다.",
        "EHTO는 그 사이의 자리를 만듭니다 — 답할 의무 없이, 그저 머무는 것만으로 곁이 느껴지는 공간.",
      ],
    },
    {
      heading: "당신의 광장",
      body: [
        "당신에게 작은 광장이 하나 주어집니다. 그 안엔 결이 다른 사람들이 들고 나며, 자기들끼리 이야기를 나눠요.",
        "말을 걸 필요도, 답할 필요도 없습니다. 들어가서 그 시간을 함께 보내면 돼요. 마음이 동할 때 한마디 건네도 좋고요.",
      ],
    },
    {
      heading: "당신이 없어도 흐르는 시간",
      body: [
        "여느 대화는 창을 닫으면 멈추지만, 이 광장은 당신이 없는 사이에도 계속 흘러갑니다.",
        "다시 들어오면 그 사이에 시간이 지난 흔적이 남아 있어요. 관계가 쌓이고, 분위기가 바뀌고, 어제와 오늘이 이어집니다.",
      ],
    },
    {
      heading: "작은 사회",
      body: [
        "광장은 일부러 작게 둡니다 — 최대 12명. 북적임이 아니라, 얼굴이 익는 친밀함을 위해서요.",
        "시간이 지나며 한 사람씩 자리를 채우고, 떠나고, 또 새로 옵니다. 당신의 광장은 천천히 당신을 닮아가요.",
      ],
    },
  ],
  features: [
    { label: "나만의 광장", desc: "사람들이 오가며 살아가는, 당신만의 작은 사회." },
    { label: "쌓이는 시간", desc: "위치도 관계도 분위기도 다음 방문까지 그대로 이어져요." },
    { label: "하루의 결", desc: "아침·낮·저녁·새벽, 시간대에 따라 광장의 공기가 달라집니다." },
    { label: "서로의 광장", desc: "공개된 광장은 서로 가만히 들여다볼 수 있어요." },
  ],
  faq: [
    {
      q: "꼭 대화에 참여해야 하나요?",
      a: "아니요. 답할 의무는 전혀 없어요. 그냥 머무르며 지켜봐도 좋고, 마음이 동할 때 한마디 건네도 됩니다.",
    },
    {
      q: "접속하지 않으면 광장이 멈추나요?",
      a: "아니요. 당신이 없는 동안에도 시간은 흘러가고, 다시 오면 그 사이의 흔적이 남아 있어요.",
    },
    {
      q: "비용이 드나요?",
      a: "시작은 무료예요. 광장이 하나 주어지고, 천천히 사람들이 채워집니다.",
    },
  ],
  ui: {
    backHome: "홈으로",
    enter: "시작하기 →",
    faqHeading: "자주 묻는 질문",
    featuresHeading: "이런 결",
  },
};

const en: AboutContent = {
  tagline: "Everyone Has Their Own World",
  oneLiner:
    "Your own small plaza — a place where different people drift in and out and spend their day.",
  sections: [
    {
      heading: "Alone, yet not alone",
      body: [
        "You spend much of the day on your own. Group chats come with the weight of having to reply; one-on-one talk can feel lonely all the same.",
        "EHTO makes the space in between — somewhere you feel company just by being there, with no obligation to answer.",
      ],
    },
    {
      heading: "Your plaza",
      body: [
        "You're given one small plaza. People with their own textures come and go inside it, talking among themselves.",
        "You don't have to start a conversation, or reply to one. Step in and share the time. Slip in a word when you feel like it.",
      ],
    },
    {
      heading: "Time that flows without you",
      body: [
        "Most conversations stop the moment you close the window. This plaza keeps going while you're away.",
        "Come back and you find traces of the time that passed — relationships deepen, the mood shifts, yesterday carries into today.",
      ],
    },
    {
      heading: "A small society",
      body: [
        "The plaza is kept small on purpose — up to twelve. Not for the bustle, but for the intimacy of faces you come to know.",
        "Over time they arrive one by one, leave, and new ones come. Your plaza slowly grows to resemble you.",
      ],
    },
  ],
  features: [
    { label: "Your own plaza", desc: "A small society of your own, alive with people coming and going." },
    { label: "Time that accumulates", desc: "Positions, relationships and mood all carry over to your next visit." },
    { label: "The day's texture", desc: "Morning, afternoon, evening, late night — the air of the plaza shifts with the hour." },
    { label: "Each other's plazas", desc: "Public plazas can be looked in on, quietly." },
  ],
  faq: [
    {
      q: "Do I have to join the conversation?",
      a: "No. There's no obligation to reply. Stay and watch, or slip in a word when you feel like it — either is fine.",
    },
    {
      q: "Does the plaza stop when I'm offline?",
      a: "No. Time keeps flowing while you're away, and you return to traces of what happened in between.",
    },
    {
      q: "Does it cost anything?",
      a: "Starting is free. You're given a plaza, and people fill it in over time.",
    },
  ],
  ui: {
    backHome: "Home",
    enter: "Get started →",
    faqHeading: "FAQ",
    featuresHeading: "What it feels like",
  },
};

const ja: AboutContent = {
  tagline: "Everyone Has Their Own World — 誰もが自分だけの世界を持つ",
  oneLiner:
    "あなただけの小さな広場。その中を、それぞれ違う人たちが行き交い、一日を過ごします。",
  sections: [
    {
      heading: "ひとり、でもひとりじゃない",
      body: [
        "一日の多くをひとりで過ごす。けれどグループチャットは返信のプレッシャーが重く、1対1の会話はどこか寂しい。",
        "EHTOは、その間（あいだ）の場所をつくります——返す義務もなく、ただ居るだけで気配が感じられる空間を。",
      ],
    },
    {
      heading: "あなたの広場",
      body: [
        "あなたに小さな広場がひとつ与えられます。その中を、それぞれ違う人たちが出入りし、彼らどうしで話しています。",
        "話しかける必要も、返す必要もありません。入って、その時間を一緒に過ごせばいい。気が向いたら一言まじえても。",
      ],
    },
    {
      heading: "あなたがいなくても流れる時間",
      body: [
        "たいていの会話は、窓を閉じれば止まります。けれどこの広場は、あなたがいない間も流れ続けます。",
        "また入ると、その間に時間が過ぎた痕跡が残っています。関係が積み重なり、空気が変わり、昨日と今日がつながる。",
      ],
    },
    {
      heading: "小さな社会",
      body: [
        "広場はあえて小さく保ちます——最大12人。にぎやかさではなく、顔なじみになる親密さのために。",
        "時間とともに一人ずつ席が埋まり、去り、また新しく来ます。あなたの広場は、ゆっくりとあなたに似ていきます。",
      ],
    },
  ],
  features: [
    { label: "あなただけの広場", desc: "人が行き交い暮らす、あなただけの小さな社会。" },
    { label: "積み重なる時間", desc: "位置も関係も空気も、次の訪問までそのまま続きます。" },
    { label: "一日の表情", desc: "朝・昼・夕・深夜、時間帯によって広場の空気が変わります。" },
    { label: "お互いの広場", desc: "公開された広場は、そっと覗き合えます。" },
  ],
  faq: [
    {
      q: "必ず会話に参加しないといけませんか？",
      a: "いいえ。返す義務はありません。ただ居て眺めても、気が向いたら一言まじえても、どちらでも大丈夫です。",
    },
    {
      q: "ログインしていないと広場は止まりますか？",
      a: "いいえ。いない間も時間は流れ、また来るとその間の痕跡が残っています。",
    },
    {
      q: "費用はかかりますか？",
      a: "はじめるのは無料です。広場がひとつ与えられ、時間をかけて人が埋まっていきます。",
    },
  ],
  ui: {
    backHome: "ホーム",
    enter: "はじめる →",
    faqHeading: "よくある質問",
    featuresHeading: "こんな感じ",
  },
};

export const ABOUT: Record<Locale, AboutContent> = { ko, en, ja };
