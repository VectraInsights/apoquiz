"use client";

import type { ReactNode } from "react";

import { Logo } from "./ui";

/**
 * Logo + acoes no fluxo da pagina.
 *
 * Nao e um cabecalho: nao tem fundo, nao tem borda e nao fica fixo no
 * topo. Cada tela renderiza essa linha dentro do proprio conteudo, como
 * se fosse parte da pagina.
 */
export function BrandBar({ actions }: { actions?: ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <Logo />
      <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
    </div>
  );
}
