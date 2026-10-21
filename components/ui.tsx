"use client";

import type { ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative grid size-9 shrink-0 place-items-center">
        <span className="absolute inset-0 rounded-full bg-brand/25 blur-[10px]" />
        <svg viewBox="0 0 24 24" className="relative size-7" fill="none" aria-hidden>
          <defs>
            <linearGradient
              id="apoquiz-glass"
              x1="4"
              y1="2"
              x2="19"
              y2="18"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#C4B5FD" />
              <stop offset="0.45" stopColor="#8B7CFF" />
              <stop offset="1" stopColor="#3B82F6" />
            </linearGradient>
            <linearGradient
              id="apoquiz-base"
              x1="9"
              y1="19"
              x2="15"
              y2="22"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FDE68A" />
              <stop offset="1" stopColor="#F59E0B" />
            </linearGradient>
          </defs>

          {/* vidro da lampada */}
          <path
            d="M12 2C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7Z"
            fill="url(#apoquiz-glass)"
          />

          {/* base */}
          <path
            d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1Z"
            fill="url(#apoquiz-base)"
          />

          {/* interrogacao dentro da lampada */}
          <path
            d="M9.4 8.2A2.6 2.6 0 0 1 14.56 7.75L12.45 10.5"
            stroke="#fff"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12.2" cy="12.5" r="1.05" fill="#fff" />

          {/* faisca de ideia */}
          <path
            d="M19.8 2.3c.2 1.1.6 1.5 1.7 1.7-1.1.2-1.5.6-1.7 1.7-.2-1.1-.6-1.5-1.7-1.7 1.1-.2 1.5-.6 1.7-1.7Z"
            fill="#34D399"
          />
        </svg>
      </span>
      <span className="font-round text-[17px] font-bold tracking-tight">
        Apo<span className="text-brand-soft">Quiz</span>
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
    <div className="panel-soft px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-ink-faint">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${tones[tone]}`}>
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
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${
            checked ? "left-5" : "left-0.5"
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
