"use client";

import { useEffect, useRef, useState } from "react";
import { Library, Loader2, LogIn, LogOut } from "lucide-react";

import type { AuthState } from "@/lib/supabase/use-auth";

export function AuthButton({
  auth,
  compact = false,
  onMyQuizzes,
}: {
  auth: AuthState;
  compact?: boolean;
  /** Leva para a lista de quizzes (tela inicial). */
  onMyQuizzes?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    const email = auth.user.email ?? "";
    const initial = name.trim().charAt(0).toUpperCase() || "?";

    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          title={name}
          aria-label="Abrir menu da conta"
          aria-haspopup="menu"
          aria-expanded={open}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-sm font-semibold text-white transition hover:brightness-110"
        >
          {initial}
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
          >
            <div className="border-b border-line px-3.5 py-3">
              <p className="truncate text-sm font-medium">{name}</p>
              {email ? (
                <p className="mt-0.5 truncate text-xs text-ink-faint">{email}</p>
              ) : null}
            </div>

            <div className="p-1.5">
              {onMyQuizzes ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onMyQuizzes();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink"
                >
                  <Library className="size-4 shrink-0" />
                  Meus quizzes
                </button>
              ) : null}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void auth.signOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink"
              >
                <LogOut className="size-4 shrink-0" />
                Sair da conta
              </button>
            </div>
          </div>
        ) : null}
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
