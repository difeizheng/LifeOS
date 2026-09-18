"use client";

import { Suspense, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import MarkdownRenderer from "@/components/wiki/MarkdownRenderer";
import { Zap, ArrowLeft, Pencil, Check, X, Loader2 } from "lucide-react";
import Link from "next/link";
import {
  PageShell,
  PageHeader,
  Panel,
  StatTile,
  TabBar,
  Pill,
  dimStyle,
  type Dim,
} from "@/components/ui/chrome";

interface SkillMeta {
  name: string;
  dir?: string;
  description: string;
  effort: string;
  hasWorkflows: boolean;
  lastModified: string;
}

// A skill is "private" purely by naming convention: its on-disk directory
// starts with "_" and the rest is all-caps (e.g. _EXAMPLE, _MY_TOOL).
// No skill names are hardcoded — whatever the user has that matches shows up.
function isPrivateSkill(skill: SkillMeta): boolean {
  const key = skill.dir ?? skill.name;
  return key.startsWith("_") && key === key.toUpperCase();
}

interface SkillDetail {
  name: string;
  description: string;
  effort: string;
  content: string;
  filePath: string;
  lastModified: string;
  wordCount: number;
}

function effortDim(effort: string): Dim {
  if (effort === "easy" || effort === "low") return "ok";
  if (effort === "hard" || effort === "high") return "err";
  return "neutral";
}

function SkillsLanding({ skills }: { skills: SkillMeta[] }) {
  const [tab, setTab] = useState<"public" | "private">("public");
  const privateSkills = skills.filter(isPrivateSkill);
  const publicSkills = skills.filter((s) => !isPrivateSkill(s));
  const active = tab === "public" ? publicSkills : privateSkills;

  return (
    <PageShell>
      <PageHeader
        title="技能"
        icon={Zap}
        subtitle="按触发短语激活的领域能力。每个技能将提示词、工作流、工具与模板打包为独立单元。"
      />

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 220px))" }}>
        <StatTile label="技能" value={skills.length} icon={Zap} dim="creative" />
      </div>

      <TabBar
        tabs={[
          { id: "public", label: "公开", dim: "blue", hint: publicSkills.length },
          { id: "private", label: "私有", dim: "creative", hint: privateSkills.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "private" && (
        <p className="-mt-2 text-[13px] text-ink-3">
          以 _ 开头且全大写 — 个人集成与平台特定自动化，从你的技能目录实时读取。
        </p>
      )}

      {/* Private skills describe personal domains — Observer mode blurs them. */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        data-sensitive={tab === "private" ? "" : undefined}
      >
        {active.map((skill) => (
          <SkillCard key={skill.name} skill={skill} />
        ))}
      </div>
    </PageShell>
  );
}

function SkillCard({ skill }: { skill: SkillMeta }) {
  return (
    <Link href={`/skills?name=${encodeURIComponent(skill.name)}`} className="block">
      <Panel hover className="h-full flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Zap className="w-4 h-4 shrink-0 text-dim-creative" />
          <span className="font-medium text-ink-1 truncate">{skill.name}</span>
        </div>
        <p className="text-[13px] leading-relaxed text-ink-2">
          {skill.description.slice(0, 140)}
          {skill.description.length > 140 ? "…" : ""}
        </p>
        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <Pill dim={effortDim(skill.effort)}>{skill.effort}</Pill>
          {skill.hasWorkflows && <Pill dim="relationships">工作流</Pill>}
        </div>
      </Panel>
    </Link>
  );
}

function SkillDetailView({ skill }: { skill: SkillDetail }) {
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(skill.content);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/wiki/skills/${encodeURIComponent(skill.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("保存失败");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["skill-detail", skill.name] });
      setEditing(false);
    },
  });

  const btnBase =
    "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium cursor-pointer";

  const isPrivate = skill.name.startsWith("_") && skill.name === skill.name.toUpperCase();

  return (
    <div
      className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-6 flex flex-col gap-4"
      data-sensitive={isPrivate ? "" : undefined}
    >
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/skills" className="text-ink-2 hover:text-ink-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-ink-1">{skill.name}</h1>
            <p className="mt-0.5 text-[13px] text-ink-2">
              {skill.wordCount} 字 ·{" "}
              {new Date(skill.lastModified).toLocaleDateString("zh-CN", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={() => mutation.mutate(editContent)}
                disabled={mutation.isPending}
                className={btnBase}
                style={{
                  ...dimStyle("ok"),
                  cursor: mutation.isPending ? "not-allowed" : "pointer",
                  opacity: mutation.isPending ? 0.6 : 1,
                }}
              >
                {mutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                保存
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setEditContent(skill.content);
                }}
                className={btnBase}
                style={dimStyle("neutral")}
              >
                <X className="w-4 h-4" />
                取消
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setEditing(true);
                setEditContent(skill.content);
              }}
              className={btnBase}
              style={dimStyle("neutral")}
            >
              <Pencil className="w-4 h-4" />
              编辑
            </button>
          )}
        </div>
      </div>

      {mutation.isError && (
        <div className="px-3 py-2 rounded-md text-[13px]" style={dimStyle("err")}>
          保存更改失败。
        </div>
      )}

      {editing ? (
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          className="w-full h-[600px] rounded-lg p-4 text-sm mono resize-y bg-surface-1 border border-line-2 text-ink-1 outline-none"
          spellCheck={false}
        />
      ) : (
        <Panel>
          <div className="prose prose-invert max-w-none">
            <MarkdownRenderer content={skill.content} />
          </div>
        </Panel>
      )}
    </div>
  );
}

function SkillsPageInner() {
  const searchParams = useSearchParams();
  const skillName = searchParams.get("name");
  const isViewing = !!skillName;

  const { data: listData } = useQuery<{ skills: SkillMeta[]; total: number }>({
    queryKey: ["skills-list"],
    queryFn: async () => {
      const res = await fetch("/api/wiki/skills");
      if (!res.ok) throw new Error("获取技能列表失败");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !isViewing,
  });

  const { data: detailData } = useQuery<SkillDetail>({
    queryKey: ["skill-detail", skillName],
    queryFn: async () => {
      const res = await fetch(`/api/wiki/skills/${encodeURIComponent(skillName!)}`);
      if (!res.ok) throw new Error("获取技能详情失败");
      return res.json();
    },
    enabled: isViewing,
  });

  if (isViewing && detailData) {
    return <SkillDetailView skill={detailData} />;
  }

  if (!isViewing && listData) {
    return <SkillsLanding skills={listData.skills} />;
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-sm text-ink-3">加载中…</div>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <div className="text-sm text-ink-3">加载中…</div>
        </div>
      }
    >
      <SkillsPageInner />
    </Suspense>
  );
}
