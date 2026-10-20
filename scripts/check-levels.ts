import { readFile } from "node:fs/promises";
import { buildPageLines, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";
import { parseQuestions } from "@/lib/pdf/parser";

async function extractInNode(path: string): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
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
  const pages = await extractInNode(process.argv[2]);
  const questions = parseQuestions(pages);

  const porSecao = new Map<string, { comNivel: number; semNivel: number }>();
  for (const q of questions) {
    const key = q.section ?? "?";
    const entry = porSecao.get(key) ?? { comNivel: 0, semNivel: 0 };
    if (q.level) entry.comNivel += 1;
    else entry.semNivel += 1;
    porSecao.set(key, entry);
  }

  console.log("secao | com nivel | sem nivel");
  for (const [secao, v] of porSecao) {
    console.log(`${secao} | ${v.comNivel} | ${v.semNivel}`);
  }

  const semNivel = questions.filter((q) => !q.level).slice(0, 3);
  for (const q of semNivel) {
    console.log(
      `\nsem nivel -> num=${q.number} secao=${q.section} pagina=${q.page}`,
    );
    console.log(`  ${q.statement.slice(0, 120)}`);
  }
}

main();
