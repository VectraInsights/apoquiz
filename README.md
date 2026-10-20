# ApoQuiz

> Suba o PDF da sua apostila de questões. O site identifica as questões, as
> alternativas e o gabarito — e monta um quiz interativo com correção
> instantânea, explicações e revisão comentada.

Deploy: [Vercel](https://vercel.com) · Next.js 16 (App Router) · TypeScript · Tailwind CSS 4

---

## Como funciona

```
PDF ──► navegador (pdf.js) ──► parser heurístico ──┬─► gabarito do PDF
                            │                     └─► IA (opcional)
                            └──► questões + alternativas + tópico
                                          │
                                          ▼
                            quiz interativo + gabarito + revisão
```

1. **Leitura no navegador** — o PDF é processado com o [pdf.js](https://mozilla.github.io/pdf.js/)
   dentro do cliente. O arquivo **não** é enviado para o servidor.
2. **Parser heurístico** (`lib/pdf/parser.ts`) — identifica o enunciado, as
   alternativas e o gabarito. Suporta os formatos mais comuns:
   - `a)`, `(B)`, `C.`, `D -`, `IV)`
   - `A texto` (letra + espaço, com indentação usada para separar a
     alternativa da continuação do texto)
   - Gabarito em grade (`1-B 2-C 3-A`), em colunas (`1  B`), por número
     (`Questão 12: C`) e inline (`Resposta: C`)
   - **Apostilas editoriais** (ex.: Qconcursos, Estratégia): o documento é
     indexado por seções numeradas (`1.1.1 Questões Fáceis`,
     `1.1.4 Gabaritos e Comentários`). O gabarito é lido de cada seção de
     comentários no formato `A alternativa correta é a C` e guardado por
     `capitulo#numero`, porque o número da questão reinicia a cada capítulo.
     Nesses PDFs o gabarito costuma vir **espalhado** pelo documento, e não
     em um bloco único no final.
   - **Comentários do PDF**: quando a apostila traz a resolução comentada, o
     app também lê a **explicação da resposta correta** e a **análise de cada
     alternativa** (`Times (A) Incorreta. …` / `Check (C) Correta. …`).
     O que o PDF traz tem sempre prioridade sobre a IA.
3. **IA (opcional)** — quando há `GEMINI_API_KEY` no servidor, a IA limpa os
   enunciados, escreve a explicação de cada questão e **resolve** as
   questões que não têm gabarito. Quando o PDF tem gabarito, ele sempre
   prevalece sobre a IA.
4. **Quiz** — correção instantânea, paleta de navegação, marcador de
   revisão, cronômetro opcional, resultado por assunto e gabarito imprimível.

---

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # opcional: configure a chave da IA
npm run dev
```

Abra <http://localhost:3000>.

### Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Sobe o build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sem emitir |
| `npm run check:pdf -- <arquivo.pdf>` | Mostra como o parser interpretou um PDF (debug) |
| `npm run check:pdf -- <arquivo.pdf> --dump 3` | Mostra o texto reconstruído da página 3 (com x) |
| `npm run check:pdf -- <arquivo.pdf> --find gabarito` | Busca um termo no documento |
| `npm run cache:pdf -- <arquivo.pdf> <cache.json>` | Extrai as linhas uma vez e cacheia (PDFs grandes) |

> O `check:pdf` é a ferramenta para depurar apostilas: ela imprime o texto
> reconstruído de cada página (`--dump 3`), busca um termo (`--find gabarito`)
> e mostra as questões extraídas com o gabarito aplicado.

---

## Configuração da IA (opcional)

Sem nenhuma chave o app **continua funcionando**: usa apenas o gabarito
detectado no PDF. Com uma chave, ganha explicações e resolve questões sem
gabarito.

Copie `.env.example` para `.env.local`:

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
```

Ou qualquer endpoint compatível com a API da OpenAI:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Na **Vercel**: `Project → Settings → Environment Variables` → adicione
`GEMINI_API_KEY` e faça um novo deploy.

> A chave fica somente no servidor (Route Handler). Nunca é exposta no bundle
> do navegador.

---

## Login com Google e sincronização (opcional)

Sem configuração, os quizzes ficam **só neste aparelho** (localStorage).
Com o Supabase configurado, aparece o botão **"Entrar com Google"** e os
quizzes passam a ser sincronizados — dá para começar no celular e
continuar no computador.

### Passo a passo

1. Crie o projeto em <https://supabase.com/dashboard>.
2. **SQL Editor** → cole o conteúdo de `lib/supabase/schema.sql` → *Run*.
   Isso cria as tabelas `quizzes`, `quiz_questions` e `quiz_states` com
   RLS (cada usuário só enxerga o que é dele).
3. **Authentication → Providers → Google**: ative o provider e cole o
   *Client ID* e o *Client Secret* do Google Cloud Console.
4. **Authentication → URL Configuration → Redirect URLs**: adicione
   `http://localhost:3000` e a URL da Vercel.
5. Em **Project → API Keys**, copie a URL e a chave `anon`.
6. Preencha no `.env.local` (e nas variáveis da Vercel):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### O que vai para a nuvem

| Item | Vai para o servidor? |
| --- | --- |
| O **PDF** | ❌ nunca — é lido e descartado no navegador |
| Enunciados, alternativas, gabarito, explicações | ✅ (JSON do quiz extraído) |
| Suas respostas e o progresso | ✅ (sincronizado) |

O processamento do PDF continua 100% no cliente; só o resultado vai para
a nuvem, no formato do quiz pronto.

### Modo local × nuvem

| | Sem login | Com login |
| --- | --- | --- |
| Onde fica | `localStorage` deste aparelho | Supabase |
| Aparece em outro aparelho | ❌ | ✅ |
| Funciona sem internet (depois de aberto) | ✅ | ⚠️ precisa de internet para sincronizar |

A chave `service_role` **não** é necessária — todas as operações usam a
chave `anon` com RLS ativa.

---

## Deploy na Vercel

1. Conecte o repositório na Vercel (framework detectado: Next.js).
2. Adicione `GEMINI_API_KEY` em *Environment Variables* (opcional).
3. Deploy. O `prebuild` copia o worker do pdf.js para `/public`
   automaticamente.

Não há configuração extra: sem variáveis de ambiente a aplicação sobe do
mesmo jeito, apenas sem o enriquecimento por IA.

---

## Estrutura

```
app/
  api/extract/route.ts      Route Handler: extrai/valida com a IA
  api/status/route.ts       Diz ao cliente se há IA configurada
  globals.css               Design system (Tailwind 4 + tema)
  layout.tsx / page.tsx
components/
  quiz-app.tsx              Orquestra as telas
  upload-zone.tsx           Drag & drop do PDF
  setup-panel.tsx           Configurações + revisão do gabarito
  quiz-player.tsx           Quiz em andamento
  results-panel.tsx         Resultado, revisão e exportação
  option-notes.tsx          "Por que cada alternativa" (do PDF ou da IA)
  auth-button.tsx           Entrar/sair com o Google
lib/
  pdf/lines.ts              Reconstrução de linhas a partir do pdf.js
  pdf/extract.ts            Extração de texto (navegador)
  pdf/parser.ts             Parser de questões, alternativas e gabarito
  ai/provider.ts            Gemini / OpenAI-compatible (servidor)
  ai/prompts.ts             Prompts e schema de saída
  ai/extract.ts             Lotes, merge e aplicação do gabarito
  client/pipeline.ts        Pipeline completo no cliente
  supabase/client.ts        Cliente do Supabase (navegador)
  supabase/use-auth.ts      Hook de login com Google
  supabase/schema.sql       Tabelas + RLS (rode no SQL Editor)
  sync.ts                   Persistência: local (localStorage) ou nuvem
  storage.ts                Metadados e quizzes no localStorage
  quiz.ts / sample.ts       Regras do quiz e quiz de exemplo
scripts/
  copy-pdf-worker.mjs       Copia o worker do pdf.js para /public
  check-pdf.ts              Ferramenta de debug do parser
  check-resolutions.ts      Confere as resoluções lidas do PDF
  cache-lines.ts            Cacheia as linhas extraídas (PDFs grandes)
```

---

## Limitações conhecidas

- **PDF escaneado (imagem)** não funciona — é necessário um PDF com texto
  selecionável. O app detecta e avisa.
- O parser é heurístico. Por isso a tela de **revisão do gabarito** existe:
  sempre confira e ajuste a alternativa correta antes de começar.
- A IA processa no máximo 150 questões por PDF (proteção de custo). Acima
  disso a apostila segue **completa**: apenas as questões restantes ficam
  sem a explicação da IA — o gabarito lido do PDF vale para todas.
- A API de extração tem limite de 40 requisições a cada 10 minutos por IP.

---

## Licença

MIT
