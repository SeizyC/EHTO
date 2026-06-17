// Does this member plausibly "know about" what the user just said?
// A soft amplifier for reply quality: when any of the member's affinity
// tags surfaces in the user's text, we push them to engage with
// substance instead of deflecting with "그게 뭐야?". Kept as a pure
// module (no supabase/anthropic imports) so it stays cheap to unit-test.

/** True when any affinity tag overlaps the user text (case-insensitive
 *  substring, either direction). Empty affinity or empty text → false. */
export function inWheelhouse(affinity: string[], userText: string): boolean {
  if (!userText) return false;
  const t = userText.toLowerCase();
  return affinity.some((tag) => {
    const a = tag.trim().toLowerCase();
    return a.length > 0 && (t.includes(a) || a.includes(t));
  });
}
