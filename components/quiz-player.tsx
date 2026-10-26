"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Flag,
  X,
} from "lucide-react";
import type { Quiz, QuizState } from "@/lib/types";
import { formatTime, scoreQuiz } from "@/lib/quiz";
import { ProgressBar, Stat } from "./ui";
import { OptionNotes } from "./option-notes";

type Props = {
  topBar: ReactNode;
  quiz: Quiz;
  state: QuizState;
  onStateChange: (state: QuizState) => void;
  onFinish: () => void;
};

/**
 * QuizPlayer — tela de resolução do quiz.
 *
 * Layout (estilo UniFatecie / questionário de faculdade):
 * - Marca (logo + versão) no topo, dentro do fluxo da página.
 * - Quando groupMode é "by-pdf": abas de tópico à esquerda, navegando por tópico.
 * - Quando groupMode é "mixed": sem abas de tópico; navegação linear por todas
 *   as questões embaralhadas.
 * - Navegação (seta anterior / contador X de Y / seta seguinte) ACIMA do enunciado.
 * - Enunciado destacado.
 * - Alternativas com feedback verde (correta) / vermelho (errado).
 * - Explicação abaixo das alternativas, sempre que existir (todas as respostas).
 * - Painel direito fixo com a grade de numeração das questões (bubble por questão).
 * - Barra de progresso + placar abaixo da área da questão.
 */
export function QuizPlayer({
  topBar,
  quiz,
  state,
  onStateChange,
  onFinish,
}: Props) {
  const score = useMemo(() => scoreQuiz(quiz, state), [quiz, state]);
  const question = quiz.questions[state.currentIndex];
  const total = quiz.questions.length;
  const current = state.currentIndex + 1;

  const currentSectionIndex = state.secaoAtual ?? 0;
  const [secoesVisiveis, setSecoesVisiveis] = useState(true);

  // Quando groupMode é "mixed", as questões não são agrupadas por tópico;
  // navegamos linearmente por todas elas.
  const isMixedMode = quiz.settings.groupMode === "mixed";

  /** Tópicos únicos extraídos das questões (só usado em modo by-pdf). */
  const topics = useMemo(() => {
    const mapa = new Map<string, number[]>();
    quiz.questions.forEach((q, index) => {
      const topico = q.topic ?? "Sem tópico";
      const indices = mapa.get(topico) ?? [];
      indices.push(index);
      mapa.set(topico, indices);
    });
    return [...mapa.entries()].map(([topico, indices]) => ({
      topico,
      questoes: indices,
    }));
  }, [quiz.questions]);

  /** Total de questões do tópico atual e a posição da questão dentro desse tópico. */
  const topicoAtual = topics[currentSectionIndex];
  const totalTopico = topicoAtual?.questoes.length ?? total;
  const posicaoNoTopico = topicoAtual?.questoes.indexOf(state.currentIndex) ?? -1;
  const posicaoExibida = posicaoNoTopico >= 0 ? posicaoNoTopico + 1 : current;

  // A correção visual aparece quando há resposta para a questão atual
  // (correção instantânea ou já respondida). A explicação aparece sempre
  // que existir, independente de correta ou errada (§37 item 3).
  const answered = Boolean(state.answers[question.id]);
  const chosen = state.answers[question.id] ?? null;

  const hasPrev = state.currentIndex > 0;
  const hasNext = state.currentIndex < total - 1;

  /**
   * Navega para a próxima questão.
   * Em modo mixed: avança linearmente para a próxima questão.
   * Em modo by-pdf: avança dentro do mesmo tópico; se acabar, vai para o
   * primeiro do próximo tópico; se não houver mais tópicos, finaliza.
   */
  /** Contador exibido no cabeçalho: em modo mixed mostra o total geral; em
   * modo by-pdf mostra a posição dentro do tópico atual. */
  const contadorExibido = isMixedMode
    ? `${current} / ${total}`
    : `${posicaoExibida} / ${totalTopico}`;

  /**
   * Navega para a próxima questão.
   * Em modo mixed: avança linearmente para a próxima questão.
   * Em modo by-pdf: avança dentro do mesmo tópico; se acabar, vai para o
   * primeiro do próximo tópico; se não houver mais tópicos, finaliza.
   */
  const goNext = (nextState: QuizState) => {
    if (isMixedMode) {
      onStateChange({ ...nextState, currentIndex: state.currentIndex + 1 });
      return;
    }
    const nextIdx = topicoAtual?.questoes.indexOf(state.currentIndex) ?? -1;
    if (nextIdx >= 0 && nextIdx < topicoAtual.questoes.length - 1) {
      onStateChange({ ...nextState, currentIndex: topicoAtual.questoes[nextIdx + 1] });
      return;
    }
    const nextTopicIdx = currentSectionIndex + 1;
    if (nextTopicIdx < topics.length) {
      const entry = topics[nextTopicIdx];
      onStateChange({ ...nextState, currentIndex: entry.questoes[0], secaoAtual: nextTopicIdx });
      return;
    }
    onFinish();
  };

  /**
   * Navega para a questão anterior.
   * Em modo mixed: retrocede linearmente para a questão anterior.
   * Em modo by-pdf: retrocede dentro do mesmo tópico; se está na primeira,
   * vai para a última do tópico anterior; se não houver, não faz nada.
   */
  const goPrev = () => {
    if (isMixedMode) {
      onStateChange({ ...state, currentIndex: state.currentIndex - 1 });
      return;
    }
    const prevIdx = topicoAtual?.questoes.indexOf(state.currentIndex) ?? -1;
    if (prevIdx > 0) {
      onStateChange({ ...state, currentIndex: topicoAtual.questoes[prevIdx - 1] });
      return;
    }
    const prevTopicIdx = currentSectionIndex - 1;
    if (prevTopicIdx >= 0) {
      const entry = topics[prevTopicIdx];
      onStateChange({
        ...state,
        currentIndex: entry.questoes[entry.questoes.length - 1],
        secaoAtual: prevTopicIdx,
      });
      return;
    }
  };

  const previousQuestion = () => {
    if (!hasPrev) return;
    goPrev();
  };

  const nextQuestion = () => {
    if (!hasNext) {
      onFinish();
      return;
    }
    goNext(state);
  };

  const selectOption = (label: string) => {
    if (answered) return;
    const nextAnswers = { ...state.answers, [question.id]: label };
    const nextState = { ...state, answers: nextAnswers };
    onStateChange(nextState);
    // Com correção instantânea, avança automaticamente depois de um curto delay.
    if (quiz.settings.instantFeedback) {
      setTimeout(() => {
        goNext(nextState);
      }, 900);
    }
  };

  const toggleFlag = () => {
    const isFlagged = state.flagged.includes(question.id);
    const next = isFlagged
      ? state.flagged.filter((id) => id !== question.id)
      : [...state.flagged, question.id];
    onStateChange({ ...state, flagged: next });
  };

  const toggleSection = (topico: string) => {
    if (isMixedMode) return;
    const entry = topics.find((t) => t.topico === topico);
    if (!entry) return;
    onStateChange({
      ...state,
      currentIndex: entry.questoes[0],
      secaoAtual: topics.findIndex((t) => t.topico === topico),
    });
    // Mantém a lista de tópicos sempre visível; o usuário pode esconder
    // pelo botão de colapso se preferir.
  };

  // Navegação por teclado: setas esquerda/direita trocam a pergunta.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previousQuestion();
      if (event.key === "ArrowRight") nextQuestion();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previousQuestion, nextQuestion]);

  // Opção do estado visual da alternativa (.option usa data-state no CSS)
  const optionState = (option: { label: string }): "selected" | "correct" | "wrong" | null => {
    if (!answered) return null;
    if (option.label === question.correct) return "correct";
    if (option.label === chosen) return "wrong";
    return null;
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* Marca: parte do conteúdo da página, sem cabeçalho fixo */}
      <div className="w-full px-4 sm:px-6">
        <div className="mb-6">{topBar}</div>
      </div>

      <main className="flex-1 min-w-0">
        <div className="w-full px-4 sm:px-6 pb-20">
          {/* Cabeçalho do quiz: título, placar e progresso */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider">
                Quiz
              </h2>
              <h1 className="text-xl font-bold text-ink sm:text-2xl">{quiz.title}</h1>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 text-xs sm:text-sm">
              <Stat label="Acertos" value={score.correct} tone="ok" />
              <Stat label="Erros" value={score.errors} tone="bad" />
              <Stat label="Tempo" value={formatTime(state.elapsedSeconds)} />
            </div>
          </div>

          <ProgressBar value={score.percentage ?? 0} className="mb-6" />

          {/* Corpo: abas à esquerda + conteúdo principal à direita */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-w-0">
            {/* Barra lateral esquerda: abas de tópico (só em modo by-pdf) */}
            {!isMixedMode && (
              <aside
                className="lg:col-span-3 hidden lg:block flex flex-col gap-1 min-w-[160px] max-w-[260px]"
              >
                <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">
                  Tópicos
                </p>
                <button
                  type="button"
                  onClick={() => setSecoesVisiveis((v) => !v)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-line bg-white/[0.02] text-[11px] text-ink-muted transition hover:bg-white/[0.04]"
                >
                  {secoesVisiveis ? "▲" : "▼"}
                  <span className="flex-1 truncate">
                    {topics.length} tópico{topics.length !== 1 ? "s" : ""}
                  </span>
                  <span className="text-ink-faint">
                    {currentSectionIndex + 1} / {topics.length}
                  </span>
                </button>
                {secoesVisiveis && (
                  <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                    {topics.map((topico, index) => (
                      <button
                        key={topico.topico}
                        type="button"
                        onClick={() => toggleSection(topico.topico)}
                        className={`w-full flex items-start gap-2 rounded-lg px-3 py-1.5 text-[11px] leading-tight text-left transition ${
                          index === currentSectionIndex
                            ? "bg-brand/20 border-brand text-ink font-medium"
                            : "text-ink-muted hover:bg-white/[0.02] hover:border-line"
                        }`}
                      >
                        <span className="flex-1 break-words">{topico.topico}</span>
                        <span className="shrink-0 text-[9px] text-ink-faint">
                          {topico.questoes.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            )}

            {/* Conteúdo principal: navegação no topo, enunciado, alternativas, explicação */}
            <section
              className={
                isMixedMode ? "lg:col-span-10 min-w-0" : "lg:col-span-7 min-w-0"
              }
            >
              {/* Navegação centralizada acima da pergunta (§37 item 1) */}
              <div className="flex flex-col items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={previousQuestion}
                    disabled={!hasPrev}
                    className="grid size-9 cursor-pointer place-items-center rounded-xl border border-white text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:border-white/30 disabled:text-white/30"
                  >
                    <ArrowLeft className="size-4 text-white" />
                  </button>
                  <span className="font-mono font-bold text-white">
                    {contadorExibido}
                  </span>
                  <button
                    type="button"
                    onClick={nextQuestion}
                    disabled={!hasNext}
                    className="grid size-9 cursor-pointer place-items-center rounded-xl border border-white text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 disabled:border-white/30 disabled:text-white/30"
                  >
                    <ArrowRight className="size-4 text-white" />
                  </button>
                </div>

                {/* Enunciado da questão (§36 item 1) */}
                {question ? (
                  <div className="text-center">
                    <p className="text-base font-medium text-ink leading-relaxed sm:text-lg">
                      {question.statement}
                    </p>
                  </div>
                ) : null}
              </div>

              {question ? (
                <div className="mt-6 space-y-4">
                  {/* Alternativas com feedback visual (§36 item 2, §37 item 2) */}
                  <div className="space-y-2">
                    {question.options.map((option) => {
                      const state_ = optionState(option);
                      const isChosen = option.label === chosen;
                      const isCorrectOption = option.label === question.correct;
                      return (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => selectOption(option.label)}
                          disabled={answered}
                          className={`option w-full ${
                            state_
                              ? `data-state=${JSON.stringify(state_)}`
                              : isChosen
                                ? "data-state=selected"
                                : ""
                          }`}
                        >
                          <span className="shrink-0 font-mono font-bold text-ink">
                            {option.label}
                          </span>
                          <span className="flex-1 text-left text-sm leading-relaxed">
                            {option.text}
                          </span>
                          {answered && isCorrectOption ? (
                            <Check className="size-4 shrink-0 text-ok" />
                          ) : answered && isChosen && !isCorrectOption ? (
                            <X className="size-4 shrink-0 text-bad" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explicação para TODAS as respostas (§37 item 3) */}
                  {answered && question.explanation && (
                    <div
                      className="rounded-lg border border-line bg-white/[0.02] p-4 text-sm leading-relaxed text-ink-muted"
                    >
                      <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">
                        Explicação
                      </p>
                      {question.explanation}
                    </div>
                  )}

                  {/* Análise por alternativa (notas do PDF / IA) */}
                  {answered && <OptionNotes question={question} className="mt-2" />}

                  {/* Botão pular (sem resposta) quando não há correção instantânea */}
                  {!answered && !quiz.settings.instantFeedback && question.correct !== null && (
                    <button
                      type="button"
                      onClick={nextQuestion}
                      className="btn btn-ghost mt-3 text-xs text-ink-muted"
                    >
                      Pular →
                    </button>
                  )}
                </div>
              ) : null}

              {/* Painel de controle inferior: marcador e finalizar */}
              <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  onClick={toggleFlag}
                  className="flex items-center gap-2 btn btn-ghost text-xs"
                >
                  <Flag className="size-3.5" />
                  {state.flagged.includes(question.id) ? "Desmarcar revisão" : "Marcar para revisão"}
                </button>
                <div className="flex items-center gap-2 text-xs text-ink-faint">
                  <span>{formatTime(state.elapsedSeconds)}</span>
                  {score.gradeable > 0 ? (
                    <span className="font-mono tabular-nums">
                      {score.correct} / {score.gradeable}
                    </span>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Barra lateral direita: grade de numeração das questões (§37 item 4) */}
            <aside className="lg:col-span-2 hidden lg:block flex flex-col gap-3 min-w-[200px]">
              <div className="sticky top-4">
                <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-2">
                  Navegação do questionário
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {isMixedMode
                    ? quiz.questions.map((q, index) => {
                        const answeredHere = Boolean(state.answers[q.id]);
                        const isCurrent = index === state.currentIndex;
                        const isFlagged = state.flagged.includes(q.id);
                        let tone: "correct" | "wrong" | "answered" | "current" | "pending" =
                          "pending";
                        if (isCurrent) tone = "current";
                        else if (answeredHere) {
                          tone =
                            state.answers[q.id] === q.correct ? "correct" : "wrong";
                        } else if (isFlagged) {
                          tone = "answered";
                        }
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() =>
                              onStateChange({ ...state, currentIndex: index })
                            }
                            disabled={isCurrent}
                            className={`bubble shrink-0 ${
                              tone === "correct"
                                ? "border-ok bg-ok/20 text-ok"
                                : tone === "wrong"
                                  ? "border-bad bg-bad/20 text-bad"
                                  : tone === "answered"
                                    ? "border-brand bg-brand/20 text-brand"
                                    : tone === "current"
                                      ? "border-brand bg-brand text-ink"
                                      : ""
                            } ${isFlagged ? "ring-2 ring-brand" : ""}`}
                            title={`Questão ${index + 1}`}
                          >
                            {index + 1}
                          </button>
                        );
                      })
                    : topicoAtual?.questoes.map((originalIndex, posicao) => {
                        const q = quiz.questions[originalIndex];
                        const answeredHere = Boolean(state.answers[q.id]);
                        const isCurrent = originalIndex === state.currentIndex;
                        const isFlagged = state.flagged.includes(q.id);
                        let tone: "correct" | "wrong" | "answered" | "current" | "pending" =
                          "pending";
                        if (isCurrent) tone = "current";
                        else if (answeredHere) {
                          tone =
                            state.answers[q.id] === q.correct ? "correct" : "wrong";
                        } else if (isFlagged) {
                          tone = "answered";
                        }
                        return (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() =>
                              onStateChange({ ...state, currentIndex: originalIndex })
                            }
                            disabled={isCurrent}
                            className={`bubble shrink-0 ${
                              tone === "correct"
                                ? "border-ok bg-ok/20 text-ok"
                                : tone === "wrong"
                                  ? "border-bad bg-bad/20 text-bad"
                                  : tone === "answered"
                                    ? "border-brand bg-brand/20 text-brand"
                                    : tone === "current"
                                      ? "border-brand bg-brand text-ink"
                                      : ""
                            } ${isFlagged ? "ring-2 ring-brand" : ""}`}
                            title={`Questão ${posicao + 1}`}
                          >
                            {posicao + 1}
                          </button>
                        );
                      })}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
