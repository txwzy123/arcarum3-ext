/**
 * 节点详情文案
 * 特殊事件 id/名称对齐 client_constants DUNGEON_SPECIAL_NODE_TYPE
 * 图例说明对齐 node_icon_info
 */
import {
  NODE_TYPE,
  SPECIAL_INCIDENT_META,
  getNodeTypeMeta,
  resolveNodeLabel,
  OFFICIAL_SPECIAL_LEGEND,
} from "./nodeTypes.js";

/**
 * @typedef {{ summary: string, tips?: string[] }} NodeLoreBlock
 */

/** @type {Record<number, NodeLoreBlock>} */
export const NODE_TYPE_LORE = {
  [NODE_TYPE.EMPTY]: {
    summary: "空地。无事件，可安全经过。",
    tips: ["通常不会因访问而改变类型", "Boss 等可能在缩圈后刷到已走过的格子上"],
  },
  [NODE_TYPE.BOSS]: {
    summary:
      "Boss 战节点（探索目标）。通常较危险；不可撤退。首次进图往往不存在，首次缩圈/瘴气事件时由服务端把某个已有节点改成 Boss。",
    tips: ["访问后事件通常会清除", "阶段 1 寻路建议避开"],
  },
  [NODE_TYPE.BATTLE]: {
    summary: "普通战斗。面对常规敌人。",
    tips: ["访问后事件通常会清除", "阶段 1 寻路可作高价值途经点"],
  },
  [NODE_TYPE.STRONG]: {
    summary: "强敌战。难度高于普通战斗。",
    tips: ["访问后事件通常会清除", "阶段 1 寻路建议避开"],
  },
  [NODE_TYPE.RULER]: {
    summary: "君临者：区域领主级遭遇，强力战斗，需谨慎接近。",
    tips: ["访问后事件通常会清除"],
  },
  [NODE_TYPE.EVENT]: {
    summary:
      "一般事件格（问号）。随机事件；此处战斗通常不可撤退。可能掉落监狱钥匙等道具。",
    tips: ["访问后事件通常会清除", "阶段 1 寻路可作高价值途经点"],
  },
  [NODE_TYPE.CHEST]: {
    summary: "宝箱。选择获得导本（guidebook）效果。",
    tips: ["访问后事件通常会清除", "阶段 1 寻路可作高价值途经点"],
  },
  [NODE_TYPE.HEAL]: {
    summary: "回复点。恢复队伍 HP 并复活倒地角色（官方：约 30% HP + 复活）。",
    tips: ["访问后事件通常会清除", "低血时优先规划途经"],
  },
  [NODE_TYPE.SHOP]: {
    summary:
      "商店。使用 Sephira 币购买导本/道具；可反复进入，货架商品不会刷新（已购不补货）。",
    tips: ["进入后会拉 shop_index + lineup", "stock_num>0 有货；===0 已购"],
  },
  [NODE_TYPE.PORTAL]: {
    summary: "传送门。可行走到邻接格，也可选择传送到地图上其他传送门。",
    tips: ["传送为可选操作"],
  },
  [NODE_TYPE.SPECIAL]: {
    summary:
      "特殊事件（官方图例：特殊イベント）。具体内容由 special_incident_id 决定；地点类事件带金色地点底图（scpecial_node_bg）。",
    tips: [
      "图标多为 10_incident（地点类）或 guru/fanatic/teleport/research",
      "地点类 4/9–18 有 scpecial_node_bg/{id}.png 金色区域底图",
      "访问后是否清除取决于 finish 的 is_delete_node",
    ],
  },
  [NODE_TYPE.TERRIFYING]: {
    summary: "超强敌。显著高于普通强敌的战斗压力。",
    tips: ["访问后是否清除取决于事件选项"],
  },
};

/** @type {Record<string, NodeLoreBlock>} */
export const SPECIAL_GROUP_LORE = {
  邪教祖: {
    summary: "邪教祖（GURU）：特殊战斗；狂信者越多越强。难度相对低、奖励高。",
  },
  狂信者: {
    summary: "狂信者（FANATIC）：崇拜邪教祖的敌人；特殊战斗。",
    tips: ["incident id 2 / 3 同组"],
  },
  浮空城传送: {
    summary:
      "浮空城传送口：确定真口前可能有多个；与研究者对话后假口消失，真口高亮。",
    tips: [
      "图标：10_teleport / 定真 10_teleport_glow",
      "不强制使用",
    ],
  },
  浮空城研究者: {
    summary:
      "浮空城研究者：选导本后假传送口消失、真口定标，并转移到真浮空城获得导本。",
  },
  真浮空城: {
    summary: "真浮空城：与研究者对话后转入，并获得导本。有地点底图。",
  },
  地点特殊: {
    summary:
      "地点型特殊事件（时钟塔/花畑/监狱/温泉/铁匠/要塞/大教堂/洞窟/石像/村庄等）。地图上有金色地点底图；官方图例统称「特殊イベント：该地点对应的特定事件」。",
    tips: [
      "special_incident_id = 地点种类",
      "底图：assets/scpecial_node_bg/{id}.png",
      "图标：10_incident.png",
    ],
  },
};

/**
 * 各 special_incident_id 详情（名称以官方枚举为准）
 * @type {Record<number, NodeLoreBlock>}
 */
export const SPECIAL_INCIDENT_LORE = {
  1: {
    summary: "邪教祖（GURU, id=1）。狂信者が存在するほど強くなる。",
    tips: ["图标 10_guru（若缺则回退 incident）", "特殊战斗"],
  },
  2: {
    summary: "狂信者（FANATIC_1, id=2）。邪教祖を崇める敵。",
    tips: ["图标 10_fanatic"],
  },
  3: {
    summary: "狂信者（FANATIC_2, id=3）。邪教祖を崇める敵。",
    tips: ["图标 10_fanatic"],
  },
  4: {
    summary:
      "真浮空城（FLOATING_CASTLE, id=4）。与浮空城研究者互动后，可经多个传送口中的正确入口到达；到达后即可确认正确传送门。",
    tips: [
      "奖励：随机金色导本三选一",
      "有 scpecial_node_bg/4.png 金色底图",
    ],
  },
  5: {
    summary: "浮空城传送口（TELEPORT_1, id=5）。",
    tips: ["官方图标映射为 TELEPORT_GLOW", "未定真时可能与 6/7 并存"],
  },
  6: {
    summary: "浮空城传送口（TELEPORT_2, id=6）。",
    tips: ["图标 10_teleport"],
  },
  7: {
    summary: "浮空城传送口（TELEPORT_3, id=7）。",
    tips: ["图标 10_teleport"],
  },
  8: {
    summary: "浮空城研究者（RESEARCHER, id=8）。",
    tips: ["图标 10_research", "定真口并转入 id=4"],
  },
  9: {
    summary:
      "时停塔 / 时钟塔（CLOCK_TOWER, id=9）。进入不计入缩圈时间的四连战，完成后可获得丰厚奖励。",
    tips: [
      "SE: sp_tower",
      "底图 scpecial_node_bg/9.png",
      "四场战斗期间停止计算缩圈时间",
    ],
  },
  10: {
    summary:
      "花畑（FLOWER_GARDEN, id=10）。恢复全队生命、技能冷却和召唤冷却，并从两种导本处理方式中选择一种。",
    tips: [
      "选项 1：恢复所有生命与技能、召唤冷却，并转化两个导本",
      "选项 2：恢复所有生命与技能、召唤冷却，并获得一个导本",
      "SE: sp_flower_garden",
      "底图 scpecial_node_bg/10.png（金色区域）",
    ],
  },
  11: {
    summary:
      "监狱（PRISON, id=11）。可与守卫战斗、尝试潜入、使用监狱钥匙，或暂时离开以后再来。",
    tips: [
      "选项 1：与守卫战斗后释放犯人；奖励为解锁一个召唤石或获得金色导本",
      "选项 2（潜入）：20% 概率成功；80% 概率被发现并进入战斗",
      "选项 3（钥匙开门）：监狱钥匙可从随机事件获得，在此使用后直接获得奖励",
      "选项 4：以后再来",
      "SE: sp_prison",
      "底图 scpecial_node_bg/11.png",
    ],
  },
  12: {
    summary:
      "温泉（HOT_SPRING, id=12）。恢复全队所有生命、技能冷却和召唤冷却，并获得一个特殊导本。",
    tips: [
      "特殊导本：我方全员技能冷却时间 -1；回合开始时回复 10% HP",
      "SE: sp_hot_spring",
      "底图 scpecial_node_bg/12.png",
    ],
  },
  13: {
    summary:
      "铁匠台（BLACKSMITH_TABLE, id=13）。触发下列四种随机结果之一。",
    tips: [
      "结果 1：获得 600 金币",
      "结果 2：全队损失 20% HP，解锁一个召唤石",
      "结果 3：全队损失 20% HP，解锁一把武器",
      "结果 4：消除两个导本并获得一个导本",
      "SE: sp_blacksmith_table",
      "底图 scpecial_node_bg/13.png",
    ],
  },
  14: {
    summary:
      "要塞（FORT, id=14）。与强敌战斗，奖励必定包含一个角色或一把武器。",
    tips: ["SE: sp_fort", "底图 scpecial_node_bg/14.png", "图标 10_incident"],
  },
  15: {
    summary:
      "大教堂（CATHEDRAL, id=15）。可花费金币重组导本，或购买一个特殊导本。",
    tips: [
      "选项 1：花费 150 金币，消除两个导本并获得两个导本",
      "选项 2：花费 300 金币，获得一个特殊导本",
      "特殊导本：战斗开始后的 2 回合内，我方全体获得受伤无效、弱体无效和防驱散；无法抵挡白字伤害",
      "SE: sp_cathedral",
      "底图 scpecial_node_bg/15.png",
    ],
  },
  16: {
    summary:
      "洞窟（CAVE, id=16）。最多探索 5 次，每次可能遇到奖励或战斗。",
    tips: [
      "在随机事件中购买血液后，可在此引出特定怪物",
      "SE: sp_cave",
      "底图 scpecial_node_bg/16.png",
    ],
  },
  17: {
    summary:
      "石像（STONE_FACE, id=17）。完成精英怪三连战后获得一个特殊导本。",
    tips: [
      "特殊导本：战斗开始时，1 号位对敌方全体造成土、风属性伤害，并施加攻防、连击率降低；我方获得土属性追击效果",
      "特殊导本：回合结束时，1 号位为我方全体回复 HP，并提升 10% 奥义充能",
      "SE: sp_statue",
      "底图 scpecial_node_bg/17.png",
    ],
  },
  18: {
    summary:
      "村庄（VILLAGE, id=18）。与怪物战斗后获得 300 金币；此处随后变为商店，并提供 25% 折扣。",
    tips: ["SE: sp_village", "底图 scpecial_node_bg/18.png"],
  },
};

/**
 * @param {any} node
 * @param {any} [stateOrOpts]  兼容 map.js：传 state；或 { truePortalConfirmed }
 */
export function buildNodeDetailView(node, stateOrOpts = {}) {
  if (!node) {
    return {
      title: "—",
      summary: "点击节点查看详情。",
      tips: [],
      legendLine: "",
      statusLines: [],
      debugText: "—",
      debug: null,
    };
  }
  const type = Number(node.node_type);
  const sid =
    node.special_incident_id == null || node.special_incident_id === ""
      ? null
      : Number(node.special_incident_id);
  const typeMeta = getNodeTypeMeta(type);
  const title = resolveNodeLabel(type, sid);
  const meta = sid != null ? SPECIAL_INCIDENT_META[sid] : null;

  let lore = NODE_TYPE_LORE[type] || { summary: typeMeta.name };
  if (type === NODE_TYPE.SPECIAL && sid != null) {
    const inc = SPECIAL_INCIDENT_LORE[sid];
    const groupLore = meta ? SPECIAL_GROUP_LORE[meta.group] : null;
    lore = {
      summary:
        (inc?.summary || groupLore?.summary || lore.summary) +
        (meta ? `（${meta.enumKey}）` : ""),
      tips: [
        ...(inc?.tips || []),
        ...(groupLore?.tips || []),
        meta?.bg ? "金色地点底图：scpecial_node_bg/" + sid + ".png" : null,
        meta?.icon ? `图标：10_${meta.icon}.png` : "图标：10_incident.png",
        meta?.nameJa ? `日文名：${meta.nameJa}` : null,
        meta?.en ? `EN：${meta.en}` : null,
      ].filter(Boolean),
    };
  }

  let legendLine = "";
  if (type === NODE_TYPE.SPECIAL && sid != null) {
    const leg = OFFICIAL_SPECIAL_LEGEND.find((g) =>
      g.special_incident_ids.includes(sid)
    );
    if (leg) {
      legendLine = `官方图例「${leg.nameJa}」：${leg.text.replace(/<br>/g, "")}`;
    }
  }

  const statusLines = [];
  if (node.node_id === stateOrOpts?.current_node_id) statusLines.push("当前位置");
  if (node.is_visited) statusLines.push("已访问");
  if (node.is_shrinking) statusLines.push("瘴气笼罩（圈外）");
  if (node.is_quest_check) statusLines.push("任务检测格");

  const debug = {
    node_id: node.node_id,
    node_type: type,
    special_incident_id: sid,
    enum: meta?.enumKey ?? null,
    position: [node.position_x, node.position_y],
    is_visited: !!node.is_visited,
    is_shrinking: !!node.is_shrinking,
    adjacent: node.adjacent_node_ids,
  };

  return {
    title,
    type,
    sid,
    summary: lore.summary,
    tips: lore.tips || [],
    legendLine,
    statusLines,
    debugText: JSON.stringify(debug, null, 2),
    debug,
  };
}

/**
 * @param {HTMLElement} el
 * @param {ReturnType<typeof buildNodeDetailView>|null} view
 */
export function renderNodeDetail(el, view) {
  if (!el) return;
  if (!view) {
    el.innerHTML = `<p class="node-detail-empty">点击节点查看详情。</p>`;
    return;
  }
  const tips = (view.tips || [])
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join("");
  const status = (view.statusLines || [])
    .map((s) => `<span class="tag">${escapeHtml(s)}</span>`)
    .join(" ");
  el.innerHTML = `
    <h3 class="node-detail-title">${escapeHtml(view.title)}</h3>
    ${status ? `<div class="node-detail-status">${status}</div>` : ""}
    <p class="node-detail-summary">${escapeHtml(view.summary)}</p>
    ${
      view.legendLine
        ? `<p class="node-detail-legend">${escapeHtml(view.legendLine)}</p>`
        : ""
    }
    ${tips ? `<ul class="node-detail-tips">${tips}</ul>` : ""}
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
