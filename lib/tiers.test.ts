import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTiers,
  diffTiers,
  effortFromName,
  familyLabelFromName,
  historyChanged,
  tierKeyForGap,
  toHistory,
} from "./tiers.ts";
import type { PriceRecord, RankingRecord } from "./types";

function ranking(slug: string, name: string, score: number): RankingRecord {
  return {
    rank: 0,
    name,
    shortName: name,
    creator: "Acme",
    creatorSlug: "acme",
    creatorLogo: "",
    intelligenceIndex: score,
    codingIndex: null,
    agenticIndex: null,
    gpqa: null,
    hle: null,
    scicode: null,
    terminalbench: null,
    lcr: null,
    isReasoning: false,
    slug,
  };
}

function price(id: string, input: number, output: number): PriceRecord {
  return {
    id,
    name: id,
    provider: "Acme",
    creatorLogo: "",
    contextLength: null,
    inputPerMillion: input,
    outputPerMillion: output,
    intelligenceIndex: null,
  };
}

test("effort and family label come from the trailing parenthesis", () => {
  assert.equal(effortFromName("Claude Fable 5.2 (Max, Default Fallback)"), "Max");
  assert.equal(effortFromName("GPT-6 Astra (Xhigh)"), "Xhigh");
  assert.equal(effortFromName("Qwen4 (0902)"), null);
  assert.equal(familyLabelFromName("Claude Fable 5.2 (Max, Default Fallback)"), "Claude Fable 5.2");
  assert.equal(familyLabelFromName("Gemini 4 Carbon (High)"), "Gemini 4 Carbon");
  assert.equal(familyLabelFromName("Qwen4 (0902)"), "Qwen4 (0902)");
});

test("tiers are 5-point bands behind the leader, with rounding", () => {
  assert.equal(tierKeyForGap(0), "T1");
  assert.equal(tierKeyForGap(4.9), "T1");
  assert.equal(tierKeyForGap(5), "T2");
  assert.equal(tierKeyForGap(24.9), "T5");
  assert.equal(tierKeyForGap(25), "rest");
  // 64.6 - 54.6 is 9.9999… in floating point; it must still land in T3.
  const board = buildTiers([
    ranking("a", "A (Max)", 64.6),
    ranking("b", "B", 54.6),
  ]);
  assert.equal(board.tiers.find((t) => t.key === "T3")!.models[0].family, "B");
});

test("a family is listed once, by its best setting", () => {
  const board = buildTiers([
    ranking("model-x", "Model X (Max)", 60),
    ranking("model-x-high", "Model X (High)", 58),
    ranking("model-x-low", "Model X (Low)", 50),
  ]);
  const all = board.tiers.flatMap((t) => t.models);
  assert.equal(all.length, 1);
  assert.equal(all[0].effort, "Max");
  assert.equal(all[0].variantCount, 3);
});

test("inside a tier, cheaper models come first", () => {
  const board = buildTiers(
    [ranking("pricey", "Pricey", 60), ranking("cheap", "Cheap", 58)],
    [price("pricey", 10, 40), price("cheap", 1, 4)],
  );
  assert.deepEqual(
    board.tiers[0].models.map((m) => m.family),
    ["Cheap", "Pricey"],
  );
  assert.equal(board.tiers[0].models[0].blendedPerMillion, 1.75);
});

test("diff reports new entries and tier moves", () => {
  const before = toHistory(
    buildTiers([ranking("a", "A", 60), ranking("b", "B", 52)], [], [], "2026-11-01T00:00:00Z"),
  );
  const after = toHistory(
    buildTiers(
      [ranking("a", "A", 60), ranking("b", "B", 57), ranking("c", "C", 49)],
      [],
      [],
      "2026-11-02T00:00:00Z",
    ),
  );
  assert.equal(historyChanged(before, after), true);
  assert.equal(historyChanged(after, after), false);
  const changes = diffTiers(before, after);
  assert.deepEqual(changes.newEntries.map((e) => e.family), ["C"]);
  assert.deepEqual(changes.promoted.map((m) => [m.family, m.from, m.to]), [["B", "T2", "T1"]]);
  assert.match(changes.summary, /新上榜：C/);
  assert.match(changes.summary, /升档：B 第二梯队→第一梯队/);
});
