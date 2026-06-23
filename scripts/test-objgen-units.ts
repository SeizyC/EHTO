import assert from "node:assert/strict";
import { buildObjectPromptForTest, descKeyForTest } from "../src/lib/dynamic-object-gen";

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
