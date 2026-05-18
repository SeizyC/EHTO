"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CreatureKind, Outfit } from "@/types/world";

export interface UserProfile {
  email: string;
  handle: string;
  creature: CreatureKind;
  outfit: Outfit;
  createdAt: string;
}

interface ProfileState {
  profile: UserProfile | null;
  setProfile: (p: UserProfile) => void;
  patch: (p: Partial<UserProfile>) => void;
  reset: () => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      patch: (partial) =>
        set((state) => ({
          profile: state.profile ? { ...state.profile, ...partial } : null,
        })),
      reset: () => set({ profile: null }),
    }),
    { name: "ehto.profile" },
  ),
);

export const DEFAULT_OUTFIT: Outfit = {
  bodyType: "masc",
  style: "casual",
  shirt: "#2a4ac8",
  pants: "#1a1f3a",
  hair: "#1f1814",
  accent: "#c8385a",
  hat: { kind: "none" },
};
