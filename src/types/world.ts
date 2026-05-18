export type Mood = "cozy" | "rainy" | "chaotic" | "lonely";

export type MemberRole = "core" | "semi_active" | "ghost";

export type CreatureKind =
  | "cozy_spirit"
  | "glitch_robot"
  | "floating_ghost"
  | "sleepy_blob"
  | "tiny_monster"
  | "shy_bunny"
  | "pixie_cat"
  | "mochi_blob";

export type Presence = "active" | "lurking" | "idle" | "away";

export interface World {
  id: string;
  ownerId: string;
  title: string;
  mood: Mood;
  activeMemberIds: string[];
  socialEnergy: number; // 0..1
  repetitionRisk: number; // 0..1
  worldDrift: string[]; // recent drift tags
  createdAt: string;
  updatedAt: string;
}

export type BodyType = "masc" | "fem";
export type OutfitStyle =
  | "casual"
  | "suit"
  | "hiphop"
  | "dress"
  | "streetwear"
  | "athletic";
export type HatKind = "cap" | "beanie" | "halo" | "hood" | "none";

export interface Outfit {
  bodyType?: BodyType; // default "masc"
  style?: OutfitStyle; // default "casual"
  shirt: string;
  pants: string;
  shoes?: string;
  accent?: string; // tie / chain / stripe color
  hair?: string; // hex; if undefined no hair drawn
  hat?: { kind: HatKind; color?: string };
}

export interface Member {
  id: string;
  worldId: string;
  name: string;
  role: MemberRole;
  creature: CreatureKind;
  persona: string;
  speechStyle: string;
  presence: Presence;
  activityWeight: number; // 0..1
  // tile coords on isometric floor — (col, row), origin top-left of grid
  tile: { col: number; row: number };
  outfit: Outfit;
  facing?: "sw" | "se" | "nw" | "ne";
}

export type FeedItemType =
  | "conversation"
  | "presence"
  | "event"
  | "drift"
  | "media";

export interface FeedItem {
  id: string;
  worldId: string;
  type: FeedItemType;
  actorId?: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface RelationshipEdge {
  worldId: string;
  fromMemberId: string;
  toMemberId: string;
  trust: number;
  awkwardness: number;
  attachment: number;
  humorSync: number;
  emotionalCloseness: number;
}

export interface WorldEvent {
  id: string;
  worldId: string;
  type: string;
  participants: string[];
  emotionalWeight: number;
  persistence: number;
  status: "active" | "settled" | "echoed";
  createdAt: string;
}

export interface SocialSignature {
  userId: string;
  activityPattern: string;
  emotionalDensity: number;
  chaosFactor: number;
  humorStyle: string;
  mediaBias: string;
  socialEnergy: number;
  updatedAt: string;
}
