"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabase } from "@/lib/supabase/client";
import {
  listLocalQuizzes,
  loadLocalQuiz,
  loadLocalState,
  loadLocalStates,
  removeLocalQuiz,
  saveLocalQuiz,
  saveLocalState,
  toSummary,
} from "@/lib/storage";
import type { Question, Quiz, QuizState, QuizSummary } from "@/lib/types";

/**
 * Camada de persistencia com dois alvos:
 *
 *  - "local": so neste dispositivo (localStorage). Funciona sem login.
 *  - "cloud": Supabase, com o login Google. Sincroniza entre aparelhos.
 *
 * O PDF nunca e enviado: o que chega ao servidor e apenas o JSON do
 * quiz ja extraido no navegador.
 */
export type SyncTarget = "local" | "cloud";

const MAX_CLOUD_QUIZZES = 20;

/* ------------------------------------------------------------------ */
/* Local                                                               */
/* ------------------------------------------------------------------ */

export async function listQuizzes(target: SyncTarget): Promise<QuizSummary[]> {
  if (target === "local") return listLocalQuizzes();
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, source_file, created_at, stats")
    .order("created_at", { ascending: false })
    .limit(MAX_CLOUD_QUIZZES);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "Sem titulo",
    sourceFile: (row.source_file as string) ?? "",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    stats: (row.stats as QuizSummary["stats"]) ?? {
      total: 0,
      withAnswer: 0,
      fromGabarito: 0,
      fromAI: 0,
      withoutAnswer: 0,
    },
  }));
}

export async function getQuiz(
  target: SyncTarget,
  quizId: string,
): Promise<Quiz | null> {
  if (target === "local") return loadLocalQuiz(quizId);
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data: header } = await supabase
    .from("quizzes")
    .select("id, title, source_file, created_at, settings, stats, detected_gabarito")
    .eq("id", quizId)
    .maybeSingle();

  if (!header) return null;

  const { data: rows } = await supabase
    .from("quiz_questions")
    .select("qid, position, number, statement, options, correct, explanation, option_notes, topic, level, answer_source, page, section")
    .eq("quiz_id", quizId)
    .order("position", { ascending: true });

  const questions: Question[] = (rows ?? []).map((row) => ({
    // O id original e preservado: as respostas salvas no progresso usam
    // essa chave.
    id: (row.qid as string | null) ?? `${quizId}-${row.position}`,
    number: (row.number as number | null) ?? null,
    statement: (row.statement as string) ?? "",
    options: (row.options as Question["options"]) ?? [],
    correct: (row.correct as string | null) ?? null,
    explanation: (row.explanation as string | null) ?? null,
    optionNotes: (row.option_notes as Question["optionNotes"]) ?? null,
    topic: (row.topic as string | null) ?? null,
    level: (row.level as Question["level"]) ?? null,
    answerSource:
      ((row.answer_source as Question["answerSource"]) ?? "desconhecida"),
    page: (row.page as number | null) ?? null,
    section: (row.section as string | null) ?? null,
  }));

  return {
    id: quizId,
    title: (header.title as string) ?? "Sem titulo",
    sourceFile: (header.source_file as string) ?? "",
    createdAt: (header.created_at as string) ?? new Date().toISOString(),
    questions,
    settings:
      (header.settings as Quiz["settings"]) ??
      ({
        shuffleQuestions: true,
        shuffleOptions: false,
        instantFeedback: true,
        timerMinutes: null,
        order: "pdf",
      } satisfies Quiz["settings"]),
    detectedGabarito:
      (header.detected_gabarito as Record<string, string>) ?? {},
    stats:
      (header.stats as Quiz["stats"]) ?? {
        total: questions.length,
        withAnswer: 0,
        fromGabarito: 0,
        fromAI: 0,
        withoutAnswer: 0,
      },
  };
}

export async function putQuiz(target: SyncTarget, quiz: Quiz): Promise<void> {
  if (target === "local") {
    saveLocalQuiz(quiz);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return;

  const { error } = await supabase.from("quizzes").upsert(
    {
      id: quiz.id,
      user_id: userId,
      title: quiz.title,
      source_file: quiz.sourceFile,
      created_at: quiz.createdAt,
      settings: quiz.settings,
      stats: quiz.stats,
      detected_gabarito: quiz.detectedGabarito,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("[sync] nao foi possivel salvar o quiz:", error.message);
    return;
  }

  // As questoes sao gravadas em lote; o PDF com 1.824 questoes gera
  // algumas centenas de linhas.
  const rows = quiz.questions.map((question, index) => ({
    quiz_id: quiz.id,
    position: index,
    qid: question.id,
    number: question.number,
    statement: question.statement,
    options: question.options,
    correct: question.correct,
    explanation: question.explanation,
    option_notes: question.optionNotes ?? null,
    topic: question.topic,
    level: question.level ?? null,
    answer_source: question.answerSource,
    page: question.page,
    section: question.section ?? null,
  }));

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error: chunkError } = await supabase
      .from("quiz_questions")
      .upsert(chunk, { onConflict: "quiz_id,position" });
    if (chunkError) {
      console.error("[sync] nao foi possivel salvar as questoes:", chunkError.message);
      return;
    }
  }
}

export async function getState(
  target: SyncTarget,
  quizId: string,
): Promise<QuizState | null> {
  if (target === "local") return loadLocalState(quizId);
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("quiz_states")
    .select("answers, flagged, current_index, started_at, finished_at, elapsed_seconds")
    .eq("quiz_id", quizId)
    .maybeSingle();

  if (!data) return null;

  return {
    answers: (data.answers as QuizState["answers"]) ?? {},
    flagged: (data.flagged as string[]) ?? [],
    currentIndex: (data.current_index as number) ?? 0,
    startedAt: (data.started_at as string) ?? "",
    finishedAt: (data.finished_at as string | null) ?? null,
    elapsedSeconds: (data.elapsed_seconds as number) ?? 0,
  };
}

/** Progresso de varios quizzes de uma vez (para a lista da tela inicial). */
export async function listStates(
  target: SyncTarget,
  quizIds: string[],
): Promise<Record<string, QuizState>> {
  if (quizIds.length === 0) return {};
  if (target === "local") {
    const all = loadLocalStates();
    const out: Record<string, QuizState> = {};
    for (const id of quizIds) {
      if (all[id]) out[id] = all[id];
    }
    return out;
  }

  const supabase = getSupabase();
  if (!supabase) return {};

  const { data } = await supabase
    .from("quiz_states")
    .select("quiz_id, answers, flagged, current_index, started_at, finished_at, elapsed_seconds")
    .in("quiz_id", quizIds);

  const out: Record<string, QuizState> = {};
  for (const row of data ?? []) {
    const id = row.quiz_id as string;
    out[id] = {
      answers: (row.answers as QuizState["answers"]) ?? {},
      flagged: (row.flagged as string[]) ?? [],
      currentIndex: (row.current_index as number) ?? 0,
      startedAt: (row.started_at as string) ?? "",
      finishedAt: (row.finished_at as string | null) ?? null,
      elapsedSeconds: (row.elapsed_seconds as number) ?? 0,
    };
  }
  return out;
}

export async function putState(
  target: SyncTarget,
  quiz: Quiz,
  state: QuizState,
): Promise<void> {
  if (target === "local") {
    saveLocalState(quiz.id, state);
    return;
  }

  const supabase = getSupabase();
  if (!supabase) return;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return;

  const { error } = await supabase.from("quiz_states").upsert(
    {
      quiz_id: quiz.id,
      user_id: userId,
      answers: state.answers,
      flagged: state.flagged,
      current_index: state.currentIndex,
      started_at: state.startedAt || null,
      finished_at: state.finishedAt,
      elapsed_seconds: state.elapsedSeconds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "quiz_id" },
  );

  if (error) {
    console.error("[sync] nao foi possivel salvar o progresso:", error.message);
  }
}

export async function deleteQuiz(
  target: SyncTarget,
  quizId: string,
): Promise<void> {
  if (target === "local") {
    removeLocalQuiz(quizId);
    return;
  }
  const supabase = getSupabase();
  if (!supabase) return;
  await supabase.from("quizzes").delete().eq("id", quizId);
}

/** Resumo local, usado quando o usuario esta logado mas ainda nao tem nada na nuvem. */
export function localSummaryOf(quiz: Quiz): QuizSummary {
  return toSummary(quiz);
}

export type { SupabaseClient };
