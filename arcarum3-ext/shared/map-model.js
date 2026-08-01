import { NODE_TYPE_NAMES } from "./nodeTypes.js";
import {
  resolveSpecialEventIconFile,
  isSkyCastleTruePortalConfirmed,
} from "./nodeTypes.js";
import { ensureSafeZoneShrinking, getMiasmaCenter } from "./miasma.js";

/**
 * Extract dungeon object from various GBF response shapes.
 */
export function extractDungeon(payload) {
  if (!payload || typeof payload !== "object") return null;

  // direct dungeon
  if (Array.isArray(payload.node_list)) return payload;

  // content/index: { data?, option: { dungeon } }
  const opt = payload.option || payload.data?.option;
  if (opt?.dungeon?.node_list) return opt.dungeon;

  // sometimes nested under data.option after HTML shell
  if (payload.data?.option?.dungeon?.node_list) return payload.data.option.dungeon;

  // move_node / proceed may return partial updates
  if (payload.dungeon?.node_list) return payload.dungeon;

  return null;
}

/**
 * Merge a new dungeon snapshot into previous state.
 * Full node_list replaces; partial fields patch current node / miasma etc.
 */
export function mergeDungeonState(prev, dungeon, meta = {}) {
  if (!dungeon) return prev;

  const next = {
    ...(prev || {}),
    name: dungeon.name ?? prev?.name ?? null,
    map_id: dungeon.map_id ?? prev?.map_id ?? null,
    current_node_id:
      dungeon.current_node_id != null
        ? Number(dungeon.current_node_id)
        : prev?.current_node_id ?? null,
    node_list: Array.isArray(dungeon.node_list)
      ? dungeon.node_list.map(normalizeNode)
      : prev?.node_list || [],
    node_icon_info: dungeon.node_icon_info || prev?.node_icon_info || [],
    miasma_info: dungeon.miasma_info ?? prev?.miasma_info ?? null,
    dungeon_status: dungeon.dungeon_status ?? prev?.dungeon_status ?? null,
    total_turn:
      dungeon.total_turn != null
        ? Number(dungeon.total_turn)
        : prev?.total_turn ?? null,
    possession_arcarum3_dungeon_point:
      dungeon.possession_arcarum3_dungeon_point != null
        ? Number(dungeon.possession_arcarum3_dungeon_point)
        : prev?.possession_arcarum3_dungeon_point ?? null,
    hint: dungeon.hint ?? prev?.hint ?? null,
    // 游戏 JSON 通常无 day；预览可注入；否则用启发式
    day:
      dungeon.day != null && Number(dungeon.day) > 0
        ? Number(dungeon.day)
        : prev?.day ?? null,
    updatedAt: Date.now(),
    lastUrl: meta.url || prev?.lastUrl || null,
    lastKind: meta.kind || prev?.lastKind || null,
  };

  // Patch single-node type change (e.g. boss appear) if response only carries one node
  if (!Array.isArray(dungeon.node_list) && dungeon.node_id != null && dungeon.node_type != null) {
    const id = Number(dungeon.node_id);
    next.node_list = (next.node_list || []).map((n) =>
      n.node_id === id
        ? {
            ...n,
            node_type: Number(dungeon.node_type),
            special_incident_id:
              dungeon.special_incident_id !== undefined
                ? dungeon.special_incident_id
                : n.special_incident_id,
            is_visited:
              dungeon.is_visited !== undefined ? !!dungeon.is_visited : n.is_visited,
          }
        : n
    );
  }

  // appearBoss from miasma
  const appear =
    dungeon.miasma_info?.appearBoss ||
    dungeon.appearBoss ||
    meta.appearBoss;
  if (appear?.targetNodeId != null) {
    const id = Number(appear.targetNodeId);
    next.node_list = (next.node_list || []).map((n) =>
      n.node_id === id ? { ...n, node_type: 1 } : n
    );
    next.boss_node_id = id;
  }

  // 毒圈已开但服务端尚未标 is_shrinking 时：按圆心+圈图半径用位置关系补全
  // （金色安全区外 → is_shrinking=true）；已有标记则尊重服务端
  return ensureSafeZoneShrinking(next);
}

function normalizeNode(n) {
  return {
    node_id: Number(n.node_id),
    position_x: Number(n.position_x),
    position_y: Number(n.position_y),
    node_type: Number(n.node_type),
    adjacent_node_ids: (n.adjacent_node_ids || []).map(Number),
    is_visited: !!n.is_visited,
    is_shrinking: !!n.is_shrinking,
    is_quest_check: !!n.is_quest_check,
    special_incident_id:
      n.special_incident_id == null || n.special_incident_id === ""
        ? null
        : Number(n.special_incident_id),
  };
}

/**
 * @param {number} nodeType
 * @param {number|null|undefined} specialId
 * @param {{ truePortalConfirmed?: boolean }} [opts]
 */
export function iconStemForNode(nodeType, specialId, opts = {}) {
  if (nodeType === 0) return null;
  if (nodeType === 10) {
    const file = resolveSpecialEventIconFile(specialId, opts);
    return file.replace(/\.png$/i, "");
  }
  return String(nodeType);
}

export function typeName(t) {
  return NODE_TYPE_NAMES[t] || `type${t}`;
}

export { isSkyCastleTruePortalConfirmed };

/**
 * 节点锚点 = 游戏 position_x/y（连线端点）。
 * 与 arcarumDungeon 一致：线画在 (x,y)↔(x,y)，图标相对此点做锚点偏移，
 * 不是「图标左上角 + 半宽」。
 */
export function nodeCenter(n) {
  return {
    x: Number(n.position_x),
    y: Number(n.position_y),
  };
}

/**
 * 已消耗回合 total_turn → UI「第几回合」= total_turn + 1（对齐贤者助手）
 * @param {number|null|undefined} totalTurn
 */
export function displayTurnNumber(totalTurn) {
  const t = Number(totalTurn);
  if (!Number.isFinite(t) || t < 0) return 1;
  return Math.floor(t) + 1;
}

/**
 * 「第几天」：游戏包体通常无 day 字段。
 * 优先用注入/缓存的 day；否则按 hint + total_turn 粗分（与知识库 day1/day2 对照一致的启发式）。
 * @param {any} state
 */
export function inferDay(state) {
  if (!state) return 1;
  const d = Number(state.day);
  if (Number.isFinite(d) && d > 0) return Math.floor(d);

  const turn = Number(state.total_turn);
  const targets = state.hint?.target_node_types;
  // day2 样本：hint 偏向商店 [8]，且 total_turn 较大
  if (Array.isArray(targets) && targets.length === 1 && Number(targets[0]) === 8) {
    return 2;
  }
  if (Number.isFinite(turn) && turn >= 40) return 2;
  // 已出现 Boss 点且回合偏多 → 更像第二阶段
  const hasBoss = (state.node_list || []).some((n) => Number(n.node_type) === 1);
  if (hasBoss && Number.isFinite(turn) && turn >= 20) return 2;
  return 1;
}

/**
 * 瘴气短文案（对齐 formatMiasmaProgressText）
 * @param {any} state
 */
export function formatMiasmaProgressText(state) {
  const nodes = state?.node_list || [];
  const covered = nodes.filter((n) => n.is_shrinking).length;
  const mi = state?.miasma_info;
  let after = null;
  if (mi && typeof mi === "object") {
    after = mi.after && typeof mi.after === "object" ? mi.after : mi;
  }
  const active = Boolean(after?.is_miasmic);
  if (!active) {
    return covered > 0 ? `未蔓延 · 笼罩 ${covered} 格` : "未蔓延";
  }
  const parts = ["蔓延中"];
  if (after?.level != null && after.level !== "") parts.push(`Lv.${after.level}`);
  if (after?.step != null && after.step !== "") parts.push(`阶段 ${after.step}`);
  if (after?.miasma_stop_countdown != null && after.miasma_stop_countdown !== "") {
    parts.push(`停止倒计时 ${after.miasma_stop_countdown}`);
  }
  const cx = Number(after?.center_position_x);
  const cy = Number(after?.center_position_y);
  if (Number.isFinite(cx) && Number.isFinite(cy)) {
    parts.push(`圆心(${Math.round(cx)},${Math.round(cy)})`);
  }
  parts.push(`笼罩 ${covered} 格`);
  const mc = getMiasmaCenter(state);
  if (mc?.radius != null) {
    parts.push(`安全半径 ${Math.round(mc.radius)}`);
  }
  parts.push("寻路偏好留白圈内");
  return parts.join(" · ");
}

/**
 * 攻略进度一行：第 X 天 · 第 Y 回合
 * @param {any} state
 */
export function formatProgressLine(state) {
  const day = inferDay(state);
  const turn = displayTurnNumber(state?.total_turn);
  return `第 ${day} 天 · 第 ${turn} 回合`;
}

export function summarize(state) {
  if (!state?.node_list?.length) {
    return {
      nodes: 0,
      types: {},
      current: null,
      name: null,
      day: inferDay(state),
      turnDisplay: displayTurnNumber(state?.total_turn),
      progressLine: formatProgressLine(state),
      dungeonPoint: state?.possession_arcarum3_dungeon_point ?? null,
      miasmaText: formatMiasmaProgressText(state),
    };
  }
  const types = {};
  for (const n of state.node_list) {
    types[n.node_type] = (types[n.node_type] || 0) + 1;
  }
  return {
    nodes: state.node_list.length,
    types,
    current: state.current_node_id,
    name: state.name,
    boss: state.boss_node_id ?? (state.node_list.find((n) => n.node_type === 1)?.node_id ?? null),
    updatedAt: state.updatedAt,
    day: inferDay(state),
    turnDisplay: displayTurnNumber(state?.total_turn),
    totalTurn: state.total_turn,
    progressLine: formatProgressLine(state),
    dungeonPoint: state.possession_arcarum3_dungeon_point ?? 0,
    miasmaText: formatMiasmaProgressText(state),
  };
}
