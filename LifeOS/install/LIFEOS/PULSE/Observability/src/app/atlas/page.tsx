"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Waypoints, Boxes, Share2, AlertTriangle, Clock, Database, Lightbulb, RefreshCw } from "lucide-react";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelHeader,
  StatTile,
  TabBar,
  Pill,
  EmptyState,
  type TabSpec,
} from "@/components/ui/chrome";
import { AtlasGraph, type GNode, type GEdge } from "./AtlasGraph";

/**
 * Atlas tab — the graph-based current-state asset management system.
 *
 * GRAPH    — live d3-force graph: drag nodes, zoom/pan, hover to isolate.
 * INSIGHTS — deterministic metrics + an Inference-generated narrative across
 *            system-operation / security / interconnection, regenerated on change.
 * BROWSE   — kind → asset table with per-source observations.
 * GAPS     — auth-curation gaps + stale assets + lifecycle events.
 *
 * Holds ZERO data: /api/atlas (snapshot) + /api/atlas/insights (metrics + narrative).
 */

interface Asset extends GNode { first_observed_at: string; last_observed_at: string }
interface Obs { asset_id: number; collector: string; fresh: number; last_seen: string }
interface Payload {
  available: boolean;
  error?: string;
  snapshot_age_ms?: number;
  assets?: Asset[];
  edges?: GEdge[];
  observations?: Obs[];
  lifecycle?: Array<{ asset_id: number; event: string; at: string; detail: string }>;
  unregistered?: Array<{ canonical_key: string; display_name: string; served_by: string }>;
}
interface InsightsPayload {
  available: boolean;
  metrics?: Record<string, any>;
  narrative?: string | null;
  narrative_generated_at?: string | null;
  stale?: boolean;
  generating?: boolean;
}

type Tab = "graph" | "insights" | "browse" | "gaps";
const TABS: TabSpec<Tab>[] = [
  { id: "graph", label: "图谱", icon: Waypoints },
  { id: "insights", label: "洞察", icon: Lightbulb },
  { id: "browse", label: "浏览", icon: Boxes },
  { id: "gaps", label: "缺口", icon: AlertTriangle },
];

const GRAPH_KINDS = ["project", "worker", "domain", "target", "system", "repo", "service", "dns_record"];

// Minimal, dependency-free markdown → elements for the ## sections the narrative uses.
function Narrative({ md }: { md: string }) {
  const blocks = md.split(/\n(?=## )/);
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        const m = b.match(/^##\s+(.+)/);
        const heading = m?.[1];
        const body = heading ? b.replace(/^##\s+.+\n?/, "") : b;
        return (
          <div key={i}>
            {heading && <h3 className="text-ink-1 font-medium mb-1">{heading}</h3>}
            <p className="text-sm text-ink-2 leading-relaxed whitespace-pre-wrap">{body.trim()}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function AtlasPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("graph");
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set(["project", "worker", "domain", "target", "system"]));
  const [tableKind, setTableKind] = useState<string | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/atlas").then((r) => r.json()).then((d) => live && setData(d)).catch(() => live && setData({ available: false, error: "fetch failed" }));
    load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const loadInsights = useCallback(() => {
    fetch("/api/atlas/insights").then((r) => r.json()).then(setInsights).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab !== "insights") return;
    loadInsights();
    const t = setInterval(loadInsights, 8000); // poll while a generation may be running
    return () => clearInterval(t);
  }, [tab, loadInsights]);

  const regenerate = useCallback(() => {
    fetch("/api/atlas/insights/regenerate", { method: "POST" }).then(() => setTimeout(loadInsights, 1500));
  }, [loadInsights]);

  const assets = data?.assets ?? [];
  const edges = data?.edges ?? [];
  const observations = data?.observations ?? [];
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of assets) m.set(a.kind, (m.get(a.kind) ?? 0) + 1);
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
  }, [assets]);
  const obsByAsset = useMemo(() => {
    const m = new Map<number, Obs[]>();
    for (const o of observations) (m.get(o.asset_id) ?? m.set(o.asset_id, []).get(o.asset_id)!).push(o);
    return m;
  }, [observations]);
  const staleAssets = assets.filter((a) => a.status !== "active");
  const toggleKind = (k: string) =>
    setKindFilter((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  if (!data) return <PageShell><EmptyState icon={Waypoints} title="加载 Atlas 中…" /></PageShell>;
  if (!data.available) {
    return (
      <PageShell>
        <PageHeader title="Atlas" icon={Waypoints} subtitle="基于图谱的当前状态资产管理" />
        <EmptyState icon={Database} title="暂无快照" hint={data.error ?? "运行 atlas 同步。"} />
      </PageShell>
    );
  }

  const ageMin = Math.round((data.snapshot_age_ms ?? 0) / 60000);

  return (
    <PageShell>
      <PageHeader title="Atlas" icon={Waypoints} subtitle={`基于图谱的当前状态资产管理 · 快照 ${ageMin} 分钟前`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="资产" value={String(assets.length)} icon={Boxes} />
        <StatTile label="边" value={String(edges.filter((e) => e.status === "active").length)} icon={Share2} />
        <StatTile label="无 auth-curation" value={String(data.unregistered?.length ?? 0)} icon={AlertTriangle} />
        <StatTile label="过时" value={String(staleAssets.length)} icon={Clock} />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === "graph" && (
        <Panel>
          <PanelHeader title="资产图谱" meta="拖动节点 · 滚动缩放 · 悬停隔离其邻域" />
          <div className="flex flex-wrap gap-2 pb-3">
            {GRAPH_KINDS.map((k) => (
              <button key={k} type="button" onClick={() => toggleKind(k)} className="cursor-pointer">
                <Pill className={kindFilter.has(k) ? "" : "opacity-40"}>{k}</Pill>
              </button>
            ))}
          </div>
          <AtlasGraph nodes={assets} edges={edges} kindFilter={kindFilter} onSelect={setSelected} />
          {selected && (
            <div className="pt-3 text-sm">
              <span className="text-ink-1 font-medium">{selected.display_name}</span>
              <span className="text-ink-3"> · {selected.kind} · {selected.canonical_key}</span>
            </div>
          )}
        </Panel>
      )}

      {tab === "insights" && (
        <div className="flex flex-col gap-4">
          {insights?.metrics && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                label="已服务 worker"
                value={`${insights.metrics.worker_wiring?.served ?? "—"}/${insights.metrics.worker_wiring?.total ?? "—"}`}
                sub="domain · workers.dev · route"
              />
              <StatTile label="未接入 worker" value={String(insights.metrics.unwired_workers ?? "—")} sub="无任何调用路径" />
              <StatTile label="已策划目标" value={String(insights.metrics.curated_targets ?? "—")} sub="auth 边界已扫描" />
              <StatTile label="数据存储" value={String((insights.metrics.data_stores ?? []).reduce((s: number, d: any) => s + d.n, 0))} sub="d1 · r2 · kv" />
            </div>
          )}
          <Panel>
            <PanelHeader
              title="AI 洞察"
              meta={
                insights?.generating
                  ? "生成中…"
                  : insights?.narrative_generated_at
                    ? `生成于 ${new Date(insights.narrative_generated_at).toLocaleString()}${insights?.stale ? " · 图谱此后已变更" : ""}`
                    : "尚未生成"
              }
              actions={
                <button
                  type="button"
                  onClick={regenerate}
                  disabled={insights?.generating}
                  className="flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${insights?.generating ? "animate-spin" : ""}`} /> 重新生成
                </button>
              }
            />
            {insights?.narrative ? (
              <Narrative md={insights.narrative} />
            ) : (
              <EmptyState
                icon={Lightbulb}
                title={insights?.generating ? "生成洞察中…" : "暂无洞察"}
                hint={insights?.generating ? "正在对当前图谱运行推理。" : "点击“重新生成”运行推理。"}
              />
            )}
          </Panel>
          {insights?.metrics?.blast_zones && (
            <Panel>
              <PanelHeader title="爆炸半径区域" meta="删除这些会使最多记录孤立 — 拥有记录数" />
              <div className="text-sm">
                {insights.metrics.blast_zones.map((z: any) => (
                  <div key={z.zone} className="flex items-center justify-between border-b border-line-1 py-1">
                    <span className="text-ink-1">{z.zone}</span>
                    <span className="text-ink-3 font-mono text-xs">{z.owns} 个拥有</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === "browse" && (
        <Panel>
          <PanelHeader title="按类型分组的资产" meta="每个资产都带有按来源的观测 — 无单一真相来源" />
          <div className="flex flex-wrap gap-2 pb-3">
            {kinds.map(([k, n]) => (
              <button key={k} type="button" onClick={() => setTableKind(tableKind === k ? null : k)} className="cursor-pointer">
                <Pill className={tableKind === k ? "" : "opacity-50"}>{k} · {n}</Pill>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-3 border-b border-line-2">
                  <th className="py-1 pr-3 font-normal">资产</th>
                  <th className="py-1 pr-3 font-normal">键</th>
                  <th className="py-1 pr-3 font-normal">状态</th>
                  <th className="py-1 font-normal">观测者</th>
                </tr>
              </thead>
              <tbody>
                {assets.filter((a) => !tableKind || a.kind === tableKind).slice(0, 200).map((a) => (
                  <tr key={a.id} className="border-b border-line-1">
                    <td className="py-1 pr-3 text-ink-1">{a.display_name}</td>
                    <td className="py-1 pr-3 text-ink-3 font-mono text-xs">{a.canonical_key}</td>
                    <td className="py-1 pr-3"><span className={a.status === "active" ? "text-[color:var(--ok)]" : "text-[color:var(--warn)]"}>{a.status}</span></td>
                    <td className="py-1 text-xs text-ink-2">{(obsByAsset.get(a.id) ?? []).map((o) => `${o.collector}${o.fresh ? "" : " (gone)"}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {tab === "gaps" && (
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelHeader
              title={`无策划 auth 边界覆盖 — ${data.unregistered?.length ?? 0}`}
              meta="这些域名每小时仍会扫描卫生状况；它们只是缺少断言 auth 边界的策划目标（对静态站点正确，对带 auth 的应用是真实缺口）"
            />
            {(data.unregistered?.length ?? 0) === 0 ? (
              <EmptyState icon={AlertTriangle} title="完整覆盖" />
            ) : (
              <div className="text-sm">
                {data.unregistered!.map((u) => (
                  <div key={u.canonical_key} className="flex justify-between border-b border-line-1 py-1">
                    <span className="text-ink-1">{u.display_name}</span>
                    <span className="text-ink-3 text-xs">由 {u.served_by} 服务</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <PanelHeader title={`过时资产 — ${staleAssets.length}`} meta="曾被观测，但最近未被任何采集器看到" />
            {staleAssets.length === 0 ? (
              <EmptyState icon={Clock} title="无过时项" />
            ) : (
              <div className="text-sm">
                {staleAssets.slice(0, 60).map((a) => (
                  <div key={a.id} className="flex justify-between border-b border-line-1 py-1">
                    <span className="text-ink-1">{a.display_name} <span className="text-ink-3 text-xs">({a.kind})</span></span>
                    <span className="text-ink-3 text-xs">最后见于 {a.last_observed_at.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </PageShell>
  );
}
