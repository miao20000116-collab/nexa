"use client";

import Link from "next/link";
import { useState } from "react";

export interface CreditsConfirmState {
  estimateMessage: string;
  estimatedCredits: number | null;
  pending: boolean;
  loginRequired: boolean;
}

export function useCreditsConfirm(initialMessage = "") {
  const [state, setState] = useState<CreditsConfirmState>({
    estimateMessage: initialMessage,
    estimatedCredits: null,
    pending: false,
    loginRequired: false,
  });

  const applyGateResponse = (data: {
    ok?: boolean;
    code?: string;
    message?: string;
    error?: string;
    estimate?: { message?: string; estimatedCredits?: number };
  }) => {
    const message =
      data.estimate?.message ?? data.message ?? data.error ?? "请确认后继续";

    if (data.code === "confirm_required") {
      setState({
        estimateMessage: message,
        estimatedCredits: data.estimate?.estimatedCredits ?? null,
        pending: true,
        loginRequired: false,
      });
      return true;
    }
    if (data.code === "login_required") {
      setState({
        estimateMessage: message,
        estimatedCredits: null,
        pending: true,
        loginRequired: true,
      });
      return true;
    }
    setState((s) => ({ ...s, pending: false, loginRequired: false }));
    return false;
  };

  const reset = () =>
    setState({
      estimateMessage: "",
      estimatedCredits: null,
      pending: false,
      loginRequired: false,
    });

  return { state, applyGateResponse, reset, setState };
}

export function CreditsConfirmPanel({
  message,
  estimatedCredits: _estimatedCredits,
  onConfirm,
  onCancel,
  busy,
  loginRequired,
}: {
  message: string;
  /** Kept for call-site compat; UI only shows `message`. */
  estimatedCredits?: number | null;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
  loginRequired?: boolean;
}) {
  if (loginRequired) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-4 py-3">
        <p className="text-[13px] text-amber-900">{message}</p>
        <Link
          href="/account/login"
          className="mt-2 inline-block text-[13px] font-medium text-zinc-900 underline"
        >
          登录后继续
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3">
      <p className="text-[13px] text-zinc-700">{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
        >
          {busy ? "执行中…" : "确认并执行"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-white"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}
