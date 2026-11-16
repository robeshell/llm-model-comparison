// Tier leaderboard: groups model families by how far their best score sits
// behind the leader, instead of giving every model an exact rank. Adjacent
// AA Intelligence Index scores are usually less than a point apart, so a
// "#11 vs #12" ordering suggests more precision than the data has.
//
// Kept free of runtime imports so the data scripts can load it directly with
// Node's type stripping (node scripts/snapshot-tiers.mjs).
import type {
  PopularRecord,
  PriceRecord,
  RankingRecord,
} from "./types";

/** Points behind the leader that one tier spans. */
export const TIER_STEP = 5;
export const TIER_COUNT = 5;

export type TierKey = "T1" | "T2" | "T3" | "T4" | "T5" | "rest";

export type TierModel = {
  familyKey: string;
  family: string;
  /** Slug of the setting that represents the family (its best score). */
  slug: string;
  /** Reasoning effort of that setting, e.g. "Max"; null when not stated. */
  effort: string | null;
  variantCount: number;
  creator: string;
  creatorSlug: string;
  creatorLogo: string;
  score: number;
  gap: number;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  /** 3:1 input/output blended price per million tokens (USD). */
  blendedPerMillion: number | null;
  releaseDate: string | null;
  isOpenWeights: boolean | null;
  /** Best OpenRouter weekly rank of the family, if it is in the top list. */
  popularityRank: number | null;
};

export type Tier = {
  key: TierKey;
  label: string;
  /** Points behind the leader covered by this tier: [min, max). */
  range: [number, number | null];
  models: TierModel[];
};

export type TierBoard = {
  updatedAt: string;
  leaderScore: number;
  tiers: Tier[];
};

const EFFORT_WORDS =
  /^(max|xhigh|high|medium|low|minimal|reasoning|non-reasoning)$/i;

const TIER_LABELS: Record<TierKey, string> = {
  T1: "第一梯队",
  T2: "第二梯队",
  T3: "第三梯队",
  T4: "第四梯队",
  T5: "第五梯队",
  rest: "其他",
};

export function familyKeyFromSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/-(?:xhigh|high|medium|low|max|minimal)$/g, "")
    .replace(/-(?:non-reasoning|reasoning)$/g, "")
    .replace(/-\d{4}$/g, "");
}

/** "Claude Fable 5.2 (Max, Default Fallback)" → "Max" */
export function effortFromName(name: string): string | null {
  const match = name.match(/\(([^)]+)\)\s*$/);
  if (!match) return null;
  const first = match[1].split(",")[0].trim();
  return EFFORT_WORDS.test(first) ? first : null;
}

/** "Claude Fable 5.2 (Max, Default Fallback)" → "Claude Fable 5.2" */
export function familyLabelFromName(name: string): string {
  const match = name.match(/\s*\(([^)]+)\)\s*$/);
  if (!match) return name.trim();
  const first = match[1].split(",")[0].trim();
  if (!EFFORT_WORDS.test(first) && !/fallback/i.test(match[1])) {
    return name.trim();
  }
  return name.slice(0, match.index).trim();
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\d{4}\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function blendedPrice(
  input: number | null,
  output: number | null,
): number | null {
  if (input === null || output === null) return null;
  return (input * 3 + output) / 4;
}

export function tierKeyForGap(gap: number): TierKey {
  const index = Math.floor(gap / TIER_STEP);
  if (index < TIER_COUNT) return `T${index + 1}` as TierKey;
  return "rest";
}

export function buildTiers(
  rankings: RankingRecord[],
  prices: PriceRecord[] = [],
  popularity: PopularRecord[] = [],
  updatedAt = "",
): TierBoard {
  const priceBySlug = new Map(prices.map((item) => [item.id, item]));

  const popularityByName = new Map<string, number>();
  for (const item of popularity) {
    const key = normalizeName(item.name);
    const current = popularityByName.get(key);
    if (current === undefined || item.rank < current) {
      popularityByName.set(key, item.rank);
    }
  }

  const families = new Map<string, RankingRecord[]>();
  for (const item of rankings) {
    if (typeof item.intelligenceIndex !== "number") continue;
    const key = familyKeyFromSlug(item.slug);
    const list = families.get(key) ?? [];
    list.push(item);
    families.set(key, list);
  }

  const leaderScore = Math.max(
    ...[...families.values()].flat().map((item) => item.intelligenceIndex),
  );

  const models: TierModel[] = [...families.entries()].map(([key, items]) => {
    const best = [...items].sort(
      (a, b) => b.intelligenceIndex - a.intelligenceIndex,
    )[0];
    const price = priceBySlug.get(best.slug);
    const family = familyLabelFromName(best.shortName || best.name);
    const input = price?.inputPerMillion ?? null;
    const output = price?.outputPerMillion ?? null;
    return {
      familyKey: key,
      family,
      slug: best.slug,
      effort: effortFromName(best.shortName || best.name),
      variantCount: items.length,
      creator: best.creator,
      creatorSlug: best.creatorSlug,
      creatorLogo: best.creatorLogo,
      score: best.intelligenceIndex,
      gap: Math.round((leaderScore - best.intelligenceIndex) * 10) / 10,
      inputPerMillion: input,
      outputPerMillion: output,
      blendedPerMillion: blendedPrice(input, output),
      releaseDate: best.releaseDate ?? price?.releaseDate ?? null,
      isOpenWeights: price?.isOpenWeights ?? best.isOpenWeights ?? null,
      popularityRank: popularityByName.get(normalizeName(family)) ?? null,
    };
  });

  const order: TierKey[] = ["T1", "T2", "T3", "T4", "T5", "rest"];
  const tiers: Tier[] = order.map((key, index) => ({
    key,
    label: TIER_LABELS[key],
    range:
      key === "rest"
        ? [TIER_STEP * TIER_COUNT, null]
        : [TIER_STEP * index, TIER_STEP * (index + 1)],
    models: [],
  }));
  const tierByKey = new Map(tiers.map((tier) => [tier.key, tier]));
  for (const model of models) {
    tierByKey.get(tierKeyForGap(model.gap))!.models.push(model);
  }

  // Inside a tier the scores are close, so cheaper comes first. Models
  // without a price go last, then higher score breaks ties.
  for (const tier of tiers) {
    tier.models.sort((a, b) => {
      if (tier.key === "rest") return b.score - a.score;
      const pa = a.blendedPerMillion ?? Number.POSITIVE_INFINITY;
      const pb = b.blendedPerMillion ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });
  }

  return { updatedAt, leaderScore, tiers };
}

// ---------------------------------------------------------------------------
// History and "what changed"

export type TierHistoryEntry = {
  familyKey: string;
  family: string;
  score: number;
  tier: TierKey;
};

export type TierHistory = {
  updatedAt: string;
  leaderScore: number;
  entries: TierHistoryEntry[];
};

export type TierMove = {
  family: string;
  from: TierKey;
  to: TierKey;
  score: number;
};

export type TierChanges = {
  from: string | null;
  to: string;
  leader: { family: string; score: number; isNew: boolean };
  newEntries: { family: string; tier: TierKey; score: number }[];
  promoted: TierMove[];
  demoted: TierMove[];
  summary: string;
};

export function toHistory(board: TierBoard): TierHistory {
  return {
    updatedAt: board.updatedAt,
    leaderScore: board.leaderScore,
    entries: board.tiers.flatMap((tier) =>
      tier.models.map((model) => ({
        familyKey: model.familyKey,
        family: model.family,
        score: model.score,
        tier: tier.key,
      })),
    ),
  };
}

const TIER_RANK: Record<TierKey, number> = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
  T5: 5,
  rest: 6,
};

/** True when the tier membership differs, so a new history file is worth keeping. */
export function historyChanged(
  previous: TierHistory | null,
  current: TierHistory,
): boolean {
  if (!previous) return true;
  const key = (h: TierHistory) =>
    h.entries
      .map((e) => `${e.familyKey}:${e.tier}`)
      .sort()
      .join("|");
  return key(previous) !== key(current);
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Beijing date, since the posts are written for a Chinese audience.
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${bj.getUTCMonth() + 1}月${bj.getUTCDate()}日`;
}

export function diffTiers(
  previous: TierHistory | null,
  current: TierHistory,
): TierChanges {
  const prevByKey = new Map(
    (previous?.entries ?? []).map((entry) => [entry.familyKey, entry]),
  );
  const ranked = current.entries.filter((entry) => entry.tier !== "rest");
  const leaderEntry = [...current.entries].sort((a, b) => b.score - a.score)[0];
  const prevLeader = previous
    ? [...previous.entries].sort((a, b) => b.score - a.score)[0]
    : null;

  const newEntries: TierChanges["newEntries"] = [];
  const promoted: TierMove[] = [];
  const demoted: TierMove[] = [];

  if (previous) {
    for (const entry of current.entries) {
      const before = prevByKey.get(entry.familyKey);
      if (!before) {
        if (entry.tier !== "rest") {
          newEntries.push({
            family: entry.family,
            tier: entry.tier,
            score: entry.score,
          });
        }
        continue;
      }
      if (before.tier === entry.tier) continue;
      const move = {
        family: entry.family,
        from: before.tier,
        to: entry.tier,
        score: entry.score,
      };
      if (TIER_RANK[entry.tier] < TIER_RANK[before.tier]) promoted.push(move);
      else demoted.push(move);
    }
  }

  const byTier = (a: { tier?: TierKey; to?: TierKey; score: number }, b: typeof a) =>
    TIER_RANK[(a.tier ?? a.to)!] - TIER_RANK[(b.tier ?? b.to)!] ||
    b.score - a.score;
  newEntries.sort(byTier);
  promoted.sort(byTier);
  demoted.sort(byTier);

  const leader = {
    family: leaderEntry?.family ?? "",
    score: leaderEntry?.score ?? 0,
    isNew: Boolean(prevLeader && leaderEntry && prevLeader.familyKey !== leaderEntry.familyKey),
  };

  const changes: TierChanges = {
    from: previous?.updatedAt ?? null,
    to: current.updatedAt,
    leader,
    newEntries,
    promoted,
    demoted,
    summary: "",
  };
  changes.summary = buildSummary(changes, ranked);
  return changes;
}

function tierName(key: TierKey): string {
  return TIER_LABELS[key];
}

function buildSummary(
  changes: TierChanges,
  ranked: TierHistoryEntry[],
): string {
  const lines: string[] = [];
  const day = formatDay(changes.to);
  lines.push(`大模型梯队榜更新${day ? `（${day}）` : ""}`);
  lines.push("");

  const top = ranked
    .filter((entry) => entry.tier === "T1")
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.family);
  if (changes.leader.isNew) {
    lines.push(`新榜首：${changes.leader.family}（${changes.leader.score.toFixed(1)} 分）`);
  }
  if (top.length > 0) lines.push(`第一梯队：${top.join("、")}`);

  if (!changes.from) {
    lines.push("");
    lines.push("首期榜单：按与榜首的差距每 5 分一档，同档内按价格从低到高排。");
  } else {
    if (changes.newEntries.length > 0) {
      lines.push(
        `新上榜：${changes.newEntries
          .map((e) => `${e.family}（${tierName(e.tier)}）`)
          .join("、")}`,
      );
    }
    if (changes.promoted.length > 0) {
      lines.push(
        `升档：${changes.promoted
          .map((m) => `${m.family} ${tierName(m.from)}→${tierName(m.to)}`)
          .join("、")}`,
      );
    }
    if (changes.demoted.length > 0) {
      lines.push(
        `降档：${changes.demoted
          .map((m) => `${m.family} ${tierName(m.from)}→${tierName(m.to)}`)
          .join("、")}`,
      );
    }
    if (
      changes.newEntries.length === 0 &&
      changes.promoted.length === 0 &&
      changes.demoted.length === 0 &&
      !changes.leader.isNew
    ) {
      lines.push("本期梯队没有变化。");
    }
  }

  lines.push("");
  lines.push("数据：Artificial Analysis Intelligence Index");
  return lines.join("\n");
}
