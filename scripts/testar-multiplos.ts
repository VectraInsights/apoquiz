/** Testa o processPdfs com dois PDFs: as questoes devem vir juntas com topicos baseados no nome do arquivo. */
import { readFile } from "node:fs/promises";

import { processPdfs } from "@/lib/client/pipeline";

async function main() {
  const paths = process.argv.slice(2);
  const files = await Promise.all(
    paths.map(async (path) => {
      const buffer = await readFile(path);
      const name = path.split("\\").pop() ?? "arquivo.pdf";
      return new File([new Uint8Array(buffer)], name, {
        type: "application/pdf",
      });
    }),
  );

  const outcome = await processPdfs(files, (stage) => {
    process.stdout.write(`\r${stage.label}`.padEnd(90));
  });

  console.log("\n");
  console.log("arquivos:", files.length);
  console.log("questoes:", outcome.questions.length);
  console.log("com resposta:", outcome.questions.filter((q) => q.correct).length);
  console.log("paginas:", outcome.pageCount);
  console.log("numeros:", outcome.questions.map((q) => q.number).join(",").slice(0, 90));
  console.log(
    "topicos:",
    [...new Set(outcome.questions.map((q) => q.topic))].join(" | ").slice(0, 120),
  );
  console.log("gabarito:", Object.keys(outcome.detectedGabarito).length, "chaves");
  console.log(
    "exemplo:",
    outcome.questions[0]?.number,
    outcome.questions[0]?.correct,
    outcome.questions[0]?.statement.slice(0, 60),
  );
  console.log(
    "avisos:",
    outcome.diagnostics?.warnings.map((w) => w.text.slice(0, 70)).join(" // ") || "nenhum",
  );
}

void main();