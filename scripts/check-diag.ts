/**
 * Mostra o relatorio de diagnostico de um PDF.
 *
 * Uso: npm run check:diag -- <arquivo.pdf>
 */
import { readFile } from "node:fs/promises";

import { buildDocumentPages, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";
import { diagnosePdf } from "@/lib/pdf/diagnostics";

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
  const report = diagnosePdf(pages);

  console.log(`paginas:            ${report.pages}`);
  console.log(`questoes lidas:     ${report.found}`);
  console.log(`com resposta:       ${report.answered}`);
  console.log(`sem resposta:       ${report.withoutAnswer.join(", ") || "nenhuma"}`);
  console.log(`nao reconhecidas:   ${report.missingQuestions.join(", ") || "nenhuma"}`);
  console.log(`saltos na numeracao: ${report.numberingGaps.join(", ") || "nenhum"}`);
  console.log(`linhas sobrepostas: ${report.overlappingLines}`);
  console.log(`paginas duplicadas: ${report.duplicatedPages}`);

  console.log("\nAVISOS:");
  for (const warning of report.warnings) console.log(` - ${warning}`);
  if (report.warnings.length === 0) console.log(" - nenhum");
}

main();
