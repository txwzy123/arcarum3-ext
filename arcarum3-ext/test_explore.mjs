import { existsSync, readFileSync } from "fs";
import { findLowestScorePath } from "./shared/path/exploreScore.js";
import { toRouteMap } from "./shared/path/weightedRoute.js";
import { getMiasmaCenter } from "./shared/miasma.js";

const snapshot = new URL("../out/miasma_dungeon_snapshot.json", import.meta.url);
if (!existsSync(snapshot)) {
  console.log("explore tests skipped: local out/miasma_dungeon_snapshot.json is not present");
  process.exit(0);
}
const raw = JSON.parse(readFileSync(snapshot, "utf-8"));
function findDungeon(p) {
  if (p && typeof p === "object") {
    if (Array.isArray(p.node_list)) return p;
    for (const k of ["option", "data", "dungeon"]) {
      if (p[k]) { const r = findDungeon(p[k]); if (r) return r; }
    }
  }
  return null;
}
const dg = findDungeon(raw);
const state = {
  node_list: dg.node_list.map((n) => ({
    node_id: Number(n.node_id),
    position_x: Number(n.position_x),
    position_y: Number(n.position_y),
    node_type: Number(n.node_type),
    adjacent_node_ids: n.adjacent_node_ids.map(Number),
    is_visited: !!n.is_visited,
  })),
  miasma_info: dg.miasma_info,
};
const center = getMiasmaCenter(state);
console.log("miasma center:", center ? `${center.x},${center.y}` : "none");

const N = 10;
const opts = { day: 1, miasmaCenter: center };

// 选几个有邻接的起点测试
const starts = state.node_list.filter((n) => n.adjacent_node_ids.length >= 2).slice(0, 40);
let changedCount = 0, total = 0, capHit = 0;
const CAP = Math.min(2_000_000, state.node_list.length ** 2 * 50);

for (const s of starts.slice(0, 12)) {
  const map1 = toRouteMap(state);
  const t0 = performance.now();
  const r1 = findLowestScorePath(map1, s.node_id, N, opts);
  const ms1 = Math.round(performance.now() - t0);
  if (!r1) continue;
  if (r1.nodesVisited >= CAP) capHit++;

  // 模拟走一步：进入 path[1]，其类型被消费变为 0
  const next = r1.path[1];
  const state2 = structuredClone(state);
  const moved = state2.node_list.find((x) => x.node_id === next);
  moved.node_type = 0;
  moved.is_visited = true;
  const map2 = toRouteMap(state2);
  const r2 = findLowestScorePath(map2, next, N, opts);
  if (!r2) continue;

  total++;
  // 旧计划剩余部分（从 next 开始的 N-1 点）vs 新计划前 N-1 点
  const oldSuffix = r1.path.slice(1);
  const newPrefix = r2.path.slice(0, oldSuffix.length);
  const same = JSON.stringify(oldSuffix) === JSON.stringify(newPrefix);
  if (!same) changedCount++;
  console.log(
    `start#${s.node_id} ${ms1}ms exp=${r1.nodesVisited}${r1.nodesVisited >= CAP ? "(CAP!)" : ""} score=${r1.score.toFixed(1)}`,
    same ? "· 走一步后计划保持" : `· 变了: 旧剩余 ${oldSuffix.join(">")} → 新 ${r2.path.join(">")}`
  );
}
console.log(`\n${total} 组测试，走一步后剩余计划改变: ${changedCount}，搜索撞上限: ${capHit}`);
