"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  FileText,
} from "lucide-react";
import type { Question, QuestionLevel, QuizSettings } from "@/lib/types";
import { LEVEL_LABELS, QUESTION_LEVELS } from "@/lib/types";
import { countLabel, verbFor } from "@/lib/plural";
import type { PdfDiagnostics } from "@/lib/pdf/diagnostics";
import { Stat, Toggle } from "./ui";

type Props = {
  title: string;
  onTitleChange: (value: string) => void;
  questions: Question[];
  sourceFile: string;
  aiNotNeeded: boolean;
  aiMessage: string | null;
  diagnostics: PdfDiagnostics | null;
  onStart: (settings: QuizSettings, questions: Question[]) => void;
  /** Logo + acoes, renderizadas no fluxo da pagina (sem cabecalho fixo). */
  topBar?: ReactNode;
};

export function SetupPanel({
  topBar,
  title,
  onTitleChange,
  questions,
  sourceFile,
  aiNotNeeded,
  aiMessage,
  diagnostics,
  onStart,
}: Props) {
  const [settings, setSettings] = useState<QuizSettings>({
    shuffleQuestions: true,
    shuffleOptions: false,
    instantFeedback: true,
    timerMinutes: null,
    order: "facil-first",
    groupMode: "mixed",
  });
  const [topic, setTopic] = useState<string>("todas");
  const [levels, setLevels] = useState<QuestionLevel[]>([]);

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

  const handleStart = () => {
    onStart(settings, filtered);
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-4 pt-1 sm:px-6">
      {/* A marca faz parte do conteudo, sem barra fixa */}
      {topBar ? <div className="mb-2">{topBar}</div> : null}

      <div className="mx-auto w-full max-w-5xl">
        <div className="grid gap-2 lg:grid-cols-2">
          {/* 1. Quase la */}
          <div className="panel p-3">
            <h2 className="text-base font-semibold">Quase lá</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Confira o que foi extraído e escolha como quer responder.
            </p>

            <label className="mt-2 block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
                Título do quiz
              </span>
              <input
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder="Ex.: Direito Constitucional — Revisão"
                className="w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-sm outline-none transition placeholder:text-ink-faint focus:border-brand"
              />
            </label>

            <div className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
              <FileText className="size-3.5" />
              <span className="truncate">{sourceFile}</span>
            </div>
          </div>

          {/* 2. Quantidades */}
          <div className="panel p-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Questões" value={stats.total} />
              <Stat label="Do PDF" value={stats.fromGabarito} tone="brand" />
              <Stat
                label="Pela IA"
                value={stats.fromAI}
                tone={stats.fromAI > 0 ? "brand" : "default"}
              />
            </div>

            {diagnostics && diagnostics.warnings.length > 0 ? (
              <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-warn">
                  <CircleAlert className="size-4" />
                  O PDF tem {diagnostics.warnings.length}{" "}
                  {diagnostics.warnings.length === 1 ? "problema" : "problemas"}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-warn/90">
                  {diagnostics.warnings.map((warning) => (
                    <li key={warning.id} className="flex gap-2">
                      <span aria-hidden>•</span>
                      <span>{warning.text}</span>
                    </li>
                  ))}
                </ul>
                {diagnostics.missingQuestions.length > 0 ? (
                  <p className="mt-2 text-xs text-warn/80">
                    Se você corrigir o PDF e subir de novo, o app refaz a leitura
                    automaticamente.
                  </p>
                ) : null}
              </div>
            ) : null}

            {aiMessage ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-sm text-ok">
                <Check className="mt-0.5 size-4 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA
                  não precisou ser chamada.
                </span>
              </div>
            ) : null}

            {stats.without > 0 ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {countLabel(stats.without, "questão", "questões")}{" "}
                  {verbFor(stats.without, "ficou", "ficaram")} sem resposta: o
                  PDF não trazia o gabarito e a IA não soube responder. Elas
                  aparecem no quiz sem correção.
                </span>
              </div>
            ) : null}
          </div>

          {/* 3. Modo de resposta */}
          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Modo de resposta</h3>
            <div className="mt-2.5 space-y-2">
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

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                Agrupar por
              </span>
              <select
                value={settings.groupMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    groupMode: event.target.value as QuizSettings["groupMode"],
                  }))
                }
                className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              >
                <option value="mixed">Misturar tudo</option>
                <option value="by-pdf">Separar por PDF (cada PDF vira um tópico)</option>
              </select>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                Misturar mistura todas as questões. Separar cria um tópico para cada PDF
                com o nome do arquivo.
              </p>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                Dificuldade das questões
              </span>
              <select
                value={settings.order}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    order: event.target.value as QuizSettings["order"],
                  }))
                }
                className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              >
                <option value="facil-first">Do mais fácil ao mais difícil</option>
                <option value="dificil-first">Do mais difícil ao mais fácil</option>
              </select>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                As questões sem nível ficam no fim.
              </p>
            </label>
          </div>

          {/* 4. Tempo, assunto e nivel */}
          <div className="panel p-4">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                Tempo limite
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={600}
                  inputMode="numeric"
                  value={settings.timerMinutes ?? ""}
                  placeholder="Sem limite"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === "") {
                      setSettings((current) => ({
                        ...current,
                        timerMinutes: null,
                      }));
                      return;
                    }
                    const value = Number(raw);
                    setSettings((current) => ({
                      ...current,
                      timerMinutes:
                        Number.isFinite(value) && value > 0 ? Math.round(value) : null,
                    }));
                  }}
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
                <span className="shrink-0 text-xs text-ink-faint">min</span>
              </div>
            </label>

            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { label: "Sem limite", value: null },
                { label: "5", value: 5 },
                { label: "10", value: 10 },
                { label: "20", value: 20 },
                { label: "30", value: 30 },
                { label: "60", value: 60 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      timerMinutes: preset.value,
                    }))
                  }
                  className={`chip ${settings.timerMinutes === preset.value ? "" : "opacity-60"}`}
                  data-active={settings.timerMinutes === preset.value}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {topics.length > 0 ? (
              <label className="mt-3 block">
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
              <div className="mt-3">
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

          {/* 5. Iniciar quiz: ocupa as duas colunas */}
          <div className="lg:col-span-2">
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
                {countLabel(filtered.length, "questão selecionada", "questões selecionadas")}.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
