"use client";

import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import type { Quiz, QuizState } from "@/lib/types";
import { formatTime, scoreQuiz } from "@/lib/quiz";
import { ProgressBar } from "./ui";

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
  const secoes = quiz.secoes?.length ?? 0;
  const secaoAtual = secoes > 0 ? quiz.secoes[state.secaoAtual ?? 0] : null;
  const questoes = secaoAtual ? secaoAtual.questoes : quiz.questions;
  const total = questoes.length;
  const question = questoes[state.currentIndex];
  const answer = question ? state.answers[question.id] : undefined;
  const instant = quiz.settings.instantFeedback;
  const locked = instant && Boolean(answer);
  // Mostra feedback so DEPOIS que o usuario marcar algo
  const showResult = Boolean(answer);

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
    <div className="min-h-[calc(100vh-12rem)] flex flex-col bg-[#0b0f19] text-[#e8eaf6]">
      {topBar ? <div className="mb-4">{topBar}</div> : null}

      {/* Barra superior: navegacao + contador */}
      <div className="px-4 sm:px-6 pb-2">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => go(state.currentIndex - 1)}
              disabled={state.currentIndex === 0}
              className="rounded-lg border border-white/20 bg-white/5 p-2 text-white/50 disabled:opacity-30 disabled:pointer-events-none transition hover:bg-white/10"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="text-xs text-white/40">
              {state.currentIndex + 1} / {total}
            </span>
            <button
              type="button"
              onClick={() => go(state.currentIndex + 1)}
              disabled={state.currentIndex >= total - 1}
              className="rounded-lg border border-white/20 bg-indigo/10 p-2 text-indigo disabled:opacity-30 disabled:pointer-events-none transition hover:bg-indigo/20"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-white/40">
            <span className="text-white/50">{answeredCount}</span>{" "}
            <span className="text-white/40">/{total} respondidas</span>
            <span className="ml-2 flex items-center gap-1">
              <Clock className="size-3.5" />
              {formatTime(state.elapsedSeconds)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Barra lateral ESQUERDA: secoes (tópicos) - tipo UniFatecie */}
        {secoes > 0 ? (
          <div className="w-full sm:w-80 bg-[#0b0f19] border-r border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0b0f19]/80 backdrop-blur-md">
              <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Seções</h2>
              <button
                type="button"
                onClick={onFinish}
                className="text-xs text-white/50 hover:text-white transition"
              >
                Finalizar tentativa
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {quiz.secoes!.map((s, i) => {
                const temRespondidas = s.questoes.filter((q) => state.answers[q.id]).length;
                const selecionado = i === (state.secaoAtual ?? 0);
                return (
                  <button
                    key={s.topico}
                    type="button"
                    onClick={() => trocarSecao(i)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${selecionado ? "border-brand bg-brand/20 text-white" : "border-white/10 text-white/60 hover:border-brand/50 hover:bg-white/5"}`}
                  >
                    <span className="flex-1 truncate">{s.topico}</span>
                    <span className="text-[10px]">{temRespondidas}/{s.questoes.length}</span>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-white/10">
              <p className="text-[10px] text-white/40 text-center">
                {answeredCount}/{total} respondidas
              </p>
            </div>
          </div>
        ) : null}

        {/* Area principal: enunciado + alternativas */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-8">
          <div className="max-w-2xl mx-auto">
            {question && (
              <>
                <div className="mb-6">
                  <p className="text-white leading-relaxed text-lg font-medium">
                    {question.statement}
                  </p>
                </div>

                <div className="space-y-3 mb-8">
                  {question.options.map((option) => {
                    const isSelected = answer === option.label;
                    const isCorrect = option.label === question.correct;

                    // Feedback visual so aparece DEPOIS de marcar
                    let base = "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20";
                    let circleBg = "text-white";
                    let checkIcon = null;

                    if (isSelected) {
                      if (isCorrect) {
                        // alternativa selecionada e correta -> verde
                        base = "bg-green/15 border-green/50 text-green";
                        circleBg = "bg-green text-white";
                        checkIcon = (
                          <svg className="size-4 shrink-0 text-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        );
                      } else {
                        // alternativa selecionada e incorreta -> vermelha
                        base = "bg-red/15 border-red/50 text-red";
                        circleBg = "bg-red text-white";
                        checkIcon = (
                          <svg className="size-4 shrink-0 text-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        );
                      }
                    }

                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => choose(option.label)}
                        disabled={locked}
                        className={`flex items-center gap-3 w-full rounded-xl border px-4 py-3.5 text-left transition ${base}`}
                      >
                        <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${circleBg}`}>
                          {option.label}
                        </span>
                        <span className="flex-1 min-w-0">{option.text}</span>
                        {checkIcon}
                      </button>
                    );
                  })}
                </div>

                {/* Justificativa/explicacao so aparece depois de marcar */}
                {showResult && question.explanation && (
                  <div className="mt-4 p-4 rounded-xl bg-green/5 border border-green/20 text-sm text-green/90">
                    {question.explanation}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Placar */}
        <div className="border-t border-white/10 bg-[#0b0f19] px-4 sm:px-6 py-3">
          <ProgressBar value={(score.percentage ?? 0) / 100} className="mb-3" />
          <div className="flex justify-between text-sm">
            <span className="text-white/60">
              {score.correct} acerto{score.correct !== 1 ? "s" : ""}
            </span>
            <span className="text-white/40">
              {score.errors} erro{score.errors !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Acoes finais */}
        <div className="border-t border-white/10 bg-[#0b0f19] px-4 sm:px-6 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-white/40 transition hover:text-white"
                onClick={onFinish}
              >
                Finalizar quiz
              </button>
              <button
                type="button"
                onClick={() => toggleFlag()}
                className={`text-xs p-1.5 rounded hover:bg-white/10 transition ${
                  state.flagged.includes(question.id) ? "text-yellow-400" : "text-white/40"
                }`}
                title="Marcar para revisar"
              >
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17l5-5-5-5M15 17l-5 5m5-5l-5 5" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={onFinish}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white/50 transition hover:bg-white/10"
            >
              Finalizar quiz
            </button>
          </div>
        </div>
      </div>

      {/* Barra lateral DIREITA: navegacao do questionario com numeros (tipo UniFatecie imagem 2) */}
      <div className="fixed inset-y-0 right-0 z-20 w-full sm:w-80 bg-[#0b0f19] border-l border-white/10 flex flex-col transform transition-transform duration-300 sm:translate-x-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0b0f19]/80 backdrop-blur-md">
          <h2 className="text-xs font-semibold text-white/70 uppercase tracking-wider">Navegação do questionário</h2>
          <button
            type="button"
            onClick={onFinish}
            className="text-xs text-white/50 hover:text-white transition"
          >
            Finalizar tentativa
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-5 gap-2">
            {questoes.map((item, index) => {
              const chosen = state.answers[item.id];
              const isCurrent = index === state.currentIndex;
              const isCorrect = chosen && item.correct ? chosen === item.correct : false;

              let bg = "bg-white/5";
              let border = "border-white/10";
              let text = "text-white/60";
              if (chosen && isCorrect) {
                bg = "bg-green/20";
                border = "border-green/50";
                text = "text-green";
              } else if (chosen && !isCorrect) {
                bg = "bg-red/20";
                border = "border-red/50";
                text = "text-red";
              } else if (chosen) {
                bg = "bg-indigo/20";
                border = "border-indigo/50";
                text = "text-indigo";
              } else if (isCurrent) {
                bg = "bg-white/20";
                border = "border-brand";
                text = "text-white";
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => go(index)}
                  className={`aspect-square rounded-lg border flex items-center justify-center text-xs font-semibold transition ${bg} ${border} ${text} disabled:opacity-50`}
                >
                  {item.number ?? index + 1}
                  {state.flagged.includes(item.id) && (
                    <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-yellow-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 border-t border-white/10">
          <p className="text-[10px] text-white/40 text-center">
            {answeredCount}/{total} respondidas
          </p>
        </div>
      </div>
    </div>
  );
}
