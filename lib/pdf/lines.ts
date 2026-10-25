/**
 * Reconstrucao de linhas a partir dos itens de texto do pdf.js.
 *
 * O pdf.js devolve cada "pedaco" de texto com sua posicao. Aqui agrupamos
 * os pedacos em linhas (pela baseline), reconstruimos os espacos pelo vao
 * horizontal e guardamos a posicao de cada item - a indentacao e o que
 * permite distinguir o inicio de uma alternativa da continuacao do texto.
 */

export type RawItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedItem = {
  str: string;
  x: number;
  width: number;
  /** posicao do item dentro do texto da linha */
  offset: number;
};

export type ExtractedLine = {
  text: string;
  /** posicao horizontal do primeiro item da linha */
  x: number;
  /**
   * true quando dois itens da linha se sobrepoem horizontalmente.
   * Sinal de PDF com layout quebrado (cabecalho colado no texto).
   */
  overlap?: boolean;
  /** itens da linha com posicao, para quem precisar do detalhe */
  items: ExtractedItem[];
};

export type ExtractedPage = {
  page: number;
  lines: ExtractedLine[];
  /** true quando a pagina tinha duas renderizacoes do mesmo conteudo */
  duplicated?: boolean;
};

type Line = {
  y: number;
  height: number;
  items: RawItem[];
};

/** Agrupa itens em linhas usando a baseline (transform[5]). */
function buildLines(items: RawItem[]): Line[] {
  const lines: Line[] = [];

  for (const item of items) {
    const height = item.height || 10;
    const tolerance = Math.max(2, height * 0.4);
    let match: Line | undefined;

    for (const line of lines) {
      if (Math.abs(line.y - item.y) <= tolerance) {
        match = line;
        break;
      }
    }

    if (match) {
      match.items.push(item);
      // mantem a baseline como media ponderada para evitar deriva
      match.y = (match.y * (match.items.length - 1) + item.y) / match.items.length;
      match.height = Math.max(match.height, height);
    } else {
      lines.push({ y: item.y, height, items: [item] });
    }
  }

  return lines.sort((a, b) => b.y - a.y);
}

/** Junta os itens de uma linha respeitando os espacos horizontais. */
function joinLine(line: Line): ExtractedLine {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  let out = "";
  let prev: RawItem | null = null;
  let overlap = false;
  const parts: ExtractedItem[] = [];

  // publishings usam espacamento entre letras em titulos. Nesses casos o
  // espaco "real" e bem maior que o espacamento entre letras, entao
  // usamos um limiar relativo a media dos vaos da propria linha.
  const gaps: number[] = [];
  for (let i = 1; i < items.length; i += 1) {
    gaps.push(items[i].x - (items[i - 1].x + items[i - 1].width));
  }
  const meanGap =
    gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  const shortItems = items.filter((item) => item.str.trim().length <= 2).length;
  const spaced =
    items.length >= 8 &&
    shortItems / items.length > 0.6 &&
    meanGap > line.height * 0.1 &&
    meanGap < line.height * 0.45;

  const threshold = spaced
    ? Math.max(meanGap * 1.7, line.height * 0.12)
    : Math.max(1.2, Math.min(line.height, line.height) * 0.2);

  for (const item of items) {
    if (!item.str) {
      prev = item;
      continue;
    }

    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      const limit = spaced
        ? threshold
        : Math.max(1.2, Math.min(prev.height, item.height) * 0.2);
      if (gap > limit) {
        const endsWithSpace = /\s$/.test(out);
        const startsWithSpace = /^\s/.test(item.str);
        if (!endsWithSpace && !startsWithSpace) out += " ";
      }
      // Itens que se sobrepoem horizontalmente indicam layout quebrado.
      if (gap < -1) overlap = true;
    }

    const offset = out.length;
    out += item.str;
    parts.push({ str: item.str, x: item.x, width: item.width, offset });
    prev = item;
  }

  return {
    text: out.replace(/\s+/g, " ").trim(),
    x: Math.min(...items.map((item) => item.x)),
    overlap: overlap || undefined,
    items: parts,
  };
}

/**
 * Alguns PDFs desenham o mesmo conteudo **duas vezes**: uma camada
 * visivel e outra invisivel (acessibilidade/OCR) ou uma copia
 * deslocada. O texto extraido sai com tudo duplicado e embaralhado.
 *
 * A assinatura de uma copia e um deslocamento vertical **constante**
 * em varios textos ao mesmo tempo. Quando isso aparece em boa parte
 * dos itens da pagina, a segunda passagem e descartada.
 */
export function removeDuplicatedPass(items: RawItem[]): RawItem[] {
  const groups = new Map<string, RawItem[]>();
  for (const item of items) {
    const key = `${item.str}\u0000${Math.round(item.x)}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  // Deslocamentos verticais candidatos e quantos grupos distintos
  // aparecem com cada um.
  const offsets = new Map<number, Set<string>>();
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const delta = Math.round(list[j].y - list[i].y);
        if (delta === 0) continue;
        let set = offsets.get(delta);
        if (!set) {
          set = new Set();
          offsets.set(delta, set);
        }
        set.add(key);
      }
    }
  }

  let bestDelta = 0;
  let bestGroups = 0;
  for (const [delta, set] of offsets) {
    if (set.size > bestGroups) {
      bestGroups = set.size;
      bestDelta = delta;
    }
  }

  const meaningful = items.filter((item) => item.str.trim().length > 0);
  if (bestGroups < 6 || meaningful.length === 0) return items;

  // Quantos itens de verdade participaram da copia?
  let affected = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const has = list.some((item) =>
      list.some(
        (other) =>
          other !== item && Math.round(other.y - item.y) === bestDelta,
      ),
    );
    if (has) affected += list.length;
  }

  if (affected < meaningful.length * 0.3) return items;

  // Descarta os itens da segunda passagem (o de maior y de cada par).
  const drop = new Set<RawItem>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i += 1) {
      if (Math.round(sorted[i].y - sorted[i - 1].y) === bestDelta) {
        drop.add(sorted[i]);
      }
    }
  }

  if (drop.size === 0) return items;
  return items.filter((item) => !drop.has(item));
}

/**
 * Alguns PDFs trazem **duas renderizações do mesmo conteúdo**: a do
 * documento original e a do recorte (o capítulo), cada uma com o seu
 * próprio layout. O texto extraído sai embaralhado — fragmentos da
 * versão antiga aparecem no meio da nova ("Questão 54" colado na
 * alternativa A, a enunciado repetido com outra quebra de linha).
 *
 * A assinatura: vários textos repetidos em dois blocos do stream, cada
 * um em posições diferentes. Não é um deslocamento constante (esse caso
 * é o da camada invisível, tratado em {@link removeDuplicatedPass}), é
 * uma re-renderização com outro layout.
 *
 * A renderização principal é a que começa na margem esquerda (a coluna
 * de texto da página). Da renderização descartada só os **títulos de
 * seção** são preservados: eles descrevem a estrutura do documento e o
 * parser precisa deles para saber onde estão as questões e o gabarito.
 */
/**
 * Titulo de secao de verdade: um caminho editorial ("1.4", "1.4.1",
 * "2.11") seguido do titulo. Um numero solto ("25. Com base...") e
 * enunciado, nao estrutura.
 */
const SECTION_TITLE_ITEM = /^\d+(?:\.\d+){1,2}\s+\S/;

/**
 * Minimo de caracteres normalizados para duas ocorrencias contarem como a
 * "mesma frase". E o mesmo corte que a 2b ja usa: sem ele, a 2a compara
 * tokens soltos.
 */
const MINIMO_FRASE = 12;

/**
 * Remove a "segunda renderizacao" da pagina.
 *
 * 2a e 2b so agem sobre texto repetido ou contido — e mesmo assim apenas
 * quando o texto passa nos cortes de frase e de titulo de secao. A 2c age
 * por GEOMETRIA e por isso exige prova antes de rodar: ou a fase anterior
 * achou copia deslocada, ou 2a/2b ja acharam texto repetido nesta pagina.
 *
 * @param provaDeCopia {@link removeDuplicatedPass} achou um deslocamento
 *   de copia nesta pagina (>= 6 grupos distintos, deslocamento constante,
 *   explicando >= 30% dos itens) — ou seja, a pagina tem duas
 *   renderizacoes de verdade.
 */
export function removeDuplicatedLayout(
  items: RawItem[],
  provaDeCopia = false,
): {
  items: RawItem[];
  removed: boolean;
} {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.,;:!?()[\]·"'-]/g, "");

  // --- 1) grupos por texto normalizado (mesma frase, posicoes diferentes)
  const todos = new Map<string, RawItem[]>();
  for (const item of items) {
    const key = normalize(item.str);
    if (!key) continue;
    const list = todos.get(key);
    if (list) list.push(item);
    else todos.set(key, [item]);
  }

  const remover = new Set<RawItem>();

  // --- 2a) mesma frase: a versao maior e a copia ---
  //
  // Dois cortes obrigatorios. Medidos em teste.pdf (2706 paginas, 1121
  // itens marcados pela 2a):
  //
  //   comprimento 1..8 ....... 1093 itens  ("a" 208x, "b" 153x, "2" 136x,
  //                                         "e" 122x, "n" 65x, "gabarito" 11x)
  //   titulo de secao ........   17 itens  ("1.9 concordancia verbal...")
  //
  // Um token solto nao e "mesma frase" - e a 2b ja exige 12 caracteres
  // para aceitar uma correspondencia. O titulo de secao e estrutura do
  // documento: remove-lo reatribui todas as questoes da pagina para a
  // secao anterior (em p546 a chave 1.9#369 passava a ser de outra secao
  // e a questao "sumia" sem ter sido apagada).
  //
  // Esses dois cortes tambem fecham a porta da 2c: cada hit da 2a abria
  // a fase seguinte, e a 2c ai comia o cabecalho "Questao 369" inteiro.
  for (const [chave, list] of todos) {
    if (list.length < 2) continue;
    if (chave.length < MINIMO_FRASE) continue;
    if (list.some((item) => SECTION_TITLE_ITEM.test(item.str.trim()))) continue;
    const menorAltura = Math.min(...list.map((item) => item.height));
    for (const item of list) {
      if (item.height > menorAltura * 1.15) remover.add(item);
    }
  }

  // --- 2b) frase parecida com outra quebra de linha ---
  // "De acordo com ... assinale a" / "De acordo com ... assinale a alterna-"
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (remover.has(a)) continue;
    // Titulo de secao nunca e copia: e ele que descreve o documento.
    if (SECTION_TITLE_ITEM.test(a.str.trim())) continue;
    const ka = normalize(a.str);
    if (ka.length < 12) continue;

    for (let j = 0; j < items.length; j += 1) {
      if (i === j) continue;
      const b = items[j];
      if (remover.has(b)) continue;
      if (SECTION_TITLE_ITEM.test(b.str.trim())) continue;
      const kb = normalize(b.str);
      if (kb.length < 12 || kb === ka) continue;

      const menor = Math.min(ka.length, kb.length);
      const maior = Math.max(ka.length, kb.length);
      if (menor / maior < 0.4) continue;
      if (!ka.includes(kb) && !kb.includes(ka)) continue;

      // A copia tem fonte maior.
      if (a.height > b.height * 1.15) remover.add(a);
      else if (b.height > a.height * 1.15) remover.add(b);
    }
  }

  // --- 2c) o que sobrou da copia ---
  //
  // Unica fase que remove texto por GEOMETRIA (fonte maior que a mediana,
  // dentro de uma banda horizontal), sem texto repetido que a justifique.
  // Por isso ela exige prova antes de rodar.
  //
  // Medido em teste.pdf: a 2c marcava 2442 itens e disparava em 113 paginas
  // das quais 112 NAO tinham nenhum texto repetido nem sobreposicao de
  // retangulos. Nas paginas piores (p300: 13 itens) a sobreposicao era 0:
  // nao havia copia nenhuma. Sem prova, ela comia o cabecalho da questao
  // ("Questao 369") e o texto das alternativas inteiras.
  if (remover.size > 0 || provaDeCopia) {
    // A renderizacao antiga e desenhada dentro de uma coluna mais estreita,
    // com fonte maior: os itens dela ficam bem a direita da margem da
    // pagina. Os titulos de secao sao excecao (eles descrevem o documento
    // e o parser precisa deles) e o texto repetido (topico, navegacao) ja
    // foi tratado em 2a.
    const alturas = items.map((item) => item.height).sort((a, b) => a - b);
    const alturaCorpo = alturas[Math.floor(alturas.length / 2)] ?? 0;

    const margens = items.map((item) => item.x);
    const margem = Math.min(...margens);
    const direita = Math.max(...margens);
    const bandaInicio = margem + 45;
    const bandaFim = direita * 0.6;

    for (const item of items) {
      if (remover.has(item)) continue;
      if (item.x < bandaInicio || item.x > bandaFim) continue;
      if (SECTION_TITLE_ITEM.test(item.str.trim())) continue;
      // A copia tem fonte maior que o corpo do texto da pagina.
      if (item.height <= alturaCorpo * 1.1) continue;

      const texto = normalize(item.str);
      if (!texto) continue;
      // Item com o mesmo texto na pagina ja foi resolvido em 2a.
      if ((todos.get(texto) ?? []).length > 1) continue;

      remover.add(item);
    }
  }

  if (remover.size === 0) return { items, removed: false };

  return {
    items: items.filter((item) => !remover.has(item)),
    removed: true,
  };
}

/**
 * Cabecalho corrente das apostilas editoriais ("1. Lingua Portuguesa",
 * "1.2. Acentuacao Grafica"): repete em quase todas as paginas e, em PDF
 * com layout quebrado, gruda no meio do texto do corpo.
 *
 * O que o distingue do topico da questao (que tambem repete) e o formato:
 * o cabecalho comeca com um caminho de secao ("1.2. ..."), o topico nao.
 */
const SECTION_PATH_ITEM = /^\d+(?:\.\d+)*\.?\s+\S/;

/**
 * Numero de pagina no formato "113 / 2706". Costuma vir colado no fim
 * do texto de uma alternativa.
 */
const PAGE_NUMBER_ITEM = /^\d{1,4}\s*\/\s*\d{3,4}$/;

function findFurnitureItems(rawPages: RawItem[][]): Set<string> {
  const total = rawPages.length;
  const counts = new Map<string, number>();

  for (const items of rawPages) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = item.str.trim();
      if (key.length < 4) continue;
      if (!SECTION_PATH_ITEM.test(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minPages = Math.max(3, Math.floor(total * 0.3));
  const furniture = new Set<string>();
  for (const [key, count] of counts) {
    if (count >= minPages) furniture.add(key);
  }
  return furniture;
}

function linesFromItems(items: RawItem[]): ExtractedLine[] {
  return buildLines(items).map(joinLine).filter((line) => line.text.length > 0);
}

export function buildPageLines(items: RawItem[]): ExtractedLine[] {
  return linesFromItems(removeDuplicatedPass(items));
}

/**
 * Monta as paginas do documento inteiro. A montagem e feita em duas
 * etapas porque o cabecalho corrente so pode ser reconhecido depois de
 * ver todas as paginas (ele se repete).
 */
export function buildDocumentPages(rawPages: RawItem[][]): ExtractedPage[] {
  const deduped = rawPages.map(removeDuplicatedPass);
  const furniture = findFurnitureItems(deduped);

  return deduped.map((items, index) => {
    // Duas renderizacoes do mesmo conteudo na mesma pagina.
    // A prova vem da fase anterior: se ela achou um deslocamento de copia
    // nesta pagina, a pagina de fato foi renderizada duas vezes e a 2c
    // (que limpa o que sobrou da copia) tem o que fazer. Sem isso, a 2c
    // so roda se 2a/2b encontraram texto repetido no mesmo bloco.
    const provaDeCopia = rawPages[index].length !== items.length;
    const layout = removeDuplicatedLayout(items, provaDeCopia);
    const final = layout.items;

    return {
      page: index + 1,
      duplicated: layout.removed || undefined,
      lines: linesFromItems(
        final.filter(
          (item) =>
            !furniture.has(item.str.trim()) &&
            !PAGE_NUMBER_ITEM.test(item.str.trim()),
        ),
      ),
    };
  });
}
