import { NextRequest } from "next/server";
import {
  enrichQuestions,
  extractQuestions,
  getAIProvider,
  MAX_QUESTIONS,
} from "@/lib/ai/extract";
import type { ExtractRequest, ExtractResponse, Question } from "@/lib/types";

export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Limite de requisicoes (por instancia)                               */
/* ------------------------------------------------------------------ */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 40;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS) return false;

  bucket.count += 1;
  return true;
}

/* ------------------------------------------------------------------ */

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "anon";
}

function badRequest(message: string, code = 400) {
  return Response.json({ error: message }, { status: code });
}

export async function POST(request: NextRequest) {
  if (!checkRateLimit(clientKey(request))) {
    return badRequest(
      "Muitos processamentos seguidos. Aguarde alguns minutos e tente novamente.",
      429,
    );
  }

  let body: ExtractRequest;
  try {
    body = (await request.json()) as ExtractRequest;
  } catch {
    return badRequest("Corpo da requisicao invalido.");
  }

  const provider = await getAIProvider();
  if (!provider) {
    return Response.json(
      {
        error:
          "Nenhuma chave de IA configurada no servidor. Defina GEMINI_API_KEY nas variaveis de ambiente da Vercel.",
        code: "NO_AI_PROVIDER",
      },
      { status: 503 },
    );
  }

  const gabarito = body.gabarito && Object.keys(body.gabarito).length > 0 ? body.gabarito : null;

  try {
    let questions: Question[];
    let truncated = false;

    if (body.mode === "enrich") {
      if (!body.questions || body.questions.length === 0) {
        return badRequest("Nenhuma questao informada para processar.");
      }
      truncated = body.questions.length > MAX_QUESTIONS;
      questions = await enrichQuestions(provider, body.questions, gabarito);
    } else {
      if (!body.text || body.text.trim().length < 20) {
        return badRequest("Texto do PDF vazio ou muito curto.");
      }
      questions = await extractQuestions(provider, body.text, gabarito);
      truncated = questions.length >= MAX_QUESTIONS;
    }

    const gabaritoHits = questions.filter(
      (question) => question.answerSource === "gabarito",
    ).length;
    const aiAnswers = questions.filter(
      (question) => question.answerSource === "ia",
    ).length;

    const payload: ExtractResponse = {
      questions,
      meta: {
        provider: provider.name,
        model: provider.model,
        processed: questions.length,
        gabaritoHits,
        aiAnswers,
        truncated,
      },
    };

    return Response.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado ao processar.";
    console.error("[extract] erro:", message);
    return Response.json(
      { error: `Falha ao processar com a IA: ${message}` },
      { status: 502 },
    );
  }
}
