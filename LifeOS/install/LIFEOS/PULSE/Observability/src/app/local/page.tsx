"use client";

// HERO: selecting a section tints the whole view in that section's dim color —
// the date rails, group headers, and list markers shift with it.

import { useEffect, useState, useCallback } from "react";
import {
  Building2,
  Shield,
  Briefcase,
  Users,
  ScrollText,
  Vote,
  Gavel,
  Newspaper,
  LayoutGrid,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { PageShell, PageHeader, Panel, Pill, TabBar, EmptyState, dimStyle, type Dim, type TabSpec } from "@/components/ui/chrome";

type SourceStatus = "ok" | "unavailable" | "empty";
type Item = { title: string; source: string; url: string; date: string; summary?: string };
type FetchResult = { items: Item[]; source_status: SourceStatus; errors?: string[] };

interface Digest {
  meta: {
    city: string;
    state: string;
    county?: string;
    zip?: string;
    generated_at: string;
    sources_used: string[];
    sources_failed: string[];
    errors: string[];
  };
  construction: FetchResult;
  crime: FetchResult;
  business: FetchResult;
  officials: FetchResult;
  legislation: FetchResult;
  elections: FetchResult;
  arrests: FetchResult;
  news: FetchResult;
}

type SectionKey =
  | "construction"
  | "crime"
  | "business"
  | "officials"
  | "legislation"
  | "elections"
  | "arrests"
  | "news";

type HistoryItem = Item & { digest_date: string };

interface History {
  range: string;
  window_days: number;
  days_covered: number;
  first_date: string | null;
  last_date: string | null;
  city: string | null;
  state: string | null;
  sections: Record<SectionKey, { items: HistoryItem[]; days_with_data: number }>;
}

type Range = "day" | "week" | "month" | "year";
type SectionTab = "all" | SectionKey;

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "日" },
  { id: "week", label: "周" },
  { id: "month", label: "月" },
  { id: "year", label: "年" },
];

interface SectionDef {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  dim: Dim;
  emptyHint: string;
}

const SECTIONS: SectionDef[] = [
  { key: "construction", label: "建设", icon: Building2, dim: "money", emptyHint: "此时间窗口内无新建筑许可。" },
  { key: "crime", label: "治安", icon: Shield, dim: "err", emptyHint: "此时间窗口内无新治安统计。" },
  { key: "business", label: "新商业", icon: Briefcase, dim: "ok", emptyHint: "此时间窗口内无新开业商家。" },
  { key: "officials", label: "官员动态", icon: Users, dim: "blue", emptyHint: "此时间窗口内无官员动态。" },
  { key: "legislation", label: "立法", icon: ScrollText, dim: "relationships", emptyHint: "此时间窗口内无待审或已颁布法规。" },
  { key: "elections", label: "选举", icon: Vote, dim: "freedom", emptyHint: "暂无即将举行的选举。" },
  { key: "arrests", label: "逮捕", icon: Gavel, dim: "warn", emptyHint: "此时间窗口内无新逮捕报告。" },
  { key: "news", label: "本地新闻", icon: Newspaper, dim: "rhythms", emptyHint: "此时间窗口内无本地新闻。" },
];

const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<SectionKey, SectionDef>;

const STALE_AFTER_MS = 36 * 3600 * 1000;
// The refresh includes an AI research pass for sections the fetchers can't
// cover — allow minutes, not seconds, before giving up on the poll.
const REFRESH_POLL_MS = 6 * 60_000;

function fmtRangeDate(s: string | null, windowDays: number): string {
  if (!s) return "—";
  const t = new Date(`${s}T12:00:00`);
  if (!Number.isFinite(t.getTime())) return s;
  // Windows that can span a year boundary need the year or the strip reads
  // backwards ("Jul 18 – Jul 17").
  return t.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(windowDays > 31 ? { year: "numeric" } : {}),
  });
}

function shortDate(s: string): string {
  const t = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (!Number.isFinite(t.getTime())) return s;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const ago = Math.floor((Date.now() - t) / 1000);
  // Future-dated items (bid deadlines, upcoming elections) get the absolute
  // date — a negative "-521489s ago" is a bug, not information.
  if (ago < 0) return shortDate(iso);
  if (ago < 60) return `${ago}秒前`;
  if (ago < 3600) return `${Math.floor(ago / 60)}分钟前`;
  if (ago < 86400) return `${Math.floor(ago / 3600)}小时前`;
  if (ago < 86400 * 30) return `${Math.floor(ago / 86400)}天前`;
  if (ago < 86400 * 365) return `${Math.floor(ago / (86400 * 30))}月前`;
  return `${Math.floor(ago / (86400 * 365))}年前`;
}

/* ── Segmented time picker — deliberately NOT a pill row, so "when" reads as a
   different control class than the section "what" tabs below it. ── */
function TimePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line-2 overflow-hidden">
      {RANGES.map((r, i) => {
        const active = r.id === value;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(r.id)}
            className={`px-3.5 py-1.5 text-[13px] transition-colors ${
              i > 0 ? "border-l border-line-2" : ""
            } ${active ? "font-semibold" : "font-medium text-ink-3 hover:text-ink-2"}`}
            style={
              active
                ? {
                    color: "var(--ink-1)",
                    background: "color-mix(in srgb, var(--accent-soft) 22%, transparent)",
                    boxShadow: "inset 0 -2px 0 var(--accent-soft)",
                  }
                : undefined
            }
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function RefreshButton({ refreshing, onClick }: { refreshing: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={refreshing}
      className="inline-flex items-center gap-2 rounded-md border border-line-2 hover:border-line-3 disabled:opacity-50 px-3 py-1.5 text-sm text-ink-2 transition-colors"
    >
      <RefreshCw className={refreshing ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
      {refreshing ? "调研中…" : "立即刷新"}
    </button>
  );
}

function ItemRow({
  item,
  dim,
  showAbsoluteDates,
}: {
  item: Item | HistoryItem;
  dim: Dim;
  showAbsoluteDates: boolean;
}) {
  const when = item.date || (item as HistoryItem).digest_date || "";
  return (
    <li className="group">
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block border-l-2 pl-3.5 -ml-0.5 transition-colors"
        style={{ borderColor: `color-mix(in srgb, ${dimColor(dim)} 45%, transparent)` }}
      >
        <div className="text-[14px] font-medium text-ink-1 leading-snug group-hover:text-[color:var(--accent-soft)] transition-colors">
          {item.title}
        </div>
        {item.summary ? (
          <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{item.summary}</p>
        ) : null}
        <div className="mt-1.5 text-[12px] uppercase tracking-[0.15em] text-ink-3 mono tabular-nums flex items-center gap-2">
          <span className="truncate max-w-[60%]">{item.source}</span>
          {when ? (
            <>
              <span className="text-ink-3">·</span>
              <span>{showAbsoluteDates ? shortDate(when) : relativeTime(when)}</span>
            </>
          ) : null}
        </div>
      </a>
    </li>
  );
}

function dimColor(dim: Dim): string {
  // dimStyle returns { color } for active pills — reuse that as the section hue.
  return (dimStyle(dim, true) as { color?: string }).color ?? "var(--ink-3)";
}

/* ── Compact card used in the All grid ── */
function SectionCard({
  section,
  items,
  status,
  emptyText,
  showAbsoluteDates,
  daysWithData,
  onOpen,
}: {
  section: SectionDef;
  items: (Item | HistoryItem)[];
  status?: SourceStatus;
  emptyText: string;
  showAbsoluteDates: boolean;
  daysWithData?: number;
  onOpen: () => void;
}) {
  const Icon = section.icon;
  const dotColor =
    status === "ok" ? "var(--ok)" : status === "empty" ? "var(--ink-3)" : status ? "var(--warn)" : "var(--ink-3)";
  return (
    <Panel as="section" hover className="flex flex-col">
      <header className="flex items-center justify-between mb-4">
        <button type="button" onClick={onOpen} className="cursor-pointer" title={`打开 ${section.label}`}>
          <Pill dim={section.dim}>
            <Icon className="w-3.5 h-3.5" />
            <span className="uppercase tracking-[0.16em] font-semibold">{section.label}</span>
          </Pill>
        </button>
        <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider text-ink-3 mono tabular-nums">
          {items.length > 0 ? <span>{items.length}</span> : null}
          {daysWithData != null && daysWithData > 0 ? <span>· {daysWithData}d</span> : null}
          {status ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
              <span>{status}</span>
            </div>
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-ink-2 italic">
          {status === "unavailable" ? "此城市暂无数据源。" : emptyText}
        </p>
      ) : (
        <ul className="space-y-3.5 flex-1">
          {items.slice(0, 5).map((item, i) => (
            <li key={i} className="group">
              <a href={item.url} target="_blank" rel="noreferrer" className="block">
                <div className="text-[14px] font-medium text-ink-1 leading-snug group-hover:text-[color:var(--accent-soft)] transition-colors line-clamp-2">
                  {item.title}
                </div>
                {item.summary && item.summary.toLowerCase() !== item.title.toLowerCase() ? (
                  <p className="mt-1 text-[13px] text-ink-2 leading-relaxed line-clamp-2">{item.summary}</p>
                ) : null}
                <div className="mt-1 text-[12px] uppercase tracking-[0.15em] text-ink-3 mono tabular-nums flex items-center gap-2">
                  <span className="truncate max-w-[60%]">{item.source}</span>
                  {(item.date || (item as HistoryItem).digest_date) ? (
                    <>
                      <span className="text-ink-3">·</span>
                      <span>
                        {showAbsoluteDates
                          ? shortDate(item.date || (item as HistoryItem).digest_date)
                          : relativeTime(item.date || (item as HistoryItem).digest_date)}
                      </span>
                    </>
                  ) : null}
                </div>
              </a>
            </li>
          ))}
          {items.length > 5 ? (
            <li>
              <button
                type="button"
                onClick={onOpen}
                className="text-[12px] uppercase tracking-[0.15em] mono text-ink-3 hover:text-ink-2 transition-colors"
              >
                +{items.length - 5} 条更多 →
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}

/* ── Expanded single-section view — items grouped by date for range views ── */
function SectionDetail({
  section,
  items,
  status,
  range,
}: {
  section: SectionDef;
  items: (Item | HistoryItem)[];
  status?: SourceStatus;
  range: Range;
}) {
  const Icon = section.icon;
  const hue = dimColor(section.dim);
  if (items.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={Icon}
          title={status === "unavailable" ? "此城市暂无数据源。" : section.emptyHint}
        />
      </Panel>
    );
  }

  if (range === "day") {
    return (
      <Panel as="section">
        <ul className="space-y-5">
          {items.map((item, i) => (
            <ItemRow key={i} item={item} dim={section.dim} showAbsoluteDates={false} />
          ))}
        </ul>
      </Panel>
    );
  }

  // Range views: group by the date the item entered the digest history.
  // Render cap keeps a year of dense data (hundreds of incidents) scrollable.
  const RENDER_CAP = 120;
  const capped = items.slice(0, RENDER_CAP);
  const overflow = items.length - capped.length;
  const groups = new Map<string, (Item | HistoryItem)[]>();
  for (const it of capped) {
    const d = (it as HistoryItem).digest_date || it.date || "undated";
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d)!.push(it);
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <Panel as="section">
      <div className="space-y-7">
        {overflow > 0 ? (
          <p className="text-[12px] uppercase tracking-[0.15em] text-ink-3 mono">
            显示最新 {capped.length} 条，共 {items.length} 条
          </p>
        ) : null}
        {ordered.map(([date, group]) => (
          <div key={date}>
            <div
              className="text-[12px] uppercase tracking-[0.2em] mono mb-3.5 pb-1.5 border-b"
              style={{ color: hue, borderColor: `color-mix(in srgb, ${hue} 25%, transparent)` }}
            >
              {date === "undated" ? "未标注日期" : shortDate(date)}
            </div>
            <ul className="space-y-5">
              {group.map((item, i) => (
                <ItemRow key={i} item={item} dim={section.dim} showAbsoluteDates={range !== "week"} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function LocalPage() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [history, setHistory] = useState<Partial<Record<Range, History>>>({});
  const [range, setRange] = useState<Range>("day");
  const [section, setSection] = useState<SectionTab>("all");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/local-intelligence", { cache: "no-store" });
      if (!res.ok) {
        setError(res.status === 404 ? "not-yet-generated" : `http_${res.status}`);
        setDigest(null);
        return;
      }
      const j = (await res.json()) as Digest;
      setDigest(j);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setDigest(null);
    }
  }, []);

  const loadHistory = useCallback(async (r: Exclude<Range, "day">) => {
    try {
      const res = await fetch(`/api/local-intelligence/history?range=${r}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as History;
      setHistory((h) => ({ ...h, [r]: j }));
    } catch {
      /* history is additive — the Day view still works without it */
    }
  }, []);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/local-intelligence/refresh", { method: "POST" });
      const start = Date.now();
      while (Date.now() - start < REFRESH_POLL_MS) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch("/api/local-intelligence", { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as Digest;
          if (!digest || j.meta.generated_at !== digest.meta.generated_at) {
            setDigest(j);
            setError(null);
            setHistory({}); // invalidate range caches — today's digest changed
            break;
          }
        }
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (range !== "day" && !history[range]) void loadHistory(range);
  }, [range, history, loadHistory]);

  if (error === "not-yet-generated") {
    return (
      <PageShell>
        <PageHeader title="本地" subtitle="你所在城市的市政情报摘要。" />
        <Panel className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warn mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-ink-1">尚未生成摘要。</p>
            <p className="text-sm text-ink-2 mt-1">
              首次刷新尚未完成。点击下方立即运行，或等待每日早 6 点的定时任务。
            </p>
            <div className="mt-4">
              <RefreshButton refreshing={refreshing} onClick={refreshNow} />
            </div>
          </div>
        </Panel>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <PageHeader title="本地" subtitle="你所在城市的市政情报摘要。" />
        <Panel className="text-sm text-err" style={{ borderColor: "var(--err)" }}>
          加载摘要出错：{error}
        </Panel>
      </PageShell>
    );
  }

  if (!digest) {
    return (
      <PageShell>
        <PageHeader title="本地" subtitle="你所在城市的市政情报摘要。" />
        <EmptyState title="加载中…" />
      </PageShell>
    );
  }

  const { meta } = digest;
  const totalSources = meta.sources_used.length + meta.sources_failed.length;
  const generatedMs = new Date(meta.generated_at).getTime();
  const isStale = Number.isFinite(generatedMs) && Date.now() - generatedMs > STALE_AFTER_MS;
  const hist = range === "day" ? null : history[range];

  const itemsFor = (key: SectionKey): (Item | HistoryItem)[] =>
    range === "day" ? digest[key].items : (hist?.sections?.[key]?.items ?? []);
  const statusFor = (key: SectionKey): SourceStatus | undefined =>
    range === "day" ? digest[key].source_status : undefined;

  const totalItems = SECTIONS.reduce((a, s) => a + itemsFor(s.key).length, 0);

  const sectionTabs: TabSpec<SectionTab>[] = [
    { id: "all", label: "全部", icon: LayoutGrid, dim: "blue", hint: totalItems || undefined },
    ...SECTIONS.map((s) => ({
      id: s.key as SectionTab,
      label: s.label,
      icon: s.icon,
      dim: s.dim,
      hint: itemsFor(s.key).length || undefined,
    })),
  ];

  const coverage =
    range === "day"
      ? `今日 ${totalItems} 条`
      : hist
        ? `${fmtRangeDate(hist.first_date, hist.window_days)} – ${fmtRangeDate(hist.last_date, hist.window_days)} · ${totalItems} 条 · ${hist.days_covered}/${hist.window_days} 天`
        : "加载中…";

  return (
    <PageShell>
      <PageHeader
        title="本地"
        subtitle={`${meta.city}, ${meta.state} — 市政情报摘要。`}
        actions={
          <>
            <div className="flex items-center gap-2 text-[12px] uppercase tracking-[0.15em] text-ink-3 mono">
              {meta.zip ? <span>{meta.zip}</span> : null}
              {meta.county ? (
                <>
                  <span className="text-ink-3">·</span>
                  <span>{meta.county} 县/区</span>
                </>
              ) : null}
              <span className="text-ink-3">·</span>
              <span>更新于 {relativeTime(meta.generated_at)}</span>
              <span className="text-ink-3">·</span>
              <span className="text-ink-2">
                {meta.sources_used.length}/{totalSources} 来源
              </span>
            </div>
            <RefreshButton refreshing={refreshing} onClick={refreshNow} />
          </>
        }
      />

      {isStale ? (
        <Panel className="flex items-center gap-3 py-3" style={{ borderColor: "var(--warn)" }}>
          <AlertTriangle className="w-4 h-4 text-warn shrink-0" />
          <p className="text-sm text-ink-2">
            此摘要已 <span className="text-ink-1 font-medium">{relativeTime(meta.generated_at)}</span> 未更新 —
            每日早 6 点的任务可能未执行。请检查 Assistant 标签页的 cron 面板，或立即刷新。
          </p>
        </Panel>
      ) : null}

      {/* WHEN — segmented control, visually distinct from the section pills */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <TimePicker value={range} onChange={setRange} />
        <span className="text-[12px] uppercase tracking-[0.15em] text-ink-3 mono tabular-nums">{coverage}</span>
      </div>

      {/* WHAT — section pill tabs */}
      <TabBar tabs={sectionTabs} active={section} onChange={setSection} />

      {section === "all" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {SECTIONS.map((s) => (
            <SectionCard
              key={s.key}
              section={s}
              items={itemsFor(s.key)}
              status={statusFor(s.key)}
              emptyText={range !== "day" && !hist ? "加载历史…" : s.emptyHint}
              showAbsoluteDates={range === "month" || range === "year"}
              daysWithData={range === "day" ? undefined : hist?.sections?.[s.key]?.days_with_data}
              onOpen={() => setSection(s.key)}
            />
          ))}
        </div>
      ) : (
        <SectionDetail
          section={SECTION_BY_KEY[section]}
          items={itemsFor(section)}
          status={statusFor(section)}
          range={range}
        />
      )}

      {/* Errors (day view only — history views aggregate many runs) */}
      {range === "day" && section === "all" && meta.errors.length > 0 ? (
        <details className="text-xs text-ink-3 mono">
          <summary className="cursor-pointer hover:text-ink-2 uppercase tracking-[0.18em]">
            {meta.errors.length} 个来源错误
          </summary>
          <ul className="mt-3 space-y-1 pl-4">
            {meta.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </PageShell>
  );
}
