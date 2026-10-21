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
  /** problemas que exigem atencao */
  warnings: DiagnosticItem[];
};

/**
 * Um aviso do diagnostico. O `id` permite remover o aviso depois que a
 * IA resolve o que faltava.
 */
export type DiagnosticItem = {
  id: string;
  text: string;
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

  const duplicatedPages = pages.filter((page) => page.duplicated).length;

  const warnings = buildWarnings({ missingQuestions, withoutAnswer });

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

/**
 * Monta os avisos do diagnostico. Usado tanto no PDF solteiro quanto
 * quando varios PDFs sao processados juntos.
 */
export function buildWarnings(input: {
  missingQuestions: number[];
  withoutAnswer: number[];
}): DiagnosticItem[] {
  const warnings: DiagnosticItem[] = [];

  // Questoes do gabarito que nao chegaram a ser lidas: o quiz esta
  // incompleto e a pessoa precisa saber.
  if (input.missingQuestions.length > 0) {
    warnings.push({
      id: "nao-reconhecidas",
      text: `${input.missingQuestions.length} questão(ões) não foram reconhecidas: ${formatList(input.missingQuestions)}. O PDF provavelmente tem texto sobreposto (cabeçalho ou rodapé colado nas alternativas).`,
    });
  }

  // Questao sem resposta: a pessoa precisa escolher na revisao.
  if (input.withoutAnswer.length > 0) {
    warnings.push({
      id: "sem-resposta",
      text: `${input.withoutAnswer.length} questão(ões) ficaram sem resposta. Escolha a alternativa correta na revisão do gabarito.`,
    });
  }

  return warnings;
}

/**
 * A IA resolve as questoes que o PDF nao trazia resposta. Depois que ela
 * passa, o aviso de "sem resposta" so continua valendo para as questoes
 * que ficaram de fora.
 */
export function adjustDiagnostics(
  diagnostics: PdfDiagnostics | null,
  questions: { correct: string | null }[],
): PdfDiagnostics | null {
  if (!diagnostics) return null;

  const semResposta = questions.filter((question) => !question.correct).length;

  if (semResposta === 0) {
    return {
      ...diagnostics,
      warnings: diagnostics.warnings.filter((item) => item.id !== "sem-resposta"),
    };
  }

  return {
    ...diagnostics,
    warnings: diagnostics.warnings.map((item) =>
      item.id === "sem-resposta"
        ? {
            ...item,
            text: `${semResposta} questão(ões) ficaram sem resposta. Escolha a alternativa correta na revisão do gabarito.`,
          }
        : item,
    ),
  };
}

/**
 * Heuristica antiga: a mesma frase aparecendo muitas vezes na mesma
 * pagina. Substituida pelo sinal real (a pagina teve duas renderizacoes
 * do mesmo conteudo, detectadas em `lines.ts`).
 */
function formatList(values: number[]): string {
  if (values.length <= 8) return values.join(", ");
  return `${values.slice(0, 8).join(", ")}…`;
}
