// EHTO purchase packs (Stripe Checkout). Prices in KRW (a zero-decimal
// currency, so unit_amount == the won value). Amounts/labels mirror
// docs/economy-simulation-2026-06-23.md §5(a).

export type EhtoPack = {
  id: string;
  label: string;
  ehto: number;
  priceKrw: number;
  featured?: boolean;
};

export const EHTO_PACKS: EhtoPack[] = [
  { id: "starter", label: "스타터", ehto: 12, priceKrw: 1_100 },
  { id: "basic", label: "베이직", ehto: 42, priceKrw: 3_300, featured: true },
  { id: "plus", label: "플러스", ehto: 75, priceKrw: 5_500 },
  { id: "mega", label: "메가", ehto: 165, priceKrw: 11_000 },
];

const _byId = new Map(EHTO_PACKS.map((p) => [p.id, p]));

export function packById(id: string): EhtoPack | null {
  return _byId.get(id) ?? null;
}
