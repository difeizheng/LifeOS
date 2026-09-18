"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DollarSign,
  Landmark,
  CreditCard,
  PiggyBank,
  Receipt,
  Target,
  Lock,
  TrendingUp,
  TrendingDown,
  Wallet,
  Mail,
  Globe,
  BookOpen,
  Mic,
  Briefcase,
  Home,
  Users,
  Cpu,
  Server,
  Scissors,
  Trophy,
  Sparkles,
  PieChart,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import {
  Sankey,
  Rectangle,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { FreshnessIndicator, type FreshnessData } from "@/components/FreshnessIndicator";
import EmptyStateGuide from "@/components/EmptyStateGuide";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelHeader,
  StatTile,
  TabBar,
  Pill,
  type Dim,
  type TabSpec,
} from "@/components/ui/chrome";

// ─── Types matching /api/life/finances v2 envelope ───

interface Section {
  heading: string;
  body: string;
}
interface Stream {
  label: string;
  annual: number;
}

interface ResolvedLine {
  id: string;
  name: string;
  scope: string;
  monthly_usd: number;
  annual_usd: number;
  source: "collector" | "manual" | "unconfigured";
  cadence: string;
  tags?: string[];
  notes?: string;
  collector?: string;
}

interface TrendPoint {
  month: string;
  income: number;
  outbound: number;
  net: number;
}

interface InsightLine {
  display: string;
  monthly_usd: number;
  annual_usd: number;
  observed_usd: number;
  cadence: string;
  confidence: "high" | "medium" | "low";
  scope: string;
  tags: string[];
  active_months: number;
  charge_count: number;
  last_seen: string;
  reason?: string;
}

interface SpendInsights {
  top_bills: InsightLine[];
  top_ai_services: InsightLine[];
  top_infrastructure_services: InsightLine[];
  cut_candidates: InsightLine[];
  by_category: { category: string; annual_usd: number; merchants: number }[];
  total_annualized: number;
  statement_spend: {
    generated_at: string | null;
    record_count: number;
    jsonl_path: string;
    tool: string;
  };
}

interface FinancesDataV2 {
  version?: number;
  income?: {
    streams: Stream[];
    annual: number;
    monthly: number;
    mrr_monthly: number;
    mrr_annual: number;
  };
  outbound?: {
    vendors: ResolvedLine[];
    obligations: ResolvedLine[];
    other: ResolvedLine[];
    annual: number;
    monthly: number;
    vendors_annual: number;
    obligations_annual: number;
    other_annual: number;
  };
  overall?: {
    net_pre_tax_annual: number;
    net_pre_tax_monthly: number;
    net_post_tax_annual: number;
    net_post_tax_monthly: number;
    effective_tax_rate: number;
    trend: TrendPoint[];
  };
  collector_status?: {
    configured_vendors: number;
    active_collectors: string[];
    jsonl_path: string;
  };
  insights?: SpendInsights;
  currency?: string;
  // v1 legacy fields (still populated)
  accounts?: Section[];
  goals?: Section[];
  expenses?: Section[];
  investments?: Section[];
  taxes?: Section[];
  overview?: Section[];
  plan?: {
    present: boolean;
    flywheel: { n: number; stage: string; text: string }[];
    targets: { headers: string[]; rows: string[][] } | null;
    sections: Section[];
  };
  incomeStreams?: Stream[];
  expenseCategories?: Stream[];
  annualIncome?: number;
  annualExpenses?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  net?: number;
  freshness?: FreshnessData;
  freshness_per_card?: {
    income?: FreshnessData;
    outbound?: FreshnessData;
    overall?: FreshnessData;
    accounts?: FreshnessData;
    investments?: FreshnessData;
    taxes?: FreshnessData;
    plan?: FreshnessData;
  };
}

// ─── Formatting ───

// Deterministic symbols for the currencies LifeOS ships sample data for —
// checked first so the default ("USD" when [principal].currency is unset)
// resolves to the exact literal this page always used, independent of the
// server's ICU/locale environment. Any other ISO 4217 code falls through to
// Intl as a best-effort lookup.
// ported from public PR #1777, @takanorinishida and public PR #1801, @prafed
const CURRENCY_SYMBOL_FALLBACK: Record<string, string> = { USD: "$", JPY: "¥", EUR: "€", GBP: "£" };

function resolveCurrencySymbol(currency: string): string {
  const known = CURRENCY_SYMBOL_FALLBACK[currency.toUpperCase()];
  if (known) return known;
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

// Module-level rather than component state: fmtHero is also called from
// SankeyNode, a plain function recharts invokes directly (not a component in
// the tree), so it has no access to hooks or props threaded from FinancesPage.
// Defaults to "$" — the literal every version of this page has rendered — so
// an install with no [principal].currency configured, or a request that
// hasn't resolved yet, is byte-identical to before currency support existed.
let currencySymbol = "$";

function setCurrency(currency: string | undefined | null): void {
  currencySymbol = resolveCurrencySymbol(currency || "USD");
}

function fmtHero(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  // Threshold on magnitude, not the signed value. A negative net is a real,
  // common case here (the card renders red ink when spending exceeds income),
  // and it missed every `>=` check, falling through to the unabridged digit
  // string — "$-2,120,000" sitting next to a sibling KPI reading "$2.1M".
  // ported from public PR #1778, @takanorinishida
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${currencySymbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${sign}${currencySymbol}${Math.round(abs / 1000)}K`;
  if (abs >= 1_000) {
    const k = abs / 1000;
    return k % 1 === 0 ? `${sign}${currencySymbol}${k.toFixed(0)}K` : `${sign}${currencySymbol}${k.toFixed(1)}K`;
  }
  return `${sign}${currencySymbol}${Math.round(abs).toLocaleString()}`;
}

function fmtExact(amount: number | null | undefined): string {
  const n = Number(amount) || 0;
  return `${currencySymbol}${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtPct(rate: number | null | undefined): string {
  const n = Number(rate) || 0;
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Palette — chart color scales (kept as literals; the Sankey/line series
// coloring keys off these exact values). Semantic dimension/status/chrome
// colors elsewhere on the page come from the design tokens in globals.css. ───

const DIMENSION_PALETTE = ["#34D399", "#E0A458", "#7DD3FC", "#F87B7B", "#B794F4", "#2DD4BF"];
const SANKEY_INCOME_PALETTE = ["#34D399", "#E0A458"];
const SANKEY_OUTFLOW_PALETTE = ["#F0A35E", "#F87B7B"];

const SANKEY_COLORS: Record<string, string> = {
  "总收入": "#E0A458",
  "净额": "#7DD3FC",
  "支出": "#F87B7B",
  "供应商": "#F0A35E",
  "义务": "#F87B7B",
  "其他": "#F0A35E",
};

const INCOME_ICON: Record<string, LucideIcon> = {
  newsletter: Mail,
  podcast: Mic,
  sponsor: Mail,
  membership: Users,
  course: BookOpen,
  speaking: Mic,
  consulting: Briefcase,
  product: Globe,
};

const OUTBOUND_ICON: Record<string, LucideIcon> = {
  aws: Server,
  cloudflare: Server,
  anthropic: Cpu,
  openai: Cpu,
  elevenlabs: Cpu,
  mortgage: Home,
  property_tax: Home,
  home_insurance: Home,
  tesla_lease: TrendingDown,
  auto_insurance: TrendingDown,
  mobile_phone: Receipt,
  home_internet: Receipt,
};

function pickIcon(
  key: string,
  table: Record<string, LucideIcon>,
  fallback: LucideIcon,
): LucideIcon {
  const lower = key.toLowerCase();
  for (const k of Object.keys(table)) {
    if (lower.includes(k) || k.includes(lower)) return table[k];
  }
  return fallback;
}

function parseSubheadings(body: string): string[] {
  return body
    .split("\n")
    .filter((l) => l.startsWith("### "))
    .map((l) => l.replace(/^###\s*/, ""));
}

// ─── Shared bits ───

function KpiChip({
  label,
  value,
  tone,
  sensitive = true,
}: {
  label: string;
  value: string;
  tone: "income" | "outbound" | "net" | "neutral";
  sensitive?: boolean;
}) {
  const dim: Dim | undefined =
    tone === "income"
      ? "money"
      : tone === "outbound"
        ? "creative"
        : tone === "net"
          ? "freedom"
          : undefined;
  return (
    <StatTile
      label={label}
      dim={dim}
      value={sensitive ? <span data-sensitive>{value}</span> : value}
    />
  );
}

function SourceBadge({ source }: { source: string }) {
  return <Pill dim="rhythms">{source}</Pill>;
}

function ScopeBadge({ scope }: { scope: string }) {
  return <Pill dim="money">{scope}</Pill>;
}

function LineRow({ line, tone }: { line: ResolvedLine; tone: "income" | "outbound" }) {
  const Icon = pickIcon(
    line.id,
    tone === "income" ? INCOME_ICON : OUTBOUND_ICON,
    tone === "income" ? Wallet : Receipt,
  );
  const toneColor = tone === "income" ? "var(--money)" : "var(--creative)";
  const accentClass =
    tone === "income" ? "[border-left-color:var(--money)]" : "[border-left-color:var(--creative)]";
  return (
    <Panel className={`p-4 border-l-[3px] ${accentClass}`}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-1 shrink-0" color={toneColor} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{line.name}</span>
            <ScopeBadge scope={line.scope} />
            <SourceBadge source={line.source} />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="text-lg font-medium tabular-nums"
              style={{ color: toneColor }}
              data-sensitive
            >
              {fmtHero(line.monthly_usd)}
            </span>
            <span className="text-xs text-ink-2">/月</span>
            <span className="ml-auto text-xs tabular-nums text-ink-2" data-sensitive>
              {fmtHero(line.annual_usd)}/年
            </span>
          </div>
          {line.notes && (
            <p className="mt-1 text-[12px] line-clamp-2 text-ink-2">{line.notes}</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

function StreamCard({ stream }: { stream: Stream }) {
  const Icon = pickIcon(stream.label, INCOME_ICON, Wallet);
  return (
    <Panel className="p-4 border-l-[3px] [border-left-color:var(--money)]">
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-1 shrink-0" color="var(--money)" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium truncate block">{stream.label}</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className="text-lg font-medium tabular-nums"
              style={{ color: "var(--money)" }}
              data-sensitive
            >
              {fmtHero(stream.annual)}
            </span>
            <span className="text-xs text-ink-2">/年</span>
            <span className="ml-auto text-xs tabular-nums text-ink-2" data-sensitive>
              {fmtHero(stream.annual / 12)}/月
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ─── Hero banners ───

function IncomeHero({
  data,
  freshness,
}: {
  data: NonNullable<FinancesDataV2["income"]>;
  freshness?: FreshnessData;
}) {
  return (
    <Panel className="relative border-l-[3px] [border-left-color:var(--money)]">
      <div className="absolute top-5 right-5 md:top-6 md:right-6 z-10">
        <FreshnessIndicator freshness={freshness} />
      </div>
      <span className="text-[13px] font-medium uppercase tracking-wider text-ink-2">年度总收入</span>
      <div className="flex items-baseline gap-3 mt-1">
        <span
          className="text-5xl font-medium tabular-nums"
          style={{ color: "var(--money)", letterSpacing: "-0.02em" }}
          data-sensitive="strong"
        >
          {fmtHero(data.annual)}
        </span>
        <span className="text-sm text-ink-2" data-sensitive>
          {fmtHero(data.monthly)}/月
        </span>
      </div>
      <span className="text-sm mt-1 block text-ink-2">
        <Lock className="inline w-3 h-3 mr-1" /> 私密。切换观察者模式以模糊。
      </span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <KpiChip label="月度循环" value={fmtHero(data.mrr_monthly)} tone="income" />
        <KpiChip label="MRR 年化" value={fmtHero(data.mrr_annual)} tone="income" />
        <KpiChip label="收入来源" value={`${data.streams.length}`} tone="neutral" sensitive={false} />
        <KpiChip label="月收入" value={fmtHero(data.monthly)} tone="income" />
      </div>
    </Panel>
  );
}

function OutboundHero({
  data,
  freshness,
}: {
  data: NonNullable<FinancesDataV2["outbound"]>;
  freshness?: FreshnessData;
}) {
  return (
    <Panel className="relative border-l-[3px] [border-left-color:var(--creative)]">
      <div className="absolute top-5 right-5 md:top-6 md:right-6 z-10">
        <FreshnessIndicator freshness={freshness} />
      </div>
      <span className="text-[13px] font-medium uppercase tracking-wider text-ink-2">年度总支出</span>
      <div className="flex items-baseline gap-3 mt-1">
        <span
          className="text-5xl font-medium tabular-nums"
          style={{ color: "var(--creative)", letterSpacing: "-0.02em" }}
          data-sensitive
        >
          {fmtHero(data.annual)}
        </span>
        <span className="text-sm text-ink-2" data-sensitive>
          {fmtHero(data.monthly)}/月
        </span>
      </div>
      <span className="text-sm mt-1 block text-ink-2">
        <Lock className="inline w-3 h-3 mr-1" /> 供应商、个人义务及其他支出合计。
      </span>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <KpiChip label="供应商" value={fmtHero(data.vendors_annual)} tone="outbound" />
        <KpiChip label="义务" value={fmtHero(data.obligations_annual)} tone="outbound" />
        <KpiChip label="其他" value={fmtHero(data.other_annual)} tone="outbound" />
        <KpiChip
          label="追踪项目"
          value={`${data.vendors.length + data.obligations.length + data.other.length}`}
          tone="neutral"
          sensitive={false}
        />
      </div>
    </Panel>
  );
}

function OverallHero({
  data,
  periodView,
  freshness,
}: {
  data: NonNullable<FinancesDataV2["overall"]>;
  periodView: "monthly" | "annual";
  freshness?: FreshnessData;
}) {
  const pre = periodView === "monthly" ? data.net_pre_tax_monthly : data.net_pre_tax_annual;
  const post = periodView === "monthly" ? data.net_post_tax_monthly : data.net_post_tax_annual;
  const preColor = pre >= 0 ? "var(--freedom)" : "var(--creative)";
  return (
    <Panel className="relative border-l-[3px] [border-left-color:var(--freedom)]">
      <div className="absolute top-5 right-5 md:top-6 md:right-6 z-10">
        <FreshnessIndicator freshness={freshness} />
      </div>
      <span className="text-[13px] font-medium uppercase tracking-wider text-ink-2">
        净额（{periodView === "monthly" ? "月度" : "年度"}）
      </span>
      <div className="flex items-baseline gap-3 mt-1">
        <span
          className="text-5xl font-medium tabular-nums"
          style={{ color: preColor, letterSpacing: "-0.02em" }}
          data-sensitive
        >
          {fmtHero(pre)}
        </span>
        <span className="text-sm text-ink-2">税前</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
        <KpiChip
          label="税后净额"
          value={fmtHero(post)}
          tone={post >= 0 ? "net" : "outbound"}
        />
        <KpiChip
          label="实际税率"
          value={fmtPct(data.effective_tax_rate)}
          tone="neutral"
          sensitive={false}
        />
        <KpiChip
          label={periodView === "monthly" ? "年度税前" : "月度税前"}
          value={fmtHero(
            periodView === "monthly" ? data.net_pre_tax_annual : data.net_pre_tax_monthly,
          )}
          tone="net"
        />
        <KpiChip
          label={periodView === "monthly" ? "年度税后" : "月度税后"}
          value={fmtHero(
            periodView === "monthly" ? data.net_post_tax_annual : data.net_post_tax_monthly,
          )}
          tone="net"
        />
      </div>
    </Panel>
  );
}

// ─── Overall trend chart ───

function TrendChart({ trend }: { trend: TrendPoint[] }) {
  return (
    <Panel className="border-l-[3px] [border-left-color:var(--money)]">
      <PanelHeader icon={ArrowLeftRight} title="收入 vs 支出 — 12 个月趋势" />
      <div className="w-full h-64" data-sensitive>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line-1)" />
            <XAxis dataKey="month" stroke="var(--ink-3)" fontSize={11} />
            <YAxis
              stroke="var(--ink-3)"
              fontSize={11}
              tickFormatter={(v) => `${currencySymbol}${Math.round(v / 1000)}K`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-1)",
                border: "1px solid var(--line-1)",
                borderRadius: 8,
                color: "var(--ink-1)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-2)" }} />
            <Line type="monotone" dataKey="income" stroke="var(--money)" strokeWidth={2} dot={false} name="收入" />
            <Line type="monotone" dataKey="outbound" stroke="var(--creative)" strokeWidth={2} dot={false} name="支出" />
            <Line type="monotone" dataKey="net" stroke="var(--freedom)" strokeWidth={2} dot={false} name="净额" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[12px] mt-2 text-ink-2">
        在阶段二采集器积累历史月度数据之前，基线将保持平稳。
      </p>
    </Panel>
  );
}

// ─── Sankey ───

interface SankeyNodePayload {
  name?: string;
  category?: string;
  colorIndex?: number;
  value?: number;
}

interface SankeyNodeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: SankeyNodePayload;
}

function SankeyNode(props: SankeyNodeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  const name = payload?.name ?? "";
  const colorIndex = payload?.colorIndex ?? 0;
  const color =
    SANKEY_COLORS[name] ||
    (payload?.category === "income"
      ? SANKEY_INCOME_PALETTE[colorIndex % SANKEY_INCOME_PALETTE.length]
      : payload?.category === "outbound"
        ? SANKEY_OUTFLOW_PALETTE[colorIndex % SANKEY_OUTFLOW_PALETTE.length]
        : payload?.category === "net"
          ? DIMENSION_PALETTE[2]
        : "#6B80AB");
  const isLeft = x < 300;
  return (
    <g>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        fillOpacity={0.9}
        radius={[3, 3, 3, 3]}
      />
      <text
        x={isLeft ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={isLeft ? "end" : "start"}
        dominantBaseline="central"
        fill="var(--ink-1)"
        fontSize={12}
        fontWeight={500}
      >
        {name}
      </text>
      <text
        x={isLeft ? x - 8 : x + width + 8}
        y={y + height / 2 + 16}
        textAnchor={isLeft ? "end" : "start"}
        dominantBaseline="central"
        fill="var(--ink-2)"
        fontSize={11}
        data-sensitive
      >
        {payload?.value != null ? `${fmtHero(payload.value / 12)}/月` : ""}
      </text>
    </g>
  );
}

interface SankeyLinkProps {
  sourceX?: number;
  sourceY?: number;
  sourceControlX?: number;
  targetX?: number;
  targetY?: number;
  targetControlX?: number;
  linkWidth?: number;
  payload?: {
    source?: SankeyNodePayload;
    target?: SankeyNodePayload;
  };
}

function SankeyLink(props: SankeyLinkProps) {
  const {
    sourceX = 0,
    sourceY = 0,
    sourceControlX = 0,
    targetX = 0,
    targetY = 0,
    targetControlX = 0,
    linkWidth = 0,
    payload,
  } = props;
  const sourceName = payload?.source?.name ?? "";
  const targetName = payload?.target?.name ?? "";
  const color = SANKEY_COLORS[targetName] || SANKEY_COLORS[sourceName] || "#6B80AB";
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={color}
      strokeWidth={linkWidth}
      strokeOpacity={0.25}
    />
  );
}

interface SankeyNodeDatum {
  name: string;
  category: "income" | "outbound" | "pool" | "net";
  colorIndex?: number;
}

interface SankeyLinkDatum {
  source: number;
  target: number;
  value: number;
}

function FinancesSankey({
  incomeStreams,
  outbound,
  net,
}: {
  incomeStreams: Stream[];
  outbound: NonNullable<FinancesDataV2["outbound"]>;
  net: number;
}) {
  const data = useMemo<{ nodes: SankeyNodeDatum[]; links: SankeyLinkDatum[] }>(() => {
    const nodes: SankeyNodeDatum[] = [];
    const links: SankeyLinkDatum[] = [];
    incomeStreams.forEach((s, i) =>
      nodes.push({ name: s.label, category: "income", colorIndex: i }),
    );
    nodes.push({ name: "总收入", category: "pool" });
    const grossIdx = nodes.length - 1;
    incomeStreams.forEach((s, i) => {
      if (s.annual > 0) links.push({ source: i, target: grossIdx, value: s.annual });
    });
    nodes.push({ name: "支出", category: "pool" });
    const outboundIdx = nodes.length - 1;
    if (outbound.annual > 0)
      links.push({ source: grossIdx, target: outboundIdx, value: outbound.annual });
    if (net > 0) {
      nodes.push({ name: "净额", category: "net" });
      links.push({ source: grossIdx, target: nodes.length - 1, value: net });
    }
    if (outbound.vendors_annual > 0) {
      nodes.push({ name: "供应商", category: "outbound" });
      links.push({ source: outboundIdx, target: nodes.length - 1, value: outbound.vendors_annual });
    }
    if (outbound.obligations_annual > 0) {
      nodes.push({ name: "义务", category: "outbound" });
      links.push({
        source: outboundIdx,
        target: nodes.length - 1,
        value: outbound.obligations_annual,
      });
    }
    if (outbound.other_annual > 0) {
      nodes.push({ name: "其他", category: "outbound" });
      links.push({ source: outboundIdx, target: nodes.length - 1, value: outbound.other_annual });
    }
    return { nodes, links };
  }, [incomeStreams, outbound, net]);

  if (data.nodes.length === 0) return null;

  return (
    <Panel className="p-4">
      <div className="w-full h-[460px]" data-sensitive>
        <Sankey
          width={1200}
          height={460}
          data={data}
          node={<SankeyNode />}
          link={<SankeyLink />}
          nodePadding={50}
          margin={{ top: 20, bottom: 20, left: 100, right: 100 }}
        >
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface-1)",
              border: "1px solid var(--line-1)",
              borderRadius: 8,
              color: "var(--ink-1)",
            }}
            formatter={(v: number) => fmtExact(v)}
          />
        </Sankey>
      </div>
    </Panel>
  );
}

// ─── Tabs ───

type TabKey = "income" | "outbound" | "overall" | "plan";
const TABS: TabSpec<TabKey>[] = [
  { id: "income", label: "收入", icon: ArrowUpCircle, dim: "money", hint: "1" },
  { id: "outbound", label: "支出", icon: ArrowDownCircle, dim: "creative", hint: "2" },
  { id: "overall", label: "总览", icon: ArrowLeftRight, dim: "freedom", hint: "3" },
  { id: "plan", label: "飞轮", icon: TrendingUp, dim: "relationships", hint: "4" },
];

const PERIOD_TABS: TabSpec<"monthly" | "annual">[] = [
  { id: "monthly", label: "月度", dim: "freedom" },
  { id: "annual", label: "年度", dim: "freedom" },
];

// ─── Section renderers ───

function SectionGroup({
  title,
  items,
  icon: Icon,
  freshness,
}: {
  title: string;
  items?: Section[];
  icon: LucideIcon;
  freshness?: FreshnessData;
}) {
  if (!items || items.length === 0) return null;
  const accent =
    title === "投资" ? "var(--health)" : title === "目标" ? "var(--relationships)" : "var(--money)";
  const accentClass =
    title === "投资"
      ? "[border-left-color:var(--health)]"
      : title === "目标"
        ? "[border-left-color:var(--relationships)]"
        : "[border-left-color:var(--money)]";
  return (
    <section>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
          <Icon className="w-4 h-4" color={accent} /> {title}
        </h2>
        {freshness && <FreshnessIndicator freshness={freshness} />}
      </div>
      <div className="prob-grid">
        {items.map((item, i) => (
          <Panel key={i} className={`border-l-[3px] ${accentClass}`}>
            <h3 className="text-sm font-medium mb-1">{item.heading}</h3>
            <div
              className="text-xs whitespace-pre-wrap line-clamp-5 text-ink-2"
              data-sensitive
            >
              {item.body}
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function AccountCategory({ item }: { item: Section }) {
  const ACCOUNT_ICON: Record<string, LucideIcon> = {
    Banking: Landmark,
    "Credit Cards": CreditCard,
    "Investment Accounts": PiggyBank,
    Investments: PiggyBank,
    "Account Processing": Receipt,
  };
  const ACCOUNT_LABEL: Record<string, string> = {
    Banking: "银行",
    "Credit Cards": "信用卡",
    "Investment Accounts": "投资账户",
    Investments: "投资",
    "Account Processing": "账户处理",
  };
  const Icon = ACCOUNT_ICON[item.heading] || DollarSign;
  const displayHeading = ACCOUNT_LABEL[item.heading] ?? item.heading;
  const subs = parseSubheadings(item.body);
  return (
    <Panel className="border-l-[3px] [border-left-color:var(--money)]">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" color="var(--money)" />
        <h3 className="text-sm font-medium uppercase tracking-wider">{displayHeading}</h3>
        <span className="ml-auto text-xs text-ink-2">
          {subs.length > 0 ? `${subs.length} 项` : ""}
        </span>
      </div>
      {subs.length > 0 ? (
        <div className="space-y-2" data-sensitive>
          {subs.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: "var(--rhythms)", opacity: 0.6 }}
              />
              <span>{s}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="text-xs whitespace-pre-wrap line-clamp-5 text-ink-2"
          data-sensitive
        >
          {item.body}
        </div>
      )}
    </Panel>
  );
}

// ─── Tabs ───

function IncomeTab({ data }: { data: FinancesDataV2 }) {
  const income = data.income;
  const streams = income?.streams ?? data.incomeStreams ?? [];
  const incomeFreshness = data.freshness_per_card?.income ?? data.freshness;
  return (
    <div className="space-y-6">
      {income && <IncomeHero data={income} freshness={incomeFreshness} />}
      {streams.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" color="var(--money)" /> 收入来源
          </h2>
          <div className="prob-grid">
            {streams.map((s) => (
              <StreamCard key={s.label} stream={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OutboundSubgroup({
  title,
  icon: Icon,
  lines,
}: {
  title: string;
  icon: LucideIcon;
  lines: ResolvedLine[];
}) {
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + l.annual_usd, 0);
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
          <Icon className="w-4 h-4" color="var(--creative)" /> {title}
        </h3>
        <span className="text-xs tabular-nums text-ink-2" data-sensitive>
          {fmtHero(total / 12)}/月 · {fmtHero(total)}/年
        </span>
      </div>
      <div className="prob-grid">
        {lines.map((l) => (
          <LineRow key={l.id} line={l} tone="outbound" />
        ))}
      </div>
    </section>
  );
}

function InsightLineRow({ line, accent }: { line: InsightLine; accent: string }) {
  // Honest cadence labels — only true monthly_recurring shows /yr projection prominently.
  // observed_one_month and one_time show "$X observed (1mo)" so the user sees what we actually saw.
  const isUncertain = line.cadence === "observed_one_month" || (line.cadence === "one_time" && line.charge_count >= 2);
  const cadenceLabel =
    line.cadence === "monthly_recurring"
      ? `${line.charge_count}× / ${line.active_months}个月 · 月度`
      : line.cadence === "annual_subscription"
        ? "年度订阅"
        : line.cadence === "observed_one_month"
          ? `${line.charge_count}× / 1个月 · 仅观测`
          : "一次性";
  const confidenceColor =
    line.confidence === "high" ? "var(--health)" : line.confidence === "medium" ? "var(--money)" : "var(--ink-2)";
  return (
    <div
      className="bg-surface-2 border border-line-2 rounded-xl p-3.5 border-l-[3px]"
      style={{ borderLeftColor: accent }}
    >
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium truncate">{line.display}</span>
        <span className="text-base font-medium tabular-nums" style={{ color: accent }} data-sensitive>
          {isUncertain ? fmtHero(line.observed_usd) : fmtHero(line.annual_usd)}
          <span className="text-[12px] text-ink-2 ml-1">{isUncertain ? "观测值" : "/年"}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-[12px] text-ink-2 flex-wrap mt-1">
        {!isUncertain && line.monthly_usd > 0 && (
          <>
            <span data-sensitive>{fmtHero(line.monthly_usd)}/月</span>
            <span>·</span>
          </>
        )}
        <span>{cadenceLabel}</span>
        <span>·</span>
        <span style={{ color: confidenceColor }}>置信度: {line.confidence}</span>
        {line.tags.length > 0 && (
          <>
            <span>·</span>
            <span>{line.tags.slice(0, 3).join(" / ")}</span>
          </>
        )}
      </div>
      {line.reason && (
        <p className="text-[12px] mt-1" style={{ color: "var(--err)" }}>{line.reason}</p>
      )}
    </div>
  );
}

function InsightSection({
  title,
  icon: Icon,
  accent,
  description,
  lines,
  emptyHint,
}: {
  title: string;
  icon: LucideIcon;
  accent: string;
  description?: string;
  lines: InsightLine[];
  emptyHint: string;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
            <Icon className="w-4 h-4" color={accent} /> {title}
          </h3>
          {description && <p className="text-[12px] text-ink-2 mt-1">{description}</p>}
        </div>
        {lines.length > 0 && (
          <span className="text-xs tabular-nums text-ink-2" data-sensitive>
            {fmtHero(lines.reduce((s, l) => s + l.annual_usd, 0))}/年 · {lines.length} 项
          </span>
        )}
      </div>
      {lines.length === 0 ? (
        <Panel className="p-4">
          <p className="text-xs text-ink-2">{emptyHint}</p>
        </Panel>
      ) : (
        <div className="prob-grid">
          {lines.map((l, i) => (
            <InsightLineRow key={`${l.display}-${i}`} line={l} accent={accent} />
          ))}
        </div>
      )}
    </section>
  );
}

function CategoryBreakdown({ categories, total }: { categories: SpendInsights["by_category"]; total: number }) {
  if (categories.length === 0) return null;
  const max = Math.max(...categories.map(c => c.annual_usd), 1);
  const CATEGORY_LABEL: Record<string, string> = {
    taxes: "税", payroll: "薪资/承包商",
    ai: "AI", infrastructure: "基础设施", saas: "SaaS/订阅",
    food: "餐饮", transportation: "交通", utilities: "水电",
    entertainment: "娱乐", health: "健康", news: "新闻", shopping: "购物",
    travel: "差旅", "business-services": "商务服务", debt: "债务", advertising: "广告",
    other: "其他",
  };
  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
          <PieChart className="w-4 h-4" color="var(--relationships)" /> 分类支出
        </h3>
        <span className="text-xs tabular-nums text-ink-2" data-sensitive>{fmtHero(total)}/年 观测总计</span>
      </div>
      <Panel className="p-4">
        <div className="flex flex-col gap-2.5">
          {categories.map((c) => {
            const pct = total > 0 ? Math.round((c.annual_usd / total) * 100) : 0;
            const barPct = (c.annual_usd / max) * 100;
            return (
              <div key={c.category} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  <span className="tabular-nums text-ink-2" data-sensitive>
                    {fmtHero(c.annual_usd)}/年 · {c.merchants} 商户 · {pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-1)" }}>
                  <div
                    className="h-full"
                    style={{ width: `${barPct}%`, background: "var(--money)", opacity: 0.8 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </section>
  );
}

function SpendInsightsSection({ insights }: { insights: SpendInsights }) {
  return (
    <div className="space-y-6 pt-4" style={{ borderTop: "1px solid var(--line-1)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4" color="var(--money)" /> 支出分析
          </h2>
          <p className="text-[12px] text-ink-2 mt-1">
            来源于 <code className="text-ink-1">FINANCES/Statements/*</code> 中的对账单 CSV。
            使用 <code className="text-ink-1">bun ~/.claude/LIFEOS/USER/FINANCES/Tools/StatementAnalyzer.ts</code> 重新运行。
          </p>
        </div>
        {insights.statement_spend.generated_at && (
          <span className="text-[12px] text-ink-2">
            {insights.statement_spend.record_count} 商户 · 生成于{" "}
            {new Date(insights.statement_spend.generated_at).toLocaleDateString("zh-CN", {
              month: "short", day: "numeric", year: "numeric",
            })}
          </span>
        )}
      </div>

      <CategoryBreakdown categories={insights.by_category} total={insights.total_annualized} />

      <InsightSection
        title="主要账单"
        icon={Trophy}
        accent="var(--money)"
        description="所有来源年化支出最高（转账已排除）。"
        lines={insights.top_bills}
        emptyHint="尚无对账单汇总 — 运行 StatementAnalyzer.ts 生成。"
      />

      <InsightSection
        title="AI 服务排行"
        icon={Cpu}
        accent="var(--relationships)"
        description="AI 工具实际花费 — 按年化支出排序。"
        lines={insights.top_ai_services}
        emptyHint="暂未检测到 AI 服务。将更多 CSV 导出放入 FINANCES/Statements/ 目录。"
      />

      <InsightSection
        title="基础设施服务排行"
        icon={Server}
        accent="var(--freedom)"
        description="云、托管、开发、监控、网络。"
        lines={insights.top_infrastructure_services}
        emptyHint="暂未检测到基础设施服务。"
      />

      <InsightSection
        title="可裁减项"
        icon={Scissors}
        accent="var(--creative)"
        description="标记待审的订阅 — 一次性年费、低值循环、重叠工具。"
        lines={insights.cut_candidates}
        emptyHint="无明显可裁减项。工具栈精简（或分析器需要更多数据）。"
      />
    </div>
  );
}

function OutboundTab({ data }: { data: FinancesDataV2 }) {
  const outbound = data.outbound;
  const outboundFreshness = data.freshness_per_card?.outbound ?? data.freshness;
  if (!outbound) {
    return (
      <Panel>
        <p className="text-sm text-center text-ink-2">
          支出数据不可用。请检查{" "}
          <code className="text-ink-1">
            ~/.claude/LIFEOS/USER/FINANCES/vendors.yaml
          </code>
          。
        </p>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <OutboundHero data={outbound} freshness={outboundFreshness} />
      <OutboundSubgroup
        title="供应商与服务"
        icon={Server}
        lines={outbound.vendors}
      />
      <OutboundSubgroup
        title="个人义务"
        icon={Home}
        lines={outbound.obligations}
      />
      <OutboundSubgroup title="其他" icon={Receipt} lines={outbound.other} />
      {data.insights && <SpendInsightsSection insights={data.insights} />}
    </div>
  );
}

function OverallTab({
  data,
  periodView,
  onPeriodChange,
}: {
  data: FinancesDataV2;
  periodView: "monthly" | "annual";
  onPeriodChange: (v: "monthly" | "annual") => void;
}) {
  const overall = data.overall;
  const income = data.income;
  const outbound = data.outbound;
  if (!overall || !income || !outbound) {
    return (
      <Panel>
        <p className="text-sm text-center text-ink-2">总览数据不可用。</p>
      </Panel>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <TabBar tabs={PERIOD_TABS} active={periodView} onChange={onPeriodChange} />
      </div>
      <OverallHero
        data={overall}
        periodView={periodView}
        freshness={data.freshness_per_card?.overall ?? data.freshness}
      />
      <FinancesSankey
        incomeStreams={income.streams}
        outbound={outbound}
        net={overall.net_pre_tax_annual}
      />
      <TrendChart trend={overall.trend} />
      {data.accounts && data.accounts.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2 flex items-center gap-2">
              <Landmark className="w-4 h-4" color="var(--money)" /> 账户
            </h2>
            <FreshnessIndicator freshness={data.freshness_per_card?.accounts} />
          </div>
          <div className="prob-grid">
            {data.accounts.map((item, i) => (
              <AccountCategory key={i} item={item} />
            ))}
          </div>
        </section>
      )}
      <SectionGroup
        title="投资"
        items={data.investments}
        icon={PiggyBank}
        freshness={data.freshness_per_card?.investments}
      />
      <SectionGroup title="目标" items={data.goals} icon={Target} />
      <SectionGroup
        title="税务"
        items={data.taxes}
        icon={Receipt}
        freshness={data.freshness_per_card?.taxes}
      />
    </div>
  );
}

// ─── Plan tab (forward financial model + flywheel) ───

// Minimal inline-markdown renderer: **bold**, `- bullets`, pipe-tables, and
// paragraphs. Presentation only — every string comes from PLAN.md via the API.
function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="text-ink-1">{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function PlanBody({ body }: { body: string }) {
  const lines = body.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("|")) {
      const tbl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { tbl.push(lines[i].trim()); i++; }
      const cells = (l: string) => l.split("|").slice(1, -1).map((c) => c.replace(/\*\*/g, "").trim());
      const isSep = (l: string) => /^\|[\s|:-]+\|?$/.test(l);
      const rows = tbl.filter((l) => !isSep(l)).map(cells);
      if (rows.length) {
        const [head, ...rest] = rows;
        blocks.push(
          <div key={key++} className="overflow-x-auto my-2">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>{head.map((h, j) => (
                  <th key={j} className="text-left px-2 py-1.5 text-xs uppercase tracking-wide text-ink-2" style={{ borderBottom: "1px solid var(--line-1)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>{rest.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => (
                  <td key={ci} className="px-2 py-1.5" style={{ color: ci === 0 ? "var(--ink-1)" : "var(--ink-2)", borderBottom: "1px solid var(--line-1)" }}>{c}</td>
                ))}</tr>
              ))}</tbody>
            </table>
          </div>
        );
      }
      continue;
    }
    if (line.trim().startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("- ")) { items.push(lines[i].trim().slice(2)); i++; }
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 my-2 text-ink-2">
          {items.map((it, j) => <li key={j}>{boldify(it)}</li>)}
        </ul>
      );
      continue;
    }
    if (line.trim()) {
      blocks.push(<p key={key++} className="my-2 text-ink-2">{boldify(line.trim())}</p>);
    }
    i++;
  }
  return <>{blocks}</>;
}

function FlywheelLoop({ stages }: { stages: { n: number; stage: string; text: string }[] }) {
  if (!stages.length) return null;
  // Distinct per-stage loop colors (chart-style scale, not semantic tokens).
  const palette = ["#4F8CFF", "#3FB68B", "#E0A458", "#B98CFF", "#4FC3E0", "#F2789F"];
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4" color="var(--accent-blue)" />
        <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2">飞轮</h2>
        <span className="text-[12px] text-ink-2 ml-1">↻ 每一圈驱动下一圈</span>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {stages.map((s, i) => {
          const color = palette[i % palette.length];
          return (
            <div
              key={s.n}
              className="bg-surface-2 border border-line-2 rounded-xl p-5 border-t-[3px]"
              style={{ borderTopColor: color }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                  style={{ background: color, color: "var(--ground)" }}>{s.n}</span>
                <span className="font-medium text-ink-1">{s.stage}</span>
                <span className="ml-auto text-lg" style={{ color, opacity: 0.7 }}>
                  {i === stages.length - 1 ? "↻" : "→"}
                </span>
              </div>
              <p className="text-sm text-ink-2">{s.text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PlanTab({ data }: { data: FinancesDataV2 }) {
  const plan = data.plan;
  if (!plan || !plan.present) {
    return (
      <Panel>
        <p className="text-sm text-center text-ink-2">
          尚无规划。创建 <code>USER/FINANCES/PLAN.md</code> — 飞轮、目标和产品阶梯将在此渲染。
        </p>
      </Panel>
    );
  }
  const special = /^(flywheel|targets)$/i;
  const about = plan.sections.find((s) => /^about/i.test(s.heading));
  const rest = plan.sections.filter((s) => !special.test(s.heading) && !/^about/i.test(s.heading));
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <FreshnessIndicator freshness={data.freshness_per_card?.plan} />
      </div>

      {about && (
        <Panel className="border-l-[3px] [border-left-color:var(--money)]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4" color="var(--money)" />
            <span className="text-xs uppercase tracking-widest text-ink-2">{about.heading}</span>
          </div>
          <PlanBody body={about.body} />
        </Panel>
      )}

      <FlywheelLoop stages={plan.flywheel} />

      {plan.targets && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4" color="var(--health)" />
            <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2">目标</h2>
          </div>
          <Panel className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>{plan.targets.headers.map((h, j) => (
                  <th key={j} className="text-left px-2 py-2 text-xs uppercase tracking-wide text-ink-2" style={{ borderBottom: "1px solid var(--line-1)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>{plan.targets.rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => (
                  <td key={ci} className="px-2 py-2" style={{ color: ci === 0 ? "var(--ink-1)" : "var(--ink-2)", borderBottom: "1px solid var(--line-1)" }}>{c}</td>
                ))}</tr>
              ))}</tbody>
            </table>
          </Panel>
        </section>
      )}

      {rest.map((s, i) => (
        <section key={i}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" color="var(--relationships)" />
            <h2 className="text-sm font-medium uppercase tracking-widest text-ink-2">{s.heading}</h2>
          </div>
          <Panel>
            <PlanBody body={s.body} />
          </Panel>
        </section>
      ))}
    </div>
  );
}

// ─── Page ───

export default function FinancesPage() {
  const [data, setData] = useState<FinancesDataV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("income");
  const [periodView, setPeriodView] = useState<"monthly" | "annual">("monthly");

  // Load data
  useEffect(() => {
    fetch("/api/life/finances")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: FinancesDataV2) => {
        setCurrency(json.currency);
        setData(json);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Hash-routed tab state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const valid = (k: string): k is TabKey =>
      k === "income" || k === "outbound" || k === "overall" || k === "plan";
    const hash = window.location.hash.replace("#", "");
    if (valid(hash)) setTab(hash);
    const onHashChange = () => {
      const h = window.location.hash.replace("#", "");
      if (valid(h)) setTab(h);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Keyboard 1/2/3 cycles tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "1") changeTab("income");
      else if (e.key === "2") changeTab("outbound");
      else if (e.key === "3") changeTab("overall");
      else if (e.key === "4") changeTab("plan");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeTab = (k: TabKey) => {
    setTab(k);
    if (typeof window !== "undefined") window.location.hash = k;
  };

  if (error) {
    return (
      <PageShell>
        <Panel className="border-l-[3px] [border-left-color:var(--err)]">
          <h2 className="font-medium text-err">加载财务数据失败</h2>
          <p className="text-sm text-err">{error}</p>
        </Panel>
      </PageShell>
    );
  }
  if (!data) return <div className="p-8 text-sm text-ink-2">加载财务数据中...</div>;

  const incomeAnnual = data.income?.annual ?? data.annualIncome ?? 0;
  const outboundAnnual = data.outbound?.annual ?? data.annualExpenses ?? 0;
  const incomeStreams = data.income?.streams ?? data.incomeStreams ?? [];
  const isFreshInstall =
    incomeAnnual === 0 &&
    outboundAnnual === 0 &&
    incomeStreams.length === 0 &&
    (!data.accounts || data.accounts.length === 0);

  return (
    <PageShell>
      <PageHeader
        icon={DollarSign}
        title="财务"
        subtitle="收入 · 支出 · 总览 · 飞轮 · 按 1/2/3/4 切换标签页"
      />
      <TabBar tabs={TABS} active={tab} onChange={changeTab} />

      {isFreshInstall && (
        <EmptyStateGuide
          section="财务"
          description="账户、交易、损益表及收入趋势追踪。"
          userDir="FINANCES"
          daPromptExample="帮我接入财务数据"
        />
      )}

      {tab === "income" && <IncomeTab data={data} />}
      {tab === "outbound" && <OutboundTab data={data} />}
      {tab === "overall" && (
        <OverallTab data={data} periodView={periodView} onPeriodChange={setPeriodView} />
      )}
      {tab === "plan" && <PlanTab data={data} />}
    </PageShell>
  );
}
