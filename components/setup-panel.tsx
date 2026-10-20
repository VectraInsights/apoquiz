"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  FileText,
  Sparkles,
} from "lucide-react";
import type { Question, QuestionLevel, QuizSettings } from "@/lib/types";
import { LEVEL_LABELS, QUESTION_LEVELS } from "@/lib/types";
import { Badge, Stat, Toggle } from "./ui";

type Props = {
  title: string;
  onTitleChange: (value: string) => void;
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
  sourceFile: string;
  detectedGabarito: Record<string, string>;
  aiApplied: boolean;
  aiNotNeeded: boolean;
  aiMessage: string | null;
  onStart: (settings: QuizSettings, questions: Question[]) => void;
  onBack: () => void;
};

export function SetupPanel({
  title,
  onTitleChange,
  questions,
  onQuestionsChange,
  sourceFile,
  detectedGabarito,
  aiApplied,
  aiNotNeeded,
  aiMessage,
  onStart,
  onBack,
}: Props) {
  const [settings, setSettings] = useState<QuizSettings>({
    shuffleQuestions: true,
    shuffleOptions: false,
    instantFeedback: true,
    timerMinutes: null,
  });
  const [topic, setTopic] = useState<string>("todas");
  const [levels, setLevels] = useState<QuestionLevel[]>([]);
  const [showReview, setShowReview] = useState(true);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const question of questions) {
      if (question.topic) set.add(question.topic);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [questions]);

  /** Quantas questoes por nivel (para os chips). */
  const levelCounts = useMemo(() => {
    const counts = new Map<QuestionLevel, number>();
    for (const question of questions) {
      if (!question.level) continue;
      counts.set(question.level, (counts.get(question.level) ?? 0) + 1);
    }
    return QUESTION_LEVELS.filter((level) => counts.has(level)).map((level) => ({
      level,
      count: counts.get(level) ?? 0,
    }));
  }, [questions]);

  const stats = useMemo(() => {
    const withAnswer = questions.filter((question) => question.correct).length;
    return {
      total: questions.length,
      withAnswer,
      without: questions.length - withAnswer,
      fromGabarito: questions.filter((q) => q.answerSource === "gabarito").length,
      fromAI: questions.filter((q) => q.answerSource === "ia").length,
    };
  }, [questions]);

  const filtered = useMemo(() => {
    const byTopic =
      topic === "todas"
        ? questions
        : questions.filter((question) => question.topic === topic);

    if (levels.length === 0) return byTopic;

    return byTopic.filter(
      (question) => question.level && levels.includes(question.level),
    );
  }, [questions, topic, levels]);

  const setCorrect = (questionId: string, label: string) => {
    onQuestionsChange(
      questions.map((question) =>
        question.id === questionId
          ? {
              ...question,
              correct: label,
              answerSource: question.answerSource === "gabarito" ? "manual" : question.answerSource,
            }
          : question,
      ),
    );
  };

  const handleStart = () => {
    onStart(settings, filtered);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted transition hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Enviar outro PDF
      </button>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Coluna de configuracao */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-6 space-y-4">
            <div className="panel p-5">
              <h2 className="text-lg font-semibold">Quase lá</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Confira o que foi extraído e escolha como quer responder.
              </p>

              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                  Título do quiz
                </span>
                <input
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="Ex.: Direito Constitucional — Revisão"
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
              </label>

              <div className="mt-4 flex items-center gap-2 text-xs text-ink-faint">
                <FileText className="size-3.5" />
                <span className="truncate">{sourceFile}</span>
              </div>
            </div>

            <div className="panel p-5">
              <h3 className="text-sm font-semibold">Modo de resposta</h3>
              <div className="mt-3 space-y-2">
                <Toggle
                  checked={settings.instantFeedback}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, instantFeedback: value }))
                  }
                  label="Correção instantânea"
                  hint="Mostra o gabarito e a explicação logo após responder."
                />
                <Toggle
                  checked={settings.shuffleQuestions}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, shuffleQuestions: value }))
                  }
                  label="Embaralhar as questões"
                />
                <Toggle
                  checked={settings.shuffleOptions}
                  onChange={(value) =>
                    setSettings((current) => ({ ...current, shuffleOptions: value }))
                  }
                  label="Embaralhar as alternativas"
                />
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                  Tempo limite
                </span>
                <select
                  value={settings.timerMinutes ?? ""}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      timerMinutes: event.target.value ? Number(event.target.value) : null,
                    }))
                  }
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
                >
                  <option value="">Sem limite</option>
                  <option value="5">5 minutos</option>
                  <option value="10">10 minutos</option>
                  <option value="20">20 minutos</option>
                  <option value="30">30 minutos</option>
                  <option value="60">60 minutos</option>
                </select>
              </label>

              {topics.length > 0 ? (
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                    Assunto
                  </span>
                  <select
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
                  >
                    <option value="todas">
                      Todos os assuntos ({questions.length})
                    </option>
                    {topics.map((item) => {
                      const count = questions.filter((q) => q.topic === item).length;
                      return (
                        <option key={item} value={item}>
                          {item} ({count})
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}

              {levelCounts.length > 0 ? (
                <div className="mt-4">
                  <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                    Nível de dificuldade
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {levelCounts.map(({ level, count }) => {
                      const active = levels.includes(level);
                      return (
                        <button
                          key={level}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            setLevels((current) =>
                              current.includes(level)
                                ? current.filter((item) => item !== level)
                                : [...current, level],
                            )
                          }
                          className={`chip ${active ? "" : "opacity-60"}`}
                          data-active={active}
                        >
                          {LEVEL_LABELS[level]}
                          <span className="tabular-nums opacity-70">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-ink-faint">
                    {levels.length === 0
                      ? "Todos os níveis"
                      : levels.length === 1
                        ? "1 nível selecionado"
                        : `${levels.length} níveis selecionados`}
                  </p>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleStart}
              disabled={filtered.length === 0}
              className="btn btn-primary w-full py-3 text-base"
            >
              Iniciar quiz
              <ArrowRight className="size-4" />
            </button>
            {filtered.length !== questions.length ? (
              <p className="text-center text-xs text-ink-faint">
                Serão {filtered.length} questões selecionadas.
              </p>
            ) : null}
          </div>
        </div>

        {/* Coluna de revisao */}
        <div className="lg:col-span-7">
          <div className="panel p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Questões" value={stats.total} />
              <Stat label="Com gabarito" value={stats.withAnswer} tone="ok" />
              <Stat label="Do PDF" value={stats.fromGabarito} tone="brand" />
              <Stat
                label="Resolvidas pela IA"
                value={stats.fromAI}
                tone={stats.fromAI > 0 ? "brand" : "default"}
              />
            </div>

            {aiMessage ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-sm text-ok">
                <Check className="mt-0.5 size-4 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA não
                  precisou ser chamada.
                </span>
              </div>
            ) : aiApplied ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/10 p-3.5 text-sm text-brand-soft">
                <Sparkles className="mt-0.5 size-4 shrink-0" />
                <span>
                  A IA conferiu o gabarito do PDF, limpou os enunciados e escreveu as
                  explicações.
                </span>
              </div>
            ) : null}

            {stats.without > 0 ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {stats.without} questão(ões) ficaram sem resposta. Escolha a alternativa
                  correta abaixo para completar o gabarito.
                </span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowReview((value) => !value)}
              className="mt-5 flex w-full items-center justify-between border-t border-line pt-4 text-left"
            >
              <span className="text-sm font-semibold">
                Revisar gabarito
                <span className="ml-2 text-xs font-normal text-ink-faint">
                  clique na alternativa correta para corrigir
                </span>
              </span>
              <ChevronDown
                className={`size-4 text-ink-muted transition ${showReview ? "rotate-180" : ""}`}
              />
            </button>

            {showReview ? (
              <div className="mt-4 space-y-3">
                {filtered.map((question, index) => (
                  <ReviewCard
                    key={question.id}
                    question={question}
                    index={index}
                    onPick={(label) => setCorrect(question.id, label)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {Object.keys(detectedGabarito).length > 0 ? (
            <p className="mt-3 px-1 text-xs text-ink-faint">
              Gabarito detectado no PDF: {Object.keys(detectedGabarito).length} resposta(s)
              mapeada(s) por número.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewCard({
  question,
  index,
  onPick,
}: {
  question: Question;
  index: number;
  onPick: (label: string) => void;
}) {
  const sourceBadge =
    question.answerSource === "gabarito" ? (
      <Badge tone="ok">Do PDF</Badge>
    ) : question.answerSource === "ia" ? (
      <Badge tone="brand">IA</Badge>
    ) : question.answerSource === "manual" ? (
      <Badge tone="warn">Ajustado</Badge>
    ) : (
      <Badge tone="bad">Sem resposta</Badge>
    );

  return (
    <div className="panel-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-relaxed">
          <span className="mr-1.5 text-ink-faint">
            {question.number ?? index + 1}.
          </span>
          {question.statement}
        </p>
        {sourceBadge}
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {question.options.map((option) => {
          const isCorrect = question.correct === option.label;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onPick(option.label)}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                isCorrect
                  ? "border-ok/50 bg-ok/10 text-ink"
                  : "border-line bg-canvas-soft/60 text-ink-muted hover:border-line hover:text-ink"
              }`}
            >
              <span
                className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded text-[10px] font-bold ${
                  isCorrect ? "bg-ok text-canvas" : "bg-white/10 text-ink-faint"
                }`}
              >
                {isCorrect ? <Check className="size-3" /> : option.label}
              </span>
              <span className="leading-snug">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
