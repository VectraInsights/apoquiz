import type { JsonSchema } from "./provider";
import { compareGabaritoKey } from "@/lib/pdf/parser";
import type { Question } from "@/lib/types";

/**
 * Schema de saida da IA. Formato compativel com o responseSchema do
 * Gemini e com json_schema da OpenAI.
 */
export const QUESTIONS_SCHEMA: JsonSchema = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          number: { type: "INTEGER" },
          statement: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                text: { type: "STRING" },
              },
              required: ["label", "text"],
            },
          },
          correct: { type: "STRING" },
          explanation: { type: "STRING" },
          level: { type: "STRING" },
          optionNotes: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                text: { type: "STRING" },
              },
              required: ["label", "text"],
            },
          },
          topic: { type: "STRING" },
        },
        required: [
          "number",
          "statement",
          "options",
          "correct",
          "explanation",
          "topic",
        ],
      },
    },
  },
  required: ["questions"],
};

const BASE_RULES = `Voce processa conteudo de apostilas e provas em portugues do Brasil.

Regras obrigatorias:
- Nao invente questoes, alternativas ou conteudo que nao esteja no material fornecido.
- Limpe o texto: remova numeros de questao, marcacoes (asteriscos, #), cabecalhos, rodapes e a expressao "Resposta:".
- Mantenha o texto original das alternativas e a ORDEM original delas. Nao reescreva o enunciado alem da limpeza.
- "correct" e a LETRA da alternativa correta (A, B, C, D ou E).
- "explanation" e uma justificativa curta (1 a 3 frases) em portugues do Brasil.
- "topic" e a disciplina ou assunto (ex.: "Direito Constitucional", "Matematica", "Quimica").`;

function formatGabarito(gabarito: Record<string, string> | null | undefined) {
  if (!gabarito || Object.keys(gabarito).length === 0) {
    return "Nao ha gabarito oficial disponivel. Resolva cada questao com o seu conhecimento.";
  }
  const entries = Object.entries(gabarito)
    .sort((a, b) => compareGabaritoKey(a[0], b[0]))
    .map(([key, letter]) => `${key}=${letter}`)
    .join(", ");
  return `GABARITO OFICIAL (fonte da verdade - nunca o contradiga, nunca troque a letra):
${entries}

A chave tem o formato SECAO#NUMERO quando o gabarito vem por secao da apostila
(a secao e a disciplina/topic da questao). Use a entrada cuja secao e numero
batam com os da questao. Para as demais, resolva a questao.`;
}

export function buildEnrichPrompt(
  questions: Question[],
  gabarito: Record<string, string> | null,
): string {
  const payload = questions.map((question, index) => ({
    indice: index,
    numero: question.number,
    secao: question.section ?? null,
    enunciado: question.statement,
    topico: question.topic,
    nivel: question.level ?? null,
    alternativas: question.options.map((option) => ({
      letra: option.label,
      texto: option.text,
    })),
  }));

  return `${BASE_RULES}

Tarefa: processe a lista JSON de questoes abaixo e devolva exatamente ${questions.length} questoes, na mesma ordem e com o mesmo numero.

${formatGabarito(gabarito)}

Para cada questao:
- "statement": enunciado limpo, sem o numero na frente.
- "options": as alternativas, na ordem original, com "label" de A em diante.
- "correct": a letra correta.
- "explanation": justificativa breve da resposta CORRETA (2 a 4 frases).
- "level": o nivel de dificuldade, exatamente um destes valores: "facil",
  "medio" ou "dificil". Se o campo "nivel" da questao vier preenchido, MANTENHA
  esse valor. Se vier nulo (o PDF nao informa), classifique voce mesmo pela
  dificuldade real da questao: "facil" quando basta ler o enunciado, "medio"
  quando exige raciocinio sobre o texto, "dificil" quando exige interpretacao
  mais profunda, calculo ou combinacao de conceitos.
- "optionNotes": analise de CADA alternativa (A a E), em uma frase cada,
  explicando por que ela esta correta ou incorreta. Ex.:
  [{"label":"A","text":"Incorreta. Trata de dupla negacao."}, ...].
  Use [] se nao for possivel justificar as alternativas.
- "topic": disciplina/topico, escrito por extenso. Se o "topico" vier com letras
  separadas por espaco (ex.: "E T I C A S N O S E R V I C O"), junte as letras
  e reconstrua as palavras.

Questoes em JSON:
${JSON.stringify(payload, null, 1)}`;
}

export function buildExtractPrompt(
  text: string,
  gabarito: Record<string, string> | null,
): string {
  return `${BASE_RULES}

Tarefa: identifique TODAS as questoes de multiple escolha presentes no texto abaixo.

Regras especificas:
- Cada questao precisa de pelo menos 2 alternativas identified por letra (A, B, C, D, E).
- Se o enunciado mencionar um texto de apoio maior, inclua-o no enunciado.
- "number" e o numero da questao como aparece no material (0 se nao houver).
- Se nao houver gabarito no material, resolva a questao.

${formatGabarito(gabarito)}

TEXTO DO PDF:
"""
${text}
"""`;
}
