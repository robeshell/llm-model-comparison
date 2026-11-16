import { readFile } from "node:fs/promises";

// Artificial Analysis official Data API (free tier).
// Docs: https://artificialanalysis.ai/data-api/docs
// Free tier: 100 requests per 24h, attribution required (the site credits AA).
const API_URL = "https://artificialanalysis.ai/api/v2/language/models/free";
const MAX_PAGES = 50;

export function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchPage(page, apiKey) {
  const url = `${API_URL}?page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "x-api-key": apiKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Artificial Analysis API ${res.status} ${res.statusText} ${body.slice(0, 200)}`,
    );
  }
  return res.json();
}

// Map one API model to the camelCase shape the fetch scripts already use.
// Fields the free tier doesn't return come back as null; the scripts fill
// them from the previous snapshot where they can.
function toModel(raw) {
  const creator = raw?.model_creator ?? {};
  const evals = raw?.evaluations ?? {};
  const pricing = raw?.pricing ?? {};
  const name = raw?.name ?? raw?.slug ?? "";
  return {
    id: raw?.id ?? raw?.slug ?? "",
    slug: raw?.slug ?? slugify(name),
    name,
    shortName: name,
    modelCreatorName: creator.name ?? "",
    modelCreatorSlug: creator.slug ?? slugify(creator.name),
    modelCreatorLogo: "",
    intelligenceIndex: num(evals.artificial_analysis_intelligence_index),
    codingIndex: num(evals.artificial_analysis_coding_index),
    agenticIndex: num(evals.artificial_analysis_agentic_index),
    price1mInputTokens: num(pricing.price_1m_input_tokens),
    price1mOutputTokens: num(pricing.price_1m_output_tokens),
    contextWindowTokens: num(raw?.context_window_tokens),
    releaseDate: raw?.release_date ?? null,
    deprecated: false,
  };
}

export async function fetchAaModels() {
  const apiKey = process.env.AA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AA_API_KEY is not set. Add it as a repository secret (Settings → Secrets and variables → Actions).",
    );
  }

  const models = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchPage(page, apiKey);
    const data = Array.isArray(payload?.data) ? payload.data : [];
    models.push(...data.map(toModel));
    if (!payload?.pagination?.has_more || data.length === 0) break;
  }

  const scored = models.filter((m) => typeof m.intelligenceIndex === "number");
  if (scored.length === 0) {
    throw new Error("Artificial Analysis API returned no models with an intelligence index");
  }
  return models;
}

// Read a previous snapshot and index its items by slug/id, so fields the
// free API doesn't return (context window, logos, single benchmarks) keep
// their last known values for models we already had.
export async function loadPrevious(file, keyOf) {
  try {
    const snapshot = JSON.parse(await readFile(file, "utf8"));
    const map = new Map();
    for (const item of snapshot.items ?? []) {
      const key = keyOf(item);
      if (key) map.set(key, item);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Logo file names by creator, taken from a previous snapshot.
export function logosByCreator(previousItems, creatorOf) {
  const map = new Map();
  for (const item of previousItems) {
    const creator = creatorOf(item);
    if (creator && item.creatorLogo && !map.has(creator)) {
      map.set(creator, item.creatorLogo);
    }
  }
  return map;
}

export function pick(...values) {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v;
  return null;
}
