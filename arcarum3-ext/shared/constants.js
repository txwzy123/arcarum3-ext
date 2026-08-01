/** Shared constants for Arcarum3 map extension */

export const MSG = {
  API_CAPTURED: "API_CAPTURED",
  GET_STATE: "GET_STATE",
  STATE_UPDATED: "STATE_UPDATED",
  GET_GUIDEBOOKS: "GET_GUIDEBOOKS",
  GUIDEBOOKS_UPDATED: "GUIDEBOOKS_UPDATED",
  CLEAR_GUIDEBOOK_SELECTION: "CLEAR_GUIDEBOOK_SELECTION",
  OPEN_MAP_WINDOW: "OPEN_MAP_WINDOW",
  FOCUS_MAP_WINDOW: "FOCUS_MAP_WINDOW",
  CLEAR_STATE: "CLEAR_STATE",
};

export const STORAGE_KEY = "arcarum3MapState";
export const GUIDEBOOK_STORAGE_KEY = "arcarum3Guidebooks";

/** CDN base candidates (game rotates a1–a5) */
export const CDN_BASES = [
  "https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
  "https://prd-game-a1-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
  "https://prd-game-a2-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
  "https://prd-game-a3-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
  "https://prd-game-a4-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
  "https://prd-game-a5-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3",
];

// 节点中英文名见 nodeTypes.js
export { NODE_TYPE_NAMES } from "./nodeTypes.js";

/** 地图上节点显示边长（游戏坐标空间；参考用 112，90 更贴近原版精灵比例） */
export const NODE_SIZE = 90;
/**
 * 底座/事件图标锚点（发光中心）相对宽高比例 — 对齐 arcarumDungeon mapRenderer
 * 连线交于 position，图标画在锚点处，勿用几何中心。
 */
export const BASE_ANCHOR_X = 0.5;
export const BASE_ANCHOR_Y = 0.83;
/** 底座精灵原生 45×50 */
export const BASE_NATIVE_W = 45;
export const BASE_NATIVE_H = 50;

/** URL path patterns worth capturing */
export const CAPTURE_PATHS = [
  /\/arcarum3\/dungeon\/content\/index\//i,
  /\/rest\/arcarum3\/dungeon\/move_node/i,
  /\/rest\/arcarum3\/dungeon\/finish_node_event/i,
  /\/rest\/arcarum3\/dungeon\/proceed_node_event/i,
  /\/rest\/arcarum3\/dungeon\/incident_choose/i,
  /\/rest\/arcarum3\/start_dungeon/i,
];

export const PROFILE_CAPTURE_PATHS = [
  /\/socket\/query/i,
];

export const GUIDEBOOK_CAPTURE_PATHS = [
  /\/arcarum3\/book(?:\/|$)/i,
  /\/rest\/arcarum3\/dungeon\/spacebook_status_list/i,
  /\/rest\/arcarum3\/dungeon\/proceed_node_event_spacebook_status_(?:add|remove)/i,
  /\/rest\/arcarum3\/dungeon\/dungeon_shop_lineup\//i,
  /\/rest\/arcarum3\/dungeon\/purchase_dungeon_shop_item/i,
  /\/result(?:multi)?\/content\/index/i,
];
