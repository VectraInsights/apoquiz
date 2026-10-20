"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Info, TriangleAlert, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac: so o touchPoints revela que e iPad.
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * Brave no Android nao instala PWA de verdade: cria apenas um atalho na
 * tela inicial (brave/brave-browser#56133 e #7357). O evento
 * beforeinstallprompt continua disparando e a tela "instalando" aparece,
 * mas nenhuma aplicacao e instalada.
 */
function detectBrave(): boolean {
  if (typeof navigator === "undefined") return false;
  const brave = (navigator as unknown as { brave?: { isBrave?: boolean } }).brave;
  if (brave?.isBrave) return true;
  return /Brave\//i.test(navigator.userAgent);
}

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches === true) {
    return true;
  }
  // iOS Safari usa o navigator.standalone
  return (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Instalacao do app (PWA).
 *
 * Android/Chrome: dispara o dialogo nativo de instalacao.
 * Brave (Android): mostra o aviso de que so sera criado um atalho.
 * iPhone/Safari: mostra o caminho manual (o Safari nao tem dialogo nativo).
 * Qualquer navegador: o botao do cabecalho sempre mostra as instrucoes.
 */
export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [used, setUsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Registra o service worker (libera o uso offline e a instalacao).
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sem service worker: o app continua funcionando online.
      });
    }

    const onPrompt = (raw: Event) => {
      // Sem preventDefault o Chrome mostra o mini-infobar; com ele, o
      // evento fica sob nosso controle.
      raw.preventDefault();
      setEvent(raw as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setJustInstalled(true);
      setEvent(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // A deteccao de plataforma acontece depois da hidratacao, para o
    // servidor e o cliente concordarem.
    const timer = window.setTimeout(() => setReady(true), 0);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const platform = ready ? detectIos() : false;
  const brave = ready ? detectBrave() : false;
  const alreadyInstalled = justInstalled || (ready && isInstalled());

  const install = useCallback(async () => {
    // No Brave o dialogo nativo nao instala nada: vai direto para as
    // instrucoes, em vez de prometer uma instalacao que nao acontece.
    if (!event || brave) {
      setPanelOpen(true);
      return;
    }

    try {
      await Promise.race([
        event.prompt(),
        // Se o navegador travar sem resolver, nao ficamos esperando.
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 4000),
        ),
      ]);
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        setUsed(true);
        setEvent(null);
        setDismissed(true);
        return;
      }
    } catch {
      // O evento so pode ser usado uma vez. Se o Chrome recusou (ja
      // recusado antes, ou a pagina nao esta mais preparada), cai no
      // caminho manual.
    }

    // Deu ruim: mostra o caminho manual.
    setEvent(null);
    setPanelOpen(true);
  }, [event, brave]);

  // Banner automatico: so quando o navegador realmente pode instalar.
  const showBanner = Boolean(event) && !used && !dismissed && !panelOpen;

  return (
    <>
      {alreadyInstalled ? null : (
        <button
          type="button"
          onClick={() => void install()}
          title="Instalar o app no celular"
          aria-label="Instalar o app no celular"
          className="grid size-9 place-items-center rounded-lg border border-line text-ink-muted transition hover:border-brand/50 hover:text-ink"
        >
          <Download className="size-4" />
        </button>
      )}

      {showBanner ? (
        <div className="no-print fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-panel/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur sm:inset-x-auto sm:right-4">
          <div className="flex-1 text-xs leading-relaxed text-ink-muted">
            {brave ? (
              <>
                <strong className="text-ink">Adicione à tela inicial</strong> e
                estude offline direto do celular.{" "}
                <span className="text-warn">
                  No Brave isso vira um atalho — o app em si instala pelo Chrome.
                </span>
              </>
            ) : (
              <>
                <strong className="text-ink">Instale o ApoQuiz</strong> e estude
                offline, direto da tela de início do celular.
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => void install()}
            className="btn btn-primary min-h-9 px-3 py-1.5 text-xs"
          >
            <Download className="size-3.5" />
            {brave ? "Como adicionar" : "Instalar"}
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
      ) : null}

      {panelOpen ? (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">Instalar o ApoQuiz</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fechar"
                className="text-ink-faint transition hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            {brave ? (
              <>
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-warn">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    O <strong>Brave</strong> no Android não instala aplicativos:
                    ele cria apenas um <strong>atalho</strong> na tela inicial.
                    É uma limitação do navegador, não do app.
                  </span>
                </p>

                <ol className="mt-4 space-y-2.5 text-sm leading-relaxed text-ink-muted">
                  <li>
                    <strong className="text-ink">1.</strong> No Brave, toque no
                    menu <strong className="text-ink">⋮</strong> e em{" "}
                    <strong className="text-ink">
                      &ldquo;Adicionar à tela inicial&rdquo;
                    </strong>
                    . O atalho do ApoQuiz é criado na tela inicial e abre o app
                    (o offline funciona).
                  </li>
                  <li>
                    <strong className="text-ink">2.</strong> Se o Brave mostrar
                    &ldquo;Instalar app&rdquo; e nada acontecer, ele está
                    tentando criar o aplicativo e falhando. Nesse caso,{" "}
                    <strong className="text-ink">
                      desligue a internet (modo avião) e repita
                    </strong>{" "}
                    — sem manifesto disponível, o Brave cria o atalho
                    normalmente.
                  </li>
                  <li>
                    <strong className="text-ink">3.</strong> Para instalar de
                    verdade (ícone próprio, tela cheia, sem barra do
                    navegador), abra o{" "}
                    <strong className="text-ink">Chrome</strong> no mesmo
                    celular neste mesmo link — lá funciona de primeira.
                  </li>
                </ol>
              </>
            ) : platform ? (
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-muted">
                <li>
                  <strong className="text-ink">1.</strong> Toque em{" "}
                  <strong className="text-ink">Compartilhar</strong> (o quadrado
                  com a seta para cima, na barra do Safari).
                </li>
                <li>
                  <strong className="text-ink">2.</strong> Role e toque em{" "}
                  <strong className="text-ink">
                    &ldquo;Adicionar &agrave; Tela de Início&rdquo;
                  </strong>
                  .
                </li>
                <li>
                  <strong className="text-ink">3.</strong> Toque em{" "}
                  <strong className="text-ink">Adicionar</strong>. Pronto — o
                  ApoQuiz abre em tela cheia, como um app.
                </li>
              </ol>
            ) : (
              <ol className="mt-3 space-y-2.5 text-sm leading-relaxed text-ink-muted">
                <li>
                  <strong className="text-ink">1.</strong> Toque no menu{" "}
                  <strong className="text-ink">⋮</strong> do navegador (canto
                  superior direito).
                </li>
                <li>
                  <strong className="text-ink">2.</strong> Toque em{" "}
                  <strong className="text-ink">
                    &ldquo;Instalar app&rdquo; ou{" "}
                    &ldquo;Adicionar &agrave; tela inicial&rdquo;
                  </strong>
                  .
                </li>
                <li>
                  <strong className="text-ink">3.</strong> Confirme. O ApoQuiz
                  passa a abrir em tela cheia, como um app.
                </li>
              </ol>
            )}

            <p className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-canvas-soft p-3 text-xs text-ink-faint">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              O app também funciona offline depois de instalado — a apostila que
              você já abriu continua disponível sem internet.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
