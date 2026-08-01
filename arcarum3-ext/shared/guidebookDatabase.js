export const GUIDEBOOK_DATABASE_VERSION = 1;
export const GUIDEBOOK_LANGUAGES = Object.freeze(["zh-CN", "ja", "en"]);

// State v3 recursively captured unrelated objects that happened to use status_id.
const LEGACY_NON_GUIDEBOOK_STATUS_IDS = new Set([
  192,
  202,
  244,
  249,
  254,
  259,
  274,
  279,
  304,
  309,
]);
const LEGACY_NON_GUIDEBOOK_TEXTS = new Map([
  [21, new Set(["攻刃"])],
  [22, new Set(["D上限", "伤害上限"])],
  [28, new Set(["アビD上限"])],
  [29, new Set(["アビD"])],
  [42, new Set(["攻刃"])],
  [
    50,
    new Set([
      "「太極の陰陽」習得",
      "习得「太极之阴阳」",
    ]),
  ],
]);

function toNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toStatusId(value) {
  const number = toNumber(value);
  return number != null && number > 0 ? number : null;
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === "string" && value))];
}

function normalizeIsoTime(value) {
  if (value == null || value === "") return null;
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function minTime(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.min(a, b);
}

function maxTime(a, b) {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

export function normalizeGuidebookDatabaseText(value) {
  return typeof value === "string" ? value.replace(/@@/g, "").trim() : "";
}

export function shouldDiscardLegacyGuidebookEntry(statusId, value) {
  return LEGACY_NON_GUIDEBOOK_STATUS_IDS.has(toStatusId(statusId))
    && [value?.rarity, value?.iconCategory, value?.iconType]
      .every((field) => field == null);
}

export function shouldDiscardLegacyGuidebookText(statusId, value) {
  const text = normalizeGuidebookDatabaseText(value);
  return Boolean(text && LEGACY_NON_GUIDEBOOK_TEXTS.get(toStatusId(statusId))?.has(text));
}

export function normalizeGuidebookLanguage(value) {
  const language = String(value || "").replace("_", "-").toLowerCase();
  if (language.startsWith("zh")) return "zh-CN";
  if (language.startsWith("ja")) return "ja";
  if (language.startsWith("en")) return "en";
  return "und";
}

export function detectGuidebookLanguage(text, hint) {
  const hinted = normalizeGuidebookLanguage(hint);
  if (hinted !== "und") return hinted;
  const value = normalizeGuidebookDatabaseText(text);
  if (/[\u3040-\u30ff]/u.test(value)) return "ja";
  if (/[A-Za-z]/.test(value) && !/[\u3400-\u9fff]/u.test(value)) return "en";
  return "und";
}

function emptyText() {
  return { "zh-CN": "", ja: "", en: "" };
}

function normalizeText(value) {
  const result = emptyText();
  for (const language of GUIDEBOOK_LANGUAGES) {
    result[language] = normalizeGuidebookDatabaseText(value?.[language]);
  }
  return result;
}

function normalizeObservation(value, fallbackLanguage = "und") {
  const item = typeof value === "string" ? { text: value } : value;
  if (!item || typeof item !== "object") return null;
  const text = normalizeGuidebookDatabaseText(item.text ?? item.rawName ?? item.name);
  if (!text) return null;
  return {
    language: detectGuidebookLanguage(text, item.language ?? fallbackLanguage),
    text,
  };
}

function uniqueObservations(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const observation = normalizeObservation(value);
    if (!observation) continue;
    const key = `${observation.language}\u0000${observation.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(observation);
  }
  return result;
}

function normalizeEntry(value, fallbackId) {
  if (!value || typeof value !== "object") return null;
  const statusId = toStatusId(value.statusId ?? value.status_id ?? fallbackId);
  if (statusId == null) return null;
  const rarity = toNumber(value.rarity);
  const iconCategory = toNumber(value.iconCategory ?? value.icon_category);
  const iconType = toNumber(value.iconType ?? value.icon_type);
  if (shouldDiscardLegacyGuidebookEntry(statusId, {
    rarity,
    iconCategory,
    iconType,
  })) return null;

  const observations = [...(value.observedTexts || [])];
  const legacyNames = [...(value.rawNames || [])];
  if (value.rawName && !legacyNames.includes(value.rawName)) legacyNames.push(value.rawName);
  for (const rawName of legacyNames) {
    observations.push({
      language: detectGuidebookLanguage(rawName),
      text: rawName,
    });
  }

  const text = normalizeText(value.text);
  for (const language of GUIDEBOOK_LANGUAGES) {
    if (shouldDiscardLegacyGuidebookText(statusId, text[language])) {
      text[language] = "";
    }
  }
  const observedTexts = uniqueObservations(observations).filter(
    (observation) => !shouldDiscardLegacyGuidebookText(statusId, observation.text),
  );
  for (const observation of observedTexts) {
    if (observation.language !== "und" && !text[observation.language]) {
      text[observation.language] = observation.text;
    }
  }

  return {
    statusId,
    text,
    observedTexts,
    rarity,
    iconCategory,
    iconType,
    sources: uniqueStrings(value.sources),
    firstSeenAt: toNumber(value.firstSeenAt),
    lastSeenAt: toNumber(value.lastSeenAt),
  };
}

function normalizeUnresolved(value) {
  if (!value || typeof value !== "object") return null;
  const text = normalizeGuidebookDatabaseText(value.text ?? value.rawName ?? value.name);
  if (!text) return null;
  return {
    text,
    language: detectGuidebookLanguage(text, value.language),
    sources: uniqueStrings(value.sources),
    firstSeenAt: toNumber(value.firstSeenAt),
    lastSeenAt: toNumber(value.lastSeenAt),
  };
}

function entriesFrom(value) {
  if (value?.entries && typeof value.entries === "object") {
    return Object.entries(value.entries);
  }
  if (Array.isArray(value?.catalogue)) {
    return value.catalogue.map((entry) => [String(entry?.statusId ?? ""), entry]);
  }
  return [];
}

export function normalizeGuidebookDatabase(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("Guidebook database must be an object");
  }
  const schemaVersion = Number(value.schemaVersion);
  if (schemaVersion !== GUIDEBOOK_DATABASE_VERSION) {
    throw new Error(`Unsupported guidebook database schemaVersion ${value.schemaVersion ?? "missing"}`);
  }

  const entries = {};
  for (const [key, valueEntry] of entriesFrom(value)) {
    const entry = normalizeEntry(valueEntry, key);
    if (entry) entries[String(entry.statusId)] = entry;
  }

  const unresolved = [];
  const unresolvedKeys = new Set();
  for (const valueEntry of value.unresolved || []) {
    const entry = normalizeUnresolved(valueEntry);
    if (!entry) continue;
    const key = `${entry.language}\u0000${entry.text}`;
    if (unresolvedKeys.has(key)) continue;
    unresolvedKeys.add(key);
    unresolved.push(entry);
  }

  return {
    schemaVersion: GUIDEBOOK_DATABASE_VERSION,
    updatedAt: normalizeIsoTime(value.updatedAt ?? value.exportedAt),
    entries,
    unresolved,
  };
}

function mergeEntry(target, incoming, conflicts) {
  for (const language of GUIDEBOOK_LANGUAGES) {
    const kept = target.text[language];
    const next = incoming.text[language];
    if (!kept && next) target.text[language] = next;
    else if (kept && next && kept !== next) {
      conflicts.push({
        statusId: target.statusId,
        field: `text.${language}`,
        kept,
        incoming: next,
      });
    }
  }

  target.observedTexts = uniqueObservations([
    ...target.observedTexts,
    ...incoming.observedTexts,
  ]);
  target.sources = uniqueStrings([...target.sources, ...incoming.sources]);
  for (const field of ["rarity", "iconCategory", "iconType"]) {
    if (target[field] == null && incoming[field] != null) target[field] = incoming[field];
  }
  target.firstSeenAt = minTime(target.firstSeenAt, incoming.firstSeenAt);
  target.lastSeenAt = maxTime(target.lastSeenAt, incoming.lastSeenAt);
}

function mergeUnresolved(target, incoming) {
  target.sources = uniqueStrings([...target.sources, ...incoming.sources]);
  target.firstSeenAt = minTime(target.firstSeenAt, incoming.firstSeenAt);
  target.lastSeenAt = maxTime(target.lastSeenAt, incoming.lastSeenAt);
}

export function mergeGuidebookDatabases(databases) {
  const database = {
    schemaVersion: GUIDEBOOK_DATABASE_VERSION,
    updatedAt: null,
    entries: {},
    unresolved: [],
  };
  const conflicts = [];
  const unresolvedByKey = new Map();
  let latestUpdatedAt = null;

  for (const value of databases || []) {
    const incoming = normalizeGuidebookDatabase(value);
    const incomingTime = incoming.updatedAt ? Date.parse(incoming.updatedAt) : null;
    latestUpdatedAt = maxTime(latestUpdatedAt, incomingTime);

    for (const entry of Object.values(incoming.entries)) {
      const key = String(entry.statusId);
      const target = database.entries[key];
      if (!target) {
        database.entries[key] = structuredClone(entry);
      } else {
        mergeEntry(target, entry, conflicts);
      }
    }

    for (const entry of incoming.unresolved) {
      const key = `${entry.language}\u0000${entry.text}`;
      const target = unresolvedByKey.get(key);
      if (target) mergeUnresolved(target, entry);
      else {
        const copy = structuredClone(entry);
        unresolvedByKey.set(key, copy);
        database.unresolved.push(copy);
      }
    }
  }

  database.unresolved = database.unresolved.filter((unresolved) => {
    const matches = Object.values(database.entries).filter((entry) =>
      entry.observedTexts.some((item) => item.text === unresolved.text)
      || Object.values(entry.text).includes(unresolved.text),
    );
    if (matches.length !== 1) return true;

    const entry = matches[0];
    if (unresolved.language !== "und" && !entry.text[unresolved.language]) {
      entry.text[unresolved.language] = unresolved.text;
    }
    entry.observedTexts = uniqueObservations([
      ...entry.observedTexts,
      { language: unresolved.language, text: unresolved.text },
    ]);
    entry.sources = uniqueStrings([...entry.sources, ...unresolved.sources]);
    entry.firstSeenAt = minTime(entry.firstSeenAt, unresolved.firstSeenAt);
    entry.lastSeenAt = maxTime(entry.lastSeenAt, unresolved.lastSeenAt);
    return false;
  });

  database.updatedAt = latestUpdatedAt == null
    ? null
    : new Date(latestUpdatedAt).toISOString();
  return { database, conflicts };
}

export function serializeGuidebookDatabase(state) {
  const entries = {};
  for (const [key, value] of Object.entries(state?.catalogue || {})) {
    const entry = normalizeEntry(value, key);
    if (entry) entries[String(entry.statusId)] = entry;
  }
  return normalizeGuidebookDatabase({
    schemaVersion: GUIDEBOOK_DATABASE_VERSION,
    updatedAt: state?.updatedAt ?? null,
    entries,
    unresolved: state?.unresolved || [],
  });
}
