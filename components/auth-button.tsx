"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{
    texto: string;
    tipo: "erro" | "aviso" | "ok";
  } | null>(null);
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

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (enviando) return;

    if (!email.trim() || !senha) {
      setMensagem({ texto: "Preencha o e-mail e a senha.", tipo: "erro" });
      return;
    }

    setEnviando(true);
    setMensagem(null);

    const resultado =
      modo === "entrar"
        ? await auth.signInWithEmail(email, senha)
        : await auth.signUpWithEmail(email, senha);

    setEnviando(false);

    if (resultado.ok) {
      setMensagem(null);
      setSenha("");
      return;
    }

    setMensagem({
      texto: resultado.message ?? "Não foi possível entrar.",
      tipo: resultado.needsConfirm ? "aviso" : "erro",
    });
    if (resultado.needsConfirm) setModo("entrar");
  };

  const campo =
    "w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-sm outline-none transition placeholder:text-ink-faint focus:border-brand";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setMensagem(null);
          setOpen((value) => !value);
        }}
        className="btn btn-ghost"
        title="Entrar para sincronizar entre aparelhos"
        aria-expanded={open}
      >
        <LogIn className="size-4" />
        {compact ? "Entrar" : "Entrar"}
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[19rem] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
          role="dialog"
          aria-label="Entrar na conta"
        >
          <div className="p-3.5">
            <p className="text-sm font-semibold">
              {modo === "entrar" ? "Entrar" : "Criar conta"}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              Seus quizzes sincronizam entre o celular e o computador.
            </p>

            <button
              type="button"
              onClick={() => void auth.signIn()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-canvas-soft px-3 py-2 text-sm font-medium transition hover:border-brand"
            >
              <LogIn className="size-4" />
              Continuar com Google
            </button>

            <div className="my-3 flex items-center gap-2 text-[11px] text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={enviar} className="space-y-2">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="E-mail"
                className={campo}
              />
              <input
                type="password"
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="Senha (mínimo 6 caracteres)"
                className={campo}
              />

              {mensagem ? (
                <p
                  className={`text-xs leading-relaxed ${
                    mensagem.tipo === "erro"
                      ? "text-bad"
                      : mensagem.tipo === "aviso"
                        ? "text-warn"
                        : "text-ok"
                  }`}
                >
                  {mensagem.texto}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={enviando}
                className="btn btn-primary w-full justify-center"
              >
                {enviando ? <Loader2 className="size-4 animate-spin" /> : null}
                {modo === "entrar" ? "Entrar com e-mail" : "Criar conta"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setMensagem(null);
                setModo((valor) => (valor === "entrar" ? "criar" : "entrar"));
              }}
              className="mt-2.5 w-full text-center text-xs text-brand-soft transition hover:underline"
            >
              {modo === "entrar"
                ? "Não tem conta? Criar agora"
                : "Já tem conta? Entrar"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
