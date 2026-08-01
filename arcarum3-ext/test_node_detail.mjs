import assert from "node:assert/strict";

import { buildNodeDetailView } from "./shared/nodeDetail.js";

const expectedDescriptions = {
  4: ["正确传送门", "随机金色导本三选一"],
  9: ["四连战", "不计入缩圈时间"],
  10: ["恢复全队生命", "转化两个导本"],
  11: ["20% 概率成功", "监狱钥匙"],
  12: ["召唤冷却", "技能冷却时间 -1", "10% HP"],
  13: ["600 金币", "解锁一把武器"],
  14: ["一个角色或一把武器"],
  15: ["150 金币", "300 金币", "白字伤害"],
  16: ["最多探索 5 次", "购买血液"],
  17: ["精英怪三连战", "10% 奥义充能"],
  18: ["300 金币", "25% 折扣"],
};

for (const [specialIncidentId, expectedTexts] of Object.entries(
  expectedDescriptions,
)) {
  const view = buildNodeDetailView({
    node_id: Number(specialIncidentId),
    node_type: 10,
    special_incident_id: Number(specialIncidentId),
    position_x: 0,
    position_y: 0,
    adjacent_node_ids: [],
  });
  const description = [view.summary, ...view.tips].join("\n");
  for (const expectedText of expectedTexts) {
    assert.match(
      description,
      new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `special_incident_id=${specialIncidentId} should include ${expectedText}`,
    );
  }
}

console.log("node detail descriptions: ok");
