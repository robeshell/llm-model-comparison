// Renders the current tier board to public/share/tiers-latest.png
// (1200×675, the size X shows as a large preview card). Runs before every
// build, so the image always matches the data the site was built from.
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { buildTiers, TIER_STEP } from "../lib/tiers.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const logosDir = path.join(root, "public", "logos");
const outFile = path.join(root, "public", "share", "tiers-latest.png");
const fontDir = path.join(root, "node_modules", "@fontsource", "noto-sans-sc");

const WIDTH = 1200;
const HEIGHT = 675;
const MAX_PER_TIER = 8;
const PAD_X = 56;
const CONTENT_W = WIDTH - PAD_X * 2;

// Logo file names by creator, same fallback the site uses (lib/vendors.ts).
const CREATOR_LOGO = {
  "AI21 Labs": "ai21_small.svg",
  Alibaba: "alibaba_small.svg",
  "Allen Institute for AI": "ai2_small.svg",
  Amazon: "aws_small.svg",
  Anthropic: "anthropic_small.svg",
  "ByteDance Seed": "bytedance_small.svg",
  DeepSeek: "deepseek_small.svg",
  Google: "google_small.svg",
  IBM: "ibm_small.svg",
  Kimi: "kimi.jpg",
  Meta: "meta_small.svg",
  Microsoft: "microsoft_small.svg",
  MiniMax: "minimax_small.svg",
  Mistral: "mistral_small.png",
  NVIDIA: "nvidia_small.svg",
  OpenAI: "openai_small.svg",
  Tencent: "tencent_small.svg",
  Xiaomi: "xiaomi_small.svg",
  "Z AI": "zai_small.svg",
};

const MIME = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(name) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
  } catch {
    return null;
  }
}

async function logoDataUri(model) {
  const candidates = [
    model.creatorLogo ? path.basename(model.creatorLogo) : null,
    CREATOR_LOGO[model.creator] ?? null,
  ].filter(Boolean);
  for (const name of candidates) {
    const ext = path.extname(name).toLowerCase();
    if (!MIME[ext] || !/^[\w.-]+$/.test(name)) continue;
    const file = path.join(logosDir, name);
    if (!(await exists(file))) continue;
    const data = await readFile(file);
    return `data:${MIME[ext]};base64,${data.toString("base64")}`;
  }
  return null;
}

// Noto Sans SC ships as ~100 unicode-range slices per weight. Load only the
// slices that hold characters this image actually uses.
function parseRanges(css) {
  const faces = [];
  for (const block of css.split("@font-face").slice(1)) {
    const file = block.match(/url\(\.\/files\/([^)]+\.woff)\)/)?.[1];
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!file || !range) continue;
    const spans = range.split(",").map((part) => {
      const [a, b] = part.trim().replace(/^U\+/i, "").split("-");
      const start = parseInt(a, 16);
      return [start, b ? parseInt(b, 16) : start];
    });
    faces.push({ file, spans });
  }
  return faces;
}

async function loadFonts(text) {
  const codes = new Set([...text].map((ch) => ch.codePointAt(0)));
  const fonts = [];
  for (const weight of [400, 700]) {
    const css = await readFile(path.join(fontDir, `${weight}.css`), "utf8");
    for (const face of parseRanges(css)) {
      const used = [...codes].some((code) =>
        face.spans.some(([a, b]) => code >= a && code <= b),
      );
      if (!used) continue;
      // Satori does not fall back between faces that share one name, so each
      // slice gets its own name and the root lists them all in font-family.
      fonts.push({
        name: `NotoSC-${face.file.match(/noto-sans-sc-([a-z0-9-]+?)-\d00-normal/)[1]}`,
        data: await readFile(path.join(fontDir, "files", face.file)),
        weight,
        style: "normal",
      });
    }
  }
  return fonts;
}

function h(type, style, children) {
  return { type, props: { style, children } };
}

function beijingDate(iso) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

let CHIP_FONT = 20;

// Same accent as the site's tier badges (app/globals.css).
const TIER_COLORS = {
  T1: ["#d7261e", "#ffffff"],
  T2: ["#e0564e", "#ffffff"],
  T3: ["#eb8a83", "#171717"],
  T4: ["#f3b8b3", "#171717"],
  T5: ["#f9dcd9", "#171717"],
};

function chip(model, logo) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: CHIP_FONT < 20 ? "5px 10px" : "7px 12px",
      border: "1.5px solid #d4d4d4",
      fontSize: CHIP_FONT,
      color: "#171717",
    },
    [
      logo
        ? { type: "img", props: { src: logo, width: 20, height: 20, style: { objectFit: "contain" } } }
        : h("div", { width: 20, height: 20, border: "1px solid #d4d4d4" }, ""),
      h("div", { display: "flex", fontWeight: 700 }, model.family),
      h("div", { display: "flex", color: "#737373", fontSize: CHIP_FONT - 2 }, model.score.toFixed(1)),
    ],
  );
}

async function main() {
  const rankings = await readJson("rankings.json");
  if (!rankings?.items?.length) {
    console.log("No rankings data; skipping share image.");
    return;
  }
  const prices = await readJson("prices.json");
  const popularity = await readJson("popularity.json");
  const board = buildTiers(
    rankings.items,
    prices?.items ?? [],
    popularity?.items ?? [],
    rankings.updatedAt,
  );
  const tiers = board.tiers.filter((t) => t.key !== "rest" && t.models.length > 0);

  // More chips than today's ~16 would push the last tier off the card.
  const chipCount = tiers.reduce((n, t) => n + Math.min(t.models.length, MAX_PER_TIER), 0);
  if (chipCount > 18) CHIP_FONT = 17;

  const rows = [];
  for (const tier of tiers) {
    // The image is about who is strongest, so order by score here.
    const models = [...tier.models].sort((a, b) => b.score - a.score);
    const shown = models.slice(0, MAX_PER_TIER);
    const chips = [];
    for (const model of shown) chips.push(chip(model, await logoDataUri(model)));
    if (models.length > shown.length) {
      chips.push(
        h("div", { display: "flex", padding: "7px 12px", fontSize: 20, color: "#737373" }, `+${models.length - shown.length}`),
      );
    }
    rows.push(
      h("div", { display: "flex", alignItems: "flex-start", gap: 20 }, [
        h("div", { display: "flex", flexDirection: "column", width: 120, flexShrink: 0, paddingTop: 4 }, [
          h(
            "div",
            { display: "flex", alignSelf: "flex-start", background: (TIER_COLORS[tier.key] ?? ["#171717"])[0], color: (TIER_COLORS[tier.key] ?? [null, "#ffffff"])[1], fontSize: 22, fontWeight: 700, padding: "2px 10px" },
            tier.key,
          ),
          h("div", { display: "flex", fontSize: 16, color: "#737373", marginTop: 6 }, tier.label),
        ]),
        h("div", { display: "flex", flexWrap: "wrap", gap: 10, width: CONTENT_W - 140 }, chips),
      ]),
    );
  }

  const siteUrl = (process.env.SITE_URL || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const footer = `与榜首差距每 ${TIER_STEP} 分一档 · 数据：Artificial Analysis Intelligence Index${siteUrl ? ` · ${siteUrl}` : ""}`;
  const title = "大模型梯队榜";
  const date = beijingDate(board.updatedAt);

  // Explicit sizes: satori lays out padding outside a fixed width, so the
  // content box gets its own width instead of padding on the root.
  const content = h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: CONTENT_W,
      height: HEIGHT - 44 - 32,
      marginTop: 44,
      marginLeft: PAD_X,
    },
    [
      h("div", { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26 }, [
        h("div", { display: "flex", alignItems: "center", gap: 16 }, [
          h("div", { display: "flex", width: 10, height: 40, background: TIER_COLORS.T1[0] }, ""),
          h("div", { display: "flex", fontSize: 40, fontWeight: 700, color: "#171717" }, title),
        ]),
        h("div", { display: "flex", fontSize: 22, color: "#737373" }, date),
      ]),
      h("div", { display: "flex", flexDirection: "column", gap: 18, flexGrow: 1 }, rows),
      h("div", { display: "flex", fontSize: 16, color: "#a3a3a3", borderTop: "1px solid #e5e5e5", paddingTop: 12 }, footer),
    ],
  );
  const tree = h(
    "div",
    { width: WIDTH, height: HEIGHT, display: "flex", background: "#ffffff" },
    [content],
  );

  const textForFonts = [title, date, footer, "+0123456789.", ...tiers.flatMap((t) => [t.key, t.label, ...t.models.map((m) => m.family)])].join("");
  const fonts = await loadFonts(textForFonts);
  const FAMILY_LIST = [...new Set(fonts.map((f) => f.name))];
  tree.props.style.fontFamily = FAMILY_LIST.join(", ");
  const svg = await satori(tree, { width: WIDTH, height: HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, png);
  console.log(`Wrote share image (${tiers.length} tiers, ${fonts.length} font slices) → public/share/tiers-latest.png`);
}

main().catch((err) => {
  // A missing image should not take the whole site down.
  console.error("Share image failed:", err);
  process.exitCode = 0;
});
