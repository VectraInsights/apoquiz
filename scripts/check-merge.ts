/** Testa a juncao de varios PDFs (numeracao, capitulo e gabarito). */
import { mesclarLeituras } from "@/lib/client/pipeline";

type Q = {
  id: string;
  number: number | null;
  statement: string;
  options: { label: string; text: string }[];
  correct: string | null;
  explanation: string | null;
  optionNotes: Record<string, string>;
  topic: string | null;
  level: null;
  answerSource: "gabarito" | "ia" | "desconhecida";
  page: number;
  section: string | null;
};

function questao(n: number, secao: string, correta: string | null): Q {
  return {
    id: `q${n}`,
    number: n,
    statement: `enunciado ${n}`,
    options: [{ label: "A", text: "a" }],
    correct: correta,
    explanation: null,
    optionNotes: {},
    topic: "TEMA",
    level: null,
    answerSource: correta ? "gabarito" : "desconhecida",
    page: 1,
    section: secao,
  };
}

// --- um PDF so ---
const um = mesclarLeituras([
  {
    questions: [questao(1, "1.2", "A"), questao(2, "1.2", "B")],
    gabarito: { "1.2#1": "A", "1.2#2": "B" },
    diagnostics: null as never,
    evidence: "",
    pageCount: 1,
    text: "",
  },
]);
console.log("=== 1 PDF ===");
console.log("numeros:", um.questions.map((q) => q.number).join(","));
console.log("secoes:", um.questions.map((q) => q.section).join(","));
console.log("gabarito:", JSON.stringify(um.gabarito));

// --- dois PDFs com o mesmo capitulo (o caso que colidiria) ---
const dois = mesclarLeituras([
  {
    questions: [questao(1, "1.2", "A"), questao(2, "1.2", "B")],
    gabarito: { "1.2#1": "A", "1.2#2": "B" },
    diagnostics: null as never,
    evidence: "",
    pageCount: 1,
    text: "",
  },
  {
    questions: [questao(1, "1.2", "C"), questao(2, "1.2", "D")],
    gabarito: { "1.2#1": "C", "1.2#2": "D" },
    diagnostics: null as never,
    evidence: "",
    pageCount: 1,
    text: "",
  },
]);
console.log("\n=== 2 PDFs (mesmo capitulo) ===");
console.log("numeros:", dois.questions.map((q) => q.number).join(","));
console.log("secoes:", dois.questions.map((q) => q.section).join(","));
console.log("gabarito:", JSON.stringify(dois.gabarito));

// a resposta de cada pergunta bate com a chave do gabarito?
const bate = dois.questions.every((q) => {
  const chave = q.section ? `${q.section}#${q.number}` : String(q.number);
  return dois.gabarito[chave] === q.correct;
});
console.log("todas as respostas batem com o gabarito:", bate);
