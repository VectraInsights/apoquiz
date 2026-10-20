"use client";

import { useMemo } from "react";
import {
  Check,
  Download,
  Printer,
  RotateCcw,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import type { Quiz, QuizState } from "@/lib/types";
import { formatTime, scoreQuiz } from "@/lib/quiz";
import { Badge, Stat } from "./ui";

type Props = {
  quiz: Quiz;
  state: QuizState;
  onRetry: () => void;
  onNewFile: () => void;
};

export function ResultsPanel({ quiz, state, onRetry, onNewFile }: Props) {
  const score = useMemo(() => scoreQuiz(quiz, state), [quiz, state]);
  const errors = score.errors;

  const byTopic = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    for (const question of quiz.questions) {
      if (!question.correct) continue;
      const key = question.topic ?? "Sem assunto";
      const entry = map.get(key) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (state.answers[question.id] === question.correct) entry.correct += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [quiz.questions, state.answers]);

  const exportJSON = () => {
    const payload = {
      titulo: quiz.title,
      arquivo: quiz.sourceFile,
      data: new Date().toISOString(),
      tempo: formatTime(state.elapsedSeconds),
      acertos: score.correct,
      total: score.gradeable,
      gabarito: quiz.questions.map((question) => ({
        numero: question.number,
        enunciado: question.statement,
        alternativas: question.options,
        correta: question.correct,
        suaResposta: state.answers[question.id] ?? null,
        explicacao: question.explanation,
        analiseAlternativas: question.optionNotes ?? {},
        assunto: question.topic,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${quiz.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}-gabarito.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-8 sm:px-6">
      {/* Resultado */}
      <div className="panel print-plain p-6 text-center sm:p-8">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-white shadow-lg shadow-brand/25">
          <Trophy className="size-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Resultado</h1>
        <p className="mt-1 text-sm text-ink-muted">{quiz.title}</p>

        <div className="mt-6 flex justify-center">
          <ScoreRing percentage={score.percentage} />
        </div>

        {score.gradeable === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">
            Este quiz <strong className="text-ink">não tem gabarito</strong> cadastrado —
            suas respostas foram registradas, mas não são pontuadas.
          </p>
        ) : (
          <p className="mt-4 text-sm text-ink-muted">
            Você acertou <strong className="text-ink">{score.correct}</strong> de{" "}
            <strong className="text-ink">{score.gradeable}</strong> questões
            {score.pending > 0 ? (
              <>
                {" "}
                e deixou <strong className="text-ink">{score.pending}</strong> sem
                responder
              </>
            ) : null}
            .
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Acertos" value={score.correct} tone="ok" />
          <Stat label="Erros" value={errors} tone="bad" />
          <Stat label="Sem resposta" value={score.pending} />
          <Stat label="Tempo" value={formatTime(state.elapsedSeconds)} />
        </div>
      </div>

      {/* Acoes */}
      <div className="no-print mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onRetry} className="btn btn-primary">
          <RotateCcw className="size-4" />
          Refazer
        </button>
        <button type="button" onClick={() => window.print()} className="btn btn-ghost">
          <Printer className="size-4" />
          Imprimir gabarito
        </button>
        <button type="button" onClick={exportJSON} className="btn btn-ghost">
          <Download className="size-4" />
          Exportar JSON
        </button>
        <button type="button" onClick={onNewFile} className="btn btn-ghost">
          <Upload className="size-4" />
          Novo PDF
        </button>
      </div>

      {/* Desempenho por assunto */}
      {byTopic.length > 0 ? (
        <div className="panel print-plain mt-5 p-5">
          <h2 className="text-sm font-semibold">Desempenho por assunto</h2>
          <div className="mt-4 space-y-3">
            {byTopic.map(([topic, data]) => {
              const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
              return (
                <div key={topic}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-muted">{topic}</span>
                    <span className="tabular-nums text-ink-faint">
                      {data.correct}/{data.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Revisao */}
      <div className="panel print-plain mt-5 p-5">
        <h2 className="text-sm font-semibold">Revisão das questões</h2>
        <div className="mt-4 space-y-3">
          {quiz.questions.map((question, index) => {
            const chosen = state.answers[question.id];
            const isRight = Boolean(chosen) && chosen === question.correct;
            const skipped = !chosen;

            return (
              <div
                key={question.id}
                className="panel-soft print-break p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-relaxed">
                    <span className="mr-1.5 text-ink-faint">
                      {question.number ?? index + 1}.
                    </span>
                    {question.statement}
                  </p>
                  {question.correct ? (
                    <Badge tone={isRight ? "ok" : "bad"}>
                      {isRight ? (
                        <>
                          <Check className="size-3" /> Acertou
                        </>
                      ) : skipped ? (
                        "Sem resposta"
                      ) : (
                        <>
                          <X className="size-3" /> Errou
                        </>
                      )}
                    </Badge>
                  ) : (
                    <Badge tone="warn">Sem gabarito</Badge>
                  )}
                </div>

                <div className="mt-2.5 space-y-1 text-xs">
                  {question.options.map((option) => {
                    const isCorrect = option.label === question.correct;
                    const isChosen = option.label === chosen;
                    const note = question.optionNotes?.[option.label];
                    return (
                      <div key={option.label}>
                        <div
                          className={`flex items-start gap-2 rounded-md px-2 py-1 ${
                            isCorrect
                              ? "bg-ok/12 text-ink"
                              : isChosen
                                ? "bg-bad/12 text-ink-muted line-through"
                                : "text-ink-faint"
                          }`}
                        >
                          <span className="font-semibold">{option.label}</span>
                          <span className="flex-1">{option.text}</span>
                          {isCorrect ? <Check className="size-3.5 shrink-0 text-ok" /> : null}
                        </div>
                        {note ? (
                          <p className="flex items-start gap-1.5 px-2 py-0.5 text-[11px] leading-relaxed text-ink-faint">
                            {isCorrect ? (
                              <Check className="mt-0.5 size-3 shrink-0 text-ok" />
                            ) : (
                              <X className="mt-0.5 size-3 shrink-0 text-bad" />
                            )}
                            <span>{note}</span>
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {question.explanation ? (
                  <p className="mt-2.5 border-t border-line pt-2.5 text-xs leading-relaxed text-ink-muted">
                    {question.explanation}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ percentage }: { percentage: number | null }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const value = percentage === null ? 0 : Math.max(0, Math.min(100, percentage));
  const offset = circumference * (1 - value / 100);

  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="url(#grad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a99bff" />
            <stop offset="100%" stopColor="#4f3fd6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="text-3xl font-semibold tabular-nums">
            {percentage === null ? "—" : `${percentage}%`}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">
            {percentage === null ? "sem gabarito" : "acerto"}
          </p>
        </div>
      </div>
    </div>
  );
}
