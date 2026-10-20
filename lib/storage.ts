"use client";

import type { Quiz, QuizState } from "@/lib/types";

const QUIZ_KEY = "apoquiz:quizzes:v1";
const STATE_KEY = "apoquiz:states:v1";

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

function writeJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // cota cheia ou modo privado: seguimos sem persistencia
  }
}

export function saveQuiz(quiz: Quiz): void {
  const all = readJSON<Quiz[]>(QUIZ_KEY, []);
  const next = [quiz, ...all.filter((item) => item.id !== quiz.id)].slice(0, 12);
  writeJSON(QUIZ_KEY, next);
}

export function loadQuizzes(): Quiz[] {
  return readJSON<Quiz[]>(QUIZ_KEY, []);
}

export function removeQuiz(id: string): void {
  const all = readJSON<Quiz[]>(QUIZ_KEY, []).filter((item) => item.id !== id);
  writeJSON(QUIZ_KEY, all);

  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  delete states[id];
  writeJSON(STATE_KEY, states);
}

export function saveState(quizId: string, state: QuizState): void {
  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  states[quizId] = state;
  writeJSON(STATE_KEY, states);
}

export function loadState(quizId: string): QuizState | null {
  const states = readJSON<Record<string, QuizState>>(STATE_KEY, {});
  return states[quizId] ?? null;
}
