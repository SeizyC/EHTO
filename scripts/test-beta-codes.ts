import assert from "node:assert/strict";
import { generateCode, generateCodes, CODE_RE } from "../src/lib/beta-codes";

// generateCode: 8 chars from the unambiguous alphabet, matches CODE_RE.
for (let i = 0; i < 500; i++) {
  const c = generateCode();
  assert.equal(c.length, 8, `length: ${c}`);
  assert.ok(CODE_RE.test(c), `shape: ${c}`);
  // No ambiguous characters (0/O/1/I/L) by construction.
  assert.ok(!/[01OIL]/.test(c), `ambiguous char in ${c}`);
}

// generateCodes(n): n distinct codes.
const codes = generateCodes(3);
assert.equal(codes.length, 3);
assert.equal(new Set(codes).size, 3, "codes must be distinct");

console.log("beta-codes: all assertions passed");
