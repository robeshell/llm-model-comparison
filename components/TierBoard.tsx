import type { Tier, TierBoard as TierBoardData, TierChanges, TierModel } from "@/lib/tiers";
import { TIER_STEP } from "@/lib/tiers";
import { formatNumber } from "@/lib/format";
import { formatPricePerMillion } from "@/lib/currency";
import { logoForCreator } from "@/lib/vendors";
import { VendorBadge } from "@/components/VendorBadge";

function rangeLabel(tier: Tier): string {
  const [min, max] = tier.range;
  if (max === null) return `落后榜首 ${min} 分以上`;
  if (min === 0) return `落后榜首 ${max} 分以内`;
  return `落后榜首 ${min}–${max} 分`;
}

function TierCard({ model }: { model: TierModel }) {
  return (
    <li className="tier-card">
      <div className="tier-card-head">
        <span className="tier-card-name">{model.family}</span>
        {model.effort ? (
          <span className="tier-chip" title="分数对应的推理强度">
            {model.effort}
          </span>
        ) : null}
        {model.popularityRank !== null && model.popularityRank <= 20 ? (
          <span
            className="tier-chip tier-chip-hot"
            title="OpenRouter 近 7 天使用排行"
          >
            热门 #{model.popularityRank}
          </span>
        ) : null}
      </div>
      <div className="tier-card-vendor">
        <VendorBadge
          name={model.creator}
          logoSrc={logoForCreator(model.creator, model.creatorLogo)}
        />
      </div>
      <dl className="tier-card-stats">
        <div>
          <dt>综合分</dt>
          <dd className="num">{formatNumber(model.score)}</dd>
        </div>
        <div>
          <dt>混合单价</dt>
          <dd className="num">
            {model.blendedPerMillion === null
              ? "—"
              : formatPricePerMillion(model.blendedPerMillion)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function ChangeList({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="tier-change-group">
      <span className="tier-change-label">{title}</span>
      <span>{items.join("、")}</span>
    </div>
  );
}

function cheapest(models: TierModel[]): TierModel | null {
  const priced = models.filter((m) => m.blendedPerMillion !== null);
  if (priced.length === 0) return null;
  return priced.reduce((a, b) =>
    (b.blendedPerMillion as number) < (a.blendedPerMillion as number) ||
    ((b.blendedPerMillion as number) === (a.blendedPerMillion as number) && b.score > a.score)
      ? b
      : a,
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="tier-fact">
      <dt>{label}</dt>
      <dd>
        <span className="tier-fact-value">{value}</span>
        {note ? <span className="tier-fact-note num">{note}</span> : null}
      </dd>
    </div>
  );
}

function Overview({ board }: { board: TierBoardData }) {
  const tiers = board.tiers.filter((t) => t.key !== "rest");
  const top = tiers.flatMap((t) => t.models);
  const leader = [...top].sort((a, b) => b.score - a.score)[0];
  const frontRow = cheapest(tiers.slice(0, 2).flatMap((t) => t.models));
  const value = cheapest(tiers.slice(0, 3).flatMap((t) => t.models));
  const total = board.tiers.reduce((n, t) => n + t.models.length, 0);
  const price = (m: TierModel) => formatPricePerMillion(m.blendedPerMillion as number);
  return (
    <dl className="tier-facts">
      {leader ? <Fact label="榜首" value={leader.family} note={formatNumber(leader.score)} /> : null}
      {frontRow ? (
        <Fact label="前两档最便宜" value={frontRow.family} note={price(frontRow)} />
      ) : null}
      {value && value.familyKey !== frontRow?.familyKey ? (
        <Fact label="前三档最便宜" value={value.family} note={price(value)} />
      ) : null}
      <Fact label="收录" value={`${total} 个模型家族`} note={`${top.length} 个进入前五档`} />
    </dl>
  );
}

function ChangesPanel({
  board,
  changes,
  shareImage,
}: {
  board: TierBoardData;
  changes: TierChanges;
  shareImage: string;
}) {
  const tierName = (key: string) => (key === "rest" ? "其他" : key);
  const nothing =
    changes.newEntries.length === 0 &&
    changes.promoted.length === 0 &&
    changes.demoted.length === 0;

  return (
    <section className="tier-changes" aria-labelledby="tier-changes-title">
      <div className="tier-changes-body">
        <Overview board={board} />
        <h2 id="tier-changes-title" className="tier-section-title">
          本期变化
        </h2>
        {changes.from === null ? (
          <p className="tier-changes-note">
            这是第一期。之后每次数据刷新，新上榜和换了梯队的模型会列在这里。
          </p>
        ) : nothing && !changes.leader.isNew ? (
          <p className="tier-changes-note">本期梯队没有变化。</p>
        ) : (
          <div className="tier-change-list">
            {changes.leader.isNew ? (
              <ChangeList
                title="新榜首"
                items={[`${changes.leader.family}（${changes.leader.score.toFixed(1)}）`]}
              />
            ) : null}
            <ChangeList
              title="新上榜"
              items={changes.newEntries.map((e) => `${e.family}（${tierName(e.tier)}）`)}
            />
            <ChangeList
              title="升档"
              items={changes.promoted.map((m) => `${m.family} ${tierName(m.from)}→${tierName(m.to)}`)}
            />
            <ChangeList
              title="降档"
              items={changes.demoted.map((m) => `${m.family} ${tierName(m.from)}→${tierName(m.to)}`)}
            />
          </div>
        )}
      </div>
      <a className="tier-share-preview" href={shareImage} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shareImage} alt="当期梯队榜分享图" width={600} height={338} />
        <span>分享图 · 点开下载</span>
      </a>
    </section>
  );
}

export function TierBoard({
  board,
  changes,
  shareImage,
}: {
  board: TierBoardData;
  changes: TierChanges | null;
  shareImage: string;
}) {
  const ranked = board.tiers.filter((tier) => tier.key !== "rest");
  const rest = board.tiers.find((tier) => tier.key === "rest");

  return (
    <div className="tier-board">
      {changes ? <ChangesPanel board={board} changes={changes} shareImage={shareImage} /> : null}

      <p className="tier-board-hint">同一梯队内按价格从低到高排列。</p>

      {ranked.map((tier) =>
        tier.models.length === 0 ? null : (
          <section key={tier.key} className="tier-row" data-tier={tier.key} aria-labelledby={`tier-${tier.key}`}>
            <header className="tier-row-head">
              <h2 id={`tier-${tier.key}`} className="tier-row-title">
                <span className="tier-key">{tier.key}</span>
                {tier.label}
              </h2>
              <p className="tier-row-range">{rangeLabel(tier)}</p>
              <p className="tier-row-count">{tier.models.length} 个模型</p>
            </header>
            <ul className="tier-cards">
              {tier.models.map((model) => (
                <TierCard key={model.familyKey} model={model} />
              ))}
            </ul>
          </section>
        ),
      )}

      {rest && rest.models.length > 0 ? (
        <details className="tier-rest">
          <summary>
            其他 {rest.models.length} 个模型家族（{rangeLabel(rest)}）
          </summary>
          <ul className="tier-rest-list">
            {rest.models.map((model) => (
              <li key={model.familyKey}>
                <span>{model.family}</span>
                <span className="num">{formatNumber(model.score)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="directory-footnote">
        梯队按每个模型家族最高分的设置计算：与榜首差距每 {TIER_STEP} 分一档。综合分来自
        Artificial Analysis Intelligence Index，相邻分数常常相差不到 1 分，所以不给精确名次。混合单价按输入 3 : 输出 1 计算（美元 / 百万 token），推理强度越高，实际用掉的 token 越多。热门标记来自 OpenRouter 近 7 天使用排行前 20。
      </p>
    </div>
  );
}
