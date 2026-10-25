/**
 * Compara dois caches de linhas (golden vs atual) e mostra, pagina a
 * pagina, que linhas o codigo novo deixou de extrair. E a ferramenta que
 * responde "o que ainda esta sendo removido a mais que a referencia".
 *
 * Uso: npx tsx scripts/dbg-diff.ts <golden.json> <novo.json> [limite]
 */
import { readFile } from "node:fs/promises";

import type { ExtractedPage } from "@/lib/pdf/lines";

async function load(path: string): Promise<ExtractedPage[]> {
  return JSON.parse(await readFile(path, "utf8")) as ExtractedPage[];
}

function chave(page: ExtractedPage): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of page.lines) {
    const texto = line.text.trim();
    if (!texto) continue;
    counts.set(texto, (counts.get(texto) ?? 0) + 1);
  }
  return counts;
}

/** Linhas que existem no golden e nao existem (ou tem menos copias) no novo. */
function faltando(
  antigo: Map<string, number>,
  novo: Map<string, number>,
): string[] {
  const saida: string[] = [];
  for (const [texto, qtd] of antigo) {
    const agora = novo.get(texto) ?? 0;
    for (let i = agora; i < qtd; i += 1) saida.push(texto);
  }
  return saida;
}

async function main() {
  const [goldenPath, novoPath, limiteArg] = process.argv.slice(2);
  if (!goldenPath || !novoPath) {
    console.error("uso: tsx dbg-diff.ts <golden.json> <novo.json> [limite]");
    process.exit(1);
  }

  const limite = Number(limiteArg ?? 12);
  const [golden, novo] = await Promise.all([load(goldenPath), load(novoPath)]);

  const totalGolden = golden.reduce((soma, p) => soma + p.lines.length, 0);
  const totalNovo = novo.reduce((soma, p) => soma + p.lines.length, 0);

  console.log(`paginas: ${golden.length} / ${novo.length}`);
  console.log(`linhas:  golden=${totalGolden}  novo=${totalNovo}  (${totalNovo - totalGolden})`);

  const comFalta: { pagina: number; faltando: string[]; aMais: string[] }[] = [];

  for (let i = 0; i < Math.min(golden.length, novo.length); i += 1) {
    const antigo = chave(golden[i]);
    const atual = chave(novo[i]);
    const faltam = faltando(antigo, atual);
    const sobram = faltando(atual, antigo);
    if (faltam.length > 0 || sobram.length > 0) {
      comFalta.push({ pagina: i + 1, faltando: faltam, aMais: sobram });
    }
  }

  const soFalta = comFalta.filter((p) => p.faltando.length > 0);
  const soMais = comFalta.filter((p) => p.aMais.length > 0);

  console.log(`paginas com linha a menos: ${soFalta.length}`);
  console.log(`paginas com linha a mais:  ${soMais.length}`);
  console.log(`soma de linhas a menos:    ${soFalta.reduce((s, p) => s + p.faltando.length, 0)}`);

  console.log("\n--- paginas com LINHA A MENOS ---");
  for (const item of soFalta.slice(0, limite)) {
    console.log(`\np${item.pagina} (-${item.faltando.length}):`);
    for (const texto of item.faltando.slice(0, 6)) {
      console.log(`   - ${texto.slice(0, 110)}`);
    }
  }

  console.log("\n--- paginas com LINHA A MAIS ---");
  for (const item of soMais.slice(0, limite)) {
    console.log(`\np${item.pagina} (+${item.aMais.length}):`);
    for (const texto of item.aMais.slice(0, 4)) {
      console.log(`   + ${texto.slice(0, 110)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
