/**
 * Ferramenta auxiliar: extrai as linhas do PDF uma unica vez e salva em
 * cache JSON, para rodar analises sobre o documento sem reprocessar.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import { buildPageLines, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";

async function extractInNode(path: string): Promise<ExtractedPage[]> {
  const useMin = process.env.PDFJS_MIN === "1";
  const pdfjs = useMin
    ? await import("pdfjs-dist/build/pdf.min.mjs")
    : await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const pages: ExtractedPage[] = [];

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

    pages.push({ page: number, lines: buildPageLines(items) });
  }

  await loadingTask.destroy();
  return pages;
}

async function main() {
  const path = process.argv[2] ?? "teste.pdf";
  const out = process.argv[3] ?? "lines-cache.json";
  const pages = await extractInNode(path);
  await writeFile(out, JSON.stringify(pages), "utf8");
  console.log(`${basename(path)} -> ${out} (${pages.length} paginas)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
