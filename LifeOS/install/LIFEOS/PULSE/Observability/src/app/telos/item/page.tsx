"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTelosData } from "../_v7/use-telos-data";
import type { Telos } from "../_v7/data";

// Per-item detail page. One static route (/telos/item) reads ?id=<ID> from the
// query — static-export safe, no generateStaticParams needed. Reuses the same
// useTelosData hook the dashboard uses, finds the item across every primitive
// array, and renders its fields plus relationships as links to other items.

interface Relation {
  label: string;
  ids: readonly string[];
}

interface ItemDetail {
  kind: string;
  id: string;
  title: string;
  summary?: string;
  body?: string;
  facts: Array<{ k: string; v: string }>;
  relations: Relation[];
}

function findItem(telos: Telos, id: string): ItemDetail | null {
  const d = telos.dimensions.find((x) => x.id === id);
  if (d)
    return {
      kind: "理想状态",
      id,
      title: d.label,
      facts: [
        { k: "当前", v: String(d.cur) },
        { k: "理想", v: String(d.ideal) },
        { k: "速度", v: `${d.velo}/月` },
      ],
      relations: [],
    };

  const p = telos.problems.find((x) => x.id === id);
  if (p)
    return {
      kind: "问题",
      id,
      title: p.title,
      summary: p.summary,
      body: p.note,
      facts: [{ k: "严重度", v: p.severity }],
      relations: [{ label: "影响", ids: p.affects }],
    };

  const m = telos.missions.find((x) => x.id === id);
  if (m)
    return {
      kind: "使命",
      id,
      title: m.title,
      summary: m.summary,
      facts: [{ k: "视野", v: m.horizon }],
      relations: [{ label: "应对", ids: m.addresses ?? [] }],
    };

  const g = telos.goals.find((x) => x.id === id);
  if (g)
    return {
      kind: "目标",
      id,
      title: g.title,
      summary: g.summary,
      facts: [
        { k: "指标", v: g.kpi },
        { k: "目标值", v: g.target },
        { k: "进度", v: `${g.pct}%` },
      ],
      relations: [
        { label: "维度", ids: g.dims },
        { label: "指标", ids: g.metrics },
      ],
    };

  const mt = telos.metrics.find((x) => x.id === id);
  if (mt)
    return {
      kind: "指标",
      id,
      title: mt.label,
      facts: [
        { k: "数值", v: `${mt.value}${mt.unit}` },
        { k: "趋势", v: String(mt.trend) },
      ],
      relations: [{ label: "服务于", ids: mt.feeds }],
    };

  const c = telos.challenges.find((x) => x.id === id);
  if (c)
    return {
      kind: "挑战",
      id,
      title: c.title,
      summary: c.summary,
      body: c.note,
      facts: [],
      relations: [{ label: "阻碍", ids: c.blocks }],
    };

  const s = telos.strategies.find((x) => x.id === id);
  if (s)
    return {
      kind: "策略",
      id,
      title: s.title,
      summary: s.summary,
      facts: [],
      relations: [
        { label: "克服", ids: s.overcomes },
        { label: "实施", ids: s.implements },
      ],
    };

  const pr = telos.projects.find((x) => x.id === id);
  if (pr)
    return {
      kind: "项目",
      id,
      title: pr.title,
      facts: [{ k: "状态", v: pr.status }],
      relations: [
        { label: "策略", ids: [pr.strategy] },
        { label: "维度", ids: pr.dims },
        { label: "工作", ids: pr.work.map((w) => w.id) },
      ],
    };

  for (const proj of telos.projects) {
    const w = proj.work.find((x) => x.id === id);
    if (w)
      return {
        kind: "工作",
        id,
        title: w.title,
        facts: [
          { k: "状态", v: w.status },
          { k: "预计完成", v: w.eta },
          { k: "负责人", v: w.owner },
        ],
        relations: [
          { label: "策略", ids: [w.strategy] },
          { label: "项目", ids: [proj.id] },
        ],
      };
  }

  const t = telos.team.find((x) => x.id === id);
  if (t)
    return {
      kind: "团队",
      id,
      title: t.name,
      body: t.note,
      facts: [
        { k: "角色", v: t.role },
        { k: "类型", v: t.kind },
      ],
      relations: [{ label: "负责", ids: t.owns }],
    };

  const b = telos.budget.find((x) => x.id === id);
  if (b)
    return {
      kind: "预算",
      id,
      title: b.label,
      body: b.note,
      facts: [
        { k: "类型", v: b.kind },
        { k: "数值", v: b.value },
        { k: "占比", v: b.of },
        { k: "百分比", v: `${b.pct}%` },
      ],
      relations: [{ label: "资助", ids: b.funds }],
    };

  const r = telos.recommendations.find((x) => x.id === id);
  if (r)
    return {
      kind: "建议",
      id,
      title: r.action,
      body: r.because,
      facts: [
        { k: "投入", v: r.effort },
        { k: "影响", v: r.impact },
      ],
      relations: [{ label: "上游", ids: r.upstream }],
    };

  return null;
}

function titleFor(telos: Telos, id: string): string {
  const hit = findItem(telos, id);
  return hit ? `${id} · ${hit.title}` : id;
}

function ItemView() {
  const sp = useSearchParams();
  const id = sp.get("id") ?? "";
  const { telos } = useTelosData();

  const item = telos ? findItem(telos, id) : null;

  return (
    <main className="telos-item">
      <nav className="telos-item-nav">
        <Link href="/telos" className="telos-item-back">← TELOS</Link>
      </nav>

      {!item ? (
        <div className="telos-item-empty">
          <p>
            未找到 id 为 <span className="mono">{id || "(无)"}</span> 的 TELOS 条目。
          </p>
          <Link href="/telos" className="telos-item-back">返回 TELOS</Link>
        </div>
      ) : (
        <article className="telos-item-card">
          <div className="telos-item-eyebrow">{item.kind}</div>
          <h1 className="telos-item-title">
            <span className="mono telos-item-id">{item.id}</span>
            {item.title}
          </h1>
          {item.summary && <p className="telos-item-summary">{item.summary}</p>}
          {item.body && <p className="telos-item-body">{item.body}</p>}

          {item.facts.length > 0 && (
            <dl className="telos-item-facts">
              {item.facts.map((f) => (
                <div key={f.k} className="telos-item-fact">
                  <dt>{f.k}</dt>
                  <dd className="mono">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {telos && item.relations.some((r) => r.ids.length > 0) && (
            <div className="telos-item-relations">
              {item.relations
                .filter((r) => r.ids.length > 0)
                .map((r) => (
                  <div key={r.label} className="telos-item-rel">
                    <span className="telos-item-rel-label">{r.label}</span>
                    <div className="telos-item-rel-chips">
                      {r.ids.map((rid) => (
                        <Link
                          key={rid}
                          href={`/telos/item?id=${encodeURIComponent(rid)}`}
                          className="telos-item-chip"
                        >
                          {titleFor(telos, rid)}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </article>
      )}
    </main>
  );
}

export default function TelosItemPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "var(--ink-1)" }}>加载中…</div>}>
      <ItemView />
    </Suspense>
  );
}
