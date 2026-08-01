import assert from "node:assert/strict";
import {
  EXPLORE_SCORE_FIELDS,
  findLowestScorePath,
  scoreExplorePath,
  scoreForType,
} from "./shared/path/exploreScore.js";
import {
  findWeightedPath,
  planRouteWithVias,
} from "./shared/path/weightedRoute.js";
import { NODE_TYPE } from "./shared/nodeTypes.js";

assert.equal(scoreForType(NODE_TYPE.EMPTY, { day: 1 }), 10);
assert.equal(scoreForType(NODE_TYPE.STRONG, { day: 1 }), 10);
assert.equal(scoreForType(NODE_TYPE.TERRIFYING, { day: 1 }), 10);
assert.equal(scoreForType(NODE_TYPE.STRONG, { day: 2 }), -10);
assert.equal(scoreForType(NODE_TYPE.BOSS, { day: 1 }), null);
assert.equal(
  EXPLORE_SCORE_FIELDS.some(({ key }) => key === "BOSS"),
  false,
  "Boss should not expose a reward-scan score",
);

const map = {
  nodes: [
    { id: 1, displayType: NODE_TYPE.EMPTY, adjacentIds: [2, 4] },
    { id: 2, displayType: NODE_TYPE.BOSS, adjacentIds: [1, 3] },
    { id: 3, displayType: NODE_TYPE.BATTLE, adjacentIds: [2] },
    { id: 4, displayType: NODE_TYPE.EMPTY, adjacentIds: [1, 5] },
    { id: 5, displayType: NODE_TYPE.BATTLE, adjacentIds: [4] },
  ],
};

const explore = findLowestScorePath(map, 1, 5, { day: 1 });
assert.deepEqual(explore?.path, [1, 4, 5]);
assert.equal(explore?.path.includes(2), false, "reward scan must skip Boss nodes");
assert.equal(scoreExplorePath(map, [1, 2], { day: 1 }).valid, false);
assert.equal(scoreExplorePath(map, [2, 3], { day: 1 }).valid, false);

assert.equal(
  findWeightedPath(map, 1, 3, "short"),
  null,
  "a target route must not cross a Boss node",
);
assert.deepEqual(
  findWeightedPath(map, 1, 2, "short"),
  [1, 2],
  "a Boss node remains reachable as the final target",
);
assert.equal(
  planRouteWithVias(map, 1, 3, [2], "short").path,
  null,
  "a Boss node must not be accepted as a via",
);

console.log("route rules: all assertions passed");
