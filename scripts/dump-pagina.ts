/** Despeja as linhas de uma pagina depois da limpeza da camada duplicada. */
import { readFile } from "node:fs/promises";

import { buildDocumentPages, type RawItem } from "@/lib/pdf/lines";

async function main() {
  const path = process.argv[2];
  const alvo = Number(process.argv[3] ?? 1);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const doc = await (await pdfjs.getDocument({ data, useSystemFonts: true })).promise;

  const raw: RawItem[][] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: RawItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const t = item.transform as number[];
      items.push({
        str: item.str,
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        width: item.width ?? 0,
        height: Math.abs(t[3] ?? 0) || item.height || 10,
      });
    }
    raw.push(items);
  }

  const pages = buildDocumentPages(raw);
  for (const page of pages) {
    if (page.page !== alvo) continue;
    console.log(`== pagina ${page.page} (duplicada: ${page.duplicated ? "sim" : "nao"}) ==`);
    for (const line of page.lines) {
      console.log(`  [${line.x.toFixed(0).padStart(4)}] ${line.text}`);
    }
  }
}

void main();
