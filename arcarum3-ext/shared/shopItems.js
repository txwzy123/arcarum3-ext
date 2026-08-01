import { normalizeGuidebookText } from "./guidebooks.js";

const SHOP_ITEM_TRANSLATIONS = Object.freeze({
  "ルボルライト": {
    name: "卢博尔石",
    comment: "从内部满溢出陌生红色光辉的稀有矿块。",
  },
  "ウェポン・スクロール": {
    name: "武器卷轴",
    comment: "进入法则相异的世界飞沫时，用于解放被封印武器的卷轴。",
  },
  "サモン・スクロール": {
    name: "召唤石卷轴",
    comment: "进入法则相异的世界飞沫时，用于解放被封印召唤石的卷轴。",
  },
  "フェロー・スクロール": {
    name: "同伴卷轴",
    comment: "用于召唤世界飞沫外同伴的卷轴。",
  },
  "導本効果削除": {
    name: "删除导本效果",
    comment: "选择并移除 1 个导本效果。",
  },
});

export function normalizeShopItemText(value) {
  return normalizeGuidebookText(value).replace(/<br\s*\/?>/gi, "\n").trim();
}

export function getShopItemTranslation(item) {
  const rawName = normalizeShopItemText(item?.rawName);
  const rawComment = normalizeShopItemText(item?.rawComment);
  const translated = SHOP_ITEM_TRANSLATIONS[rawName];
  return {
    name: translated?.name || rawName || `商店商品 #${item?.lineupId ?? "?"}`,
    comment: translated?.comment || rawComment,
    rawName,
    rawComment,
    translated: Boolean(translated),
  };
}

