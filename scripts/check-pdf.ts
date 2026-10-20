/**
 * Ferramenta de desenvolvimento: extrai o texto de um PDF e mostra como o
 * parser interpreta o documento (questoes + gabarito).
 *
 * Uso:
 *   npm run check:pdf -- caminho/do/arquivo.pdf
 *   npm run check:pdf -- caminho/do/arquivo.pdf --dump 3      (texto da pagina 3)
 *   npm run check:pdf -- caminho/do/arquivo.pdf --find gabarito
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { applyGabarito, detectGabarito, parseQuestions } from "@/lib/pdf/parser";
import { buildPageLines, type ExtractedPage, type RawItem } from "@/lib/pdf/lines";

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
  const args = process.argv.slice(2);
  const dumpIndex = args.indexOf("--dump");
  const findIndex = args.indexOf("--find");
  const path = args.find((arg) => !arg.startsWith("--") && !/^\d+$/.test(arg));

  if (!path) {
    console.error("Uso: npm run check:pdf -- <arquivo.pdf> [--dump N | --find termo]");
    process.exit(1);
  }

  const pages = await extractInNode(path);
  console.log(`\n=== ${basename(path)} ===`);
  console.log(`Paginas: ${pages.length}`);
  console.log(
    `Caracteres: ${pages.reduce((n, p) => n + p.lines.map((l) => l.text).join("").length, 0)}`,
  );

  if (dumpIndex !== -1) {
    const pageNumber = Number(args[dumpIndex + 1] ?? 1);
    const page = pages.find((item) => item.page === pageNumber) ?? pages[0];
    console.log(`\n--- TEXTO BRUTO DA PAGINA ${page.page} ---`);
    page.lines.forEach((line, index) =>
      console.log(`${String(index).padStart(3, "|")} [${String(Math.round(line.x)).padStart(4, " ")}] ${line.text}`),
    );
    return;
  }

  if (findIndex !== -1) {
    const term = (args[findIndex + 1] ?? "").toLowerCase();
    for (const page of pages) {
      page.lines.forEach((line, index) => {
        if (line.text.toLowerCase().includes(term)) {
          console.log(`p${page.page} [${index}] ${line.text}`);
        }
      });
    }
    return;
  }

  const gabarito = detectGabarito(pages);
  console.log(`\n--- GABARITO (${Object.keys(gabarito.gabarito).length}) ---`);
  const gabaritoKeys = Object.keys(gabarito.gabarito);
  console.log(
    gabaritoKeys.length
      ? `amostra: ${gabaritoKeys
          .slice(0, 12)
          .map((key) => `${key}=${gabarito.gabarito[key]}`)
          .join(" ")}`
      : "(nenhum)",
  );
  if (gabarito.evidence) console.log(`Evidencia: ${gabarito.evidence}`);

  const questions = parseQuestions(pages);
  const applied = applyGabarito(questions, gabarito.gabarito);

  console.log(`\n--- QUESTOES (${questions.length}) ---`);
  questions.forEach((question, index) => {
    const answer = applied[index];
    console.log(
      `\n[${index + 1}] num=${question.number} secao=${question.section ?? "-"} pagina=${question.page} gabarito=${answer.correct ?? "-"} (${answer.source})`,
    );
    if (question.topic) console.log(`  topico: ${question.topic}`);
    console.log(`  ${question.statement.slice(0, 200)}`);
    for (const option of question.options) {
      console.log(`    ${option.label}) ${option.text.slice(0, 100)}`);
    }
    if (question.inlineAnswer) console.log(`  inline: ${question.inlineAnswer}`);
  });

  const withAnswer = applied.filter((item) => item.correct).length;
  console.log(
    `\n=> ${questions.length} questoes, ${withAnswer} com resposta, ${questions.length - withAnswer} sem resposta`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
