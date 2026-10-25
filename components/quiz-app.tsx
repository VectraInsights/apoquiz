"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CircleAlert,
  FileText,
  Gauge,
  ListChecks,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { processPdfs, type Stage as ProcessStage } from "@/lib/client/pipeline";
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
import { BrandBar } from "./brand-bar";
import { InstallPrompt } from "./install-prompt";
import { ProgressBar } from "./ui";
import { UploadZone } from "./upload-zone";
import { SetupPanel } from "./setup-panel";
import { QuizPlayer } from "./quiz-player";
import { ResultsPanel } from "./results-panel";

type Stage = "upload" | "processing" | "setup" | "quiz" | "results";

/** Nome do arquivo limpo, sem extensao nem tracos. */
function nomeDeArquivo(file: File): string {
  return file.name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Titulo quando vem mais de um PDF: os proprios arquivos sao os temas,
 * entao eles viram o titulo ("A BUROCRACIA E O ESTADO + GESTAO LOCAL").
 * Sem numeros de apostila nem de questao - o titulo fala do conteudo.
 */
function tituloPorTema(files: File[]): string {
  const temas = files.map(nomeDeArquivo).filter(Boolean);
  if (temas.length === 0) return "Revisão";

  const junta = temas.join(" + ");
  return junta.length > 64 ? `${junta.slice(0, 61).trimEnd()}…` : junta;
}

/**
 * @param view "home" (padrao) mostra o heroi, a caixa de upload e os 9
 *   quizzes mais recentes. "library" e a pagina /quizzes: so a lista
 *   completa, sem heroi e sem as secoes de roda pe.
 */
export function QuizApp({ view = "home" }: { view?: "home" | "library" }) {
  const library = view === "library";
  const router = useRouter();
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
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiNotNeeded, setAiNotNeeded] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PdfDiagnostics | null>(null);

  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

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
  const handleFiles = useCallback(async (files: File[]) => {
    setError(null);
    setStage("processing");
    setProcessStage({ label: "Preparando…", progress: 0.02 });

    try {
      const outcome = await processPdfs(files, setProcessStage);

      if (outcome.questions.length === 0) {
        setError(
          outcome.aiMessage ??
            "Não foi possível identificar questões neste PDF. Verifique se ele tem texto selecionável.",
        );
        setStage("upload");
        return;
      }

      setUploadedFiles(files);
      setQuestions(outcome.questions);
      setDetectedGabarito(outcome.detectedGabarito);
      setAiMessage(outcome.aiMessage);
      setAiNotNeeded(outcome.aiNotNeeded);
      setDiagnostics(outcome.diagnostics);

      if (files.length === 1) {
        setSourceFile(files[0].name);
        setTitle(nomeDeArquivo(files[0]));
      } else {
        setSourceFile(`${files.length} apostilas`);
        setTitle(tituloPorTema(files));
      }
      setStage("setup");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Não foi possível ler o PDF.";
      // Se houver vários arquivos, tenta identificar qual causou o erro
      if (files.length > 1) {
        // O erro já vem com o nome do arquivo (formato: 'Erro no arquivo "nome.pdf": ...')
        const match = message.match(/Erro no arquivo "([^"]+)"/);
        const nomeArquivo = match ? match[1] : "um dos arquivos";
        setError(`Erro no arquivo "${nomeArquivo}": ${message.replace(/^Erro no arquivo "[^"]+": /, "")}`);
      } else {
        setError(message);
      }
      setStage("upload");
    }
  }, []);

  const handleSample = useCallback(() => {
    setError(null);
    setQuestions(SAMPLE_QUESTIONS);
    setDetectedGabarito(
      Object.fromEntries(SAMPLE_QUESTIONS.map((q) => [String(q.number), q.correct ?? ""])),
    );
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
        uploadedFiles.map((f) => f.name),
      );
      const initial = { ...createState(), startedAt: new Date().toISOString() };

      // Grava e so depois relê. O putQuiz em nuvem vai e volta de rede
      // (getUser + upsert); se o refreshList disparar junto, o SELECT
      // chega antes do UPSERT e a lista volta sem este quiz - so o F5
      // mostrava, porque ai o UPSERT ja tinha terminado.
      void putQuiz(target, built)
        .then(() => putState(target, built, initial))
        .then(() => refreshList());

      setQuiz(built);
      setQuizState(initial);
      setStage("quiz");
    },
    [title, sourceFile, detectedGabarito, target, refreshList, uploadedFiles],
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
    // Relê a lista ao voltar para a tela inicial: a que esta em memoria
    // pode estar atrasada em relacao ao que ja foi gravado. Se havia um
    // quiz aberto, espera a gravacao do progresso terminar antes de reler,
    // senao o SELECT volta antes do PUT e a tela mostra o estado antigo.
    void (async () => {
      if (quiz) await putState(target, quiz, quizState);
      await refreshList();
    })();

    setStage("upload");
    setError(null);
    setQuiz(null);
    setQuestions([]);

    // Na pagina /quizzes a caixa de importacao nao existe: ela fica na
    // home, entao "novo quiz" volta para la.
    if (library) router.push("/");
  }, [quiz, quizState, target, refreshList, library, router]);

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

  // A marca (logo + acoes) nao e um cabecalho fixo: ela e renderizada
  // dentro do conteudo de cada tela, como parte da pagina.
  const topBar = (
    <BrandBar
      onLogoClick={handleNewFile}
      actions={
        <>
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
          <InstallPrompt />
          <AuthButton
            auth={auth}
            compact
            onMyQuizzes={handleNewFile}
          />
        </>
      }
    />
  );

  return (
    <div className="flex min-h-full flex-col">
      {stage === "upload" ? (
        <UploadScreen
          topBar={topBar}
          error={error}
          recent={recent}
          savedStates={savedStates}
          auth={auth}
          library={library}
          onFiles={handleFiles}
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
          topBar={topBar}
          title={title}
          onTitleChange={setTitle}
          questions={questions}
          sourceFile={sourceFile}
          aiNotNeeded={aiNotNeeded}
          aiMessage={aiMessage}
          diagnostics={diagnostics}
          onStart={handleStart}
        />
      ) : null}

      {stage === "quiz" && quiz ? (
        <QuizPlayer
          topBar={topBar}
          quiz={quiz}
          state={quizState}
          onStateChange={setQuizState}
          onFinish={handleFinish}
        />
      ) : null}

      {stage === "results" && quiz ? (
        <ResultsPanel
          topBar={topBar}
          quiz={quiz}
          state={quizState}
          onRetry={handleRetry}
          onNewFile={handleNewFile}
        />
      ) : null}

    </div>
  );
}

/* ------------------------------------------------------------------ */

function UploadScreen({
  error,
  recent,
  savedStates,
  auth,
  topBar,
  library = false,
  onFiles,
  onSample,
  onResume,
  onRestart,
  onDelete,
}: {
  error: string | null;
  recent: QuizSummary[];
  savedStates: Record<string, QuizState>;
  auth: ReturnType<typeof useAuth>;
  topBar: ReactNode;
  onFiles: (files: File[]) => void;
  onSample: () => void;
  onResume: (quiz: QuizSummary) => void;
  onRestart: (quiz: QuizSummary) => void;
  onDelete: (id: string) => void;
  /** true na pagina /quizzes: mostra todos os quizzes, sem heroi. */
  library?: boolean;
}) {
  // Na biblioteca entram TODOS; na home ficam so os 9 mais recentes e o
  // botao "Ver todos" leva para /quizzes em vez de expandir aqui.
  const visible = library ? recent : recent.slice(0, 9);

  return (
    <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* A marca faz parte do conteudo da pagina, sem barra fixa */}
      <div className="mb-8">{topBar}</div>

      {/* Cabecalho proprio da pagina /quizzes */}
      {library ? (
        <header className="mb-8">
          <Link
            href="/"
            className="text-xs text-brand-soft transition hover:underline"
          >
            ← Voltar para a página inicial
          </Link>
          <h1 className="font-round mt-3 text-3xl font-bold tracking-tight">
            Todos os seus quizzes
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {recent.length > 0
              ? countLabel(recent.length, "quiz salvo", "quizzes salvos")
              : "Você ainda não tem nenhum quiz salvo."}
          </p>
        </header>
      ) : null}

      {/* Duas colunas no desktop: heroi + upload a esquerda e os quizzes a
          direita. Antes tudo ficava empilhado num bloco de 1024px e o botao
          de importar PDF so aparecia la embaixo, quando havia quiz salvo.
          Em tela estreita continua empilhado, na mesma ordem de sempre.
          A coluna da direita e a mais larga das duas: e ela que carrega os
          nomes dos quizzes, e o heroi ja tem largura de sobra.
          Sem items-start as duas colunas tem a MESMA altura - e e isso que
          permite alinhar a base da ultima fileira de cards com a base da
          caixa de importacao (ver justify-end e content-end abaixo).
          Na biblioteca nao ha duas colunas: a lista ocupa a largura toda. */}
      <div
        className={
          !library && recent.length > 0
            ? "lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-10"
            : undefined
        }
      >
      {/* Os quizzes recentes ficam no topo, para continuar de onde parou */}
      {library || recent.length > 0 ? (
        <section
          className={
            library
              ? "mb-12 flex flex-col"
              : "mb-12 flex flex-col lg:order-2 lg:mb-0"
          }
        >
          {/* flex-col + content-end: a grade ocupa toda a altura da coluna
              e empurra as cards para baixo, de modo que a base da ultima
              fileira caia exatamente na base da caixa de importacao. O
              espaco que sobra aparece entre o titulo e as cards (nao alem
              delas), entao as duas colunas terminam juntas. */}
          {!library ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink-muted">
                Continuar de onde parou
              </h2>
              {recent.length > 9 ? (
                <Link
                  href="/quizzes"
                  className="text-xs text-brand-soft transition hover:underline"
                >
                  Ver todos os {recent.length}
                </Link>
              ) : null}
            </div>
          ) : null}

          {auth.configured && !auth.user ? (
            <p className="mt-2 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-xs text-brand-soft">
              Entre com o Google para guardar seus quizzes na nuvem e continuar
              de onde parou em qualquer aparelho.
            </p>
          ) : null}

          {library && recent.length === 0 ? (
            <div className="panel mt-3 p-6 text-center text-sm text-ink-muted">
              Nenhum quiz salvo ainda.{" "}
              <Link
                href="/"
                className="text-brand-soft transition hover:underline"
              >
                Envie um PDF
              </Link>
            </div>
          ) : null}

          {/* Na biblioteca cabem mais colunas: nao ha heroi disputando
              largura ao lado. */}
          <div
            className={`mt-3 grid flex-1 content-end gap-3 sm:grid-cols-2 ${
              library ? "lg:grid-cols-3 xl:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {visible.map((item) => {
              const state = savedStates[item.id];
              const answered = state ? Object.keys(state.answers).length : 0;
              const finished = Boolean(state?.finishedAt);
              const started = answered > 0;

              return (
                <div
                  key={item.id}
                  className="panel-soft flex flex-col gap-2.5 p-3"
                >
                  <button
                    type="button"
                    onClick={() => onResume(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="line-clamp-2 text-sm font-medium leading-snug">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-ink-faint">
                      {countLabel(item.stats.total, "questão", "questões")} ·{" "}
                      {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {finished ? (
                        <span className="text-ok">
                          Finalizado · {answered}/{item.stats.total}{" "}
                          {answered === 1 ? "respondida" : "respondidas"}
                        </span>
                      ) : started ? (
                        <span className="text-brand-soft">
                          Em andamento · {answered}/{item.stats.total}{" "}
                          {answered === 1 ? "respondida" : "respondidas"}
                        </span>
                      ) : (
                        <span className="text-ink-faint">Não iniciado</span>
                      )}
                    </p>
                  </button>

                  {/* Uma unica fileira de acoes: o primario ocupa o que sobra
                      e as acoes secundarias viram icone de 32px. Com tres
                      botoes de texto lado a lado nao cabia em 148px, entao o
                      flex-wrap quebrava em 2-3 fileiras e cada fileira extra
                      somava ~42px de altura ao card. Era isso que empurrava a
                      ultima fileira para alem da caixa de importacao.
                      p-0 e obrigatorio aqui: o .btn traz padding 0.625/1.125
                      e, somado ao size-8, deixaria o conteudo com largura
                      negativa (o mesmo bug das setas). */}
                  <div className="mt-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onResume(item)}
                      className="btn btn-primary min-h-8 min-w-0 flex-1 px-1.5 py-1.5 text-xs"
                    >
                      {finished ? "Resultado" : started ? "Continuar" : "Começar"}
                    </button>
                    {started ? (
                      <button
                        type="button"
                        onClick={() => onRestart(item)}
                        title="Refazer do zero"
                        aria-label="Refazer do zero"
                        className="btn btn-ghost grid size-8 place-items-center p-0"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      title="Remover quiz"
                      aria-label="Remover quiz"
                      className="btn btn-ghost grid size-8 place-items-center p-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Heroi + upload ocupam a coluna da esquerda (o span de 2 colunas
          so existia quando o grid tinha 3 trilhos). flex-col e o que
          permite a caixa de importacao esticar ate a base da coluna.
          Fora da home (pagina /quizzes) nao ha heroi nem caixa. */}
      {!library ? (
        <div className="lg:flex lg:flex-col lg:order-1">
      <div className="mx-auto w-full text-center">
        <span className="chip mx-auto border-brand/40 bg-brand/10 text-brand-soft">
          <Sparkles className="size-3.5" />
          Do PDF ao quiz em segundos
        </span>
        <h1 className="font-round mt-5 text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl">
          Sua apostila de questões
          <br />
          <span className="font-display italic text-brand-soft">virou quiz</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-ink-muted">
          Suba o PDF da apostila. O site identifica as questões, as alternativas e o
          gabarito — e monta um quiz interativo com correção e explicações.
        </p>
      </div>

      {/* flex-1 + justify-end: a caixa ocupa o resto da coluna e fica
          ancorada na base, de modo que a borda inferior dela coincida com
          a base da ultima fileira de cards. mt-9 continua valendo quando
          nao ha espaco a distribuir, entao o respiro de sempre se mantem. */}
      <div className="mx-auto mt-9 flex w-full max-w-4xl flex-col justify-end lg:flex-1">
        {error ? (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-bad/35 bg-bad/10 p-3.5 text-sm text-bad">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <UploadZone onFiles={onFiles} busy={false} onSample={onSample} />
      </div>
        </div>
      ) : null}
      </div>

      {/* Secoes de roda pe: so fazem sentido na home */}
      {!library ? (
        <>
      <section className="mx-auto mt-16">
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

      <section className="mx-auto mt-6 grid gap-4 sm:grid-cols-3">
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
        </>
      ) : null}
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
