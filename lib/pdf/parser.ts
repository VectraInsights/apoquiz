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
 *  2. implicitos  -> "Apopulate o texto..." (letra + espaco + texto),
 *     comuns em apostilas editoriais.
 *
 * Em ambos os formatos a INDENTACAO e o sinal que separa o inicio de uma
 * alternativa da continuacao do enunciado. Por isso as alternativas de uma
 * questao sao extraidas do bloco inteiro da questao: agrupa-se os
 * candidatos por indentacao e escolhe-se o alinhamento que forma a
 * sequencia A, B, C, D, E mais completa. Isso evita que assertivas em
 * algarismos romanos ("I. ... II. ... III. ...") presentes no enunciado
 * sejam confundidas com alternativas.
 *
 * Apostilas editoriais (Qconcursos, Estrategia, ...) organizam o
 * material em secoes numeradas:
 *
 *     1.1 ORTOGRAFIA OFICIAL
 *     1.1.1 Questoes Faceis        <- secao de questoes
 *     1.1.2 Questoes de Nivel Medio
 *     1.1.3 Questoes Dificeis
 *     1.1.4 Gabaritos e Comentarios <- secao de gabarito
 *
 * Nesse formato o numero da questao reinicia a cada capitulo (1.1, 1.2,
 * ...) e o gabarito vem junto da secao de comentarios, no formato
 * "A alternativa correta e a C". Por isso o parser trabalha com secoes:
 * as respostas sao guardadas por "capitulo#numero".
 */

import type { Option, QuestionLevel } from "@/lib/types";
import type { ExtractedItem, ExtractedPage } from "./lines";

export type ParsedQuestion = {
  number: number | null;
  statement: string;
  options: Option[];
  topic: string | null;
  /** Nivel de dificuldade declarado pela apostila (Fácil/Médio/Difícil) */
  level: QuestionLevel | null;
  page: number;
  /** Resposta escrita inline no PDF (ex.: "Resposta: C") */
  inlineAnswer: string | null;
  /** Capitulo onde a questao foi encontrada (ex.: "1.1"); null se nao houver */
  section: string | null;
  /** Explicacao da resposta escrita no PDF (secao de comentarios) */
  explanation: string | null;
  /** Analise de cada alternativa escrita no PDF: { "A": "Incorreta. ..." } */
  optionNotes: Record<string, string>;
};

export type GabaritoResult = {
  /** { "1": "B", "2": "C" } ou { "1.1#53": "C" } quando o gabarito e por secao */
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
  /** itens da linha com posicao, para quem precisar do detalhe */
  items: ExtractedItem[];
};

/* ------------------------------------------------------------------ */
/* Padroes de reconhecimento                                           */
/* ------------------------------------------------------------------ */

// "Questao 12", "Q12", "Questao 12 - texto"
const QUESTION_WORD =
  /^\s*(?:quest[aã]o|q)\s*[-–—]?\s*(\d{1,4})\s*(?:[.:\)\-–—]\s*)?(.*)$/i;

// "12)", "12 -", "12:" seguido do enunciado.
// O ponto so e aceito quando NAO seguido de digito (evita "1.234") e
// quando vem com texto depois ("52. A4B" e expressao de matematica,
// "52. Sabe-se" e enunciado). So o ponto: tambem e continuacao de frase
// ("...as acoes em 2000.").
const QUESTION_NUMBER =
  /^\s*(\d{1,4})\s*(?:[)\-–—:]|\.(?!\d)\s+)\s*(.*)$/;

// "1" sozinho numa linha (enunciado vem na linha seguinte)
const QUESTION_BARE_NUMBER = /^\s*(\d{1,4})\s*$/;

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
  /(?<![\w.])(\d{1,4})\s*[-–—)\]:=]\s*([A-Ea-e])(?![A-Za-z0-9])/g;

// "1 B" / "02    C"  (numero e letra separados por espaco)
const GABARITO_PAIR_SPACED =
  /(?<![\w.])(\d{1,4})\s+([A-Ea-e])(?![A-Za-z0-9])/g;

// "Questao 12: C" / "Questao 12 - C"
const GABARITO_PAIR_QUESTION =
  /quest[aã]o\s*(\d{1,4})\s*[:.\)\-–—]?\s*\(?([A-Ea-e])\)?(?![A-Za-z0-9])/gi;

// "Resposta: C" / "Gabarito: alternativa C" / "R = C"
const GABARITO_INLINE =
  /(?:resposta|gabarito|chave)\s*(?:da\s+quest[aã]o\s*\d{1,4}\s*)?(?:comentad[ao]s?\s*)?[:=]?\s*(?:alternativa\s*)?\(?([A-Ea-e])\)?(?![A-Za-z0-9])/gi;

/* --------------------- gabarito por secao (comentarios) -------------- */

// "Resolucao da Questao 12"
const ANSWER_QUESTION_MARKER = /^\s*Resolu[çc][ãa]o\s+da\s+Quest[ãa]o\s+(\d{1,4})\s*$/i;

// "12 Check-Circle GABARITO"
const ANSWER_NUMBER_MARKER = /^\s*(\d{1,4})\s+Check[-\s]?Circle\s+GABARITO/i;

// "A alternativa correta e a C"
const ANSWER_LETTER =
  /alternativa\s+correta\s*[ée]\s+(?:a\s+|ao\s+)?(?:alternativa\s+)?([A-E])(?![A-Za-z])/i;

// "Times (A) Incorreta. ..." / "Check (C) Correta. ..."
// "Times" e "Check" sao os nomes dos icones (X e ✓) impressos no PDF.
// O veredito varia ("Incorreta", "Correta", "Nao e a resposta", ...), por isso
// ele e opcional.
const OPTION_ANALYSIS =
  /^\s*(?:Times|Check)\s*\(\s*([A-Ea-e])\s*\)\s*(?:Incorret[oa]|Corret[oa]|Verdadeir[oa]|Fals[oa]|N[ãa]o\s*[ée]\s+(?:a\s+)?resposta)?[.\s]*(.*)$/i;

// "Analise Detalhada das Alternativas" - inicio da analise por alternativa
const ANALYSIS_MARKER = /An[áa]lise\s+Detalhada\s+das\s+Alternativas/i;

/* --------------------------- ruido comum ---------------------------- */

// Cabecalho corrente de pagina: "1. Conhecimentos Gerais ... Fisicos, ..."
const RUNNING_HEADER = /^\d+(?:\.\d+)*\.?\s+.{8,}…\s*$/;

// Marcador de dificuldade: "2 ○ ○ ○ FACIL", "12 FACIL", "43 ●●● DIFICIL".
// Os simbolos variam entre PDFs (podem virar letras, perder o glifo ou
// vir como texto), entao o que importa e o numero no inicio e o nivel
// no fim. O espaco entre o ultimo simbolo e o nivel pode faltar
// ("1 ○ ○ ○FACIL"), por isso o separador e opcional.
const DIFFICULTY_LINE =
  /^\s*\d{1,4}(?:\.\d{1,2})?(?:\s*[^\s]{1,4}){0,3}\s*(F[ÁA]CIL|M[ÉE]DIO|DIF[ÍI]CIL|AVAN[ÇC]ADO)\s*$/i;

// "●○○ facil, ●●○ medio, ●●● dificil." - legenda do medidor de nivel
const LEVEL_LEGEND_LINE =
  /^\s*[^.]*\b(?:F[ÁA]CIL|FACIL)\b[^.]*\b(?:M[ÉE]DIO|MEDIO)\b[^.]*$/i;

const LEVEL_BY_WORD: Record<string, QuestionLevel> = {
  FACIL: "facil",
  FÁCIL: "facil",
  MEDIO: "medio",
  MÉDIO: "medio",
  MEDIA: "medio",
  MÉDIA: "medio",
  DIFICIL: "dificil",
  DIFÍCIL: "dificil",
  AVANCADO: "dificil",
  AVANÇADO: "dificil",
};

/** Nivel de dificuldade a partir do marcador da questao ("1 ○ ○ ○ FACIL"). */
function matchDifficulty(text: string): QuestionLevel | null {
  const match = text.match(DIFFICULTY_LINE);
  if (!match) return null;
  return LEVEL_BY_WORD[match[1].toUpperCase()] ?? null;
}

/**
 * Nivel a partir do titulo da secao ("1.1.2 Questoes de Nivel Medio").
 */
function levelFromTitle(title: string): QuestionLevel | null {
  const upper = title.toUpperCase();
  if (/F[ÁA]CIL/.test(upper)) return "facil";
  if (/M[ÉE]DIO|M[ÉE]DIA/.test(upper)) return "medio";
  if (/DIF[ÍI]CIL/.test(upper)) return "dificil";
  return null;
}

// Chamadas de interface das apostilas editoriais
const UI_NOISE =
  /(tente resolver antes de conferir|ver gabarito e coment[áa]rios|voltar [àa] quest[ãa]o|pula direto para a resolu[çc][ãa]o|acesso ao gabarito|an[áa]lise detalhada das alternativas|continue de onde parou)/i;

// "7 / 538", "pagina 12", "page 3"
const PAGE_NUMBER_LINE =
  /^\s*(?:p[áa]gina|page|f[óo]lder)?\s*\.?\s*\d{1,4}\s*(?:\/\s*\d{1,4})?\s*$/i;

const DECORATION_LINE = /^\s*[-–—_=~*•·.]+\s*$/;

// Linhas que so podem ser matematica/simbolos (nao sao enunciados)
const MATH_ONLY = /^[\d\s.,+\-*/^()=<>%°×xX:]+$/;

/* --------------------------- secoes do documento --------------------- */

// "1.1 ORTOGRAFIA OFICIAL", "1.1.4 Gabaritos e Comentarios"
const SECTION_HEADER = /^\s*(\d+(?:\.\d+){1,2})\s+(\S.{0,88})$/;

// Entrada de sumario: "1.1.4 Gabaritos e Comentarios . . . . . . 44"
const TOC_LEADER = /(?:\s\.\s){3,}/;

// Titulo de secao nao contem frase: "dia. Considerando um mes" indica que
// a linha e um trecho de enunciado e nao um cabecalho de secao.
const TITLE_IS_SENTENCE = /[a-zà-ÿ]\.\s/;

const TITLE_QUESTIONS = /quest[õo]es|quest[ãa]o\b|exerc[íi]cios|atividades/i;
const TITLE_ANSWERS = /gabarito|resposta|coment[áa]rio|solu[çc][ãa]o/i;

const ROMAN_TO_LETTER: Record<string, string> = {
  I: "A",
  II: "B",
  III: "C",
  IV: "D",
  V: "E",
};

/** Diferenca maxima de indentacao para duas linhas pertencerem ao mesmo grupo. */
const X_TOLERANCE = 3;

/**
 * Fragmentos de interface das apostilas editoriais. Eles vem colados no
 * texto (o "Questao 55" do cabecalho pode ficar grudado no rodape), e
 * atrapalham tanto a deteccao de cabecalho quanto a de secao.
 *
 * A remocao acontece antes de qualquer analise, na linha inteira.
 */
const NOISE_FRAGMENTS: RegExp[] = [
  /Tente resolver antes de conferir/gi,
  /VER GABARITO E COMENTÁRIOS/gi,
  /Ver gabarito e comentários/gi,
  /Continue de onde parou/gi,
  /VOLTAR À QUESTÃO\s*\d+/gi,
  /LIGHTBULB/gi,
  /BOOKMARK/gi,
  /ARROW-LEFT/gi,
  /\bEYE\b/g,
  /\u{1F4A1}/gu,
];

/** Remove os fragmentos de interface e normaliza o espacamento. */
export function stripNoise(text: string): string {
  let out = text;
  for (const fragment of NOISE_FRAGMENTS) {
    out = out.replace(fragment, " ");
  }
  return out
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

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
      const text = cleanText(stripNoise(raw.text));
      if (!text) continue;
      lines.push({
        page: page.page,
        text,
        x: raw.x,
        index: lines.length,
        items: raw.items,
      });
    }
  }
  return lines;
}

function isNoise(text: string): boolean {
  return (
    PAGE_NUMBER_LINE.test(text) ||
    DECORATION_LINE.test(text) ||
    DIFFICULTY_LINE.test(text) ||
    LEVEL_LEGEND_LINE.test(text) ||
    UI_NOISE.test(text) ||
    RUNNING_HEADER.test(text)
  );
}

/**
 * Linha de topico: predominantemente em caixa alta e com tamanho de titulo.
 * Ex.: "ASPECTOS GEOGRÁFICOS, HISTÓRICOS, FÍSICOS, ECONÔMICOS, SOCI- ..."
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

/* ------------------------------------------------------------------ */
/* Alternativas                                                         */
/* ------------------------------------------------------------------ */

type OptionCandidate = {
  /** indice da linha dentro do bloco da questao */
  index: number;
  /** letra normalizada: A..E */
  label: string;
  /** texto da alternativa */
  text: string;
  /** indentacao da linha */
  x: number;
};

/**
 * Reconhece uma alternativa nos tres formatos suportados e devolve a
 * letra normalizada. Numeros romanos viram letras (I->A, II->B, ...).
 */
function matchOptionCandidate(text: string): { label: string; text: string } | null {
  // Rotulo sozinho na linha: o texto da alternativa vem na linha seguinte.
  const alone = text.match(/^\s*\(?\s*([A-Ea-e])\s*\)?\s*$/);
  if (alone) {
    const label = alone[1].toUpperCase();
    if (label) return { label, text: "" };
  }

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

  const bare = text.match(OPTION_BARE_LETTER);
  if (bare) return { label: bare[1], text: bare[2] };

  return null;
}

/**
 * Sequencia mais longa de alternativas A, B, C, D, E dentro de um grupo
 * que compartilha a mesma indentacao. Quando um "A" aparece fora de
 * ordem, a cadeia recomeca - assim uma assertiva "I." no enunciado nao
 * quebra o grupo das alternativas verdadeiras.
 */
function buildChain(candidates: OptionCandidate[]): OptionCandidate[] {
  let best: OptionCandidate[] = [];
  let chain: OptionCandidate[] = [];

  for (const candidate of candidates) {
    const aligned =
      chain.length === 0 || Math.abs(candidate.x - chain[0].x) <= X_TOLERANCE;
    if (!aligned) chain = [];

    const expected = String.fromCharCode(65 + chain.length);
    if (candidate.label === expected) {
      chain.push(candidate);
    } else if (candidate.label === "A") {
      // Um "A" fora de ordem reinicia a cadeia.
      chain = [candidate];
    } else {
      continue;
    }

    if (chain.length >= best.length) best = [...chain];
  }

  return best;
}

/**
 * Extrai as alternativas de um bloco de linhas (a questao inteira).
 *
 * Os candidatos sao agrupados pela indentacao: as alternativas de uma
 * questao ficam alinhadas, enquanto o enunciado tem outra indentacao.
 * Ganha o alinhamento que forma a sequencia A..E mais completa.
 */
function extractOptions(block: FlatLine[]): { options: Option[]; start: number } | null {
  const candidates: OptionCandidate[] = [];
  for (let i = 0; i < block.length; i += 1) {
    const match = matchOptionCandidate(block[i].text);
    if (!match) continue;
    candidates.push({
      index: i,
      label: match.label,
      text: match.text,
      x: block[i].x,
    });
  }
  if (candidates.length < 2) return null;

  // Agrupa por indentacao (vizinhos dentro de X_TOLERANCE). A ordem do
  // documento e preservada dentro de cada grupo: a coordenada x das
  // alternativas varia um pouco e ordenar por x embaralharia as letras.
  const groups: OptionCandidate[][] = [];
  for (const candidate of candidates) {
    let target = -1;
    for (let g = 0; g < groups.length; g += 1) {
      if (Math.abs(groups[g][0].x - candidate.x) <= X_TOLERANCE) {
        target = g;
        break;
      }
    }
    if (target === -1) groups.push([candidate]);
    else groups[target].push(candidate);
  }

  let best: OptionCandidate[] = [];
  let bestGroup = groups[0] ?? [];
  for (const group of groups) {
    const chain = buildChain(group);
    // Empate: vence o grupo com mais candidatos e, depois, o mais recente
    // (as alternativas vem depois do enunciado).
    if (
      chain.length > best.length ||
      (chain.length === best.length && group.length > bestGroup.length) ||
      (chain.length === best.length &&
        group.length === bestGroup.length &&
        chain.length > 0 &&
        best.length > 0 &&
        chain[chain.length - 1].index > best[best.length - 1].index)
    ) {
      best = chain;
      bestGroup = group;
    }
  }
  if (best.length < 2) return null;

  const options: Option[] = best.map((candidate) => ({
    label: candidate.label,
    text: candidate.text,
  }));

  // Continuacao de cada alternativa: linhas ate a proxima alternativa.
  for (let k = 0; k < best.length; k += 1) {
    const from = best[k].index + 1;
    const to = k + 1 < best.length ? best[k + 1].index : block.length;
    for (let j = from; j < to; j += 1) {
      options[k].text = `${options[k].text} ${block[j].text}`.trim();
    }
  }

  return { options, start: best[0].index };
}

/* ------------------------------------------------------------------ */
/* Cabecalho de questao                                                 */
/* ------------------------------------------------------------------ */

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
    if (!MATH_ONLY.test(rest) && !/^[;,]/.test(rest)) {
      // "2009), o alfabeto..." e continuacao de frase (o numero de um ano
      // seguido de parentese no inicio da linha), nao um novo enunciado.
      // O mesmo vale para um numero seguido de texto em minuscula: e
      // continuacao da linha anterior, nao cabecalho de questao.
      if (/^[a-zà-ÿ]/.test(rest)) return null;
      if (Number.isFinite(number) && number > 0) {
        return { number, rest, kind: "number" };
      }
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
/* Secoes do documento                                                  */
/* ------------------------------------------------------------------ */

export type SectionKind = "questions" | "answers" | "other";

type DocSection = {
  /** Caminho editorial completo ("1.1.4") */
  path: string;
  /** Capitulo ("1.1" a partir de "1.1.4") - o numero da questao reinicia aqui */
  chapter: string;
  title: string;
  kind: SectionKind;
  /** Nivel de dificuldade declarado pelo titulo da secao */
  level: QuestionLevel | null;
  /** indice global da linha do cabecalho */
  start: number;
  /** indice global exclusivo do fim da secao */
  end: number;
};

function chapterOf(path: string): string {
  const parts = path.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : path;
}

function classifyTitle(title: string): SectionKind {
  if (TITLE_QUESTIONS.test(title)) return "questions";
  if (TITLE_ANSWERS.test(title)) return "answers";
  return "other";
}

/**
 * Localiza os cabecalhos de secao numerados. Entradas de sumario
 * ("1.1.4 Gabaritos . . . . 44") sao descartadas pela sequencia de pontos.
 */
function detectSections(lines: FlatLine[]): DocSection[] {
  const headers: { path: string; title: string; index: number }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i].text;
    if (TOC_LEADER.test(text)) continue;
    const match = text.match(SECTION_HEADER);
    if (!match) continue;

    const title = match[2].trim();
    // Titulo de secao comeca com letra maiuscula.
    if (!/^[A-ZÀ-Þ]/.test(title)) continue;
    if (!/[A-Za-zÀ-ÿ]{3}/.test(title)) continue;
    // Titulo de secao nao tem frase nem decimais: "2.200 W permanece..."
    // e um trecho de enunciado, nao o cabecalho da secao 2.200.
    if (TITLE_IS_SENTENCE.test(title)) continue;
    const parts = match[1].split(".");
    if (parts.some((part) => Number(part) > 99)) continue;

    headers.push({ path: match[1], title, index: i });
  }

  return headers.map((header, index) => ({
    path: header.path,
    chapter: chapterOf(header.path),
    title: header.title,
    kind: classifyTitle(header.title),
    level: levelFromTitle(header.title),
    start: header.index,
    end: index + 1 < headers.length ? headers[index + 1].index : lines.length,
  }));
}

/** Mapa indice global da linha -> secao que a contem. */
function buildSectionMap(lines: FlatLine[], sections: DocSection[]): Int32Array {
  const map = new Int32Array(lines.length).fill(-1);
  sections.forEach((section, sectionIndex) => {
    for (let i = section.start; i < section.end && i < lines.length; i += 1) {
      map[i] = sectionIndex;
    }
  });
  return map;
}

/**
 * Cabecalho corrente das apostilas editoriais:
 * "1. Língua Portuguesa 1.1. Ortografia Oficial".
 * Ele contem o caminho de uma secao conhecida, por isso da para
 * reconhecer sem depender do layout exato.
 */
function isRunningHeader(text: string, paths: Set<string>): boolean {
  if (!/^\d{1,3}\.\s/.test(text)) return false;
  for (const path of paths) {
    if (text.includes(`${path}.`) || text.includes(`${path} `)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Resolucoes escritas no PDF (secao de comentarios)                   */
/* ------------------------------------------------------------------ */

/**
 * Resolucao de uma questao, como escrita na secao de comentarios do PDF:
 *
 *     Resolucao da Questao 12
 *     12 Check-Circle GABARITO
 *     A alternativa correta e a C
 *     Explicacao da resposta correta...
 *     Analise Detalhada das Alternativas
 *     Times (A) Incorreta. ...
 *     Check (C) Correta. ...
 */
export type Resolution = {
  /** Letra da alternativa correta */
  correct: string;
  /** Explicacao da resposta correta */
  explanation: string | null;
  /** Analise de cada alternativa: { "A": "..." } */
  optionNotes: Record<string, string>;
};

type NoteDraft = { label: string; parts: string[]; x: number };

/** Tira o prefixo "Correta." da explicacao (o PDF usa em parte das questoes). */
function cleanExplanation(parts: string[]): string | null {
  const text = joinParts(parts).replace(/^Correta\.\s*/i, "").trim();
  return text.length > 0 ? text : null;
}

/**
 * Le as resolucoes (explicacao + analise por alternativa) das secoes de
 * comentarios do PDF. A chave e "capitulo#numero", igual ao gabarito.
 *
 * Nem toda apostila tem uma secao de gabarito propriamente dita: muitas
 * colocam as resolucoes logo depois das questoes, dentro da propria secao
 * de exercicios. Por isso a leitura acontece em **todas** as secoes - os
 * marcadores ("Resolucao da Questao 12", "12 Check-Circle GABARITO") sao
 * especificos demais para confundirem com enunciado.
 */
function detectResolutions(
  lines: FlatLine[],
  sections: DocSection[],
): { resolutions: Map<string, Resolution>; lines: Set<number> } {
  const resolutions = new Map<string, Resolution>();
  const usadas = new Set<number>();
  const sectionPaths = new Set(sections.map((section) => section.path));

  /**
   * Marca as linhas do intervalo [inicio, fim) como consumidas por uma
   * resolucao (para nao virarem parte do enunciado de uma questao).
   */
  const marcar = (inicio: number, fim: number) => {
    for (let i = inicio; i < fim && i < lines.length; i += 1) {
      usadas.add(lines[i].index);
    }
  };

  for (const section of sections) {
    let number: number | null = null;
    let correct: string | null = null;
    let explanation: string[] = [];
    let explanationX = 0;
    let notes: NoteDraft[] = [];
    let mode: "idle" | "explanation" | "options" = "idle";
    /** primeira linha do bloco de resolucao em andamento */
    let inicioBloco: number | null = null;

    const flush = () => {
      if (number !== null && !resolutions.has(`${section.chapter}#${number}`)) {
        const optionNotes: Record<string, string> = {};
        for (const note of notes) {
          const text = cleanText(note.parts.join(" "));
          if (text) optionNotes[note.label] = text;
        }
        resolutions.set(`${section.chapter}#${number}`, {
          correct: correct ?? "",
          explanation: cleanExplanation(explanation),
          optionNotes,
        });
      }
      number = null;
      correct = null;
      explanation = [];
      notes = [];
      mode = "idle";
    };

    for (let i = section.start; i < section.end; i += 1) {
      const line = lines[i];
      const text = line.text;

      // "Resolucao da Questao 12" - comeca uma resolucao nova.
      const marker = text.match(ANSWER_QUESTION_MARKER);
      if (marker) {
        if (inicioBloco !== null) marcar(inicioBloco, i);
        flush();
        inicioBloco = i;
        number = Number(marker[1]);
        continue;
      }

      // "12 Check-Circle GABARITO" - numero alternativo.
      const numbered = text.match(ANSWER_NUMBER_MARKER);
      if (numbered) {
        if (inicioBloco === null) inicioBloco = i;
        if (number === null) number = Number(numbered[1]);
        continue;
      }

      // "A alternativa correta e a C" - abre a explicacao.
      const letter = text.match(ANSWER_LETTER);
      if (letter) {
        if (inicioBloco === null) inicioBloco = i;
        correct = letter[1].toUpperCase();
        mode = "explanation";
        explanationX = line.x;
        continue;
      }

      // Resposta inline dentro da secao de comentarios ("Gabarito: C")
      GABARITO_INLINE.lastIndex = 0;
      const inline = GABARITO_INLINE.exec(text);
      if (inline && number !== null && !correct) {
        correct = inline[1].toUpperCase();
        continue;
      }

      // "Analise Detalhada das Alternativas" - fecha a explicacao.
      if (ANALYSIS_MARKER.test(text)) {
        mode = "options";
        continue;
      }

      // "Times (A) Incorreta. ..." / "Check (C) Correta. ..."
      const analysis = text.match(OPTION_ANALYSIS);
      if (analysis) {
        mode = "options";
        const label = analysis[1].toUpperCase();
        const body = cleanText(analysis[2] ?? "");
        const existing = notes.find((note) => note.label === label);
        if (existing) {
          existing.parts = [body];
          existing.x = line.x;
        } else {
          notes.push({ label, parts: [body], x: line.x });
        }
        continue;
      }

      if (isNoise(text)) continue;
      if (isTopicLine(text)) continue;
      // Cabecalho corrente ("1. Língua Portuguesa 1.18. ...").
      if (isRunningHeader(text, sectionPaths)) continue;

      if (mode === "explanation") {
        // Continuacao da explicacao: mesma indentacao da linha da resposta.
        if (line.x >= explanationX - 3) {
          explanation.push(text);
        }
        continue;
      }

      if (mode === "options" && notes.length > 0) {
        // Continuacao da analise: vem indentada (x maior que o da alternativa).
        const last = notes[notes.length - 1];
        if (line.x >= last.x + 5) {
          last.parts.push(text);
        }
      }
    }

    // Ultimo bloco da secao.
    if (inicioBloco !== null) marcar(inicioBloco, section.end);

    flush();
  }

  return { resolutions, lines: usadas };
}

/* ------------------------------------------------------------------ */
/* Analise do documento                                                 */
/* ------------------------------------------------------------------ */

type DocumentAnalysis = {
  lines: FlatLine[];
  sections: DocSection[];
  /** Resolucoes por "capitulo#numero" */
  resolutions: Map<string, Resolution>;
  /** linhas que pertencem a uma resolucao (nao sao enunciado) */
  resolutionLines: Set<number>;
};

/** Monta a visao estruturada do documento (usada pelo gabarito e pelas questoes). */
function analyzeDocument(pages: ExtractedPage[]): DocumentAnalysis {
  const lines = flattenPages(pages);
  const sections = detectSections(lines);
  const { resolutions, lines: resolutionLines } = detectResolutions(lines, sections);
  return { lines, sections, resolutions, resolutionLines };
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
 * Cabecalho de secao de gabarito. Exige que a linha comece com maiuscula
 * e que nao termine em ponto - senao "gabarito." (fim de frase) seria
 * confundido com um cabecalho.
 */
function isGabaritoHeader(text: string): boolean {
  const match = text.match(GABARITO_HEADER);
  if (!match) return false;

  const trimmed = text.trim();
  if (!/^[A-ZÀ-Þ]/.test(trimmed)) return false;
  if (trimmed.endsWith(".") && !/[:\-–—]/.test(trimmed)) return false;

  // "Resposta: C" e resposta inline, nao cabecalho de secao.
  GABARITO_INLINE.lastIndex = 0;
  if (trimmed.length < 60 && GABARITO_INLINE.test(trimmed)) return false;

  const remainder = (match[1] ?? "").trim();
  const isHeaderLike =
    remainder.length > 0 || trimmed.length <= 45 || /[:\-–—]/.test(trimmed);
  return isHeaderLike;
}

function looksLikeQuestionHeader(text: string): boolean {
  return matchQuestionHeader(text) !== null;
}

/**
 * Encontra a secao de gabarito (formato classico: um unico bloco no fim
 * do documento). Em apostilas com gabarito por secao esta funcao nao e
 * usada - o gabarito vem das secoes "Gabaritos e Comentarios".
 */
function findGabaritoRegion(lines: FlatLine[]): Region | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (!isGabaritoHeader(lines[i].text)) continue;

    const remainder = (lines[i].text.match(GABARITO_HEADER)?.[1] ?? "").trim();
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

/** Ordena chaves "1.1#53" e "12" de forma estavel e numerica. */
export function compareGabaritoKey(a: string, b: string): number {
  const parse = (key: string) => {
    const parts = key.split("#");
    return {
      chapter: parts.length > 1 ? parts[0] : "",
      number: Number(parts[parts.length - 1]) || 0,
    };
  };
  const left = parse(a);
  const right = parse(b);
  if (left.chapter !== right.chapter) {
    return left.chapter.localeCompare(right.chapter, undefined, { numeric: true });
  }
  return left.number - right.number;
}

/**
 * Le o gabarito do PDF. Cobre os formatos mais comuns:
 *  - "1-B  2-C  3-A" (grade)
 *  - "1) B  2) C"
 *  - "1  B" (colunas)
 *  - "Questao 12: C"
 *  - secao "Gabaritos e Comentarios" com "A alternativa correta e a C"
 */
export function detectGabarito(pages: ExtractedPage[]): GabaritoResult {
  const { lines, resolutions } = analyzeDocument(pages);
  const gabarito: Record<string, string> = {};
  let evidence = "";

  /* 1) Gabarito por secao: "1.1.4 Gabaritos e Comentarios" */
  for (const [key, resolution] of resolutions) {
    if (!resolution.correct) continue;
    if (!gabarito[key]) {
      gabarito[key] = resolution.correct;
      if (!evidence) evidence = `A alternativa correta é a ${resolution.correct}`;
    }
  }

  /* 2) Formato classico: um bloco unico de pares no documento */
  if (Object.keys(gabarito).length === 0) {
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
  }

  return { gabarito, evidence, inline: false };
}

/**
 * Procura a resposta de uma questao no gabarito detectado. Quando o
 * gabarito e por secao, a chave e "capitulo#numero"; quando e global, a
 * chave e apenas o numero.
 */
export function lookupGabarito(
  gabarito: Record<string, string> | null | undefined,
  question: { number: number | null; section?: string | null },
): string | null {
  if (!gabarito || question.number === null) return null;

  if (question.section) {
    const scoped = gabarito[`${question.section}#${question.number}`];
    if (scoped) return scoped.toUpperCase();
  }

  const plain = gabarito[String(question.number)];
  return plain ? plain.toUpperCase() : null;
}

/* ------------------------------------------------------------------ */
/* Questoes                                                            */
/* ------------------------------------------------------------------ */

/**
 * Extrai as questoes (enunciado + alternativas) do texto.
 */
export function parseQuestions(pages: ExtractedPage[]): ParsedQuestion[] {
  const { lines, sections, resolutions, resolutionLines } = analyzeDocument(pages);
  const sectionMap = buildSectionMap(lines, sections);
  const sectionPaths = new Set(sections.map((section) => section.path));

  // Quando o PDF tem secoes de questoes bem definidas, so elas geram
  // questoes. Isso descarta o material de frente (capa, sumario, guia
  // rapido) que costuma ser misinterpreted como questao.
  const questionSections = sections.filter((section) => section.kind === "questions");
  const useSections = questionSections.length >= 3;

  // Regiao classica de gabarito (PDFs sem gabarito por secao).
  const region = useSections ? null : findGabaritoRegion(lines);
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
    /** linhas do enunciado + alternativas da questao */
    block: FlatLine[];
    topic: string | null;
    level: QuestionLevel | null;
    page: number;
    inlineAnswer: string | null;
    section: string | null;
  } | null = null;

  /** Ultimo numero visto por capitulo - o numero reinicia a cada capitulo. */
  const lastNumbers = new Map<string, number>();

  const pushCurrent = () => {
    if (!current) return;

    const extracted = extractOptions(current.block);
    if (extracted) {
      const statement = joinParts(
        current.block.slice(0, extracted.start).map((line) => line.text),
      );
      const options = extracted.options
        .map((option) => ({ ...option, text: cleanText(option.text) }))
        .filter((option) => option.text.length > 0);

      if (statement.length > 0 && options.length >= 2) {
        // Resolucao escrita no PDF (secao de comentarios): traz a
        // explicacao da resposta correta e a analise de cada alternativa.
        const resolution =
          current.number !== null && current.section
            ? resolutions.get(`${current.section}#${current.number}`)
            : undefined;

        questions.push({
          number: current.number,
          statement,
          options,
          topic: current.topic,
          level: current.level,
          page: current.page,
          inlineAnswer: current.inlineAnswer,
          section: current.section,
          explanation: resolution?.explanation ?? null,
          optionNotes: resolution?.optionNotes ?? {},
        });
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Linhas do gabarito (secoes de comentarios ou bloco classico) nao
    // sao questoes.
    if (gabaritoLines.has(line.index)) {
      pushCurrent();
      continue;
    }

    // Resolucao escrita no PDF ("Resolucao da Questao 12"): o gabarito e
    // a justificativa, nao enunciado.
    if (resolutionLines.has(line.index)) {
      pushCurrent();
      continue;
    }

    const sectionIndex = sectionMap[i];
    const section = sectionIndex >= 0 ? sections[sectionIndex] : null;

    // Secao de gabarito: fora.
    if (section && section.kind === "answers") {
      pushCurrent();
      continue;
    }

    // Cabecalho de secao e estrutura, nao enunciado.
    if (section && section.start === line.index) {
      continue;
    }

    // Quando o PDF tem secoes de questoes, o resto do material e
    // descartado (capa, sumario, teoria).
    if (useSections && (!section || section.kind !== "questions")) {
      pushCurrent();
      continue;
    }

    // Marcador de dificuldade da questao ("1 ○ ○ ○ FACIL"). Precisa ser
    // lido ANTES do filtro de ruido, que descartaria a linha. Vem logo
    // depois do cabecalho "Questao N" e tem prioridade sobre o titulo
    // da secao.
    const level = matchDifficulty(line.text);
    if (level) {
      if (current) current.level = level;
      continue;
    }

    if (isNoise(line.text)) continue;

    // Cabecalho corrente: "1. Língua Portuguesa 1.1. Ortografia Oficial".
    // Ele aparece no meio da questao quando ha quebra de pagina, entao e
    // apenas descartado - nunca fecha a questao.
    if (isRunningHeader(line.text, sectionPaths)) {
      continue;
    }

    // Topico em caixa alta (ex.: "ASPECTOS GEOGRÁFICOS, ... SOCI- ...")
    if (isTopicLine(line.text)) {
      if (current && !current.topic) {
        current.topic = cleanTopic(line.text);
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
      const chapter = section?.chapter ?? "";
      const last = lastNumbers.get(chapter) ?? 0;
      const outOfOrder = header.number <= last;

      // Numero fora de ordem dentro de um enunciado em curso = conteudo.
      // Antes de descartar, tenta recuperar as alternativas implicitas: se a
      // questao anterior ja tem alternativas, ela nao esta em andamento.
      if (outOfOrder && current !== null && !extractOptions(current.block)) {
        current.block.push(line);
        continue;
      }

      // Numero solto so abre questao depois de uma questao completa.
      if (header.kind === "bare" && current !== null && !extractOptions(current.block)) {
        current.block.push(line);
        continue;
      }

      pushCurrent();
      current = {
        number: header.number,
        block: header.rest ? [{ ...line, text: header.rest }] : [],
        topic: null,
        // Sem marcador proprio, herda o nivel do titulo da secao
        // ("1.1.2 Questoes de Nivel Medio").
        level: section?.level ?? null,
        page: line.page,
        inlineAnswer: null,
        section: chapter || null,
      };
      lastNumbers.set(chapter, header.number);
      continue;
    }

    if (!current) continue;

    current.block.push(line);
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
  const entries = Object.entries(gabarito).sort((a, b) =>
    compareGabaritoKey(a[0], b[0]),
  );
  const positional = entries.map(([, value]) => value.toUpperCase());

  // Gabarito por secao: a chave "capitulo#numero" ja e precisa, nao ha
  // como aplicar por ordem.
  const scoped = entries.some(([key]) => key.includes("#"));

  const plain = new Map<string, string>();
  for (const [key, value] of entries) {
    if (!key.includes("#")) plain.set(key, value.toUpperCase());
  }

  // Se os numeros das questoes batem com as chaves do gabarito, usa por numero.
  const numbered = questions.filter((q) => q.number !== null);
  const byNumberHits = numbered.filter(
    (q) => plain.get(String(q.number)) !== undefined,
  ).length;
  const useNumber =
    !scoped &&
    numbered.length > 0 &&
    byNumberHits / Math.max(1, numbered.length) >= 0.5;

  return questions.map((question, index) => {
    if (question.number !== null && question.section) {
      const hit = gabarito[`${question.section}#${question.number}`];
      if (hit) return { correct: hit.toUpperCase(), source: "gabarito" as const };
    }
    if (useNumber && question.number !== null) {
      const hit = plain.get(String(question.number));
      if (hit) return { correct: hit.toUpperCase(), source: "gabarito" as const };
    }
    if (question.inlineAnswer) {
      return { correct: question.inlineAnswer, source: "gabarito" as const };
    }
    if (!scoped) {
      const fallback = positional[index];
      if (fallback) return { correct: fallback, source: "gabarito" as const };
    }
    return { correct: null, source: "desconhecida" as const };
  });
}
