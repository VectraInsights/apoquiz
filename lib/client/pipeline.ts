"use client";

import { extractPdfText } from "@/lib/pdf/extract";
import { applyGabarito, detectGabarito, parseQuestions } from "@/lib/pdf/parser";
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

export async function processPdf(
  file: File,
  onStage: (stage: Stage) => void,
): Promise<ProcessOutcome> {
  if (!isPdf(file)) {
    throw new Error("Envie um arquivo PDF.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("O PDF passa de 25 MB. Divida o arquivo e tente novamente.");
  }

  onStage({ label: "Lendo o PDF…", progress: 0.04 });

  const buffer = await file.arrayBuffer();
  const doc = await extractPdfText(buffer, (page, total) => {
    onStage({
      label: `Extraindo texto — página ${page} de ${total}…`,
      progress: 0.05 + (page / total) * 0.4,
    });
  });

  if (doc.isProbablyScanned) {
    throw new Error(
      "Este PDF parece ser um escaneamento (sem texto selecionável). Converta para PDF digital antes de enviar.",
    );
  }

  onStage({ label: "Procurando questões e gabarito…", progress: 0.5 });

  const gabaritoResult = detectGabarito(doc.pages);
  const parsed = parseQuestions(doc.pages);
  const applied = applyGabarito(parsed, gabaritoResult.gabarito);

  const localQuestions: Question[] = parsed.map((item, index) => ({
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

  const detectedGabarito = gabaritoResult.gabarito;

  // Caso o parser local nao tenha encontrado questoes, a IA extrai do texto.
  if (localQuestions.length < 2) {
    onStage({
      label: "Layout não reconhecido — a IA está lendo o PDF…",
      progress: 0.6,
    });

    const response = await callAI({
      mode: "extract",
      text: doc.text.slice(0, MAX_TEXT_CHARS),
      gabarito: detectedGabarito,
    });

    if (!response.data) {
      return {
        questions: [],
        detectedGabarito,
        gabaritoEvidence: gabaritoResult.evidence,
        aiApplied: false,
        aiMessage: response.error,
        aiNotNeeded: false,
        pageCount: doc.pageCount,
        usedAIExtraction: false,
      };
    }

    return {
      questions: response.data.questions,
      detectedGabarito,
      gabaritoEvidence: gabaritoResult.evidence,
      aiApplied: true,
      aiMessage: null,
      aiNotNeeded: false,
      pageCount: doc.pageCount,
      usedAIExtraction: true,
    };
  }

  // A IA so e necessaria para o que o PDF nao trouxe (explicacao e
  // analise por alternativa). Numa apostila editorial com secao de
  // comentarios, nenhuma chamada e feita - e o resultado chega na hora.
  const needsAI = localQuestions.some(
    (question) =>
      !question.explanation ||
      Object.keys(question.optionNotes ?? {}).length === 0,
  );

  if (!needsAI) {
    return {
      questions: localQuestions,
      detectedGabarito,
      gabaritoEvidence: gabaritoResult.evidence,
      aiApplied: false,
      aiMessage: null,
      aiNotNeeded: true,
      pageCount: doc.pageCount,
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
    questions: localQuestions.slice(0, MAX_AI_QUESTIONS),
    gabarito: detectedGabarito,
  });

  // A IA devolve as questoes processadas na mesma ordem. Se ela devolver
  // menos que o enviado, o restante da apostila e preservado.
  const enriched = response.data?.questions ?? [];
  const questions =
    enriched.length > 0
      ? localQuestions.map((question, index) => enriched[index] ?? question)
      : localQuestions;

  return {
    questions,
    detectedGabarito,
    gabaritoEvidence: gabaritoResult.evidence,
    aiApplied: Boolean(response.data),
    aiMessage: response.data ? null : response.error,
    aiNotNeeded: false,
    pageCount: doc.pageCount,
    usedAIExtraction: false,
  };
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

    return { data: (await response.json()) as ExtractResponse, error: null };
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
