/**
 * 独立地图窗口：平移/缩放 + 左下图例 + 路径规划
 *
 * 性能：状态变化时烘焙静态层（背景+边+节点），拖拽/缩放只 blit + 叠加动态层。
 * 连线：端点 = 原始 position_x/y（与贤者助手一致）；图标按 0.5/0.83 锚点对齐。
 */
import {
  MSG,
  CDN_BASES,
  NODE_SIZE,
  BASE_ANCHOR_X,
  BASE_ANCHOR_Y,
  BASE_NATIVE_W,
  BASE_NATIVE_H,
} from "../shared/constants.js";
import {
  NODE_TYPE,
  NODE_TYPE_META,
  hasSpecialNodeBg,
  specialNodeBgRel,
  SPECIAL_NODE_BG_OFFSET,
  SPECIAL_NODE_BG_NATIVE,
} from "../shared/nodeTypes.js";
import {
  iconStemForNode,
  nodeCenter,
  typeName,
  summarize,
  isSkyCastleTruePortalConfirmed,
  inferDay,
} from "../shared/map-model.js";
import { getMiasmaCenter } from "../shared/miasma.js";
import { buildNodeDetailView, renderNodeDetail } from "../shared/nodeDetail.js";
import {
  PRESET_LABEL,
  toRouteMap,
  planRouteWithVias,
  summarizeRoute,
} from "../shared/path/weightedRoute.js";
import {
  findLowestScorePathSticky,
  describeExploreScores,
  scoreForType,
  REPLAN_STICKINESS,
  EXPLORE_WEIGHTS,
  EXPLORE_SCORE_FIELDS,
} from "../shared/path/exploreScore.js";
import { createGuidebookView } from "./guidebookView.js";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const $ = (id) => document.getElementById(id);

/** @type {any} */
let state = null;
let activeWindowView = "map";

const EXPLORE_WEIGHTS_STORAGE_KEY = "gbf-explore-score-weights-v1";
let exploreWeights = loadExploreWeights();

let scale = 0.45;
let ox = 40;
let oy = 40;

let dragging = false;
let dragMoved = false;
let lastX = 0;
let lastY = 0;
let hoverId = null;
let selectedId = null;

/** @type {{ kind: 'current' } | { kind: 'type', displayType: number } | null} */
let highlightFilter = null;
let legendSelectedKey = null;

let routePreset = "short";
/** @type {number|null} */
let routeGoal = null;
/** @type {number[]} */
let routeVias = [];
/** @type {number[]|null} */
let routePath = null;
/** 'target' 右键目标寻路 | 'explore' 无目标收益扫路 */
let routeMode = null;
/** @type {number|null} */
let exploreScore = null;

const showEmpty = $("show-empty");
const showIds = $("show-ids");
const showLegend = $("show-legend");

/** 底图亮度（百分比，持久化到 localStorage） */
let bgBrightness = (() => {
  const v = Number(localStorage.getItem("map_bg_brightness"));
  return Number.isFinite(v) && v >= 50 && v <= 160 ? v : 100;
})();

const images = new Map();
let cdnBase = CDN_BASES[0];
let bgKey = "bg:assets/map_bg/1.jpg";
let mapW = 2680;
let mapH = 1830;

/** 静态世界层（1:1 游戏坐标） */
const staticCanvas = document.createElement("canvas");
const staticCtx = staticCanvas.getContext("2d");
let staticDirty = true;
let staticKey = "";

let needsRedraw = true;
let raf = 0;

const guidebookView = createGuidebookView({
  onRender(summary) {
    if (activeWindowView === "guidebooks") updateGuidebookFooter(summary);
  },
});

// 图标绘制尺寸（世界坐标）
const iconW = NODE_SIZE;
const iconH = NODE_SIZE * (BASE_NATIVE_H / BASE_NATIVE_W);
const hitR = (NODE_SIZE / 2) * 1.25;

function assetUrl(rel) {
  return `${cdnBase}/${rel}`;
}

function loadImage(key, url) {
  if (images.has(key)) return images.get(key);
  const img = new Image();
  img.decoding = "async";
  img.crossOrigin = "anonymous";
  img.src = url;
  images.set(key, img);
  img.onload = () => {
    if (String(key).startsWith("bg:") && img.naturalWidth) {
      mapW = img.naturalWidth;
      mapH = img.naturalHeight;
      bgKey = key;
    }
    staticDirty = true;
    scheduleDraw();
  };
  img.onerror = () => {
    images.set(key, null);
    scheduleDraw();
  };
  return img;
}

function ensureAssets() {
  const mapId = state?.map_id || 1;
  // 背景固定 1.jpg（map_id 不是 bg 编号）
  loadImage("bg:assets/map_bg/1.jpg", assetUrl("assets/map_bg/1.jpg"));
  if (mapId !== 1) {
    loadImage(`bg:assets/map_bg/${mapId}.jpg`, assetUrl(`assets/map_bg/${mapId}.jpg`));
  }
  loadImage("base", assetUrl("assets/node_icon/base.png"));
  loadImage("base_cleared", assetUrl("assets/node_icon/base_cleared.png"));
  loadImage("piece", assetUrl("assets/node_icon/piece_1.png"));
  loadImage("pointer", assetUrl("dungeon/pointer_current_node.png"));
  for (let t = 1; t <= 11; t++) {
    if (t === 10) {
      loadImage("icon:10_incident", assetUrl("assets/node_icon/10_incident.png"));
      loadImage("icon:10_research", assetUrl("assets/node_icon/10_research.png"));
      loadImage("icon:10_teleport", assetUrl("assets/node_icon/10_teleport.png"));
      loadImage("icon:10_teleport_glow", assetUrl("assets/node_icon/10_teleport_glow.png"));
      // 可选：官方还有 10_guru / 10_fanatic（本地可能缺失，load 失败无妨）
      loadImage("icon:10_guru", assetUrl("assets/node_icon/10_guru.png"));
      loadImage("icon:10_fanatic", assetUrl("assets/node_icon/10_fanatic.png"));
    } else {
      loadImage(`icon:${t}`, assetUrl(`assets/node_icon/${t}.png`));
    }
  }
  // 地点特殊事件金色底图 scpecial_node_bg/{special_incident_id}.png
  for (const n of state?.node_list || []) {
    if (Number(n.node_type) !== NODE_TYPE.SPECIAL) continue;
    const sid = n.special_incident_id;
    if (!hasSpecialNodeBg(sid)) continue;
    const rel = specialNodeBgRel(sid);
    loadImage(`spbg:${sid}`, assetUrl(rel));
  }
}

function portalOpts() {
  return {
    truePortalConfirmed: isSkyCastleTruePortalConfirmed(state?.node_list || []),
  };
}

function imgReady(key) {
  const im = images.get(key);
  return im && im.complete && im.naturalWidth > 0 ? im : null;
}

/** 图标左上角（使锚点落在 position） */
function iconTopLeft(px, py) {
  return {
    x: px - iconW * BASE_ANCHOR_X,
    y: py - iconH * BASE_ANCHOR_Y,
  };
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scheduleDraw();
}

function worldToScreen(x, y) {
  return { x: x * scale + ox, y: y * scale + oy };
}

function screenToWorld(sx, sy) {
  return { x: (sx - ox) / scale, y: (sy - oy) / scale };
}

function scheduleDraw() {
  needsRedraw = true;
  if (!raf) {
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (needsRedraw) paint();
    });
  }
}

function setZoomLabels() {
  const t = `${Math.round(scale * 100)}%`;
  $("zoom-label").textContent = t;
  $("zoom-label-float").textContent = t;
}

function nodeMatchesFilter(n, current) {
  if (!highlightFilter) return true;
  if (highlightFilter.kind === "current") return n.node_id === current;
  if (highlightFilter.kind === "type") return n.node_type === highlightFilter.displayType;
  return true;
}

function computeStaticKey() {
  return [
    state?.updatedAt || 0,
    state?.current_node_id,
    showEmpty.checked ? 1 : 0,
    showIds.checked ? 1 : 0,
    legendSelectedKey || "",
    mapW,
    mapH,
    portalOpts().truePortalConfirmed ? 1 : 0,
    bgBrightness,
  ].join("|");
}

/**
 * 烘焙背景 + 边 + 节点到 staticCanvas（世界 1:1）
 * 筛选压暗也烤进去，避免每帧重画图标
 */
function rebuildStaticLayer() {
  const key = computeStaticKey();
  if (!staticDirty && key === staticKey && staticCanvas.width === mapW) return;
  staticDirty = false;
  staticKey = key;

  if (staticCanvas.width !== mapW || staticCanvas.height !== mapH) {
    staticCanvas.width = mapW;
    staticCanvas.height = mapH;
  }
  const sctx = staticCtx;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.fillStyle = "#0b0f14";
  sctx.fillRect(0, 0, mapW, mapH);

  const bg =
    imgReady(bgKey) ||
    imgReady("bg:assets/map_bg/1.jpg") ||
    imgReady(`bg:assets/map_bg/${state?.map_id || 1}.jpg`);
  if (bg) {
    // 全不透明绘制，亮度由滑杆控制（旧版 0.5 半透明叠黑底导致整图过暗）
    sctx.filter = `brightness(${bgBrightness / 100}) saturate(1.06)`;
    sctx.drawImage(bg, 0, 0, mapW, mapH);
    sctx.filter = "none";
  }

  const nodes = state?.node_list || [];
  if (!nodes.length) return;

  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const current =
    state.current_node_id != null ? Number(state.current_node_id) : null;
  const filtering = Boolean(highlightFilter);

  // —— 连线：端点 = 原始 position_x/y（与贤者助手 mapRenderer 一致）——
  // 先收集去重后的边，再分两层画：深色描边打底 + 亮色虚线，
  // 保证普通通路在亮/暗底图上都清晰（旧版 #4b5c70 在暗底图上几乎不可见，看起来像“连线丢失”）。
  const edges = [];
  const drawn = new Set();
  for (const n of nodes) {
    for (const adj of n.adjacent_node_ids || []) {
      const a = Number(adj);
      if (!byId.has(a)) continue;
      const lo = Math.min(n.node_id, a);
      const hi = Math.max(n.node_id, a);
      const ek = `${lo}-${hi}`;
      if (drawn.has(ek)) continue;
      drawn.add(ek);
      const A = byId.get(lo);
      const B = byId.get(hi);
      edges.push({ A, B, miasma: Boolean(A.is_shrinking || B.is_shrinking) });
    }
  }

  const strokeEdges = (list) => {
    sctx.beginPath();
    for (const e of list) {
      sctx.moveTo(e.A.position_x, e.A.position_y);
      sctx.lineTo(e.B.position_x, e.B.position_y);
    }
    sctx.stroke();
  };
  const normalEdges = edges.filter((e) => !e.miasma);
  const miasmaEdges = edges.filter((e) => e.miasma);

  sctx.lineCap = "round";
  sctx.globalAlpha = filtering ? 0.22 : 1;

  // 1) 深色描边打底
  sctx.setLineDash([]);
  sctx.strokeStyle = "rgba(6, 10, 14, 0.5)";
  sctx.lineWidth = 11;
  strokeEdges(edges);

  // 2) 普通通路：亮色圆点链（贴近游戏原版风格）
  sctx.strokeStyle = "#f5f2df";
  sctx.lineWidth = 6.5;
  sctx.setLineDash([0.5, 13]);
  strokeEdges(normalEdges);

  // 3) 毒圈覆盖的边：瘴气紫虚线
  sctx.strokeStyle = "#c084fc";
  sctx.lineWidth = 8;
  sctx.setLineDash([12, 8]);
  strokeEdges(miasmaEdges);

  sctx.setLineDash([]);
  sctx.globalAlpha = 1;

  // —— 节点 ——
  const opts = portalOpts();
  for (const n of nodes) {
    if (n.node_type === 0 && !showEmpty.checked) continue;

    const match = nodeMatchesFilter(n, current);
    const alpha = filtering ? (match ? 1 : 0.22) : 1;
    sctx.globalAlpha = alpha;

    const px = n.position_x;
    const py = n.position_y;
    const tl = iconTopLeft(px, py);

    if (filtering && match) {
      sctx.shadowColor = "rgba(251,191,36,0.9)";
      sctx.shadowBlur = 10;
    } else {
      sctx.shadowBlur = 0;
    }

    // 地点特殊事件：金色区域底图（对齐官方 specialNodeBg，620² 锚点偏移）
    if (
      Number(n.node_type) === NODE_TYPE.SPECIAL &&
      hasSpecialNodeBg(n.special_incident_id)
    ) {
      const bg = imgReady(`spbg:${n.special_incident_id}`);
      if (bg) {
        const bx = px - SPECIAL_NODE_BG_OFFSET.x;
        const by = py - SPECIAL_NODE_BG_OFFSET.y;
        sctx.drawImage(
          bg,
          bx,
          by,
          SPECIAL_NODE_BG_NATIVE,
          SPECIAL_NODE_BG_NATIVE
        );
      }
    }

    const baseKey = n.is_visited ? "base_cleared" : "base";
    const base = imgReady(baseKey) || imgReady("base");
    if (base) {
      sctx.drawImage(base, tl.x, tl.y, iconW, iconH);
    } else {
      sctx.fillStyle = "#555";
      sctx.beginPath();
      sctx.arc(px, py, NODE_SIZE * 0.35, 0, Math.PI * 2);
      sctx.fill();
    }

    const stem = iconStemForNode(n.node_type, n.special_incident_id, opts);
    if (stem) {
      const ic = imgReady(`icon:${stem}`) || imgReady("icon:10_incident");
      if (ic) sctx.drawImage(ic, tl.x, tl.y, iconW, iconH);
    }

    if (n.node_id === current) {
      const piece = imgReady("piece");
      if (piece) sctx.drawImage(piece, tl.x, tl.y, iconW, iconH);
      sctx.shadowBlur = 0;
      sctx.strokeStyle = "#fbbf24";
      sctx.lineWidth = 3;
      sctx.beginPath();
      sctx.arc(px, py, hitR * 0.85, 0, Math.PI * 2);
      sctx.stroke();
    }

    if (showIds.checked) {
      sctx.shadowBlur = 0;
      sctx.font = "bold 14px sans-serif";
      sctx.textAlign = "center";
      const ty = py + iconH * (1 - BASE_ANCHOR_Y) + 14;
      sctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
      sctx.lineWidth = 3;
      sctx.strokeText(String(n.node_id), px, ty);
      sctx.fillStyle = "#fff59a";
      sctx.fillText(String(n.node_id), px, ty);
    }

    sctx.shadowBlur = 0;
  }
  sctx.globalAlpha = 1;
}

/** 屏幕合成：静态层变换 + 路线/选中/悬停 */
function paint() {
  needsRedraw = false;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, cssW, cssH);

  if (staticDirty || computeStaticKey() !== staticKey) {
    rebuildStaticLayer();
  }

  // blit 静态世界
  if (staticCanvas.width > 0) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.drawImage(
      staticCanvas,
      0,
      0,
      mapW,
      mapH,
      ox,
      oy,
      mapW * scale,
      mapH * scale
    );
  }

  const nodes = state?.node_list || [];
  if (!nodes.length) {
    ctx.fillStyle = "#aaa";
    ctx.font = "15px sans-serif";
    ctx.fillText("暂无地图数据。请在游戏中进入沙盒地图。", 24, 40);
    setZoomLabels();
    return;
  }

  const byId = new Map(nodes.map((n) => [n.node_id, n]));
  const routing = Boolean(routePath && routePath.length > 1);
  const onRoute = new Set(routePath || []);

  // 路线折线（目标=蓝，扫路=绿）
  if (routing) {
    const isExplore = routeMode === "explore";
    ctx.save();
    ctx.strokeStyle = isExplore
      ? "rgba(52,211,153,0.95)"
      : "rgba(56,189,248,0.92)";
    ctx.lineWidth = Math.max(3, 10 * scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = isExplore
      ? "rgba(52,211,153,0.65)"
      : "rgba(56,189,248,0.65)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < routePath.length; i++) {
      const n = byId.get(routePath[i]);
      if (!n) continue;
      const s = worldToScreen(n.position_x, n.position_y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 动态高亮：目标 / 途经 / 选中 / 悬停
  const mark = (nid, color, width) => {
    const n = byId.get(nid);
    if (!n) return;
    const s = worldToScreen(n.position_x, n.position_y);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.arc(s.x, s.y, hitR * scale, 0, Math.PI * 2);
    ctx.stroke();
  };

  if (routeMode === "target" && routeGoal != null) {
    mark(routeGoal, "#fb7185", Math.max(2, 3 * scale));
  }
  if (routeMode === "target") {
    for (const v of routeVias) mark(v, "#a78bfa", Math.max(2, 2.5 * scale));
  }
  // 扫路：在负分格上标小绿点
  if (routeMode === "explore" && routePath) {
    const scOpts = getExploreOpts();
    for (const id of routePath) {
      const n = byId.get(id);
      if (!n) continue;
      const sc = scoreForType(n.node_type, scOpts);
      if (sc >= 0) continue;
      const s = worldToScreen(n.position_x, n.position_y);
      ctx.beginPath();
      ctx.fillStyle = "rgba(52,211,153,0.85)";
      ctx.arc(s.x, s.y, Math.max(3, 5 * scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (selectedId != null) mark(selectedId, "#ffd76a", Math.max(1.5, 2 * scale));
  if (hoverId != null && hoverId !== selectedId) {
    mark(hoverId, "rgba(255,255,255,0.55)", Math.max(1, 1.5 * scale));
  }

  // 路径上节点轻微提亮圈
  if (routing) {
    ctx.strokeStyle =
      routeMode === "explore"
        ? "rgba(52,211,153,0.45)"
        : "rgba(56,189,248,0.45)";
    ctx.lineWidth = Math.max(1, 1.5 * scale);
    for (const id of onRoute) {
      if (routeMode === "target" && (id === routeGoal || routeVias.includes(id))) {
        continue;
      }
      const n = byId.get(id);
      if (!n) continue;
      const s = worldToScreen(n.position_x, n.position_y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, hitR * 0.7 * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 毒圈：金色安全区（对齐游戏白/金圈）+ 中心标记
  const mc = getMiasmaCenter(state);
  if (mc) {
    const s = worldToScreen(mc.x, mc.y);
    ctx.save();

    // 大圈：半透明金色填充 + 亮金描边（参考游戏安全区观感）
    if (mc.radius != null && mc.radius > 0) {
      const rr = mc.radius * scale;
      const grad = ctx.createRadialGradient(s.x, s.y, rr * 0.55, s.x, s.y, rr);
      grad.addColorStop(0, "rgba(255, 214, 120, 0.05)");
      grad.addColorStop(0.72, "rgba(255, 196, 80, 0.10)");
      grad.addColorStop(0.92, "rgba(255, 210, 110, 0.22)");
      grad.addColorStop(1, "rgba(255, 230, 150, 0.08)");
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      // 外环金边
      ctx.strokeStyle = "rgba(255, 214, 120, 0.85)";
      ctx.lineWidth = Math.max(2, 2.5 * scale);
      ctx.setLineDash([]);
      ctx.stroke();
      // 内虚线提示可活动区
      ctx.strokeStyle = "rgba(255, 236, 180, 0.45)";
      ctx.lineWidth = Math.max(1, 1.2 * scale);
      ctx.setLineDash([6 * scale, 8 * scale]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr * 0.98, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 中心十字小点
    const r = Math.max(6, 10 * scale);
    ctx.strokeStyle = "rgba(255, 236, 180, 0.95)";
    ctx.fillStyle = "rgba(255, 214, 120, 0.45)";
    ctx.lineWidth = Math.max(1.5, 2 * scale);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - r * 1.6, s.y);
    ctx.lineTo(s.x + r * 1.6, s.y);
    ctx.moveTo(s.x, s.y - r * 1.6);
    ctx.lineTo(s.x, s.y + r * 1.6);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 236, 180, 0.95)";
    ctx.font = `${Math.max(10, 11 * scale)}px sans-serif`;
    ctx.textAlign = "left";
    const cd = mc.countdown != null ? ` 倒计时${mc.countdown}` : "";
    const radTxt = mc.radius != null ? ` r=${Math.round(mc.radius)}` : "";
    ctx.fillText(
      `安全区 Lv${mc.level ?? "?"}${cd}${radTxt}`,
      s.x + r + 4,
      s.y - 4
    );
    ctx.restore();
  }

  setZoomLabels();
}

function hitTest(sx, sy) {
  const nodes = state?.node_list || [];
  const w = screenToWorld(sx, sy);
  let best = null;
  let bestD = Infinity;
  const r2 = hitR * hitR;
  for (const n of nodes) {
    if (n.node_type === 0 && !showEmpty.checked) continue;
    const dx = w.x - n.position_x;
    const dy = w.y - n.position_y;
    const d = dx * dx + dy * dy;
    if (d <= r2 && d < bestD) {
      bestD = d;
      best = n.node_id;
    }
  }
  return best;
}

function showDetail(nid) {
  selectedId = nid;
  const n = (state?.node_list || []).find((x) => x.node_id === nid);
  const detailEl = $("detail");
  const debugEl = $("detail-debug");
  if (!n) {
    renderNodeDetail(detailEl, null);
    if (debugEl) debugEl.textContent = "—";
    scheduleDraw();
    return;
  }
  const view = buildNodeDetailView(n, state);
  renderNodeDetail(detailEl, view, { showDebug: false });
  if (debugEl) debugEl.textContent = view.debugText;
  scheduleDraw();
}

function fitView() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 10 || h < 10) return;
  const pad = 20;
  scale = Math.min((w - pad * 2) / mapW, (h - pad * 2) / mapH);
  ox = (w - mapW * scale) / 2;
  oy = (h - mapH * scale) / 2;
  scheduleDraw();
}

function centerOnCurrent() {
  const cur = state?.current_node_id;
  const n = (state?.node_list || []).find((x) => x.node_id === cur);
  if (!n) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ox = w / 2 - n.position_x * scale;
  oy = h / 2 - n.position_y * scale;
  scheduleDraw();
}

function zoomBy(factor, sx, sy) {
  const before = screenToWorld(sx, sy);
  scale = Math.min(3, Math.max(0.12, scale * factor));
  ox = sx - before.x * scale;
  oy = sy - before.y * scale;
  scheduleDraw();
}

function markStaticDirty() {
  staticDirty = true;
  scheduleDraw();
}

function buildLegend() {
  const box = $("legend-bar");
  box.innerHTML = "";

  const items = [
    {
      key: "current",
      label: "当前位置",
      src: assetUrl("assets/node_icon/piece_1.png"),
      filter: { kind: "current" },
    },
  ];
  for (const [type, meta] of Object.entries(NODE_TYPE_META)) {
    const displayType = Number(type);
    if (displayType === NODE_TYPE.EMPTY) continue;
    const src =
      displayType === NODE_TYPE.SPECIAL
        ? assetUrl("assets/node_icon/10_incident.png")
        : assetUrl(`assets/node_icon/${displayType}.png`);
    items.push({
      key: `type-${displayType}`,
      label: meta.name,
      src,
      filter: { kind: "type", displayType },
    });
  }

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "legend-item";
    btn.title = item.label;
    btn.setAttribute("aria-label", item.label);
    if (item.key === legendSelectedKey) btn.classList.add("is-active");
    const img = document.createElement("img");
    img.src = item.src;
    img.alt = item.label;
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      if (legendSelectedKey === item.key) {
        legendSelectedKey = null;
        highlightFilter = null;
      } else {
        legendSelectedKey = item.key;
        highlightFilter = item.filter;
      }
      buildLegend();
      markStaticDirty();
      $("status").textContent = highlightFilter
        ? `筛选：${item.label}`
        : "已取消筛选";
    });
    box.appendChild(btn);
  }
}

function recomputeRoute() {
  try {
    const start = state?.current_node_id;
    if (routeGoal == null) {
      routePath = null;
      updateRouteStats(null);
      scheduleDraw();
      return;
    }
    if (start == null) {
      routePath = null;
      updateRouteStats(null);
      $("route-hint").textContent =
        `已设目标 #${routeGoal}，但当前地图没有 current_node_id（请重新进图抓包）`;
      setRouteButtonsEnabled(true);
      scheduleDraw();
      return;
    }
    if (!state?.node_list?.length) {
      routePath = null;
      updateRouteStats(null);
      scheduleDraw();
      return;
    }
    const map = toRouteMap(state);
    const { path, error } = planRouteWithVias(
      map,
      Number(start),
      Number(routeGoal),
      routeVias,
      routePreset
    );
    if (!path) {
      routePath = null;
      $("route-hint").textContent = error || `无法规划 #${start} → #${routeGoal}`;
      updateRouteStats(null);
      setRouteButtonsEnabled(true);
      scheduleDraw();
      return;
    }
    routeMode = "target";
    routePath = path;
    const sum = summarizeRoute(map, path);
    updateRouteStats(sum);
    $("route-hint").textContent =
      `预设「${PRESET_LABEL[routePreset]}」· 目标 #${routeGoal}` +
      (routeVias.length ? ` · 途经 ${routeVias.map((v) => "#" + v).join(",")}` : "") +
      " · 右键改目标/加途经";
    setRouteButtonsEnabled(true);
    scheduleDraw();
  } catch (err) {
    console.error("[map] recomputeRoute failed", err);
    routePath = null;
    $("route-hint").textContent = `路径计算出错：${err?.message || err}`;
    $("status").textContent = `路径计算出错：${err?.message || err}`;
    scheduleDraw();
  }
}

function updateRouteStats(sum) {
  const el = $("route-stats");
  if (!sum) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <dt>步数</dt><dd class="is-accent">${sum.steps}</dd>
    <dt>惩罚分</dt><dd>${sum.primary ?? "—"}（越小越好）</dd>
    <dt>高价值格</dt><dd>${sum.reward}（战/事/箱，越多越好）</dd>
    <dt>空地</dt><dd>${sum.empty ?? "—"}</dd>
    <dt>危险格</dt><dd>${sum.avoid}（Boss/强敌）</dd>
    <dt>路径</dt><dd>${(routePath || []).join(" → ")}</dd>
  `;
}

function setRouteButtonsEnabled(on) {
  const a = $("btn-route-clear");
  const b = $("btn-explore-clear");
  if (a) a.disabled = !on;
  if (b) b.disabled = !on;
}

function clearRoute() {
  routeGoal = null;
  routeVias = [];
  routePath = null;
  routeMode = null;
  exploreScore = null;
  setRouteButtonsEnabled(false);
  $("route-hint").textContent =
    "左键查看；右键：第一个点=终点，之后=途经。路径为一条无回环折线。";
  const eh = $("explore-hint");
  if (eh) {
    eh.textContent =
      "从当前位置出发，不设终点；滑窗调点数后点「生成路径」。";
  }
  updateRouteStats(null);
  const es = $("explore-stats");
  if (es) {
    es.hidden = true;
    es.innerHTML = "";
  }
  scheduleDraw();
}

function getExploreOpts() {
  return {
    day: inferDay(state),
    weights: exploreWeights,
    miasmaCenter: getMiasmaCenter(state),
  };
}

function loadExploreWeights() {
  try {
    const saved = JSON.parse(localStorage.getItem(EXPLORE_WEIGHTS_STORAGE_KEY) || "{}");
    return Object.fromEntries(
      EXPLORE_SCORE_FIELDS.map(({ key }) => {
        const value = Number(saved[key]);
        return [key, Number.isFinite(value) ? value : EXPLORE_WEIGHTS[key]];
      })
    );
  } catch {
    return Object.fromEntries(
      EXPLORE_SCORE_FIELDS.map(({ key }) => [key, EXPLORE_WEIGHTS[key]])
    );
  }
}

function saveExploreWeights() {
  try {
    localStorage.setItem(EXPLORE_WEIGHTS_STORAGE_KEY, JSON.stringify(exploreWeights));
  } catch {
    // 页面仍可使用当前会话内的评分。
  }
}

function renderExploreScoreControls() {
  const root = $("explore-score-controls");
  if (!root) return;
  root.replaceChildren();
  for (const { key, label } of EXPLORE_SCORE_FIELDS) {
    const row = document.createElement("div");
    row.className = "explore-score-row";
    row.innerHTML = `
      <label for="explore-score-${key}">${label}</label>
      <input id="explore-score-${key}" type="range" min="-50" max="50" step="1" value="${exploreWeights[key]}" data-score-key="${key}" />
      <input type="number" min="-50" max="50" step="1" value="${exploreWeights[key]}" data-score-number="${key}" aria-label="${label}评分" />
    `;
    root.append(row);
  }

  const update = (key, rawValue) => {
    const value = Math.max(-50, Math.min(50, Number(rawValue)));
    if (!Number.isFinite(value)) return;
    exploreWeights[key] = value;
    const range = root.querySelector(`[data-score-key="${key}"]`);
    const number = root.querySelector(`[data-score-number="${key}"]`);
    if (range) range.value = String(value);
    if (number) number.value = String(value);
    saveExploreWeights();
    refreshExploreLegend();
  };
  root.addEventListener("input", (event) => {
    const key = event.target?.dataset?.scoreKey;
    if (key) update(key, event.target.value);
  });
  root.addEventListener("change", (event) => {
    const key = event.target?.dataset?.scoreNumber;
    if (key) update(key, event.target.value);
  });
}

function refreshExploreLegend() {
  const el = $("explore-score-legend");
  if (!el) return;
  const opts = getExploreOpts();
  const mc = opts.miasmaCenter;
  const miasmaNote = mc
    ? ` · 毒圈开：优先留在白圈内（惩罚 is_shrinking），不强制去圆心`
    : "";
  el.textContent = `计分：${describeExploreScores(opts)}${miasmaNote}`;
}

function updateExplorePointsLabel() {
  const sl = $("explore-points");
  const lab = $("explore-points-val");
  if (sl && lab) lab.textContent = String(sl.value);
}

function runExploreGenerate() {
  try {
    const start = state?.current_node_id;
    if (start == null || !state?.node_list?.length) {
      $("explore-hint").textContent =
        "没有当前位置：请先在游戏进图，让扩展抓到 content/index。";
      return;
    }
    const n = Number($("explore-points")?.value || 20);
    const opts = getExploreOpts();
    refreshExploreLegend();
    $("explore-hint").textContent =
      `正在枚举 ≤${n} 点最低分路径（第 ${opts.day} 天）…`;
    $("status").textContent = `收益扫路计算中（D${opts.day} · ≤${n} 点）…`;
    requestAnimationFrame(() => {
      const t0 = performance.now();
      const map = toRouteMap(state);
      // 计划粘性：当前位置还在旧路线开头时，旧路线剩余段作为候选，
      // 新方案好不过 REPLAN_STICKINESS 分就沿用，避免每走一步路线大变
      const previousPath =
        routeMode === "explore" &&
        Array.isArray(routePath) &&
        routePath[0] === Number(start)
          ? routePath
          : null;
      const result = findLowestScorePathSticky(map, Number(start), n, {
        ...opts,
        previousPath,
      });
      const ms = Math.round(performance.now() - t0);
      if (!result) {
        $("explore-hint").textContent =
          `未找到 ≤${n} 点的简单路径（图连通/点数不足）。`;
        $("status").textContent = "扫路失败";
        return;
      }
      routeMode = "explore";
      routeGoal = null;
      routeVias = [];
      routePath = result.path;
      exploreScore = result.score;
      setRouteButtonsEnabled(true);

      const keptNote = result.keptPrevious
        ? " · 沿用旧路线（未明显更好）"
        : " · 已换新路线";
      const maxN = result.maxPoints ?? n;
      const es = $("explore-stats");
      if (es) {
        es.hidden = false;
        es.innerHTML = `
          <dt>日程</dt><dd>第 ${result.day} 天</dd>
          <dt>点数</dt><dd class="is-accent">${result.numPoints} / ≤${maxN}</dd>
          <dt>累计分</dt><dd class="is-accent">${result.score.toFixed(1)}（越低越好）</dd>
          <dt>负分格</dt><dd>${result.rewardCount}</dd>
          <dt>正分格</dt><dd>${result.penaltyCount}</dd>
          <dt>回复计分</dt><dd>${result.weights?.HEAL ?? exploreWeights.HEAL}</dd>
          <dt>换路</dt><dd>${result.keptPrevious ? `沿用旧路（阈值 ${REPLAN_STICKINESS}）` : "采用新规划"}</dd>
          <dt>自由重算分</dt><dd>${Number(result.freshScore).toFixed(1)}</dd>
          <dt>耗时</dt><dd>${ms} ms · 展开 ${result.nodesVisited}</dd>
          <dt>路径</dt><dd>${result.path.join(" → ")}</dd>
        `;
      }
      const mc = getMiasmaCenter(state);
      const miasmaTag = mc ? " · 已偏好留白圈内" : "";
      $("explore-hint").textContent =
        `D${result.day} · ${result.numPoints}/≤${maxN} 点 · 分 ${result.score.toFixed(1)} · 负分格 ${result.rewardCount} · 绿线${miasmaTag}${keptNote}`;
      $("status").textContent =
        `扫路完成：D${result.day} · ${result.numPoints}/≤${maxN} · 分 ${result.score.toFixed(1)}${result.keptPrevious ? " · 沿用旧路线" : " · 新路线"}${miasmaTag}`;
      updateRouteStats(null);
      $("route-hint").textContent =
        "当前显示为「收益扫路」（绿线）。右键目标寻路会切换为蓝线。";
      scheduleDraw();
    });
  } catch (err) {
    console.error("[map] explore generate failed", err);
    $("explore-hint").textContent = `扫路出错：${err?.message || err}`;
    $("status").textContent = `扫路出错：${err?.message || err}`;
  }
}

function onRouteRightClick(nid) {
  if (nid == null) return;
  try {
    routeMode = "target";
    exploreScore = null;
    const es = $("explore-stats");
    if (es) {
      es.hidden = true;
      es.innerHTML = "";
    }
    const clickedNode = state?.node_list?.find(
      (node) => Number(node.node_id) === Number(nid)
    );
    const clickedBoss = Number(clickedNode?.node_type) === NODE_TYPE.BOSS;
    if (clickedBoss || routeGoal == null || routeGoal === nid) {
      // 右键 Boss 时始终把它设为最终目标，不会加入途经点。
      routeGoal = nid;
      routeVias = routeVias.filter((v) => v !== nid);
    } else if (
      !routeVias.includes(nid) &&
      nid !== state?.current_node_id &&
      nid !== routeGoal
    ) {
      routeVias.push(nid);
    }
    recomputeRoute();
    showDetail(nid);
  } catch (err) {
    console.error("[map] onRouteRightClick failed", err);
    $("status").textContent = `右键处理失败：${err?.message || err}`;
  }
}

/**
 * 走一步后自动裁剪扫路已走部分：当前位置在绿线中段时，
 * 把已走的前缀截掉，路线其余部分保持不变（视觉稳定，不重新规划）。
 *
 * 注意：≤N 预算下重算仍有地平线效应（走一步再开 ≤N 窗口 ≈ 总行程变长）。
 * 因此默认：移动只裁剪；用户点「生成路径」才重算（带粘性）。
 */
function trimExploreRouteToCurrent() {
  if (routeMode !== "explore" || !Array.isArray(routePath) || routePath.length < 2) {
    return;
  }
  const cur = state?.current_node_id != null ? Number(state.current_node_id) : null;
  if (cur == null) return;
  const idx = routePath.indexOf(cur);
  if (idx === 0) return; // 还没动
  const eh = $("explore-hint");
  if (idx < 0) {
    if (eh) eh.textContent = "已偏离扫路路线；点「生成路径」重新规划。";
    return;
  }
  routePath = routePath.slice(idx);
  if (routePath.length < 2) {
    routePath = null;
    routeMode = null;
    exploreScore = null;
    setRouteButtonsEnabled(false);
    if (eh) eh.textContent = "扫路已走完，可重新「生成路径」。";
    return;
  }
  if (eh) {
    eh.textContent =
      `沿扫路前进：剩余 ${routePath.length - 1} 步（${routePath.join(" → ")}）；` +
      "点「生成路径」按当前位置重算（差距不足阈值则沿用旧路线）。";
  }
}

/**
 * 目标寻路：若仍在蓝线路径上，只裁剪已走前缀，保持剩余折线稳定。
 * 偏离路径 / 终点不一致时返回 false，由调用方全量 recompute。
 * @returns {boolean} 是否已成功裁剪（无需重算）
 */
function trimTargetRouteToCurrent() {
  if (routeMode !== "target" || routeGoal == null) return false;
  if (!Array.isArray(routePath) || routePath.length < 2) return false;
  const cur = state?.current_node_id != null ? Number(state.current_node_id) : null;
  if (cur == null) return false;

  const goal = Number(routeGoal);
  if (cur === goal) {
    routePath = [cur];
    routeVias = [];
    updateRouteStats(null);
    $("route-hint").textContent = `已到达目标 #${goal}。右键可设新目标。`;
    return true;
  }

  const idx = routePath.indexOf(cur);
  if (idx < 0) return false;
  if (Number(routePath[routePath.length - 1]) !== goal) return false;

  routePath = routePath.slice(idx);
  // 途经点若已走过则丢掉
  if (routeVias.length) {
    const remain = new Set(routePath);
    routeVias = routeVias.filter((v) => remain.has(Number(v)) && Number(v) !== cur);
  }
  const map = toRouteMap(state);
  updateRouteStats(summarizeRoute(map, routePath));
  $("route-hint").textContent =
    `沿路线前进 · 预设「${PRESET_LABEL[routePreset]}」· 目标 #${goal}` +
    (routeVias.length ? ` · 途经 ${routeVias.map((v) => "#" + v).join(",")}` : "") +
    " · 剩余 " +
    (routePath.length - 1) +
    " 步";
  return true;
}

function updateProgressUI(sum) {
  const line = sum?.progressLine || "第 — 天 · 第 — 回合";
  const pl = $("progress-line");
  if (pl) pl.textContent = line;
  const sch = $("progress-schedule");
  if (sch) sch.textContent = line;
  const pt = $("progress-point");
  if (pt) {
    pt.textContent =
      sum?.dungeonPoint != null && sum.dungeonPoint !== ""
        ? String(sum.dungeonPoint)
        : "—";
  }
  const mi = $("progress-miasma");
  if (mi) mi.textContent = sum?.miasmaText || "—";
}

function updateMapFooter(sum = summarize(state)) {
  if (sum.nodes) {
    $("status").textContent =
      `${sum.progressLine} · 更新 ${sum.updatedAt ? new Date(sum.updatedAt).toLocaleTimeString() : "—"} · ` +
      `Boss=${sum.boss ?? "无"}`;
  } else {
    $("status").textContent = "等待 content/index 捕获…";
  }
}

function updateGuidebookFooter(summary = guidebookView.getSummary()) {
  $("status").textContent = summary.catalogueTotal
    ? `导本 · 当前 ${summary.heldKinds} 种 / ${summary.heldTotal} 本 · 累计收录 ${summary.catalogueTotal} 种`
    : "导本 · 尚未捕获数据";
}

function switchWindowView(view) {
  activeWindowView = view;
  document.querySelectorAll("[data-window-view]").forEach((button) => {
    const active = button.dataset.windowView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("main").hidden = view !== "map";
  $("guidebook-view").hidden = view !== "guidebooks";
  $("map-toolbar-controls").hidden = view !== "map";

  if (view === "map") {
    updateMapFooter();
    document.title = `${summarize(state).name || "地图"} — ${summarize(state).progressLine}`;
    requestAnimationFrame(() => {
      resizeCanvas();
      scheduleDraw();
    });
  } else {
    updateGuidebookFooter();
    document.title = "导本记录 — 转世沙盒";
  }
}

function applyState(s) {
  state = s;
  ensureAssets();
  markStaticDirty();
  const sum = summarize(state);
  updateProgressUI(sum);
  refreshExploreLegend();
  if (sum.nodes) {
    $("badge").textContent = `${sum.nodes} 节点 · #${sum.current ?? "?"}`;
    $("badge").className = "badge ok";
    $("title").textContent = sum.name || "转世沙盒地图";
    if (activeWindowView === "map") {
      document.title = `${sum.name || "地图"} — ${sum.progressLine}`;
    }
  } else {
    $("badge").textContent = "无数据";
    $("badge").className = "badge";
  }
  if (activeWindowView === "map") updateMapFooter(sum);
  buildLegend();

  // 移动后优先裁剪已有路线（保持「下一步」稳定）；只有偏离/无路线才全量重算。
  // 收益预设下全量重算会因访问后 type→0 与词典序收益重排而改道——那是状态变化，不是算错。
  if (routeMode === "explore") {
    trimExploreRouteToCurrent();
    scheduleDraw();
  } else if (routeMode === "target" && routeGoal != null) {
    if (!trimTargetRouteToCurrent()) {
      recomputeRoute();
    } else {
      scheduleDraw();
    }
  } else {
    scheduleDraw();
  }
}

// —— 交互：仅左键拖拽/点选；右键设路线（避免 capture 吞掉右键）——
/** @type {number|null} */
let activePointerId = null;
/** 防止 pointerup(button=2) 与 contextmenu 双触发 */
let rightClickHandledAt = 0;

function endPointerDrag(e) {
  if (activePointerId != null && e && e.pointerId !== activePointerId) {
    return false;
  }
  const wasDragging = dragging;
  const wasMoved = dragMoved;
  dragging = false;
  dragMoved = false;
  canvas.classList.remove("dragging");
  if (activePointerId != null) {
    try {
      canvas.releasePointerCapture(activePointerId);
    } catch (_) {}
    activePointerId = null;
  }
  return wasDragging && !wasMoved;
}

canvas.addEventListener("pointerdown", (e) => {
  // 只响应主按钮；中键/右键绝不 setPointerCapture
  if (e.button !== 0) return;
  activePointerId = e.pointerId;
  dragging = true;
  dragMoved = false;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("dragging");
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch (_) {}
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging && activePointerId === e.pointerId) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
    ox += dx;
    oy += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    scheduleDraw();
    return;
  }

  // 未拖拽时做 hover（不强制每帧，仅 id 变化时重绘）
  if (dragging) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const id = hitTest(sx, sy);
  if (id !== hoverId) {
    hoverId = id;
    if (id != null && state?.node_list) {
      const n = state.node_list.find((x) => x.node_id === id);
      if (n) {
        const meta = NODE_TYPE_META[n.node_type];
        $("status").textContent =
          `#${id} ${meta?.name || typeName(n.node_type)}  邻接=${JSON.stringify(n.adjacent_node_ids)}`;
      }
      canvas.style.cursor = "pointer";
    } else {
      canvas.style.cursor = "grab";
    }
    scheduleDraw();
  }
});

canvas.addEventListener("pointerup", (e) => {
  // 右键：设路线目标/途经（部分环境 contextmenu 不可靠）
  if (e.button === 2) {
    endPointerDrag(e);
    const rect = canvas.getBoundingClientRect();
    const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (id != null) {
      rightClickHandledAt = Date.now();
      onRouteRightClick(id);
    }
    return;
  }

  if (e.button !== 0) {
    endPointerDrag(e);
    return;
  }

  const isClick = endPointerDrag(e);
  if (isClick) {
    const rect = canvas.getBoundingClientRect();
    const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (id != null) showDetail(id);
  }
});

canvas.addEventListener("pointercancel", (e) => {
  endPointerDrag(e);
});

canvas.addEventListener("lostpointercapture", () => {
  dragging = false;
  dragMoved = false;
  activePointerId = null;
  canvas.classList.remove("dragging");
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  e.stopPropagation();
  // 若 pointerup 已处理过，跳过（50ms 内）
  if (Date.now() - rightClickHandledAt < 80) return;
  const rect = canvas.getBoundingClientRect();
  const id = hitTest(e.clientX - rect.left, e.clientY - rect.top);
  if (id != null) onRouteRightClick(id);
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left, e.clientY - rect.top);
  },
  { passive: false }
);

canvas.addEventListener("dblclick", () => fitView());

$("btn-fit").addEventListener("click", fitView);
$("btn-100").addEventListener("click", () => {
  scale = 1;
  ox = 20;
  oy = 20;
  scheduleDraw();
});
$("btn-center").addEventListener("click", centerOnCurrent);
$("btn-zoom-in").addEventListener("click", () => {
  zoomBy(1.15, canvas.clientWidth / 2, canvas.clientHeight / 2);
});
$("btn-zoom-out").addEventListener("click", () => {
  zoomBy(1 / 1.15, canvas.clientWidth / 2, canvas.clientHeight / 2);
});

showEmpty.addEventListener("change", markStaticDirty);
showIds.addEventListener("change", markStaticDirty);
showLegend.addEventListener("change", () => {
  $("legend-dock").style.display = showLegend.checked ? "" : "none";
});

// 底图亮度滑杆
const bgBrightSlider = $("bg-bright");
const bgBrightVal = $("bg-bright-val");
function syncBgBrightUI() {
  if (bgBrightSlider) bgBrightSlider.value = String(bgBrightness);
  if (bgBrightVal) bgBrightVal.textContent = `${bgBrightness}%`;
}
if (bgBrightSlider) {
  syncBgBrightUI();
  bgBrightSlider.addEventListener("input", () => {
    bgBrightness = Number(bgBrightSlider.value) || 100;
    localStorage.setItem("map_bg_brightness", String(bgBrightness));
    syncBgBrightUI();
    markStaticDirty();
  });
}
$("btn-legend-collapse").addEventListener("click", () => {
  $("legend-dock").classList.toggle("is-collapsed");
});

document.querySelectorAll(".btn-preset").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".btn-preset").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    routePreset = btn.dataset.preset || "short";
    if (routeGoal != null) recomputeRoute();
  });
});
$("btn-route-clear").addEventListener("click", clearRoute);

// 收益扫路
const exploreSlider = $("explore-points");
if (exploreSlider) {
  exploreSlider.addEventListener("input", updateExplorePointsLabel);
  updateExplorePointsLabel();
}
renderExploreScoreControls();
$("btn-explore-gen")?.addEventListener("click", runExploreGenerate);
$("btn-explore-clear")?.addEventListener("click", clearRoute);
refreshExploreLegend();

document.querySelectorAll("[data-window-view]").forEach((button) => {
  button.addEventListener("click", () => switchWindowView(button.dataset.windowView));
});

window.addEventListener("resize", () => {
  if (activeWindowView === "map") resizeCanvas();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === MSG.STATE_UPDATED) applyState(msg.state);
  if (msg?.type === MSG.GUIDEBOOKS_UPDATED) guidebookView.render(msg.state);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.arcarum3MapState) {
    applyState(changes.arcarum3MapState.newValue || null);
  }
  if (changes.arcarum3Guidebooks) {
    guidebookView.render(changes.arcarum3Guidebooks.newValue || null);
  }
});

async function init() {
  resizeCanvas();
  const [mapResponse, guidebookResponse] = await Promise.all([
    chrome.runtime.sendMessage({ type: MSG.GET_STATE }),
    chrome.runtime.sendMessage({ type: MSG.GET_GUIDEBOOKS }),
  ]);
  applyState(mapResponse?.state || null);
  guidebookView.render(guidebookResponse?.state || null);
  switchWindowView("map");
  setTimeout(() => fitView(), 80);
}

init();
