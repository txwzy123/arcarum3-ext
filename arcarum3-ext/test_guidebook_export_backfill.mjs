import assert from "node:assert/strict";

const installedListeners = [];
const startupListeners = [];
const downloads = [];
const storage = {
  arcarum3Guidebooks: {
    version: 3,
    catalogue: {
      "86": {
        statusId: 86,
        rawName: "この導本効果を入手して以降に与ダメージUP",
        rawNames: ["この導本効果を入手して以降に与ダメージUP"],
        text: {
          "zh-CN": "",
          ja: "この導本効果を入手して以降に与ダメージUP",
          en: "",
        },
        observedTexts: [
          {
            language: "ja",
            text: "この導本効果を入手して以降に与ダメージUP",
          },
        ],
        sources: ["node_event"],
      },
    },
    inventory: {},
    shopLineup: {},
    unresolved: [],
    activeSelection: null,
    updatedAt: 1785334317361,
    lastCapture: null,
  },
};

globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return { schemaVersion: 1, updatedAt: null, entries: {}, unresolved: [] };
  },
});

globalThis.chrome = {
  runtime: {
    onInstalled: {
      addListener(listener) {
        installedListeners.push(listener);
      },
    },
    onStartup: {
      addListener(listener) {
        startupListeners.push(listener);
      },
    },
    onMessage: { addListener() {} },
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
      async set(values) {
        Object.assign(storage, values);
      },
      async remove(key) {
        delete storage[key];
      },
    },
  },
  downloads: {
    async download(options) {
      downloads.push(options);
      return downloads.length;
    },
  },
  windows: {
    async get() {
      return null;
    },
    async update() {
      return null;
    },
    async create() {
      return { id: 1 };
    },
    onRemoved: { addListener() {} },
  },
};

await import("./background.js");

assert.equal(installedListeners.length, 1);
assert.equal(startupListeners.length, 0);

installedListeners[0]({ reason: "update" });
await new Promise((resolve) => setTimeout(resolve, 50));

assert.equal(downloads.length, 0, "扩展重新加载时不能自动导出数据库");

console.log("guidebook export backfill disabled tests passed");
