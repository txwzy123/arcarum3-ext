/**
 * 验证：走一步后「自由重规划」会换路；「粘性重规划」在阈值内沿用旧路线。
 * 同时模拟「进入格被吃掉变空地」——这是游戏里 is_visited 后的常见状态。
 */
import { existsSync, readFileSync } from "fs";
import {
  findLowestScorePath,
  findLowestScorePathSticky,
  REPLAN_STICKINESS,
} from "./shared/path/exploreScore.js";
import { toRouteMap } from "./shared/path/weightedRoute.js";
import { getMiasmaCenter } from "./shared/miasma.js";

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

const snapshot = new URL("../out/miasma_dungeon_snapshot.json", import.meta.url);
if (!existsSync(snapshot)) {
  console.log("sticky tests skipped: local out/miasma_dungeon_snapshot.json is not present");
  process.exit(0);
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

const center = getMiasmaCenter(state);
const N = 10;
const opts = { day: 1, miasmaCenter: center };

console.log("miasma center:", center ? `${center.x},${center.y}` : "none");
console.log("REPLAN_STICKINESS:", REPLAN_STICKINESS);
console.log("current_node_id:", state.current_node_id);

const starts = state.node_list
  .filter((n) => n.adjacent_node_ids.length >= 2)
  .slice(0, 15);

let freeChanged = 0;
let stickyKept = 0;
let stickySwitched = 0;
let total = 0;

for (const s of starts) {
  const map1 = toRouteMap(state);
  const r1 = findLowestScorePath(map1, s.node_id, N, opts);
  if (!r1 || r1.path.length < 3) continue;

  const next = r1.path[1];
  // 进入 next：类型被消费为空地（与游戏 is_visited 一致）
  const state2 = structuredClone(state);
  const moved = state2.node_list.find((x) => x.node_id === next);
  moved.node_type = 0;
  moved.is_visited = true;
  state2.current_node_id = next;
  const map2 = toRouteMap(state2);

  const remaining = r1.path.slice(1); // 从 next 开始的旧剩余
  const free = findLowestScorePath(map2, next, N, opts);
  const sticky = findLowestScorePathSticky(map2, next, N, {
    ...opts,
    previousPath: remaining,
  });
  if (!free || !sticky) continue;

  total++;
  const freeSame =
    JSON.stringify(free.path.slice(0, remaining.length)) ===
    JSON.stringify(remaining);
  if (!freeSame) freeChanged++;

  if (sticky.keptPrevious) stickyKept++;
  else stickySwitched++;

  const secondFree = free.path[1];
  const secondSticky = sticky.path[1];
  const secondOld = remaining[1];
  console.log(
    `#${s.node_id}→#${next}: free2nd=#${secondFree} sticky2nd=#${secondSticky} old2nd=#${secondOld}` +
      ` | freeScore=${free.score.toFixed(1)} stickyScore=${sticky.score.toFixed(1)} fresh=${sticky.freshScore.toFixed(1)}` +
      ` | kept=${sticky.keptPrevious}` +
      (freeSame ? " | free未变" : " | free变了")
  );
}

console.log(
  `\n合计 ${total}：自由重规划改变 ${freeChanged}；粘性沿用 ${stickyKept}、切换 ${stickySwitched}`
);

// 单起点深测：当前位置
{
  const start = Number(state.current_node_id);
  const r1 = findLowestScorePath(toRouteMap(state), start, N, opts);
  console.log("\n— 真实起点深测 —");
  console.log("path1:", r1?.path?.join(" → "), "score", r1?.score);
  if (r1) {
    const next = r1.path[1];
    const state2 = structuredClone(state);
    const moved = state2.node_list.find((x) => x.node_id === next);
    moved.node_type = 0;
    moved.is_visited = true;
    const remaining = r1.path.slice(1);
    const free = findLowestScorePath(toRouteMap(state2), next, N, opts);
    const sticky = findLowestScorePathSticky(toRouteMap(state2), next, N, {
      ...opts,
      previousPath: remaining,
    });
    console.log("free after step:", free?.path?.join(" → "), free?.score);
    console.log(
      "sticky after step:",
      sticky?.path?.join(" → "),
      sticky?.score,
      "kept=",
      sticky?.keptPrevious
    );
    // 连续走 3 步，看 sticky 是否稳定
    let path = r1.path.slice();
    let curState = structuredClone(state);
    for (let step = 0; step < 3; step++) {
      const cur = path[0];
      const go = path[1];
      if (go == null) break;
      const node = curState.node_list.find((x) => x.node_id === go);
      node.node_type = 0;
      node.is_visited = true;
      curState.current_node_id = go;
      const rem = path.slice(1);
      const st = findLowestScorePathSticky(toRouteMap(curState), go, N, {
        ...opts,
        previousPath: rem,
      });
      console.log(
        `  step${step + 1} @#${go} kept=${st?.keptPrevious} path=${st?.path?.join("→")} score=${st?.score?.toFixed(1)}`
      );
      path = st.path;
    }
  }
}
