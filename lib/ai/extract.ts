import "server-only";

import { getProvider, type AIProvider } from "./provider";
import { buildEnrichPrompt, buildExtractPrompt, QUESTIONS_SCHEMA } from "./prompts";
import { lookupGabarito } from "@/lib/pdf/parser";
import { MAX_AI_QUESTIONS, type Question } from "@/lib/types";

const BATCH_SIZE = 8;
const MAX_CONCURRENCY = 3;
export const MAX_QUESTIONS = MAX_AI_QUESTIONS;

type AIRawQuestion = {
  number?: number | null;
  statement?: string;
  options?: { label?: string; text?: string }[];
  correct?: string;
  explanation?: string;
  optionNotes?: { label?: string; text?: string }[];
  topic?: string;
};

function normalizeLetter(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(/[A-E]/);
  return match ? match[0] : null;
}

function makeId(index: number): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `q${index + 1}-${random}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Recorta o gabarito para as questoes do lote. Mantem a chave original
 * ("capitulo#numero" ou "numero") para que a IA consiga casar a entrada
 * certa com a questao.
 */
function gabaritoForBatch(
  gabarito: Record<string, string> | null,
  batch: Question[],
): Record<string, string> | null {
  if (!gabarito) return null;

  const subset: Record<string, string> = {};
  for (const question of batch) {
    if (question.number === null) continue;
    if (question.section) {
      const scoped = `${question.section}#${question.number}`;
      if (gabarito[scoped]) {
        subset[scoped] = gabarito[scoped];
        continue;
      }
    }
    const plain = gabarito[String(question.number)];
    if (plain) subset[String(question.number)] = plain;
  }

  return Object.keys(subset).length > 0 ? subset : null;
}

/**
 * Enriquece questoes ja parseadas: limpa o texto, aplica o gabarito
 * (quando existe) e gera explicacoes.
 *
 * A lista completa volta ao cliente: apenas as primeiras MAX_QUESTIONS
 * sao processadas pela IA, mas as demais mantem o gabarito lido do PDF.
 *
 * Otimizacao: a IA so e chamada para o que o PDF **nao** trouxe. Numa
 * apostila editorial com secao de comentarios, todas as questoes ja vem
 * com explicacao e analise por alternativa - e nenhuma chamada e feita.
 */
export async function enrichQuestions(
  provider: AIProvider,
  questions: Question[],
  gabarito: Record<string, string> | null,
): Promise<Question[]> {
  const limited = questions.slice(0, MAX_QUESTIONS);

  // Quais questoes realmente precisam da IA.
  const pending = limited
    .map((question, index) => ({ question, index }))
    .filter(
      ({ question }) => !hasExplanation(question) || !hasOptionNotes(question),
    );

  if (pending.length === 0) {
    // O PDF ja trouxe tudo: nao ha por que chamar a IA.
    return limited;
  }

  const batches = chunk(pending, BATCH_SIZE);

  const answers = await mapWithConcurrency(batches, MAX_CONCURRENCY, async (batch) => {
    // Manda so o gabarito das questoes do lote. Com uma apostila de 1.824
    // questoes, o gabarito completo entraria em todos os lotes.
    const batchGabarito = gabaritoForBatch(
      gabarito,
      batch.map((item) => item.question),
    );
    const raw = (await provider.complete(
      buildEnrichPrompt(batch.map((item) => item.question), batchGabarito),
      QUESTIONS_SCHEMA,
    )) as { questions?: AIRawQuestion[] };

    const list = raw?.questions ?? [];
    const map = new Map<number, AIRawQuestion>();
    list.forEach((item, index) => {
      map.set(index, item);
    });
    return map;
  });

  // Reconstroi: cada lote sabe quais indicesoriginally ele cobria.
  const byIndex = new Map<number, AIRawQuestion>();
  answers.forEach((map, batchIndex) => {
    const offset = batchIndex * BATCH_SIZE;
    map.forEach((value, localIndex) => {
      const original = pending[offset + localIndex];
      if (original) byIndex.set(original.index, value);
    });
  });

  return limited.map((question, index) => {
    const ai = byIndex.get(index);
    if (!ai) return question;

    const options = normalizeOptions(ai, question);
    const aiLetter = normalizeLetter(ai.correct);
    const gabaritoLetter = lookupGabarito(gabarito, question);

    // Gabarito do PDF tem prioridade sobre a resposta da IA.
    const ownGabarito =
      question.answerSource === "gabarito" ? normalizeLetter(question.correct) : null;

    const valid = new Set(options.map((option) => option.label));
    let correct = aiLetter && valid.has(aiLetter) ? aiLetter : null;
    let answerSource: Question["answerSource"] = correct ? "ia" : "desconhecida";

    if (ownGabarito && valid.has(ownGabarito)) {
      correct = ownGabarito;
      answerSource = "gabarito";
    } else if (gabaritoLetter && valid.has(gabaritoLetter)) {
      correct = gabaritoLetter;
      answerSource = "gabarito";
    }

    const statement = (ai.statement ?? "").trim();
    const aiExplanation = (ai.explanation ?? "").trim();
    const topic = (ai.topic ?? "").trim();

    // A explicacao e a analise por alternativa escritas no PDF (secao de
    // comentarios) tem prioridade sobre as da IA. A IA so preenche o que
    // o PDF nao traz.
    const ownExplanation = (question.explanation ?? "").trim();
    const ownNotes = question.optionNotes ?? {};
    const aiNotes = normalizeOptionNotes(ai.optionNotes);

    const optionNotes =
      Object.keys(ownNotes).length > 0 ? ownNotes : aiNotes;

    return {
      ...question,
      statement: statement.length > 0 ? statement : question.statement,
      options,
      correct: correct ?? question.correct,
      answerSource:
        answerSource === "desconhecida" && question.correct
          ? question.answerSource
          : answerSource,
      explanation:
        ownExplanation.length > 0 ? ownExplanation : aiExplanation || question.explanation,
      optionNotes,
      topic: topic.length > 0 ? topic : question.topic,
    };
  });
}

/** Normaliza a lista de analises por alternativa vinda da IA. */
function normalizeOptionNotes(
  notes: { label?: string; text?: string }[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const note of notes ?? []) {
    const label = (note.label ?? "").toUpperCase().trim();
    // O icone (X ou ✓) e o veredito ja sao exibidos pela interface.
    const text = (note.text ?? "")
      .trim()
      .replace(/^(?:Incorreta|Correta)\.?\s*/i, "");
    if (!label || !text) continue;
    out[label] = text;
  }
  return out;
}

/** A questao ja tem explicacao vinda do PDF? */
export function hasExplanation(question: Question): boolean {
  return Boolean(question.explanation && question.explanation.trim().length > 0);
}

/** A questao ja tem analise por alternativa vinda do PDF? */
export function hasOptionNotes(question: Question): boolean {
  const notes = question.optionNotes;
  if (!notes) return false;
  return Object.keys(notes).length > 0;
}

function normalizeOptions(
  ai: AIRawQuestion,
  original: Question,
): Question["options"] {
  const aiOptions = (ai.options ?? [])
    .map((option) => ({
      label: (option.label ?? "").toUpperCase().trim(),
      text: (option.text ?? "").trim(),
    }))
    .filter((option) => option.label.length > 0 && option.text.length > 0);

  if (aiOptions.length >= 2) {
    return aiOptions.map((option, index) => ({
      label: String.fromCharCode(65 + index),
      text: option.text,
    }));
  }

  return original.options;
}

/**
 * Extrai questoes a partir do texto bruto do PDF (usado quando o
 * parser heuristico nao encontra nada aproveitavel).
 */
export async function extractQuestions(
  provider: AIProvider,
  text: string,
  gabarito: Record<string, string> | null,
): Promise<Question[]> {
  const chunks = splitText(text, 45000);

  const results = await mapWithConcurrency(chunks, MAX_CONCURRENCY, async (chunkText) => {
    const raw = (await provider.complete(
      buildExtractPrompt(chunkText, gabarito),
      QUESTIONS_SCHEMA,
    )) as { questions?: AIRawQuestion[] };
    return raw?.questions ?? [];
  });

  const all = results.flat();
  const seen = new Set<string>();
  const questions: Question[] = [];

  for (const item of all) {
    const statement = (item.statement ?? "").trim();
    const options = (item.options ?? [])
      .map((option, index) => ({
        label: String.fromCharCode(65 + index),
        text: (option.text ?? "").trim(),
      }))
      .filter((option) => option.text.length > 0);

    if (statement.length < 3 || options.length < 2) continue;

    const fingerprint = statement.slice(0, 60).toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const correct = normalizeLetter(item.correct);
    const gabaritoLetter =
      item.number != null ? normalizeLetter(gabarito?.[String(item.number)]) : null;

    questions.push({
      id: makeId(questions.length),
      number: typeof item.number === "number" ? item.number : null,
      statement,
      options,
      correct: gabaritoLetter ?? correct,
      explanation: (item.explanation ?? "").trim() || null,
      topic: (item.topic ?? "").trim() || null,
      answerSource: gabaritoLetter ? "gabarito" : correct ? "ia" : "desconhecida",
      page: null,
    });

    if (questions.length >= MAX_QUESTIONS) break;
  }

  return questions;
}

/** Divide o texto em pedacos, respeitando os separadores de pagina. */
function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const blocks = text.split(/(?=--- pagina \d+ ---)/g);
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    if (current && current.length + block.length > maxChars) {
      chunks.push(current);
      current = "";
    }
    current += block;
  }

  if (current.trim()) chunks.push(current);
  return chunks;
}

export async function getAIProvider(): Promise<AIProvider | null> {
  return getProvider();
}
