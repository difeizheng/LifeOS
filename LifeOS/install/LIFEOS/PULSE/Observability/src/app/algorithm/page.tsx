"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Workflow,
  ArrowRight,
  BookOpen,
  Braces,
  Eye,
  FileText,
  GitCommitHorizontal,
  History,
  Pencil,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  PageShell,
  PageHeader,
  Panel,
  PanelHeader,
  StatTile,
  TabBar,
  Pill,
  EmptyState,
  dimStyle,
  type Dim,
  type TabSpec,
} from "@/components/ui/chrome";
import Md from "@/components/Md";

/**
 * Algorithm tab — the complete thinking chain, visible, summarized, editable.
 *
 * RULES & FILES is the primary surface and the landing tab: every file the
 * Algorithm system comprises — system prompt, context hooks, doctrine, ISA
 * system, run-layer hooks, on-demand rules — browsable and editable in one
 * place. Each file carries an AI-generated card: what it performs, when it
 * fires, how it affects the whole system. Doctrine edits run the REAL
 * versioning workflow (new v-file, changelog, LATEST, git commit); everything
 * else saves in place (TS syntax-gated for hooks) and git-commits in the
 * file's own repo.
 *
 * HOW IT WORKS is the simple explanation: one auto-generated plain-language
 * overview (server regenerates it whenever any chain file changes — the page
 * is never stale by design), the loop visual, and the teeth.
 *
 * Holds ZERO data and ZERO write logic: everything comes from
 * /api/algorithm-tab. The whitelist of what's editable lives server-side;
 * this page can't invent a path.
 */

type Stage = "context" | "doctrine" | "isa" | "run" | "ondemand";

interface ChainFile {
  id: string;
  name: string;
  rel: string;
  role: string;
  loaded: string;
  stage: Stage;
  editable: boolean;
  kind: "markdown" | "code";
  bytes: number;
  mtime: string | null;
  summary: { markdown: string; generated_at: string; stale: boolean } | null;
}
interface AlgoData {
  generated_at: string;
  version: string;
  claims: { total: number; hook: number; check: number; self: number };
  stages: Stage[];
  chain: ChainFile[];
  versions: { version: string; mtime: string }[];
  summary: { generated_at: string; level: string; stale: boolean; markdown: string } | null;
  generating: boolean;
  errors: Record<string, string> | null;
}
interface FilePayload {
  id: string;
  content: string;
  mtime: string;
  editable: boolean;
}

type TabId = "files" | "how";
const TABS: TabSpec<TabId>[] = [
  { id: "files", label: "规则与文件", icon: BookOpen, dim: "blue" },
  { id: "how", label: "工作原理", icon: Workflow, dim: "blue" },
];

const STAGE_META: Record<Stage, { label: string; dim: Dim; desc: string }> = {
  context: { label: "每轮对话", dim: "creative", desc: "在第一个 token 之前加载 — 常驻上下文和注入它的钩子。" },
  doctrine: { label: "算法", dim: "money", desc: "教义本身 — 版本化，永不就地编辑 — 及其完整历史。" },
  isa: { label: "ISA 系统", dim: "freedom", desc: "记录'完成'标准、同步、提交和渲染的地方。" },
  run: { label: "运行期间", dim: "relationships", desc: "实时层 — 工作发生时触发的提示和门控。" },
  ondemand: { label: "按需", dim: "health", desc: "触发器激活时加载的规则文件 — 非常驻。" },
};

// The loop, as it actually runs. File chips jump to that file.
const FLOW: { name: string; desc: string; dim: Dim; files: string[] }[] = [
  { name: "加载", desc: "系统提示（宪法式，冲突时优先）+ CLAUDE.md @-imports + 钩子注入的上下文和记忆。", dim: "creative", files: ["system-prompt", "claude-md", "load-context-hook", "load-memory-hook"] },
  { name: "判断", desc: "简单轮次还是正式运行？从工作中发现，而非预设标准。负责人深度指令优先于判断。", dim: "freedom", files: ["doctrine", "nudge-hook"] },
  { name: "明确", desc: "先写下完成标准：ISA 的每个声明都命名证伪它的探针，加上反声明。", dim: "money", files: ["isa-format", "isa-skill"] },
  { name: "攀登", desc: "依据 ISA 构建。按需使用技能、代理、研究；确定性提示在问题可回答时立即触发。", dim: "relationships", files: ["nudge-hook", "isasync-hook"] },
  { name: "验证", desc: "没有工具证据的声明不会关闭。钩子机械阻止；'应该可以'被禁止。", dim: "ok", files: ["verification-gate", "verification-expanded", "checkpoint-hook"] },
  { name: "学习", desc: "运行留下痕迹：ISA 差异、反思、学习路由到其结构性归属。", dim: "health", files: ["self-healing", "changelog"] },
  { name: "响应", desc: "唯一的输出格式 — 先给答案，工作变更时附 CHANGE/VERIFY 证据。在 Stop 上门控。", dim: "blue", files: ["system-prompt", "format-gate", "stop-gates"] },
];

const REFRESH_MS = 60_000;

function ago(ts: string | null | undefined): string {
  if (!ts) return "—";
  const then = new Date(ts).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const kb = (n: number) => (n >= 1024 ? `${(n / 1024).toFixed(1)}k` : `${n}`);

export default function AlgorithmPage() {
  const [data, setData] = useState<AlgoData | null>(null);
  const [evals, setEvals] = useState<{ suite: string; passed: boolean; pass_to_k: number; cases: unknown[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("files");

  // files state
  const [selectedId, setSelectedId] = useState<string>("doctrine");
  const [file, setFile] = useState<FilePayload | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [rawView, setRawView] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // doctrine-specific state (versioned flow, lives inside the Files surface)
  const [doctrineVersion, setDoctrineVersion] = useState<string | null>(null); // null = current
  const [docBump, setDocBump] = useState<"patch" | "feature">("patch");
  const [docNote, setDocNote] = useState("");

  const [regenerating, setRegenerating] = useState(false);
  // The regenerate poll starts in a click handler, not an effect — hold its id
  // so unmount can clear it (it otherwise runs for up to 15 minutes).
  // ported from public PR #1735, @elhoim
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const load = useCallback(() => {
    fetch("/api/algorithm-tab")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const loadEvals = () => fetch("/api/evals")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvals(d?.suites ?? []))
      .catch(() => {});
    loadEvals();
    const t = setInterval(loadEvals, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = window.location.hash.replace("#", "");
    if (h === "how") setTab("how");
    else if (h) { setSelectedId(h); setTab("files"); }
  }, []);
  const switchTab = (t: TabId) => {
    setTab(t);
    window.history.replaceState(null, "", t === "files" ? window.location.pathname : "#how");
  };

  const isDoctrine = selectedId === "doctrine";

  // ── file loading ──
  const loadFile = useCallback((id: string, version?: string | null) => {
    setFileLoading(true);
    const qs = version ? `?id=${id}&version=${version}` : `?id=${id}`;
    return fetch(`/api/algorithm-tab/file${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .finally(() => setFileLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "files") return;
    setEditing(false);
    setSaveMsg(null);
    loadFile(selectedId, isDoctrine ? doctrineVersion : null)
      .then(setFile)
      .catch((e) => setSaveMsg(String(e?.message ?? e)));
  }, [tab, selectedId, doctrineVersion, isDoctrine, loadFile]);

  const selectedSpec = useMemo(() => data?.chain.find((c) => c.id === selectedId) ?? null, [data, selectedId]);

  const selectFile = (id: string) => {
    if (id !== "doctrine") setDoctrineVersion(null);
    setSelectedId(id);
    setTab("files");
    window.history.replaceState(null, "", `#${id}`);
  };

  // ── saves ──
  const saveInPlace = async () => {
    if (!file) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/algorithm-tab/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId, content: draft, expectedMtime: file.mtime }),
      });
      const out = await r.json();
      if (!r.ok) { setSaveMsg(out.error ?? `HTTP ${r.status}`); return; }
      setSaveMsg(`Saved · commit ${out.commit?.detail ?? "n/a"}`);
      setEditing(false);
      const fresh = await loadFile(selectedId);
      setFile(fresh);
      load();
    } catch (e: any) {
      setSaveMsg(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const saveDoctrine = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/algorithm-tab/doctrine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, bump: docBump, note: docNote }),
      });
      const out = await r.json();
      if (!r.ok) { setSaveMsg(out.error ?? `HTTP ${r.status}`); return; }
      setSaveMsg(`v${out.previous} → v${out.version} · ${out.commit?.committed ? `commit ${out.commit.detail}` : out.commit?.detail}`);
      setEditing(false);
      setDocNote("");
      setDoctrineVersion(null);
      const fresh = await loadFile("doctrine");
      setFile(fresh);
      load();
    } catch (e: any) {
      setSaveMsg(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const r = await fetch("/api/algorithm-tab/summary/regenerate", { method: "POST" });
      if (!r.ok && r.status !== 202) {
        const out = await r.json().catch(() => ({}));
        setError(out.error ?? `regenerate failed: HTTP ${r.status}`);
        setRegenerating(false);
        return;
      }
      const startedAt = Date.now();
      const poll = setInterval(async () => {
        try {
          const d = await fetch("/api/algorithm-tab").then((x) => x.json());
          setData(d);
          if (!d.generating || Date.now() - startedAt > 15 * 60_000) {
            clearInterval(poll);
            pollRef.current = null;
            setRegenerating(false);
          }
        } catch { /* keep polling */ }
      }, 5000);
      pollRef.current = poll;
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setRegenerating(false);
    }
  };

  const editorClass =
    "w-full h-[65vh] bg-surface-1 border border-line-2 rounded-lg p-4 text-[13px] leading-relaxed text-ink-1 mono resize-y focus:outline-none focus:border-line-3";

  const nextPatch = data?.version.replace(/\.(\d+)$/, (_, p) => `.${Number(p) + 1}`);
  const nextFeature = data?.version.replace(/^(\d+)\.(\d+)\..*$/, (_, a, f) => `${a}.${Number(f) + 1}.0`);

  return (
    <PageShell className="max-w-[1400px]">
      <PageHeader
        icon={Workflow}
        title={
          <span className="flex items-center gap-3">
            Algorithm
            {data && <Pill dim="money">v{data.version}</Pill>}
            {data?.generating && (
              <span className="flex items-center gap-1.5 text-[11px] text-ink-3 normal-case tracking-normal">
                <RefreshCw className="w-3 h-3 animate-spin" /> refreshing explanations…
              </span>
            )}
          </span>
        }
        subtitle="系统思考所用的每条规则、钩子和教义文件 — 阅读、理解、编辑。页面自动保持最新：更改任何内容，解释会重新生成。"
      />

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
            <span className="whitespace-nowrap">{error ? "离线" : data ? `更新于 ${ago(data.generated_at)}` : "加载中…"}</span>
          </div>
        }
      />

      {error && <div className="text-warn text-sm">无法访问算法 API：{error}</div>}
      {!data && !error && <div className="text-ink-3 text-sm">加载中…</div>}

      {/* ════ RULES & FILES — the primary surface ════ */}
      {data && tab === "files" && (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
          {/* ── the chain, grouped ── */}
          <div className="flex flex-col gap-3">
            {data.stages.map((stage) => {
              const files = data.chain.filter((c) => c.stage === stage);
              if (!files.length) return null;
              const meta = STAGE_META[stage];
              return (
                <div key={stage}>
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Pill dim={meta.dim} className="text-[10px] uppercase tracking-wider">{meta.label}</Pill>
                  </div>
                  <Panel className="p-1.5 flex flex-col gap-0.5">
                    {files.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => selectFile(f.id)}
                        className={`flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-[13px] transition-colors ${selectedId === f.id ? "bg-surface-3 text-ink-1" : "text-ink-2 hover:bg-surface-3"}`}
                        title={f.rel}
                      >
                        {f.kind === "code" ? <Braces className="w-3.5 h-3.5 shrink-0 text-ink-3" /> : <FileText className="w-3.5 h-3.5 shrink-0 text-ink-3" />}
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="tabular-nums text-[10px] text-ink-3">{kb(f.bytes)}B</span>
                      </button>
                    ))}
                  </Panel>
                </div>
              );
            })}
            <p className="text-[11px] text-ink-3 px-1 leading-snug">
              一切可编辑。Markdown 保存会更新新鲜度并在文件所在仓库 git 提交；
              钩子源码在写入磁盘前会进行语法检查；教义编辑总是创建新版本。
            </p>
          </div>

          {/* ── viewer / editor ── */}
          <div className="flex flex-col gap-3 min-w-0">
            {selectedSpec && (
              <>
                {/* per-file understanding card */}
                <Panel>
                  <PanelHeader
                    icon={Sparkles}
                    title={`${selectedSpec.name} — 功能说明`}
                    meta={selectedSpec.summary ? `生成于 ${ago(selectedSpec.summary.generated_at)}` : undefined}
                    actions={selectedSpec.summary?.stale ? <Pill dim="warn" title="文件已更改 — 下次扫描时重新生成">刷新中</Pill> : undefined}
                  />
                  <div className="text-[12px] text-ink-3 mb-2 leading-snug">
                    {selectedSpec.role} <span className="text-ink-2">加载：{selectedSpec.loaded}。</span>
                  </div>
                  {selectedSpec.summary ? (
                    <div className="text-[13px] leading-relaxed text-ink-1"><Md content={selectedSpec.summary.markdown} /></div>
                  ) : (
                    <div className="text-[12px] text-ink-3 flex items-center gap-2">
                      <RefreshCw className={`w-3 h-3 ${data.generating ? "animate-spin" : ""}`} />
                      {data.generating ? "正在生成此文件的摘要…" : "摘要尚未生成 — 下次刷新时会出现"}
                    </div>
                  )}
                </Panel>

                {/* doctrine version chips */}
                {isDoctrine && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-[0.14em] text-ink-3 mr-1">版本</span>
                    {data.versions.slice(0, 12).map((v) => {
                      const isCurrent = v.version === data.version;
                      const isViewing = doctrineVersion ? v.version === doctrineVersion : isCurrent;
                      return (
                        <button
                          key={v.version}
                          onClick={() => setDoctrineVersion(isCurrent ? null : v.version)}
                          className="mono text-[11px] px-2 py-0.5 rounded-full transition-colors"
                          style={dimStyle(isCurrent ? "money" : "neutral", isViewing)}
                          title={`冻结于 ${ago(v.mtime)}`}
                        >
                          v{v.version}{isCurrent ? " · 当前" : ""}
                        </button>
                      );
                    })}
                  </div>
                )}

                <Panel>
                  <PanelHeader
                    icon={selectedSpec.kind === "code" ? Braces : ScrollText}
                    title={
                      isDoctrine
                        ? doctrineVersion
                          ? `The Algorithm v${doctrineVersion} — frozen snapshot`
                          : `The Algorithm v${data.version} — live doctrine`
                        : selectedSpec.name
                    }
                    meta={file ? `${selectedSpec.rel} · 磁盘 ${ago(file.mtime)}` : selectedSpec.rel}
                    actions={
                      <div className="flex items-center gap-2">
                        {selectedSpec.kind === "markdown" && !editing && (
                          <button onClick={() => setRawView(!rawView)} className="text-[12px] px-2.5 py-1 rounded-full" style={dimStyle("neutral", rawView)}>
                            {rawView ? "渲染" : "原始"}
                          </button>
                        )}
                        {!editing && (!isDoctrine || !doctrineVersion) && (
                          <button
                            onClick={() => { setDraft(file?.content ?? ""); setEditing(true); setSaveMsg(null); }}
                            disabled={!file}
                            className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={dimStyle(isDoctrine ? "money" : "ok", true)}
                          >
                            <Pencil className="w-3 h-3" /> {isDoctrine ? "编辑 → 新版本" : "编辑"}
                          </button>
                        )}
                      </div>
                    }
                  />

                  {isDoctrine && doctrineVersion && (
                    <div className="text-[12px] text-ink-3 mb-3 flex items-center gap-2">
                      <History className="w-3.5 h-3.5" />
                      标记版本不可变 — 这是历史，非实时文件。选择 v{data.version} 进行编辑。
                    </div>
                  )}

                  {saveMsg && (
                    <div className="text-[12px] mb-3 flex items-center gap-2" style={{ color: saveMsg.startsWith("Saved") || saveMsg.startsWith("v") ? "var(--ok)" : "var(--warn)" }}>
                      <GitCommitHorizontal className="w-3.5 h-3.5" /> {saveMsg}
                    </div>
                  )}

                  {fileLoading && <div className="text-ink-3 text-sm">加载中…</div>}

                  {!editing && file && (
                    selectedSpec.kind === "code" || rawView ? (
                      <pre className="text-[12px] leading-relaxed text-ink-2 mono whitespace-pre-wrap bg-surface-1 border border-line-1 rounded-lg p-4 overflow-x-auto max-h-[70vh] overflow-y-auto">
                        {file.content}
                      </pre>
                    ) : (
                      <div className="max-h-[70vh] overflow-y-auto pr-2">
                        <Md content={file.content} />
                      </div>
                    )
                  )}

                  {editing && (
                    <div className="flex flex-col gap-3">
                      <textarea className={editorClass} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck={false} />
                      {isDoctrine ? (
                        <>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              {(["patch", "feature"] as const).map((b) => (
                                <button key={b} onClick={() => setDocBump(b)} className="text-[12px] px-2.5 py-1 rounded-full" style={dimStyle(b === "feature" ? "money" : "ok", docBump === b)}>
                                  {b} → v{b === "patch" ? nextPatch : nextFeature}
                                </button>
                              ))}
                            </div>
                            <input
                              value={docNote}
                              onChange={(e) => setDocNote(e.target.value)}
                              placeholder="Changelog note — what changed and why (required)"
                              className="flex-1 min-w-[280px] bg-surface-1 border border-line-2 rounded-lg px-3 py-1.5 text-[13px] text-ink-1 focus:outline-none focus:border-line-3"
                            />
                            <button
                              onClick={saveDoctrine}
                              disabled={saving || docNote.trim().length < 10}
                              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                              style={dimStyle("ok", true)}
                            >
                              <GitCommitHorizontal className="w-3.5 h-3.5" /> {saving ? "cutting version…" : "save as new version"}
                            </button>
                            <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-full text-ink-3 hover:text-ink-1">
                              <X className="w-3.5 h-3.5" /> cancel
                            </button>
                          </div>
                          <p className="text-[11px] text-ink-3">
                            Saving runs the real workflow: writes <span className="mono">v&#123;next&#125;.md</span> (H1 bumped, prior versions untouched),
                            prepends the changelog entry, updates <span className="mono">LATEST</span>, and git-commits all three.
                          </p>
                        </>
                      ) : (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={saveInPlace}
                            disabled={saving}
                            className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-40"
                            style={dimStyle("ok", true)}
                          >
                            <GitCommitHorizontal className="w-3.5 h-3.5" /> {saving ? "saving…" : "save & commit"}
                          </button>
                          <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-full text-ink-3 hover:text-ink-1">
                            <X className="w-3.5 h-3.5" /> cancel
                          </button>
                          <span className="text-[11px] text-ink-3">
                            {selectedSpec.kind === "code"
                              ? "Syntax-checked server-side — a hook that doesn't parse never reaches disk. Conflict-guarded (409 if changed on disk)."
                              : "Conflict-guarded: if the file changed on disk since load, the save 409s instead of clobbering."}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </Panel>
              </>
            )}
          </div>
        </div>
      )}

      {/* ════ HOW IT WORKS ════ */}
      {data && tab === "how" && (
        <>
          <Panel>
            <PanelHeader
              icon={Sparkles}
              title="How this system thinks — plain language, always current"
              meta={data.summary ? `generated ${ago(data.summary.generated_at)} from the live files` : undefined}
              actions={
                <div className="flex items-center gap-2">
                  {data.summary?.stale && (
                    <Pill dim="warn" title="A chain file changed — the server is regenerating this automatically">refreshing</Pill>
                  )}
                  <button
                    onClick={regenerate}
                    disabled={regenerating || data.generating}
                    className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={dimStyle("blue", true)}
                  >
                    <RefreshCw className={`w-3 h-3 ${regenerating || data.generating ? "animate-spin" : ""}`} />
                    {regenerating || data.generating ? "regenerating…" : "force regenerate"}
                  </button>
                </div>
              }
            />
            {data.summary ? (
              <Md content={data.summary.markdown} />
            ) : (
              <EmptyState
                icon={Sparkles}
                title="Writing the explanation…"
                hint="The server generates this automatically from the live chain files. If it hasn't appeared in a few minutes, hit force regenerate."
              />
            )}
          </Panel>

          <div>
            <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-3">The loop — how a message becomes verified work</h2>
            <div className="flex flex-wrap items-stretch gap-2">
              {FLOW.map((step, i) => (
                <div key={step.name} className="contents">
                  <div className="flex-1 min-w-[170px] rounded-lg p-3 flex flex-col" style={dimStyle(step.dim, true)}>
                    <div className="text-[12px] font-semibold tracking-[0.12em] uppercase">{i + 1} · {step.name}</div>
                    <div className="text-[11px] text-ink-3 mt-1 leading-snug flex-1">{step.desc}</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {step.files.map((fid) => {
                        const f = data.chain.find((c) => c.id === fid);
                        return f ? (
                          <button
                            key={fid}
                            onClick={() => selectFile(fid)}
                            className="mono text-[10px] px-1.5 py-0.5 rounded bg-surface-1 border border-line-2 text-ink-2 hover:text-ink-1 hover:border-line-3 transition-colors"
                            title={f.rel}
                          >
                            {f.name}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                  {i < FLOW.length - 1 && (
                    <div className="hidden xl:flex items-center text-ink-3"><ArrowRight className="w-4 h-4" /></div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[12px] text-ink-3 mt-2">
              Trivial turns skip straight from Judge to Respond — no ISA, no ceremony. Dynamic range is the design goal:
              seconds on almost nothing, or agents + audits + days, discovered from the work and its evidence gates.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatTile icon={ScrollText} label="Claims" value={data.claims.total} dim="money" sub="what must be true when a run completes" />
            <StatTile icon={ShieldCheck} label="Hook" value={data.claims.hook} dim="err" sub="teeth that block mechanically — no honor system" />
            <StatTile icon={Eye} label="Check" value={data.claims.check} dim="ok" sub="gates the run executes and records" />
            <StatTile icon={FileText} label="Self" value={data.claims.self} dim="freedom" sub="honest self-attestation, watched for decay" />
            <StatTile icon={History} label="Versions" value={data.versions.length >= 20 ? "20+" : data.versions.length} dim="relationships" sub={`current v${data.version} · every edit is a new frozen version`} />
          </div>

          {evals && evals.length > 0 && (
            <div>
              <h2 className="text-sm uppercase tracking-[0.16em] text-ink-2 mb-1">Evals — verification suites (elected, not required)</h2>
              <p className="text-[12px] text-ink-3 mb-3">
                pass^k across trials for the behavioural regression class the Algorithm elects. A config-change fires the configured dispositions suite automatically.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                {evals.map((s) => (
                  <div key={s.suite} className="rounded-lg border border-line-1 bg-surface-2 p-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-wider text-ink-2 truncate">
                      <ShieldCheck size={12} className="shrink-0" />
                      <span className="truncate">{s.suite}</span>
                    </div>
                    <div className={`text-2xl font-semibold leading-none ${s.passed ? "text-emerald-400" : "text-red-400"}`}>
                      {Math.round((s.pass_to_k ?? 0) * 100)}%
                    </div>
                    <div className="text-[11px] text-ink-3 mt-1.5">
                      pass^k · {s.passed ? "passing" : "REGRESSED"} · {s.cases?.length ?? 0} cases
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {data?.errors && (
        <div className="text-[11px] text-ink-3">degraded probes: {Object.keys(data.errors).join(", ")}</div>
      )}
    </PageShell>
  );
}
