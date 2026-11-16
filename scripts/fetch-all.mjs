import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      stdio: "inherit",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with ${code}`));
    });
  });
}

// Run every source even if one fails, so a broken source doesn't block the
// others. A failed script leaves its old JSON untouched.
const failed = [];
for (const script of [
  "fetch-prices.mjs",
  "fetch-rankings.mjs",
  "fetch-popularity.mjs",
  "fetch-logos.mjs",
]) {
  try {
    await run(script);
  } catch (err) {
    failed.push(script);
    console.log(`::error title=${script} failed::${err.message}`);
  }
}

// Rebuild the tier board from whatever data is on disk now, including the
// last good snapshot of a source that failed above.
try {
  await run("snapshot-tiers.mjs");
} catch (err) {
  failed.push("snapshot-tiers.mjs");
  console.log(`::error title=snapshot-tiers.mjs failed::${err.message}`);
}

if (failed.length > 0) {
  console.error(`Failed: ${failed.join(", ")}`);
  process.exit(1);
}
