"use client";

import { useEffect, useState } from "react";
import { Sparkles, MessageSquare, FolderOpen, X } from "lucide-react";

interface OnboardingState {
  templateMode: boolean;
  daName: string;
  interviewCommand: string;
}

const DISMISSED_KEY = "pai:template-onboarding:dismissed";

export default function TemplateOnboarding() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem(DISMISSED_KEY) === "1") {
      setDismissed(true);
    }
    fetch("/api/onboarding/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setState(d))
      .catch(() => setState(null));
  }, []);

  if (!state || !state.templateMode || dismissed) return null;

  const handleDismiss = () => {
    window.sessionStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const daName = state.daName || "你的 DA";
  const cmd = state.interviewCommand || "/interview";

  return (
    <div className="border-b border-blue-500/30 bg-gradient-to-r from-blue-950/60 via-[rgba(6,11,26,0.7)] to-blue-950/60">
      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-blue-500/15 p-2 mt-0.5 shrink-0">
            <Sparkles className="w-4 h-4 text-blue-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-blue-50">
                你正在查看模板内容。
              </span>
              <span className="text-sm text-ink-2">
                这是 Pulse 在你自定义之前的样子。
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-x-5 gap-y-1.5 flex-wrap text-[13px]">
              <span className="flex items-center gap-1.5 text-ink-2">
                <MessageSquare className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                与 <span className="text-blue-200 font-medium">{daName}</span> 对话 — 运行
                <code className="px-1.5 py-0.5 rounded bg-surface-3 text-blue-200 text-xs font-mono">
                  {cmd}
                </code>
                来引导你完成 TELOS、身份、目标和项目的设置。
              </span>
              <span className="flex items-center gap-1.5 text-ink-2">
                <FolderOpen className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                或直接编辑
                <code className="px-1.5 py-0.5 rounded bg-surface-3 text-blue-200 text-xs font-mono">
                  ~/.claude/LIFEOS/USER/
                </code>
                。
              </span>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="本次会话隐藏"
            className="shrink-0 rounded-md text-ink-3 hover:text-ink-1 hover:bg-surface-3 p-1.5 transition-colors"
            title="本次会话隐藏 — 在你自定义 USER/ 文件之前，横幅会持续显示"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
