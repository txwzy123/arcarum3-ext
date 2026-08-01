import {
  MSG,
  STORAGE_KEY,
  GUIDEBOOK_STORAGE_KEY,
  CAPTURE_PATHS,
  PROFILE_CAPTURE_PATHS,
  GUIDEBOOK_CAPTURE_PATHS,
} from "./shared/constants.js";
import {
  clearGuidebookSelection,
  mergeIncidentDatabases,
  mergeGuidebookDatabaseIntoState,
  mergeIncidentDatabaseIntoState,
  updateGuidebookState,
} from "./shared/guidebooks.js";
import {
  mergeGuidebookDatabases,
  normalizeGuidebookDatabase,
} from "./shared/guidebookDatabase.js";
import { extractDungeon, mergeDungeonState } from "./shared/map-model.js";

/** @type {number|null} */
let mapWindowId = null;
let guidebookUpdateQueue = Promise.resolve();
let guidebookSeedPromise = null;
let incidentSeedPromise = null;

// Open side panel on action click
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // async
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case MSG.API_CAPTURED:
      return onApiCaptured(message.payload);
    case MSG.GET_STATE:
      return { ok: true, state: await getState() };
    case MSG.GET_GUIDEBOOKS:
      return { ok: true, state: await getGuidebooks() };
    case MSG.CLEAR_GUIDEBOOK_SELECTION:
      return clearActiveGuidebookSelection();
    case MSG.OPEN_MAP_WINDOW:
      return openMapWindow(message.options || {});
    case MSG.FOCUS_MAP_WINDOW:
      return focusMapWindow();
    case MSG.CLEAR_STATE:
      await chrome.storage.local.remove(STORAGE_KEY);
      broadcastState(null);
      return { ok: true };
    default:
      return { ok: false, error: "unknown message" };
  }
}

function matchCapture(url, patterns) {
  try {
    const path = new URL(url).pathname;
    return patterns.some((re) => re.test(path));
  } catch {
    return false;
  }
}

function classify(url) {
  const path = new URL(url).pathname;
  if (/\/socket\/query/i.test(path)) return "player_profile";
  if (/\/arcarum3\/book(?:\/|$)/i.test(path)) return "guidebook_page";
  if (/spacebook_status_list/i.test(path)) return "guidebook_list";
  if (/spacebook_status_add/i.test(path)) return "guidebook_add";
  if (/spacebook_status_remove/i.test(path)) return "guidebook_remove";
  if (/dungeon_shop_lineup/i.test(path)) return "guidebook_shop";
  if (/purchase_dungeon_shop_item/i.test(path)) return "guidebook_purchase";
  if (/\/result(?:multi)?\/content\/index/i.test(path)) return "battle_result";
  if (/content\/index/i.test(path)) return "map_index";
  if (/move_node/i.test(path)) return "move_node";
  if (/finish_node_event|proceed_node_event/i.test(path)) return "node_event";
  if (/start_dungeon/i.test(path)) return "start_dungeon";
  return "other";
}

async function onApiCaptured({
  url,
  body,
  requestBody,
  method,
  status,
  gameLanguage,
}) {
  const isMapCapture = url && matchCapture(url, CAPTURE_PATHS);
  const isProfileCapture = url && matchCapture(url, PROFILE_CAPTURE_PATHS);
  const isGuidebookCapture = url && matchCapture(url, GUIDEBOOK_CAPTURE_PATHS);
  if (!url || (!isMapCapture && !isGuidebookCapture && !isProfileCapture)) {
    return { ok: true, ignored: true };
  }

  let json = body;
  if (typeof body === "string") {
    try {
      json = JSON.parse(body);
    } catch {
      return { ok: true, ignored: true, reason: "not-json" };
    }
  }

  const kind = classify(url);
  const playerName = extractPlayerName(json, url);
  if (playerName) await persistPlayerName(playerName);
  if (isProfileCapture && !isMapCapture && !isGuidebookCapture) {
    return { ok: true, kind, playerName };
  }
  const guidebookUpdate = await persistGuidebookCapture(json, {
    url,
    requestBody,
    language: gameLanguage,
    playerName,
  });

  if (!isMapCapture) {
    return {
      ok: true,
      kind,
      guidebooks: Object.keys(guidebookUpdate.state.catalogue).length,
      inventory: Object.keys(guidebookUpdate.state.inventory).length,
    };
  }

  const dungeon = extractDungeon(json);
  const prev = await getState();

  // Always keep last raw capture for debug
  const captureMeta = {
    url,
    method: method || "GET",
    status: status ?? 200,
    kind,
    at: Date.now(),
  };

  let state = prev;
  if (dungeon) {
    state = mergeDungeonState(prev, dungeon, { url, kind });
  } else if (json && typeof json === "object") {
    // Try shallow merge of current_node_id from various shapes
    const cid =
      json.current_node_id ??
      json.option?.dungeon?.current_node_id ??
      json.data?.option?.dungeon?.current_node_id;
    if (cid != null && prev?.node_list?.length) {
      state = {
        ...prev,
        current_node_id: Number(cid),
        updatedAt: Date.now(),
        lastUrl: url,
        lastKind: kind,
      };
    }
  }

  if (!state) {
    // store capture only
    state = {
      node_list: [],
      lastCapture: captureMeta,
      updatedAt: Date.now(),
      lastUrl: url,
      lastKind: kind,
      rawNote: dungeon ? null : "no dungeon node_list in this response",
    };
  } else {
    state = { ...state, lastCapture: captureMeta };
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  broadcastState(state);
  return {
    ok: true,
    kind,
    nodes: state.node_list?.length || 0,
    current: state.current_node_id,
  };
}

function extractPlayerName(json, url) {
  const candidates = [
    json?.nickname,
    json?.data?.nickname,
    json?.option?.nickname,
    json?.data?.option?.nickname,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  try {
    const nickname = new URL(url).searchParams.get("nickname");
    return nickname?.trim() || "";
  } catch {
    return "";
  }
}

async function persistPlayerName(playerName) {
  const name = String(playerName || "").trim();
  if (!name) return;
  const previous = await getState();
  if (!previous || previous.playerName !== name) {
    const state = { ...(previous || {}), playerName: name, updatedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    broadcastState(state);
  }
  const previousGuidebooks = await getGuidebooks();
  if (previousGuidebooks.playerName !== name) {
    const state = { ...previousGuidebooks, playerName: name };
    await chrome.storage.local.set({ [GUIDEBOOK_STORAGE_KEY]: state });
    broadcastGuidebooks(state);
  }
}

async function getState() {
  const bag = await chrome.storage.local.get(STORAGE_KEY);
  return bag[STORAGE_KEY] || null;
}

async function getGuidebooks() {
  const bag = await chrome.storage.local.get(GUIDEBOOK_STORAGE_KEY);
  const previous = bag[GUIDEBOOK_STORAGE_KEY] || null;
  const [guidebookSeed, incidentSeed] = await Promise.all([
    getBundledGuidebookDatabase(),
    getBundledIncidentDatabase(),
  ]);
  const guidebookMerged = mergeGuidebookDatabaseIntoState(previous, guidebookSeed);
  const incidentMerged = mergeIncidentDatabaseIntoState(
    guidebookMerged.state,
    incidentSeed,
  );
  if (guidebookMerged.changed || incidentMerged.changed) {
    await chrome.storage.local.set({ [GUIDEBOOK_STORAGE_KEY]: incidentMerged.state });
  }
  if (guidebookMerged.conflicts.length) {
    console.warn("[gbf-map] guidebook seed conflicts", guidebookMerged.conflicts);
  }
  return incidentMerged.state;
}

function getBundledGuidebookDatabase() {
  if (!guidebookSeedPromise) {
    const load = (path) => fetch(chrome.runtime.getURL(path))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(normalizeGuidebookDatabase)
      .catch((error) => {
        console.warn(`[gbf-map] failed to load ${path}`, error);
        return normalizeGuidebookDatabase({
          schemaVersion: 1,
          updatedAt: null,
          entries: {},
          unresolved: [],
        });
      });
    guidebookSeedPromise = Promise.all([
      load("data/guidebooks.json"),
      load("data/guidebooks.zh-CN.json"),
    ]).then((databases) => {
      const merged = mergeGuidebookDatabases(databases);
      if (merged.conflicts.length) {
        console.warn("[gbf-map] guidebook locale seed conflicts", merged.conflicts);
      }
      return merged.database;
    });
  }
  return guidebookSeedPromise;
}

function getBundledIncidentDatabase() {
  if (!incidentSeedPromise) {
    const load = (path) => fetch(chrome.runtime.getURL(path))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        console.warn(`[gbf-map] failed to load ${path}`, error);
        return { schemaVersion: 1, updatedAt: null, entries: {} };
      });
    incidentSeedPromise = Promise.all([
      load("data/events.json"),
      load("data/events.zh-CN.json"),
    ]).then(mergeIncidentDatabases);
  }
  return incidentSeedPromise;
}

async function persistGuidebookCapture(response, options) {
  let result = null;
  guidebookUpdateQueue = guidebookUpdateQueue
    .catch(() => {})
    .then(async () => {
      const previous = await getGuidebooks();
      result = updateGuidebookState(previous, response, options);
      if (result.changed) {
        await chrome.storage.local.set({
          [GUIDEBOOK_STORAGE_KEY]: result.state,
        });
        broadcastGuidebooks(result.state);
      }
    });
  await guidebookUpdateQueue;
  return result;
}

async function clearActiveGuidebookSelection() {
  let result = null;
  guidebookUpdateQueue = guidebookUpdateQueue
    .catch(() => {})
    .then(async () => {
      const previous = await getGuidebooks();
      result = clearGuidebookSelection(previous);
      if (result.changed) {
        await chrome.storage.local.set({
          [GUIDEBOOK_STORAGE_KEY]: result.state,
        });
        broadcastGuidebooks(result.state);
      }
    });
  await guidebookUpdateQueue;
  return { ok: true, changed: result.changed, state: result.state };
}

function broadcastState(state) {
  chrome.runtime.sendMessage({ type: MSG.STATE_UPDATED, state }).catch(() => {});
}

function broadcastGuidebooks(state) {
  chrome.runtime
    .sendMessage({ type: MSG.GUIDEBOOKS_UPDATED, state })
    .catch(() => {});
}

async function openMapWindow(options = {}) {
  const width = options.width || 1400;
  const height = options.height || 900;
  const url = chrome.runtime.getURL("map/map.html");

  if (mapWindowId != null) {
    try {
      const win = await chrome.windows.get(mapWindowId);
      if (win) {
        await chrome.windows.update(mapWindowId, { focused: true });
        // reload so it picks latest? optional — storage listener handles updates
        return { ok: true, windowId: mapWindowId, reused: true };
      }
    } catch {
      mapWindowId = null;
    }
  }

  const win = await chrome.windows.create({
    url,
    type: "popup",
    width,
    height,
    focused: true,
  });
  mapWindowId = win.id ?? null;
  return { ok: true, windowId: mapWindowId, reused: false };
}

async function focusMapWindow() {
  if (mapWindowId == null) return openMapWindow();
  try {
    await chrome.windows.update(mapWindowId, { focused: true });
    return { ok: true, windowId: mapWindowId };
  } catch {
    mapWindowId = null;
    return openMapWindow();
  }
}

chrome.windows.onRemoved.addListener((id) => {
  if (id === mapWindowId) mapWindowId = null;
});
