import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sidepanelHtml, sidepanelScript, mapHtml, mapScript, guidebookScript, mapCss] =
  await Promise.all([
    readFile(new URL("./sidepanel/index.html", import.meta.url), "utf8"),
    readFile(new URL("./sidepanel/sidepanel.js", import.meta.url), "utf8"),
    readFile(new URL("./map/map.html", import.meta.url), "utf8"),
    readFile(new URL("./map/map.js", import.meta.url), "utf8"),
    readFile(new URL("./map/guidebookView.js", import.meta.url), "utf8"),
    readFile(new URL("./map/map.css", import.meta.url), "utf8"),
  ]);

function assertUniqueIds(html, label) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${label} 的 HTML id 必须唯一`);
  return ids;
}

function assertReferencedIdsExist(htmlIds, scripts) {
  const referencedIds = scripts.flatMap((script) =>
    [...script.matchAll(/\$\("([^"]+)"\)/g)].map((match) => match[1]),
  );
  for (const id of new Set(referencedIds)) {
    assert.ok(htmlIds.includes(id), `脚本引用了不存在的 #${id}`);
  }
}

const sidepanelIds = assertUniqueIds(sidepanelHtml, "侧边栏");
assertReferencedIdsExist(sidepanelIds, [sidepanelScript]);
assert.doesNotMatch(sidepanelHtml, /page-guidebooks|guidebook-list|data-page=/);
assert.doesNotMatch(sidepanelScript, /guidebook|GET_GUIDEBOOKS/i);
assert.match(sidepanelHtml, /id="btn-open"/);

const mapIds = assertUniqueIds(mapHtml, "地图窗口");
assertReferencedIdsExist(mapIds, [mapScript, guidebookScript]);
assert.equal((mapHtml.match(/data-window-view=/g) || []).length, 2);
assert.equal((mapHtml.match(/data-book-view=/g) || []).length, 2);
assert.equal((mapHtml.match(/class="rarity-filter"/g) || []).length, 4);
assert.match(mapHtml, /id="guidebook-view"/);
assert.match(mapHtml, /class="guidebook-layout"/);
assert.match(mapHtml, /id="guidebook-live-panel"/);
assert.match(mapHtml, /id="book-live-summary"/);
assert.match(mapHtml, /id="book-live-description"/);
assert.match(mapHtml, /id="book-live-captured"/);
assert.match(mapHtml, /id="btn-clear-book-selection"/);
assert.match(mapHtml, /id="guidebook-live-empty"/);
assert.match(mapHtml, /id="guidebook-live-list"/);
assert.match(mapHtml, /id="book-live-notes"/);
assert.match(mapHtml, /id="book-live-notes-text"/);
assert.match(mapHtml, /id="guidebook-catalogue-panel"/);
assert.match(mapHtml, /id="guidebook-list"/);
assert.match(mapHtml, /id="book-search"/);
assert.match(mapHtml, /id="btn-export-books"/);
assert.ok(
  mapHtml.indexOf('id="btn-explore-gen"') <
    mapHtml.indexOf('class="explore-score-settings"'),
  "生成路径按钮应位于评分设置上方",
);
assert.match(mapScript, /createGuidebookView/);
assert.match(guidebookScript, /CLEAR_GUIDEBOOK_SELECTION/);
assert.match(guidebookScript, /activeIncident/);
assert.match(guidebookScript, /activeShop/);
assert.match(guidebookScript, /event-choice-item/);
assert.match(guidebookScript, /shop-item/);
assert.match(guidebookScript, /incidentEntry\?\.notes\?\.\["zh-CN"\]/);
assert.match(mapCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
assert.doesNotMatch(guidebookScript, /toISOString\(\)\.slice\(0,\s*10\)/);
assert.match(
  guidebookScript,
  /toISOString\(\)\.replace\(\/\[:\.\]\/g,\s*"-"\)/,
);
assert.match(
  mapCss,
  /grid-template-columns:\s*minmax\(0,\s*40fr\)\s+minmax\(0,\s*60fr\)/,
  "导本页应始终使用 40 / 60 分栏",
);
assert.match(
  mapCss,
  /\.guidebook-column\s*\{[^}]*overflow-y:\s*auto/s,
  "左右导本列应独立纵向滚动",
);

console.log("window structure: all assertions passed");
