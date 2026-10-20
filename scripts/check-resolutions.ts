/**
 * Verifica a extracao das resolucoes (explicacao + analise por
 * alternativa) escritas na secao de comentarios do PDF.
 */
import { readFile } from "node:fs/promises";

import type { ExtractedPage } from "@/lib/pdf/lines";
import { parseQuestions } from "@/lib/pdf/parser";

async function main() {
  const file = process.argv[2] ?? "lines-cache.json";
  const pages = JSON.parse(await readFile(file, "utf8")) as ExtractedPage[];

  const questions = parseQuestions(pages);
  const withExplanation = questions.filter((q) => q.explanation);
  const withNotes = questions.filter(
    (q) => q.optionNotes && Object.keys(q.optionNotes).length > 0,
  );
  const full = questions.filter(
    (q) =>
      q.explanation &&
      q.optionNotes &&
      Object.keys(q.optionNotes).length >= q.options.length,
  );

  console.log(`questoes:            ${questions.length}`);
  console.log(`com explicacao:      ${withExplanation.length}`);
  console.log(`com analise por alt: ${withNotes.length}`);
  console.log(`com ambos completos: ${full.length}`);

  const notas = Object.values(questions.reduce<Record<string, number>>((acc, q) => {
    const n = q.optionNotes ? Object.keys(q.optionNotes).length : 0;
    acc[n] = (acc[n] ?? 0) + 1;
    return acc;
  }, {}));
  console.log("distribuicao de notas por questao:", notas.join(", "));

  const show = Number(process.argv[3] ?? 2);
  for (const q of questions.filter((x) => x.explanation).slice(0, show)) {
    console.log(`\n=== ${q.section}#${q.number} (p${q.page}) ===`);
    console.log(`enunciado: ${q.statement.slice(0, 110)}`);
    console.log(`explicacao: ${q.explanation}`);
    for (const option of q.options) {
      const note = q.optionNotes?.[option.label];
      console.log(`  ${option.label}) ${option.text.slice(0, 55)}`);
      console.log(`      ${note ? "-> " + note : "(sem analise)"}`);
    }
  }

  // Questoes com analise incompleta
  const incomplete = questions.filter(
    (q) =>
      q.optionNotes &&
      Object.keys(q.optionNotes).length < q.options.length,
  );
  incomplete.sort(
    (a, b) =>
      Object.keys(a.optionNotes ?? {}).length -
      Object.keys(b.optionNotes ?? {}).length,
  );
  console.log(`\n=== INCOMPLETAS (${incomplete.length}) ===`);
  for (const q of incomplete.slice(0, 4)) {
    const faltando = q.options
      .filter((o) => !q.optionNotes?.[o.label])
      .map((o) => o.label)
      .join(",");
    console.log(
      `${q.section}#${q.number} p${q.page}: ${Object.keys(q.optionNotes ?? {}).length}/${q.options.length} notas (faltam ${faltando})`,
    );
    for (const option of q.options) {
      console.log(`     ${option.label}) ${q.optionNotes?.[option.label] ?? "(vazio)"}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
