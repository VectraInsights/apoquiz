"use client";

import { Loader2, LogIn, LogOut } from "lucide-react";

import type { AuthState } from "@/lib/supabase/use-auth";

export function AuthButton({
  auth,
  compact = false,
}: {
  auth: AuthState;
  compact?: boolean;
}) {
  if (!auth.configured) return null;

  if (auth.loading) {
    return (
      <span className="grid size-9 place-items-center text-ink-faint">
        <Loader2 className="size-4 animate-spin" />
      </span>
    );
  }

  if (auth.user) {
    const name =
      auth.user.user_metadata?.full_name ?? auth.user.email ?? "Você";
    const initial = name.trim().charAt(0).toUpperCase() || "?";

    return (
      <div className="flex items-center gap-1.5">
        <span
          title={name}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-sm font-semibold text-white"
        >
          {initial}
        </span>
        <button
          type="button"
          onClick={() => void auth.signOut()}
          title="Sair"
          aria-label="Sair da conta"
          className="grid size-9 place-items-center rounded-lg border border-line text-ink-muted transition hover:border-line hover:text-ink"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {auth.error ? (
        <span
          title={auth.error}
          className="max-w-[190px] truncate text-[11px] text-warn sm:max-w-xs"
        >
          {auth.error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => void auth.signIn()}
        className="btn btn-ghost"
        title="Entrar com Google para sincronizar entre aparelhos"
      >
        <LogIn className="size-4" />
        {compact ? "Entrar" : "Entrar com Google"}
      </button>
    </div>
  );
}
