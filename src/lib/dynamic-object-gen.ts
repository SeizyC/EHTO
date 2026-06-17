// Dynamic object generation pipeline — entry point.
//
// CURRENT STATE: SAFE STUB. The OpenAI credit balance is exhausted
// (status 2026-05-31), so this function returns null unconditionally.
// plaza-grow handles null by falling through to the existing static
// alternate logic, so the catalog DB-ification + dismissal UI can ship
// without OpenAI access.
//
// When OpenAI is restored:
//   1. Replace this body with the pipeline described in the spec:
//      - composeObjectDescription(topic, slotTopics) via Haiku
//      - sha256 of normalised description → desc_key
//      - object_types lookup by (origin_topic, origin_desc_key)
//      - on miss: gpt-image-1 generation + chroma extraction +
//        Supabase Storage upload + INSERT
//   2. Drop the OPENAI_ENABLED gate.
//
// Spec: docs/superpowers/specs/2026-05-31-dynamic-object-generation-design.md

import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogByTypeId, invalidateCatalog, type ObjectType } from "@/lib/object-catalog";

const OPENAI_ENABLED = false; // flip when credits return

export type DynamicGenArgs = {
  topic: string;
  slotHeightPct: number;
  slotTopics: string[];
};

export async function tryGenerateDynamicType(
  _sb: SupabaseClient,
  _args: DynamicGenArgs,
): Promise<ObjectType | null> {
  if (!OPENAI_ENABLED) return null;
  // Future pipeline body lives here. While disabled the surface stays
  // so plaza-grow / tests / callers can keep wiring through to it.
  return null;
}

/** Variant lazy generation — called fire-and-forget after a placement
 *  when usage_count/variant_count crosses the threshold. No-op while
 *  the OpenAI gate is closed. */
export async function tryGenerateVariant(
  sb: SupabaseClient,
  typeId: string,
): Promise<boolean> {
  if (!OPENAI_ENABLED) return false;
  // Sketch: fetch type → compose variant description (slight tweak of
  // the original) → gen sprite → INSERT object_variants → invalidate
  // catalog cache so the next placement sees it.
  void sb; void typeId; void catalogByTypeId; void invalidateCatalog;
  return false;
}
