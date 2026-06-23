import assert from "node:assert/strict";
import { buildObjectPromptForTest, descKeyForTest } from "../src/lib/dynamic-object-gen";
import { selectCuratedForSlot } from "../src/lib/plaza-grow";

// descKey is stable + case/space-insensitive
assert.equal(descKeyForTest("A Red Lamp"), descKeyForTest("a red   lamp"));
assert.notEqual(descKeyForTest("a red lamp"), descKeyForTest("a blue lamp"));
assert.equal(descKeyForTest("x").length, 16);

// category cues differ + sky has no ground line
const propP = buildObjectPromptForTest("a bench", "prop");
const skyP = buildObjectPromptForTest("a balloon", "sky");
assert.ok(propP.includes("street furniture"));
assert.ok(skyP.includes("floating"));
assert.ok(!skyP.includes("rests on the bottom edge"));

console.log("✅ objgen units pass");

const mk = (id: string, category: any, h: number, topics: string[]) =>
  ({ id, typeKey: id, labelKo: id, nativeHeightPct: h, topics, category,
     origin: "dynamic", originTopic: null, originDescKey: null, usageCount: 0,
     variants: [{ id: id + "v", variantIdx: 1, spriteUrl: "u" }] }) as any;

const cat = [mk("chair", "landmark", 26, ["게임"]), mk("statue", "landmark", 28, ["역사", "게임"]), mk("toy", "prop", 12, ["게임"])];
const w = new Map([["게임", 2]]);
// picks the game-topic landmark in the landmark slot
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set())?.typeKey, "chair");
// no signal → null
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, new Map(), new Set()), null);
// muted excluded
assert.equal(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set(["chair"]))?.typeKey, "statue");
// wrong category not matched (prop toy not eligible for landmark slot)
assert.notEqual(selectCuratedForSlot(cat, { category: "landmark", heightPct: 24 }, w, new Set())?.typeKey, "toy");

console.log("✅ selectCuratedForSlot units pass");
