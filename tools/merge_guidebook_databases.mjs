import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";

import { mergeGuidebookDatabases } from "../arcarum3-ext/shared/guidebookDatabase.js";

function parseArguments(argv) {
  const args = [...argv];
  const outputIndex = args.indexOf("--output");
  if (outputIndex < 0 || !args[outputIndex + 1]) {
    throw new Error("Usage: node tools/merge_guidebook_databases.mjs --output <file> <input...>");
  }
  const output = resolve(args[outputIndex + 1]);
  args.splice(outputIndex, 2);
  if (!args.length) throw new Error("At least one input database is required");
  return { output, inputs: args.map((input) => resolve(input)) };
}

function conflictPathFor(output) {
  const extension = extname(output);
  const stem = extension ? basename(output, extension) : basename(output);
  return resolve(dirname(output), `${stem}.conflicts.json`);
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function mergeGuidebookDatabaseFiles(argv) {
  const { output, inputs } = parseArguments(argv);
  const databases = inputs.map((input) =>
    JSON.parse(readFileSync(input, "utf8")),
  );
  const { database, conflicts } = mergeGuidebookDatabases(databases);
  const conflictPath = conflictPathFor(output);
  writeJson(output, database);
  writeJson(conflictPath, conflicts);

  console.log(`Merged ${inputs.length} database(s) into ${output}`);
  console.log(`Conflicts: ${conflicts.length} (${conflictPath})`);
  return conflicts.length ? 2 : 0;
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.exitCode = mergeGuidebookDatabaseFiles(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
