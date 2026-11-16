import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoShrink,
  fetchAaModels,
  loadPrevious,
  logosByCreator,
  pick,
} from "./aa.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outFile = path.join(root, "data", "rankings.json");

async function main() {
  const models = await fetchAaModels();
  const previous = await loadPrevious(outFile, (item) => item.slug);
  const logos = logosByCreator(previous.values(), (item) => item.creatorSlug);

  // The free API returns only the headline indexes. Single benchmarks,
  // reasoning flag and links keep their last known values; new models
  // show them as empty until a fuller source is available.
  const items = models
    .filter((m) => typeof m.intelligenceIndex === "number" && !m.deprecated)
    .sort((a, b) => b.intelligenceIndex - a.intelligenceIndex)
    .map((m, index) => {
      const old = previous.get(m.slug) ?? {};
      const creatorSlug = m.modelCreatorSlug || old.creatorSlug || "";
      return {
        rank: index + 1,
        name: m.name,
        shortName: m.shortName || m.name,
        creator: m.modelCreatorName || old.creator || "—",
        creatorSlug,
        creatorLogo:
          pick(m.modelCreatorLogo, old.creatorLogo, logos.get(creatorSlug)) ?? "",
        intelligenceIndex: m.intelligenceIndex,
        // AA no longer publishes coding/agentic indexes (always null now).
        codingIndex: pick(m.codingIndex, old.codingIndex),
        agenticIndex: pick(m.agenticIndex, old.agenticIndex),
        gpqa: pick(old.gpqa),
        hle: pick(old.hle),
        scicode: pick(old.scicode),
        terminalbench: pick(old.terminalbench),
        lcr: pick(old.lcr),
        isReasoning: Boolean(old.isReasoning),
        slug: m.slug || "",
        isOpenWeights: pick(old.isOpenWeights),
        releaseDate: pick(m.releaseDate, old.releaseDate),
        huggingFaceUrl: pick(old.huggingFaceUrl),
      };
    });

  assertNoShrink("rankings", previous.size, items.length);

  const snapshot = {
    updatedAt: new Date().toISOString(),
    source: "Artificial Analysis",
    items,
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${items.length} rankings → data/rankings.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
