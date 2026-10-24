/** Compara as questoes lidas com as chaves do gabarito. */
import { readFile } from "node:fs/promises";
import type { ExtractedPage } from "@/lib/pdf/lines";
import { parseQuestions, detectGabarito } from "@/lib/pdf/parser";

async function main() {
  const file = process.argv[2] ?? "lines-cache.json";
  const pages = JSON.parse(await readFile(file, "utf8")) as ExtractedPage[];
  const qs = parseQuestions(pages);
  const g = detectGabarito(pages);

  const lidas = new Set(qs.filter((q) => q.number !== null).map((q) => `${q.section}#${q.number}`));
  const gabKeys = Object.keys(g.gabarito);
  const faltando = gabKeys.filter((k) => !lidas.has(k));

  console.log(`questoes lidas: ${qs.length}`);
  console.log(`chaves gabarito: ${gabKeys.length}`);
  console.log(`faltando: ${faltando.length}`);
  console.log(`amostra faltando: ${faltando.slice(0, 25).join(" ")}`);

  // Onde comeca a queda? distribuicao por capitulo
  const porCap = new Map<string, { lidas: number; total: number }>();
  for (const k of gabKeys) {
    const cap = k.split("#")[0];
    const cur = porCap.get(cap) ?? { lidas: 0, total: 0 };
    cur.total += 1;
    if (lidas.has(k)) cur.lidas += 1;
    porCap.set(cap, cur);
  }
  const ruins = [...porCap.entries()].filter(([, v]) => v.lidas < v.total).slice(0, 12);
  console.log("capitulos com falta:");
  for (const [cap, v] of ruins) console.log(`  ${cap}: ${v.lidas}/${v.total}`);

  // numeracao lida dentro de cada capitulo
  const nums = qs.filter((q) => q.number !== null && q.section === "1.1").map((q) => q.number).sort((a,b)=>a!-b!);
  console.log(`1.1 lidas: ${nums.length} -> ${nums.slice(0, 40).join(",")} ... ${nums.slice(-5).join(",")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
