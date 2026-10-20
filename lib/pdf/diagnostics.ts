/**
 * Diagnostico do PDF.
 *
 * Nao serve so para depurar: e o que o app mostra para a pessoa saber
 * por que uma apostila nao saiu como esperado. Apostilas editoriais
 * costumam ter layout quebrado (cabecalho colado no texto, camada de
 * texto duplicada, numeracao com saltos) e o app precisa apontar isso
 * em vez de falhar em silencio.
 */

import type { ExtractedPage } from "./lines";
import { applyGabarito, detectGabarito, parseQuestions } from "./parser";

export type PdfDiagnostics = {
  pages: number;
  /** questoes reconhecidas pelo parser */
  found: number;
  /** respostas encontradas (gabarito do PDF + inline) */
  answered: number;
  /** numeros de questao que existem no gabarito mas nao foram lidas */
  missingQuestions: number[];
  /** numeros de questao sem resposta */
  withoutAnswer: number[];
  /** saltos na numeracao (ex.: 58, 83, 94) */
  numberingGaps: number[];
  /** linhas cujo texto se sobrepoe (layout quebrado) */
  overlappingLines: number;
  /** paginas com conteudo duplicado */
  duplicatedPages: number;
  /** avisos prontos para exibir */
  warnings: string[];
};

export function diagnosePdf(
  pages: ExtractedPage[],
  questions?: ReturnType<typeof parseQuestions>,
  gabarito?: Record<string, string>,
): PdfDiagnostics {
  const parsed = questions ?? parseQuestions(pages);
  const { gabarito: detected } = detectGabarito(pages);
  const answers = gabarito ?? detected;
  const applied = applyGabarito(parsed, answers);

  const gabaritoKeys = Object.keys(answers)
    .map((key) => key.split("#").pop() ?? key)
    .map(Number)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const questionNumbers = parsed
    .map((question) => question.number)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  // Gabarito tem respostas que o parser nao achou.
  const missingQuestions = gabaritoKeys.filter(
    (number) => !questionNumbers.includes(number),
  );

  const withoutAnswer = parsed
    .filter((_, index) => !applied[index].correct)
    .map((question) => question.number)
    .filter((value): value is number => value !== null);

  // Saltos na numeracao: entre o primeiro e o ultimo numero visto.
  const numberingGaps: number[] = [];
  if (questionNumbers.length > 1) {
    const first = questionNumbers[0];
    const last = questionNumbers[questionNumbers.length - 1];
    const present = new Set(questionNumbers);
    for (let value = first; value <= last; value += 1) {
      if (!present.has(value)) numberingGaps.push(value);
    }
  }

  const overlappingLines = pages.reduce(
    (total, page) => total + page.lines.filter((line) => line.overlap).length,
    0,
  );

  const duplicatedPages = pages.filter((page) => hasDuplicatedLayer(page)).length;

  const warnings: string[] = [];

  if (missingQuestions.length > 0) {
    warnings.push(
      `${missingQuestions.length} questão(ões) não foram reconhecidas: ${formatList(missingQuestions)}. O PDF provavelmente tem texto sobreposto (cabeçalho ou rodapé colado nas alternativas).`,
    );
  }

  if (overlappingLines > 0) {
    warnings.push(
      `${overlappingLines} linha(s) do PDF têm textos sobrepostos — é comum em arquivos gerados por ferramentas de separação.`,
    );
  }

  if (duplicatedPages > 0) {
    warnings.push(
      `${duplicatedPages} página(s) têm o conteúdo desenhado duas vezes (camada duplicada). O app descartou a cópia.`,
    );
  }

  if (withoutAnswer.length > 0) {
    warnings.push(
      `${withoutAnswer.length} questão(ões) ficaram sem resposta. Escolha a alternativa correta na revisão do gabarito.`,
    );
  }

  return {
    pages: pages.length,
    found: parsed.length,
    answered: applied.filter((item) => item.correct).length,
    missingQuestions,
    withoutAnswer,
    numberingGaps,
    overlappingLines,
    duplicatedPages,
    warnings,
  };
}

/** Heuristica: a mesma frase aparecendo muitas vezes na mesma pagina. */
function hasDuplicatedLayer(page: ExtractedPage): boolean {
  const counts = new Map<string, number>();
  for (const line of page.lines) {
    const key = line.text.trim();
    if (key.length < 12) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 3) return true;
  }
  return false;
}

function formatList(values: number[]): string {
  if (values.length <= 8) return values.join(", ");
  return `${values.slice(0, 8).join(", ")}…`;
}
