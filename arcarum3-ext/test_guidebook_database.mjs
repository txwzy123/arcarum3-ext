import assert from "node:assert/strict";

import {
  detectGuidebookLanguage,
  mergeGuidebookDatabases,
  normalizeGuidebookDatabase,
  normalizeGuidebookLanguage,
  serializeGuidebookDatabase,
} from "./shared/guidebookDatabase.js";
import { getGuidebookDisplayName } from "./shared/guidebookTranslations.js";

assert.equal(normalizeGuidebookLanguage("zh_CN"), "zh-CN");
assert.equal(normalizeGuidebookLanguage("ja-JP"), "ja");
assert.equal(normalizeGuidebookLanguage("en-US"), "en");
assert.equal(normalizeGuidebookLanguage("fr"), "und");

assert.equal(detectGuidebookLanguage("攻撃力が上昇"), "ja");
assert.equal(detectGuidebookLanguage("Boost to attack"), "en");
assert.equal(detectGuidebookLanguage("攻击力上升"), "und");
assert.equal(detectGuidebookLanguage("攻击力上升", "zh-CN"), "zh-CN");

const normalized = normalizeGuidebookDatabase({
  schemaVersion: 1,
  updatedAt: "2026-07-29T00:00:00.000Z",
  entries: {
    "10": {
      statusId: 10,
      text: { "zh-CN": " 中文@@翻译 ", ja: "日本語原文" },
      observedTexts: [
        { language: "ja", text: "日本語@@原文" },
        { language: "ja", text: "日本語@@原文" },
      ],
      rarity: 2,
      sources: ["node_event", "node_event"],
      firstSeenAt: 20,
      lastSeenAt: 30,
    },
  },
  unresolved: [
    { text: " Unknown@@candidate ", language: "en", sources: ["incident"] },
  ],
});
assert.equal(normalized.entries[10].text["zh-CN"], "中文翻译");
assert.equal(normalized.entries[10].text.en, "");
assert.deepEqual(normalized.entries[10].sources, ["node_event"]);
assert.deepEqual(normalized.entries[10].observedTexts, [
  { language: "ja", text: "日本語原文" },
]);
assert.equal(normalized.unresolved[0].text, "Unknowncandidate");

const cleanedLegacyCapture = normalizeGuidebookDatabase({
  schemaVersion: 1,
  entries: {
    21: {
      statusId: 21,
      text: { "zh-CN": "攻刃", ja: "攻刃" },
      observedTexts: [
        { language: "ja", text: "攻刃" },
        { language: "ja", text: "アビリティ与ダメージUP(30%)" },
      ],
      rarity: 2,
      iconCategory: 1,
      iconType: 312,
    },
    28: {
      statusId: 28,
      text: { "zh-CN": "奥义槽上升量提升(20%)", ja: "奥義ゲージ上昇量UP(20%)" },
      observedTexts: [
        { language: "ja", text: "奥義ゲージ上昇量UP(20%)" },
        { language: "ja", text: "アビD上限" },
      ],
      rarity: 2,
      iconCategory: 3,
      iconType: 315,
    },
    249: {
      statusId: 249,
      text: { "zh-CN": "攻刃", ja: "攻刃" },
      observedTexts: [{ language: "ja", text: "攻刃" }],
      rarity: null,
      iconCategory: null,
      iconType: null,
    },
  },
  unresolved: [],
});
assert.equal(cleanedLegacyCapture.entries[249], undefined);
assert.equal(cleanedLegacyCapture.entries[21].text["zh-CN"], "");
assert.equal(
  cleanedLegacyCapture.entries[21].text.ja,
  "アビリティ与ダメージUP(30%)",
);
assert.deepEqual(cleanedLegacyCapture.entries[21].observedTexts, [
  { language: "ja", text: "アビリティ与ダメージUP(30%)" },
]);
assert.deepEqual(cleanedLegacyCapture.entries[28].observedTexts, [
  { language: "ja", text: "奥義ゲージ上昇量UP(20%)" },
]);

assert.throws(
  () => normalizeGuidebookDatabase({ schemaVersion: 2, entries: {} }),
  /schemaVersion 2/,
);

const merged = mergeGuidebookDatabases([
  {
    schemaVersion: 1,
    updatedAt: "2026-07-28T00:00:00.000Z",
    entries: {
      "10": {
        statusId: 10,
        text: { "zh-CN": "中文", ja: "", en: "" },
        sources: ["seed"],
        firstSeenAt: 20,
        lastSeenAt: 25,
      },
    },
  },
  {
    schemaVersion: 1,
    updatedAt: "2026-07-29T00:00:00.000Z",
    entries: {
      "10": {
        statusId: 10,
        text: { "zh-CN": "", ja: "日本語", en: "" },
        sources: ["capture"],
        firstSeenAt: 10,
        lastSeenAt: 30,
      },
    },
  },
]);
assert.equal(merged.database.entries[10].text["zh-CN"], "中文");
assert.equal(merged.database.entries[10].text.ja, "日本語");
assert.deepEqual(merged.database.entries[10].sources, ["seed", "capture"]);
assert.equal(merged.database.entries[10].firstSeenAt, 10);
assert.equal(merged.database.entries[10].lastSeenAt, 30);
assert.equal(merged.database.updatedAt, "2026-07-29T00:00:00.000Z");
assert.deepEqual(merged.conflicts, []);

const conflict = mergeGuidebookDatabases([
  {
    schemaVersion: 1,
    entries: { "10": { statusId: 10, text: { "zh-CN": "甲" } } },
  },
  {
    schemaVersion: 1,
    entries: { "10": { statusId: 10, text: { "zh-CN": "乙" } } },
  },
]);
assert.deepEqual(conflict.conflicts, [
  { statusId: 10, field: "text.zh-CN", kept: "甲", incoming: "乙" },
]);
assert.equal(conflict.database.entries[10].text["zh-CN"], "甲");

const resolvedAcrossFiles = mergeGuidebookDatabases([
  {
    schemaVersion: 1,
    entries: {},
    unresolved: [
      {
        language: "en",
        text: "Later identified",
        sources: ["player-a"],
        firstSeenAt: 5,
        lastSeenAt: 8,
      },
    ],
  },
  {
    schemaVersion: 1,
    entries: {
      "30": {
        statusId: 30,
        text: { "zh-CN": "", ja: "", en: "" },
        observedTexts: [{ language: "en", text: "Later identified" }],
        sources: ["player-b"],
        firstSeenAt: 10,
        lastSeenAt: 12,
      },
    },
    unresolved: [],
  },
]);
assert.equal(resolvedAcrossFiles.database.unresolved.length, 0);
assert.equal(resolvedAcrossFiles.database.entries[30].text.en, "Later identified");
assert.deepEqual(resolvedAcrossFiles.database.entries[30].sources, [
  "player-b",
  "player-a",
]);
assert.equal(resolvedAcrossFiles.database.entries[30].firstSeenAt, 5);

const serialized = serializeGuidebookDatabase({
  updatedAt: Date.parse("2026-07-29T01:02:03.000Z"),
  catalogue: {
    "20": {
      statusId: 20,
      text: { "zh-CN": "译文", ja: "原文", en: "" },
      observedTexts: [{ language: "ja", text: "原文" }],
      rarity: 3,
      iconCategory: 4,
      iconType: 5,
      sources: ["book_page"],
      firstSeenAt: 1,
      lastSeenAt: 2,
    },
  },
  unresolved: [],
});
assert.equal(serialized.schemaVersion, 1);
assert.equal(serialized.updatedAt, "2026-07-29T01:02:03.000Z");
assert.equal(serialized.entries[20].text["zh-CN"], "译文");
assert.equal(Object.hasOwn(serialized.entries[20], "num"), false);

assert.equal(
  getGuidebookDisplayName({
    statusId: 1,
    rawName: "English",
    text: { "zh-CN": "中文", ja: "", en: "English" },
  }),
  "中文",
);
assert.equal(
  getGuidebookDisplayName({
    statusId: 1,
    rawName: "English",
    text: { "zh-CN": "", ja: "日本語", en: "English" },
  }),
  "English",
);
assert.equal(
  getGuidebookDisplayName({
    statusId: 1,
    rawName: "",
    text: { "zh-CN": "", ja: "日本語", en: "English" },
  }),
  "日本語",
);

console.log("guidebook database tests passed");
