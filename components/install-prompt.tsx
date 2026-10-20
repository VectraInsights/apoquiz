"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Registra o service worker e oferece a instalacao do app na tela de
 * inicio (Android/Chrome: botao de instalar; iOS/Safari: instrucao de
 * "Adicionar a Tela de Inicio").
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Registra o service worker (libera o uso offline).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sem service worker: o app continua funcionando online.
      });
    }

    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const ios =
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (dismissed) return null;

  if (ios) {
    return (
      <div className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-line bg-panel/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur sm:inset-x-auto sm:right-4">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xs leading-relaxed text-ink-muted">
            Para instalar o ApoQuiz no iPhone: toque em{" "}
            <strong className="text-ink">Compartilhar</strong> e depois em{" "}
            <strong className="text-ink">&ldquo;Adicionar &agrave; Tela de Início&rdquo;</strong>.
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Fechar"
            className="text-ink-faint transition hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  if (!event) return null;

  return (
    <div className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-panel/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur sm:inset-x-auto sm:right-4">
      <div className="flex-1 text-xs leading-relaxed text-ink-muted">
        <strong className="text-ink">Instale o ApoQuiz</strong> e estude offline,
        direto da tela de início do celular.
      </div>
      <button
        type="button"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setEvent(null);
        }}
        className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
      >
        <Download className="size-3.5" />
        Instalar
      </button>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          setEvent(null);
        }}
        aria-label="Fechar"
        className="text-ink-faint transition hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
