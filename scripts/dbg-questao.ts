/**
 * Para cada questao que sumiu (existe no golden e nao no novo), localiza a
 * pagina onde o golden a encontrou e imprime as linhas das duas versoes
 * lado a lado. Responde "o que aconteceu na pagina exata do problema".
 *
 * Uso: npx tsx scripts/dbg-questao.ts <golden.json> <novo.json> [limite]
 */
import { readFile } from "node:fs/promises";

import type { ExtractedPage } from "@/lib/pdf/lines";
import { parseQuestions, detectGabarito } from "@/lib/pdf/parser";

async function load(path: string): Promise<ExtractedPage[]> {
  return JSON.parse(await readFile(path, "utf8")) as ExtractedPage[];
}

async function main() {
  const [goldenPath, novoPath, limiteArg] = process.argv.slice(2);
  if (!goldenPath || !novoPath) {
    console.error("uso: tsx dbg-questao.ts <golden.json> <novo.json> [limite]");
    process.exit(1);
  }

  const limite = Number(limiteArg ?? 4);
  const [golden, novo] = await Promise.all([load(goldenPath), load(novoPath)]);

  const qsGolden = parseQuestions(golden);
  const qsNovo = parseQuestions(novo);
  const g = detectGabarito(golden);

  const chave = (q: { section: string | null; number: number | null }) =>
    `${q.section}#${q.number}`;

  const lidasNovo = new Set(qsNovo.filter((q) => q.number !== null).map(chave));
  const faltando = Object.keys(g.gabarito).filter((k) => !lidasNovo.has(k));

  console.log(`faltando: ${faltando.length}`);

  const porChave = new Map<string, { page: number | null }>();
  for (const q of qsGolden) {
    if (q.number === null || q.section === null) continue;
    porChave.set(chave(q), { page: q.page });
  }

  const paginas = new Set<number>();
  for (const k of faltando.slice(0, 40)) {
    const info = porChave.get(k);
    const pagina = info?.page ?? null;
    console.log(`  ${k} -> pagina ${pagina ?? "?"}`);
    if (pagina !== null) paginas.add(pagina);
  }

  for (const pagina of [...paginas].slice(0, limite)) {
    const g = golden[pagina - 1];
    const n = novo[pagina - 1];
    const setG = new Set(g.lines.map((l) => l.text));
    const setN = new Set(n.lines.map((l) => l.text));

    console.log(`\n===== p${pagina}  golden=${g.lines.length} novo=${n.lines.length} =====`);
    console.log("--- SO NO GOLDEN ---");
    for (const l of g.lines) if (!setN.has(l.text)) console.log(`  | ${l.text.slice(0, 100)}`);
    console.log("--- SO NO NOVO ---");
    for (const l of n.lines) if (!setG.has(l.text)) console.log(`  | ${l.text.slice(0, 100)}`);
    console.log(`--- FLAGS: golden.duplicated=${g.duplicated ?? "-"} novo.duplicated=${n.duplicated ?? "-"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
