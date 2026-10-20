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

export function getProvider(): AIProvider | null {
  const geminiKey = env("GEMINI_API_KEY");
  if (geminiKey) {
    return {
      name: "gemini",
      model: env("GEMINI_MODEL") ?? "gemini-2.5-flash",
      complete: (prompt, schema) => completeGemini(prompt, schema, geminiKey),
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
): Promise<unknown> {
  const provider = getProvider();
  const model = provider?.model ?? "gemini-2.5-flash";
  const base = env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";

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

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini devolveu uma resposta vazia.");
  return parseJson(text);
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
