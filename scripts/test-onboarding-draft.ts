import assert from "node:assert/strict";
import { parseDraft, serializeDraft, EMPTY_DRAFT } from "../src/lib/onboarding-draft";

// round-trip
const d = { code: "ABCD2345", roomName: "내 광장" };
assert.deepEqual(parseDraft(serializeDraft(d)), d);

// partial / missing fields default to empty strings
assert.deepEqual(parseDraft('{"code":"X"}'), { code: "X", roomName: "" });
assert.deepEqual(parseDraft("not json"), EMPTY_DRAFT);
assert.deepEqual(parseDraft(null), EMPTY_DRAFT);

console.log("onboarding-draft: all assertions passed");
