// Builds the tier board from data/*.json, keeps a history file whenever the
// tier membership changes, and writes data/tier-changes.json (what moved
// between the last two different boards). Runs after the fetch scripts.
import { appendFile, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTiers,
  diffTiers,
  historyChanged,
  toHistory,
} from "../lib/tiers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const historyDir = path.join(dataDir, "history");
const KEEP_HISTORY = 120;

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function historyFiles() {
  try {
    return (await readdir(historyDir))
      .filter((name) => /^tiers-.*\.json$/.test(name))
      .sort();
  } catch {
    return [];
  }
}

function stamp(iso) {
  // 2026-11-16T20:00:05.169Z → 2026-11-16T2000Z
  return iso.replace(/:\d{2}\.\d+Z$|:\d{2}Z$/, "Z").replace(":", "");
}

async function main() {
  const rankings = await readJson(path.join(dataDir, "rankings.json"));
  if (!rankings?.items?.length) throw new Error("data/rankings.json is empty");
  const prices = await readJson(path.join(dataDir, "prices.json"));
  const popularity = await readJson(path.join(dataDir, "popularity.json"));

  const board = buildTiers(
    rankings.items,
    prices?.items ?? [],
    popularity?.items ?? [],
    rankings.updatedAt,
  );
  const current = toHistory(board);

  await mkdir(historyDir, { recursive: true });
  let files = await historyFiles();
  const latest = files.length
    ? await readJson(path.join(historyDir, files.at(-1)))
    : null;

  if (historyChanged(latest, current)) {
    const name = `tiers-${stamp(current.updatedAt)}.json`;
    await writeFile(path.join(historyDir, name), JSON.stringify(current, null, 2));
    console.log(`Tier board changed → data/history/${name}`);
    files = await historyFiles();
  } else {
    console.log("Tier board unchanged.");
  }

  for (const old of files.slice(0, Math.max(0, files.length - KEEP_HISTORY))) {
    await unlink(path.join(historyDir, old));
  }
  files = files.slice(-KEEP_HISTORY);

  const newest = await readJson(path.join(historyDir, files.at(-1)));
  const previous =
    files.length > 1 ? await readJson(path.join(historyDir, files.at(-2))) : null;
  const changes = diffTiers(previous, newest);
  await writeFile(
    path.join(dataDir, "tier-changes.json"),
    JSON.stringify(changes, null, 2),
  );
  // The post summary is for the site owner, not visitors: keep it in the repo
  // and on the Actions run page, never on the site.
  await writeFile(path.join(dataDir, "tier-post.txt"), `${changes.summary}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## 梯队榜发帖摘要\n\n\`\`\`text\n${changes.summary}\n\`\`\`\n`,
    );
  }
  console.log(
    `Changes: ${changes.newEntries.length} new, ${changes.promoted.length} up, ${changes.demoted.length} down`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
