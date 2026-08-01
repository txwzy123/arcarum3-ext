import { MSG } from "../shared/constants.js";
import { NODE_TYPE_META } from "../shared/nodeTypes.js";
import { summarize } from "../shared/map-model.js";

const $ = (id) => document.getElementById(id);

async function getState() {
  const res = await chrome.runtime.sendMessage({ type: MSG.GET_STATE });
  return res?.state || null;
}

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function renderMap(state) {
  const sum = summarize(state);
  const status = $("status");

  if (!state || !sum.nodes) {
    status.className = "status idle";
    status.textContent = state?.lastCapture
      ? `已捕获接口但无 node_list：${state.lastCapture.kind || ""}`
      : "等待游戏页加载地图接口…";
    $("header-status").textContent = "等待地图数据";
    $("m-name").textContent = "—";
    $("m-progress").textContent = sum?.progressLine || "—";
    $("m-point").textContent = "—";
    $("m-miasma").textContent = sum?.miasmaText || "—";
    $("m-nodes").textContent = "—";
    $("m-current").textContent = "—";
    $("m-boss").textContent = "尚未出现";
    $("m-kind").textContent = state?.lastKind || "—";
    $("m-time").textContent = fmtTime(state?.updatedAt);
    $("types").textContent = "—";
    return;
  }

  status.className = "status ok";
  status.textContent = `已就绪 · ${sum.progressLine} · ${sum.nodes} 节点 · #${sum.current ?? "?"}`;
  $("header-status").textContent = `${sum.progressLine} · #${sum.current ?? "?"}`;
  $("m-name").textContent = sum.name || "—";
  $("m-progress").textContent = sum.progressLine || "—";
  $("m-point").textContent =
    sum.dungeonPoint != null ? String(sum.dungeonPoint) : "—";
  $("m-miasma").textContent = sum.miasmaText || "—";
  $("m-nodes").textContent = String(sum.nodes);
  $("m-current").textContent = sum.current != null ? `#${sum.current}` : "—";
  $("m-boss").textContent =
    sum.boss != null ? `#${sum.boss}（type=1）` : "尚未出现（首包正常）";
  $("m-kind").textContent = state.lastKind || "—";
  $("m-time").textContent = fmtTime(sum.updatedAt);

  const lines = Object.keys(sum.types)
    .map(Number)
    .sort((a, b) => a - b)
    .map((type) => {
      const name = NODE_TYPE_META[type]?.name || "?";
      return `${String(type).padStart(2)}  ${name.padEnd(10)} ×${sum.types[type]}`;
    });
  $("types").textContent = lines.join("\n") || "—";
}

async function refresh() {
  renderMap(await getState());
}

$("btn-open").addEventListener("click", async () => {
  const res = await chrome.runtime.sendMessage({
    type: MSG.OPEN_MAP_WINDOW,
    options: { width: 1480, height: 920 },
  });
  if (!res?.ok) {
    $("status").className = "status warn";
    $("status").textContent = `打开失败：${res?.error || "unknown"}`;
  }
});

$("btn-focus").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: MSG.FOCUS_MAP_WINDOW });
});

$("btn-refresh").addEventListener("click", refresh);

$("btn-clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: MSG.CLEAR_STATE });
  renderMap(await getState());
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.STATE_UPDATED) renderMap(message.state);
});

refresh();
