import { PageHeading, PageShell } from "@/components/PageShell";
import { TierBoard } from "@/components/TierBoard";
import { loadPopularity, loadPrices, loadRankings, loadTierChanges } from "@/lib/data";
import { formatUpdatedAt } from "@/lib/format";
import { buildTiers } from "@/lib/tiers";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export default async function Home() {
  const [rankings, prices, popularity, changes] = await Promise.all([
    loadRankings(),
    loadPrices(),
    loadPopularity(),
    loadTierChanges(),
  ]);

  if (!rankings?.items.length) {
    return (
      <PageShell active="tiers">
        <PageHeading title="大模型梯队榜" meta="暂无数据" />
        <p className="text-sm text-muted-foreground">
          暂无数据。可在项目目录运行{" "}
          <code className="font-mono text-foreground">npm run fetch</code> 后刷新。
        </p>
      </PageShell>
    );
  }

  const board = buildTiers(
    rankings.items,
    prices?.items ?? [],
    popularity?.items ?? [],
    rankings.updatedAt,
  );

  return (
    <PageShell active="tiers">
      <PageHeading
        title="大模型梯队榜"
        meta={`数据更新至 ${formatUpdatedAt(rankings.updatedAt)}`}
      />
      <TierBoard
        board={board}
        changes={changes}
        shareImage={`${basePath}/share/tiers-latest.png`}
      />
    </PageShell>
  );
}
