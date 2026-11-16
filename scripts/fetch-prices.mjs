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
const outFile = path.join(root, "data", "prices.json");

async function main() {
  const models = await fetchAaModels();
  const previous = await loadPrevious(outFile, (item) => item.id);
  const logos = logosByCreator(previous.values(), (item) => item.provider);

  const items = models
    .filter((m) => typeof m.intelligenceIndex === "number" && !m.deprecated)
    .map((m) => {
      const id = m.slug || m.id;
      const old = previous.get(id) ?? {};
      const provider = m.modelCreatorName || old.provider || "—";
      return {
        id,
        name: m.shortName || m.name,
        provider,
        creatorLogo: pick(m.modelCreatorLogo, old.creatorLogo, logos.get(provider)) ?? "",
        // The free API has no context window: keep the last known value.
        contextLength: pick(m.contextWindowTokens, old.contextLength),
        inputPerMillion: m.price1mInputTokens,
        outputPerMillion: m.price1mOutputTokens,
        intelligenceIndex: m.intelligenceIndex,
        isOpenWeights: pick(old.isOpenWeights),
        releaseDate: pick(m.releaseDate, old.releaseDate),
        huggingFaceUrl: pick(old.huggingFaceUrl),
      };
    })
    .filter(
      (row) =>
        row.inputPerMillion !== null || row.outputPerMillion !== null,
    )
    .sort((a, b) => {
      const score = (b.intelligenceIndex ?? 0) - (a.intelligenceIndex ?? 0);
      if (score !== 0) return score;
      const ai = a.inputPerMillion ?? Number.POSITIVE_INFINITY;
      const bi = b.inputPerMillion ?? Number.POSITIVE_INFINITY;
      return ai - bi;
    });

  assertNoShrink("prices", previous.size, items.length);

  const snapshot = {
    updatedAt: new Date().toISOString(),
    source: "Artificial Analysis",
    items,
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot, null, 2));
  console.log(`Wrote ${items.length} prices → data/prices.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
