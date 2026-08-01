import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [database, translations] = await Promise.all([
  readFile(new URL("./data/guidebooks.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("./data/guidebooks.zh-CN.json", import.meta.url), "utf8").then(JSON.parse),
]);

const expectedTexts = {
  21: {
    ja: "アビリティ与ダメージUP(30%)",
    "zh-CN": "技能造成伤害提升(30%)",
  },
  22: {
    ja: "奥義与ダメージUP(30%)",
    "zh-CN": "奥义造成伤害提升(30%)",
  },
  42: {
    ja: "バトル開始時、味方全体に不死身効果(1回)(重複不可)",
    "zh-CN": "战斗开始时，赋予全体不死身效果(1次)(不可重复)",
  },
  24: {
    ja: "自属性スキルエンハンス(60%)",
    "zh-CN": "自属性加护强化(60%)",
  },
  74: {
    ja: "アビリティ使用間隔短縮(2ターン)",
    "zh-CN": "技能使用间隔缩短(2回合)",
  },
  77: {
    ja: "味方全体の奥義ゲージ最大値が200になる(重複不可)",
    "zh-CN": "全体奥义槽最大值变为200(不可重复)",
  },
  93: {
    ja: "ターン終了時に味方全体の奥義ゲージが100%以上の時、先頭のキャラが味方全体の奥義ゲージを100%消費して敵全体に10回合計100倍自属性ダメージ(重複不可)",
    "zh-CN": "回合结束时，若全体奥义槽均达到100%以上，首位角色消耗全体各100%奥义槽，对敌方全体造成10次合计100倍自属性伤害(不可重复)",
  },
  95: {
    ja: "攻撃開始時に味方全体が瀕死状態の時、味方全体の攻撃行動回数増加(＋1)",
    "zh-CN": "攻击开始时，若全体均处于濒死状态，全体攻击行动次数增加(+1)",
  },
  96: {
    ja: "防御大幅DOWN/バトル開始時に自動復活効果(強化効果を保持/1回)/この導本効果を入手して以降に味方が戦闘不能になった回数に応じて味方全体の与ダメージUP(0%/最大100%)(重複不可)",
    "zh-CN": "防御力大幅降低/战斗开始时获得自动复活效果(保留强化效果/1次)/获得此导本后，根据我方战斗不能的累计次数提升全体造成伤害(0%/最多100%)(不可重复)",
  },
  108: {
    ja: "バトル開始時にマリア・テレサが「女帝の正位置」を発動/攻撃開始時に味方全体のHPが最大の時、味方全体に攻撃大幅UP(1回)　◆マリア・テレサがバトルメンバーにいる時のみ発動(重複不可)",
    "zh-CN": "战斗开始时，玛丽亚·特蕾莎发动「女帝的正位」/攻击开始时，若全体HP均为最大值，赋予全体攻击力大幅提升(1次)；仅当玛丽亚·特蕾莎位于前排时发动(不可重复)",
  },
  116: {
    ja: "味方全体がターン終了時、自分にランダムな弱体効果",
    "zh-CN": "全体在回合结束时，随机获得弱化效果",
  },
  119: {
    ja: "君臨者マス/ボスマスで出現する敵の予兆解除条件が増加",
    "zh-CN": "君临者格/Boss格出现的敌人预兆解除条件增加",
  },
  124: {
    ja: "全ての属性が弱点属性になる(重複不可)",
    "zh-CN": "所有属性均变为弱点属性(不可重复)",
  },
  128: {
    ja: "アビリティ使用間隔延長(2ターン)　◆バトルに3回勝利すると「アビリティ使用間隔短縮(2ターン)」に変化(0/3回)",
    "zh-CN": "技能使用间隔延长(2回合)；战斗胜利3次后变为「技能使用间隔缩短(2回合)」(0/3次)",
  },
};
const dynamicTextStatusIds = new Set([45, 53, 54, 57, 85, 86]);
const intentionalNumberAdaptations = new Set([30, 56]);
const numbersIn = (text) => [...text.matchAll(/\d+/g)].map((match) => match[0]);

assert.equal(Object.keys(database.entries).length, 108);
assert.equal(Object.keys(translations.entries).length, 108);
assert.deepEqual(database.unresolved, []);
assert.deepEqual(translations.unresolved, []);

for (const statusId of [249, 259, 279, 309]) {
  assert.equal(database.entries[statusId], undefined, `#${statusId} 不是导本状态`);
  assert.equal(translations.entries[statusId], undefined, `#${statusId} 不应有导本译文`);
}

for (const [statusId, expected] of Object.entries(expectedTexts)) {
  assert.equal(database.entries[statusId].text.ja, expected.ja);
  assert.equal(database.entries[statusId].text["zh-CN"], expected["zh-CN"]);
  assert.equal(translations.entries[statusId].text["zh-CN"], expected["zh-CN"]);
}

assert.equal(
  database.entries[50].text.ja,
  "味方全体がダメージアビリティ使用時、敵の現HPに応じた無属性ダメージ",
);
assert.equal(
  database.entries[50].text["zh-CN"],
  "我方全体使用伤害技能时，根据敌人当前HP造成无属性伤害",
);
assert.deepEqual(database.entries[50].observedTexts, [
  {
    language: "ja",
    text: "味方全体がダメージアビリティ使用時、敵の現HPに応じた無属性ダメージ",
  },
]);

assert.equal(
  database.entries[63].text["zh-CN"],
  "全体在前3回合造成伤害降低(50%)/第4回合起造成伤害提升(100%)/受到伤害减轻(20%)",
);

for (const [statusId, entry] of Object.entries(database.entries)) {
  assert.equal(entry.statusId, Number(statusId));
  assert.ok(entry.text.ja, `#${statusId} 缺少日文原文`);
  assert.ok(entry.text["zh-CN"], `#${statusId} 缺少中文翻译`);
  assert.equal(entry.text.ja.includes("�"), false, `#${statusId} 日文含替换字符`);
  assert.equal(entry.text["zh-CN"].includes("�"), false, `#${statusId} 中文含替换字符`);
  assert.notEqual(entry.rarity, null, `#${statusId} 缺少稀有度`);
  assert.notEqual(entry.iconCategory, null, `#${statusId} 缺少图标分类`);
  assert.notEqual(entry.iconType, null, `#${statusId} 缺少图标类型`);
  assert.ok(
    entry.observedTexts.some(
      (observation) => observation.language === "ja" && observation.text === entry.text.ja,
    ),
    `#${statusId} 主原文不在观测记录中`,
  );
  if (!intentionalNumberAdaptations.has(entry.statusId)) {
    assert.deepEqual(
      numbersIn(entry.text["zh-CN"]),
      numbersIn(entry.text.ja),
      `#${statusId} 译文数字与原文不一致`,
    );
  }
  const alternateJapaneseTexts = entry.observedTexts.filter(
    (observation) => observation.language === "ja" && observation.text !== entry.text.ja,
  );
  assert.ok(
    alternateJapaneseTexts.length === 0 || dynamicTextStatusIds.has(entry.statusId),
    `#${statusId} 存在非动态的冲突原文`,
  );
  assert.equal(
    translations.entries[statusId]?.text?.["zh-CN"],
    entry.text["zh-CN"],
    `#${statusId} 主数据库和中文库不一致`,
  );
}

console.log("guidebook seed audit tests passed");
