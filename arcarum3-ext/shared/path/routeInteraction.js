/**
 * Pure rules for target-route right-click interactions.
 * The map window owns the route state; this module only returns the next
 * candidate so callers can plan it before committing any state changes.
 */

function sameId(a, b) {
  return a != null && b != null && Number(a) === Number(b);
}

/**
 * @param {{
 *   currentId?: number|null,
 *   clickedId: number,
 *   clickedIsBoss?: boolean,
 *   routeGoal?: number|null,
 *   routeVias?: number[]
 * }} input
 * @returns {{ action: "ignore"|"goal"|"via", goal: number|null, vias: number[] }}
 */
export function nextTargetSelection(input) {
  const clickedId = Number(input?.clickedId);
  const currentId = input?.currentId == null ? null : Number(input.currentId);
  const existingGoal = input?.routeGoal == null ? null : Number(input.routeGoal);
  const existingVias = Array.isArray(input?.routeVias)
    ? input.routeVias.map(Number).filter(Number.isFinite)
    : [];

  if (!Number.isFinite(clickedId)) {
    return { action: "ignore", goal: existingGoal, vias: existingVias };
  }
  // A route cannot have the current node as a meaningful destination or via.
  if (sameId(currentId, clickedId)) {
    return { action: "ignore", goal: existingGoal, vias: existingVias };
  }

  if (existingGoal == null || sameId(currentId, existingGoal)) {
    return { action: "goal", goal: clickedId, vias: [] };
  }

  if (input?.clickedIsBoss) {
    return {
      action: "goal",
      goal: clickedId,
      vias: existingVias.filter((id) => !sameId(id, clickedId)),
    };
  }

  if (sameId(existingGoal, clickedId)) {
    return {
      action: "goal",
      goal: existingGoal,
      vias: existingVias.filter((id) => !sameId(id, clickedId)),
    };
  }

  if (existingVias.some((id) => sameId(id, clickedId))) {
    return { action: "ignore", goal: existingGoal, vias: existingVias };
  }

  return {
    action: "via",
    goal: existingGoal,
    vias: [...existingVias, clickedId],
  };
}

/**
 * Return true when two low-level browser events represent one right-click.
 * Both pointerup -> contextmenu and contextmenu -> pointerup are covered.
 */
export function isDuplicateRightClick(previous, next, windowMs = 120) {
  if (!previous || !next) return false;
  const previousTime = Number(previous.time);
  const nextTime = Number(next.time);
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false;
  if (Math.abs(nextTime - previousTime) > windowMs) return false;
  if (previous.source != null && next.source != null) {
    if (previous.source === next.source) return false;
  }
  if (sameId(previous.nodeId, next.nodeId)) return true;
  const hasCoordinates = [previous.x, previous.y, next.x, next.y].every((value) =>
    Number.isFinite(Number(value)),
  );
  if (!hasCoordinates) return false;
  const dx = Number(previous.x) - Number(next.x);
  const dy = Number(previous.y) - Number(next.y);
  return dx * dx + dy * dy <= 64;
}
