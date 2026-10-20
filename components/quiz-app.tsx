"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  FileText,
  Gauge,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { processPdf, type Stage as ProcessStage } from "@/lib/client/pipeline";
import { buildQuiz, createState } from "@/lib/quiz";
import {
  deleteQuiz as removeQuizFrom,
  getQuiz,
  getState,
  listQuizzes,
  listStates,
  putQuiz,
  putState,
  type SyncTarget,
} from "@/lib/sync";
import { useAuth } from "@/lib/supabase/use-auth";
import { SAMPLE_QUESTIONS } from "@/lib/sample";
import { countLabel } from "@/lib/plural";
import type { PdfDiagnostics } from "@/lib/pdf/diagnostics";
import type { Question, Quiz, QuizSettings, QuizState, QuizSummary } from "@/lib/types";
import { AuthButton } from "./auth-button";
import { InstallPrompt } from "./install-prompt";
import { Logo, ProgressBar } from "./ui";
import { UploadZone } from "./upload-zone";
import { SetupPanel } from "./setup-panel";
import { QuizPlayer } from "./quiz-player";
import { ResultsPanel } from "./results-panel";

type Stage = "upload" | "processing" | "setup" | "quiz" | "results";

export function QuizApp() {
  const [stage, setStage] = useState<Stage>("upload");
  const [processStage, setProcessStage] = useState<ProcessStage>({
    label: "",
    progress: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [title, setTitle] = useState("");
  const [sourceFile, setSourceFile] = useState("");
  const [detectedGabarito, setDetectedGabarito] = useState<Record<string, string>>({});
  const [aiApplied, setAiApplied] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiNotNeeded, setAiNotNeeded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PdfDiagnostics | null>(null);

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [quizState, setQuizState] = useState<QuizState>(() => createState());
  const [recent, setRecent] = useState<QuizSummary[]>([]);
  const [savedStates, setSavedStates] = useState<Record<string, QuizState>>({});

  const auth = useAuth();
  // Logado = tudo vai para a nuvem e aparece em qualquer aparelho.
  const target: SyncTarget = auth.user ? "cloud" : "local";

  /* --------------------------- lista de salvos -------------------------- */
  const refreshList = useCallback(async () => {
    const items = await listQuizzes(target);
    const states = await listStates(
      target,
      items.map((item) => item.id),
    );
    setRecent(items);
    setSavedStates(states);
  }, [target]);

  useEffect(() => {
    // Carregado apos o mount para nao divergir entre servidor e cliente.
    const timeout = window.setTimeout(() => void refreshList(), 0);
    return () => window.clearTimeout(timeout);
  }, [refreshList]);

  /* ----------------------------- processar ---------------------------- */
  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setStage("processing");
    setProcessStage({ label: "Preparando…", progress: 0.02 });

    try {
      const outcome = await processPdf(file, setProcessStage);

      if (outcome.questions.length === 0) {
        setError(
          outcome.aiMessage ??
            "Não foi possível identificar questões neste PDF. Verifique se ele tem texto selecionável.",
        );
        setStage("upload");
        return;
      }

      setQuestions(outcome.questions);
      setDetectedGabarito(outcome.detectedGabarito);
      setAiApplied(outcome.aiApplied);
      setAiMessage(outcome.aiMessage);
      setAiNotNeeded(outcome.aiNotNeeded);
      setDiagnostics(outcome.diagnostics);
      setSourceFile(file.name);
      setTitle(file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "));
      setStage("setup");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível ler o PDF.",
      );
      setStage("upload");
    }
  }, []);

  const handleSample = useCallback(() => {
    setError(null);
    setQuestions(SAMPLE_QUESTIONS);
    setDetectedGabarito(
      Object.fromEntries(SAMPLE_QUESTIONS.map((q) => [String(q.number), q.correct ?? ""])),
    );
    setAiApplied(false);
    setAiMessage(null);
    setAiNotNeeded(false);
    setSourceFile("quiz-de-exemplo.pdf");
    setTitle("Quiz de exemplo — 10 questões");
    setStage("setup");
  }, []);

  /* ------------------------------ iniciar ----------------------------- */
  const handleStart = useCallback(
    (settings: QuizSettings, selected: Question[]) => {
      const built = buildQuiz(
        selected,
        settings,
        title,
        sourceFile,
        detectedGabarito,
      );
      const initial = { ...createState(), startedAt: new Date().toISOString() };

      void putQuiz(target, built);
      void putState(target, built, initial);
      void refreshList();

      setQuiz(built);
      setQuizState(initial);
      setStage("quiz");
    },
    [title, sourceFile, detectedGabarito, target, refreshList],
  );

  const handleFinish = useCallback(() => {
    setQuizState((current) => {
      const next = { ...current, finishedAt: new Date().toISOString() };
      // Grava na hora: o save com debounce seria cancelado pela troca de tela.
      if (quiz) void putState(target, quiz, next);
      return next;
    });
    setStage("results");
  }, [quiz, target]);

  const handleRetry = useCallback(() => {
    const next = { ...createState(), startedAt: new Date().toISOString() };
    if (quiz) void putState(target, quiz, next);
    setQuizState(next);
    setStage("quiz");
  }, [quiz, target]);

  const handleNewFile = useCallback(() => {
    // Antes de sair, garante que o progresso atual ficou salvo.
    if (quiz) void putState(target, quiz, quizState);
    setStage("upload");
    setError(null);
    setQuiz(null);
    setQuestions([]);
  }, [quiz, quizState, target]);

  /**
   * Retoma um quiz salvo. Se ele ja foi finalizado, volta para a tela de
   * resultado; se estava em andamento, volta na mesma questao com as
   * respostas ja dadas.
   */
  const handleResume = useCallback(
    async (saved: QuizSummary) => {
      const full = await getQuiz(target, saved.id);
      if (!full) {
        await refreshList();
        return;
      }

      const savedState = await getState(target, saved.id);
      setQuiz(full);

      if (savedState?.finishedAt) {
        setQuizState(savedState);
        setStage("results");
        return;
      }

      if (savedState && Object.keys(savedState.answers).length > 0) {
        setQuizState(savedState);
        setStage("quiz");
        return;
      }

      setQuizState({ ...createState(), startedAt: new Date().toISOString() });
      setStage("quiz");
    },
    [target, refreshList],
  );

  /** Zera o progresso de um quiz salvo e recomeca do zero. */
  const handleRestart = useCallback(
    async (saved: QuizSummary) => {
      const full = await getQuiz(target, saved.id);
      if (!full) return;
      const next = { ...createState(), startedAt: new Date().toISOString() };
      void putState(target, full, next);
      setQuiz(full);
      setQuizState(next);
      setStage("quiz");
    },
    [target],
  );

  const handleDeleteRecent = useCallback(
    async (id: string) => {
      await removeQuizFrom(target, id);
      await refreshList();
    },
    [target, refreshList],
  );

  /* ------------------------- persistir estado -------------------------- */
  // A assinatura ignora o cronometro: assim o estado e gravado quando
  // muda algo relevante (respostas, posicao, marcadores, fim) e nao a
  // cada segundo do relogio.
  const stateSignature = `${quizState.currentIndex}:${Object.keys(quizState.answers).length}:${quizState.flagged.length}:${quizState.finishedAt ?? ""}`;
  const stateRef = useRef(quizState);

  useEffect(() => {
    stateRef.current = quizState;
  }, [quizState]);

  useEffect(() => {
    if (!quiz) return;
    const timeout = window.setTimeout(() => {
      void putState(target, quiz, stateRef.current);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [quiz, target, stateSignature]);

  const header = (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {stage !== "upload" && stage !== "processing" ? (
            <button
              type="button"
              onClick={handleNewFile}
              className="btn btn-ghost"
            >
              <FileText className="size-4" />
              <span className="hidden sm:inline">Novo PDF</span>
            </button>
          ) : null}
          <AuthButton auth={auth} compact />
        </div>
      </div>
    </header>
  );

  return (
    <div className="flex min-h-full flex-col">
      {header}

      {stage === "upload" ? (
        <UploadScreen
          error={error}
          recent={recent}
          savedStates={savedStates}
          auth={auth}
          onFile={handleFile}
          onSample={handleSample}
          onResume={handleResume}
          onRestart={handleRestart}
          onDelete={handleDeleteRecent}
        />
      ) : null}

      {stage === "processing" ? (
        <ProcessingScreen stage={processStage} />
      ) : null}

      {stage === "setup" ? (
        <SetupPanel
          title={title}
          onTitleChange={setTitle}
          questions={questions}
          onQuestionsChange={setQuestions}
          sourceFile={sourceFile}
          detectedGabarito={detectedGabarito}
          aiApplied={aiApplied}
          aiNotNeeded={aiNotNeeded}
          aiMessage={aiMessage}
          diagnostics={diagnostics}
          onStart={handleStart}
          onBack={handleNewFile}
        />
      ) : null}

      {stage === "quiz" && quiz ? (
        <QuizPlayer
          quiz={quiz}
          state={quizState}
          onStateChange={setQuizState}
          onFinish={handleFinish}
        />
      ) : null}

      {stage === "results" && quiz ? (
        <ResultsPanel
          quiz={quiz}
          state={quizState}
          onRetry={handleRetry}
          onNewFile={handleNewFile}
        />
      ) : null}

      <InstallPrompt />

      <footer className="mt-auto border-t border-line/60 py-8 text-center text-xs text-ink-faint">
        ApoQuiz · PDF → quiz interativo com gabarito
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function UploadScreen({
  error,
  recent,
  savedStates,
  auth,
  onFile,
  onSample,
  onResume,
  onRestart,
  onDelete,
}: {
  error: string | null;
  recent: QuizSummary[];
  savedStates: Record<string, QuizState>;
  auth: ReturnType<typeof useAuth>;
  onFile: (file: File) => void;
  onSample: () => void;
  onResume: (quiz: QuizSummary) => void;
  onRestart: (quiz: QuizSummary) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
      <div className="mx-auto max-w-3xl text-center">
        <span className="chip mx-auto border-brand/40 bg-brand/10 text-brand-soft">
          <Sparkles className="size-3.5" />
          Do PDF ao quiz em segundos
        </span>
        <h1 className="mt-5 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
          Sua apostila de questões
          <br />
          <span className="font-display italic text-brand-soft">virou quiz</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted">
          Suba o PDF da apostila. O site identifica as questões, as alternativas e o
          gabarito — e monta um quiz interativo com correção e explicações.
        </p>
      </div>

      <div className="mx-auto mt-9 max-w-3xl">
        {error ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-bad/35 bg-bad/10 p-3.5 text-sm text-bad">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <UploadZone onFile={onFile} busy={false} onSample={onSample} />
      </div>

      {recent.length > 0 ? (
        <section className="mx-auto mt-10 max-w-3xl">
          <h2 className="text-sm font-semibold text-ink-muted">
            Quizzes salvos
          </h2>
          <p className="mt-1 text-xs text-ink-faint">
            {auth.user
              ? "Sincronizados com a sua conta — aparecem em qualquer aparelho."
              : "Guardados neste dispositivo. Clique para continuar de onde parou."}
          </p>
          {auth.configured && !auth.user ? (
            <p className="mt-2 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-xs text-brand-soft">
              Entre com o Google para guardar seus quizzes na nuvem e continuar de
              onde parou em qualquer aparelho.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {recent.map((item) => {
              const state = savedStates[item.id];
              const answered = state ? Object.keys(state.answers).length : 0;
              const finished = Boolean(state?.finishedAt);
              const started = answered > 0;

              return (
                <div
                  key={item.id}
                  className="panel-soft flex flex-col gap-2.5 p-3.5"
                >
                  <button
                    type="button"
                    onClick={() => onResume(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {countLabel(item.stats.total, "questão", "questões")} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                    {started ? (
                      <p className="mt-1 text-xs">
                        {finished ? (
                          <span className="text-ok">
                            Finalizado · {answered}/{item.stats.total}{" "}
                            {answered === 1 ? "respondida" : "respondidas"}
                          </span>
                        ) : (
                          <span className="text-brand-soft">
                            Em andamento · {answered}/{item.stats.total}{" "}
                            {answered === 1 ? "respondida" : "respondidas"}
                          </span>
                        )}
                      </p>
                    ) : null}
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onResume(item)}
                      className="btn btn-primary min-h-9 px-3 py-2 text-xs"
                    >
                      {finished
                        ? "Ver resultado"
                        : started
                          ? "Continuar"
                          : "Começar"}
                    </button>
                    {started ? (
                      <button
                        type="button"
                        onClick={() => onRestart(item)}
                        className="btn btn-ghost min-h-9 px-3 py-2 text-xs"
                      >
                        <RotateCcw className="size-3" />
                        Refazer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="btn btn-ghost min-h-9 px-3 py-2 text-xs"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mx-auto mt-16 max-w-5xl">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-ink-faint">
          Como funciona
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "1. Envie o PDF",
              text: "O arquivo é lido direto no seu navegador. Nada é enviado para servidores.",
            },
            {
              icon: Target,
              title: "2. Ache o gabarito",
              text: "O site localiza as questões, as alternativas e o gabarito — e a IA resolve o que faltar.",
            },
            {
              icon: ListChecks,
              title: "3. Resolva e revise",
              text: "Quiz com correção instantânea, explicação por questão e gabarito para imprimir.",
            },
          ].map((item) => (
            <div key={item.title} className="panel p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-brand/12 text-brand-soft">
                <item.icon className="size-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-6 grid max-w-5xl gap-4 sm:grid-cols-3">
        <Feature
          icon={Gauge}
          title="Progresso e desempenho"
          text="Acompanhe o placar, o tempo e o resultado por assunto."
        />
        <Feature
          icon={Sparkles}
          title="Explicações da IA"
          text="Cada alternativa ganha uma justificativa curta de por que está certa."
        />
        <Feature
          icon={ListChecks}
          title="Gabarito imprimível"
          text="Exporte o resultado em PDF pelo navegador ou em JSON."
        />
      </section>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Gauge;
  title: string;
  text: string;
}) {
  return (
    <div className="panel flex gap-3.5 p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-faint" />
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{text}</p>
      </div>
    </div>
  );
}

function ProcessingScreen({ stage }: { stage: ProcessStage }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-20">
      <div className="panel p-6 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/12 text-brand-soft">
          <Loader2 className="size-6 animate-spin" />
        </span>
        <h1 className="mt-4 text-lg font-semibold">Lendo sua apostila</h1>
        <p className="mt-1.5 min-h-5 text-sm text-ink-muted">{stage.label}</p>
        <ProgressBar value={stage.progress} className="mt-5" />
        <p className="mt-3 text-xs text-ink-faint">
          Questões com muitas páginas podem levar alguns segundos.
        </p>
      </div>
    </main>
  );
}
