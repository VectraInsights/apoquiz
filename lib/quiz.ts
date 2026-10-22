import type {
  Question,
  QuestionLevel,
  Quiz,
  QuizSettings,
  QuizState,
} from "@/lib/types";

/** Ordem dos niveis de dificuldade (facil, medio, dificil). */
const LEVEL_RANK: Record<QuestionLevel, number> = {
  facil: 0,
  medio: 1,
  dificil: 2,
};

/**
 * Ordena as questoes por nivel de dificuldade. As questoes sem nivel
 * ficam no fim, em qualquer ordem.
 */
export function orderByLevel(
  questions: Question[],
  order: QuizSettings["order"],
): Question[] {
  if (order === "pdf") return questions;

  const rank = (question: Question) =>
    question.level ? LEVEL_RANK[question.level] : 0;

  return [...questions].sort((a, b) => {
    // As questoes sem nivel vao para o fim, qualquer que seja a ordem.
    const semNivel =
      (a.level ? 0 : 1) - (b.level ? 0 : 1);
    if (semNivel !== 0) return semNivel;

    const diff = rank(a) - rank(b);
    return order === "facil-first" ? diff : -diff;
  });
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function shuffleOptions(question: Question): Question {
  const options = shuffle(question.options);
  const correctText = question.correct
    ? question.options.find((option) => option.label === question.correct)?.text
    : undefined;

  const relabeled = options.map((option, index) => ({
    ...option,
    label: String.fromCharCode(65 + index),
  }));

  const newCorrect = correctText
    ? relabeled.find((option) => option.text === correctText)?.label ?? null
    : null;

  return { ...question, options: relabeled, correct: newCorrect };
}

export function buildQuiz(
  questions: Question[],
  settings: QuizSettings,
  title: string,
  sourceFile: string,
  detectedGabarito: Record<string, string>,
  fileNames?: string[],
): Quiz {
  const prepared = settings.shuffleOptions
    ? questions.map(shuffleOptions)
    : questions;

  // O embaralhamento vem primeiro; a ordenacao por nivel vem depois
  // (assim o nivel agrupa as questoes e, dentro de cada nivel, a ordem
  // continua embaralhada).
  const embaralhadas = settings.shuffleQuestions
    ? shuffle(prepared)
    : prepared;

  const ordered = orderByLevel(embaralhadas, settings.order);

  // Se o modo for "by-pdf", define o topico de cada questao como o nome
  // do PDF de origem (extraido do prefixo da secao: "0:1.2" -> fileNames[0]).
  const questoesAgrupadas = settings.groupMode === "by-pdf" && fileNames
    ? ordered.map((q) => {
        const prefixo = q.section?.split(":")[0];
        const idx = prefixo ? parseInt(prefixo, 10) : null;
        const nomePdf = idx !== null && idx < fileNames.length
          ? fileNames[idx]
          : "PDF desconhecido";
        return { ...q, topic: nomePdf.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ") };
      })
    : ordered;

  const withAnswer = questoesAgrupadas.filter((question) => question.correct).length;

  return {
    // UUID: o mesmo id vale para o localStorage e para as tabelas do
    // Supabase (a coluna "id" e uuid).
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `quiz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    title: title.trim() || "Apostila sem título",
    sourceFile,
    createdAt: new Date().toISOString(),
    questions: ordered,
    settings,
    detectedGabarito,
    stats: {
      total: ordered.length,
      withAnswer,
      fromGabarito: ordered.filter((q) => q.answerSource === "gabarito").length,
      fromAI: ordered.filter((q) => q.answerSource === "ia").length,
      withoutAnswer: ordered.filter((q) => !q.correct).length,
    },
  };
}

export function createState(): QuizState {
  return {
    answers: {},
    flagged: [],
    currentIndex: 0,
    // Preenchido no momento em que o quiz comeca (evita new Date() no render)
    startedAt: "",
    finishedAt: null,
    elapsedSeconds: 0,
  };
}

export function scoreQuiz(quiz: Quiz, state: QuizState) {
  let correct = 0;
  let errors = 0;
  let answered = 0;
  let pending = 0;

  for (const question of quiz.questions) {
    const answer = state.answers[question.id];
    if (answer) {
      answered += 1;
      // So conta acerto/erro quando existe gabarito para a questao.
      if (question.correct) {
        if (answer === question.correct) correct += 1;
        else errors += 1;
      }
    } else {
      pending += 1;
    }
  }

  const gradeable = quiz.questions.filter((question) => question.correct).length;
  const percentage = gradeable > 0 ? Math.round((correct / gradeable) * 100) : null;

  return {
    correct,
    errors,
    answered,
    pending,
    total: quiz.questions.length,
    gradeable,
    percentage,
  };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function topicsOf(quiz: Quiz): string[] {
  const topics = new Set<string>();
  for (const question of quiz.questions) {
    if (question.topic) topics.add(question.topic);
  }
  return [...topics].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
