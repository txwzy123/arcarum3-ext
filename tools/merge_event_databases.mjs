import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { mergeIncidentDatabases } from "../arcarum3-ext/shared/guidebooks.js";

function parseArguments(argv) {
  const args = [...argv];
  const outputIndex = args.indexOf("--output");
  if (outputIndex < 0 || !args[outputIndex + 1]) {
    throw new Error(
      "Usage: node tools/merge_event_databases.mjs --output <file> <input...>",
    );
  }
  const output = resolve(args[outputIndex + 1]);
  args.splice(outputIndex, 2);
  if (!args.length) throw new Error("At least one input database is required");
  return { output, inputs: args.map((input) => resolve(input)) };
}

export function mergeEventDatabaseFiles(argv) {
  const { output, inputs } = parseArguments(argv);
  const databases = inputs.map((input) => JSON.parse(readFileSync(input, "utf8")));
  const database = mergeIncidentDatabases(databases);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  console.log(`Merged ${inputs.length} event database(s) into ${output}`);
  return 0;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.exitCode = mergeEventDatabaseFiles(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
