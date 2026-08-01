/**
 * 验证 ≤N 扫路：
 * 1) 人造图：后面全是空地时，应停在收益格，不必凑满 N
 * 2) 人造图：收益在空地之后时，仍会穿过空地（不是单步贪心停）
 * 3) 真实快照：实际点数 ≤ 上限，且不长于「恰好 N」旧语义的浪费
 */
import { existsSync, readFileSync } from "fs";
import {
  findLowestScorePath,
  scoreForType,
  EXPLORE_WEIGHTS,
} from "./shared/path/exploreScore.js";
import { toRouteMap } from "./shared/path/weightedRoute.js";
import { getMiasmaCenter } from "./shared/miasma.js";
import { NODE_TYPE } from "./shared/nodeTypes.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  scoreForType(NODE_TYPE.HEAL) === scoreForType(NODE_TYPE.EMPTY),
  "回复默认评分应与空地相同"
);
assert(
  scoreForType(NODE_TYPE.HEAL, { weights: { HEAL: -17 } }) === -17,
  "自定义回复评分应生效"
);

// —— 1) 短路径：S -reward- empty- empty- empty，N=8 应停在 reward（2 点）——
{
  const map = {
    nodes: [
      { id: 1, displayType: NODE_TYPE.EMPTY, adjacentIds: [2], x: 0, y: 0 },
      { id: 2, displayType: NODE_TYPE.BATTLE, adjacentIds: [1, 3], x: 1, y: 0 },
      { id: 3, displayType: NODE_TYPE.EMPTY, adjacentIds: [2, 4], x: 2, y: 0 },
      { id: 4, displayType: NODE_TYPE.EMPTY, adjacentIds: [3, 5], x: 3, y: 0 },
      { id: 5, displayType: NODE_TYPE.EMPTY, adjacentIds: [4], x: 4, y: 0 },
    ],
  };
  const r = findLowestScorePath(map, 1, 8, { day: 1 });
  console.log("case1 short-stop:", r?.path, "score", r?.score, "n", r?.numPoints);
  assert(r && r.path.join(",") === "1,2", "应停在战斗格，不继续踩空地");
  assert(r.score === EXPLORE_WEIGHTS.BATTLE, "分数应为单次战斗");
  assert(r.numPoints === 2 && r.maxPoints === 8, "实际 2 点，上限 8");
}

// —— 2) 穿空地：S -empty- battle，N=6 应走到 battle ——
{
  const map = {
    nodes: [
      { id: 1, displayType: NODE_TYPE.EMPTY, adjacentIds: [2], x: 0, y: 0 },
      { id: 2, displayType: NODE_TYPE.EMPTY, adjacentIds: [1, 3], x: 1, y: 0 },
      { id: 3, displayType: NODE_TYPE.BATTLE, adjacentIds: [2], x: 2, y: 0 },
    ],
  };
  const r = findLowestScorePath(map, 1, 6, { day: 1 });
  console.log("case2 through-empty:", r?.path, "score", r?.score);
  assert(r && r.path[r.path.length - 1] === 3, "应穿过空地到达战斗");
  const expect =
    scoreForType(NODE_TYPE.EMPTY, { day: 1 }) +
    scoreForType(NODE_TYPE.BATTLE, { day: 1 });
  assert(Math.abs(r.score - expect) < 1e-6, `分数应为 ${expect}，得到 ${r.score}`);
}

// —— 3) 分支：近处 1 战 vs 远处 3 战（中间 1 空），N 够时应选 3 战 ——
{
  // 1 -a2(战)-  vs  1 -b2(空)- b3(战)- b4(战)- b5(战)
  const map = {
    nodes: [
      { id: 1, displayType: 0, adjacentIds: [2, 10], x: 0, y: 0 },
      { id: 2, displayType: NODE_TYPE.BATTLE, adjacentIds: [1], x: 1, y: 0 },
      { id: 10, displayType: NODE_TYPE.EMPTY, adjacentIds: [1, 11], x: 0, y: 1 },
      { id: 11, displayType: NODE_TYPE.BATTLE, adjacentIds: [10, 12], x: 0, y: 2 },
      { id: 12, displayType: NODE_TYPE.BATTLE, adjacentIds: [11, 13], x: 0, y: 3 },
      { id: 13, displayType: NODE_TYPE.BATTLE, adjacentIds: [12], x: 0, y: 4 },
    ],
  };
  const r = findLowestScorePath(map, 1, 5, { day: 1 });
  console.log("case3 three-rewards:", r?.path, "score", r?.score);
  assert(r && r.path.includes(11) && r.path.includes(12) && r.path.includes(13), "应选三条战斗");
  assert(r.score < EXPLORE_WEIGHTS.BATTLE, "三战应优于单战");
}

// —— 4) 真实快照：实际长度 ≤ N ——
{
  const snapshot = new URL("../out/miasma_dungeon_snapshot.json", import.meta.url);
  if (!existsSync(snapshot)) {
    console.log("case4 skipped: local out/miasma_dungeon_snapshot.json is not present");
    console.log("le-n tests passed");
    process.exit(0);
  }
  function findDungeon(p) {
    if (p && typeof p === "object") {
      if (Array.isArray(p.node_list)) return p;
      for (const k of ["option", "data", "dungeon"]) {
        if (p[k]) {
          const r = findDungeon(p[k]);
          if (r) return r;
        }
      }
    }
    return null;
  }
  const raw = JSON.parse(readFileSync(snapshot, "utf-8"));
  const dg = findDungeon(raw);
  const state = {
    node_list: dg.node_list.map((n) => ({
      node_id: Number(n.node_id),
      position_x: Number(n.position_x),
      position_y: Number(n.position_y),
      node_type: Number(n.node_type),
      adjacent_node_ids: (n.adjacent_node_ids || []).map(Number),
      is_visited: !!n.is_visited,
    })),
    current_node_id: Number(dg.current_node_id),
    miasma_info: dg.miasma_info,
  };
  const opts = {
    day: 1,
    miasmaCenter: getMiasmaCenter(state),
  };
  const N = 20;
  const start = Number(state.current_node_id);
  const t0 = performance.now();
  const r = findLowestScorePath(toRouteMap(state), start, N, opts);
  const ms = Math.round(performance.now() - t0);
  console.log(
    `case4 real start#${start}: ${r?.numPoints}/≤${N} score=${r?.score?.toFixed(1)} ${ms}ms path=${r?.path?.join("→")}`
  );
  assert(r, "真实图应有解");
  assert(r.numPoints >= 2 && r.numPoints <= N, "实际点数应在 2..N");
  assert(r.maxPoints === N, "maxPoints 应为上限");
}

console.log("le-n tests passed");

console.log("\nAll ≤N tests passed.");
