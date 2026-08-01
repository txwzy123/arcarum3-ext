/**
 * 目标导向加权寻路
 *
 * 预设：
 * - short  偏少步数（空地/危险仍有惩罚）
 * - reward 词典序：先尽量少惩罚（空地/危险/中性格），惩罚相同时 **收益格越多越好**
 * - safe   同 reward，但 Boss/强敌硬禁止
 *
 * 算法：Dijkstra + 途经分段拼接
 *
 * 关键点（你举的例子）：
 *   1 空地 + 1 奖励  vs  1 空地 + 2 奖励
 *   → 惩罚项相同（都是 1 空地），收益 2 > 1 → **两条奖励更优**
 *
 * 为何不用「收益格代价 = 负数」：
 *   无向图上会形成负环；词典序在「惩罚相同」时直接比收益个数，语义更干净。
 */

import { NODE_TYPE } from "../nodeTypes.js";
import {
  getMiasmaCenter,
  miasmaSoftPrimaryOnEnter,
} from "../miasma.js";

/** 高价值：普通战 / 事件 / 宝箱 */
export const REWARD_TYPES = new Set([
  NODE_TYPE.BATTLE,
  NODE_TYPE.EVENT,
  NODE_TYPE.CHEST,
]);

/** 危险：Boss / 强敌 */
export const AVOID_TYPES = new Set([NODE_TYPE.BOSS, NODE_TYPE.STRONG]);

export const ROUTE_PRESETS = [
  { id: "short", label: "最短", hint: "偏少步数" },
  { id: "reward", label: "收益", hint: "少惩罚，多战/事/箱" },
  { id: "safe", label: "安全", hint: "硬避 Boss/强敌" },
];

/** 普通内容格惩罚权重（回复/商店/传送/特殊等） */
export const COST_STEP = 1000;
/** 空地惩罚 */
export const EMPTY_ENTER_COST = 1500;
/** Boss/强敌惩罚（safe 下为禁止） */
export const AVOID_ENTER_COST = 5000;

/** @deprecated 兼容旧名 */
export const EMPTY_SOFT_PENALTY = EMPTY_ENTER_COST - COST_STEP;
/** @deprecated */
export const AVOID_SOFT_PENALTY = AVOID_ENTER_COST - COST_STEP;
/** @deprecated 收益已改为词典序第二关键字，不再用进入代价 */
export const REWARD_ENTER_COST = 0;
/** @deprecated */
export const REWARD_BONUS = 0;

/**
 * 路径代价（词典序比较）
 * @typedef {{ primary: number, rewards: number, steps: number }} PathCost
 */

/** @returns {PathCost} */
function zeroCost() {
  return { primary: 0, rewards: 0, steps: 0 };
}

/**
 * 复制并累加「进入 displayType」的代价（不含起点）
 * @param {PathCost} base
 * @param {'short'|'reward'|'safe'} preset
 * @param {number} displayType
 * @param {boolean} isTarget
 * @returns {PathCost | null}  null = 不可进入
 */
function addEnter(base, preset, displayType, isTarget) {
  const isAvoid = AVOID_TYPES.has(displayType);
  const isReward = REWARD_TYPES.has(displayType);
  const isEmpty = displayType === NODE_TYPE.EMPTY;

  if (preset === "safe" && isAvoid && !isTarget) {
    return null;
  }

  /** @type {PathCost} */
  const next = {
    primary: base.primary,
    rewards: base.rewards,
    steps: base.steps + 1,
  };

  // 终点也统计类型（若终点是宝箱，应计入收益）
  if (isReward) {
    next.rewards += 1;
    // short：收益格仍算一步长度代价，不额外鼓励
    if (preset === "short") next.primary += COST_STEP;
    // reward/safe：收益格不增加 primary（不惩罚），靠 rewards 越多越优
    return next;
  }

  if (isEmpty) {
    next.primary += EMPTY_ENTER_COST;
    return next;
  }

  if (isAvoid) {
    next.primary += AVOID_ENTER_COST;
    return next;
  }

  // 中性内容格
  next.primary += COST_STEP;
  return next;
}

/**
 * @param {PathCost} a
 * @param {PathCost} b
 * @returns {number} 负 = a 更优，正 = b 更优，0 = 相等
 */
export function comparePathCost(a, b) {
  // 1) 惩罚总和越小越好
  if (a.primary !== b.primary) return a.primary < b.primary ? -1 : 1;
  // 2) 惩罚相同：收益格越多越好（1空+2奖 优于 1空+1奖）
  if (a.rewards !== b.rewards) return a.rewards > b.rewards ? -1 : 1;
  // 3) 再相同：步数越少越好
  if (a.steps !== b.steps) return a.steps < b.steps ? -1 : 1;
  return 0;
}

function costKey(c) {
  // 调试/相等判断
  return `${c.primary}|${c.rewards}|${c.steps}`;
}

/**
 * 把扩展 state 转成寻路用图
 * @param {{ node_list: any[], miasma_info?: any }} state
 */
export function toRouteMap(state) {
  const nodes = (state?.node_list || []).map((n) => ({
    id: Number(n.node_id),
    displayType: Number(n.node_type),
    adjacentIds: (n.adjacent_node_ids || []).map(Number),
    specialIncidentId: n.special_incident_id ?? null,
    x: Number(n.position_x),
    y: Number(n.position_y),
    /** 瘴气/圈外：true 时寻路软性惩罚（留在白圈内，不强制去圆心） */
    isShrinking: Boolean(n.is_shrinking),
  }));
  return {
    nodes,
    /** 毒圈开启时的白圈中心（展示用）；寻路用节点 isShrinking 判是否在圈内 */
    miasmaCenter: getMiasmaCenter(state),
  };
}

/**
 * 从 prev 链判断 start→from 的路径上是否已包含 nodeId（禁止成环）
 * 「收益越多越好」在无向图上若不禁环，会沿环无限刷收益导致卡死。
 */
function pathContains(prev, fromId, startId, nodeId) {
  let cur = fromId;
  let guard = 0;
  while (cur != null) {
    if (cur === nodeId) return true;
    if (cur === startId) return false;
    cur = prev.get(cur);
    if (cur === undefined) return false;
    if (++guard > 512) return true;
  }
  return false;
}

/**
 * Dijkstra：from → to（词典序 PathCost）
 * 禁止路径成环；带迭代上限，避免异常卡死。
 * 毒圈：软性偏好留在白圈内（进入 is_shrinking 加 primary），不强制去圆心、不硬拦边。
 * @param {{ nodes: { id: number, displayType: number, adjacentIds: number[], x?: number, y?: number, isShrinking?: boolean }[], miasmaCenter?: import('../miasma.js').MiasmaCenter | null }} map
 * @param {number} fromId
 * @param {number} toId
 * @param {'short'|'reward'|'safe'} preset
 * @param {{ banned?: Set<number> }} [opts]
 * @returns {number[] | null}
 */
export function findWeightedPath(map, fromId, toId, preset, opts = {}) {
  if (fromId === toId) return [fromId];

  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  if (!byId.has(fromId) || !byId.has(toId)) return null;
  if (byId.get(fromId).displayType === NODE_TYPE.BOSS) return null;

  const banned = opts.banned ?? new Set();
  const nNodes = Math.max(1, map.nodes.length);
  const maxIter = nNodes * nNodes * 4;

  /** @type {Map<number, PathCost>} */
  const dist = new Map([[fromId, zeroCost()]]);
  /** @type {Map<number, number>} */
  const prev = new Map();
  /** @type {{ id: number, c: PathCost }[]} */
  const heap = [{ id: fromId, c: zeroCost() }];

  /** @param {number} id @param {PathCost} c */
  function push(id, c) {
    heap.push({ id, c });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (comparePathCost(heap[p].c, heap[i].c) <= 0) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  }

  function pop() {
    if (heap.length === 0) return undefined;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < heap.length && comparePathCost(heap[l].c, heap[best].c) < 0) best = l;
        if (r < heap.length && comparePathCost(heap[r].c, heap[best].c) < 0) best = r;
        if (best === i) break;
        [heap[i], heap[best]] = [heap[best], heap[i]];
        i = best;
      }
    }
    return top;
  }

  let iter = 0;
  while (heap.length) {
    if (++iter > maxIter) {
      console.warn("[path] findWeightedPath: hit maxIter, abort");
      break;
    }
    const item = pop();
    if (!item) break;
    const known = dist.get(item.id);
    if (!known || costKey(known) !== costKey(item.c)) continue;

    const u = item.id;
    // short：第一次弹出终点即可（代价单调）
    if (u === toId && preset === "short") break;
    // reward/safe：终点可能被「更多收益」的更长简单路径更新，不在此 break；
    // 但不要从终点继续向外扩（本段只要到 toId）
    if (u === toId) continue;

    const node = byId.get(u);
    if (!node) continue;

    for (const v of node.adjacentIds) {
      if (v !== toId && banned.has(v)) continue;
      // 禁止成环（含回到 fromId 刷收益）
      if (v !== toId && pathContains(prev, u, fromId, v)) continue;
      if (v === fromId) continue;

      const vn = byId.get(v);
      if (!vn) continue;
      // Boss 只能作为最终目的点，不能被路线当作途经节点穿过。
      if (vn.displayType === NODE_TYPE.BOSS && v !== toId) continue;
      const nc = addEnter(item.c, preset, vn.displayType, v === toId);
      if (!nc || !Number.isFinite(nc.primary)) continue;
      // 毒圈软约束：进入圈外/瘴气格加代价；圈内游走无额外代价（不强制去圆心）
      if (map.miasmaCenter) {
        nc.primary += miasmaSoftPrimaryOnEnter(vn, map.miasmaCenter);
      }
      const old = dist.get(v);
      if (old != null && comparePathCost(old, nc) <= 0) continue;

      // 若更新 v 会与旧 prev 链冲突，先设 prev 再检（用 u 为父）
      const oldPrev = prev.get(v);
      prev.set(v, u);
      if (v !== toId && pathContains(prev, u, fromId, v)) {
        // 不应发生
        if (oldPrev === undefined) prev.delete(v);
        else prev.set(v, oldPrev);
        continue;
      }
      dist.set(v, nc);
      push(v, nc);
    }
  }

  if (!dist.has(toId)) return null;

  const path = [];
  let cur = toId;
  let guard = 0;
  while (cur !== fromId) {
    path.push(cur);
    const p = prev.get(cur);
    if (p == null) return null;
    cur = p;
    if (++guard > nNodes + 5) return null;
  }
  path.push(fromId);
  path.reverse();
  return path;
}

/**
 * 去掉路径中的回环：若节点第二次出现，删掉中间一圈，只保留一条简单路径。
 * 例：1-2-3-2-4 → 1-2-4
 * @param {number[]} pathIds
 * @returns {number[]}
 */
export function removePathCycles(pathIds) {
  if (!pathIds?.length) return [];
  /** @type {number[]} */
  const out = [];
  for (const id of pathIds) {
    const idx = out.indexOf(id);
    if (idx >= 0) {
      // 回环：截断到首次出现，丢弃环上节点
      out.length = idx + 1;
    } else {
      out.push(id);
    }
  }
  return out;
}

/**
 * 去掉连续重复点
 * @param {number[]} pathIds
 */
export function dedupeConsecutive(pathIds) {
  return pathIds.filter((id, i, arr) => i === 0 || id !== arr[i - 1]);
}

/**
 * 分段：start → via… → goal
 * 各段禁止复用已走路点；最后 removePathCycles 保证一条无回环折线。
 */
export function planRouteWithVias(map, startId, goalId, viaIds, preset) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  if (!byId.has(startId) || !byId.has(goalId)) {
    return { path: null, error: "起点或终点不存在" };
  }
  const vias = Array.isArray(viaIds) ? viaIds : [];
  const bossVia = vias.find(
    (id) =>
      Number(id) !== Number(goalId) &&
      byId.get(Number(id))?.displayType === NODE_TYPE.BOSS
  );
  if (bossVia != null) {
    return { path: null, error: `Boss #${bossVia} 只能作为最终目的点` };
  }
  const waypoints = [
    startId,
    ...vias.filter((id) => id !== startId && id !== goalId),
    goalId,
  ];
  const cleaned = dedupeConsecutive(waypoints);
  if (cleaned.length < 2) return { path: [startId] };

  /** @type {number[]} */
  const path = [cleaned[0]];
  const used = new Set([cleaned[0]]);

  for (let i = 0; i < cleaned.length - 1; i++) {
    const from = cleaned[i];
    const to = cleaned[i + 1];
    const banned = new Set(
      [...used].filter((id) => id !== from && id !== to)
    );
    const seg = findWeightedPath(map, from, to, preset, { banned });
    // 不用「无 ban」回退：那会绕回已走点画出回环
    if (!seg) {
      return {
        path: null,
        error: `无法连通 #${from} → #${to}（不重复已走点；可换预设或减少途经）`,
      };
    }
    for (let j = 1; j < seg.length; j++) {
      path.push(seg[j]);
      used.add(seg[j]);
    }
  }

  let simple = removePathCycles(dedupeConsecutive(path));
  if (simple.length < 2) {
    return { path: null, error: "路径去环后无效" };
  }

  if (simple[simple.length - 1] !== goalId) {
    const tailFrom = simple[simple.length - 1];
    const banned = new Set(
      simple.filter((id) => id !== tailFrom && id !== goalId)
    );
    const tail = findWeightedPath(map, tailFrom, goalId, preset, { banned });
    if (tail && tail.length > 1) {
      for (let j = 1; j < tail.length; j++) simple.push(tail[j]);
      simple = removePathCycles(dedupeConsecutive(simple));
    }
    if (simple[simple.length - 1] !== goalId) {
      return {
        path: null,
        error: `去环后无法保持终点 #${goalId}，请减少途经点`,
      };
    }
  }

  return { path: simple };
}

/**
 * 路径统计（不含起点）
 */
export function summarizeRoute(map, pathIds) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  let reward = 0;
  let avoid = 0;
  let empty = 0;
  /** @type {PathCost} */
  let cost = zeroCost();
  const tally = new Map();

  for (let i = 1; i < pathIds.length; i++) {
    const t = byId.get(pathIds[i])?.displayType;
    if (t == null) continue;
    tally.set(t, (tally.get(t) || 0) + 1);
    if (REWARD_TYPES.has(t)) reward++;
    if (AVOID_TYPES.has(t)) avoid++;
    if (t === NODE_TYPE.EMPTY) empty++;
    const next = addEnter(cost, "reward", t, i === pathIds.length - 1);
    if (next) cost = next;
  }

  return {
    steps: Math.max(0, pathIds.length - 1),
    reward,
    avoid,
    empty,
    primary: cost.primary,
    typeCounts: [...tally.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([type, count]) => ({ type, count })),
  };
}

export const PRESET_LABEL = {
  short: "最短",
  reward: "收益",
  safe: "安全",
};
