import assert from "node:assert/strict";

const storage = {};
const messageListeners = [];
const downloads = [];

globalThis.fetch = async (url) => {
  assert.match(
    url,
    /^chrome-extension:\/\/test\/data\/(guidebooks(?:\.zh-CN)?|events(?:\.zh-CN)?)\.json$/,
  );
  return {
    ok: true,
    async json() {
      if (url.endsWith("/events.json")) {
        return {
          schemaVersion: 1,
          updatedAt: null,
          entries: {
            "100101": {
              selectionId: 100101,
              nodeType: 5,
              eventKind: "normal",
              notes: { "zh-CN": "" },
              options: {},
            },
          },
        };
      }
      if (url.endsWith("/events.zh-CN.json")) {
        return {
          schemaVersion: 1,
          updatedAt: null,
          entries: {
            "100101": {
              selectionId: 100101,
              notes: { "zh-CN": "收益高，注意生命消耗。" },
              options: {},
            },
          },
        };
      }
      return {
        schemaVersion: 1,
        updatedAt: "2026-07-29T00:00:00.000Z",
        entries: {
          "400": {
            statusId: 400,
            text: { "zh-CN": "基础中文", ja: "基礎日本語", en: "" },
            sources: ["seed"],
          },
        },
        unresolved: [],
      };
    },
  };
};

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(listener) { messageListeners.push(listener); } },
    sendMessage: async () => ({ ok: true }),
    getURL: (path) => `chrome-extension://test/${path}`,
  },
  sidePanel: { setPanelBehavior: async () => {} },
  storage: {
    local: {
      async get(key) {
        if (typeof key === "string") return { [key]: storage[key] };
        return { ...storage };
      },
      async set(values) { Object.assign(storage, values); },
      async remove(key) { delete storage[key]; },
    },
  },
  downloads: {
    async download(options) {
      downloads.push(options);
      return downloads.length;
    },
  },
  windows: {
    async get() { return null; },
    async update() { return null; },
    async create() { return { id: 1 }; },
    onRemoved: { addListener() {} },
  },
};

await import("./background.js");

function dispatch(message) {
  return new Promise((resolve) => {
    messageListeners[0](message, {}, resolve);
  });
}

const initial = await dispatch({ type: "GET_GUIDEBOOKS" });
assert.equal(initial.state.catalogue[400].text["zh-CN"], "基础中文");
assert.equal(
  initial.state.incidentCatalogue[100101].notes["zh-CN"],
  "收益高，注意生命消耗。",
);

await dispatch({
  type: "API_CAPTURED",
  payload: {
    url: "https://game.granbluefantasy.jp/rest/arcarum3/dungeon/spacebook_status_list",
    method: "GET",
    status: 200,
    gameLanguage: "en",
    body: JSON.stringify({
      status_list: [
        { status_id: 401, name: "New English book", rarity: 2, num: 1 },
      ],
    }),
  },
});

await new Promise((resolve) => setTimeout(resolve, 350));
assert.equal(downloads.length, 0, "新增导本不能触发自动下载");
const captured = await dispatch({ type: "GET_GUIDEBOOKS" });
assert.equal(captured.state.catalogue[400].text["zh-CN"], "基础中文");
assert.equal(captured.state.catalogue[401].text.en, "New English book");

await dispatch({
  type: "API_CAPTURED",
  payload: {
    url: "https://game.granbluefantasy.jp/rest/arcarum3/dungeon/spacebook_status_list",
    method: "GET",
    status: 200,
    gameLanguage: "en",
    body: JSON.stringify({
      status_list: [
        { status_id: 401, name: "New English book", rarity: 2, num: 2 },
      ],
    }),
  },
});

await new Promise((resolve) => setTimeout(resolve, 350));
assert.equal(downloads.length, 0, "持有数量变化也不能触发自动下载");

console.log("guidebook manual-only export tests passed");
