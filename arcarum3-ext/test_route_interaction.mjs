import assert from "node:assert/strict";
import {
  isDuplicateRightClick,
  nextTargetSelection,
} from "./shared/path/routeInteraction.js";

assert.deepEqual(
  nextTargetSelection({ currentId: 2, clickedId: 4, routeGoal: 2, routeVias: [] }),
  { action: "goal", goal: 4, vias: [] },
  "clicking after arrival starts a fresh target route",
);
assert.deepEqual(
  nextTargetSelection({ currentId: 2, clickedId: 9, clickedIsBoss: true, routeGoal: 2, routeVias: [3] }),
  { action: "goal", goal: 9, vias: [] },
  "a Boss click after arrival also clears old vias",
);

assert.deepEqual(
  nextTargetSelection({ currentId: 2, clickedId: 2, routeGoal: null, routeVias: [] }),
  { action: "ignore", goal: null, vias: [] },
  "clicking the current node does not create a target",
);

assert.deepEqual(
  nextTargetSelection({ currentId: 1, clickedId: 3, routeGoal: 5, routeVias: [2] }),
  { action: "via", goal: 5, vias: [2, 3] },
);

assert.deepEqual(
  nextTargetSelection({ currentId: 1, clickedId: 3, routeGoal: 5, routeVias: [3] }),
  { action: "ignore", goal: 5, vias: [3] },
  "duplicate via clicks are no-ops",
);

assert.deepEqual(
  nextTargetSelection({ currentId: 1, clickedId: 9, clickedIsBoss: true, routeGoal: 5, routeVias: [9, 2] }),
  { action: "goal", goal: 9, vias: [2] },
  "Boss is always the final target",
);

assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "pointerup", time: 100 },
    { nodeId: 3, source: "contextmenu", time: 155 },
  ),
  true,
  "pointerup then contextmenu is deduplicated",
);
assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "contextmenu", time: 155 },
    { nodeId: 3, source: "pointerup", time: 100 },
  ),
  true,
  "contextmenu then pointerup is deduplicated",
);
assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "pointerup", x: 10, y: 10, time: 100 },
    { nodeId: 4, source: "contextmenu", x: 10, y: 10, time: 105 },
  ),
  true,
  "layout shifts cannot turn one gesture into two node actions",
);
assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "pointerup", x: 10, y: 10, time: 100 },
    { nodeId: 4, source: "contextmenu", x: 100, y: 100, time: 105 },
  ),
  false,
  "separate nearby-in-time right clicks are not merged",
);
assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "pointerup", time: 100 },
    { nodeId: 3, source: "contextmenu", time: 250 },
  ),
  false,
);
// Once a paired event is consumed, the next opposite-source event is a new
// gesture and must not be suppressed by the previous one.
const firstGesture = { nodeId: 3, source: "contextmenu", time: 100 };
const pairedPointerup = { nodeId: 3, source: "pointerup", time: 105 };
assert.equal(isDuplicateRightClick(firstGesture, pairedPointerup), true);
assert.equal(
  isDuplicateRightClick(null, { nodeId: 4, source: "contextmenu", time: 110 }),
  false,
);
assert.equal(
  isDuplicateRightClick(
    { nodeId: 3, source: "pointerup", time: 100 },
    { nodeId: 3, source: "pointerup", time: 105 },
  ),
  false,
  "two pointerup events are separate gestures",
);

console.log("route interaction: all assertions passed");
