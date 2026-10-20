/**
 * Extracao de texto de PDF executada 100% no navegador (pdf.js).
 *
 * O texto e lido no cliente: o PDF nunca e enviado para o servidor.
 * A reconstrucao de linhas vive em `lines.ts` (compartilhada com o
 * script de desenvolvimento `scripts/check-pdf.ts`).
 */

import { buildDocumentPages, type ExtractedPage, type RawItem } from "./lines";

export type { ExtractedPage, ExtractedLine } from "./lines";

export type ExtractedDocument = {
  pages: ExtractedPage[];
  /** Texto completo com separador de pagina */
  text: string;
  pageCount: number;
  charCount: number;
  /** true quando nao ha texto (PDF escaneado / imagem) */
  isProbablyScanned: boolean;
};

const WORKER_SRC = "/pdf.worker.min.mjs";

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
  return pdfjs;
}

export async function extractPdfText(
  data: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
): Promise<ExtractedDocument> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;

  const rawPages: RawItem[][] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    const items: RawItem[] = [];
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const str = raw.str;
      if (!str || !str.trim()) continue;

      const transform = raw.transform as number[];
      items.push({
        str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        width: raw.width ?? 0,
        height: Math.abs(transform[3] ?? 0) || raw.height || 10,
      });
    }

    rawPages.push(items);
    onProgress?.(pageNumber, doc.numPages);
    page.cleanup();
  }

  // As paginas so podem ser montadas depois de ler todas: o cabecalho
  // corrente da apostila e reconhecido pela repeticao entre paginas.
  const pages: ExtractedPage[] = buildDocumentPages(rawPages);
  const charCount = pages.reduce(
    (total, page) =>
      total + page.lines.reduce((sum, line) => sum + line.text.length, 0),
    0,
  );

  await loadingTask.destroy();

  const text = pages
    .map((p) => `--- pagina ${p.page} ---\n${p.lines.map((l) => l.text).join("\n")}`)
    .join("\n\n");

  return {
    pages,
    text,
    pageCount: pages.length,
    charCount,
    // menos de 120 caracteres por pagina costuma indicar PDF de imagem
    isProbablyScanned: pages.length > 0 && charCount / pages.length < 120,
  };
}
