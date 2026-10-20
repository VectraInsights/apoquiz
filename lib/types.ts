export type Option = {
  /** Letra normalizada: A, B, C, D ou E */
  label: string;
  /** Texto da alternativa */
  text: string;
};

export type AnswerSource = "gabarito" | "ia" | "manual" | "desconhecida";

/**
 * Limite de questoes enviadas para a IA em um unico processamento.
 * Acima disso a apostila segue completa - apenas sem as explicacoes da IA
 * nas questoes restantes (o gabarito do PDF vale para todas).
 */
export const MAX_AI_QUESTIONS = 150;

export type Question = {
  id: string;
  /** Numero original da questao na apostila (pode ser null) */
  number: number | null;
  /** Enunciado */
  statement: string;
  /** Alternativas (sempre >= 2 para ser valida) */
  options: Option[];
  /** Letra correta (A-E) ou null quando desconhecida */
  correct: string | null;
  /** Explicacao curta do gabarito */
  explanation: string | null;
  /**
   * Analise de cada alternativa, vinda do PDF (secao de comentarios) ou
   * gerada pela IA: { "A": "Incorreta. ...", "B": "..." }
   */
  optionNotes?: Record<string, string> | null;
  /** Topico / disciplina inferido */
  topic: string | null;
  /** De onde veio a resposta correta */
  answerSource: AnswerSource;
  /** Pagina do PDF de origem */
  page: number | null;
  /**
   * Capitulo/secao do PDF onde a questao foi encontrada (ex.: "1.1").
   * Usado para casar o gabarito quando o PDF traz gabarito por secao.
   */
  section?: string | null;
};

/**
 * Metadados de um quiz salvo. Vai na lista sem carregar as questoes
 * (uma apostila pode ter mais de mil questoes com explicacoes).
 */
export type QuizSummary = {
  id: string;
  title: string;
  sourceFile: string;
  createdAt: string;
  stats: {
    total: number;
    withAnswer: number;
    fromGabarito: number;
    fromAI: number;
    withoutAnswer: number;
  };
};

export type Quiz = {
  id: string;
  title: string;
  sourceFile: string;
  createdAt: string;
  questions: Question[];
  /** Configuracoes usadas para montar este quiz */
  settings: QuizSettings;
  /** Gabarito cru detectado no PDF: { "1": "B", ... } */
  detectedGabarito: Record<string, string>;
  stats: {
    total: number;
    withAnswer: number;
    fromGabarito: number;
    fromAI: number;
    withoutAnswer: number;
  };
};

export type QuizSettings = {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  instantFeedback: boolean;
  timerMinutes: number | null;
};

export type QuizState = {
  answers: Record<string, string>;
  flagged: string[];
  currentIndex: number;
  startedAt: string;
  finishedAt: string | null;
  elapsedSeconds: number;
};

export type ExtractRequest = {
  mode: "enrich" | "extract";
  /** Texto bruto do PDF (modo extract) */
  text?: string;
  /** Questoes ja parseadas (modo enrich) */
  questions?: Question[];
  /** Gabarito detectado no PDF: { "1": "B" } */
  gabarito?: Record<string, string> | null;
  /** Maximo de questoes a processar */
  limit?: number;
};

export type ExtractResponse = {
  questions: Question[];
  meta: {
    provider: string;
    model: string;
    processed: number;
    gabaritoHits: number;
    aiAnswers: number;
    truncated: boolean;
  };
};
