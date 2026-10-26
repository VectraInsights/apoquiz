"use client";

import type { ReactNode } from "react";

import { Logo } from "./ui";

/** Versao atual do aplicativo. Incrementar a cada modificacao visivel. */
export const APP_VERSION = "2.12";

/**
 * Logo + acoes no fluxo da pagina.
 *
 * Nao e um cabecalho: nao tem fundo, nao tem borda e nao fica fixo no
 * topo. Cada tela renderiza essa linha dentro do proprio conteudo, como
 * se fosse parte da pagina.
 */
export function BrandBar({
  actions,
  onLogoClick,
}: {
  actions?: ReactNode;
  /** Clique na logo leva para a home. */
  onLogoClick?: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      {onLogoClick ? (
        <button
          type="button"
          onClick={onLogoClick}
          title="Ir para o início"
          aria-label="Ir para o início"
          className="rounded-xl transition hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Logo />
          <span className="ml-2 text-xs font-mono text-brand-soft/60">v{APP_VERSION}</span>
        </button>
      ) : (
        <>
          <Logo />
          <span className="ml-2 text-xs font-mono text-brand-soft/60">v{APP_VERSION}</span>
        </>
      )}
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}
