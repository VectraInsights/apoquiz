"use client";

import type { Quiz, QuizState, QuizSummary } from "@/lib/types";

const SUMMARIES_KEY = "apoquiz:quizzes:v1";
const STATE_KEY = "apoquiz:states:v1";
const QUIZ_KEY = (id: string) => `apoquiz:quiz:${id}`;

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Cota estourada (ou modo privado): seguimos sem persistir.
    return false;
  }
}

function removeKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignora
  }
}

export function toSummary(quiz: Quiz): QuizSummary {
  return {
    id: quiz.id,
    title: quiz.title,
    sourceFile: quiz.sourceFile,
    createdAt: quiz.createdAt,
    stats: quiz.stats,
  };
}

/** Metadados de todos os quizzes salvos (sem as questoes). */
export function listLocalQuizzes(): QuizSummary[] {
  return readJSON<QuizSummary[]>(SUMMARIES_KEY, []);
}

export function loadLocalQuiz(id: string): Quiz | null {
  return readJSON<Quiz | null>(QUIZ_KEY(id), null);
}

export function saveLocalQuiz(quiz: Quiz): void {
  const summaries = listLocalQuizzes();
  const next = [
    toSummary(quiz),
    ...summaries.filter((item) => item.id !== quiz.id),
  ].slice(0, 20);
  writeJSON(SUMMARIES_KEY, next);
  writeJSON(QUIZ_KEY(quiz.id), quiz);
}

export function removeLocalQuiz(id: string): void {
  writeJSON(
    SUMMARIES_KEY,
    listLocalQuizzes().filter((item) => item.id !== id),
  );
  removeKey(QUIZ_KEY(id));

  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  delete states[id];
  writeJSON(STATE_KEY, states);
}

export function saveLocalState(quizId: string, state: QuizState): void {
  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  states[quizId] = state;
  writeJSON(STATE_KEY, states);
}

export function loadLocalState(quizId: string): QuizState | null {
  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  return states[quizId] ?? null;
}

export function loadLocalStates(): Record<string, QuizState> {
  return readJSON<Record<string, QuizState>>(STATE_KEY, {});
}
