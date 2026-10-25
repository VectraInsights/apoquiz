/**
 * Varre todos os PDFs de uma pasta e mostra questoes lidas / com resposta /
 * paginas duplicadas / chaves do gabarito que ficaram por ler. Serve de
 * baseline antes e depois de uma mudanca no parser: rode, salve a saida,
 * mude, rode de novo e compare. O `gabarito faltando` e o unico numero que
 * responde "a mudanca regrediu?": os outros dois medem o parser contra ele
 * mesmo, entao um parser que le MENOS continua passando nos dois.
 *
 * Uso: npx tsx scripts/varredura.ts <pasta> [--json]
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { buildDocumentPages, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";
import { diagnosePdf } from "@/lib/pdf/diagnostics";

async function listar(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true, recursive: true });
  const arquivos: string[] = [];
  for (const e of entradas) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".pdf")) continue;
    arquivos.push(join(e.parentPath ?? dir, e.name));
  }
  return arquivos.sort();
}

async function extrair(path: string): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const task = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await task.promise;

  const rawPages: RawItem[][] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
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
    rawPages.push(items);
  }
  await task.destroy();
  return buildDocumentPages(rawPages);
}

async function main() {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error("uso: npx tsx scripts/varredura.ts <pasta> [--json]");
    process.exit(1);
  }
  const comoJson = process.argv.includes("--json");

  const arquivos = await listar(pasta);
  const linhas: {
    arquivo: string;
    questoes: number;
    resposta: number;
    dup: number;
    avisos: number;
    /** chaves do gabarito do proprio PDF que o parser nao leu */
    faltando: number;
  }[] = [];

  for (const arquivo of arquivos) {
    try {
      const pages = await extrair(arquivo);
      const r = diagnosePdf(pages);
      linhas.push({
        arquivo: arquivo.split(/[\\/]/).pop() ?? arquivo,
        questoes: r.found,
        resposta: r.answered,
        dup: r.duplicatedPages,
        avisos: r.warnings.length,
        faltando: r.missingQuestions.length,
      });
      if (!comoJson) {
        console.log(
          `${String(r.found).padStart(5)}/${String(r.answered).padEnd(5)} dup=${String(r.duplicatedPages).padStart(3)} falta=${String(r.missingQuestions.length).padStart(3)}  ${linhas[linhas.length - 1].arquivo.slice(0, 72)}`,
        );
      }
    } catch (error) {
      console.log(`  ERRO ${arquivo}: ${(error as Error).message.slice(0, 60)}`);
    }
  }

  const total = linhas.reduce(
    (acc, l) => ({
      questoes: acc.questoes + l.questoes,
      resposta: acc.resposta + l.resposta,
      dup: acc.dup + l.dup,
      faltando: acc.faltando + l.faltando,
    }),
    { questoes: 0, resposta: 0, dup: 0, faltando: 0 },
  );
  const comFalta = linhas.filter((l) => l.questoes !== l.resposta);
  // O metrico que decide se uma mudanca no parser regrediu: quantas chaves
  // do gabarito do proprio PDF deixaram de ser lidas. "comFalta" acima so
  // mede questao lida sem resposta, entao um parser que LE MENOS continua
  // passando nele - por isso este contador existe.
  const comGabaritoFaltando = linhas.filter((l) => l.faltando > 0);

  if (comoJson) {
    console.log(JSON.stringify({ total, arquivos: linhas }, null, 1));
  } else {
    console.log("");
    console.log(`arquivos:          ${linhas.length}`);
    console.log(`questoes lidas:    ${total.questoes}`);
    console.log(`com resposta:      ${total.resposta}`);
    console.log(`paginas duplicadas:${total.dup}`);
    console.log(`arquivos com falta:${comFalta.length}`);
    for (const l of comFalta) {
      console.log(`   ${l.questoes}/${l.resposta}  ${l.arquivo.slice(0, 70)}`);
    }
    // O numero que decide se uma mudanca no parser regrediu: o gabarito do
    // proprio PDF manda, nao o parser. Imprime tambem a lista, para dar
    // direto o arquivo a investigar.
    console.log("");
    console.log(`gabarito faltando:        ${total.faltando}`);
    console.log(`arquivos c/ gabarito incompleto:${comGabaritoFaltando.length}`);
    for (const l of comGabaritoFaltando) {
      console.log(`   falta=${l.faltando}  ${l.arquivo.slice(0, 70)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
