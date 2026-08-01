/**
 * 白圈内活动：不应强制去圆心；进入 is_shrinking 应更贵。
 */
import {
  findLowestScorePath,
  scoreForType,
} from "./shared/path/exploreScore.js";
import { findWeightedPath } from "./shared/path/weightedRoute.js";
import {
  miasmaSoftScoreOnEnter,
  miasmaSoftPrimaryOnEnter,
  MIASMA_OUTSIDE_ENTER_SCORE,
} from "./shared/miasma.js";
import { NODE_TYPE } from "./shared/nodeTypes.js";

function assert(c, m) {
  if (!c) throw new Error(m);
}

const center = { x: 100, y: 100, level: 1, step: 0, countdown: 20, patternId: 1, basePatternId: 4 };

// 圆心在 (100,100)；安全区节点 1,2,3 在圈内，4 在圈外 shrinking
// 1 -- 2(战) -- 3(空) -- 4(战,shrink) 
// 从 1 出发 N=4，应选 1→2 停住或 1→2→3，而不是为了「朝圆心」乱跑
const map = {
  miasmaCenter: center,
  nodes: [
    { id: 1, displayType: NODE_TYPE.EMPTY, adjacentIds: [2], x: 50, y: 100, isShrinking: false },
    { id: 2, displayType: NODE_TYPE.BATTLE, adjacentIds: [1, 3], x: 80, y: 100, isShrinking: false },
    { id: 3, displayType: NODE_TYPE.EMPTY, adjacentIds: [2, 4], x: 110, y: 100, isShrinking: false },
    { id: 4, displayType: NODE_TYPE.BATTLE, adjacentIds: [3], x: 200, y: 100, isShrinking: true },
  ],
};

assert(miasmaSoftScoreOnEnter(map.nodes[1]) === 0, "圈内进入不加分");
assert(miasmaSoftScoreOnEnter(map.nodes[3]) === MIASMA_OUTSIDE_ENTER_SCORE, "圈外进入加惩罚");
assert(miasmaSoftPrimaryOnEnter(map.nodes[3]) > 0, "目标寻路圈外 primary>0");

const r = findLowestScorePath(map, 1, 5, { day: 1, miasmaCenter: center });
console.log("explore path", r?.path, "score", r?.score);
// 最优：1→2（-10），不应为了第二场战去 4（-10+空+8+毒圈14 更差）
assert(r && r.path.join(",") === "1,2", `应停在圈内战斗，得到 ${r?.path}`);
assert(!r.path.includes(4), "不应为圆心/圈外战硬穿出");

// 圈外是唯一可走收益：1→4(战,shrink)，软约束不硬拦，仍可规划
const map2 = {
  miasmaCenter: center,
  nodes: [
    { id: 1, displayType: 0, adjacentIds: [4], x: 50, y: 100, isShrinking: false },
    { id: 4, displayType: NODE_TYPE.BATTLE, adjacentIds: [1], x: 200, y: 100, isShrinking: true },
  ],
};
const r2 = findLowestScorePath(map2, 1, 5, { day: 1, miasmaCenter: center });
console.log("can exit when only option", r2?.path, r2?.score);
assert(r2 && r2.path.includes(4), "软约束不硬拦，仍可走到圈外");
assert(
  r2.score === scoreForType(NODE_TYPE.BATTLE, { day: 1 }) + MIASMA_OUTSIDE_ENTER_SCORE,
  "圈外战斗 = 战分 + 毒圈惩罚"
);

// 目标寻路：从 1 到 2（都在圈内）不应绕远
const p = findWeightedPath(map, 1, 2, "short");
console.log("weighted 1→2", p);
assert(p && p.join(",") === "1,2", "圈内最短应直达");

console.log("miasma-inside tests passed");
