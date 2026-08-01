import {
  detectGuidebookLanguage,
  mergeGuidebookDatabases,
  normalizeGuidebookDatabaseText,
  normalizeGuidebookLanguage,
  serializeGuidebookDatabase,
  shouldDiscardLegacyGuidebookEntry,
  shouldDiscardLegacyGuidebookText,
} from "./guidebookDatabase.js";
import { normalizePlayerText, normalizePlayerTextTree } from "./playerText.js";

export const GUIDEBOOK_STATE_VERSION = 6;
export const INCIDENT_DATABASE_VERSION = 1;

const SPECIAL_INCIDENT_SELECTION_KEYS = {
  105007: "special:9",
  105012: "special:14",
  105015: "special:17",
  105016: "special:16",
};

const BOOK_ACTION_GAIN = 400;
const BOOK_ACTION_SELECT = 401;
const BOOK_ACTION_REMOVE = 402;

export function createGuidebookState() {
  return {
    version: GUIDEBOOK_STATE_VERSION,
    catalogue: {},
    inventory: {},
    shopLineup: {},
    incidentCatalogue: {},
    unresolved: [],
    activeSelection: null,
    activeIncident: null,
    activeShop: null,
    currentSpecialIncidentId: null,
    playerName: "",
    updatedAt: null,
    lastCapture: null,
  };
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toStatusId(value) {
  const id = toNumber(value);
  return id != null && id > 0 ? id : null;
}

function cloneState(previous) {
  const base = createGuidebookState();
  if (!previous || typeof previous !== "object") return base;
  const catalogue = {};
  for (const [key, entry] of Object.entries(previous.catalogue || {})) {
    const statusId = toStatusId(entry?.statusId ?? key);
    if (shouldDiscardLegacyGuidebookEntry(statusId, entry)) continue;
    const rawNames = [...new Set([
      ...(entry?.rawNames || []),
      ...(entry?.rawName ? [entry.rawName] : []),
    ].filter((value) => {
      if (typeof value !== "string" || !value) return false;
      return !shouldDiscardLegacyGuidebookText(statusId, value);
    }))];
    const text = {
      "zh-CN": normalizeGuidebookText(entry?.text?.["zh-CN"]),
      ja: normalizeGuidebookText(entry?.text?.ja),
      en: normalizeGuidebookText(entry?.text?.en),
    };
    for (const language of ["zh-CN", "ja", "en"]) {
      if (shouldDiscardLegacyGuidebookText(statusId, text[language])) {
        text[language] = "";
      }
    }
    const observedTexts = [];
    const observedKeys = new Set();
    for (const item of [
      ...(entry?.observedTexts || []),
      ...rawNames.map((rawName) => ({ text: rawName })),
    ]) {
      const observedText = normalizeGuidebookText(item?.text ?? item);
      if (!observedText || shouldDiscardLegacyGuidebookText(statusId, observedText)) {
        continue;
      }
      const language = detectGuidebookLanguage(observedText, item?.language);
      const observedKey = `${language}\u0000${observedText}`;
      if (observedKeys.has(observedKey)) continue;
      observedKeys.add(observedKey);
      observedTexts.push({ language, text: observedText });
      if (language !== "und" && !text[language]) text[language] = observedText;
    }
    const rawName = shouldDiscardLegacyGuidebookText(statusId, entry?.rawName)
      ? rawNames.at(-1) || ""
      : entry?.rawName || "";
    catalogue[key] = { ...entry, rawName, rawNames, text, observedTexts };
  }
  return {
    ...base,
    ...previous,
    version: GUIDEBOOK_STATE_VERSION,
    catalogue,
    inventory: { ...(previous.inventory || {}) },
    shopLineup: { ...(previous.shopLineup || {}) },
    incidentCatalogue: cloneIncidentCatalogue(previous.incidentCatalogue),
    unresolved: (previous.unresolved || []).map((entry) => ({
      ...entry,
      text: normalizeGuidebookText(entry?.text ?? entry?.rawName ?? entry?.name),
      language: detectGuidebookLanguage(entry?.text ?? entry?.rawName ?? entry?.name, entry?.language),
      sources: [...new Set(entry?.sources || [])],
    })).filter((entry) => entry.text),
    activeSelection: cloneActiveSelection(previous.activeSelection),
    activeIncident: cloneActiveIncident(previous.activeIncident),
    activeShop: cloneActiveShop(previous.activeShop),
    currentSpecialIncidentId: toNumber(previous.currentSpecialIncidentId),
    playerName: typeof previous.playerName === "string" ? previous.playerName : "",
  };
}

function cloneIncidentCatalogue(catalogue) {
  if (!catalogue || typeof catalogue !== "object" || Array.isArray(catalogue)) return {};
  return normalizePlayerTextTree(structuredClone(catalogue));
}

function cloneActiveSelection(selection) {
  if (!selection || typeof selection !== "object") return null;
  const candidates = (Array.isArray(selection.candidates)
    ? selection.candidates
    : [])
    .map((candidate) => statusRecord({
      ...candidate,
      status_id: candidate?.statusId ?? candidate?.status_id,
      name: candidate?.rawName ?? candidate?.name,
    }))
    .filter(Boolean)
    .map(selectionCandidate);
  if (!candidates.length) return null;
  return {
    scenarioType: toNumber(selection.scenarioType ?? selection.scenario_type),
    candidateNum: toNumber(selection.candidateNum ?? selection.candidate_num),
    selectNumMin: toNumber(selection.selectNumMin ?? selection.select_num_min),
    selectNumMax: toNumber(selection.selectNumMax ?? selection.select_num_max),
    candidates,
    capturedAt: toNumber(selection.capturedAt) ?? null,
    source: typeof selection.source === "string" ? selection.source : "arcarum3",
  };
}

function cloneActiveIncident(incident) {
  if (!incident || typeof incident !== "object") return null;
  const options = (Array.isArray(incident.options) ? incident.options : [])
    .map((option) => ({
      choiceId: toNumber(option?.choiceId ?? option?.choice_id),
      title: normalizePlayerText(typeof option?.title === "string" ? option.title : ""),
      text: normalizePlayerText(typeof option?.text === "string" ? option.text : ""),
      turn: toNumber(option?.turn),
      disabled: Boolean(option?.disabled ?? option?.is_disabled),
      questCheck: Boolean(option?.questCheck ?? option?.is_quest_check),
    }))
    .filter((option) => option.choiceId != null || option.title || option.text);
  if (!options.length) return null;
  return {
    selectionId: toNumber(incident.selectionId ?? incident.selection_id),
    specialIncidentId: toNumber(incident.specialIncidentId ?? incident.special_incident_id),
    nodeType: toNumber(incident.nodeType ?? incident.node_type),
    eventKind: typeof incident.eventKind === "string" ? incident.eventKind : "",
    description: normalizePlayerText(typeof incident.description === "string" ? incident.description : ""),
    image: typeof incident.image === "string" ? incident.image : "",
    options,
    capturedAt: toNumber(incident.capturedAt) ?? null,
    source: typeof incident.source === "string" ? incident.source : "node_event",
  };
}

function cloneActiveShop(shop) {
  if (!shop || typeof shop !== "object") return null;
  const items = (Array.isArray(shop.items) ? shop.items : [])
    .map((item) => ({
      lineupId: toNumber(item?.lineupId ?? item?.lineup_id),
      itemType: String(item?.itemType ?? item?.item_type ?? ""),
      statusId: toStatusId(item?.statusId ?? item?.status_id),
      rawName: normalizeGuidebookText(item?.rawName ?? item?.name ?? item?.item_name),
      rawComment: normalizeGuidebookText(item?.rawComment ?? item?.comment ?? item?.item_comment),
      itemImage: typeof (item?.itemImage ?? item?.item_image) === "string"
        ? (item.itemImage ?? item.item_image)
        : "",
      price: toNumber(item?.price),
      stockNum: toNumber(item?.stockNum ?? item?.stock_num),
      canPurchase: Boolean(item?.canPurchase ?? item?.can_purchase),
      rarity: toNumber(item?.rarity),
      iconCategory: toNumber(item?.iconCategory ?? item?.icon_category),
      iconType: toNumber(item?.iconType ?? item?.icon_type),
    }))
    .filter((item) => item.lineupId != null || item.statusId != null || item.rawName);
  if (!items.length) return null;
  return {
    tabId: toNumber(shop.tabId ?? shop.tab_id),
    title: typeof shop.title === "string" ? shop.title : "",
    coinAmount: toNumber(shop.coinAmount ?? shop.coin_amount),
    items,
    capturedAt: toNumber(shop.capturedAt) ?? null,
    source: typeof shop.source === "string" ? shop.source : "shop",
  };
}

function currentSpecialIncidentContext(response) {
  const dungeon =
    response?.option?.dungeon ??
    response?.data?.option?.dungeon ??
    response?.dungeon ??
    response?.data?.dungeon;
  if (!dungeon || typeof dungeon !== "object") return { found: false };
  const currentNodeId = toNumber(dungeon.current_node_id ?? dungeon.currentNodeId);
  const nodes = Array.isArray(dungeon.node_list)
    ? dungeon.node_list
    : Array.isArray(dungeon.nodeList)
      ? dungeon.nodeList
      : [];
  const currentNode = currentNodeId == null
    ? null
    : nodes.find((node) =>
        toNumber(node?.node_id ?? node?.nodeId) === currentNodeId);
  if (!currentNode) return { found: false };
  const nodeType = toNumber(currentNode.node_type ?? currentNode.nodeType);
  const specialIncidentId = toNumber(
    currentNode.special_incident_id ?? currentNode.specialIncidentId,
  );
  return {
    found: true,
    specialIncidentId:
      nodeType === 10 && specialIncidentId != null ? specialIncidentId : null,
  };
}

export function normalizeGuidebookText(value) {
  return normalizeGuidebookDatabaseText(value);
}

function sourceForUrl(url) {
  if (/\/arcarum3\/book(?:\/|$)/i.test(url)) return "book_page";
  if (/spacebook_status_list/i.test(url)) return "status_list";
  if (/dungeon_shop_lineup/i.test(url)) return "shop";
  if (/purchase_dungeon_shop_item/i.test(url)) return "shop_purchase";
  if (/\/result(?:multi)?\/content\/index/i.test(url)) return "battle_result";
  if (/spacebook_status_add/i.test(url)) return "gain";
  if (/spacebook_status_remove/i.test(url)) return "remove";
  if (/move_node/i.test(url)) return "move_node";
  if (/incident_choose/i.test(url)) return "incident";
  if (/node_event/i.test(url)) return "node_event";
  return "arcarum3";
}

function parseRequestBody(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};

  try {
    return JSON.parse(value);
  } catch {
    const result = {};
    try {
      const params = new URLSearchParams(value);
      for (const [key, item] of params.entries()) {
        if (Object.hasOwn(result, key)) {
          result[key] = Array.isArray(result[key])
            ? [...result[key], item]
            : [result[key], item];
        } else {
          result[key] = item;
        }
      }
    } catch {
      return {};
    }
    return result;
  }
}

function findKey(value, keys) {
  if (!value || typeof value !== "object") return undefined;
  for (const key of keys) {
    if (Object.hasOwn(value, key)) return value[key];
  }
  for (const child of Object.values(value)) {
    if (!child || typeof child !== "object") continue;
    const found = findKey(child, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function numberList(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values
    .flatMap((item) => {
      if (typeof item !== "string") return [item];
      try {
        const parsed = JSON.parse(item);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return item.split(",");
      }
    })
    .map(toStatusId)
    .filter((id) => id != null);
}

function extractRequestStatusIds(request) {
  return numberList(
    findKey(request, ["status_ids", "status_ids[]", "statusIds"]),
  );
}

function extractRequestLineupId(request) {
  return toNumber(findKey(request, ["lineup_id", "lineupId"]));
}

function statusRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const statusId = toStatusId(value.status_id ?? value.statusId);
  if (statusId == null) return null;

  const name =
    value.name ?? value.item_name ?? value.status_name ?? value.comment;
  return {
    statusId,
    userStatusId: toNumber(value.user_status_id ?? value.userStatusId),
    rawName: typeof name === "string" ? name : "",
    rarity: toNumber(value.rarity),
    iconCategory: toNumber(value.icon_category ?? value.iconCategory),
    iconType: toNumber(value.icon_type ?? value.iconType),
    num: toNumber(
      value.num ?? value.count ?? value.amount ?? value.possession_num,
    ),
  };
}

function selectionCandidate(status) {
  return {
    statusId: status.statusId,
    rawName: status.rawName,
    rarity: status.rarity,
    iconCategory: status.iconCategory,
    iconType: status.iconType,
  };
}

function collectBookActions(value, output = [], seen = new Set()) {
  if (!value || typeof value !== "object") return output;
  if (seen.has(value)) return output;
  seen.add(value);

  if (!Array.isArray(value)) {
    const actionType = toNumber(value.action_type ?? value.actionType);
    if (
      [BOOK_ACTION_GAIN, BOOK_ACTION_SELECT, BOOK_ACTION_REMOVE].includes(
        actionType,
      ) &&
      Array.isArray(value.status_list ?? value.statusList)
    ) {
      const candidates = value.status_list ?? value.statusList;
      output.push({
        actionType,
        scenarioType: toNumber(value.scenario_type ?? value.scenarioType),
        candidateNum: toNumber(value.candidate_num ?? value.candidateNum),
        selectNumMin: toNumber(value.select_num_min ?? value.selectNumMin),
        selectNumMax: toNumber(value.select_num_max ?? value.selectNumMax),
        statuses: candidates.map(statusRecord).filter(Boolean),
        unresolved: candidates
          .filter((candidate) => !statusRecord(candidate))
          .map((candidate) => candidate?.name ?? candidate?.comment)
          .filter((name) => typeof name === "string" && name),
      });
    }
  }

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      collectBookActions(child, output, seen);
    }
  }
  return output;
}

function findIncidentSelection(response, context = {}) {
  const nodeType = toNumber(
    response?.node_type ?? response?.nodeType ?? response?.data?.node_type ?? response?.data?.nodeType,
  );
  if (nodeType !== 5 && nodeType !== 10) return null;
  const specialIncidentId = nodeType === 10
    ? toNumber(
        response?.special_incident_id ??
        response?.specialIncidentId ??
        response?.data?.special_incident_id ??
        response?.data?.specialIncidentId ??
        context.currentSpecialIncidentId,
      )
    : null;
  const scenarios =
    response?.action_scenario_list ??
    response?.actionScenarioList ??
    response?.data?.action_scenario_list ??
    response?.data?.actionScenarioList;
  if (!Array.isArray(scenarios)) return { nodeType, options: [] };
  let description = "";
  let image = "";
  let selected = null;
  for (const scenario of scenarios) {
    const scenarioType = toNumber(scenario?.scenario_type ?? scenario?.scenarioType);
    if (scenarioType === 1) {
      description = typeof scenario?.text === "string" ? scenario.text : description;
      image = typeof scenario?.image === "string" ? scenario.image : image;
    }
    const choices = scenario?.choice_ids ?? scenario?.choiceIds;
    if (!Array.isArray(choices) || !choices.length) continue;
    selected = choices.map((choice) => ({
      choiceId: toNumber(choice?.choice_id ?? choice?.choiceId),
      title: typeof choice?.title === "string" ? choice.title : "",
      text: typeof choice?.text === "string" ? choice.text : "",
      turn: toNumber(choice?.turn),
      disabled: Boolean(choice?.is_disabled ?? choice?.isDisabled),
      questCheck: Boolean(choice?.is_quest_check ?? choice?.isQuestCheck),
    }));
  }
  return {
    selectionId: (() => {
      const key = incidentSelectionKey({
        specialIncidentId,
        options: selected || [],
      });
      return key && /^\d+$/.test(key) ? Number(key) : null;
    })(),
    specialIncidentId,
    nodeType,
    eventKind: specialIncidentId != null ? "special" : "normal",
    description,
    image,
    options: selected || [],
  };
}

function incidentSelectionKey(incidentOrOptions) {
  const options = Array.isArray(incidentOrOptions)
    ? incidentOrOptions
    : incidentOrOptions?.options || [];
  const specialIncidentId = Array.isArray(incidentOrOptions)
    ? null
    : toNumber(incidentOrOptions?.specialIncidentId);
  if (specialIncidentId != null && specialIncidentId > 0) {
    return `special:${specialIncidentId}`;
  }
  const ids = options.map((option) => option.choiceId).filter((id) => id != null);
  if (!ids.length) return null;
  // Some events append the generic "leave" choice_id=1. It does not identify
  // the event; the regular eight-digit choices still share a six-digit prefix.
  const eventIds = ids.filter((id) => id >= 10000);
  const groupIds = [
    ...new Set((eventIds.length ? eventIds : ids).map((id) => Math.trunc(id / 100))),
  ];
  return groupIds.length === 1
    ? String(groupIds[0])
    : `choices:${(eventIds.length ? eventIds : ids).join("-")}`;
}

function addObservedText(values, language, text) {
  const next = Array.isArray(values) ? values.map((item) => ({ ...item })) : [];
  if (text && !next.some((item) => item.language === language && item.text === text)) {
    next.push({ language, text });
  }
  return next;
}

function localizedText(previous, language, text) {
  const next = { ...(previous || {}) };
  if (text && !next[language]) next[language] = text;
  return next;
}

function normalizeIncidentNotes(value) {
  if (typeof value === "string") return value ? { "zh-CN": value } : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, note]) => typeof note === "string"),
  );
}

function mergeIncidentNotes(seed, local) {
  const notes = { "zh-CN": "", ...normalizeIncidentNotes(seed) };
  for (const [language, note] of Object.entries(normalizeIncidentNotes(local))) {
    if (note || !notes[language]) notes[language] = note;
  }
  return notes;
}

function withoutIncidentTimes(value) {
  if (!value) return value;
  const { firstSeenAt, lastSeenAt, ...rest } = value;
  return rest;
}

function recordIncidentSelection(state, incident, meta) {
  const key = incidentSelectionKey(incident);
  if (!key) return { changed: false, catalogueChanged: false };
  const previous = state.incidentCatalogue[key];
  const description = normalizePlayerText(incident.description, meta.playerName);
  const language = detectGuidebookLanguage(description, meta.language);
  const options = { ...(previous?.options || {}) };
  for (const option of incident.options) {
    const optionKey = String(option.choiceId ?? `index:${Object.keys(options).length}`);
    const oldOption = options[optionKey];
    const optionLanguage = detectGuidebookLanguage(
      `${option.title}${option.text}`,
      meta.language,
    );
    const title = normalizePlayerText(option.title, meta.playerName);
    const text = normalizePlayerText(option.text, meta.playerName);
    options[optionKey] = {
      choiceId: option.choiceId,
      title: localizedText(oldOption?.title, optionLanguage, title),
      text: localizedText(oldOption?.text, optionLanguage, text),
      observedTitles: addObservedText(
        oldOption?.observedTitles,
        optionLanguage,
        title,
      ),
      observedTexts: addObservedText(
        oldOption?.observedTexts,
        optionLanguage,
        text,
      ),
      turn: option.turn,
      disabled: option.disabled,
      questCheck: option.questCheck,
    };
  }
  const specialIncidentId = toNumber(
    incident.specialIncidentId ?? previous?.specialIncidentId,
  );
  const eventKind =
    incident.eventKind ||
    previous?.eventKind ||
    (specialIncidentId != null || incident.nodeType === 10 ? "special" : "normal");
  const next = {
    selectionId: /^\d+$/.test(key) ? Number(key) : null,
    specialIncidentId: specialIncidentId ?? null,
    nodeType: incident.nodeType,
    eventKind,
    notes: { "zh-CN": "", ...normalizeIncidentNotes(previous?.notes) },
    name: { ...(previous?.name || {}) },
    enumKey: previous?.enumKey || "",
    group: previous?.group || "",
    tips: [...(previous?.tips || [])],
    image: incident.image || previous?.image || "",
    description: localizedText(previous?.description, language, description),
    observedDescriptions: addObservedText(
      previous?.observedDescriptions,
      language,
      description,
    ),
    options,
    sources: uniqueValues([...(previous?.sources || []), meta.source]),
    firstSeenAt: previous?.firstSeenAt ?? meta.now,
    lastSeenAt: meta.now,
  };
  state.incidentCatalogue[key] = next;
  return {
    changed: !equalJson(previous, next),
    catalogueChanged:
      !previous || !equalJson(withoutIncidentTimes(previous), withoutIncidentTimes(next)),
  };
}

function findAuthoritativeStatusList(response) {
  const candidate =
    response?.status_list ??
    response?.statusList ??
    response?.data?.status_list ??
    response?.data?.statusList;
  if (!Array.isArray(candidate)) return null;

  const statuses = candidate.map(statusRecord).filter(Boolean);
  if (statuses.length !== candidate.length) return null;
  if (statuses.some((status) => status.num == null)) return null;
  return statuses;
}

function collectHeldBookStatuses(value) {
  const records = [];
  const visited = new Set();
  const seenInstances = new Set();

  function visit(current) {
    if (!current || typeof current !== "object" || visited.has(current)) return;
    visited.add(current);

    if (!Array.isArray(current)) {
      const status = statusRecord(current);
      if (status && (status.userStatusId != null || status.num != null)) {
        const key =
          status.userStatusId != null
            ? `user:${status.userStatusId}`
            : `summary:${status.statusId}:${status.num}`;
        if (!seenInstances.has(key)) {
          seenInstances.add(key);
          records.push(status);
        }
      }
    }

    for (const child of Object.values(current)) visit(child);
  }

  visit(value);
  const aggregated = new Map();
  for (const status of records) {
    const previous = aggregated.get(status.statusId);
    const amount = status.userStatusId != null ? 1 : Math.max(0, status.num || 0);
    aggregated.set(status.statusId, {
      ...(previous || status),
      num: (previous?.num || 0) + amount,
    });
  }
  return [...aggregated.values()];
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function recordUnresolved(state, rawText, { now, source, language }) {
  const text = normalizeGuidebookText(rawText);
  if (!text) return { changed: false, catalogueChanged: false };
  const detectedLanguage = detectGuidebookLanguage(text, language);
  const previousIndex = state.unresolved.findIndex(
    (entry) => entry.text === text && entry.language === detectedLanguage,
  );
  const previous = state.unresolved[previousIndex];
  const next = {
    text,
    language: detectedLanguage,
    sources: uniqueValues([...(previous?.sources || []), source]),
    firstSeenAt: previous?.firstSeenAt ?? now,
    lastSeenAt: now,
  };
  if (previousIndex >= 0) state.unresolved[previousIndex] = next;
  else state.unresolved.push(next);
  return {
    changed: !equalJson(previous, next),
    catalogueChanged:
      !previous || !equalJson(previous.sources || [], next.sources || []),
  };
}

function recordCatalogue(state, status, { now, source, language }) {
  const key = String(status.statusId);
  const previous = state.catalogue[key];
  const rawNames = [...(previous?.rawNames || [])];
  if (status.rawName && !rawNames.includes(status.rawName)) {
    rawNames.push(status.rawName);
  }

  const normalizedRaw = normalizeGuidebookText(status.rawName);
  const matchingUnresolved = normalizedRaw
    ? state.unresolved.filter((entry) => entry.text === normalizedRaw)
    : [];
  const detectedLanguage = detectGuidebookLanguage(
    normalizedRaw,
    normalizeGuidebookLanguage(language) === "und"
      ? matchingUnresolved[0]?.language
      : language,
  );
  const observedTexts = [...(previous?.observedTexts || [])];
  const observationExists = observedTexts.some(
    (entry) => entry.language === detectedLanguage && entry.text === normalizedRaw,
  );
  if (normalizedRaw && !observationExists) {
    observedTexts.push({ language: detectedLanguage, text: normalizedRaw });
  }

  const text = {
    "zh-CN": normalizeGuidebookText(previous?.text?.["zh-CN"]),
    ja: normalizeGuidebookText(previous?.text?.ja),
    en: normalizeGuidebookText(previous?.text?.en),
  };
  const filledLanguage =
    normalizedRaw && detectedLanguage !== "und" && !text[detectedLanguage];
  if (filledLanguage) text[detectedLanguage] = normalizedRaw;

  const sources = uniqueValues([
    ...(previous?.sources || []),
    ...matchingUnresolved.flatMap((entry) => entry.sources || []),
    source,
  ]);
  const firstSeenCandidates = matchingUnresolved
    .map((entry) => entry.firstSeenAt)
    .filter((value) => value != null);
  const firstSeenAt = previous?.firstSeenAt
    ?? (firstSeenCandidates.length ? Math.min(...firstSeenCandidates) : now);

  const next = {
    statusId: status.statusId,
    rawName: status.rawName || previous?.rawName || "",
    rawNames,
    text,
    observedTexts,
    rarity: status.rarity ?? previous?.rarity ?? null,
    iconCategory: status.iconCategory ?? previous?.iconCategory ?? null,
    iconType: status.iconType ?? previous?.iconType ?? null,
    firstSeenAt,
    lastSeenAt: now,
    sources,
  };
  state.catalogue[key] = next;
  if (matchingUnresolved.length) {
    state.unresolved = state.unresolved.filter(
      (entry) => entry.text !== normalizedRaw,
    );
  }

  const metadataChanged = !previous || ["rarity", "iconCategory", "iconType"]
    .some((field) => previous[field] !== next[field]);
  const sourcesChanged = !equalJson(previous?.sources || [], sources);
  return {
    changed: !equalJson(previous, next) || matchingUnresolved.length > 0,
    catalogueChanged:
      !previous ||
      (!observationExists && Boolean(normalizedRaw)) ||
      filledLanguage ||
      metadataChanged ||
      sourcesChanged ||
      matchingUnresolved.length > 0,
  };
}

function ensureCatalogueId(state, statusId, meta) {
  if (state.catalogue[String(statusId)]) {
    return { changed: false, catalogueChanged: false };
  }
  return recordCatalogue(
    state,
    {
      statusId,
      rawName: "",
      rarity: null,
      iconCategory: null,
      iconType: null,
    },
    meta,
  );
}

function setInventory(state, statuses, { now, source }) {
  const next = {};
  for (const status of statuses) {
    if ((status.num ?? 0) <= 0) continue;
    next[String(status.statusId)] = {
      statusId: status.statusId,
      num: status.num,
      updatedAt: now,
      source,
    };
  }
  if (equalJson(state.inventory, next)) return false;
  state.inventory = next;
  return true;
}

function adjustInventory(state, statusId, amount, { now, source }) {
  const key = String(statusId);
  const current = state.inventory[key]?.num || 0;
  const num = Math.max(0, current + amount);
  if (num === current) return false;
  if (num === 0) {
    delete state.inventory[key];
  } else {
    state.inventory[key] = { statusId, num, updatedAt: now, source };
  }
  return true;
}

function shopItems(response) {
  const candidate =
    response?.item_list ??
    response?.itemList ??
    response?.data?.item_list ??
    response?.data?.itemList;
  return Array.isArray(candidate) ? candidate : [];
}

function shopTabId(url) {
  const match = String(url).match(/dungeon_shop_lineup\/([^/?#]+)/i);
  return toNumber(match?.[1]);
}

function shopItemRecord(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const status = statusRecord(item);
  const name = item.item_name || item.name || item.comment || "";
  const comment = item.item_comment || item.comment || item.name || "";
  return {
    lineupId: toNumber(item.lineup_id ?? item.lineupId),
    itemType: String(item.item_type ?? item.itemType ?? ""),
    statusId: status?.statusId ?? null,
    rawName: normalizeGuidebookText(name),
    rawComment: normalizeGuidebookText(comment),
    itemImage: typeof item.item_image === "string"
      ? item.item_image
      : typeof item.itemImage === "string"
        ? item.itemImage
        : "",
    price: toNumber(item.price),
    stockNum: toNumber(item.stock_num ?? item.stockNum),
    canPurchase: Boolean(item.can_purchase ?? item.canPurchase),
    rarity: status?.rarity ?? toNumber(item.rarity),
    iconCategory: status?.iconCategory ?? toNumber(item.icon_category ?? item.iconCategory),
    iconType: status?.iconType ?? toNumber(item.icon_type ?? item.iconType),
  };
}

function markShopItemPurchased(shop, lineupId) {
  if (!shop || lineupId == null) return { shop, changed: false };
  let changed = false;
  const items = (shop.items || []).map((item) => {
    if (item.lineupId !== lineupId) return item;
    const stockNum = item.stockNum == null ? item.stockNum : Math.max(0, item.stockNum - 1);
    const canPurchase = stockNum == null ? false : stockNum > 0;
    const next = { ...item, stockNum, canPurchase };
    changed = changed || !equalJson(item, next);
    return next;
  });
  return { shop: { ...shop, items }, changed };
}

function battleRewardStatuses(response) {
  const rewardList =
    response?.option?.result_data?.arcarum3?.reward_list ??
    response?.data?.option?.result_data?.arcarum3?.reward_list;
  if (!Array.isArray(rewardList)) return [];

  return rewardList
    .filter((reward) => toNumber(reward?.reward_type ?? reward?.rewardType) === 4)
    .flatMap((reward) => (Array.isArray(reward.detail) ? reward.detail : []))
    .map(statusRecord)
    .filter(Boolean);
}

export function updateGuidebookState(previous, response, options = {}) {
  const state = cloneState(previous);
  const url = String(options.url || "");
  const now = options.now ?? Date.now();
  const source = sourceForUrl(url);
  const language = normalizeGuidebookLanguage(options.language);
  const meta = {
    now,
    source,
    language,
    playerName: options.playerName || state.playerName || "",
  };
  const request = parseRequestBody(options.requestBody);
  let changed = Boolean(previous && previous.version !== GUIDEBOOK_STATE_VERSION);
  let catalogueChanged = changed;
  let incidentCatalogueChanged = false;

  function applyCatalogueResult(result) {
    changed = result.changed || changed;
    catalogueChanged = result.catalogueChanged || catalogueChanged;
  }

  const specialContext = currentSpecialIncidentContext(response);
  if (
    specialContext.found &&
    state.currentSpecialIncidentId !== specialContext.specialIncidentId
  ) {
    state.currentSpecialIncidentId = specialContext.specialIncidentId;
    changed = true;
  }

  if (/\/rest\/arcarum3\/start_dungeon/i.test(url)) {
    if (
      Object.keys(state.inventory).length ||
      Object.keys(state.shopLineup).length ||
      state.activeSelection ||
      state.activeIncident ||
      state.activeShop ||
      state.currentSpecialIncidentId != null
    ) {
      state.inventory = {};
      state.shopLineup = {};
      state.activeSelection = null;
      state.activeIncident = null;
      state.activeShop = null;
      state.currentSpecialIncidentId = null;
      changed = true;
    }
  }

  if (/\/arcarum3\/dungeon\/content\/index\//i.test(url) && state.activeShop) {
    state.activeShop = null;
    changed = true;
  }

  const isBattleResult = /\/result(?:multi)?\/content\/index/i.test(url);
  const battleStatuses = isBattleResult ? battleRewardStatuses(response) : [];

  if (/dungeon_shop_lineup/i.test(url)) {
    const nextLineup = {};
    const activeItems = [];
    for (const item of shopItems(response)) {
      const lineupId = toNumber(item.lineup_id ?? item.lineupId);
      const statusId = toStatusId(item.status_id ?? item.statusId);
      const shopItem = shopItemRecord(item);
      if (shopItem) activeItems.push(shopItem);
      if (lineupId != null && statusId != null) {
        nextLineup[String(lineupId)] = statusId;
        applyCatalogueResult(recordCatalogue(state, statusRecord(item), meta));
      }
    }
    const mergedLineup = { ...state.shopLineup, ...nextLineup };
    if (!equalJson(state.shopLineup, mergedLineup)) {
      state.shopLineup = mergedLineup;
      changed = true;
    }
    const nextShop = activeItems.length
      ? {
          tabId: shopTabId(url),
          title: shopTabId(url) === 1 ? "guidebooks" : "items",
          coinAmount: toNumber(response?.coin_amount ?? response?.data?.coin_amount),
          items: activeItems,
          capturedAt: now,
          source,
        }
      : null;
    if (!equalJson(state.activeShop, nextShop)) {
      state.activeShop = nextShop;
      changed = true;
    }
    if (nextShop && (state.activeSelection || state.activeIncident)) {
      state.activeSelection = null;
      state.activeIncident = null;
      changed = true;
    }
  }

  if (/spacebook_status_list/i.test(url)) {
    const authoritative = findAuthoritativeStatusList(response);
    if (authoritative) {
      for (const status of authoritative) {
        applyCatalogueResult(recordCatalogue(state, status, meta));
      }
      changed = setInventory(state, authoritative, meta) || changed;
    }
  }

  if (/\/arcarum3\/book(?:\/|$)/i.test(url)) {
    const heldStatuses = collectHeldBookStatuses(response);
    for (const status of heldStatuses) {
      applyCatalogueResult(recordCatalogue(state, status, meta));
    }
    changed = setInventory(state, heldStatuses, meta) || changed;
  }

  let gainIds = [];
  if (/spacebook_status_add/i.test(url)) {
    gainIds = extractRequestStatusIds(request);
    for (const statusId of gainIds) {
      applyCatalogueResult(ensureCatalogueId(state, statusId, meta));
      changed = adjustInventory(state, statusId, 1, meta) || changed;
    }
  }

  if (/purchase_dungeon_shop_item/i.test(url)) {
    const lineupId = extractRequestLineupId(request);
    const statusId = state.shopLineup[String(lineupId)];
    if (statusId != null) {
      changed =
        adjustInventory(state, statusId, 1, meta) || changed;
    }
    const shopResult = markShopItemPurchased(state.activeShop, lineupId);
    if (shopResult.changed) {
      state.activeShop = shopResult.shop;
      changed = true;
    }
  }

  if (isBattleResult) {
    for (const status of battleStatuses) {
      applyCatalogueResult(recordCatalogue(state, status, meta));
      changed = adjustInventory(state, status.statusId, 1, meta) || changed;
    }
  }

  const incidentSelection = findIncidentSelection(response, state);
  if (incidentSelection && (/\/proceed_node_event(?:\?|$)/i.test(url) || /\/incident_choose/i.test(url))) {
    const normalizedIncident = normalizePlayerTextTree(incidentSelection, meta.playerName);
    const nextIncident = normalizedIncident.options.length
      ? { ...normalizedIncident, capturedAt: now, source }
      : null;
    if (state.activeSelection) {
      state.activeSelection = null;
      changed = true;
    }
    if (state.activeShop) {
      state.activeShop = null;
      changed = true;
    }
    if (!equalJson(state.activeIncident, nextIncident)) {
      state.activeIncident = nextIncident;
      changed = true;
    }
    if (nextIncident) {
      const incidentResult = recordIncidentSelection(state, nextIncident, meta);
      changed = incidentResult.changed || changed;
      incidentCatalogueChanged =
        incidentResult.catalogueChanged || incidentCatalogueChanged;
    }
  }

  for (const action of collectBookActions(response)) {
    for (const rawText of action.unresolved) {
      applyCatalogueResult(recordUnresolved(state, rawText, meta));
    }
    for (const status of action.statuses) {
      applyCatalogueResult(recordCatalogue(state, status, meta));
    }
    if (action.actionType === BOOK_ACTION_SELECT) {
      const nextSelection = action.statuses.length
        ? {
            scenarioType: action.scenarioType,
            candidateNum: action.candidateNum,
            selectNumMin: action.selectNumMin,
            selectNumMax: action.selectNumMax,
            candidates: action.statuses.map(selectionCandidate),
            capturedAt: now,
            source,
          }
        : null;
      if (!equalJson(state.activeSelection, nextSelection)) {
        state.activeSelection = nextSelection;
        state.activeIncident = null;
        state.activeShop = null;
        changed = true;
      }
      continue;
    }
    if (action.actionType === BOOK_ACTION_GAIN && gainIds.length) continue;
    const amount = action.actionType === BOOK_ACTION_REMOVE ? -1 : 1;
    for (const status of action.statuses) {
      changed = adjustInventory(state, status.statusId, amount, meta) || changed;
    }
  }

  if (/spacebook_status_add/i.test(url) && (state.activeSelection || state.activeIncident || state.activeShop)) {
    state.activeSelection = null;
    state.activeIncident = null;
    state.activeShop = null;
    changed = true;
  }

  if (changed) {
    state.updatedAt = now;
    state.lastCapture = { url, source, at: now };
  }

  return { state, changed, catalogueChanged, incidentCatalogueChanged };
}

export function serializeIncidentDatabase(state) {
  return {
    schemaVersion: INCIDENT_DATABASE_VERSION,
    updatedAt: state?.updatedAt ? new Date(state.updatedAt).toISOString() : null,
    entries: cloneIncidentCatalogue(state?.incidentCatalogue),
  };
}

function mergeObservedTexts(...collections) {
  const result = [];
  const seen = new Set();
  for (const item of collections.flat()) {
    if (!item || typeof item.text !== "string" || !item.text) continue;
    const language = detectGuidebookLanguage(item.text, item.language);
    const key = `${language}\u0000${item.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ language, text: item.text });
  }
  return result;
}

function mergeIncidentOption(seed, local) {
  return {
    choiceId: local?.choiceId ?? seed?.choiceId ?? null,
    title: { ...(seed?.title || {}), ...(local?.title || {}) },
    text: { ...(seed?.text || {}), ...(local?.text || {}) },
    observedTitles: mergeObservedTexts(
      seed?.observedTitles || [],
      local?.observedTitles || [],
    ),
    observedTexts: mergeObservedTexts(
      seed?.observedTexts || [],
      local?.observedTexts || [],
    ),
    turn: local?.turn ?? seed?.turn ?? null,
    disabled: local?.disabled ?? seed?.disabled ?? false,
    questCheck: local?.questCheck ?? seed?.questCheck ?? false,
  };
}

function mergeIncidentEntry(seed, local) {
  const options = {};
  for (const key of new Set([
    ...Object.keys(seed?.options || {}),
    ...Object.keys(local?.options || {}),
  ])) {
    options[key] = mergeIncidentOption(seed?.options?.[key], local?.options?.[key]);
  }
  const nodeType = local?.nodeType ?? seed?.nodeType ?? null;
  const specialIncidentId =
    local?.specialIncidentId ?? seed?.specialIncidentId ?? null;
  return {
    selectionId:
      specialIncidentId == null
        ? local?.selectionId ?? seed?.selectionId ?? null
        : null,
    specialIncidentId,
    nodeType,
    eventKind:
      specialIncidentId != null
        ? "special"
        : local?.eventKind || seed?.eventKind || (nodeType === 10 ? "special" : "normal"),
    notes: mergeIncidentNotes(seed?.notes, local?.notes),
    name: { ...(seed?.name || {}), ...(local?.name || {}) },
    enumKey: local?.enumKey || seed?.enumKey || "",
    group: local?.group || seed?.group || "",
    tips: uniqueValues([...(seed?.tips || []), ...(local?.tips || [])]),
    image: local?.image || seed?.image || "",
    description: { ...(seed?.description || {}), ...(local?.description || {}) },
    observedDescriptions: mergeObservedTexts(
      seed?.observedDescriptions || [],
      local?.observedDescriptions || [],
    ),
    options,
    sources: uniqueValues([...(seed?.sources || []), ...(local?.sources || [])]),
    firstSeenAt:
      seed?.firstSeenAt == null
        ? local?.firstSeenAt ?? null
        : local?.firstSeenAt == null
          ? seed.firstSeenAt
          : Math.min(seed.firstSeenAt, local.firstSeenAt),
    lastSeenAt: Math.max(seed?.lastSeenAt || 0, local?.lastSeenAt || 0) || null,
  };
}

export function mergeIncidentDatabaseIntoState(previous, database) {
  if (
    !database ||
    typeof database !== "object" ||
    Number(database.schemaVersion) !== INCIDENT_DATABASE_VERSION
  ) {
    return { state: previous, changed: false };
  }
  const state = cloneState(previous);
  const before = state.incidentCatalogue;
  const merged = { ...before };
  for (const [key, seed] of Object.entries(database.entries || {})) {
    if (!seed || typeof seed !== "object") continue;
    merged[key] = mergeIncidentEntry(seed, before[key]);
  }
  state.incidentCatalogue = merged;
  return { state, changed: !equalJson(before, merged) };
}

function canonicalIncidentDatabaseKey(sourceKey, entry) {
  if (Number(entry?.nodeType) === 10) {
    const selectionCandidates = [
      toNumber(entry?.selectionId),
      ...Object.values(entry?.options || {})
        .map((option) => toNumber(option?.choiceId))
        .filter((choiceId) => choiceId != null)
        .map((choiceId) => Math.trunc(choiceId / 100)),
    ];
    for (const selectionId of selectionCandidates) {
      const key = SPECIAL_INCIDENT_SELECTION_KEYS[selectionId];
      if (key) return key;
    }
  }
  const selectionId = toNumber(entry?.selectionId);
  if (selectionId != null && selectionId > 0) return String(selectionId);
  const choiceIds = Object.values(entry?.options || {})
    .map((option) => toNumber(option?.choiceId))
    .filter((choiceId) => choiceId != null && choiceId >= 10000);
  const groupIds = [...new Set(choiceIds.map((choiceId) => Math.trunc(choiceId / 100)))];
  if (groupIds.length === 1) return String(groupIds[0]);
  return String(sourceKey);
}

export function mergeIncidentDatabases(databases) {
  const entries = {};
  let updatedAt = null;
  for (const database of databases || []) {
    if (
      !database ||
      typeof database !== "object" ||
      Number(database.schemaVersion) !== INCIDENT_DATABASE_VERSION
    ) {
      throw new Error(
        `Unsupported event database schemaVersion ${database?.schemaVersion ?? "missing"}`,
      );
    }
    const timestamp = Date.parse(database.updatedAt);
    if (Number.isFinite(timestamp)) updatedAt = Math.max(updatedAt || 0, timestamp);
    for (const [sourceKey, entry] of Object.entries(database.entries || {})) {
      if (!entry || typeof entry !== "object") continue;
      const key = canonicalIncidentDatabaseKey(sourceKey, entry);
      const merged = entries[key]
        ? mergeIncidentEntry(entries[key], entry)
        : mergeIncidentEntry(entry, null);
      merged.selectionId = /^\d+$/.test(key) ? Number(key) : merged.selectionId;
      entries[key] = merged;
    }
  }
  return {
    schemaVersion: INCIDENT_DATABASE_VERSION,
    updatedAt: updatedAt == null ? null : new Date(updatedAt).toISOString(),
    entries,
  };
}

export function clearGuidebookSelection(previous) {
  if (!previous || typeof previous !== "object") {
    return { state: createGuidebookState(), changed: false };
  }
  if (!previous.activeSelection && !previous.activeIncident && !previous.activeShop) {
    return { state: previous, changed: false };
  }
  return {
    state: {
      ...previous,
      activeSelection: null,
      activeIncident: null,
      activeShop: null,
    },
    changed: true,
  };
}

export function listGuidebooks(state, { inventoryOnly = false } = {}) {
  const catalogue = state?.catalogue || {};
  const inventory = state?.inventory || {};
  return Object.values(catalogue)
    .map((entry) => ({
      ...entry,
      num: inventory[String(entry.statusId)]?.num || 0,
    }))
    .filter((entry) => !inventoryOnly || entry.num > 0)
    .sort(
      (a, b) =>
        (b.rarity ?? -1) - (a.rarity ?? -1) || a.statusId - b.statusId,
    );
}

export function mergeGuidebookDatabaseIntoState(previous, database) {
  const state = cloneState(previous);
  const localDatabase = serializeGuidebookDatabase(state);
  const merged = mergeGuidebookDatabases([database, localDatabase]);

  for (const entry of Object.values(merged.database.entries)) {
    const key = String(entry.statusId);
    const existing = state.catalogue[key];
    state.catalogue[key] = {
      statusId: entry.statusId,
      rawName: existing?.rawName || "",
      rawNames: [...(existing?.rawNames || [])],
      text: { ...entry.text },
      observedTexts: entry.observedTexts.map((item) => ({ ...item })),
      rarity: entry.rarity,
      iconCategory: entry.iconCategory,
      iconType: entry.iconType,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      sources: [...entry.sources],
    };
  }
  state.unresolved = merged.database.unresolved.map((entry) => ({
    ...entry,
    sources: [...entry.sources],
  }));

  return {
    state,
    changed: !equalJson(previous, state),
    conflicts: merged.conflicts,
  };
}
