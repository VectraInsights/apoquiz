/**
 * Despeja as linhas do PDF (texto) por pagina, para inspecionar o
 * documento na mao.
 *
 *   npx tsx scripts/dump-lines.ts <pdf> [paginaInicial] [paginaFinal]
 */
import { readFile } from "node:fs/promises";

import { buildDocumentPages, type RawItem } from "@/lib/pdf/lines";

async function extractInNode(path: string): Promise<RawItem[][]> {
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
  return rawPages;
}

async function main() {
  const path = process.argv[2];
  const de = Number(process.argv[3] ?? 1);
  const ate = Number(process.argv[4] ?? 9999);

  const raw = await extractInNode(path);
  const pages = buildDocumentPages(raw);

  for (const page of pages) {
    if (page.page < de || page.page > ate) continue;
    console.log(`\n===== pagina ${page.page} =====`);
    for (const line of page.lines) {
      console.log(line.text);
    }
  }
}

void main();
