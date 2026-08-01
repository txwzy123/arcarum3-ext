import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [database, translations] = await Promise.all([
  readFile(new URL("./data/events.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("./data/events.zh-CN.json", import.meta.url), "utf8").then(JSON.parse),
]);

assert.equal(Object.keys(database.entries).length, 62);
assert.equal(Object.keys(translations.entries).length, 62);
assert.equal(
  Object.values(database.entries).reduce(
    (total, entry) => total + Object.keys(entry.options || {}).length,
    0,
  ),
  115,
);

for (const [selectionId, entry] of Object.entries(database.entries)) {
  const isSpecial = selectionId.startsWith("special:");
  if (isSpecial) {
    assert.equal(entry.selectionId, null);
    assert.equal(entry.specialIncidentId, Number(selectionId.slice(8)));
    assert.equal(entry.nodeType, 10);
    assert.equal(entry.eventKind, "special");
    assert.ok(entry.name["zh-CN"]);
    assert.ok(entry.description["zh-CN"]);
  } else {
    assert.equal(entry.selectionId, Number(selectionId));
    assert.equal(entry.eventKind, "normal");
  }
  assert.equal(typeof entry.notes["zh-CN"], "string");
  if (!isSpecial && entry.description.ja) {
    assert.ok(entry.description["zh-CN"], `事件 ${selectionId} 缺少中文场景说明`);
  }
  assert.ok(translations.entries[selectionId], `事件 ${selectionId} 缺少中文种子`);
  for (const [choiceId, option] of Object.entries(entry.options || {})) {
    if (option.title.ja) {
      assert.ok(option.title["zh-CN"], `选项 ${choiceId} 缺少中文标题`);
    }
    if (option.text.ja) {
      assert.ok(option.text["zh-CN"], `选项 ${choiceId} 缺少中文结果`);
    }
  }
}

console.log("event seed audit tests passed");
