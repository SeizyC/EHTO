// 광장 오브제 인터랙션 (C). 멤버가 분수대 옆에 머물거나, 벤치 옆에
// 서있거나, 나무에 기대는 등 "한 자리에 잠깐 멈춰서는" 좌표 기반 액션.
//
// 중요: 캐릭터 스프라이트는 standing pose 한 장만 있어서 "앉기"는
// 실제로 표현할 수 없다. 그래서 모든 슬롯은 *옆에 서있기*. 벤치도
// 두 자리는 벤치 좌우, 분수대도 양옆. 시각적 페이오프는 "멤버가
// 오브제 근처에 안정적으로 자리잡고 마주본다"로 잡는다 — 좌석 위에
// 떠있는 작은 캐릭터 같은 어색한 결과 대신.
//
// 각 PlazaObject 타입마다 멤버가 점유할 수 있는 슬롯이 1~2개 정의돼
// 있다. 슬롯은 (objectId, idx) 쌍으로 식별되며, 하나의 슬롯엔 최대 한
// 명만 들어간다. world/page.tsx의 drift 효과가 일정 확률로 빈 슬롯을
// 골라 멤버를 그 좌표로 보내고 `occupy`를 set한다. 다음 drift에서 다시
// 풀려나 자유 위치로 돌아온다.
//
// scope 결정: 서버에는 점유 상태를 sync하지 않는다. (a) 위치 자체가
// 클라이언트에서만 관리되고 있고 (b) ambient 대화의 object-interaction
// intent는 이미 무작위 오브제를 뽑고 있어서 "마침 누가 거기 있을 때"
// 자연스럽게 정렬되는 정도로 충분하다.

import type { PlazaObject, PlazaObjectType } from "@/lib/plaza-objects";

export type Occupy = {
  /** PlazaObject.id this member is currently parked at. */
  objectId: string;
  /** Slot index within that object (a bench has 2 standing slots, etc.). */
  slotIdx: number;
};

export type SlotAnchor = {
  /** Absolute % position on the plaza container. Anchor = character's
   *  bottom-center should land here. */
  x: number;
  y: number;
  /** Optional preferred facing — true = flipped (faces left). Lets a
   *  bench's left-side member face right (toward the bench / the other
   *  side) so two flanking members look at each other across the
   *  object. null = no preference; caller's existing facing rule
   *  applies. */
  flip?: boolean | null;
};

// Per-type slot offsets relative to the object's anchor (x = object.x,
// y = object.y, both %). Bottom-center of object = (object.x, object.y).
// All slots place the member STANDING beside / in front of the object —
// we don't have seated sprites, so "sitting on the bench" is faked-
// looking. Standing-beside reads as "lingering" which matches what we
// can actually render.
//
// dy>0 = closer to viewer (in front of object). Slight in-front
// positioning makes the character paint over the object's lower edge,
// which reads as "next to it" not "behind it" in the iso projection.
const SLOT_OFFSETS: Record<PlazaObjectType, Array<{ dx: number; dy: number; flip?: boolean | null }>> = {
  bench: [
    // Two standing slots flanking the bench. The bench is wide so we
    // push out further to avoid overlapping the armrests.
    { dx: -6, dy: 1, flip: false }, // left side → faces right (toward bench)
    { dx:  6, dy: 1, flip: true  }, // right side → faces left
  ],
  fountain: [
    // Two linger slots flanking the fountain, slightly in front.
    { dx: -8, dy: 4, flip: false },
    { dx:  8, dy: 4, flip: true  },
  ],
  tree: [
    { dx: 4, dy: 2, flip: true },
  ],
  lamp: [
    { dx: 4, dy: 1, flip: true },
  ],
  planter: [
    { dx: 5, dy: 0, flip: true },
  ],
  // Dogs — one tight side-slot per dog so a member can be "next to" them.
  // Closer offset (dx 3) since dogs are small (~8% tall) and a standing
  // character at 14-15% should appear "with the dog" rather than across
  // the floor from it. Always face toward the dog.
  dog_shiba:     [{ dx: 3, dy: 1, flip: true }],
  dog_maltese:   [{ dx: 3, dy: 1, flip: true }],
  dog_retriever: [{ dx: 3, dy: 1, flip: true }],
  dog_dachshund: [{ dx: 3, dy: 1, flip: true }],
};

/** Slot anchors for a single object placement. Returns an empty array
 *  if the type has no defined occupy slots. */
export function slotsFor(o: PlazaObject): SlotAnchor[] {
  const offs = SLOT_OFFSETS[o.type as keyof typeof SLOT_OFFSETS] ?? [];
  return offs.map((s) => ({
    x: o.x + s.dx,
    y: o.y + s.dy,
    flip: s.flip ?? null,
  }));
}

/** Resolve an Occupy reference to its anchor in the current object list.
 *  Returns null if the object was removed (cleanup case). */
export function resolveOccupy(
  occ: Occupy,
  objects: PlazaObject[],
): SlotAnchor | null {
  const o = objects.find((x) => x.id === occ.objectId);
  if (!o) return null;
  const slots = slotsFor(o);
  return slots[occ.slotIdx] ?? null;
}

/** Find an unoccupied slot across all objects. `taken` is a set of
 *  "<objectId>:<slotIdx>" keys to skip. Returns null if everything's
 *  taken or no objects have slots. */
export function pickFreeSlot(
  objects: PlazaObject[],
  taken: Set<string>,
): { objectId: string; slotIdx: number; anchor: SlotAnchor } | null {
  // Collect every (object, slotIdx) pair across the plaza, then shuffle.
  // Without the shuffle, members would always grab slot 0 (left seat /
  // left side) before slot 1, producing a visibly biased plaza.
  type Candidate = { objectId: string; slotIdx: number; anchor: SlotAnchor };
  const candidates: Candidate[] = [];
  for (const o of objects) {
    const slots = slotsFor(o);
    for (let i = 0; i < slots.length; i++) {
      const key = `${o.id}:${i}`;
      if (taken.has(key)) continue;
      candidates.push({ objectId: o.id, slotIdx: i, anchor: slots[i] });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Stable key used in the `taken` set so two members can't claim the
 *  same slot. */
export function occupyKey(occ: Occupy): string {
  return `${occ.objectId}:${occ.slotIdx}`;
}
