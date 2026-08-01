/**
 * 无目标点的「收益扫路」（长度 ≤ N）
 *
 * 计分（进入格，不含起点；累计越低越好）：
 *
 * 【第一天】
 * - 普战 / 事件：-10
 * - 宝箱 / 商店：-10
 * - 回复：+10（与空地相同）
 * - 空地 / 君临者 / 传送门 / 特殊：+10
 * - 强敌 +10、超强敌 +10（均可撤退，与空地同权）
 * - Boss 不参与扫路，只能作为显式目标寻路的终点
 *
 * 【第二天】（inferDay >= 2）
 * - 强敌改为 -10（奖励）
 * - 其余与第一天相同
 *
 * 算法：DFS 枚举长度 2..N 的简单路径 + 乐观下界剪枝
 * （不会「单步变差就停」——空地后面的收益仍会搜到）
 */

import { NODE_TYPE } from "../nodeTypes.js";
import { miasmaSoftScoreOnEnter } from "../miasma.js";

/** 可调权重表 */
export const EXPLORE_WEIGHTS = {
  /** 鼓励 */
  BATTLE: -10,
  EVENT: -10,
  CHEST: -10,
  SHOP: -10,
  /** 回复默认与空地相同 */
  HEAL: 10,
  EMPTY: 10,
  RULER: 10,
  PORTAL: 10,
  SPECIAL: 10,
  /** 首日可撤退敌人与空地同权 */
  STRONG_DAY1: 10,
  TERRIFYING: 10,
  /** 第二天强敌改为奖励 */
  STRONG_DAY2: -10,
  /** 未单独列出的类型 */
  default: 0,
};

/** 主页面自定义评分控件；顺序即显示顺序。 */
export const EXPLORE_SCORE_FIELDS = [
  { key: "BATTLE", label: "普通战斗" },
  { key: "EVENT", label: "事件" },
  { key: "CHEST", label: "宝箱" },
  { key: "SHOP", label: "商店" },
  { key: "HEAL", label: "回复" },
  { key: "EMPTY", label: "空地" },
  { key: "RULER", label: "君临者" },
  { key: "PORTAL", label: "传送门" },
  { key: "SPECIAL", label: "特殊事件" },
  { key: "STRONG_DAY1", label: "强敌（首日）" },
  { key: "STRONG_DAY2", label: "强敌（次日）" },
  // Boss 不提供评分项：它只能作为显式路线的最终目标。
  { key: "TERRIFYING", label: "超强敌" },
];

function getExploreWeights(opts = {}) {
  const custom = opts.weights && typeof opts.weights === "object" ? opts.weights : {};
  const merged = { ...EXPLORE_WEIGHTS };
  for (const { key } of EXPLORE_SCORE_FIELDS) {
    const value = Number(custom[key]);
    if (Number.isFinite(value)) merged[key] = value;
  }
  return merged;
}

/**
 * @typedef {object} ExploreScoreOptions
 * @property {number} [day]  1 或 2+
 * @property {Partial<typeof EXPLORE_WEIGHTS>} [weights] 自定义各类评分
 * @property {import('../miasma.js').MiasmaCenter | null} [miasmaCenter]
 *   毒圈开启时传入：软性偏好留在白圈内（惩罚 is_shrinking），不强制去圆心
 */

/**
 * @param {number} displayType
 * @param {ExploreScoreOptions} [opts]
 */
export function scoreForType(displayType, opts = {}) {
  const day = Number(opts.day) >= 2 ? 2 : 1;
  const t = Number(displayType);
  const W = getExploreWeights(opts);

  switch (t) {
    case NODE_TYPE.BATTLE:
      return W.BATTLE;
    case NODE_TYPE.EVENT:
      return W.EVENT;
    case NODE_TYPE.CHEST:
      return W.CHEST;
    case NODE_TYPE.SHOP:
      return W.SHOP;
    case NODE_TYPE.HEAL:
      return W.HEAL;
    case NODE_TYPE.EMPTY:
      return W.EMPTY;
    case NODE_TYPE.RULER:
      return W.RULER;
    case NODE_TYPE.PORTAL:
      return W.PORTAL;
    case NODE_TYPE.SPECIAL:
      return W.SPECIAL;
    case NODE_TYPE.STRONG:
      return day >= 2 ? W.STRONG_DAY2 : W.STRONG_DAY1;
    case NODE_TYPE.BOSS:
      // Boss 是显式路线的最终目标，不参与收益扫路评分。
      return null;
    case NODE_TYPE.TERRIFYING:
      return W.TERRIFYING;
    default:
      return W.default;
  }
}

/**
 * 剩余步乐观下界用的最低单格分（最负）
 * @param {ExploreScoreOptions} [opts]
 */
export function minPossibleStepScore(opts = {}) {
  const samples = [
    NODE_TYPE.BATTLE,
    NODE_TYPE.EVENT,
    NODE_TYPE.CHEST,
    NODE_TYPE.SHOP,
    NODE_TYPE.HEAL,
    NODE_TYPE.EMPTY,
    NODE_TYPE.STRONG,
    NODE_TYPE.TERRIFYING,
    NODE_TYPE.RULER,
    NODE_TYPE.PORTAL,
    NODE_TYPE.SPECIAL,
  ];
  let m = 0;
  for (const t of samples) {
    const s = scoreForType(t, opts);
    if (Number.isFinite(s) && s < m) m = s;
  }
  return m;
}

/**
 * @typedef {object} ExploreResult
 * @property {number[]} path
 * @property {number} score
 * @property {number} rewardCount  得分为负的进入格数
 * @property {number} penaltyCount  得分为正的进入格数
 * @property {number} nodesVisited
 * @property {number} numPoints  实际点数（≤ maxPoints）
 * @property {number} maxPoints  预算上限 N
 * @property {number} day
 * @property {Record<string, number>} weights
 */

/**
 * 在长度 **2..N**（含）的简单路径中找累计分最低者。
 * 不必凑满 N：后面若净收益为负可提前结束；仍会穿过空地去够更远的收益。
 *
 * @param {{ nodes: { id: number, displayType: number, adjacentIds: number[] }[] }} map
 * @param {number} startId
 * @param {number} numPoints  点数上限 N（含起点）
 * @param {ExploreScoreOptions & { forcedPrefix?: number[] }} [opts]
 *   forcedPrefix：强制沿用的前缀（含起点），在此前缀上可结束或继续补全至 ≤N
 * @returns {ExploreResult | null}
 */
export function findLowestScorePath(map, startId, numPoints, opts = {}) {
  const n = Math.floor(Number(numPoints));
  if (!Number.isFinite(n) || n < 2) return null;

  const day = Number(opts.day) >= 2 ? 2 : 1;
  const weights = getExploreWeights(opts);
  const scoreOpts = { day, weights };
  const center = opts.miasmaCenter || map.miasmaCenter || null;

  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  if (!byId.has(startId) || byId.get(startId).displayType === NODE_TYPE.BOSS) {
    return null;
  }

  const maxSteps = n - 1; // 最多进入 maxSteps 格
  // 剪枝下界：毒圈最好情况 = 全程留在白圈内（+0），不按「朝圆心」给负 slack
  const minStep = minPossibleStepScore(scoreOpts);

  /** @type {ExploreResult | null} */
  let best = null;
  let visitedExpand = 0;
  const maxExpand = Math.min(2_000_000, map.nodes.length ** 2 * 50);

  // —— 起始路径：默认只有起点；有 forcedPrefix 时校验后整段作为固定前缀 ——
  /** @type {number[]} */
  let path = [startId];
  let prefixScore = 0;
  if (Array.isArray(opts.forcedPrefix) && opts.forcedPrefix.length > 1) {
    const fp = opts.forcedPrefix.slice(0, n);
    let ok = Number(fp[0]) === Number(startId);
    if (ok) {
      const seen = new Set([fp[0]]);
      for (let i = 1; ok && i < fp.length; i++) {
        const a = byId.get(fp[i - 1]);
        const b = byId.get(fp[i]);
        if (!a || !b || seen.has(fp[i]) || !a.adjacentIds.includes(fp[i])) {
          ok = false;
          break;
        }
        seen.add(fp[i]);
        const stepScore = scoreForType(b.displayType, scoreOpts);
        if (!Number.isFinite(stepScore)) {
          ok = false;
          break;
        }
        prefixScore += stepScore;
        if (center) {
          prefixScore += miasmaSoftScoreOnEnter(b, center);
        }
      }
    }
    if (ok) path = fp.slice();
    else prefixScore = 0; // 前缀失效 → 退回自由搜索
  }
  const onPath = new Set(path);

  function tallyPath() {
    let rewardCount = 0;
    let penaltyCount = 0;
    for (let i = 1; i < path.length; i++) {
      const t = byId.get(path[i])?.displayType;
      const sc = scoreForType(t, scoreOpts);
      if (sc < 0) rewardCount++;
      if (sc > 0) penaltyCount++;
    }
    return { rewardCount, penaltyCount };
  }

  /** 把当前路径（depth≥1）登记为候选：分更低优先；同分更短优先 */
  function consider(scoreSoFar, depth) {
    if (depth < 1) return;
    const better =
      !best ||
      scoreSoFar < best.score - 1e-9 ||
      (Math.abs(scoreSoFar - best.score) <= 1e-9 && path.length < best.numPoints);
    if (!better) return;
    const { rewardCount, penaltyCount } = tallyPath();
    best = {
      path: path.slice(),
      score: scoreSoFar,
      rewardCount,
      penaltyCount,
      nodesVisited: visitedExpand,
      numPoints: path.length,
      maxPoints: n,
      day,
      weights,
    };
  }

  function dfs(scoreSoFar, depth) {
    if (visitedExpand > maxExpand) return;
    visitedExpand++;

    // ≤N：任意合法前缀都是候选（至少走 1 步）
    consider(scoreSoFar, depth);

    if (depth >= maxSteps) return;

    // 乐观下界：再走满剩余步，仍不可能优于 best → 剪枝
    // （不会因「单步变差」停搜；只要下界仍可能更好就继续扩）
    const remaining = maxSteps - depth;
    if (best && scoreSoFar + remaining * minStep >= best.score - 1e-9) return;

    const u = path[path.length - 1];
    const node = byId.get(u);
    if (!node) return;

    const neigh = node.adjacentIds
      .filter((v) => {
        if (!byId.has(v) || onPath.has(v)) return false;
        // 无目标扫路不进入 Boss；Boss 只由显式目标寻路到达。
        return byId.get(v).displayType !== NODE_TYPE.BOSS;
      })
      .map((v) => {
        const toN = byId.get(v);
        let s = scoreForType(toN.displayType, scoreOpts);
        // 毒圈：进入 is_shrinking 加分（更差）；圈内游走不加，不强制去圆心
        if (center) {
          s += miasmaSoftScoreOnEnter(toN, center);
        }
        // 优先扩展：同分时先走非瘴气格
        const outside = toN.isShrinking || toN.is_shrinking ? 1 : 0;
        return { v, s, outside };
      })
      .sort((a, b) => a.s - b.s || a.outside - b.outside);

    for (const { v, s } of neigh) {
      path.push(v);
      onPath.add(v);
      dfs(scoreSoFar + s, depth + 1);
      onPath.delete(v);
      path.pop();
      if (visitedExpand > maxExpand) return;
    }
  }

  dfs(prefixScore, path.length - 1);
  if (best) best.nodesVisited = visitedExpand;
  return best;
}

/** 换路阈值：新方案要比「沿用旧路线」至少好这么多分才切换（约一个收益格） */
export const REPLAN_STICKINESS = 8;

/**
 * 给一条已有路径打分（口径与 DFS 一致：进入格 + 可选毒圈软分，不含起点）。
 * @param {{ nodes: { id: number, displayType: number, adjacentIds?: number[], x?: number, y?: number }[] }} map
 * @param {number[]} path
 * @param {ExploreScoreOptions} [opts]
 * @returns {{ score: number, rewardCount: number, penaltyCount: number, valid: boolean }}
 */
export function scoreExplorePath(map, path, opts = {}) {
  const day = Number(opts.day) >= 2 ? 2 : 1;
  const weights = getExploreWeights(opts);
  const scoreOpts = { day, weights };
  const center = opts.miasmaCenter || map.miasmaCenter || null;
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  if (
    !Array.isArray(path) ||
    path.length < 2 ||
    !byId.has(path[0]) ||
    byId.get(path[0]).displayType === NODE_TYPE.BOSS
  ) {
    return { score: 0, rewardCount: 0, penaltyCount: 0, valid: false };
  }
  let score = 0;
  let rewardCount = 0;
  let penaltyCount = 0;
  const seen = new Set([path[0]]);
  for (let i = 1; i < path.length; i++) {
    const a = byId.get(path[i - 1]);
    const b = byId.get(path[i]);
    if (!a || !b || seen.has(path[i])) {
      return { score, rewardCount, penaltyCount, valid: false };
    }
    if (Array.isArray(a.adjacentIds) && !a.adjacentIds.includes(path[i])) {
      return { score, rewardCount, penaltyCount, valid: false };
    }
    seen.add(path[i]);
    const sc = scoreForType(b.displayType, scoreOpts);
    if (!Number.isFinite(sc)) {
      return { score, rewardCount, penaltyCount, valid: false };
    }
    score += sc;
    if (sc < 0) rewardCount++;
    if (sc > 0) penaltyCount++;
    if (center) {
      score += miasmaSoftScoreOnEnter(b, center);
    }
  }
  return { score, rewardCount, penaltyCount, valid: true };
}

/**
 * 带「计划粘性」的扫路（≤N）：
 * 自由最优与「强制沿用旧剩余段再优化」都在同一预算下比分；
 * 新方案好不过 REPLAN_STICKINESS 就沿用旧路，减轻改道。
 *
 * @param {{ nodes: { id: number, displayType: number, adjacentIds: number[] }[] }} map
 * @param {number} startId
 * @param {number} numPoints  点数上限 N
 * @param {ExploreScoreOptions & { previousPath?: number[] | null }} [opts]
 * @returns {(ExploreResult & { keptPrevious: boolean, freshScore: number }) | null}
 */
export function findLowestScorePathSticky(map, startId, numPoints, opts = {}) {
  const { previousPath, ...rest } = opts;
  const fresh = findLowestScorePath(map, startId, numPoints, rest);
  const prev = Array.isArray(previousPath) ? previousPath : null;
  if (!prev || prev.length < 2 || Number(prev[0]) !== Number(startId)) {
    return fresh ? { ...fresh, keptPrevious: false, freshScore: fresh.score } : null;
  }

  const day = Number(rest.day) >= 2 ? 2 : 1;
  const weights = getExploreWeights(rest);
  const prevSc = scoreExplorePath(map, prev, rest);
  if (!prevSc.valid) {
    return fresh ? { ...fresh, keptPrevious: false, freshScore: fresh.score } : null;
  }

  // 以旧路为前缀，在 ≤N 内可原样结束或继续补全
  let kept = findLowestScorePath(map, startId, numPoints, {
    ...rest,
    forcedPrefix: prev,
  });
  let keptFollowsPrev =
    kept != null && prev.every((id, i) => Number(kept.path[i]) === Number(id));
  if (!keptFollowsPrev) {
    kept = {
      path: prev.slice(),
      score: prevSc.score,
      rewardCount: prevSc.rewardCount,
      penaltyCount: prevSc.penaltyCount,
      nodesVisited: 0,
      numPoints: prev.length,
      maxPoints: Math.floor(Number(numPoints)) || prev.length,
      day,
      weights,
    };
    keptFollowsPrev = true;
  }

  if (!fresh) {
    return { ...kept, keptPrevious: true, freshScore: kept.score };
  }

  // 同一起点、同一 ≤N 预算下直接比总分（两者都是合法解）
  if (fresh.score < kept.score - REPLAN_STICKINESS) {
    return { ...fresh, keptPrevious: false, freshScore: fresh.score };
  }
  return {
    ...kept,
    keptPrevious: keptFollowsPrev,
    freshScore: fresh.score,
  };
}

/**
 * UI 说明文案
 * @param {ExploreScoreOptions} [opts]
 */
export function describeExploreScores(opts = {}) {
  const day = Number(opts.day) >= 2 ? 2 : 1;
  const W = getExploreWeights(opts);
  const strong = day >= 2 ? W.STRONG_DAY2 : W.STRONG_DAY1;
  return [
    `D${day}`,
    `战 ${W.BATTLE}`,
    `事 ${W.EVENT}`,
    `箱 ${W.CHEST}`,
    `店 ${W.SHOP}`,
    `回复 ${W.HEAL}`,
    `空地 ${W.EMPTY}`,
    `强敌 ${strong}${day >= 2 ? "(次日)" : ""}`,
    `超强 ${W.TERRIFYING}`,
  ].join(" · ");
}
