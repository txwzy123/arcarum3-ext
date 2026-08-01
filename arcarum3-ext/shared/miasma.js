/**
 * 瘴气 / 白圈：从 miasma_info + 节点 is_shrinking 读取，供寻路与绘制。
 *
 * 毒圈开启后（is_miasmic）：
 * - 白圈中心 = center_position_x/y（展示 + 半径推断；**不是**寻路终点）
 * - 安全区半径由 pattern_id 对应圈图尺寸决定（pattern 1 → 1340² 图，半径 670）
 * - 安全区节点：距圆心 ≤ radius；圈外 is_shrinking = true
 * - 寻路：**软性**偏好留在白圈内，惩罚进入 is_shrinking 格
 * - 不要求走向圆心；圈内任意游走不额外加分/减分
 */

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   level: number|null,
 *   step: number|null,
 *   countdown: number|null,
 *   patternId: number|null,
 *   basePatternId: number|null,
 *   radius: number|null,
 * }} MiasmaCenter
 */

/**
 * pattern_id → 安全区半径（世界像素）
 * 来源：CDN 圈图 miasma_circle_{id}.png 为正方形，圆心=图心，半径=边长/2。
 * pattern 1 本地资产 1340×1340 → 670。
 */
export const MIASMA_PATTERN_RADIUS = {
  1: 670,
  // 后续 pattern 有资产后补全；未知时回退 DEFAULT
};

/** 未知 pattern 时的默认半径（与 pattern 1 同） */
export const MIASMA_DEFAULT_RADIUS = 670;

/**
 * 进入瘴气格（is_shrinking）时，扫路累计分增加量（最小化，越大越差）
 */
export const MIASMA_OUTSIDE_ENTER_SCORE = 14;

/**
 * 目标寻路：进入瘴气格的 primary 增量
 */
export const MIASMA_OUTSIDE_ENTER_PRIMARY = 2200;

/** @deprecated */
export const MIASMA_DIST_WEIGHT_PER_PX = 0;

/**
 * @param {number|null|undefined} patternId
 * @returns {number}
 */
export function radiusForPattern(patternId) {
  const id = Number(patternId);
  if (Number.isFinite(id) && MIASMA_PATTERN_RADIUS[id] != null) {
    return MIASMA_PATTERN_RADIUS[id];
  }
  return MIASMA_DEFAULT_RADIUS;
}

/**
 * 从 state / miasma_info 取 after 块
 * @param {any} state
 */
export function getMiasmaAfter(state) {
  const mi = state?.miasma_info;
  if (!mi || typeof mi !== "object") return null;
  if (mi.after && typeof mi.after === "object" && mi.after.is_miasmic) return mi.after;
  if (mi.before && typeof mi.before === "object" && mi.before.is_miasmic) return mi.before;
  if (mi.is_miasmic) return mi;
  return null;
}

/**
 * @param {any} state
 * @returns {MiasmaCenter | null}
 */
export function getMiasmaCenter(state) {
  const after = getMiasmaAfter(state);
  if (!after) return null;

  const x = Number(after.center_position_x ?? state?.miasma_info?.safe_center?.x);
  const y = Number(after.center_position_y ?? state?.miasma_info?.safe_center?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const numOrNull = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const patternId = numOrNull(after.pattern_id);
  const storedR = numOrNull(after.safe_radius ?? state?.miasma_info?.safe_radius);
  const radius = storedR != null && storedR > 0 ? storedR : radiusForPattern(patternId);

  return {
    x,
    y,
    level: numOrNull(after.level),
    step: numOrNull(after.step),
    countdown: numOrNull(after.miasma_stop_countdown),
    patternId,
    basePatternId: numOrNull(after.base_pattern_id),
    radius,
  };
}

/** 毒圈是否已开启 */
export function isMiasmaActive(state) {
  return getMiasmaCenter(state) != null;
}

/**
 * 节点是否在瘴气/圈外
 * @param {{ isShrinking?: boolean, is_shrinking?: boolean } | null | undefined} node
 */
export function isNodeInMiasma(node) {
  if (!node) return false;
  return Boolean(node.isShrinking ?? node.is_shrinking);
}

/**
 * 点是否在安全区（金色圆内）
 * @param {number} x
 * @param {number} y
 * @param {MiasmaCenter} center
 */
export function isInsideSafeZone(x, y, center) {
  if (!center || center.radius == null) return true;
  const dx = x - center.x;
  const dy = y - center.y;
  return dx * dx + dy * dy <= center.radius * center.radius;
}

/**
 * 根据圆心+半径回填 node_list[].is_shrinking（圈外 true）。
 * 用于：服务端尚未标 is_shrinking、或本地快照补全。
 * 不修改原数组引用外的结构；返回是否有变更。
 *
 * @param {any} state  含 node_list + miasma_info
 * @returns {{ state: any, changed: number, inside: number, outside: number, radius: number|null }}
 */
export function applySafeZoneShrinking(state) {
  if (!state || !Array.isArray(state.node_list)) {
    return { state, changed: 0, inside: 0, outside: 0, radius: null };
  }
  const center = getMiasmaCenter(state);
  if (!center || center.radius == null) {
    return { state, changed: 0, inside: 0, outside: 0, radius: null };
  }

  let changed = 0;
  let inside = 0;
  let outside = 0;
  const r2 = center.radius * center.radius;
  const node_list = state.node_list.map((n) => {
    const x = Number(n.position_x);
    const y = Number(n.position_y);
    const inSafe =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      (x - center.x) ** 2 + (y - center.y) ** 2 <= r2;
    if (inSafe) inside++;
    else outside++;
    const nextShrink = !inSafe;
    const prev = Boolean(n.is_shrinking);
    if (prev !== nextShrink) changed++;
    if (prev === nextShrink) return n;
    return { ...n, is_shrinking: nextShrink };
  });

  // 缓存半径，便于 UI / 下次
  const mi = state.miasma_info && typeof state.miasma_info === "object" ? { ...state.miasma_info } : {};
  mi.safe_radius = center.radius;
  mi.safe_center = { x: center.x, y: center.y };
  if (mi.after && typeof mi.after === "object") {
    mi.after = { ...mi.after, safe_radius: center.radius };
  }
  if (mi.before && typeof mi.before === "object") {
    mi.before = { ...mi.before, safe_radius: center.radius };
  }

  return {
    state: { ...state, node_list, miasma_info: mi },
    changed,
    inside,
    outside,
    radius: center.radius,
  };
}

/**
 * 若毒圈已开且尚无任何 is_shrinking，则按位置关系补全（避免全 false）。
 * 若已有部分 shrinking 标记，仍可用 force=true 按几何覆盖。
 * @param {any} state
 * @param {{ force?: boolean }} [opts]
 */
export function ensureSafeZoneShrinking(state, opts = {}) {
  const center = getMiasmaCenter(state);
  if (!center) return state;
  const nodes = state?.node_list || [];
  const anyShrink = nodes.some((n) => n.is_shrinking);
  if (anyShrink && !opts.force) return state;
  return applySafeZoneShrinking(state).state;
}

/**
 * 扫路：进入 to 节点时的毒圈软分
 */
export function miasmaSoftScoreOnEnter(toNode, _center = null) {
  return isNodeInMiasma(toNode) ? MIASMA_OUTSIDE_ENTER_SCORE : 0;
}

/**
 * 目标寻路：进入 to 的 primary 软增量
 */
export function miasmaSoftPrimaryOnEnter(toNode, _center = null) {
  return isNodeInMiasma(toNode) ? MIASMA_OUTSIDE_ENTER_PRIMARY : 0;
}

/** @deprecated */
export function miasmaSoftScoreDelta(_from, _to, _center, _weightPerPx) {
  return 0;
}

/** @deprecated */
export function miasmaSoftPrimaryDelta(_from, _to, _center, _weightPerPx) {
  return 0;
}

/** @deprecated */
export function isMoveAwayFromCenter(_from, _to, _center) {
  return false;
}

export function dist2(x, y, center) {
  const dx = x - center.x;
  const dy = y - center.y;
  return dx * dx + dy * dy;
}

export function distToCenter(x, y, center) {
  return Math.sqrt(dist2(x, y, center));
}

export function towardDeltaPx(from, to, center) {
  return distToCenter(to.x, to.y, center) - distToCenter(from.x, from.y, center);
}

export function nodeXY(n) {
  if (!n) return null;
  const x = Number(n.x ?? n.position_x);
  const y = Number(n.y ?? n.position_y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
