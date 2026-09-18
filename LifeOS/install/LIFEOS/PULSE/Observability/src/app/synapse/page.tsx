"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { wikiPageUrl } from "@/lib/wiki-links";
import {
  Share2,
  ArrowRight,
  Library,
  Table2,
  Bookmark,
  Database,
  GitBranch,
  CircleDot,
  Sparkles,
  Radio,
  BarChart3,
  BookOpen,
  FileText,
  CircleCheck,
  Film,
  MessageCircle,
  ScrollText,
  StickyNote,
  Wrench,
  FolderGit2,
  Mail,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import {
  PageShell,
  PageHeader,
  Panel,
  StatTile,
  TabBar,
  Pill,
  dimStyle,
  type Dim,
  type TabSpec,
} from "@/components/ui/chrome";

/**
 * Synapse tab — the input router (capture → journal → grade → route), made visible.
 *
 * Three tabs, stream-first:
 *   STREAM (default) — unified reverse-chron feed of new content from ALL
 *     sources (ledger captures, Knowledge notes, X-bookmark issues), origin
 *     filters, 60s auto-refresh.
 *   STATS  — the live numbers: tiles, knowledge by type, ledger by source,
 *     spreadsheet paths.
 *   SYSTEM — the documentation: the five-stage loop, the input catalog, and
 *     how this page gets its numbers.
 *
 * Holds ZERO data: everything comes from /api/synapse (the Pulse synapse module),
 * which composes the ledger worker, KNOWLEDGE scan, KV bookmark count, and
 * local _X state server-side. No secrets ever reach this bundle.
 */

interface RecentCapture {
  id: string;
  source: string;
  score: number | null;
  title: string | null;
  url: string | null;
  author: string | null;
  content_kind: string;
  excerpt: string | null;
  grade_version: string | null;
  routed_actions: string[] | null;
  captured_at: string;
  status: string;
  note: { category: string; slug: string } | null;
}
interface RecentNote {
  title: string;
  category: string;
  slug: string;
  type: string;
  created: string;
}
interface RecentIssue {
  issue: number;
  url: string;
  created_at: string;
}
interface SynapseInput {
  n: number;
  name: string;
  trigger: string;
  component: string;
  status: "live" | "roadmap";
  ledger_count: number | null;
}
interface SheetPath { name: string; count: number | null; note: string }
interface SynapseData {
  generated_at: string;
  ledger: {
    total: number;
    by_source: Record<string, number>;
    by_status: Record<string, number>;
    captured: number;
    routed: number;
    recent: RecentCapture[];
  } | null;
  knowledge: {
    total: number;
    last7d: number;
    last30d: number;
    amber_promoted: number;
    by_type: Record<string, { total: number; last7d: number; last30d: number }>;
    recent: RecentNote[];
  } | null;
  bookmarks: {
    cloud_parsed: number | null;
    local_seen: number;
    issues_created: number;
    issues_skipped: number;
    recent_issues: RecentIssue[];
  };
  sheet: { paths: SheetPath[] };
  inputs: SynapseInput[];
  errors: Record<string, string> | null;
}

type TabId = "stream" | "stats" | "system";
const TABS: TabSpec<TabId>[] = [
  { id: "stream", label: "流", icon: Radio, dim: "money" },
  { id: "stats", label: "统计", icon: BarChart3, dim: "money" },
  { id: "system", label: "系统", icon: BookOpen, dim: "money" },
];

type StreamKind = "capture" | "note" | "issue";
interface StreamItem {
  kind: StreamKind;
  id: string; // capture uuid, note slug, or issue url — unique key + expand anchor
  origin: string; // ledger source, "knowledge", or "x-bookmarks"
  title: string;
  href: string | null; // external link
  internal: string | null; // in-Pulse link (knowledge wiki)
  contentKind: string | null; // article|video|tweet|paper|note|tool|project|newsletter|other (captures only)
  author: string | null;
  excerpt: string | null;
  gradeVersion: string | null;
  actions: string[] | null; // routed_actions — where routing actually sent it
  status: string | null; // captured | graded | routed (captures only)
  score: number | null;
  routed: boolean;
  note: { category: string; slug: string } | null;
  ts: string;
}

const REFRESH_MS = 60_000;

function ago(ts: string | null | undefined): string {
  if (!ts) return "—";
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}秒前`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}小时前` : `${Math.round(h / 24)}天前`;
}

const nf = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString());

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Synapse's own hue (money token) marks captures; notes ride the ok token, issues the relationships token.
const KIND_DIM: Record<StreamKind, Dim> = {
  capture: "money",
  note: "ok",
  issue: "relationships",
};

// One icon per ledger content_kind — the at-a-glance "what is this" signal.
const CONTENT_KIND_ICON: Record<string, LucideIcon> = {
  article: FileText,
  video: Film,
  tweet: MessageCircle,
  paper: ScrollText,
  note: StickyNote,
  tool: Wrench,
  project: FolderGit2,
  newsletter: Mail,
  other: CircleDot,
};

// routed_actions values → human labels + tint. Unknown actions prettify from snake_case.
const ACTION_META: Record<string, { label: string; dim: Dim }> = {
  create_knowledge_idea_entry: { label: "knowledge idea", dim: "ok" },
  create_knowledge_research_entry: { label: "knowledge research", dim: "ok" },
  create_work_issue: { label: "work issue", dim: "relationships" },
  create_blog_seed: { label: "blog seed", dim: "creative" },
  add_feed_source: { label: "feed source", dim: "freedom" },
  send_to_newsletter_sheet: { label: "newsletter sheet", dim: "freedom" },
};
function actionMeta(a: string): { label: string; dim: Dim } {
  return ACTION_META[a] ?? { label: a.replace(/_/g, " "), dim: "neutral" };
}

// Score bands: what routing considers worth acting on reads green, the middle amber, the rest muted.
function scoreDim(score: number): Dim {
  return score >= 8 ? "ok" : score >= 5 ? "warn" : "neutral";
}

/** The capture lifecycle as a 3-segment track: captured → graded → routed.
 *  Filled segments show how far the item got; the next segment pulses while
 *  the 30-min router hasn't picked it up yet. */
function LifecycleTrack({ status, score }: { status: string; score: number | null }) {
  const stage = status === "routed" ? 3 : status === "graded" || score !== null ? 2 : 1;
  const segs: { dim: Dim; label: string }[] = [
    { dim: "money", label: "captured" },
    { dim: "relationships", label: "graded" },
    { dim: "ok", label: "routed" },
  ];
  return (
    <span
      className="inline-flex items-center gap-[3px] shrink-0"
      title={`${segs[stage - 1].label} — captured → graded → routed`}
    >
      {segs.map((s, i) => (
        <span
          key={s.label}
          className={i === stage ? "w-3 h-[5px] rounded-full animate-pulse" : "w-3 h-[5px] rounded-full"}
          style={{
            background: i < stage ? `var(--${s.dim === "ok" ? "ok" : s.dim})` : "rgba(168,165,200,0.18)",
            opacity: i < stage ? 0.9 : 1,
          }}
        />
      ))}
    </span>
  );
}

// The five-stage loop, rendered as a horizontal flow with live counts.
function FlowStage({ name, desc, count, dim }: { name: string; desc: string; count?: string; dim: Dim }) {
  return (
    <div className="flex-1 min-w-[150px] rounded-lg p-3" style={dimStyle(dim, true)}>
      <div className="text-[12px] font-semibold tracking-[0.12em] uppercase">{name}</div>
      <div className="text-[11px] text-ink-3 mt-1 leading-snug">{desc}</div>
      {count && <div className="text-lg font-semibold text-ink-1 mt-1.5 tabular-nums">{count}</div>}
    </div>
  );
}

export default function SynapsePage() {
  const [data, setData] = useState<SynapseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("stream");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<"all" | "waiting" | "routed">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    fetch("/api/synapse")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setData(d);
        setError(null);
        setFetchedAt(Date.now());
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Initial load + 60s auto-refresh (module cache is 60s, so this is cheap).
  useEffect(() => {
    load();
    timer.current = setInterval(() => {
      load();
      forceTick((n) => n + 1); // re-render ages even if payload is cache-identical
    }, REFRESH_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  // Hash deep-links: /synapse#stats, /synapse#system. Read once on mount.
  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "stats" || h === "system" || h === "stream") setTab(h as TabId);
  }, []);
  const switchTab = (t: TabId) => {
    setTab(t);
    window.history.replaceState(null, "", t === "stream" ? window.location.pathname : `#${t}`);
  };

  const L = data?.ledger;
  const K = data?.knowledge;
  const B = data?.bookmarks;
  const sourceEntries = Object.entries(L?.by_source ?? {}).sort((a, b) => b[1] - a[1]);

  // ── Unified stream: captures + notes + issues, merged reverse-chron ──
  const stream = useMemo<StreamItem[]>(() => {
    if (!data) return [];
    const items: StreamItem[] = [];
    const promotedSlugs = new Set<string>();
    for (const c of data.ledger?.recent ?? []) {
      if (c.note) promotedSlugs.add(c.note.slug);
      items.push({
        kind: "capture",
        id: c.id,
        origin: c.source,
        title: c.title || c.url || "(text note)",
        href: c.url,
        internal: null,
        contentKind: c.content_kind || "other",
        author: c.author,
        excerpt: c.excerpt,
        gradeVersion: c.grade_version,
        actions: c.routed_actions,
        status: c.status,
        score: c.score,
        routed: c.status === "routed",
        note: c.note,
        ts: c.captured_at,
      });
    }
    for (const n of data.knowledge?.recent ?? []) {
      // A promoted note already rides on its capture row — don't show it twice.
      if (promotedSlugs.has(n.slug)) continue;
      items.push({
        kind: "note",
        id: `note:${n.category}/${n.slug}`,
        origin: "knowledge",
        title: n.title,
        href: null,
        internal: wikiPageUrl(encodeURIComponent(n.category), encodeURIComponent(n.slug)),
        contentKind: null,
        author: null,
        excerpt: null,
        gradeVersion: null,
        actions: null,
        status: null,
        score: null,
        routed: false,
        note: null,
        ts: n.created,
      });
    }
    for (const i of data.bookmarks?.recent_issues ?? []) {
      items.push({
        kind: "issue",
        id: `issue:${i.issue}`,
        origin: "x-bookmarks",
        title: `X bookmark → work issue #${i.issue}`,
        href: i.url,
        internal: null,
        contentKind: null,
        author: null,
        excerpt: null,
        gradeVersion: null,
        actions: null,
        status: null,
        score: null,
        routed: false,
        note: null,
        ts: i.created_at,
      });
    }
    return items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }, [data]);

  const origins = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of stream) counts.set(it.origin, (counts.get(it.origin) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [stream]);

  const visible = stream.filter((i) => {
    if (originFilter !== "all" && i.origin !== originFilter) return false;
    if (stateFilter === "waiting") return i.kind === "capture" && !i.routed;
    if (stateFilter === "routed") return i.kind === "capture" && i.routed;
    return true;
  });

  return (
    <PageShell className="max-w-[1200px]">
      {/* ── Header ── */}
      <PageHeader
        icon={Share2}
        title={
          <span className="flex items-center gap-3">
            Synapse
            <Pill dim="money">input router</Pill>
          </span>
        }
        subtitle="一个入口进，正确的家出 — 捕捉 → 琥珀账本 → 评分 → 路由 → 再浮现。"
      />

      {/* ── Tab bar ── */}
      <TabBar
        tabs={TABS}
        active={tab}
        onChange={switchTab}
        right={
          <div className="flex items-center gap-2 text-[11px] text-ink-3">
            <span
              className={error ? "inline-block w-1.5 h-1.5 rounded-full" : "inline-block w-1.5 h-1.5 rounded-full animate-pulse"}
              style={{ background: error ? "var(--err)" : "var(--ok)" }}
            />
            <span className="whitespace-nowrap">
              {error ? "离线" : fetchedAt ? `更新于 ${ago(new Date(fetchedAt).toISOString())} · 自动 60 秒` : "加载中…"}
            </span>
          </div>
        }
      />

      {error && <div className="text-warn text-sm">无法连接 Synapse API：{error}</div>}
      {!data && !error && <div className="text-ink-3 text-sm">加载中…</div>}

      {/* ════ STREAM ════ */}
      {data && tab === "stream" && (
        <>
          {/* Compact stat strip */}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12px] text-ink-3">
            <span><span className="text-ink-1 tabular-nums font-medium">{nf(L?.total ?? null)}</span> 已保留</span>
            <span><span className="text-ink-1 tabular-nums font-medium">{nf(L?.routed ?? 0)}</span> 已路由 · <span className="text-ink-1 tabular-nums font-medium">{nf(L?.captured ?? 0)}</span> 等待中</span>
            <span><span className="text-ink-1 tabular-nums font-medium">{nf(K?.last7d ?? null)}</span> 笔记 / 7天</span>
            <span><span className="text-ink-1 tabular-nums font-medium">{nf(B?.cloud_parsed ?? null)}</span> 书签 / 90天</span>
          </div>

          {/* Origin + state filter chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setOriginFilter("all")}
              className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
              style={dimStyle("money", originFilter === "all")}
            >
              全部 <span className="tabular-nums opacity-70">{stream.length}</span>
            </button>
            {origins.map(([o, n]) => (
              <button
                key={o}
                onClick={() => setOriginFilter(originFilter === o ? "all" : o)}
                className="text-[11px] px-2.5 py-1 rounded-full mono transition-colors"
                style={dimStyle("money", originFilter === o)}
              >
                {o} <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
            <span className="w-px h-4 bg-line-2 mx-1" />
            {(["waiting", "routed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStateFilter(stateFilter === s ? "all" : s)}
                className="text-[11px] px-2.5 py-1 rounded-full transition-colors"
                style={dimStyle(s === "routed" ? "ok" : "warn", stateFilter === s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* The feed */}
          <Panel className="p-0 divide-y divide-line-1 overflow-hidden">
            {visible.length === 0 && <div className="p-4 text-sm text-ink-3">还没有捕获。</div>}
            {visible.map((it) => {
              const KindIcon =
                it.kind === "note" ? Library : it.kind === "issue" ? Bookmark : CONTENT_KIND_ICON[it.contentKind ?? "other"] ?? CircleDot;
              const domain = domainOf(it.href);
              const isOpen = expanded === it.id;
              const expandable = it.kind === "capture";
              const titleLink = it.href ?? it.internal;
              return (
                <div key={it.id} className={isOpen ? "bg-surface-3" : "transition-colors hover:bg-surface-3"}>
                  {/* ── Row ── */}
                  <div
                    className={expandable ? "flex items-center gap-3 px-4 py-2.5 min-w-0 cursor-pointer select-none" : "flex items-center gap-3 px-4 py-2.5 min-w-0"}
                    onClick={expandable ? () => setExpanded(isOpen ? null : it.id) : undefined}
                  >
                    {/* kind badge */}
                    <span
                      className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                      style={dimStyle(KIND_DIM[it.kind], true)}
                      title={it.kind === "capture" ? `${it.contentKind} 捕获` : it.kind}
                    >
                      <KindIcon className="w-3.5 h-3.5" />
                    </span>

                    {/* title + meta, two lines */}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm text-ink-1 leading-tight">
                        {titleLink ? (
                          <a
                            href={titleLink}
                            target={it.href ? "_blank" : undefined}
                            rel={it.href ? "noreferrer" : undefined}
                            className="hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {it.title}
                          </a>
                        ) : (
                          it.title
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-ink-3 mt-0.5 min-w-0 overflow-hidden whitespace-nowrap">
                        <span className="mono shrink-0">{it.origin}</span>
                        {it.contentKind && it.contentKind !== "other" && (
                          <><span className="opacity-50">·</span><span className="shrink-0">{it.contentKind}</span></>
                        )}
                        {domain && <><span className="opacity-50">·</span><span className="truncate">{domain}</span></>}
                        {it.author && <><span className="opacity-50">·</span><span className="truncate">{it.author}</span></>}
                        {/* routing destinations, inline */}
                        {(it.actions?.length ?? 0) > 0 &&
                          it.actions!.map((a) => {
                            const m = actionMeta(a);
                            return (
                              <span key={a} className="hidden sm:inline-flex items-center gap-0.5 shrink-0 whitespace-nowrap" style={{ color: `var(--${m.dim === "neutral" ? "ink-2" : m.dim})` }}>
                                <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                                {m.label}
                              </span>
                            );
                          })}
                        {it.routed && it.actions !== null && it.actions.length === 0 && (
                          <span className="hidden sm:inline shrink-0 whitespace-nowrap opacity-70">→ 已存入琥珀账本</span>
                        )}
                      </div>
                    </div>

                    {/* note promotion */}
                    {it.note && (
                      <a
                        href={wikiPageUrl(encodeURIComponent(it.note.category), encodeURIComponent(it.note.slug))}
                        className="shrink-0 hidden sm:flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-opacity hover:opacity-80"
                        style={dimStyle("ok", true)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Library className="w-3 h-3" />
                        笔记
                      </a>
                    )}

                    {/* score */}
                    {it.score !== null && (
                      <span
                        className="shrink-0 text-[11px] tabular-nums font-medium px-1.5 py-0.5 rounded"
                        style={dimStyle(scoreDim(it.score), true)}
                        title={`按 TELOS 评分 ${it.score}/10`}
                      >
                        {it.score}
                      </span>
                    )}

                    {/* lifecycle */}
                    {it.kind === "capture" && it.status ? (
                      <LifecycleTrack status={it.status} score={it.score} />
                    ) : (
                      <span className="shrink-0 hidden md:flex items-center gap-1 text-[11px]" style={{ color: `var(--${it.kind === "note" ? "ok" : "relationships"})` }}>
                        <CircleCheck className="w-3 h-3" />
                        {it.kind === "note" ? "已策划" : "议题"}
                      </span>
                    )}

                    <span className="shrink-0 whitespace-nowrap text-[12px] text-ink-3 tabular-nums w-14 text-right">{ago(it.ts)}</span>
                    {expandable && (
                      <ChevronRight className={isOpen ? "w-3.5 h-3.5 shrink-0 text-ink-3 rotate-90 transition-transform" : "w-3.5 h-3.5 shrink-0 text-ink-3 transition-transform"} />
                    )}
                  </div>

                  {/* ── Expanded detail ── */}
                  {isOpen && (
                    <div className="px-4 pb-3.5 pl-14 flex flex-col gap-2.5 text-[12px]">
                      {it.excerpt && (
                        <p className="text-ink-2 leading-relaxed max-w-3xl border-l-2 border-line-2 pl-3">
                          {it.excerpt}
                          {it.excerpt.length >= 240 ? "…" : ""}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-ink-3">
                        <span>
                          状态{" "}
                          <span className="text-ink-1 font-medium">{it.status}</span>
                        </span>
                        <span>
                          评分{" "}
                          <span className="text-ink-1 font-medium tabular-nums">{it.score !== null ? `${it.score}/10` : "未评分"}</span>
                          {it.gradeVersion && <span className="opacity-70"> · {it.gradeVersion}</span>}
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap">
                          路由至{" "}
                          {(it.actions?.length ?? 0) > 0 ? (
                            it.actions!.map((a) => {
                              const m = actionMeta(a);
                              return (
                                <span key={a} className="px-1.5 py-0.5 rounded text-[11px]" style={dimStyle(m.dim, true)}>
                                  {m.label}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-ink-2">{it.routed ? "无处可去 — 已存入琥珀账本（操作栏下方）" : "尚未路由"}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-ink-3">
                        <span className="mono text-[11px] opacity-70">{it.id}</span>
                        {it.href && (
                          <a href={it.href} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-ink-1" onClick={(e) => e.stopPropagation()}>
                            <ExternalLink className="w-3 h-3" /> 打开来源
                          </a>
                        )}
                        {it.note && (
                          <a
                            href={wikiPageUrl(encodeURIComponent(it.note.category), encodeURIComponent(it.note.slug))}
                            className="flex items-center gap-1 hover:text-ink-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Library className="w-3 h-3" /> 打开知识笔记
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Panel>
          <p className="text-[12px] text-ink-3">
            合并自三个实时源：账本捕捉（最近 50 条）、Knowledge Archive 笔记（30 天）与 X 书签工作
            问题（30 天）。没有逐条记录的路径（浏览器快捷键 → 表格）无法在此显示 — 原因见“系统”。
          </p>
        </>
      )}

      {/* ════ STATS ════ */}
      {data && tab === "stats" && (
        <>
          {/* ── What each number is ── */}
          <Panel className="text-[13px] leading-relaxed text-ink-2 space-y-1.5">
            <div className="text-[11px] uppercase tracking-[0.16em] text-ink-3 mb-2">每个数字的含义</div>
            <div><span className="font-medium text-dim-money">账本</span> — 琥珀账本，Synapse 的永久存储（D1 数据库）。每次捕捉在捕获的瞬间就写入，先于任何评分。“已保留”即其行数。</div>
            <div><span className="font-medium text-ok">知识笔记</span> — Knowledge Archive 中人工策划的 Markdown 笔记（想法、研究、人物…）。磁贴统计<em>整个归档</em>中由任意流水线创建的笔记；“经 Synapse”仅统计 Synapse 从琥珀账本提升的笔记。</div>
            <div><span className="font-medium text-dim-freedom">表格</span> — summarize worker 追加的 newsletter 捕捉表。计数按已埋点路径；浏览器快捷键路径尚无计数器。</div>
            <div><span className="font-medium text-dim-relationships">X 书签</span> — 每分钟云端定时任务从 X 拉取、摘要并发送到表格的书签（滚动 90 天），以及本地 <span className="mono">tb</span> 扫描将书签转为工作问题的部分。</div>
          </Panel>

          {/* ── Stats tiles ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatTile
              icon={Database}
              label="已保留"
              value={nf(L?.total ?? null)}
              dim="money"
              sub="仅追加的 D1 账本行"
            />
            <StatTile
              icon={GitBranch}
              label="已路由 / 等待中"
              value={`${nf(L?.routed ?? 0)} / ${nf(L?.captured ?? 0)}`}
              sub="已路由到归属 / 已捕捉，尚未路由"
            />
            <StatTile
              icon={Library}
              label="知识笔记"
              value={nf(K?.last7d ?? null)}
              dim="ok"
              sub={`7 天内创建，整个归档 · 30 天：${nf(K?.last30d ?? null)} · 经 Synapse：${nf(K?.amber_promoted ?? null)}`}
            />
            <StatTile
              icon={Table2}
              label="到表格"
              value={nf((B?.cloud_parsed ?? 0) + (L?.by_source?.["surface"] ?? 0))}
              dim="freedom"
              sub="过去 90 天观测：书签定时 + Surface 保存（快捷键路径未埋点）"
            />
            <StatTile
              icon={Bookmark}
              label="X 书签"
              value={nf(B?.cloud_parsed ?? null)}
              dim="relationships"
              sub={`云端定时，过去 90 天 · 本地 tb：${nf(B?.local_seen ?? 0)} · 转为问题：${nf(B?.issues_created ?? 0)}`}
            />
          </div>

          {/* ── Knowledge base breakdown ── */}
          <div>
            <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-1">知识库 — 已保存内容</h2>
            <p className="text-[12px] text-ink-3 mb-3">
              Knowledge Archive 中由<em>所有</em>流水线创建的笔记，按类型。
              Synapse 自身的贡献是“经 Synapse”行 — {nf(K?.amber_promoted ?? 0)} 条笔记由 30 分钟路由调度器从账本提升。
            </p>
            <Panel className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-ink-3 border-b border-line-2">
                    <th className="px-4 py-2.5 font-medium">笔记类型</th>
                    <th className="px-4 py-2.5 font-medium text-right">7 天</th>
                    <th className="px-4 py-2.5 font-medium text-right">30 天</th>
                    <th className="px-4 py-2.5 font-medium text-right">全部时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-1">
                  {Object.entries(K?.by_type ?? {})
                    .sort((a, b) => b[1].last30d - a[1].last30d || b[1].total - a[1].total)
                    .map(([type, c]) => (
                      <tr key={type}>
                        <td className="px-4 py-2.5 text-ink-1">{type}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{nf(c.last7d)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{nf(c.last30d)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-3">{nf(c.total)}</td>
                      </tr>
                    ))}
                  <tr className="border-t border-line-2">
                    <td className="px-4 py-2.5 text-ok">经 Synapse 路由（所有类型）</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ok" colSpan={3}>{nf(K?.amber_promoted ?? 0)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          </div>

          {/* ── Ledger by source + sheet paths ── */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">按来源分组的账本</h2>
              <Panel className="p-0 divide-y divide-line-1">
                {sourceEntries.length === 0 && <div className="p-4 text-sm text-ink-3">暂无捕捉。</div>}
                {sourceEntries.map(([source, n]) => (
                  <div key={source} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-ink-2 mono">{source}</span>
                    <span className="text-ink-1 tabular-nums">{nf(n)}</span>
                  </div>
                ))}
              </Panel>
            </div>
            <div>
              <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">表格发送（按路径）</h2>
              <Panel className="p-0 divide-y divide-line-1">
                {data.sheet.paths.map((p) => (
                  <div key={p.name} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink-2 whitespace-nowrap">{p.name}</span>
                      <span className="text-ink-1 tabular-nums shrink-0">{nf(p.count)}</span>
                    </div>
                    <div className="text-[11px] text-ink-3 mt-1 leading-snug">{p.note}</div>
                  </div>
                ))}
              </Panel>
            </div>
          </div>
        </>
      )}

      {/* ════ SYSTEM ════ */}
      {data && tab === "system" && (
        <>
          <Panel className="text-[13px] leading-relaxed text-ink-2 max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.16em] text-ink-3 mb-2">Synapse 是什么</div>
            <p className="mb-2">
              Synapse 是输入路由：任何值得保留的东西 — 一个页面、一条推文、一句口述、一个 feed 条目 —
              被最近的输入捕获，写入琥珀账本<em>先于</em>任何判断，
              然后按 TELOS 评分并路由到有用的地方：知识笔记、工作问题、博客种子、newsletter 表格。
            </p>
            <p>
              名字即机制：突触（synapse）是带权重的传输 — 评分设定权重，路由传播通过阈值的内容。日志保留旧名：如琥珀中的昆虫，被捕捉的永不丢失，因为原始捕捉在任何判断拒绝之前就已保留。
            </p>
          </Panel>

          {/* ── The flow ── */}
          <div>
            <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">单一循环</h2>
            <div className="flex flex-wrap items-stretch gap-2 mb-3">
              <FlowStage
                name="捕捉"
                desc="8 个实时输入，3 个路线图 — 快捷键、书签、收割、语音、feed、Surface、CLI"
                count={`${data.inputs.filter((i) => i.status === "live").length} 个实时输入`}
                dim="freedom"
              />
              <div className="hidden lg:flex items-center text-ink-3"><ArrowRight className="w-4 h-4" /></div>
              <FlowStage
                name="日志"
                desc="先写入琥珀账本，再评分 — 永不丢失"
                count={nf(L?.total ?? null)}
                dim="money"
              />
              <div className="hidden lg:flex items-center text-ink-3"><ArrowRight className="w-4 h-4" /></div>
              <FlowStage
                name="评分"
                desc="按 TELOS 打分 — 这对 {{PRINCIPAL_NAME}} 正在做的事有益吗？"
                dim="relationships"
              />
              <div className="hidden lg:flex items-center text-ink-3"><ArrowRight className="w-4 h-4" /></div>
              <FlowStage
                name="路由"
                desc="分发到 KNOWLEDGE 笔记、Type:queue / Type:project 问题、博客种子、newsletter"
                count={`${nf(L?.routed ?? 0)} 已路由`}
                dim="ok"
              />
              <div className="hidden lg:flex items-center text-ink-3"><ArrowRight className="w-4 h-4" /></div>
              <FlowStage
                name="Resurface"
                desc="amber search · this page · promotion of the best rows to curated notes"
                dim="creative"
              />
            </div>
            <p className="text-[12px] text-ink-3">
              目的地：KNOWLEDGE <span className="text-ink-2">idea</span> 笔记 · 工作问题{" "}
              <span className="text-ink-2">Type:queue / Type:project</span> · newsletter 表格 · 博客种子 · feed 来源注册表。
              路由每 30 分钟自动运行（<span className="text-ink-2">com.lifeos.amberroute</span>），也可按需通过 <span className="text-ink-2">amber route</span> 触发。
            </p>
          </div>

          {/* ── Inputs catalog ── */}
          <div>
            <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">输入 — 想法被捕捉的所有方式</h2>
            <Panel className="p-0 overflow-x-auto mb-2">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.12em] text-ink-3 border-b border-line-2">
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-4 py-2.5 font-medium">输入</th>
                    <th className="px-4 py-2.5 font-medium">触发</th>
                    <th className="px-4 py-2.5 font-medium">组件</th>
                    <th className="px-4 py-2.5 font-medium text-right">账本行数</th>
                    <th className="px-4 py-2.5 font-medium text-right">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-1">
                  {data.inputs.map((i) => (
                    <tr key={i.n} className={i.status === "roadmap" ? "opacity-60" : ""}>
                      <td className="px-4 py-2.5 text-ink-3 tabular-nums">{i.n}</td>
                      <td className="px-4 py-2.5 text-ink-1">{i.name}</td>
                      <td className="px-4 py-2.5 text-ink-2">{i.trigger}</td>
                      <td className="px-4 py-2.5 text-ink-2 mono text-[12px]">{i.component}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{i.ledger_count === null ? "—" : nf(i.ledger_count)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Pill dim={i.status === "live" ? "ok" : "neutral"} className="text-[11px] uppercase tracking-wider px-2 py-0.5">
                          {i.status}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <p className="text-[12px] text-ink-3">
              “账本行数”统计 <span className="mono">source</span> 标签映射到该输入的捕捉 — 仍
              终结在表格的输入（快捷键、云端书签定时）显示“—”，直到 Phase 3 将它们接入捕捉契约。
            </p>
          </div>

          {/* ── How this page works ── */}
          <div>
            <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">本页数字的来源</h2>
            <Panel className="text-[13px] leading-relaxed text-ink-2 space-y-1.5 max-w-3xl">
              <div className="flex gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-dim-money" /><span><span className="text-ink-1">账本 worker</span> — D1 支持的琥珀账本 worker 上的 <span className="mono">/stats</span> 与 <span className="mono">/captures</span>，服务端 bearer 鉴权。</span></div>
              <div className="flex gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ok" /><span><span className="text-ink-1">Knowledge Archive</span> — <span className="mono">MEMORY/KNOWLEDGE</span> 笔记文件的 frontmatter 扫描（<span className="mono">created:</span>、<span className="mono">source_amber_id:</span>）。</span></div>
              <div className="flex gap-2"><FileText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-dim-relationships" /><span><span className="text-ink-1">X 书签</span> — 通过 Cloudflare API 获取 SEEN_BOOKMARKS KV 键计数，加上 <span className="mono">tb</span> 扫描与问题创建的本地 <span className="mono">_X</span> 状态文件。</span></div>
              <div className="pt-1">
                所有内容均由 Pulse <span className="mono">synapse</span> 模块在服务端组合（60 秒缓存）；无
                密钥到达浏览器。每个数字都是对实际运行情况的实时探测 — 未埋点路径
                会标注，绝不估算。
              </div>
            </Panel>
          </div>
        </>
      )}

      {data && (
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <Sparkles className="w-3 h-3" />
          <span>
            生成于 {ago(data.generated_at)} · 60 秒缓存
            {data.errors ? ` · 降级探针：${Object.keys(data.errors).join(", ")}` : ""}
          </span>
        </div>
      )}
    </PageShell>
  );
}
