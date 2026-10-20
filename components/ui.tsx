"use client";

import type { ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid place-items-center size-9 rounded-xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-lg shadow-brand/25">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path
            d="M5 4.75h9.2L19 9.5v9.75H5V4.75Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M14 4.75V9.5h5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="m8.4 14.6 2.1 2.1 4.6-4.7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-tight text-[15px]">ApoQuiz</span>
        <span className="text-[11px] text-ink-faint">PDF → quiz com gabarito</span>
      </span>
    </span>
  );
}

export function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "ok" | "bad" | "warn" | "brand";
}) {
  const tones: Record<string, string> = {
    default: "text-ink",
    ok: "text-ok",
    bad: "text-bad",
    warn: "text-warn",
    brand: "text-brand-soft",
  };

  return (
    <div className="panel-soft px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tones[tone]}`}>
        {value}
      </p>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] p-3 transition hover:border-line hover:bg-white/[0.04]">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
          checked ? "bg-brand" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${
            checked ? "left-4.5" : "left-0.5"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-xs text-ink-faint">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "bad" | "brand" | "warn";
}) {
  const tones: Record<string, string> = {
    neutral: "border-line text-ink-muted",
    ok: "border-ok/40 text-ok bg-ok/10",
    bad: "border-bad/40 text-bad bg-bad/10",
    brand: "border-brand/40 text-brand-soft bg-brand/10",
    warn: "border-warn/40 text-warn bg-warn/10",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
