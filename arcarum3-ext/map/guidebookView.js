import {
  listGuidebooks,
  normalizeGuidebookText,
  serializeIncidentDatabase,
} from "../shared/guidebooks.js";
import { getGuidebookDisplayName } from "../shared/guidebookTranslations.js";
import { serializeGuidebookDatabase } from "../shared/guidebookDatabase.js";
import { MSG } from "../shared/constants.js";
import { resolvePlayerText } from "../shared/playerText.js";
import { getShopItemTranslation, normalizeShopItemText } from "../shared/shopItems.js";

const BOOK_TAB_BASE =
  "https://prd-game-a-granbluefantasy.akamaized.net/assets/img/sp/arcarum3/book/tab";
const RARITY_LABELS = { 1: "普通", 2: "稀有", 3: "独有", 99: "诅咒" };
const RARITY_ORDER = { 3: 0, 2: 1, 1: 2, 99: 3 };

function fmtTime(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString();
}

function rarityLabel(entry) {
  return RARITY_LABELS[entry?.rarity] || `稀有度 ${entry?.rarity ?? "?"}`;
}

function hasChineseText(entry) {
  return Boolean(normalizeGuidebookText(entry?.text?.["zh-CN"]));
}

function rawText(entry) {
  return (
    normalizeGuidebookText(entry?.rawName) ||
    normalizeGuidebookText(entry?.text?.ja) ||
    normalizeGuidebookText(entry?.text?.en)
  );
}

export function getGuidebookMetaText(entry, { liveIndex = null } = {}) {
  const translated = hasChineseText(entry);
  const parts = [];
  if (liveIndex != null) parts.push(`候选 ${liveIndex + 1}`);
  if (!translated) parts.push(`#${entry.statusId}`);
  parts.push(rarityLabel(entry));
  if (!translated && liveIndex == null) {
    parts.push(`收录 ${fmtTime(entry.firstSeenAt)}`);
  }
  return parts.join(" · ");
}

export function shouldShowGuidebookRawText(entry, displayName) {
  if (hasChineseText(entry)) return false;
  const original = rawText(entry);
  return Boolean(original && original !== displayName);
}

export function getGuidebookSearchText(entry) {
  return [
    entry?.statusId,
    getGuidebookDisplayName(entry),
    normalizeGuidebookText(entry?.text?.["zh-CN"]),
    normalizeGuidebookText(entry?.text?.ja),
    normalizeGuidebookText(entry?.text?.en),
    ...(entry?.rawNames || []),
    rawText(entry),
    ...(entry?.observedTexts || []).map((item) => item.text),
  ]
    .filter((value) => value != null && value !== "")
    .join(" ")
    .toLocaleLowerCase();
}

function appendText(parent, className, text) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function plainScenarioText(value) {
  const template = document.createElement("template");
  template.innerHTML = typeof value === "string" ? value : "";
  template.content.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  return template.content.textContent?.trim() || "";
}

export function createGuidebookView({ onRender } = {}) {
  const $ = (id) => document.getElementById(id);
  let state = null;
  let view = "inventory";
  let searchQuery = "";
  let summary = {
    heldKinds: 0,
    heldTotal: 0,
    catalogueTotal: 0,
    updatedAt: null,
    source: null,
  };
  const activeRarities = new Set();
  let clearInFlight = false;

  function updateRarityImages() {
    document.querySelectorAll(".rarity-filter").forEach((button) => {
      const type = button.dataset.type;
      const active = activeRarities.has(Number(button.dataset.rarity));
      button.setAttribute("aria-pressed", String(active));
      button.querySelector("img").src =
        `${BOOK_TAB_BASE}/btn_${type}_${active ? "on" : "off"}.png`;
    });
  }

  function renderItem(entry, { showInventory = true, liveIndex = null } = {}) {
    const item = document.createElement("article");
    item.className = "guidebook-item";
    item.dataset.rarity = String(entry.rarity ?? "");

    const displayName = getGuidebookDisplayName(entry);
    const normalizedRaw = rawText(entry);
    appendText(item, "guidebook-name", displayName);
    appendText(item, "guidebook-meta", getGuidebookMetaText(entry, { liveIndex }));

    if (shouldShowGuidebookRawText(entry, displayName)) {
      appendText(item, "guidebook-raw", `原文：${normalizedRaw}`);
    } else if (!hasChineseText(entry) && (entry.rawNames?.length || 0) > 1) {
      appendText(item, "guidebook-raw", `原文版本：${entry.rawNames.length}`);
    }

    if (showInventory) {
      const count = appendText(
        item,
        `guidebook-count${entry.num > 0 ? "" : " is-empty"}`,
        entry.num > 0 ? `x${entry.num}` : "未持有",
      );
      count.setAttribute(
        "aria-label",
        entry.num > 0 ? `持有 ${entry.num}` : "当前未持有",
      );
    }
    return item;
  }

  function selectionRule(selection) {
    const min = selection?.selectNumMin;
    const max = selection?.selectNumMax;
    if (min == null && max == null) return "请选择导本";
    if (min === max) return `需选择 ${min} 项`;
    if (min == null) return `最多选择 ${max} 项`;
    if (max == null) return `至少选择 ${min} 项`;
    return `可选择 ${min} 至 ${max} 项`;
  }

  function liveEntries() {
    const selection = state?.activeSelection;
    return (selection?.candidates || []).map((candidate) => {
      const catalogueEntry = state?.catalogue?.[String(candidate.statusId)] || {};
      return {
        ...catalogueEntry,
        ...candidate,
        text: catalogueEntry.text || {},
        rawNames: catalogueEntry.rawNames || (candidate.rawName ? [candidate.rawName] : []),
      };
    });
  }

  function renderIncidentOption(option, index) {
    const item = document.createElement("article");
    item.className = `guidebook-item event-choice-item${option.disabled ? " is-disabled" : ""}`;
    item.dataset.choiceId = String(option.choiceId ?? "");
    const title = resolvePlayerText(option.title, state?.playerName);
    appendText(item, "guidebook-name", plainScenarioText(title) || `选项 ${index + 1}`);
    const meta = [`选项 ${index + 1}`];
    if (option.choiceId != null) meta.push(`#${option.choiceId}`);
    if (option.turn != null) meta.push(`${option.turn} 回合`);
    if (option.disabled) meta.push("不可选");
    appendText(item, "guidebook-meta", meta.join(" · "));
    const text = plainScenarioText(resolvePlayerText(option.text, state?.playerName));
    if (text) appendText(item, "guidebook-raw", text);
    return item;
  }

  function shopGuidebookEntry(item) {
    const catalogueEntry = state?.catalogue?.[String(item.statusId)] || {};
    return {
      ...catalogueEntry,
      statusId: item.statusId,
      rawName: catalogueEntry.rawName || item.rawName,
      rawNames: catalogueEntry.rawNames || (item.rawName ? [item.rawName] : []),
      text: catalogueEntry.text || {},
      rarity: catalogueEntry.rarity ?? item.rarity,
      iconCategory: catalogueEntry.iconCategory ?? item.iconCategory,
      iconType: catalogueEntry.iconType ?? item.iconType,
    };
  }

  function shopStockText(item) {
    if (item.stockNum === 0 || !item.canPurchase) return "已售罄";
    if (item.stockNum == null) return "可购买";
    return `库存 ${item.stockNum}`;
  }

  function renderShopItem(item, index) {
    if (item.statusId != null) {
      const entry = shopGuidebookEntry(item);
      const article = renderItem(entry, { showInventory: false, liveIndex: index });
      article.classList.add("shop-item");
      article.dataset.lineupId = String(item.lineupId ?? "");
      appendText(
        article,
        "shop-item-price",
        [`${item.price ?? "?"} 塞菲拉币`, shopStockText(item), `lineup ${item.lineupId ?? "?"}`].join(" · "),
      );
      return article;
    }

    const translated = getShopItemTranslation(item);
    const article = document.createElement("article");
    article.className = `guidebook-item shop-item${item.canPurchase ? "" : " is-sold-out"}`;
    article.dataset.lineupId = String(item.lineupId ?? "");
    appendText(article, "guidebook-name", translated.name);
    appendText(
      article,
      "guidebook-meta",
      [`商品 ${index + 1}`, `${item.price ?? "?"} 塞菲拉币`, shopStockText(item)].join(" · "),
    );
    if (translated.comment) appendText(article, "guidebook-raw", translated.comment);
    if (
      translated.translated &&
      ((translated.rawName && translated.rawName !== translated.name) ||
        (translated.rawComment && translated.rawComment !== translated.comment))
    ) {
      appendText(
        article,
        "shop-item-original",
        [translated.rawName, normalizeShopItemText(translated.rawComment)]
          .filter(Boolean)
          .join("\n"),
      );
    }
    return article;
  }

  function currentLiveMode() {
    const candidates = [
      {
        type: "selection",
        value: state?.activeSelection,
        capturedAt: state?.activeSelection?.capturedAt || 0,
      },
      {
        type: "incident",
        value: state?.activeIncident,
        capturedAt: state?.activeIncident?.capturedAt || 0,
      },
      {
        type: "shop",
        value: state?.activeShop,
        capturedAt: state?.activeShop?.capturedAt || 0,
      },
    ].filter((candidate) => candidate.value);
    return candidates.sort((a, b) => b.capturedAt - a.capturedAt)[0] || null;
  }

  function activeIncidentEntry(incident) {
    if (!incident) return null;
    if (incident.specialIncidentId != null) {
      return state?.incidentCatalogue?.[`special:${incident.specialIncidentId}`] || null;
    }
    let selectionId = incident.selectionId;
    if (selectionId == null) {
      const choiceId = (incident.options || [])
        .map((option) => Number(option.choiceId))
        .find((id) => Number.isFinite(id) && id >= 10000);
      if (choiceId != null) selectionId = Math.trunc(choiceId / 100);
    }
    return state?.incidentCatalogue?.[String(selectionId)] || null;
  }

  function localizedIncidentOption(option, catalogueEntry) {
    const translated = catalogueEntry?.options?.[String(option.choiceId)];
    return {
      ...option,
      title: translated?.title?.["zh-CN"] || option.title,
      text: translated?.text?.["zh-CN"] || option.text,
    };
  }

  function renderLiveSelection() {
    const selection = state?.activeSelection;
    const incident = state?.activeIncident;
    const shop = state?.activeShop;
    const liveMode = currentLiveMode();
    const entries = liveEntries();
    const incidentEntry = activeIncidentEntry(incident);
    const incidentOptions = (incident?.options || []).map((option) =>
      localizedIncidentOption(option, incidentEntry));
    const isIncident = liveMode?.type === "incident";
    const isShop = liveMode?.type === "shop";
    const count = isShop
      ? shop.items.length
      : isIncident
        ? incidentOptions.length
        : entries.length;
    $("book-live-title").textContent = isShop
      ? "商店货物"
      : isIncident
        ? "事件选项"
        : "本次导本选择";
    $("book-live-count").textContent = `${count} 项`;
    $("book-live-summary").textContent = isShop
      ? shop.tabId === 1
        ? "导本商品与导本效果删除"
        : "道具商品"
      : isIncident
        ? "请选择一个事件选项"
        : selection
          ? selectionRule(selection)
          : "暂无进行中的选择";
    const incidentDescription =
      incidentEntry?.description?.["zh-CN"] || incident?.description || "";
    $("book-live-description").textContent = isIncident
      ? plainScenarioText(resolvePlayerText(incidentDescription, state?.playerName))
      : "";
    $("book-live-description").hidden = !isIncident || !incidentDescription;
    $("book-live-captured").textContent = isShop
      ? `捕获于 ${fmtTime(shop.capturedAt)}`
      : isIncident
        ? `捕获于 ${fmtTime(incident.capturedAt)}`
        : liveMode?.type === "selection"
          ? `捕获于 ${fmtTime(selection.capturedAt)}`
          : "等待下一次选择";
    $("btn-clear-book-selection").disabled = clearInFlight || !(selection || incident || shop);
    $("guidebook-live-list").replaceChildren(
      ...(isShop
        ? shop.items.map(renderShopItem)
        : isIncident
          ? incidentOptions.map(renderIncidentOption)
          : entries.map((entry, index) => renderItem(entry, { showInventory: false, liveIndex: index }))),
    );
    const incidentNotes = incidentEntry?.notes?.["zh-CN"]?.trim() || "";
    $("book-live-notes-text").textContent = resolvePlayerText(incidentNotes, state?.playerName);
    $("book-live-notes").hidden = !isIncident || !incidentNotes;
    $("guidebook-live-empty").hidden = count > 0;
    if (!count) {
      $("guidebook-live-empty").textContent = "游戏内出现导本、事件或商店界面后，当前内容会显示在这里。";
    }
  }

  function render(nextState = state) {
    state = nextState;
    const all = listGuidebooks(state);
    const held = all.filter((entry) => entry.num > 0);
    const heldTotal = held.reduce((total, entry) => total + entry.num, 0);
    summary = {
      heldKinds: held.length,
      heldTotal,
      catalogueTotal: all.length,
      updatedAt: state?.updatedAt || null,
      source: state?.lastCapture?.source || null,
    };

    $("book-held-kinds").textContent = String(summary.heldKinds);
    $("book-held-total").textContent = String(summary.heldTotal);
    $("book-catalog-total").textContent = String(summary.catalogueTotal);
    $("guidebook-tab-count").textContent = String(summary.heldKinds);
    $("guidebook-tab-count").hidden = summary.heldKinds === 0;
    $("btn-export-books").disabled = all.length === 0;
    $("book-last-update").textContent = summary.updatedAt
      ? `最近收录 ${fmtTime(summary.updatedAt)} · ${summary.source || "arcarum3"}`
      : "尚未捕获导本数据";

    renderLiveSelection();

    const query = searchQuery.trim().toLocaleLowerCase();
    const filtered = (view === "inventory" ? held : all)
      .filter(
        (entry) =>
          activeRarities.size === 0 || activeRarities.has(entry.rarity),
      )
      .filter((entry) => {
        if (!query) return true;
        return getGuidebookSearchText(entry).includes(query);
      })
      .sort(
        (a, b) =>
          (RARITY_ORDER[a.rarity] ?? 9) -
            (RARITY_ORDER[b.rarity] ?? 9) || a.statusId - b.statusId,
      );

    $("guidebook-list").replaceChildren(...filtered.map(renderItem));
    const empty = $("guidebook-empty");
    empty.hidden = filtered.length > 0;
    if (!filtered.length) {
      empty.textContent = all.length
        ? "当前筛选条件下没有导本。"
        : "进入导本列表、事件选择或商店后，这里会自动出现原文记录。";
    }
    onRender?.(summary);
  }

  function switchView(nextView) {
    view = nextView;
    document.querySelectorAll("[data-book-view]").forEach((button) => {
      const active = button.dataset.bookView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    render();
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportGuidebooks() {
    if (!state) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadJson(
      serializeGuidebookDatabase(state),
      `gbf-guidebooks-${timestamp}.json`,
    );
    downloadJson(
      serializeIncidentDatabase(state),
      `gbf-events-${timestamp}.json`,
    );
  }

  async function clearSelection() {
    if (clearInFlight || !(state?.activeSelection || state?.activeIncident || state?.activeShop)) return;
    clearInFlight = true;
    renderLiveSelection();
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.CLEAR_GUIDEBOOK_SELECTION,
      });
      if (!response?.ok) throw new Error(response?.error || "清除失败");
      render(response.state || state);
    } catch (error) {
      console.error("[gbf-map] failed to clear guidebook selection", error);
    } finally {
      clearInFlight = false;
      renderLiveSelection();
    }
  }

  document.querySelectorAll("[data-book-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.bookView));
  });
  document.querySelectorAll(".rarity-filter").forEach((button) => {
    button.addEventListener("click", () => {
      const rarity = Number(button.dataset.rarity);
      if (activeRarities.has(rarity)) activeRarities.delete(rarity);
      else activeRarities.add(rarity);
      updateRarityImages();
      render();
    });
  });
  $("book-search").addEventListener("input", (event) => {
    searchQuery = event.target.value;
    render();
  });
  $("btn-export-books").addEventListener("click", exportGuidebooks);
  $("btn-clear-book-selection").addEventListener("click", clearSelection);

  updateRarityImages();
  render(null);

  return {
    getSummary: () => summary,
    render,
  };
}
