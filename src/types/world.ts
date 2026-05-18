export type Mood = "cozy" | "rainy" | "chaotic" | "lonely";

export type MemberRole = "core" | "semi_active" | "ghost";

export type CreatureKind =
  | "cozy_spirit"
  | "glitch_robot"
  | "floating_ghost"
  | "sleepy_blob"
  | "tiny_monster";

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
  // spatial — relative position inside room (0..1 each)
  pos: { x: number; y: number };
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
