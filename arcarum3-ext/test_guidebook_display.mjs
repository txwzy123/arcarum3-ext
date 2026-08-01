import assert from "node:assert/strict";

import {
  getGuidebookMetaText,
  getGuidebookSearchText,
  shouldShowGuidebookRawText,
} from "./map/guidebookView.js";
import { getShopItemTranslation, normalizeShopItemText } from "./shared/shopItems.js";

const translated = {
  statusId: 86,
  rarity: 3,
  firstSeenAt: 1785333189355,
  rawName: "この導本効果を入手して以降に与ダメージUP",
  text: {
    "zh-CN": "获得此导本后提升全体造成伤害",
    ja: "この導本効果を入手して以降に与ダメージUP",
    en: "",
  },
};

assert.equal(getGuidebookMetaText(translated), "独有");
assert.equal(
  getGuidebookMetaText(translated, { liveIndex: 0 }),
  "候选 1 · 独有",
);
assert.equal(
  shouldShowGuidebookRawText(translated, translated.text["zh-CN"]),
  false,
);
assert.match(getGuidebookSearchText(translated), /获得此导本后提升全体造成伤害/);
assert.match(getGuidebookSearchText(translated), /86/);

const untranslated = {
  statusId: 102,
  rarity: 2,
  firstSeenAt: 1785333189355,
  rawName: "日本語の原文",
  text: { "zh-CN": "", ja: "日本語の原文", en: "" },
};

assert.match(getGuidebookMetaText(untranslated), /^#102 · 稀有 · 收录 /);
assert.equal(
  getGuidebookMetaText(untranslated, { liveIndex: 1 }),
  "候选 2 · #102 · 稀有",
);
assert.equal(
  shouldShowGuidebookRawText(untranslated, "Fallback display"),
  true,
);

const rubolite = getShopItemTranslation({
  lineupId: 8,
  rawName: "ルボルライト",
  rawComment: "内側から溢れんばかりの<br>見慣れぬ赤い輝きを放つ希少な一塊。",
});
assert.equal(rubolite.name, "卢博尔石");
assert.equal(rubolite.comment, "从内部满溢出陌生红色光辉的稀有矿块。");
assert.equal(
  normalizeShopItemText(rubolite.rawComment),
  "内側から溢れんばかりの\n見慣れぬ赤い輝きを放つ希少な一塊。",
);

const deleteEffect = getShopItemTranslation({
  lineupId: 9,
  rawName: "導本効果削除",
  rawComment: "導本効果を1つ選んで消失させる。",
});
assert.equal(deleteEffect.name, "删除导本效果");
assert.equal(deleteEffect.comment, "选择并移除 1 个导本效果。");

console.log("guidebook display tests passed");
