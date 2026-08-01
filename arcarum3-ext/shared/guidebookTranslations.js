import { normalizeGuidebookText } from "./guidebooks.js";

// Kept for compatibility with older hand-edited installations.
export const GUIDEBOOK_TRANSLATIONS = Object.freeze({});

export function getGuidebookDisplayName(entry) {
  return (
    normalizeGuidebookText(entry?.text?.["zh-CN"]) ||
    normalizeGuidebookText(GUIDEBOOK_TRANSLATIONS[String(entry?.statusId)]) ||
    normalizeGuidebookText(entry?.rawName) ||
    normalizeGuidebookText(entry?.text?.ja) ||
    normalizeGuidebookText(entry?.text?.en) ||
    `未知导本 #${entry?.statusId ?? "?"}`
  );
}
