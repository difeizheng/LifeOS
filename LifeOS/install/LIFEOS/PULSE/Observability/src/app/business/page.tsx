"use client";
import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from "recharts";
import { Building2, Briefcase, TrendingUp, FileText, type LucideIcon } from "lucide-react";
import EmptyStateGuide from "@/components/EmptyStateGuide";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelHeader,
  StatTile,
} from "@/components/ui/chrome";

interface BusinessData {
  latestRevenueReport?: string;
  revenueSummary?: string;
  revenueByProduct?: string;
  revenueAllSections?: Array<{ heading: string; body: string }>;
  businessOverview?: Array<{ heading: string; body: string }>;
  ulOverview?: Array<{ heading: string; body: string }>;
}

interface RevenueMetrics {
  total?: string;
  deals?: string;
  accounts?: string;
  avgDeal?: string;
  largest?: string;
  smallest?: string;
}

interface ProductRow {
  product: string;
  revenue: number;
  pct: string;
  deals: string;
  avgPrice: string;
}

function parseMetrics(md?: string): RevenueMetrics {
  if (!md) return {};
  const out: Record<string, string> = {};
  for (const line of md.split("\n")) {
    const m = line.match(/\*\*([^*]+)\*\*\s*\|\s*([^|]+)\|/);
    if (m) out[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return {
    total: out["total revenue"],
    deals: out["deals closed"],
    accounts: out["unique accounts"],
    avgDeal: out["average deal (by line item)"],
    largest: out["largest single deal"],
    smallest: out["smallest single deal"],
  };
}

function parseProducts(md?: string): ProductRow[] {
  if (!md) return [];
  const out: ProductRow[] = [];
  const lines = md.split("\n").filter((l) => l.trim().startsWith("|") && l.includes("$"));
  for (const line of lines) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;
    const name = cells[0].replace(/\*\*/g, "");
    const revenue = parseInt(cells[1].replace(/[$,]/g, ""), 10);
    if (isNaN(revenue)) continue;
    out.push({
      product: name,
      revenue,
      pct: cells[2] || "",
      deals: cells[3] || "",
      avgPrice: cells[4] || "",
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}

// Chart series palette — the six life-dimension tokens.
const PRODUCT_COLORS = [
  "var(--health)",
  "var(--money)",
  "var(--freedom)",
  "var(--creative)",
  "var(--relationships)",
  "var(--rhythms)",
];

function RevenueByProduct({ products }: { products: ProductRow[] }) {
  if (products.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="产品收入" icon={TrendingUp} />
      <div data-sensitive style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={products} layout="vertical" margin={{ left: 20, right: 60 }}>
            <XAxis
              type="number"
              stroke="var(--ink-3)"
              fontSize={11}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              type="category"
              dataKey="product"
              stroke="var(--ink-3)"
              fontSize={11}
              width={200}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-1)",
                border: "1px solid var(--line-2)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--ink-1)",
              }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, "收入"]}
            />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
              {products.map((_, i) => (
                <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-line-2"
        data-sensitive
      >
        {products.map((p, i) => (
          <div key={p.product} className="flex items-center gap-3 text-xs">
            <span
              className="w-3 h-3 rounded shrink-0"
              style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}
            />
            <span className="flex-1 truncate text-ink-2" title={p.product}>
              {p.product}
            </span>
            <span style={{ color: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}>{p.pct}</span>
            <span className="tabular-nums text-ink-3">{p.deals}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SectionGrid({
  sections,
  icon: Icon,
  accent,
}: {
  sections?: Array<{ heading: string; body: string }>;
  icon: LucideIcon;
  accent: string;
}) {
  if (!sections || sections.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sections.map((s, i) => (
        <Panel key={i} style={{ borderLeft: `3px solid ${accent}` }}>
          <PanelHeader title={s.heading} icon={Icon} className="mb-2" />
          <div className="text-xs whitespace-pre-wrap line-clamp-6 text-ink-2" data-sensitive>
            {s.body}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export default function BusinessPage() {
  const [data, setData] = useState<BusinessData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/life/business")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);
  if (error) {
    return (
      <PageShell>
        <Panel style={{ borderLeft: "3px solid var(--err)" }}>
          <h2 className="font-medium" style={{ color: "var(--err)" }}>
            加载商业数据失败
          </h2>
          <p className="text-sm text-ink-2">{error}</p>
        </Panel>
      </PageShell>
    );
  }
  if (!data) return <div className="p-8 text-sm text-ink-2">加载商业数据中...</div>;

  const metrics = parseMetrics(data.revenueSummary);
  const products = parseProducts(data.revenueByProduct);
  const isFreshInstall =
    !data.revenueSummary &&
    !data.revenueByProduct &&
    (!data.businessOverview || data.businessOverview.length === 0) &&
    (!data.ulOverview || data.ulOverview.length === 0) &&
    (!data.revenueAllSections || data.revenueAllSections.length === 0);

  return (
    <PageShell>
      <PageHeader
        title="商业"
        subtitle="收入来源、客户、交易、管线。"
        icon={Building2}
        actions={
          data.latestRevenueReport ? (
            <span className="text-[12px] text-ink-3 mono">报告: {data.latestRevenueReport}</span>
          ) : undefined
        }
      />

      {isFreshInstall && (
        <EmptyStateGuide
          section="商业背景"
          description="你的业务运营数据 — 收入来源、客户、交易、管线。"
          userDir="BUSINESS"
          daPromptExample="带我了解我的商业背景"
        />
      )}

      {(metrics.total || metrics.deals) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" data-sensitive>
          {metrics.total && (
            <StatTile label="最新收入" value={metrics.total} dim="money" icon={Building2} />
          )}
          {metrics.deals && <StatTile label="已成交" value={metrics.deals} />}
          {metrics.accounts && <StatTile label="账户" value={metrics.accounts} />}
          {metrics.avgDeal && <StatTile label="平均交易" value={metrics.avgDeal} dim="money" />}
          {metrics.largest && <StatTile label="最大" value={metrics.largest} dim="money" />}
        </div>
      )}

      <RevenueByProduct products={products} />

      {data.businessOverview && data.businessOverview.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink-3">
            商业概览
          </h2>
          <SectionGrid sections={data.businessOverview} icon={Briefcase} accent="var(--creative)" />
        </section>
      )}
      {data.ulOverview && data.ulOverview.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink-3">
            公司概览
          </h2>
          <SectionGrid sections={data.ulOverview} icon={TrendingUp} accent="var(--freedom)" />
        </section>
      )}
      {data.revenueAllSections && data.revenueAllSections.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium uppercase tracking-widest text-ink-3">
            收入详情
          </h2>
          <SectionGrid sections={data.revenueAllSections} icon={FileText} accent="var(--relationships)" />
        </section>
      )}
    </PageShell>
  );
}
