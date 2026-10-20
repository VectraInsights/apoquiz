/**
 * Copia o worker do pdf.js para /public para que possa ser carregado
 * em runtime pelo navegador sem depender de magic imports do bundler.
 *
 * Executado automaticamente via `predev` e `prebuild`.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const candidates = [
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.mjs"),
];

const target = join(root, "public", "pdf.worker.min.mjs");

let source = null;
for (const candidate of candidates) {
  try {
    await stat(candidate);
    source = candidate;
    break;
  } catch {
    // tenta o proximo
  }
}

if (!source) {
  console.error("[pdf-worker] pdfjs-dist nao encontrado. Rode `npm install` antes.");
  process.exit(1);
}

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`[pdf-worker] copiado para ${target}`);
