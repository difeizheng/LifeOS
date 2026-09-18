"use client";
import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Users, Mail, Video, Globe, type LucideIcon } from "lucide-react";
import { PageShell, PageHeader, Panel, StatTile, type Dim } from "@/components/ui/chrome";

interface GrowthData {
  generatedAt: string;
  newsletter: {
    totalActive: number;
    free: number;
    premium: number;
    newToday: number;
    new7d: number;
    new30d: number;
    avgPerDay7d: number;
    avgPerDay30d: number;
    openRate: number;
    clickRate: number;
    dailyTrend: { date: string; count: number }[];
    todayChannels: Record<string, number>;
    channels30d: Record<string, number>;
  } | null;
  youtube: {
    subscribers: number;
    totalViews: number;
    videoCount: number;
    recentVideos: { title: string; views: number; likes: number; comments: number }[];
  } | null;
  web: { range: string; pageviews: number; visitors: number } | null;
  errors: string[];
}

// Chart palette maps straight onto the life-dimension tokens.
const GREEN = "var(--health)";
const GOLD = "var(--money)";
const BLUE = "var(--freedom)";
const RED = "var(--creative)";
const PURPLE = "var(--relationships)";
const TEAL = "var(--rhythms)";
const CHANNEL_COLORS = [GREEN, BLUE, GOLD, PURPLE, RED, TEAL];

const CHART_TOOLTIP = {
  background: "var(--surface-1)",
  border: "1px solid var(--line-1)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--ink-1)",
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function mmdd(d: string): string {
  const p = d.split("-");
  return p.length === 3 ? `${p[1]}/${p[2]}` : d;
}

function Hero({ nl }: { nl: NonNullable<GrowthData["newsletter"]> }) {
  return (
    <Panel style={{ borderLeft: `3px solid ${GREEN}` }}>
      <div className="flex items-start gap-6 flex-wrap">
        <TrendingUp className="w-10 h-10 shrink-0" color={GREEN} />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-widest mb-2 text-ink-3">
            受众增长
          </div>
          <div className="flex items-baseline gap-8 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-3">今日新订阅</div>
              <div className="text-5xl lg:text-6xl font-medium tabular-nums leading-tight" style={{ color: GREEN }}>
                {nl.newToday}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-3">活跃总数</div>
              <div className="text-3xl lg:text-4xl font-medium tabular-nums leading-tight text-ink-1">
                {fmt(nl.totalActive)}
              </div>
              <div className="text-xs mt-1 text-ink-2">
                {fmt(nl.free)} 免费 · {nl.premium.toLocaleString()} 付费
              </div>
            </div>
            <div className="text-sm space-y-1 text-ink-2">
              <div>
                <span className="tabular-nums" style={{ color: BLUE }}>{nl.new7d}</span> 7 天内 ·{" "}
                {nl.avgPerDay7d}/天
              </div>
              <div>
                <span className="tabular-nums" style={{ color: BLUE }}>{nl.new30d.toLocaleString()}</span> 30 天内 ·{" "}
                {nl.avgPerDay30d}/天
              </div>
              <div className="text-xs">
                打开率 {nl.openRate}% · 点击率 {nl.clickRate}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TrendChart({ nl }: { nl: NonNullable<GrowthData["newsletter"]> }) {
  const data = nl.dailyTrend.map((d) => ({ ...d, label: mmdd(d.date) }));
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-widest mb-4 text-ink-3">
        新订阅 · 30 天
      </h2>
      <Panel style={{ borderLeft: `3px solid ${GREEN}` }}>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <defs>
                <linearGradient id="subGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GREEN} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={GREEN} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--line-1)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--ink-3)" fontSize={10} interval={4} tickLine={false} />
              <YAxis stroke="var(--ink-3)" fontSize={10} width={32} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP}
                formatter={(v: number) => [`${v} 新增`, "订阅"]}
              />
              <Area type="monotone" dataKey="count" stroke={GREEN} strokeWidth={2} fill="url(#subGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </section>
  );
}

function Channels({ nl }: { nl: NonNullable<GrowthData["newsletter"]> }) {
  const rows = Object.entries(nl.channels30d).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = rows.reduce((s, [, v]) => s + v, 0) || 1;
  const today = Object.entries(nl.todayChannels).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-medium uppercase tracking-widest mb-4 text-ink-3">
        来源渠道 · 30 天
      </h2>
      <Panel style={{ borderLeft: `3px solid ${BLUE}` }}>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows.map(([name, count]) => ({ name, count }))} layout="vertical" margin={{ left: 20, right: 40 }}>
              <XAxis type="number" stroke="var(--ink-3)" fontSize={11} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--ink-3)" fontSize={11} width={120} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP}
                formatter={(v: number) => [`${v} (${((v / total) * 100).toFixed(0)}%)`, "订阅"]}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {today.length > 0 && (
          <div className="text-xs text-ink-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--line-1)" }}>
            今日：{today.map(([k, v]) => `${k} ${v}`).join(" · ")}
          </div>
        )}
      </Panel>
    </section>
  );
}

function NotConnected({ icon: Icon, accent, label, envVar, note }: { icon: LucideIcon; accent: string; label: string; envVar: string; note: string }) {
  return (
    <Panel className="p-4" style={{ borderLeft: `3px solid var(--line-2)`, opacity: 0.75 }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 shrink-0" color={accent} />
        <h3 className="text-xs uppercase tracking-wider text-ink-3">{label}</h3>
      </div>
      <div className="text-sm text-ink-2">未连接</div>
      <div className="text-xs text-ink-3 mt-1">
        {note} 在 <code>~/.claude/.env</code> 中设置 <code style={{ color: accent }}>{envVar}</code>。
      </div>
    </Panel>
  );
}

export default function GrowthPage() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/life/growth")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <PageShell>
        <PageHeader title="增长" subtitle="跨新闻通讯、YouTube 和网络的受众。" />
        <Panel style={{ borderLeft: `3px solid ${RED}` }}>
          <h2 className="font-medium" style={{ color: RED }}>加载增长数据失败</h2>
          <p className="text-sm text-err">{error}</p>
        </Panel>
      </PageShell>
    );
  }
  if (!data) {
    return (
      <PageShell>
        <PageHeader title="增长" subtitle="跨新闻通讯、YouTube 和网络的受众。" />
        <div className="text-sm text-ink-2">正在加载增长…</div>
      </PageShell>
    );
  }

  const nl = data.newsletter;

  return (
    <PageShell>
      <PageHeader
        title="增长"
        subtitle="跨新闻通讯、YouTube 和网络的受众。"
        actions={
          <div className="text-xs text-ink-3 mono">
            {data.generatedAt && (
              <>更新于 {new Date(data.generatedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT</>
            )}
            {(data.errors?.length ?? 0) > 0 && <span> · {data.errors.length} 个来源需要凭据</span>}
          </div>
        }
      />

      {nl ? (
        <>
          <Hero nl={nl} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendChart nl={nl} />
            <Channels nl={nl} />
          </div>
        </>
      ) : (
        <Panel style={{ borderLeft: `3px solid ${RED}` }}>
          <h2 className="font-medium" style={{ color: RED }}>新闻通讯未连接</h2>
          <p className="text-sm text-ink-2">在 ~/.claude/.env 中设置 BEEHIIV_API_KEY 和 BEEHIIV_PUB_ID。</p>
        </Panel>
      )}

      <h2 className="text-sm font-medium uppercase tracking-widest text-ink-3">其他渠道</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {data.youtube ? (
          <StatTile
            icon={Video}
            dim="creative"
            label="YouTube"
            value={fmt(data.youtube.subscribers)}
            sub={`${fmt(data.youtube.totalViews)} 次观看 · ${data.youtube.videoCount} 个视频`}
          />
        ) : (
          <NotConnected icon={Video} accent={RED} label="YouTube" envVar="GOOGLE_API_KEY" note="在此密钥的项目中启用 YouTube Data API v3。" />
        )}
        {data.web ? (
          <StatTile
            icon={Globe}
            dim="money"
            label={`网站流量 (${data.web.range})`}
            value={fmt(data.web.pageviews)}
            sub={`${fmt(data.web.visitors)} 位访客`}
          />
        ) : (
          <NotConnected icon={Globe} accent={GOLD} label="网站流量" envVar="CLOUDFLARE_API_TOKEN" note="需要 Account Analytics Read 权限。" />
        )}
        {nl && (
          <StatTile
            icon={Mail}
            dim="relationships"
            label="列表健康"
            value={`${nl.openRate}%`}
            sub={`打开率 ${nl.openRate}% · 点击率 ${nl.clickRate}% · ${nl.premium.toLocaleString()} 付费`}
          />
        )}
        {nl && (
          <StatTile icon={Users} dim="health" label="免费 / 付费" value={fmt(nl.free)} sub={`免费 · ${nl.premium.toLocaleString()} 付费`} />
        )}
      </div>
    </PageShell>
  );
}
