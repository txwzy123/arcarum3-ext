import { existsSync, readFileSync } from "fs";
import { findLowestScorePath, scoreForType } from "./shared/path/exploreScore.js";
import { toRouteMap } from "./shared/path/weightedRoute.js";
import { getMiasmaCenter, miasmaSoftScoreDelta, nodeXY } from "./shared/miasma.js";

const snapshot = new URL("../out/miasma_dungeon_snapshot.json", import.meta.url);
if (!existsSync(snapshot)) {
  console.log("explore2 tests skipped: local out/miasma_dungeon_snapshot.json is not present");
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
    node_id: Number(n.node_id), position_x: Number(n.position_x), position_y: Number(n.position_y),
    node_type: Number(n.node_type), adjacent_node_ids: n.adjacent_node_ids.map(Number), is_visited: !!n.is_visited,
  })),
  miasma_info: dg.miasma_info,
};
const center = getMiasmaCenter(state);
const opts = { day: 1, miasmaCenter: center };

// 按规划器同样的口径给一条固定路径打分
function walkScore(map, path) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = byId.get(path[i - 1]), b = byId.get(path[i]);
    s += scoreForType(b.displayType, opts);
    if (center) s += miasmaSoftScoreDelta(nodeXY(a), nodeXY(b), center);
  }
  return s;
}

const N = 10;
let ties = 0, better = 0, total = 0;
for (const s of state.node_list.filter((n) => n.adjacent_node_ids.length >= 2).slice(0, 12)) {
  const r1 = findLowestScorePath(toRouteMap(state), s.node_id, N, opts);
  if (!r1) continue;
  const next = r1.path[1];
  const state2 = structuredClone(state);
  const moved = state2.node_list.find((x) => x.node_id === next);
  moved.node_type = 0; moved.is_visited = true;
  const map2 = toRouteMap(state2);
  const r2 = findLowestScorePath(map2, next, N, opts);
  if (!r2) continue;
  const oldSuffix = r1.path.slice(1);
  if (JSON.stringify(oldSuffix) === JSON.stringify(r2.path.slice(0, oldSuffix.length))) continue;
  total++;
  // 新计划截到 N-1 点（与旧剩余同长）比较分数
  const newTrunc = r2.path.slice(0, oldSuffix.length);
  const so = walkScore(map2, oldSuffix), sn = walkScore(map2, newTrunc);
  if (Math.abs(so - sn) < 1e-9) ties++; else if (sn < so) better++;
  console.log(`start#${s.node_id}: 旧剩余分 ${so.toFixed(1)} vs 新前缀分 ${sn.toFixed(1)} ${Math.abs(so-sn)<1e-9 ? "= 平局(不稳定)" : sn<so ? "→ 新的确实更优" : "→ 旧的反而更好?!"}`);
}
console.log(`\n变化 ${total} 组中：平局 ${ties}，新方案真更优 ${better}`);

// N=16 性能
console.log("\n— N=16 性能 —");
for (const sid of [1, 9, 51]) {
  const t0 = performance.now();
  const r = findLowestScorePath(toRouteMap(state), sid, 16, opts);
  console.log(`start#${sid} N=16: ${Math.round(performance.now() - t0)}ms, 展开 ${r?.nodesVisited}, 分 ${r?.score.toFixed(1)}`);
}
