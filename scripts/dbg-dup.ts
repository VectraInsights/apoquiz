/**
 * Mede, por pagina, os sinais de "duas renderizacoes" que a correcao vai
 * usar como gate: repeticao de texto (fases 2a/2b), cluster geometrico
 * (fase 2c) e sobreposicao real de retangulos.
 *
 * Uso: npx tsx scripts/dbg-dup.ts <arquivo.pdf> [limitePaginas]
 */
import { readFile } from "node:fs/promises";

import { removeDuplicatedLayout, type RawItem } from "@/lib/pdf/lines";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:!?()[\]·"'-]/g, "");

const SECTION_TITLE_ITEM = /^\d+(?:\.\d+){1,2}\s+\S/;

type Medida = {
  pagina: number;
  itens: number;
  /** itens que as fases 2a/2b removeriam (texto repetido/contido) */
  texto: number;
  /** itens que a fase 2c removeria (geometria) */
  geometria: number;
  /** pares de retangulos com textos diferentes que se sobrepoe */
  sobreposicao: number;
  removidos: number;
};

function medirPagina(items: RawItem[]): Omit<Medida, "pagina"> {
  const todos = new Map<string, RawItem[]>();
  for (const item of items) {
    const key = normalize(item.str);
    if (!key) continue;
    const list = todos.get(key);
    if (list) list.push(item);
    else todos.set(key, [item]);
  }

  // 2a/2b: replica as fases do app so para contagem
  const porTexto = new Set<RawItem>();
  for (const list of todos.values()) {
    if (list.length < 2) continue;
    const menor = Math.min(...list.map((i) => i.height));
    for (const item of list) if (item.height > menor * 1.15) porTexto.add(item);
  }
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (porTexto.has(a)) continue;
    if (SECTION_TITLE_ITEM.test(a.str.trim())) continue;
    const ka = normalize(a.str);
    if (ka.length < 12) continue;
    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      const b = items[j];
      if (porTexto.has(b)) continue;
      if (SECTION_TITLE_ITEM.test(b.str.trim())) continue;
      const kb = normalize(b.str);
      if (kb.length < 12 || kb === ka) continue;
      const menor = Math.min(ka.length, kb.length);
      const maior = Math.max(ka.length, kb.length);
      if (menor / maior < 0.4) continue;
      if (!ka.includes(kb) && !kb.includes(ka)) continue;
      if (a.height > b.height * 1.15) porTexto.add(a);
      else if (b.height > a.height * 1.15) porTexto.add(b);
    }
  }

  // 2c
  const alturas = items.map((i) => i.height).sort((a, b) => a - b);
  const corpo = alturas[Math.floor(alturas.length / 2)] ?? 0;
  const xs = items.map((i) => i.x);
  const margem = Math.min(...xs);
  const direita = Math.max(...xs);
  const porGeometria = new Set<RawItem>();
  for (const item of items) {
    if (porTexto.has(item)) continue;
    if (item.x < margem + 45 || item.x > direita * 0.6) continue;
    if (SECTION_TITLE_ITEM.test(item.str.trim())) continue;
    if (item.height <= corpo * 1.1) continue;
    const texto = normalize(item.str);
    if (!texto) continue;
    if ((todos.get(texto) ?? []).length > 1) continue;
    porGeometria.add(item);
  }

  // sobreposicao real de retangulos com textos diferentes
  let sobreposicao = 0;
  const rects = items.map((i) => ({
    ...i,
    x1: i.x,
    x2: i.x + Math.max(i.width, 1),
    y1: i.y - i.height,
    y2: i.y,
    k: normalize(i.str),
  }));
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      if (a.k === b.k) continue;
      const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
      const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
      if (ox > 1 && oy > 1) sobreposicao += 1;
    }
  }

  // Passa true de proposito: a funcao exige prova da fase 1 para rodar, e
  // esta ferramenta existe justamente para medir o que cada fase faria.
  const { items: depois } = removeDuplicatedLayout(items, true);

  return {
    itens: items.length,
    texto: porTexto.size,
    geometria: porGeometria.size,
    sobreposicao,
    removidos: items.length - depois.length,
  };
}

function resumo(nome: string, valores: number[]): string {
  const c = [...valores].sort((a, b) => a - b);
  const p = (q: number) => c[Math.min(c.length - 1, Math.floor(c.length * q))] ?? 0;
  return `${nome.padEnd(10)} max=${String(c[c.length - 1] ?? 0).padStart(4)}  p99=${String(p(0.99)).padStart(4)}  p95=${String(p(0.95)).padStart(4)}  soma=${String(valores.reduce((a, b) => a + b, 0)).padStart(6)}`;
}

async function main() {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("uso: npx tsx scripts/dbg-dup.ts <arquivo.pdf> [limite]");
    process.exit(1);
  }
  const limite = Number(process.argv[3] ?? 0);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(arquivo));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const medidas: Medida[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    if (limite && number > limite) break;
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const items: RawItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const t = raw.transform as number[];
      items.push({
        str: raw.str,
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        width: raw.width ?? 0,
        height: Math.abs(t[3] ?? 0) || raw.height || 10,
      });
    }
    medidas.push({ pagina: number, ...medirPagina(items) });
  }
  await loadingTask.destroy();

  console.log(`arquivo: ${arquivo}`);
  console.log(`paginas: ${medidas.length}`);
  console.log("");
  console.log(resumo("2a/2b", medidas.map((m) => m.texto)));
  console.log(resumo("2c", medidas.map((m) => m.geometria)));
  console.log(resumo("sobrepos", medidas.map((m) => m.sobreposicao)));
  console.log(resumo("removidos", medidas.map((m) => m.removidos)));
  console.log("");

  const topo = [...medidas]
    .sort((a, b) => b.sobreposicao - a.sobreposicao)
    .slice(0, 5);
  console.log("paginas com mais sobreposicao:");
  for (const m of topo) {
    console.log(
      `  p${m.pagina}: sobrepos=${m.sobreposicao} texto=${m.texto} geo=${m.geometria} removidos=${m.removidos}/${m.itens}`,
    );
  }

  const topog = [...medidas].sort((a, b) => b.geometria - a.geometria).slice(0, 5);
  console.log("paginas com mais candidatos geometricos:");
  for (const m of topog) {
    console.log(
      `  p${m.pagina}: geo=${m.geometria} texto=${m.texto} sobrepos=${m.sobreposicao} removidos=${m.removidos}/${m.itens}`,
    );
  }

  // --- contingencia: quando 2c dispara SEM prova de duplicacao ---
  const comGeo = medidas.filter((m) => m.geometria > 0);
  const semProva = comGeo.filter((m) => m.texto === 0);
  console.log("");
  console.log("contingencia do gate (2c so roda com prova de duplicacao):");
  console.log(`  paginas com 2c > 0:                 ${comGeo.length}`);
  console.log(
    `    ...com prova (2a/2b > 0) -> 2c roda:  ${comGeo.length - semProva.length}`,
  );
  console.log(
    `    ...SEM prova (2a/2b = 0) -> 2c CALA:  ${semProva.length}   <-- gate muda isto`,
  );
  if (semProva.length) {
    const amostra = semProva.slice(0, 8);
    console.log("    paginas afetadas:");
    for (const m of amostra) {
      console.log(
        `      p${m.pagina}: geo=${m.geometria} texto=${m.texto} sobrepos=${m.sobreposicao} removidos=${m.removidos}/${m.itens}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
