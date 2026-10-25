/**
 * Extrai paginas especificas do PDF e mostra, fase a fase, o que cada uma
 * removeria. Usado para descobrir quem esta comendo o texto das
 * alternativas nas paginas em que o golden nao remove nada.
 *
 * Uso: npx tsx scripts/dbg-fases.ts <pdf> <pagina> [<pagina>...]
 */
import { readFile } from "node:fs/promises";

import {
  removeDuplicatedPass,
  type RawItem,
} from "@/lib/pdf/lines";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.,;:!?()[\]·"'-]/g, "");

const SECTION_TITLE_ITEM = /^\d+(?:\.\d+){1,2}\s+\S/;

type Fase = { nome: string; itens: string[] };

function fases(items: RawItem[]): Fase[] {
  const saida: Fase[] = [];

  const todos = new Map<string, RawItem[]>();
  for (const item of items) {
    const key = normalize(item.str);
    if (!key) continue;
    const list = todos.get(key);
    if (list) list.push(item);
    else todos.set(key, [item]);
  }

  const removerA = new Set<RawItem>();
  for (const list of todos.values()) {
    if (list.length < 2) continue;
    const menorAltura = Math.min(...list.map((item) => item.height));
    for (const item of list) {
      if (item.height > menorAltura * 1.15) removerA.add(item);
    }
  }
  saida.push({ nome: "2a mesma frase (fonte maior)", itens: [...removerA].map((i) => i.str) });

  const removerB = new Set<RawItem>();
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (removerA.has(a)) continue;
    if (SECTION_TITLE_ITEM.test(a.str.trim())) continue;
    const ka = normalize(a.str);
    if (ka.length < 12) continue;

    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      const b = items[j];
      if (removerA.has(b)) continue;
      if (SECTION_TITLE_ITEM.test(b.str.trim())) continue;
      const kb = normalize(b.str);
      if (kb.length < 12 || kb === ka) continue;

      const menor = Math.min(ka.length, kb.length);
      const maior = Math.max(ka.length, kb.length);
      if (menor / maior < 0.4) continue;
      if (!ka.includes(kb) && !kb.includes(ka)) continue;

      if (a.height > b.height * 1.15) removerB.add(a);
      else if (b.height > a.height * 1.15) removerB.add(b);
    }
  }
  saida.push({ nome: "2b frase contida (fonte maior)", itens: [...removerB].map((i) => i.str) });

  const remover = new Set<RawItem>([...removerA, ...removerB]);

  const alturas = items.map((item) => item.height).sort((a, b) => a - b);
  const alturaCorpo = alturas[Math.floor(alturas.length / 2)] ?? 0;
  const margens = items.map((item) => item.x);
  const margem = Math.min(...margens);
  const direita = Math.max(...margens);
  const bandaInicio = margem + 45;
  const bandaFim = direita * 0.6;

  const removerC = new Set<RawItem>();
  for (const item of items) {
    if (remover.has(item)) continue;
    if (item.x < bandaInicio || item.x > bandaFim) continue;
    if (SECTION_TITLE_ITEM.test(item.str.trim())) continue;
    if (item.height <= alturaCorpo * 1.1) continue;

    const texto = normalize(item.str);
    if (!texto) continue;
    if ((todos.get(texto) ?? []).length > 1) continue;

    removerC.add(item);
  }
  saida.push({ nome: "2c geometria (banda+fonte maior)", itens: [...removerC].map((i) => i.str) });

  return saida;
}

async function main() {
  const [pdf, ...args] = process.argv.slice(2);
  if (!pdf) {
    console.error("uso: tsx dbg-fases.ts <pdf> [<pagina>... | --resumo]");
    process.exit(1);
  }

  const resumo = args.includes("--resumo");
  const alvos = new Set(args.map(Number));
  if (!resumo && alvos.size === 0) {
    console.error("informe paginas ou --resumo");
    process.exit(1);
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(pdf));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  // --- modo resumo: distribuicao das chaves da 2a ao longo do documento ---
  const porTamanho = new Map<number, number>();
  const chaves2a = new Map<string, number>();
  const chaves2b = new Map<string, number>();
  let paginasCom2a = 0;
  let paginasCom2b = 0;
  let paginasCom2c = 0;
  let total2a = 0;
  let total2b = 0;
  let total2c = 0;

  for (let number = 1; number <= doc.numPages; number += 1) {
    if (!resumo && !alvos.has(number)) continue;

    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const items: RawItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw) || !raw.str.trim()) continue;
      const transform = raw.transform as number[];
      items.push({
        str: raw.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        width: raw.width ?? 0,
        height: Math.abs(transform[3] ?? 0) || raw.height || 10,
      });
    }

    const fase1 = removeDuplicatedPass(items);
    const prova = fase1.length !== items.length;
    const fasesEncontradas = fases(fase1);

    const a = fasesEncontradas[0].itens;
    const b = fasesEncontradas[1].itens;
    const c = fasesEncontradas[2].itens;

    if (a.length > 0) paginasCom2a += 1;
    if (b.length > 0) paginasCom2b += 1;
    if (c.length > 0 && prova) paginasCom2c += 1;
    total2a += a.length;
    total2b += b.length;
    total2c += c.length;

    if (resumo) {
      for (const texto of a) {
        const chave = normalize(texto);
        porTamanho.set(chave.length, (porTamanho.get(chave.length) ?? 0) + 1);
        chaves2a.set(chave, (chaves2a.get(chave) ?? 0) + 1);
      }
      for (const texto of b) {
        const chave = normalize(texto);
        chaves2b.set(chave, (chaves2b.get(chave) ?? 0) + 1);
      }
      continue;
    }

    console.log(`\n########## p${number}  bruto=${items.length} fase1_removeu=${items.length - fase1.length} provaDeCopia=${prova}`);
    for (const fase of fasesEncontradas) {
      console.log(`  ${fase.nome}: ${fase.itens.length}`);
      for (const texto of fase.itens) console.log(`      - ${texto.slice(0, 100)}`);
    }
  }

  if (resumo) {
    console.log(`\n===== RESUMO (${doc.numPages} paginas) =====`);
    console.log(`2a: ${total2a} itens em ${paginasCom2a} paginas`);
    console.log(`2b: ${total2b} itens em ${paginasCom2b} paginas`);
    console.log(`2c: ${total2c} itens em ${paginasCom2c} paginas (so com prova da fase 1)`);
    console.log("\n2a por tamanho da chave normalizada (comprimento: qtd):");
    for (const [tamanho, qtd] of [...porTamanho.entries()].sort((x, y) => x[0] - y[0])) {
      console.log(`   ${String(tamanho).padStart(3)}: ${qtd}`);
    }
    console.log("\n2a - chaves com 11 caracteres ou menos (candidatas a corte):");
    for (const [chave, qtd] of [...chaves2a.entries()].sort((x, y) => x[0].length - y[0].length)) {
      if (chave.length > 11) continue;
      console.log(`   [${chave.length}] ${qtd}x  ${JSON.stringify(chave)}`);
    }
    console.log("\n2a - chaves com 12+ caracteres (frases de verdade):");
    for (const [chave, qtd] of [...chaves2a.entries()].sort((x, y) => x[0].length - y[0].length)) {
      if (chave.length <= 11) continue;
      console.log(`   [${chave.length}] ${qtd}x  ${chave.slice(0, 80)}`);
    }
  }

  await loadingTask.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
