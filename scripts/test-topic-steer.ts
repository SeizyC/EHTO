import assert from "node:assert/strict";
import { parseSteer } from "../src/lib/topic-steer";

// drop + focus together ("stop X, let's do Y")
let r = parseSteer('{"topic": null, "drop": "책", "focus": "자동차"}');
assert.equal(r.drop, "책");
assert.equal(r.focus, "자동차");
assert.equal(r.topic, null);

// plain topic, no steering
r = parseSteer('{"topic":"커피","drop":null,"focus":null}');
assert.equal(r.topic, "커피");
assert.equal(r.drop, null);
assert.equal(r.focus, null);

// model wraps the JSON in prose → still parsed
r = parseSteer('Here you go: {"topic":null,"drop":"게임","focus":null} done');
assert.equal(r.drop, "게임");

// quotes/punctuation trimmed; the literal string "null" → null
r = parseSteer('{"topic":"\\"비\\".","drop":"null","focus":null}');
assert.equal(r.topic, "비");
assert.equal(r.drop, null);

// overly-long value rejected (not a keyword)
r = parseSteer('{"topic":"이건너무긴문장이라토픽이아님definitely","drop":null,"focus":null}');
assert.equal(r.topic, null);

// non-JSON garbage → empty result
assert.deepEqual(parseSteer("not json at all"), { topic: null, drop: null, focus: null });

console.log("topic-steer: all assertions passed");
