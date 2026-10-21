"use client";

import { extractPdfText } from "@/lib/pdf/extract";
import { applyGabarito, detectGabarito, parseQuestions } from "@/lib/pdf/parser";
import {
  adjustDiagnostics,
  buildWarnings,
  diagnosePdf,
  type PdfDiagnostics,
} from "@/lib/pdf/diagnostics";
import { MAX_AI_QUESTIONS, type ExtractRequest, type ExtractResponse, type Question } from "@/lib/types";

export type Stage = {
  label: string;
  progress: number;
};

export type ProcessOutcome = {
  questions: Question[];
  detectedGabarito: Record<string, string>;
  gabaritoEvidence: string;
  aiApplied: boolean;
  aiMessage: string | null;
  /** true quando o PDF ja trazia tudo e a IA nem precisou ser chamada */
  aiNotNeeded: boolean;
  /** relatorio de problemas encontrados no PDF */
  diagnostics: PdfDiagnostics | null;
  pageCount: number;
  /** true quando o parser local nao achou questoes e a IA extraiu do zero */
  usedAIExtraction: boolean;
};

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

export function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/** O que a leitura local de um PDF entrega. */
type Leitura = {
  questions: Question[];
  gabarito: Record<string, string>;
  diagnostics: PdfDiagnostics;
  evidence: string;
  pageCount: number;
  text: string;
};

/** Le um PDF: texto, questoes e gabarito (sem chamar a IA). */
async function lerPdf(
  file: File,
  onStage: (stage: Stage) => void,
  indice: number,
  total: number,
): Promise<Leitura> {
  if (!isPdf(file)) {
    throw new Error(`"${file.name}" não é um PDF.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" passa de 25 MB. Divida o arquivo e tente novamente.`);
  }

  onStage({
    label: `Lendo ${file.name}…`,
    progress: 0.04 + (indice / total) * 0.35,
  });

  const buffer = await file.arrayBuffer();
  const doc = await extractPdfText(buffer, (page, pages) => {
    onStage({
      label: `Extraindo texto — ${file.name}, página ${page} de ${pages}…`,
      progress: 0.05 + ((indice + page / Math.max(1, pages)) / total) * 0.4,
    });
  });

  if (doc.isProbablyScanned) {
    throw new Error(
      `"${file.name}" parece ser um escaneamento (sem texto selecionável). Converta para PDF digital antes de enviar.`,
    );
  }

  onStage({
    label: `Procurando questões em ${file.name}…`,
    progress: 0.45 + (indice / total) * 0.1,
  });

  const gabaritoResult = detectGabarito(doc.pages);
  const parsed = parseQuestions(doc.pages);
  const applied = applyGabarito(parsed, gabaritoResult.gabarito);
  const diagnostics = diagnosePdf(doc.pages, parsed, gabaritoResult.gabarito);

  const questions: Question[] = parsed.map((item, index) => ({
    id: `q${index + 1}`,
    number: item.number,
    statement: item.statement,
    options: item.options,
    correct: applied[index].correct,
    explanation: item.explanation,
    optionNotes: item.optionNotes,
    topic: item.topic,
    level: item.level ?? null,
    answerSource: applied[index].source,
    page: item.page,
    section: item.section ?? null,
  }));

  return {
    questions,
    gabarito: gabaritoResult.gabarito,
    diagnostics,
    evidence: gabaritoResult.evidence,
    pageCount: doc.pageCount,
    text: doc.text,
  };
}

/**
 * Junta as leituras de varios PDFs num quiz so.
 *
 * Com mais de um arquivo, o capitulo de cada questao recebe o prefixo do
 * arquivo (ex.: "1:1.2") para as respostas de um PDF nao colidirem com as
 * de outro, e a numeracao das questoes continua em sequencia.
 */
export function mesclarLeituras(leituras: Leitura[]): {
  questions: Question[];
  gabarito: Record<string, string>;
} {
  const varios = leituras.length > 1;
  const questions: Question[] = [];
  const gabarito: Record<string, string> = {};

  for (const [indice, leitura] of leituras.entries()) {
    for (const question of leitura.questions) {
      const numero = questions.length + 1;
      const secao = question.section
        ? `${varios ? `${indice}:` : ""}${question.section}`
        : null;

      questions.push({
        ...question,
        id: `q${numero}`,
        number: varios ? numero : question.number,
        section: secao,
      });

      if (question.correct) {
        const chave = secao ? `${secao}#${numero}` : String(numero);
        gabarito[chave] = question.correct;
      }
    }
  }

  return { questions, gabarito };
}

/**
 * Processa um ou varios PDFs e monta UM quiz com as questoes de todos.
 *
 * Com mais de um arquivo, o capitulo de cada questao recebe o prefixo do
 * arquivo (ex.: "1:1.2") para as respostas de um PDF nao colidirem com as
 * de outro, e a numeracao das questoes continua em sequencia.
 */
export async function processPdfs(
  files: File[],
  onStage: (stage: Stage) => void,
): Promise<ProcessOutcome> {
  const leituras: Leitura[] = [];
  for (const [indice, file] of files.entries()) {
    leituras.push(await lerPdf(file, onStage, indice, files.length));
  }

  const { questions, gabarito } = mesclarLeituras(leituras);

  // Diagnostico do conjunto: soma as contagens de cada arquivo.
  const semResposta = questions
    .filter((question) => !question.correct)
    .map((question) => question.number ?? 0);
  const naoReconhecidas = leituras.flatMap((leitura) =>
    leitura.diagnostics.missingQuestions,
  );

  const diagnostics: PdfDiagnostics = {
    pages: leituras.reduce((total, leitura) => total + leitura.diagnostics.pages, 0),
    found: questions.length,
    answered: questions.length - semResposta.length,
    missingQuestions: naoReconhecidas,
    withoutAnswer: semResposta,
    numberingGaps: [],
    overlappingLines: leituras.reduce(
      (total, leitura) => total + leitura.diagnostics.overlappingLines,
      0,
    ),
    duplicatedPages: leituras.reduce(
      (total, leitura) => total + leitura.diagnostics.duplicatedPages,
      0,
    ),
    warnings: buildWarnings({
      missingQuestions: naoReconhecidas,
      withoutAnswer: semResposta,
    }),
  };

  const detectedGabarito = gabarito;
  const evidence = leituras[0]?.evidence ?? "";
  const pageCount = leituras.reduce(
    (total, leitura) => total + leitura.pageCount,
    0,
  );
  const texto = leituras.map((leitura) => leitura.text).join("\n\n");

  // Caso o parser local nao tenha encontrado questoes, a IA extrai do texto.
  if (questions.length < 2) {
    onStage({
      label: "Layout não reconhecido — a IA está lendo o PDF…",
      progress: 0.6,
    });

    const response = await callAI({
      mode: "extract",
      text: texto.slice(0, MAX_TEXT_CHARS),
      gabarito: detectedGabarito,
    });

    if (!response.data) {
      return {
        questions: [],
        detectedGabarito,
        gabaritoEvidence: evidence,
        aiApplied: false,
        aiMessage: response.error,
        aiNotNeeded: false,
        diagnostics,
        pageCount,
        usedAIExtraction: false,
      };
    }

    return {
      questions: response.data.questions,
      detectedGabarito,
      gabaritoEvidence: evidence,
      aiApplied: true,
      aiMessage: null,
      aiNotNeeded: false,
      diagnostics: adjustDiagnostics(diagnostics, response.data.questions),
      pageCount,
      usedAIExtraction: true,
    };
  }

  // A IA so e necessaria para o que o PDF nao trouxe (explicacao e
  // analise por alternativa). Numa apostila editorial com secao de
  // comentarios, nenhuma chamada e feita - e o resultado chega na hora.
  const needsAI = questions.some(
    (question) =>
      !question.explanation ||
      Object.keys(question.optionNotes ?? {}).length === 0,
  );

  if (!needsAI) {
    return {
      questions,
      detectedGabarito,
      gabaritoEvidence: evidence,
      aiApplied: false,
      aiMessage: null,
      aiNotNeeded: true,
      diagnostics,
      pageCount,
      usedAIExtraction: false,
    };
  }

  onStage({
    label: "A IA está conferindo o gabarito e explicando as questões…",
    progress: 0.7,
  });

  // So as primeiras MAX_AI_QUESTIONS vao para a IA. O resto da apostila
  // segue intacto, com o gabarito lido do PDF.
  const response = await callAI({
    mode: "enrich",
    questions: questions.slice(0, MAX_AI_QUESTIONS),
    gabarito: detectedGabarito,
  });

  // A IA devolve as questoes processadas na mesma ordem. Se ela devolver
  // menos que o enviado, o restante da apostila e preservado.
  const enriched = response.data?.questions ?? [];
  const finais =
    enriched.length > 0
      ? questions.map((question, index) => enriched[index] ?? question)
      : questions;

  return {
    questions: finais,
    detectedGabarito,
    gabaritoEvidence: evidence,
    aiApplied: Boolean(response.data),
    aiMessage: response.data ? null : response.error,
    aiNotNeeded: false,
    diagnostics: adjustDiagnostics(diagnostics, finais),
    pageCount,
    usedAIExtraction: false,
  };
}

/** Processa um unico PDF. */
export async function processPdf(
  file: File,
  onStage: (stage: Stage) => void,
): Promise<ProcessOutcome> {
  return processPdfs([file], onStage);
}

async function callAI(
  body: ExtractRequest,
): Promise<{ data: ExtractResponse | null; error: string | null }> {
  try {
    // No tier free o Gemini pode demorar bastante. O limite abaixo evita
    // que a pessoa fique olhando a tela sem retorno.
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(110_000),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      return {
        data: null,
        error:
          payload.code === "NO_AI_PROVIDER"
            ? "Sem chave de IA no servidor: o quiz usará apenas o gabarito detectado no PDF."
            : (payload.error ?? `Falha na API (${response.status}).`),
      };
    }

    return { data: await response.json(), error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const timedOut = message.includes("timeout") || message.includes("abort");
    return {
      data: null,
      error: timedOut
        ? "A IA demorou demais para responder. O quiz segue com o gabarito do PDF — sem as explicações extras."
        : `Não foi possível falar com o servidor: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`,
    };
  }
}
