/**
 * Reconstrucao de linhas a partir dos itens de texto do PDF.
 *
 * O pdf.js devolve cada "pedaco" de texto com sua posicao. Aqui agrupamos
 * os pedacos em linhas (pela baseline) e reconstruimos os espacos usando a
 * distancia horizontal entre eles. O `x` inicial de cada linha e preservado
 * porque a indentacao e um sinal forte para distinguir:
 *   - o inicio de uma alternativa ("A ...")
 *   - a continuacao de um texto indentado
 */

export type RawItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExtractedLine = {
  text: string;
  /** posicao horizontal do primeiro item da linha */
  x: number;
};

export type ExtractedPage = {
  page: number;
  lines: ExtractedLine[];
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

  // publishers usam espacamento entre letras em titulos. Nesses casos o
  // espaco "real" e bem maior que o espacamento entre letras, entao
  // usamos um limiar relativo a media dos vaos da propria linha.
  const gaps: number[] = [];
  for (let i = 1; i < items.length; i += 1) {
    gaps.push(items[i].x - (items[i - 1].x + items[i - 1].width));
  }
  const shortItems = items.filter((item) => item.str.trim().length <= 2).length;
  const meanGap =
    gaps.length > 0 ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
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
    }

    out += item.str;
    prev = item;
  }

  return {
    text: out.replace(/\s+/g, " ").trim(),
    x: Math.min(...items.map((item) => item.x)),
  };
}

export function buildPageLines(items: RawItem[]): ExtractedLine[] {
  return buildLines(items)
    .map(joinLine)
    .filter((line) => line.text.length > 0);
}
