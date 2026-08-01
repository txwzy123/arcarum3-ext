import { existsSync, readFileSync } from "fs";
import {
  getMiasmaCenter,
  applySafeZoneShrinking,
  radiusForPattern,
  ensureSafeZoneShrinking,
} from "./shared/miasma.js";

function findDungeon(p) {
  if (p && typeof p === "object") {
    if (Array.isArray(p.node_list)) return p;
    for (const k of ["option", "data", "dungeon"]) {
      if (p[k]) {
        const r = findDungeon(p[k]);
        if (r) return r;
      }
    }
  }
  return null;
}

function assert(c, m) {
  if (!c) throw new Error(m);
}

assert(radiusForPattern(1) === 670, "pattern 1 radius 670");

const snapshot = new URL("../out/miasma_dungeon_snapshot.json", import.meta.url);
if (!existsSync(snapshot)) {
  console.log("safe-zone tests skipped: local out/miasma_dungeon_snapshot.json is not present");
  process.exit(0);
}
const raw = JSON.parse(readFileSync(snapshot, "utf-8"));
const dg = findDungeon(raw);
const state = {
  node_list: dg.node_list,
  miasma_info: dg.miasma_info,
};
const mc = getMiasmaCenter(state);
console.log("center", mc);
assert(mc && mc.radius === 670, "radius from stored/pattern");
const inside = state.node_list.filter((n) => !n.is_shrinking).length;
const outside = state.node_list.filter((n) => n.is_shrinking).length;
console.log("snapshot already tagged: inside", inside, "outside", outside);
assert(outside > 0 && inside > 0, "snapshot should have both zones after apply script");

// simulate server all false → ensure fills
const cleared = {
  ...state,
  node_list: state.node_list.map((n) => ({ ...n, is_shrinking: false })),
};
const fixed = ensureSafeZoneShrinking(cleared);
const out2 = fixed.node_list.filter((n) => n.is_shrinking).length;
console.log("after ensureSafeZoneShrinking outside", out2);
assert(out2 === outside, "recompute should match geometry");

console.log("safe-zone tests passed");
