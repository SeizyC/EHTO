import assert from "node:assert/strict";
import { obstacleRadius, isoDist, clearOfObstacles } from "../src/lib/plaza-obstacles";

// obstacleRadius: short objects cast no keep-out, tall ones scale up.
assert.equal(obstacleRadius(4.5), 0);   // dog
assert.equal(obstacleRadius(8.5), 0);   // planter
assert.equal(obstacleRadius(10), 0);    // threshold
assert.ok(Math.abs(obstacleRadius(24) - 5.6) < 1e-9);   // fountain (24-10)*0.4
assert.ok(Math.abs(obstacleRadius(44) - 13.6) < 1e-9);  // tree (44-10)*0.4

// isoDist: depth (y) axis compressed ×1.4.
assert.equal(isoDist({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);              // pure horizontal
assert.ok(Math.abs(isoDist({ x: 0, y: 0 }, { x: 0, y: 2 }) - 2.8) < 1e-9); // 2*1.4

// clearOfObstacles: directly behind a fountain base = buried → not clear.
const fountain = { x: 50, y: 60, radius: obstacleRadius(24) }; // r≈5.6
assert.equal(clearOfObstacles({ x: 50, y: 58 }, [fountain]), false); // dy 2 → 2.8 < 5.6
assert.equal(clearOfObstacles({ x: 57, y: 60 }, [fountain]), true);  // dx 7 > 5.6
assert.equal(clearOfObstacles({ x: 50, y: 60 }, []), true);          // no obstacles

console.log("plaza-obstacles: all assertions passed");

// pickClearSpot must avoid obstacles: with a fountain covering plaza
// center, 200 picks should ALL land clear of it (clear regions exist).
import { pickClearSpot } from "../src/lib/position-drift";
const fountainObstacle = { x: 50, y: 60, radius: obstacleRadius(24) };
for (let i = 0; i < 200; i++) {
  const spot = pickClearSpot([], [fountainObstacle]);
  assert.equal(
    clearOfObstacles(spot, [fountainObstacle]),
    true,
    `pickClearSpot returned a buried spot: ${JSON.stringify(spot)}`,
  );
}
console.log("pickClearSpot: 200/200 picks clear of obstacle");
