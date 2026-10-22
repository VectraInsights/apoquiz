"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LayoutGrid,
  Lightbulb,
  X,
} from "lucide-react";
import type { Question, Quiz, QuizState } from "@/lib/types";
import { LEVEL_LABELS, type QuestionLevel } from "@/lib/types";
import { formatTime, scoreQuiz } from "@/lib/quiz";
import { Badge, ProgressBar } from "./ui";
import { OptionNotes } from "./option-notes";

const LEVEL_TONE: Record<QuestionLevel, "ok" | "warn" | "bad"> = {
  facil: "ok",
  medio: "warn",
  dificil: "bad",
};

type Props = {
  quiz: Quiz;
  state: QuizState;
  onStateChange: (state: QuizState) => void;
  onFinish: () => void;
  topBar?: ReactNode;
};

export function QuizPlayer({
  quiz,
  state,
  onStateChange,
  onFinish,
  topBar,
}: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Se ha secoes (abas por PDF), mostra apenas essa secao
  const secoes = quiz.secoes?.length ?? 0;
  const secaoAtual = secoes > 0 ? quiz.secoes[state.secaoAtual ?? 0] : null;
  const questoes = secaoAtual ? secaoAtual.questoes : quiz.questions;
  const total = questoes.length;
  const question = questoes[state.currentIndex];
  const answer = question ? state.answers[question.id] : undefined;
  const instant = quiz.settings.instantFeedback;
  const locked = instant && Boolean(answer);

  const score = useMemo(() => scoreQuiz(quiz, state), [quiz, state]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      onStateChange({ ...state, elapsedSeconds: state.elapsedSeconds + 1 });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state, onStateChange]);

  useEffect(() => {
    const limit = quiz.settings.timerMinutes;
    if (!limit) return;
    if (state.elapsedSeconds >= limit * 60) {
      onFinish();
    }
  }, [state.elapsedSeconds, quiz.settings.timerMinutes, onFinish]);

  const choose = useCallback(
    (label: string) => {
      if (locked || !question) return;
      onStateChange({ ...state, answers: { ...state.answers, [question.id]: label } });
    },
    [locked, question, state, onStateChange],
  );

  const go = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      onStateChange({ ...state, currentIndex: index });
    },
    [state, total, onStateChange],
  );

  const toggleFlag = useCallback(() => {
    if (!question) return;
    const flagged = state.flagged.includes(question.id)
      ? state.flagged.filter((id) => id !== question.id)
      : [...state.flagged, question.id];
    onStateChange({ ...state, flagged });
  }, [question, state, onStateChange]);

  const trocarSecao = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= secoes) return;
      onStateChange({ ...state, secaoAtual: idx, currentIndex: 0 });
    },
    [secoes, state, onStateChange],
  );

  if (!question) return null;

  const answeredCount = Object.keys(state.answers).length;

  return (
    <div className="min-h-[calc(100vh-12rem)] flex flex-col">
      {topBar ? <div className="mb-4">{topBar}</div> : null}

      {/* Abas de secoes (quando ha mais de um PDF) */}
      {secoes > 0 ? (
        <div className="mb-3">
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
            {quiz.secoes!.map((s, i) => {
              const temRespondidas = s.questoes.filter((q) => state.answers[q.id]).length;
              const selecionado = i === (state.secaoAtual ?? 0);
              return (
                <button
                  key={s.topico}
                  type="button"
                  onClick={() => trocarSecao(i)}
                  className={`flex flex-col items-center gap-1.5 min-w-[90px] p-2 rounded-lg border text-sm font-medium transition ${
                    selecionado
                      ? "border-brand bg-brand text-white"
                      : "bg-white/5 text-ink-muted hover:bg-white/10 hover:border-brand/50"
                  }`}
                >
                  <span className="font-semibold">{s.topico}</span>
                  <span className="text-[10px]">{temRespondidas}/{s.questoes.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="flex justify-between items-baseline mb-6">
            <div>
              <h1 className="text-lg font-semibold">{quiz.title}</h1>
              <p className="text-xs text-ink-faint">
                Questão {state.currentIndex + 1} de {total}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{answeredCount}</span>{" "}
              <span className="text-xs text-ink-faint">/{total} respondidas</span>
            </div>
          </div>

          <ProgressBar value={score.percentage / 100} />
          <div className="mt-3 flex justify-between">
            <span className="text-sm text-ink-muted">{score.correct} acerto{s}</span>
            <span className="text-sm text-ink-faint">{score.errors} erro{s}</span>
          </div>

          <div className="mt-4 flex-1 overflow-y-auto">
            {questoes.map((item, index) => {
              const chosen = state.answers[item.id];
              const isCurrent = index === state.currentIndex;
              const isCorrect = chosen && item.correct ? chosen === item.correct : false;
              const showResult = instant && chosen;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    go(index);
                    setPaletteOpen(false);
                  }}
                  title={`Questão ${item.number ?? index + 1}`}
                  className={`relative grid size-10 place-items-center rounded-lg border text-xs font-semibold transition ${
                    isCurrent
                      ? "border-brand bg-brand text-white"
                      : showResult
                        ? isCorrect
                          ? "border-ok/50 bg-ok/15 text-ok"
                          : "border-bad/50 bg-bad/15 text-bad"
                        : chosen
                        ? "border-line bg-white/10 text-ink"
                        : "border-line text-ink-faint hover:border-brand/50 hover:text-ink"
                  }`}
                >
                  {item.number ?? index + 1}
                  {state.flagged.includes(item.id) ? (
                    <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warn" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => go(state.currentIndex - 1)}
              disabled={state.currentIndex === 0}
              className="btn btn-ghost disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => go(state.currentIndex + 1)}
              disabled={state.currentIndex >= total - 1}
              className="btn btn-primary disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>

        <div className="border-t border-line py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen((v) => !v)}
                className="text-xs text-ink-faint transition hover:text-ink"
              >
                {paletteOpen ? "Ocultar" : "Mostrar"} questões
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="text-xs text-ink-faint transition hover:text-ink"
              >
                Finalizar quiz
              </button>
            </div>
            <button
              type="button"
              onClick={onFinish}
              className="btn btn-primary"
            >
              Finalizar quiz
            </button>
          </div>
        </div>
      </div>

      {paletteOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-4 sm:p-6 rounded-2xl border border-line bg-panel shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">Questões</h2>
              <button
                type="button"
                onClick={() => setPaletteOpen(false)}
                className="text-xs text-ink-faint transition hover:text-ink"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-1.5">
              {questoes.map((item, index) => {
                const chosen = state.answers[item.id];
                const isCurrent = index === state.currentIndex;
                const isCorrect = chosen && item.correct ? chosen === item.correct : false;
                const showResult = instant && chosen;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      go(index);
                      setPaletteOpen(false);
                    }}
                    title={`Questão ${item.number ?? index + 1}`}
                    className={`grid size-10 place-items-center rounded-lg border text-xs font-semibold transition ${
                      isCurrent
                        ? "border-brand bg-brand text-white"
                        : showResult
                          ? isCorrect
                            ? "border-ok/50 bg-ok/15 text-ok"
                            : "border-bad/50 bg-bad/15 text-bad"
                          : chosen
                          ? "border-line bg-white/10 text-ink"
                          : "border-line text-ink-faint hover:border-brand/50 hover:text-ink"
                    }`}
                  >
                    {item.number ?? index + 1}
                    {state.flagged.includes(item.id) ? (
                      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-warn" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
