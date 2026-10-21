/**
 * Despeja os itens brutos de uma pagina (com coordenadas), para
 * entender o layout real do PDF.
 *
 *   npx tsx scripts/dump-items.ts <pdf> <pagina>
 */
import { readFile } from "node:fs/promises";

async function main() {
  const path = process.argv[2];
  const alvo = Number(process.argv[3] ?? 1);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(path));
  const doc = await (await pdfjs.getDocument({ data, useSystemFonts: true })).promise;

  const page = await doc.getPage(alvo);
  const content = await page.getTextContent();

  const itens = content.items
    .filter((raw): raw is typeof raw & { str: string } => "str" in raw && raw.str.trim() !== "")
    .map((raw, i) => {
      const t = raw.transform as number[];
      return {
        i,
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        h: Math.abs(t[3] ?? 0) || raw.height || 10,
        str: raw.str,
      };
    });
  const ordenados = process.env.STREAM === "1" ? itens : [...itens].sort((a, b) => b.y - a.y || a.x - b.x);

  console.log(`pagina ${alvo}: ${itens.length} itens`);
  for (const item of ordenados) {
    console.log(
      `#${String(item.i).padStart(3)} y=${item.y.toFixed(1).padStart(7)} x=${item.x.toFixed(1).padStart(6)} h=${item.h.toFixed(1)} | ${item.str}`,
    );
  }
}

void main();
