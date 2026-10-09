import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("./shared/assetImages.js", import.meta.url), "utf8");
let nextTimer = 0;
const timers = new Map();
const context = vm.createContext({
  URL,
  chrome: { runtime: { getURL: (relative) => `chrome-extension://test/${relative}` } },
  setTimeout: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
  clearTimeout: (id) => timers.delete(id),
});
vm.runInContext(source.replaceAll("export function", "function"), context);
const { loadAssetImage, localAssetUrl, backgroundImageKey, selectBackgroundImage } = context;
const remote = "https://prd-game-a-granbluefantasy.akamaized.net/assets_en/img/sp/arcarum3/assets/map_bg/1.jpg";
const local = "chrome-extension://test/assets/assets/map_bg/1.jpg";
function image() {
  return { src: "", naturalWidth: 0, removeAttribute(name) { if (name === "crossorigin") this.crossOrigin = null; } };
}

const cdnImage = image();
let success = 0;
loadAssetImage(cdnImage, remote, { onLoad: () => success++ });
assert.equal(cdnImage.src, remote);
cdnImage.naturalWidth = 2680;
cdnImage.onload();
assert.equal(success, 1);
assert.equal(cdnImage.src, remote, "a successful CDN response must not fall back");
assert.equal(timers.size, 0);

const failedImage = image();
let localSuccess = 0;
loadAssetImage(failedImage, remote, { onLoad: () => localSuccess++ });
failedImage.onerror();
assert.equal(failedImage.src, local);
assert.equal(failedImage.crossOrigin, null);
failedImage.naturalWidth = 2680;
failedImage.onload();
assert.equal(localSuccess, 1);
assert.equal(timers.size, 0);

const timeoutImage = image();
loadAssetImage(timeoutImage, remote);
const staleTimer = [...timers.values()][0];
staleTimer();
assert.equal(timeoutImage.src, local);
staleTimer();
assert.equal(timeoutImage.src, local, "a late callback cannot invalidate the fallback");
timeoutImage.naturalWidth = 2680;
timeoutImage.onload();
assert.equal(timers.size, 0);

const missingImage = image();
let failures = 0;
loadAssetImage(missingImage, remote, { onError: () => failures++ });
missingImage.onerror();
missingImage.onerror();
assert.equal(failures, 1, "both sources missing must report one terminal failure");
assert.equal(timers.size, 0);

const replacedImage = image();
let oldCallbacks = 0;
loadAssetImage(replacedImage, remote, { onLoad: () => oldCallbacks++ });
const oldLoad = replacedImage.onload;
const oldTimeout = [...timers.values()][0];
const replacement = remote.replace("1.jpg", "replacement.jpg");
loadAssetImage(replacedImage, replacement);
oldLoad();
oldTimeout();
assert.equal(oldCallbacks, 0);
assert.equal(replacedImage.src, replacement);
replacedImage.naturalWidth = 100;
replacedImage.onload();
assert.equal(timers.size, 0);

assert.equal(localAssetUrl(remote), local);
assert.equal(
  localAssetUrl(remote.replace("assets_en/", "assets/")),
  local,
  "English and Japanese asset URLs must resolve to the same bundled file",
);

// Verify that every image used by the map and guidebook filters ships inside the extension.
const relativeImages = ["assets/map_bg/1.jpg", "assets/node_icon/base.png", "assets/node_icon/base_cleared.png", "assets/node_icon/piece_1.png", "dungeon/pointer_current_node.png"];
for (let type = 1; type <= 11; type++) {
  if (type !== 10) relativeImages.push(`assets/node_icon/${type}.png`);
}
for (const type of ["incident", "research", "teleport", "teleport_glow", "guru", "fanatic"]) relativeImages.push(`assets/node_icon/10_${type}.png`);
for (const specialId of [4, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) relativeImages.push(`assets/scpecial_node_bg/${specialId}.png`);
for (const type of ["unique", "rare", "normal", "cursed"]) {
  for (const state of ["on", "off"]) relativeImages.push(`book/tab/btn_${type}_${state}.png`);
}
for (const relative of relativeImages) {
  const url = `https://prd-game-a-granbluefantasy.akamaized.net/assets/img/sp/arcarum3/${relative}`;
  assert.equal(localAssetUrl(url), `chrome-extension://test/assets/${relative}`);
  await access(new URL(`./assets/${relative}`, import.meta.url));
}
const backgrounds = new Map();
const first = { complete: true, naturalWidth: 2680, naturalHeight: 1830 };
const second = { complete: true, naturalWidth: 3000, naturalHeight: 2000 };
assert.equal(backgroundImageKey("2"), "bg:assets/map_bg/2.jpg");
for (const invalid of [null, undefined, "", "bad", 0, -1, 1.5]) {
  assert.equal(backgroundImageKey(invalid), "bg:assets/map_bg/1.jpg");
}
assert.equal(selectBackgroundImage(backgrounds, 2), null);
backgrounds.set(backgroundImageKey(2), { complete: false, naturalWidth: 3000 });
backgrounds.set(backgroundImageKey(1), first);
assert.equal(selectBackgroundImage(backgrounds, 2), first, "use 1.jpg while 2.jpg is loading");
backgrounds.set(backgroundImageKey(2), null);
assert.equal(selectBackgroundImage(backgrounds, 2), first, "missing numbered image falls back to 1.jpg");
backgrounds.set(backgroundImageKey(2), second);
assert.equal(selectBackgroundImage(backgrounds, 2), second);
backgrounds.delete(backgroundImageKey(1));
backgrounds.set(backgroundImageKey(1), first);
assert.equal(selectBackgroundImage(backgrounds, 2), second, "late 1.jpg cannot replace ready 2.jpg");
assert.equal(selectBackgroundImage(backgrounds, 1), first, "switching maps must not retain the old numbered image");
assert.equal(selectBackgroundImage(backgrounds, 3), first, "a third map must not use a cached second-map image");
assert.equal(localAssetUrl(remote.replace("1.jpg", "2.jpg")), "chrome-extension://test/assets/assets/map_bg/2.jpg");
console.log(`asset fallback: all assertions passed; ${relativeImages.length} required images present`);
