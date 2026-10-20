/**
 * Diagnostico: mostra quais questoes ficaram sem gabarito e por que.
 *
 * Uso: npm run check:match -- <arquivo.pdf>
 */
import { readFile } from "node:fs/promises";

import { buildDocumentPages, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";
import { detectGabarito, lookupGabarito, parseQuestions } from "@/lib/pdf/parser";

async function extractInNode(path: string): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const rawPages: RawItem[][] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
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
    rawPages.push(items);
  }
  await loadingTask.destroy();
  const pages: ExtractedPage[] = buildDocumentPages(rawPages);
  return pages;
}

async function main() {
  const pages = await extractInNode(process.argv[2]);
  const { gabarito } = detectGabarito(pages);
  const questions = parseQuestions(pages);

  const chaves = Object.keys(gabarito).sort();
  console.log(`gabarito: ${chaves.length} chaves`);
  console.log(`  primeiras: ${chaves.slice(0, 6).join(", ")}`);
  console.log(`  ultimas  : ${chaves.slice(-6).join(", ")}`);

  const sem = questions.filter(
    (q) => !lookupGabarito(gabarito, { number: q.number, section: q.section ?? null }),
  );

  console.log(`\nquestoes sem gabarito: ${sem.length}`);
  for (const q of sem) {
    console.log(
      `\n--- num=${q.number} secao=${q.section ?? "-"} pagina=${q.page} nivel=${q.level ?? "-"} ---`,
    );
    console.log(`  ${q.statement.slice(0, 220)}`);
    for (const option of q.options) {
      console.log(`    ${option.label}) ${option.text.slice(0, 90)}`);
    }
    const chave = q.section ? `${q.section}#${q.number}` : String(q.number);
    console.log(`  procurou a chave "${chave}" -> ${gabarito[chave] ?? "nao existe"}`);
  }
}

main();
