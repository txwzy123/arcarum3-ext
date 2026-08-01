/**
 * 节点类型与特殊事件元数据
 *
 * 官方枚举对齐 out/client_constants.typed.js：
 *   DUNGEON_NODE_TYPE / DUNGEON_SPECIAL_NODE_TYPE
 *   DUNGEON_SPECIAL_NODE_ICON_MAP / SPECIAL_NODE_BG_MAP
 * 图例文案对齐 content/index 的 node_icon_info（日/英随账号语言）
 */

export const NODE_TYPE = {
  EMPTY: 0,
  BOSS: 1,
  BATTLE: 2,
  STRONG: 3,
  RULER: 4, // 君臨者
  EVENT: 5,
  CHEST: 6,
  HEAL: 7,
  SHOP: 8,
  PORTAL: 9,
  SPECIAL: 10,
  TERRIFYING: 11, // 超強敵
};

/** @type {Record<number, { name: string, short: string, en: string, color: string, clearsOnVisit: boolean }>} */
export const NODE_TYPE_META = {
  [NODE_TYPE.EMPTY]: {
    name: "空地",
    short: "空",
    en: "Empty",
    color: "#6b7280",
    clearsOnVisit: false,
  },
  [NODE_TYPE.BOSS]: {
    name: "Boss",
    short: "Boss",
    en: "Boss",
    color: "#dc2626",
    clearsOnVisit: true,
  },
  [NODE_TYPE.BATTLE]: {
    name: "普通战斗",
    short: "战",
    en: "Battle",
    color: "#ea580c",
    clearsOnVisit: true,
  },
  [NODE_TYPE.STRONG]: {
    name: "强敌",
    short: "强",
    en: "Strong Foe",
    color: "#c2410c",
    clearsOnVisit: true,
  },
  [NODE_TYPE.RULER]: {
    name: "君临者",
    short: "君",
    en: "Ruler",
    color: "#7c2d12",
    clearsOnVisit: true,
  },
  [NODE_TYPE.EVENT]: {
    name: "事件",
    short: "事",
    en: "Event",
    color: "#7c3aed",
    clearsOnVisit: true,
  },
  [NODE_TYPE.CHEST]: {
    name: "宝箱",
    short: "箱",
    en: "Treasure Chest",
    color: "#ca8a04",
    clearsOnVisit: true,
  },
  [NODE_TYPE.HEAL]: {
    name: "回复",
    short: "回",
    en: "Healing",
    color: "#16a34a",
    clearsOnVisit: true,
  },
  [NODE_TYPE.SHOP]: {
    name: "商店",
    short: "店",
    en: "Shop",
    color: "#0891b2",
    clearsOnVisit: false,
  },
  [NODE_TYPE.PORTAL]: {
    name: "传送门",
    short: "传",
    en: "Teleporter",
    color: "#2563eb",
    clearsOnVisit: false,
  },
  [NODE_TYPE.SPECIAL]: {
    name: "特殊事件",
    short: "特",
    en: "Special Event",
    color: "#db2777",
    clearsOnVisit: true,
  },
  [NODE_TYPE.TERRIFYING]: {
    name: "超强敌",
    short: "超",
    en: "Terrifying Foe",
    color: "#991b1b",
    clearsOnVisit: true,
  },
};

/**
 * 官方 DUNGEON_SPECIAL_NODE_TYPE（special_incident_id）
 * @type {Record<number, string>}
 */
export const SPECIAL_INCIDENT_ENUM = {
  1: "GURU",
  2: "FANATIC_1",
  3: "FANATIC_2",
  4: "FLOATING_CASTLE",
  5: "FLOATING_CASTLE_TELEPORT_1",
  6: "FLOATING_CASTLE_TELEPORT_2",
  7: "FLOATING_CASTLE_TELEPORT_3",
  8: "FLOATING_CASTLE_RESEARCHER",
  9: "CLOCK_TOWER",
  10: "FLOWER_GARDEN",
  11: "PRISON",
  12: "HOT_SPRING",
  13: "BLACKSMITH_TABLE",
  14: "FORT",
  15: "CATHEDRAL",
  16: "CAVE",
  17: "STONE_FACE",
  18: "VILLAGE",
};

/** 浮空城传送口 special_incident_id */
export const SKY_CASTLE_PORTAL_IDS = new Set([5, 6, 7]);

/**
 * special_incident_id → 显示名 / 分组 / 图标 / 底图
 *
 * icon: node_icon 文件后缀（10_{icon}.png）；缺省 incident
 * bg: scpecial_node_bg/{id}.png（官方有底图的地点事件）；null 无底图
 *
 * @type {Record<number, {
 *   name: string,
 *   nameJa: string,
 *   en: string,
 *   group: string,
 *   enumKey: string,
 *   icon?: string,
 *   bg: boolean,
 *   se?: string,
 * }>}
 */
export const SPECIAL_INCIDENT_META = {
  1: {
    name: "邪教祖",
    nameJa: "邪教祖",
    en: "Cult Founder",
    group: "邪教祖",
    enumKey: "GURU",
    icon: "guru",
    bg: false,
    se: "sp_encount_hard",
  },
  2: {
    name: "狂信者",
    nameJa: "狂信者",
    en: "Cultist",
    group: "狂信者",
    enumKey: "FANATIC_1",
    icon: "fanatic",
    bg: false,
    se: "sp_encount_normal",
  },
  3: {
    name: "狂信者",
    nameJa: "狂信者",
    en: "Cultist",
    group: "狂信者",
    enumKey: "FANATIC_2",
    icon: "fanatic",
    bg: false,
    se: "sp_encount_normal",
  },
  4: {
    name: "真浮空城",
    nameJa: "浮遊城",
    en: "Floating Castle",
    group: "真浮空城",
    enumKey: "FLOATING_CASTLE",
    bg: true,
    se: "sp_incident",
  },
  5: {
    name: "浮空城传送口",
    nameJa: "浮遊城への転移",
    en: "Floating Castle Portal",
    group: "浮空城传送",
    enumKey: "FLOATING_CASTLE_TELEPORT_1",
    icon: "teleport",
    bg: false,
  },
  6: {
    name: "浮空城传送口",
    nameJa: "浮遊城への転移",
    en: "Floating Castle Portal",
    group: "浮空城传送",
    enumKey: "FLOATING_CASTLE_TELEPORT_2",
    icon: "teleport",
    bg: false,
  },
  7: {
    name: "浮空城传送口",
    nameJa: "浮遊城への転移",
    en: "Floating Castle Portal",
    group: "浮空城传送",
    enumKey: "FLOATING_CASTLE_TELEPORT_3",
    icon: "teleport",
    bg: false,
  },
  8: {
    name: "浮空城研究者",
    nameJa: "浮遊城の研究者",
    en: "Floating Castle Researcher",
    group: "浮空城研究者",
    enumKey: "FLOATING_CASTLE_RESEARCHER",
    icon: "research",
    bg: false,
  },
  9: {
    name: "时停塔",
    nameJa: "時計塔",
    en: "Clock Tower",
    group: "地点特殊",
    enumKey: "CLOCK_TOWER",
    bg: true,
    se: "sp_tower",
  },
  10: {
    name: "花畑",
    nameJa: "花畑",
    en: "Flower Garden",
    group: "地点特殊",
    enumKey: "FLOWER_GARDEN",
    bg: true,
    se: "sp_flower_garden",
  },
  11: {
    name: "监狱",
    nameJa: "監獄",
    en: "Prison",
    group: "地点特殊",
    enumKey: "PRISON",
    bg: true,
    se: "sp_prison",
  },
  12: {
    name: "温泉",
    nameJa: "温泉",
    en: "Hot Spring",
    group: "地点特殊",
    enumKey: "HOT_SPRING",
    bg: true,
    se: "sp_hot_spring",
  },
  13: {
    name: "铁匠台",
    nameJa: "鍛冶台",
    en: "Blacksmith Table",
    group: "地点特殊",
    enumKey: "BLACKSMITH_TABLE",
    bg: true,
    se: "sp_blacksmith_table",
  },
  14: {
    name: "要塞",
    nameJa: "砦",
    en: "Fort",
    group: "地点特殊",
    enumKey: "FORT",
    bg: true,
    se: "sp_fort",
  },
  15: {
    name: "大教堂",
    nameJa: "大聖堂",
    en: "Cathedral",
    group: "地点特殊",
    enumKey: "CATHEDRAL",
    bg: true,
    se: "sp_cathedral",
  },
  16: {
    name: "洞窟",
    nameJa: "洞窟",
    en: "Cave",
    group: "地点特殊",
    enumKey: "CAVE",
    bg: true,
    se: "sp_cave",
  },
  17: {
    name: "石像",
    nameJa: "石像",
    en: "Stone Face",
    group: "地点特殊",
    enumKey: "STONE_FACE",
    bg: true,
    se: "sp_statue",
  },
  18: {
    name: "村庄",
    nameJa: "村",
    en: "Village",
    group: "地点特殊",
    enumKey: "VILLAGE",
    bg: true,
    se: "sp_village",
  },
};

/**
 * 官方图例分组（来自 node_icon_info，日文账号）
 * special_incident_ids 为字符串数组
 */
export const OFFICIAL_SPECIAL_LEGEND = [
  {
    special_incident_ids: [2, 3],
    name: "狂信者",
    nameJa: "狂信者",
    en: "Cultist",
    text: "邪教祖を崇める敵が出現するマス",
    textEn: "Face foes who worship the Cult Founder.",
  },
  {
    special_incident_ids: [1],
    name: "邪教祖",
    nameJa: "邪教祖",
    en: "Cult Founder",
    text: "狂信者が存在するほど強くなる敵が出現するマス",
    textEn: "Face a foe whose power increases for each remaining Cultist.",
  },
  {
    special_incident_ids: [8],
    name: "浮空城研究者",
    nameJa: "浮遊城の研究者",
    en: "Floating Castle Researcher",
    text: "浮遊城の研究者が出現するマス",
    textEn: "Meet a researcher of the Floating Castle.",
  },
  {
    special_incident_ids: [5, 6, 7],
    name: "浮空城传送",
    nameJa: "浮遊城への転移",
    en: "Floating Castle Portal",
    text: "複数ある中のいずれかが浮遊城へと繋がるマス",
    textEn: "A portal that may, or may not, lead to the Floating Castle.",
  },
  {
    special_incident_ids: [4, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
    name: "特殊事件",
    nameJa: "特殊イベント",
    en: "Special Event",
    text: "その場所に対応した特定のイベントが発生するマス",
    textEn: "Encounter an event specific to the area.",
    /** 地图上带金色/地点底图 scpecial_node_bg/{id}.png */
    hasLocationBg: true,
  },
];

/**
 * 特殊地点底图锚点（对齐 MAP_SPECIAL_NODE_BG_OFFSET）
 * NODE_CONNECT_LINE_OFFSET (44,86)；BG 原点相对节点 position 左上偏移
 * 图为 620×620，offset = (310-44, 310-86) = (266, 224)
 */
export const SPECIAL_NODE_BG_OFFSET = { x: 266, y: 224 };
export const SPECIAL_NODE_BG_NATIVE = 620;

/**
 * type 10 图标文件名（相对 node_icon/）
 * @param {number|null|undefined} specialIncidentId
 * @param {{ truePortalConfirmed?: boolean }} [opts]
 */
export function resolveSpecialEventIconFile(specialIncidentId, opts = {}) {
  if (specialIncidentId == null) return "10_incident.png";
  const sid = Number(specialIncidentId);
  if (SKY_CASTLE_PORTAL_IDS.has(sid)) {
    // 官方：TELEPORT_1 用 glow；2/3 用普通 teleport；定真后仅剩一口也用 glow
    if (opts.truePortalConfirmed || sid === 5) return "10_teleport_glow.png";
    return "10_teleport.png";
  }
  const meta = SPECIAL_INCIDENT_META[sid];
  if (meta?.icon) return `10_${meta.icon}.png`;
  return "10_incident.png";
}

/**
 * 是否有地点金色底图
 * @param {number|null|undefined} specialIncidentId
 */
export function hasSpecialNodeBg(specialIncidentId) {
  if (specialIncidentId == null) return false;
  return Boolean(SPECIAL_INCIDENT_META[Number(specialIncidentId)]?.bg);
}

/**
 * 底图相对路径（CDN / 本地 assets）
 * @param {number} specialIncidentId
 */
export function specialNodeBgRel(specialIncidentId) {
  return `assets/scpecial_node_bg/${Number(specialIncidentId)}.png`;
}

/**
 * @param {{ node_type: number, special_incident_id?: number|null }[]} nodes
 */
export function isSkyCastleTruePortalConfirmed(nodes) {
  let n = 0;
  for (const node of nodes || []) {
    if (Number(node.node_type) !== NODE_TYPE.SPECIAL) continue;
    const sid = node.special_incident_id;
    if (sid != null && SKY_CASTLE_PORTAL_IDS.has(Number(sid))) {
      n++;
      if (n > 1) return false;
    }
  }
  return n === 1;
}

export function resolveNodeLabel(nodeType, specialIncidentId) {
  if (Number(nodeType) === NODE_TYPE.SPECIAL && specialIncidentId != null) {
    const special = SPECIAL_INCIDENT_META[Number(specialIncidentId)];
    if (special) return special.name;
  }
  return NODE_TYPE_META[nodeType]?.name ?? `未知(${nodeType})`;
}

export function getNodeTypeMeta(nodeType) {
  return (
    NODE_TYPE_META[nodeType] ?? {
      name: `未知(${nodeType})`,
      short: "?",
      en: "Unknown",
      color: "#9ca3af",
      clearsOnVisit: false,
    }
  );
}

/** 兼容旧代码：type → 英文名 */
export const NODE_TYPE_NAMES = Object.fromEntries(
  Object.entries(NODE_TYPE_META).map(([k, v]) => [Number(k), v.en])
);
