"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LayoutGrid,
  Lightbulb,
  X,
} from "lucide-react";
import type { Question, Quiz, QuizState } from "@/lib/types";
import { formatTime, scoreQuiz } from "@/lib/quiz";
import { Badge, ProgressBar } from "./ui";
import { OptionNotes } from "./option-notes";

type Props = {
  quiz: Quiz;
  state: QuizState;
  onStateChange: (state: QuizState) => void;
  onFinish: () => void;
};

export function QuizPlayer({ quiz, state, onStateChange, onFinish }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const total = quiz.questions.length;
  const question = quiz.questions[state.currentIndex];
  const answer = question ? state.answers[question.id] : undefined;
  const instant = quiz.settings.instantFeedback;
  const locked = instant && Boolean(answer);

  const score = useMemo(() => scoreQuiz(quiz, state), [quiz, state]);

  /* ------------------------------ timer ------------------------------ */
  useEffect(() => {
    const timer = window.setInterval(() => {
      onStateChange({
        ...state,
        elapsedSeconds: state.elapsedSeconds + 1,
      });
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

  /* --------------------------- answering ---------------------------- */
  const choose = useCallback(
    (label: string) => {
      if (locked || !question) return;
      onStateChange({
        ...state,
        answers: { ...state.answers, [question.id]: label },
      });
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

  /* --------------------------- shortcuts ---------------------------- */
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (event.key === "ArrowRight") {
        go(state.currentIndex + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        go(state.currentIndex - 1);
        return;
      }
      if (!question) return;

      const key = event.key.toUpperCase();
      const byIndex = "12345".indexOf(event.key);
      if (byIndex >= 0 && question.options[byIndex]) {
        choose(question.options[byIndex].label);
        return;
      }
      if (/^[A-E]$/.test(key) && question.options.some((o) => o.label === key)) {
        choose(key);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [choose, go, question, state.currentIndex]);

  if (!question) return null;

  const answeredCount = Object.keys(state.answers).length;
  const progress = total > 0 ? answeredCount / total : 0;

  const palette = (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Questões</h3>
        <button
          type="button"
          onClick={() => setPaletteOpen(false)}
          className="text-ink-faint transition hover:text-ink lg:hidden"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-8">
        {quiz.questions.map((item, index) => {
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

      <div className="mt-4 space-y-1.5 text-xs text-ink-faint">
        <p className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-white/10" /> não respondida
        </p>
        <p className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-ok/40" /> correta
        </p>
        <p className="flex items-center gap-2">
          <span className="size-2.5 rounded-sm bg-bad/40" /> errada
        </p>
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="btn btn-primary mt-5 w-full"
        disabled={answeredCount === 0}
      >
        Finalizar quiz
      </button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-5 sm:px-6">
      {/* Topo */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{quiz.title}</h1>
          <p className="text-xs text-ink-faint">
            Questão {question.number ?? state.currentIndex + 1} de {total}
            {quiz.sourceFile ? ` · ${quiz.sourceFile}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {quiz.settings.timerMinutes ? (
            <span className="chip tabular-nums">
              <Clock className="size-3.5" />
              {formatTime(state.elapsedSeconds)}
            </span>
          ) : null}
          <span className="chip tabular-nums">
            <Check className="size-3.5" />
            {score.gradeable > 0
              ? `${score.correct}/${score.gradeable}`
              : `${answeredCount}/${total}`}
          </span>
          <button
            type="button"
            onClick={() => setPaletteOpen((value) => !value)}
            className="btn btn-ghost lg:hidden"
          >
            <LayoutGrid className="size-4" />
            {answeredCount}/{total}
          </button>
        </div>
      </div>

      <ProgressBar value={progress} className="mb-5" />

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Questão */}
        <div className="lg:col-span-8">
          <div className="panel p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-soft">
                Questão {question.number ?? state.currentIndex + 1}
              </span>
              <div className="flex items-center gap-2">
                {question.topic ? <Badge tone="brand">{question.topic}</Badge> : null}
                <button
                  type="button"
                  onClick={toggleFlag}
                  aria-label="Marcar para revisar"
                  className={`grid size-10 place-items-center rounded-lg border transition ${
                    state.flagged.includes(question.id)
                      ? "border-warn/50 bg-warn/15 text-warn"
                      : "border-line text-ink-faint hover:text-ink"
                  }`}
                >
                  <Flag className="size-4" />
                </button>
              </div>
            </div>

            <p className="mt-3 text-[15px] leading-relaxed text-ink sm:text-base">
              {question.statement}
            </p>

            <div className="mt-5 space-y-2.5">
              {question.options.map((option) => {
                const chosen = answer === option.label;
                const isCorrectOption = question.correct === option.label;

                let state: "idle" | "selected" | "correct" | "wrong" = "idle";
                if (locked) {
                  if (isCorrectOption) state = "correct";
                  else if (chosen) state = "wrong";
                } else if (chosen) {
                  state = "selected";
                }

                return (
                  <button
                    key={option.label}
                    type="button"
                    disabled={locked}
                    onClick={() => choose(option.label)}
                    data-state={state === "idle" ? undefined : state}
                    className="option"
                  >
                    <span
                      className={`bubble ${
                        state === "correct"
                          ? "border-ok bg-ok text-canvas"
                          : state === "wrong"
                            ? "border-bad bg-bad text-canvas"
                            : state === "selected"
                              ? "border-brand bg-brand text-white"
                              : ""
                      }`}
                    >
                      {state === "correct" ? (
                        <Check className="size-4" />
                      ) : state === "wrong" ? (
                        <X className="size-4" />
                      ) : (
                        option.label
                      )}
                    </span>
                    <span className="flex-1 pt-0.5 text-sm leading-relaxed">
                      {option.text}
                    </span>
                  </button>
                );
              })}
            </div>

            {locked ? (
              <Feedback
                question={question}
                chosen={answer ?? ""}
              />
            ) : question.correct ? null : (
              <p className="mt-4 rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
                Esta questão ainda não tem resposta cadastrada. Responda normalmente —
                ela não contará para a pontuação.
              </p>
            )}
          </div>

          {/* Navegação */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => go(state.currentIndex - 1)}
              disabled={state.currentIndex === 0}
              className="btn btn-ghost"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </button>

            {state.currentIndex === total - 1 ? (
              <button type="button" onClick={onFinish} className="btn btn-primary">
                Finalizar
                <Check className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => go(state.currentIndex + 1)}
                className="btn btn-primary"
              >
                Próxima
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>

          <p className="mt-3 text-center text-[11px] text-ink-faint">
            Atalho: use as teclas A–E ou 1–5 para responder, setas para navegar.
          </p>
        </div>

        {/* Paleta */}
        <div className="hidden lg:col-span-4 lg:block">
          <div className="lg:sticky lg:top-6">{palette}</div>
        </div>
      </div>

      {/* Paleta no mobile */}
      {paletteOpen ? (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-sm lg:hidden">
          <div className="mx-auto mt-16 max-w-md">{palette}</div>
        </div>
      ) : null}
    </div>
  );
}

function Feedback({ question, chosen }: { question: Question; chosen: string }) {
  const correct = question.correct;
  const isRight = chosen === correct;

  return (
    <div
      className={`mt-5 rounded-xl border p-4 ${
        isRight ? "border-ok/35 bg-ok/10" : "border-bad/35 bg-bad/10"
      }`}
    >
      <p className={`text-sm font-semibold ${isRight ? "text-ok" : "text-bad"}`}>
        {isRight ? "Boa! Você acertou." : `Resposta correta: ${correct}`}
      </p>
      {question.explanation ? (
        <p className="mt-1.5 flex items-start gap-2 text-sm leading-relaxed text-ink-muted">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warn" />
          {question.explanation}
        </p>
      ) : null}
      <OptionNotes question={question} className="mt-3 border-t border-white/10 pt-3" />
    </div>
  );
}
