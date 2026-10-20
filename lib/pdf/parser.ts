/**
 * Parser heuristico de apostilas: identifica questoes, alternativas e
 * o gabarito direto do texto extraido do PDF.
 *
 * O gabarito do PDF e a fonte primaria da resposta correta. A IA entra
 * depois, so para limpar o texto, explicar as respostas e - quando nao
 * existe gabarito - resolver as questoes.
 *
 * Sao suportados dois formatos de alternativa:
 *  1. explicitos  -> "a)", "(B)", "C.", "D -", "IV)"
 *  2. implícitos  -> "Apopulate o texto..." (letra + espaco + texto),
 *     comuns em apostilas editoriais. Nesse caso a indentacao (x) da
 *     linha distingue o inicio da alternativa da continuacao do texto.
 */

import type { Option } from "@/lib/types";
import type { ExtractedPage } from "./lines";

export type ParsedQuestion = {
  number: number | null;
  statement: string;
  options: Option[];
  topic: string | null;
  page: number;
  /** Resposta escrita inline no PDF (ex.: "Resposta: C") */
  inlineAnswer: string | null;
};

export type GabaritoResult = {
  /** { "1": "B", "2": "C" } */
  gabarito: Record<string, string>;
  /** Trecho do PDF de onde o gabarito foi lido */
  evidence: string;
  /** true quando o gabarito foi encontrado como "Resposta: X" inline */
  inline: boolean;
};

type FlatLine = {
  page: number;
  text: string;
  x: number;
  /** indice global da linha (0-based) */
  index: number;
};

/* ------------------------------------------------------------------ */
/* Padroes de reconhecimento                                           */
/* ------------------------------------------------------------------ */

// "Questao 12", "Q12", "Questao 12 - texto"
const QUESTION_WORD =
  /^\s*(?:quest[aã]o|q)\s*[-–—]?\s*(\d{1,3})\s*(?:[.:\)\-–—]\s*)?(.*)$/i;

// "12)", "12.", "12 -", "12:" seguido do enunciado.
// O ponto so e aceito quando NAO seguido de digito (evita "1.234").
const QUESTION_NUMBER =
  /^\s*(\d{1,3})\s*(?:[)\-–—:]|\.(?!\d))\s*(.*)$/;

// "1" sozinho numa linha (enunciado vem na linha seguinte)
const QUESTION_BARE_NUMBER = /^\s*(\d{1,3})\s*$/;

// "a)" / "(A)" / "b." / "C-" / "d:" / "A)"
const OPTION_LETTER =
  /^\s*(?:\(\s*([A-Ea-e])\s*\)|([A-Ea-e])\s*\)\s*|([A-Ea-e])\s*[.\-–—:]\s+)\s*(.*)$/;

// "I)" / "II." / "III -" (numeros romanos)
const OPTION_ROMAN =
  /^\s*(?:\(\s*(IV|V|III|II|I)\s*\)|(IV|V|III|II|I)\s*\)\s*|(IV|V|III|II|I)\s*[.\-–—:]\s+)\s*(.*)$/;

// "A Some texto" - alternativa implicita (letra + espaco)
const OPTION_BARE_LETTER = /^([A-E])\s+(\S.*)$/;

// "Gabarito", "Respostas", "Chave de respostas", ...
const GABARITO_HEADER =
  /^\s*(?:gabarito(?:s)?|resposta[s]?(?:\s+corrida[s]?)?|chave(?:\s+de)?(?:\s+resposta[s]?)?|quadro\s+de\s+resposta[s]?|gabarito\s+comentado|resposta[s]?\s+comentada[s]?)\b\s*[:\-–—]?\s*(.*)$/i;

// "1-B" / "2) C" / "3 - D" / "4: E"  (numero e letra juntos)
const GABARITO_PAIR_EXPLICIT =
  /(?<![\w.])(\d{1,3})\s*[-–—)\]:=]\s*([A-Ea-e])(?![A-Za-z0-9])/g;

// "1 B" / "02    C"  (numero e letra separados por espaco)
const GABARITO_PAIR_SPACED =
  /(?<![\w.])(\d{1,3})\s+([A-Ea-e])(?![A-Za-z0-9])/g;

// "Questao 12: C" / "Questao 12 - C"
const GABARITO_PAIR_QUESTION =
  /quest[aã]o\s*(\d{1,3})\s*[:.\)\-–—]?\s*\(?([A-Ea-e])\)?(?![A-Za-z0-9])/gi;

// "Resposta: C" / "Gabarito: alternativa C" / "R = C"
const GABARITO_INLINE =
  /(?:resposta|gabarito|chave)\s*(?:da\s+quest[aã]o\s*\d{1,3}\s*)?(?:comentad[ao]s?\s*)?[:=]?\s*(?:alternativa\s*)?\(?([A-Ea-e])\)?(?![A-Za-z0-9])/gi;

/* --------------------------- ruido comum ---------------------------- */

// Cabecalho corrente de pagina: "1. Conhecimentos Gerais ... Físicos, …"
const RUNNING_HEADER = /^\d+(?:\.\d+)*\.?\s+.{8,}…\s*$/;

// Marcador de dificuldade: "2 ○ ○ ○ FÁCIL", "12 FÁCIL", "43 ○ ○ ○ DIFÍCIL"
const DIFFICULTY_LINE =
  /^\s*\d{1,3}\s*(?:[○●◐◑◒◓◔⬤⭘·•*]+[\s]*)*(?:F[ÁA]CIL|M[ÉE]DIO|DIF[ÍI]CIL|AVAN[ÇC]ADO)\b\s*$/i;

// Chamadas de interface das apostilas editoriais
const UI_NOISE =
  /(tente resolver antes de conferir|ver gabarito e coment[áa]rios|voltar [àa] quest[ãa]o|pula direto para a resolu[çc][ãa]o|acesso ao gabarito)/i;

// "7 / 538", "página 12", "page 3"
const PAGE_NUMBER_LINE =
  /^\s*(?:p[áa]gina|page|f[óo]lder)?\s*\.?\s*\d{1,4}\s*(?:\/\s*\d{1,4})?\s*$/i;

const DECORATION_LINE = /^\s*[-–—_=~*•·.]+\s*$/;

// Linhas que so podem ser matematica/simbolos (nao sao enunciados)
const MATH_ONLY = /^[\d\s.,+\-*/^()=<>%°×xX:]+$/;

const ROMAN_TO_LETTER: Record<string, string> = {
  I: "A",
  II: "B",
  III: "C",
  IV: "D",
  V: "E",
};

/* ------------------------------------------------------------------ */
/* Utilitarios                                                          */
/* ------------------------------------------------------------------ */

export function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function joinParts(parts: string[]): string {
  return cleanText(parts.join(" "));
}

function flattenPages(pages: ExtractedPage[]): FlatLine[] {
  const lines: FlatLine[] = [];
  for (const page of pages) {
    for (const raw of page.lines) {
      const text = cleanText(raw.text);
      if (!text) continue;
      lines.push({ page: page.page, text, x: raw.x, index: lines.length });
    }
  }
  return lines;
}

function isNoise(text: string): boolean {
  return (
    PAGE_NUMBER_LINE.test(text) ||
    DECORATION_LINE.test(text) ||
    DIFFICULTY_LINE.test(text) ||
    UI_NOISE.test(text) ||
    RUNNING_HEADER.test(text)
  );
}

/**
 * Linha de topico: predominantemente em caixa alta e com tamanho de titulo.
 * Ex.: "ASPECTOS GEOGRÁFICOS, HISTÓRICOS, FÍSICOS, ECONÔMICOS, SOCI- …"
 */
function isTopicLine(text: string): boolean {
  if (OPTION_BARE_LETTER.test(text)) return false;
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 12) return false;
  const upper = letters.replace(/[^A-ZÀ-Ý]/g, "").length;
  return upper / letters.length > 0.85;
}

/**
 * Alguns PDFs usam espacamento entre letras (ex.: "E T I C A S"). Sem
 * posicao nao da para saber onde eram os espacos reais, entao o texto
 * segue como esta e a IA normaliza depois.
 */
function cleanTopic(text: string): string {
  return cleanText(text.replace(/\s*…\s*$/, "").replace(/\s*-\s*$/, "")).slice(0, 80);
}

function matchOption(text: string): { label: string; text: string } | null {
  const roman = text.match(OPTION_ROMAN);
  if (roman) {
    const raw = (roman[1] ?? roman[2] ?? roman[3] ?? "").toUpperCase();
    const label = ROMAN_TO_LETTER[raw];
    if (label) return { label, text: roman[4] ?? "" };
  }

  const letter = text.match(OPTION_LETTER);
  if (letter) {
    const label = (letter[1] ?? letter[2] ?? letter[3] ?? "").toUpperCase();
    if (label) return { label, text: letter[4] ?? "" };
  }

  return null;
}

type Header = { number: number; rest: string; kind: "word" | "number" | "bare" };

function matchQuestionHeader(text: string): Header | null {
  const word = text.match(QUESTION_WORD);
  if (word) {
    const number = Number(word[1]);
    if (Number.isFinite(number) && number > 0) {
      return { number, rest: (word[2] ?? "").trim(), kind: "word" };
    }
  }

  const num = text.match(QUESTION_NUMBER);
  if (num) {
    const number = Number(num[1]);
    const rest = (num[2] ?? "").trim();
    // "2 - 2" e matematica, nao um novo enunciado
    if (Number.isFinite(number) && number > 0 && !MATH_ONLY.test(rest)) {
      return { number, rest, kind: "number" };
    }
  }

  const bare = text.match(QUESTION_BARE_NUMBER);
  if (bare) {
    const number = Number(bare[1]);
    if (Number.isFinite(number) && number > 0) {
      return { number, rest: "", kind: "bare" };
    }
  }

  return null;
}

function looksLikeQuestionHeader(text: string): boolean {
  return matchQuestionHeader(text) !== null;
}

function hasGabaritoPair(text: string): boolean {
  GABARITO_PAIR_EXPLICIT.lastIndex = 0;
  GABARITO_PAIR_SPACED.lastIndex = 0;
  return GABARITO_PAIR_EXPLICIT.test(text) || GABARITO_PAIR_SPACED.test(text);
}

function countPairs(text: string): number {
  let count = 0;
  GABARITO_PAIR_EXPLICIT.lastIndex = 0;
  GABARITO_PAIR_SPACED.lastIndex = 0;
  while (GABARITO_PAIR_EXPLICIT.exec(text) !== null) count += 1;
  while (GABARITO_PAIR_SPACED.exec(text) !== null) count += 1;
  return count;
}

/* ------------------------------------------------------------------ */
/* Secao do gabarito                                                   */
/* ------------------------------------------------------------------ */

type Region = {
  start: number;
  end: number;
  headerRemainder: string;
  headerLine: number;
};

/**
 * Encontra a secao de gabarito. Prioriza um cabecalho explicito
 * ("Gabarito", "Respostas"); se nao houver, procura uma grade de pares
 * no final do documento.
 */
function findGabaritoRegion(lines: FlatLine[]): Region | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.text.match(GABARITO_HEADER);
    if (!match) continue;

    // "Resposta: C" e resposta inline, nao cabecalho de secao.
    GABARITO_INLINE.lastIndex = 0;
    if (line.text.length < 60 && GABARITO_INLINE.test(line.text)) continue;

    const remainder = (match[1] ?? "").trim();
    const isHeaderLike =
      remainder.length > 0 || line.text.length <= 45 || /[:\-–—]/.test(line.text);
    if (!isHeaderLike) continue;

    let end = lines.length;
    if (i < lines.length * 0.4) {
      // Gabarito no inicio: a secao termina quando comecam as questoes.
      end = Math.min(lines.length, i + 400);
      for (let j = i + 1; j < end; j += 1) {
        if (looksLikeQuestionHeader(lines[j].text) && !hasGabaritoPair(lines[j].text)) {
          end = j;
          break;
        }
      }
    }

    return { start: i + 1, end, headerRemainder: remainder, headerLine: i };
  }

  // Sem cabecalho: procura uma grade de pares nas ultimas linhas.
  const tailStart = Math.max(0, lines.length - 80);
  for (let i = tailStart; i < lines.length; i += 1) {
    if (countPairs(lines[i].text) >= 2) {
      return { start: i, end: lines.length, headerRemainder: "", headerLine: -1 };
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Gabarito                                                            */
/* ------------------------------------------------------------------ */

/**
 * Le o gabarito do PDF. Cobre os formatos mais comuns:
 *  - "1-B  2-C  3-A" (grade)
 *  - "1) B  2) C"
 *  - "1  B" (colunas)
 *  - "Questao 12: C"
 */
export function detectGabarito(pages: ExtractedPage[]): GabaritoResult {
  const lines = flattenPages(pages);
  const gabarito: Record<string, string> = {};
  let evidence = "";

  const region = findGabaritoRegion(lines);

  const push = (number: string, letter: string) => {
    const key = String(Number(number));
    if (gabarito[key]) return;
    gabarito[key] = letter.toUpperCase();
  };

  const collect = (text: string) => {
    GABARITO_PAIR_QUESTION.lastIndex = 0;
    GABARITO_PAIR_EXPLICIT.lastIndex = 0;
    GABARITO_PAIR_SPACED.lastIndex = 0;

    let m: RegExpExecArray | null;
    while ((m = GABARITO_PAIR_QUESTION.exec(text)) !== null) push(m[1], m[2]);
    while ((m = GABARITO_PAIR_EXPLICIT.exec(text)) !== null) push(m[1], m[2]);
    while ((m = GABARITO_PAIR_SPACED.exec(text)) !== null) push(m[1], m[2]);

    if (!evidence && hasGabaritoPair(text)) evidence = text.slice(0, 240);
  };

  if (region) {
    if (region.headerRemainder) collect(region.headerRemainder);
    for (let i = region.start; i < region.end; i += 1) {
      collect(lines[i].text);
    }
  }

  return { gabarito, evidence, inline: false };
}

/* ------------------------------------------------------------------ */
/* Alternativas implicitas ("A texto")                                */
/* ------------------------------------------------------------------ */

/**
 * Recupera alternativas no formato "A texto" usando a indentacao para
 * separar o inicio da alternativa da continuacao do texto corrido.
 */
function rescueBareOptions(lines: FlatLine[]): {
  statement: string;
  options: Option[];
} | null {
  const candidates = lines
    .map((line, index) => ({ line, index, match: line.text.match(OPTION_BARE_LETTER) }))
    .filter((item) => item.match !== null);

  if (candidates.length < 3) return null;

  // x modal dos candidatos = alinhamento das alternativas. Usa o valor
  // exato (media) do grupo mais frequente para nao misturar o enunciado,
  // que costuma ter indentacao diferente.
  const buckets = new Map<number, number[]>();
  for (const item of candidates) {
    const bucket = Math.round(item.line.x / 3) * 3;
    const list = buckets.get(bucket) ?? [];
    list.push(item.line.x);
    buckets.set(bucket, list);
  }

  let optionX = 0;
  let best: number[] = [];
  for (const list of buckets.values()) {
    if (list.length > best.length) {
      best = list;
    }
  }
  if (best.length < 3) return null;
  optionX = best.reduce((sum, x) => sum + x, 0) / best.length;

  const near = (x: number) => Math.abs(x - optionX) <= 3;

  const start = candidates.find(
    (item) => item.match?.[1] === "A" && near(item.line.x),
  );
  if (!start) return null;

  const options: Option[] = [];
  let expected = "A";
  let current: Option | null = null;

  for (let i = start.index; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.text.match(OPTION_BARE_LETTER);

    if (match && match[1] === expected && near(line.x)) {
      current = { label: expected, text: match[2] };
      options.push(current);
      expected = String.fromCharCode(expected.charCodeAt(0) + 1);
    } else if (current) {
      current.text = `${current.text} ${line.text}`.trim();
    }
  }

  if (options.length < 3) return null;

  return {
    statement: joinParts(lines.slice(0, start.index).map((line) => line.text)),
    options,
  };
}

/* ------------------------------------------------------------------ */
/* Questoes                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extrai as questoes (enunciado + alternativas) do texto.
 */
export function parseQuestions(pages: ExtractedPage[]): ParsedQuestion[] {
  const lines = flattenPages(pages);
  const region = findGabaritoRegion(lines);
  const gabaritoLines = new Set<number>();

  if (region) {
    for (let i = region.start; i < region.end; i += 1) {
      gabaritoLines.add(lines[i].index);
    }
    if (region.headerLine >= 0) gabaritoLines.add(region.headerLine);
  }

  const questions: ParsedQuestion[] = [];
  let current: {
    number: number | null;
    statementParts: FlatLine[];
    options: Option[];
    topic: string | null;
    page: number;
    inlineAnswer: string | null;
  } | null = null;
  let lastNumber = 0;

  const pushCurrent = () => {
    if (!current) return;

    let statement = joinParts(current.statementParts.map((line) => line.text));
    let options = current.options
      .map((option) => ({ ...option, text: cleanText(option.text) }))
      .filter((option) => option.text.length > 0);

    // Formato implicito: "A texto" - recupera usando a indentacao.
    if (options.length < 2 && current.statementParts.length > 0) {
      const rescued = rescueBareOptions(current.statementParts);
      if (rescued) {
        statement = rescued.statement;
        options = rescued.options;
      }
    }

    if (statement.length > 0 && options.length >= 2) {
      questions.push({
        number: current.number,
        statement,
        options,
        topic: current.topic,
        page: current.page,
        inlineAnswer: current.inlineAnswer,
      });
    }
    current = null;
  };

  for (const line of lines) {
    if (gabaritoLines.has(line.index)) {
      pushCurrent();
      continue;
    }

    if (isNoise(line.text)) continue;

    // Topico em caixa alta (ex.: "ASPECTOS GEOGRÁFICOS, ... SOCI- …")
    if (isTopicLine(line.text)) {
      if (current && !current.topic) {
        current.topic = cleanTopic(line.text);
      }
      continue;
    }

    // Alternativas explicitas tem prioridade: "a) ..." nunca inicia questao.
    const option = matchOption(line.text);
    if (option) {
      if (current) {
        const expected = String.fromCharCode(65 + current.options.length);
        // Alternativas fora de ordem ou duplicadas sao descartadas.
        if (option.label === expected) {
          current.options.push({ label: option.label, text: option.text });
        }
      }
      continue;
    }

    // Resposta inline ("Resposta: C") pertence a questao atual.
    GABARITO_INLINE.lastIndex = 0;
    const inline = GABARITO_INLINE.exec(line.text);
    if (inline && current) {
      current.inlineAnswer = inline[1]?.toUpperCase() ?? null;
      continue;
    }

    const header = matchQuestionHeader(line.text);
    if (header) {
      const outOfOrder = header.number <= lastNumber;

      // Numero fora de ordem dentro de um enunciado em curso = conteudo.
      // Antes de descartar, tenta recuperar alternativas implicitas: se a
      // questao anterior tem alternativas, ela nao esta em andamento.
      if (outOfOrder && current !== null && current.options.length === 0) {
        const rescued = rescueBareOptions(current.statementParts);
        if (!rescued) {
          current.statementParts.push(line);
          continue;
        }
      }

      // Numero solto so abre questao depois de uma questao completa.
      if (header.kind === "bare" && current !== null && current.options.length === 0) {
        current.statementParts.push(line);
        continue;
      }

      pushCurrent();
      current = {
        number: header.number,
        statementParts: header.rest ? [{ ...line, text: header.rest }] : [],
        options: [],
        topic: null,
        page: line.page,
        inlineAnswer: null,
      };
      lastNumber = header.number;
      continue;
    }

    if (!current) continue;

    // Linha solta: continua o enunciado ou a ultima alternativa.
    if (current.options.length > 0) {
      const last = current.options[current.options.length - 1];
      last.text = `${last.text} ${line.text}`.trim();
    } else {
      current.statementParts.push(line);
    }
  }

  pushCurrent();

  return questions;
}

/* ------------------------------------------------------------------ */
/* Integracao                                                          */
/* ------------------------------------------------------------------ */

/**
 * Aplica o gabarito as questoes parseadas. Usa o numero da questao quando
 * existe; caso contrario usa a ordem posicional.
 */
export function applyGabarito(
  questions: ParsedQuestion[],
  gabarito: Record<string, string>,
): { correct: string | null; source: "gabarito" | "desconhecida" }[] {
  const entries = Object.entries(gabarito).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  );
  const positional = entries.map(([, value]) => value.toUpperCase());

  // Se os numeros das questoes batem com as chaves do gabarito, usa por numero.
  const numbered = questions.filter((q) => q.number !== null);
  const byNumberHits = numbered.filter(
    (q) => gabarito[String(q.number)] !== undefined,
  ).length;
  const useNumber =
    numbered.length > 0 && byNumberHits / Math.max(1, numbered.length) >= 0.5;

  return questions.map((question, index) => {
    if (useNumber && question.number !== null) {
      const hit = gabarito[String(question.number)];
      if (hit) return { correct: hit.toUpperCase(), source: "gabarito" as const };
    }
    if (question.inlineAnswer) {
      return { correct: question.inlineAnswer, source: "gabarito" as const };
    }
    const fallback = positional[index];
    if (fallback) return { correct: fallback, source: "gabarito" as const };
    return { correct: null, source: "desconhecida" as const };
  });
}
