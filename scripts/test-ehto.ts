import assert from "node:assert/strict";
import { EHTO_ACTIONS, priceOf, START_GRANT, EHTO_KIND } from "../src/lib/ehto";

assert.equal(EHTO_KIND, "ehto");
assert.equal(START_GRANT, 10);

for (const a of EHTO_ACTIONS) {
  assert.ok(Number.isInteger(a.price) && a.price > 0, `price: ${a.action}`);
  assert.ok(a.label.length > 0 && a.desc.length > 0, `copy: ${a.action}`);
}

assert.equal(priceOf("character_change"), 5);
assert.equal(priceOf("member_invite"), 2);
assert.equal(priceOf("energy_refill"), 1);
assert.equal(priceOf("nope" as never), null);

console.log("ehto: all assertions passed");
