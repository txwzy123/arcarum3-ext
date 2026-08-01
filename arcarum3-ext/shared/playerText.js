export const PLAYER_PLACEHOLDER = "{{PLAYER}}";

/** Normalize account-specific names before storing event text. */
export function normalizePlayerText(value, playerName = "") {
  if (typeof value !== "string" || !value) return value || "";
  let text = value.replaceAll("宁静", PLAYER_PLACEHOLDER);
  const name = typeof playerName === "string" ? playerName.trim() : "";
  if (name && name !== PLAYER_PLACEHOLDER) {
    text = text.replaceAll(name, PLAYER_PLACEHOLDER);
  }
  return text;
}

/** Resolve the placeholder only at display time. */
export function resolvePlayerText(value, playerName = "") {
  if (typeof value !== "string" || !value) return value || "";
  const name = typeof playerName === "string" ? playerName.trim() : "";
  return value.replaceAll(PLAYER_PLACEHOLDER, name || "玩家");
}

export function normalizePlayerTextTree(value, playerName = "") {
  if (typeof value === "string") return normalizePlayerText(value, playerName);
  if (Array.isArray(value)) return value.map((item) => normalizePlayerTextTree(item, playerName));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizePlayerTextTree(item, playerName)]),
  );
}
