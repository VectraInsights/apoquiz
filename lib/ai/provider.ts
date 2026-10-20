import "server-only";

/**
 * Camada de integracao com provedores de IA.
 *
 * A chave fica sempre no servidor (Vercel) - nunca no bundle do browser.
 * O provedor e escolhido por variavel de ambiente:
 *  - GEMINI_API_KEY  -> Google Gemini (padrao)
 *  - OPENAI_API_KEY  -> qualquer endpoint compativel com a API da OpenAI
 */

export type JsonSchema = Record<string, unknown>;

export type AIProvider = {
  name: string;
  model: string;
  complete(prompt: string, schema: JsonSchema): Promise<unknown>;
};

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function hasAIProvider(): boolean {
  return Boolean(env("GEMINI_API_KEY") || env("OPENAI_API_KEY"));
}

/**
 * Modelos do Gemini na ordem de preferencia.
 *
 * O 2.5 so continua disponivel para quem ja usou o modelo antes - em
 * contas novas a API responde 404 e recomenda os modelos 3.x. A lista
 * abaixo cobre a virada de geracao e ainda deixa o app funcionando se
 * a Google aposentar algum deles.
 */
const GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

export function getProvider(): AIProvider | null {
  const geminiKey = env("GEMINI_API_KEY");
  if (geminiKey) {
    const configured = env("GEMINI_MODEL");
    const model =
      configured && !GEMINI_MODELS.includes(configured)
        ? configured
        : GEMINI_MODELS[0];

    return {
      name: "gemini",
      model,
      complete: (prompt, schema) => completeGemini(prompt, schema, geminiKey, model),
    };
  }

  const openaiKey = env("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      name: "openai",
      model: env("OPENAI_MODEL") ?? "gpt-4o-mini",
      complete: (prompt, schema) => completeOpenAI(prompt, schema, openaiKey),
    };
  }

  return null;
}

/* ------------------------------------------------------------------ */

async function completeGemini(
  prompt: string,
  schema: JsonSchema,
  apiKey: string,
  model: string,
): Promise<unknown> {
  const base =
    env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";

  // O modelo configurado vem primeiro; depois, os fallbacks da familia 3.x.
  const candidates = [
    model,
    ...GEMINI_MODELS.filter((item) => item !== model),
  ];

  let lastError = `Gemini: nao foi possivel falar com a API.`;

  for (const candidate of candidates) {
    const result = await callGeminiModel(base, candidate, prompt, schema, apiKey);

    if (result.ok) return result.data;

    lastError = result.error;

    // 404 = modelo indisponivel para esta conta: tenta o proximo.
    if (result.status !== 404) break;
  }

  throw new Error(lastError);
}

/**
 * Uma chamada ao Gemini, com espera automatica quando o tier free
 * estoura o limite de requisicoes (429).
 */
async function callGeminiModel(
  base: string,
  model: string,
  prompt: string,
  schema: JsonSchema,
  apiKey: string,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; error: string }> {
  const MAX_TENTRIES = 4;

  for (let attempt = 1; attempt <= MAX_TENTRIES; attempt += 1) {
    const response = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini devolveu uma resposta vazia.");
      return { ok: true, data: parseJson(text) };
    }

    const detail = await response.text();
    const error = `Gemini ${response.status} (${model}): ${detail.slice(0, 300)}`;

    // 429 = limite do tier free. Espera e tenta de novo.
    if (response.status === 429 && attempt < MAX_TENTRIES) {
      const wait = 2000 * attempt + Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }

    return { ok: false, status: response.status, error };
  }

  return {
    ok: false,
    status: 429,
    error: `Gemini 429 (${model}): limite de requisicoes do tier free excedido.`,
  };
}

async function completeOpenAI(
  prompt: string,
  schema: JsonSchema,
  apiKey: string,
): Promise<unknown> {
  const model = env("OPENAI_MODEL") ?? "gpt-4o-mini";
  const base = env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Voce extrai questoes de prova. Responda SEMPRE com JSON valido no formato pedido.",
        },
        { role: "user", content: `${prompt}\n\nJSON Schema esperado:\n${JSON.stringify(schema)}` },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("O provedor devolveu uma resposta vazia.");
  return parseJson(text);
}

function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Nao foi possivel interpretar a resposta da IA como JSON.");
  }
}
