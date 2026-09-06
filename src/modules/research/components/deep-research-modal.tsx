"use client";

import { useState } from "react";
import { UI } from "@/lib/ui-copy";
import type {
  ResearchReportType,
  ResearchScope,
  ResearchTimeRange,
} from "@/modules/workspace/types";
import {
  RESEARCH_REPORT_OPTIONS,
  RESEARCH_SCOPE_OPTIONS,
  RESEARCH_TIME_OPTIONS,
} from "../constants";

export interface DeepResearchConfig {
  goal: string;
  scope: ResearchScope;
  timeRange: ResearchTimeRange;
  reportType: ResearchReportType;
  customFrom?: string;
  customTo?: string;
}

interface DeepResearchModalProps {
  open: boolean;
  initialGoal: string;
  onClose: () => void;
  onSubmit: (config: DeepResearchConfig) => Promise<void> | void;
  submitting?: boolean;
}

export function DeepResearchModal({
  open,
  initialGoal,
  onClose,
  onSubmit,
  submitting = false,
}: DeepResearchModalProps) {
  const [goal, setGoal] = useState(initialGoal);
  const [scope, setScope] = useState<ResearchScope>("workspace");
  const [timeRange, setTimeRange] = useState<ResearchTimeRange>("all");
  const [reportType, setReportType] = useState<ResearchReportType>("full");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  if (!open) return null;

  const handleSubmit = async () => {
    if (!goal.trim()) return;
    await onSubmit({
      goal: goal.trim(),
      scope,
      timeRange,
      reportType,
      customFrom: timeRange === "custom" ? customFrom : undefined,
      customTo: timeRange === "custom" ? customTo : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl">
        <h3 className="mb-6 text-[17px] font-semibold text-zinc-900">
          {UI.workspace.research}
        </h3>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[13px] text-zinc-500">研究目标</span>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px] outline-none focus:border-zinc-300"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[13px] text-zinc-500">资料范围</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as ResearchScope)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
          >
            {RESEARCH_SCOPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[13px] text-zinc-500">时间范围</span>
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as ResearchTimeRange)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
          >
            {RESEARCH_TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {timeRange === "custom" && (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-zinc-500">开始</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-zinc-500">结束</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
              />
            </label>
          </div>
        )}

        <label className="mb-6 block">
          <span className="mb-1.5 block text-[13px] text-zinc-500">输出形式</span>
          <select
            value={reportType}
            onChange={(e) =>
              setReportType(e.target.value as ResearchReportType)
            }
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-[14px]"
          >
            {RESEARCH_REPORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[14px] text-zinc-500"
            type="button"
          >
            {UI.common.cancel}
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || !goal.trim()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-[14px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            type="button"
          >
            开始研究
          </button>
        </div>
      </div>
    </div>
  );
}
