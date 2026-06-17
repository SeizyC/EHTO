import assert from "node:assert/strict";
import { inWheelhouse } from "../src/lib/wheelhouse";

// An affinity tag surfacing in the user's text → in wheelhouse.
assert.equal(inWheelhouse(["음악", "indie"], "요즘 indie 밴드 뭐 듣냐"), true);
assert.equal(inWheelhouse(["책", "독서"], "어제 그 책 다 읽었어"), true);
// No overlap → not in wheelhouse.
assert.equal(inWheelhouse(["게임"], "주말에 등산 갔다왔어"), false);
// Degenerate inputs.
assert.equal(inWheelhouse([], "아무거나"), false);
assert.equal(inWheelhouse(["음악"], ""), false);
// Case-insensitive.
assert.equal(inWheelhouse(["EDM"], "edm 신곡 미쳤다"), true);

console.log("wheelhouse: all assertions passed");
