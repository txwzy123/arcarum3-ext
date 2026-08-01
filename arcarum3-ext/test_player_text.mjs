import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createGuidebookState,
  updateGuidebookState,
} from "./shared/guidebooks.js";
import {
  PLAYER_PLACEHOLDER,
  normalizePlayerText,
  resolvePlayerText,
} from "./shared/playerText.js";

assert.equal(
  normalizePlayerText("Alice found a spring.", "Alice"),
  `${PLAYER_PLACEHOLDER} found a spring.`,
);
assert.equal(resolvePlayerText(`${PLAYER_PLACEHOLDER} found a spring.`, "Bob"), "Bob found a spring.");
assert.equal(resolvePlayerText(`${PLAYER_PLACEHOLDER} found a spring.`), "玩家 found a spring.");

const previous = createGuidebookState();
previous.playerName = "Alice";
const result = updateGuidebookState(
  previous,
  {
    node_type: 5,
    action_scenario_list: [
      { scenario_type: 1, text: "Alice found a spring.", image: "spring.jpg" },
      {
        scenario_type: 2,
        choice_ids: [
          { choice_id: 12340101, title: "Alice drinks", text: "Alice recovers HP", turn: 1 },
        ],
      },
    ],
  },
  {
    url: "https://game.granbluefantasy.jp/rest/arcarum3/dungeon/proceed_node_event",
    now: 1,
    language: "en",
  },
);

assert.equal(result.state.activeIncident.description, `${PLAYER_PLACEHOLDER} found a spring.`);
assert.equal(result.state.activeIncident.options[0].title, `${PLAYER_PLACEHOLDER} drinks`);
assert.equal(result.state.incidentCatalogue[123401].description.en, `${PLAYER_PLACEHOLDER} found a spring.`);
assert.equal(result.state.incidentCatalogue[123401].options[12340101].text.en, `${PLAYER_PLACEHOLDER} recovers HP`);

for (const path of ["data/events.json", "data/events.zh-CN.json"]) {
  const raw = fs.readFileSync(new URL(path, import.meta.url), "utf8");
  const database = JSON.parse(raw);
  assert.equal(Object.keys(database.entries).length, 62);
  assert.equal(raw.includes("\u5b81\u9759"), false, `${path} still contains the old player name`);
  assert.equal(raw.includes(PLAYER_PLACEHOLDER), true, `${path} has no player placeholder`);
}

console.log("player text: all assertions passed");
