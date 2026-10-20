# Histórico de desenvolvimento — ApoQuiz

Registro cronológico de tudo o que foi feito no app, com o motivo de cada
decisão e os problemas encontrados durante os testes.

**Repositório:** https://github.com/VectraInsights/apoquiz
**Início:** 19/10/2026

---

## 1. Escopo definido

Antes de escrever código, três decisões foram tomadas com o usuário:

| Tema | Decisão |
| --- | --- |
| Gabarito | Detectar no PDF **e** usar IA para resolver o que faltar |
| Stack | Next.js (App Router) |
| Uso | Upload livre de PDF por qualquer visitante |

O app nasce como **ApoQuiz** (nome alterado durante o projeto — ver §9).

---

## 2. Scaffold do projeto

Criado com `create-next-app@latest`:

```bash
npx create-next-app@latest apostila-quiz --ts --tailwind --app --eslint \
  --no-src-dir --import-alias "@/*" --use-npm --yes --turbopack
```

**Next.js 16.4.2** — versão com breaking changes em relação ao modelo
treinado. O `AGENTS.md` gerado pede a leitura de `node_modules/next/dist/docs/`
antes de codar. Documentos lidos:

- `01-getting-started/15-route-handlers.md` — Route Handlers, cache, `RouteContext`
- `02-guides/interactive-apps.md` — `useOptimistic`, `useTransition`, `data-pending`
- `02-guides/environment-variables.md` — `.env*`, `NEXT_PUBLIC_`, runtime env
- `02-guides/upgrading/version-16.md` — breaking changes
- `03-file-conventions/route.md` e `02-route-segment-config/maxDuration.md`

### Dependências adicionadas

| Pacote | Versão | Motivo |
| --- | --- | --- |
| `pdfjs-dist` | 6.4.299 | Leitura e extração de texto do PDF no navegador |
| `lucide-react` | 1.59 | Ícones |
| `server-only` | 0.0.1 | Garante que o código de IA nunca entre no bundle do cliente |
| `tsx` (dev) | — | Rodar o script de debug do parser em Node |

O `next.config.ts` já veio com `cacheComponents: true` e
`partialPrefetching: true` — mantidos.

---

## 3. Design system

`app/globals.css` reescrito do zero sobre Tailwind CSS 4 (sistema `@theme`):

- Paleta própria (`--color-canvas`, `--color-panel`, `--color-brand`, …)
- Gradientes radiais no `body` (roxo no topo-esquerda, verde no topo-direita)
- Componentes em `@layer components`: `.panel`, `.panel-soft`, `.btn`
  (`.btn-primary`, `.btn-ghost`), `.chip`, `.option` (com `data-state` para
  correta/errada/selecionada), `.bubble`
- Scrollbar discreta
- `@media print` com `.no-print` e `.print-break` para o gabarito impresso

`app/layout.tsx`: fontes `Inter` (texto) + `Instrument Serif` (display, itálico
nos títulos), `lang="pt-BR"`, metadata e Open Graph.

---

## 4. Núcleo de parsing do PDF

O coração do app. Todo o PDF é lido **no navegador** — o arquivo nunca é
enviado ao servidor.

### 4.1 `lib/pdf/lines.ts`

Reconstrução de linhas a partir dos itens de texto do pdf.js. O pdf.js
devolve "pedaços" com posição; sem reconstruir, o parser não reconheceria
`a)`, `Gabarito`, etc.

- Agrupa itens por baseline (`transform[5]`) com tolerância proporcional à
  altura da fonte
- Insere espaço entre itens quando o vão horizontal supera o limiar
- **Preserva o `x` inicial de cada linha** — a indentação é a chave para
  distinguir o início de uma alternativa da continuação de um texto
- Detecta linhas com **espaçamento entre letras** (títulos editoriais):
  quando a maioria dos itens tem 1–2 caracteres e o vão médio está entre
  10% e 45% da altura da fonte, o limiar passa a ser relativo à média dos
  vãos da própria linha

### 4.2 `lib/pdf/extract.ts`

Extração no cliente com `pdfjs-dist/build/pdf.min.mjs`. O worker é copiado
para `/public` pelo script `prebuild` (`scripts/copy-pdf-worker.mjs`) em vez
de depender de *magic imports* do bundler — determinístico em dev e na Vercel.

Detecta PDF escaneado (menos de 120 caracteres por página) e avisa o usuário.

### 4.3 `lib/pdf/parser.ts`

O arquivo mais complexo do projeto. Reconhece:

**Alternativas**
- explícitas: `a)`, `(B)`, `C.`, `D -`, `IV)`
- implícitas: `A texto` — letra + espaço. Aqui a **indentação decide**: o
  parser calcula o `x` modal das linhas candidatas e só aceita como
  alternativa as que estão nesse alinhamento (±3 pt). Sem isso, um enunciado
  começando com "A consolidação urbana…" seria lido como a alternativa A

**Gabarito** (fonte primária da resposta correta)
- grade: `1-B  2-C  3-A`
- parêntese: `1) B  2) C`
- colunas: `1  B`
- por número: `Questão 12: C`
- inline: `Resposta: C`

Detecta a seção de gabarito pelo cabeçalho (`Gabarito`, `Respostas`,
`Chave de respostas`); sem cabeçalho, procura uma grade de pares no fim do
documento. O mapeamento usa o **número** da questão quando há correspondência
(≥50% de acerto) e cai para o **posicional** quando não há.

**Ruído filtrado** (linhas que não são enunciado)
- cabeçalho corrente: `1. Conhecimentos Gerais … Físicos, …`
- marcador de dificuldade: `2 ○ ○ ○ FÁCIL`
- interface editorial: `LIGHTBULB Tente resolver antes de conferir EYE VER GABARITO E COMENTÁRIOS`
- paginação: `7 / 538`
- linhas decorativas

**Tópico** — linhas em caixa alta (`ASPECTOS GEOGRÁFICOS, HISTÓRICOS, …`)
viram o campo `topic`, usado no filtro por assunto.

---

## 5. Camada de IA

O gabarito do PDF **sempre prevalece**. A IA entra para limpar o enunciado,
escrever a explicação de cada questão e resolver o que não tem gabarito.

- `lib/ai/provider.ts` — abstração com dois provedores:
  - **Gemini** (padrão): `x-goog-api-key`, `responseMimeType: application/json`
    + `responseSchema` (saída estruturada garantida)
  - **OpenAI-compatible**: `response_format: json_object` (funciona em Groq,
    OpenRouter, OpenAI)
- `lib/ai/prompts.ts` — prompt em português + schema JSON de saída
- `lib/ai/extract.ts` — lotes de 12 questões, 3 chamadas em paralelo,
  mesclagem por índice, gabarito do PDF sobrescreve a resposta da IA
- `app/api/extract/route.ts` — Route Handler com:
  - limite de 40 requisições / 10 min por IP
  - `maxDuration = 60`
  - 503 com código `NO_AI_PROVIDER` quando não há chave (o cliente cai no
    modo local)
- `app/api/status/route.ts` — informa o cliente se há IA configurada

Limite de 150 questões por PDF (proteção de custo).

---

## 6. Interface

| Componente | Função |
| --- | --- |
| `components/quiz-app.tsx` | Orquestra as telas e o estado (`upload → processing → setup → quiz → results`) |
| `components/upload-zone.tsx` | Drag & drop do PDF + botão de quiz de exemplo |
| `components/setup-panel.tsx` | Título, modo de resposta, tempo limite, filtro por assunto e **revisão do gabarito** (clique na alternativa para corrigir) |
| `components/quiz-player.tsx` | Quiz: progressão, paleta de navegação, marcador, cronômetro, atalhos de teclado, correção instantânea |
| `components/results-panel.tsx` | Score, desempenho por assunto, revisão comentada, impressão e exportação JSON |
| `components/ui.tsx` | `Logo`, `Stat`, `Toggle`, `Badge`, `ProgressBar` |

Recursos: embaralhar questões/alternativas, correção instantânea ou no fim,
cronômetro opcional, filtro por assunto, histórico no `localStorage`, atalhos
`A–E` / `1–5` / setas, e gabarito imprimível (CSS de impressão).

---

## 7. Testes com PDFs reais

### Ferramenta de debug: `scripts/check-pdf.ts`

```bash
npm run check:pdf -- <arquivo.pdf>            # questões + gabarito extraídos
npm run check:pdf -- <arquivo.pdf> --dump 3   # texto reconstruído da página 3 (com x)
npm run check:pdf -- <arquivo.pdf> --find gabarito
```

Usa a **mesma** lógica de linha do navegador (`lib/pdf/lines.ts`), então o
debug reflete exatamente o que o app faz.

### PDF de teste (com gabarito)

Gerado com `reportlab` para simular uma apostila: 10 questões com `a)`…`e)` e
uma página final com `GABARITO` e a grade `1-C 2-A 3-B …`.

```
=> 10 questoes, 10 com resposta, 0 sem resposta
```

Todas as 10 letras conferidas com o gabarito original. ✅

### PDF real do usuário (`1.pdf`, 32 páginas, apostila editorial)

Estrutura real encontrada:

```
Questão 2
2 ○ ○ ○ FÁCIL
ASPECTOS GEOGRÁFICOS, HISTÓRICOS, FÍSICOS, ECONÔMICOS, SOCI- …
No contexto das pesquisas censitárias do IBGE, o conceito de
'População Residente' é fundamental para a contagem oficial…
A Conjunto de pessoas que têm o município como seu local habitual de residência
na data de referência do Censo.
B Conjunto de pessoas que estavam presentes no domicílio…
```

```
=> 43 questoes, 0 com resposta, 43 sem resposta
```

43/43 questões detectadas com enunciado e alternativas corretos. Zero
respostas porque **este PDF não contém o gabarito** — é a seção de questões
do livro (32 páginas de um volume de 538); a resolução comentada fica em
outra parte. Nesse caso a IA entra para resolver.

### Teste de ponta a ponta no navegador

Upload → setup → quiz → resultados, validado com o navegador real:

- 43 questões extraídas do `1.pdf`
- aviso "Sem chave de IA no servidor" exibido corretamente
- filtro por assunto populado (2 tópicos, com contagem)
- 10/10 questões com gabarito no PDF de teste, badge "Do PDF" em cada uma
- correção instantânea: "Boa! Você acertou." e placar 1/10
- resultado: 10% de acerto, 1 acerto, 0 erros, 9 sem resposta
- revisão final destaca a alternativa correta e a resposta do usuário

---

## 8. Bugs encontrados e corrigidos

Todos descobertos durante os testes com PDFs reais.

| # | Problema | Causa | Correção |
| --- | --- | --- | --- |
| 1 | `TypeError: Cannot read properties of undefined (reading 'toUpperCase')` | `String.match` com regex `/g/` retorna **todos** os matches, não o primeiro — o grupo de captura vinha `undefined` | Trocado por `RegExp.exec()` com `lastIndex = 0` |
| 2 | Gabarito de um PDF não era detectado | `RegExp.test()` com `/g/` avança `lastIndex` entre chamadas | `lastIndex = 0` antes de cada `test()` |
| 3 | **0 questões** extraídas de um PDF com `a) b) c)` | O regex de alternativa exigia `(` antes do `)`, ou seja, não cobria `a)` | Regex reescrita com alternativa própria para `X)` |
| 4 | Alternativas em numeral romano (`I)`, `II.`) | Mesma limitação do item 3 | Idem |
| 5 | Questões "sumiam" entre páginas | Um cabeçalho `Questão 2` após `Questão 12` era lido como continuação do enunciado | Antes de descartar, tenta recuperar as alternativas implícitas: se a questão anterior tem alternativas, ela **está** completa e a nova é legítima |
| 6 | Enunciado começando com "A " virava alternativa A | Detecção por regex não distinguia enunciado de alternativa | Alinhamento modal do `x` das candidatas (±3 pt) |
| 7 | Cabeçalho corrente `1. Conhecimentos Gerais …` virava questão 1 | Casava com o padrão de número + separador | Regra de ruído `RUNNING_HEADER` (termina em `…`) |
| 8 | `2 ○ ○ ○ FÁCIL` entrava no enunciado | Não havia filtro de marcador de dificuldade | Regra `DIFFICULTY_LINE` |
| 9 | `LIGHTBULB … VER GABARITO E COMENTÁRIOS` entrava no enunciado | Ruído de interface | Regra `UI_NOISE` |
| 10 | `7 / 538` (paginação) entrava no enunciado | O filtro só cobria "Página 12" | `PAGE_NUMBER_LINE` passou a aceitar `7 / 538` |
| 11 | `doc.destroy is not a function` | No pdf.js v6 quem tem `destroy()` é a *loading task* | `loadingTask.destroy()` |
| 12 | `isEvalSupported` não existe mais | Removido no pdf.js v6 | Opção deletada |
| 13 | Build falhava: `unstable value new Date() in a Client Component` | `createState()` rodava no render (prerender) | `startedAt` passou a ser preenchido nos handlers (`Iniciar`/`Refazer`) |
| 14 | Build falhava: `Route segment config "dynamic"/"runtime" is not compatible with cacheComponents` | Next 16 + Cache Components | Removidos `dynamic` e `runtime` das rotas (Node é o padrão) |
| 15 | ESLint reclamava do worker do pdf.js | Arquivo de terceiros em `public/` | `public/**` no `globalIgnores` |
| 16 | Resultado mostrava "0 de 0 questões" e "0%" | Sem gabarito, `gradeable = 0` | Score vira `null` → exibe "—" e "sem gabarito" |
| 17 | Respostas sem gabarito contavam como **erro** | `scoreQuiz` comparava contra `null` | Só conta acerto/erro quando a questão tem resposta cadastrada |
| 18 | Tópico com letras separadas (`É T I CA N O S E RV I Ç O`) virava gibirish ao "corrigir" | O espaçamento é do próprio PDF — as palavras originais não são recuperáveis | Removida a correção por heurística; o tópico segue como no PDF e a **IA o normaliza** (instrução específica no prompt) |

---

## 9. Renomeação para "ApoQuiz"

Nome final escolhido pelo usuário. Alterado em:

- `components/ui.tsx` — logo
- `app/layout.tsx` — `title`, `applicationName`, Open Graph
- `components/quiz-app.tsx` — rodapé
- `package.json` / `package-lock.json` — `name`
- `lib/storage.ts` — chaves do `localStorage` (`apoquiz:quizzes:v1`)

---

## 10. Infraestrutura de deploy

- `scripts/copy-pdf-worker.mjs` — copia `pdf.worker.min.mjs` para `/public`;
  ligado a `predev` e `prebuild` (a Vercel executa `prebuild` automaticamente)
- `.env.example` — modelo de variáveis, com `!.env.example` no `.gitignore`
  para o modelo ser versionado e o `.env.local` não
- `public/pdf.worker.min.mjs` no `.gitignore` (artefato de build)
- `README.md` completo: arquitetura, comandos, configuração de IA, deploy,
  estrutura de pastas e limitações conhecidas

---

## 11. Apostilas editoriais: seções e gabarito por capítulo

### O problema

Uma apostila editorial grande (o caso real: **Prefeitura de Contagem/MG —
Auditor TI, 2.706 páginas, 1.824 questões com gabarito**) expôs que o parser
assumia um documento "chapado": um único bloco de questões e um único
bloco de gabarito no final.

O resultado real antes da correção:

| | Esperado | Antes | Depois |
| --- | --- | --- | --- |
| Questões detectadas | 1.824 | 1.689 | **1.824** ✅ |
| Gabarito detectado | 1.824 | 0 | **1.824** ✅ |

### A estrutura do documento

```
1.1 ORTOGRAFIA OFICIAL
1.1.1 Questões Fáceis          <- seção de questões
1.1.2 Questões de Nível Médio
1.1.3 Questões Difíceis
1.1.4 Gabaritos e Comentários  <- seção de gabarito
```

Três características quebravam o parser antigo:

1. **O gabarito não está no final** — há **41 seções** `X.X.4 Gabaritos e
   Comentários` espalhadas pelo documento, cada uma com o gabarito do
   capítulo anterior. O parser antigo só reconhecia **uma** região.
2. **O número da questão reinicia a cada capítulo** (`1.1` vai de 1 a 53,
   `1.2` volta ao 1). Um mapa `número → letra` global colide.
3. **O gabarito vem em outro formato**: `Resolução da Questão 12` seguido de
   `A alternativa correta é a C` — nenhum dos formatos já suportados.

### O que mudou em `lib/pdf/parser.ts`

**Seções do documento** — o parser agora indexa o documento por cabeçalho
numérico (`1.1.4 Gabaritos e Comentários`) e classifica cada seção em
`questions`, `answers` ou `other`. Entradas de sumário
(`1.1.4 Gabaritos . . . . 44`) são descartadas pela sequência de pontos.

**Gabarito por capítulo** — o resultado passa a ser indexado por
`capitulo#numero` (`"1.1#53"`). `applyGabarito` tenta primeiro a chave
composta e só depois o número puro, o que mantém a compatibilidade com os
PDFs de gabarito único já suportados.

**Alternativas por indentação** — as alternativas de uma questão são
extraídas do bloco inteiro da questão: os candidatos (`a)`, `(B)`, `IV)`,
`A texto`) são agrupados pela indentação e vence o alinhamento que forma a
sequência A→B→C→D→E mais completa. Isso resolve de uma vez:

- assertivas em algarismo romano no enunciado (`I. … II. … III. …`),
  que antes viravam as alternativas A, B e C;
- enunciados que começam com “A ” (ex.: *A distinção entre o uso de 'G'…*);
- enunciados que começam com “E ” (ex.: *Em uma inspeção de rotina…*).

### Bugs novos encontrados (e corrigidos)

| # | Problema | Causa | Correção |
| --- | --- | --- | --- |
| 19 | Gabarito = 0 e ~135 questões perdidas | `findGabaritoRegion` casou a linha `gabarito.` (fim de frase na p.339) e excluiu 400 linhas de questões reais | O cabeçalho de gabarito agora exige letra maiúscula e não pode terminar em ponto |
| 20 | Gabarito por capítulo ignorado | Só existia **uma** região de gabarito | Leitura por seção, com chave `capitulo#numero` |
| 21 | `A alternativa correta é a C` não reconhecido | Formato novo, fora dos 5 formatos suportados | Novos padrões `ANSWER_QUESTION_MARKER`, `ANSWER_NUMBER_MARKER`, `ANSWER_LETTER` |
| 22 | Números de questão colidiam entre capítulos | Mapa global `número → letra` | Chave composta por capítulo |
| 23 | ~900 questões fantasma | O cabeçalho corrente `1. Língua Portuguesa 1.1. Ortografia Oficial` casava com o padrão de número + separador | `isRunningHeader` — reconhece o cabeçalho pelo caminho de seção e apenas o descarta |
| 24 | Alternativa E absorvia o resto do documento | O laço de recuperação das alternativas ia até o fim do arquivo | A sequência para na última alternativa e respeita o limite da questão |
| 25 | Quebra de página no meio da questão fechava a questão | Rodapé (`12 / 2706`) e cabeçalho corrente caem entre as alternativas | Ruído é descartado sem fechar a questão |
| 26 | Assertivas romanas viravam alternativas | `I.`, `II.`, `III.` do enunciado casavam com `OPTION_ROMAN` | Extração por indentação (§11) |
| 27 | Ordem das alternativas embaralhada | O agrupamento por `x` ordenava por coordenada, e a coordenada das alternativas varia ~0,4 pt | Agrupamento preserva a ordem do documento |
| 28 | `"2009), o alfabeto…"` virava questão 2009 | Ano seguido de `)` no início da linha casa com o padrão de cabeçalho | Enunciado que começa com `,` ou `;` é continuação de frase |
| 29 | `"2.200 W permanece…"` virava seção 2.200 | `2.200` + título casa com o padrão de cabeçalho de seção | Componente numérico > 99 e título com frase são rejeitados |

### Ganho de performance

O `rescueBareOptions` antigo percorria o documento inteiro a cada questão
(O(n²) — inviável em 2.706 páginas) e concatenava strings gigantes. Agora
cada questão é resolvida em O(tamanho do bloco).

### Verificação

```
$ npm run check:pdf -- teste.pdf
GABARITO (1824): 1.1#53=C ...
QUESTOES (1824)
=> 1824 questoes, 1824 com resposta
```

Testado também no navegador real (build de produção): **1.824 questões,
1.824 com gabarito, 1.824 "Do PDF"**, zero questões sem resposta.

---

## 12. Explicações e análise por alternativa vindas do PDF

### O pedido

O gabarito do PDF já era lido desde o começo, mas o **comentário** de cada
questão — a justificativa da resposta correta e o motivo de cada alternativa
errada — ficava de fora. Nas apostilas editoriais esse conteúdo já está
escrito no próprio PDF, na seção de comentários:

```
Resolução da Questão 1464
1464 Check-Circle GABARITO
TABELAS-VERDADE, NEGAÇÃO DE PROPOSIÇÕES, EQUIVALÊNCIAS E IM- …
A alternativa correta é a C
O Princípio do Terceiro Excluído dita que uma proposição só pode assumir um de dois
valores (V ou F), excluindo-se uma terceira via.
Análise Detalhada das Alternativas
Times (A) Incorreta. O valor depende dos conectivos e dos valores das proposições simples.
Times (B) Incorreta. Refere-se à dupla negação, não ao princípio do terceiro excluído.
Check (C) Correta. Define exatamente a impossibilidade de um terceiro valor lógico.
```

Não fazia sentido pedir isso à IA quando a resposta já está no material.

### O que foi implementado

**Parser (`lib/pdf/parser.ts`)** — nova função `detectResolutions()`, que lê as
seções de comentários e extrai, por questão:

| Dado | Origem no PDF |
| --- | --- |
| Resposta correta | `A alternativa correta é a C` |
| Explicação | o parágrafo seguinte, até “Análise Detalhada das Alternativas” |
| Análise por alternativa | `Times (A) Incorreta. …` / `Check (C) Correta. …` |

As linhas de continuação são reconhecidas pela indentação (a continuação vem
mais recuada que a linha da alternativa).

Detalhe do formato: **“Times” e “Check” são os nomes dos ícones** (✗ e ✓)
impressos no PDF — não são palavras do texto. E o veredito varia: `Incorreta`
(7.046 ocorrências), `Correta` (2.017), `Não é a resposta`, `Verdadeira`,
`Falsa`. Por isso o veredito é **opcional** no padrão — sem isso, as linhas
com “Não é a resposta” não casavam e o texto vazava para a alternativa
errada.

**Prioridade PDF > IA** — assim como o gabarito, a explicação e a análise por
alternativa do PDF têm prioridade sobre as da IA (`lib/ai/extract.ts`). A IA
só entra no que o PDF não traz:

- `optionNotes` entrou no schema de saída da IA (`lib/ai/prompts.ts`), como
  lista de `{ label, text }`;
- quando o PDF não traz a análise, a IA a produz;
- a explicação do PDF nunca é sobrescrita pela IA.

**Interface** — novo componente `components/option-notes.tsx`, exibido:

- no feedback do quiz, logo abaixo da explicação;
- na revisão final (`components/results-panel.tsx`), com a nota de cada
  alternativa logo abaixo dela;
- na exportação JSON (`analiseAlternativas`).

### Resultado na apostila de 2.706 páginas

| | Antes | Depois |
| --- | --- | --- |
| Questões com explicação do PDF | 0 | **1.824** ✅ |
| Questões com análise por alternativa | 0 | **1.824** ✅ |

As 16 questões sem análise completa são casos em que o **próprio PDF** não
repete a alternativa correta na seção de análise (a explicação acima já a
cobre) — o app reflete o material como ele é.

---

## 13. Validação de ponta a ponta na apostila real

A apostila usada na §11 é o arquivo
`QUESTOES PORTUGUES E RACIOCINIO.pdf`, da pasta
`ContagemMG_-_Auditor_TI` (Prefeitura de Contagem/MG — Auditor de Controle
Interno/TI, 2026 — 11,8 MB, 2.706 páginas, 3.361.729 caracteres).

### No terminal

```bash
$ npm run cache:pdf -- "…/QUESTOES PORTUGUES E RACIOCINIO.pdf" cache.json
QUESTOES PORTUGUES E RACIOCINIO.pdf -> cache.json (2706 paginas)

$ npm run check:pdf -- "…/QUESTOES PORTUGUES E RACIOCINIO.pdf"
GABARITO (1824)
=> 1824 questoes, 1824 com resposta, 0 sem resposta

$ npm run check:resolutions -- cache.json
questoes:            1824
com explicacao:      1824
com analise por alt: 1824
com ambos completos: 1808
distribuicao de notas por questao: 17, 1807
```

As 16 questões sem análise completa são casos em que o **próprio PDF** não
repete a alternativa correta na seção de análise.

### No navegador (build de produção)

Upload do arquivo de 11,8 MB:

| Etapa | Resultado |
| --- | --- |
| Extração do texto | 2.706 páginas percorridas com barra de progresso |
| Tela de configuração | 1.824 questões · 1.824 com gabarito · 1.824 "Do PDF" |
| Filtro por assunto | todas as disciplinas populadas (Ortografia, Acentuação, Crase, Porcentagem, Análise Combinatória…) |
| Quiz | “Boa! Você acertou.” + explicação do PDF + seção **“Por que cada alternativa”** com A–E |
| Resultado | 1 acerto de 1.824, desempenho por assunto, impressão e exportação JSON |

Nenhuma chamada à IA foi necessária: gabarito, explicação e análise por
alternativa saíram todos do PDF.

### Tempos

| Etapa | Tempo |
| --- | --- |
| Extração (pdf.js + reconstrução de linhas) | ~28 s em Node, ~2 min no navegador |
| Parser (1.824 questões + 1.824 resoluções) | ~1 s |

O limite de upload (25 MB) e o de 150 questões enviadas à IA não atrapalham:
esta apostila tem 11,8 MB e todas as 1.824 questões ficam completas porque o
gabarito vem do PDF.

---

## 14. Salvar, retomar e reiniciar um quiz

### O que já existia

O app guardava o **quiz** (as questões extraídas) no `localStorage` e mostrava
uma lista de "quizzes recentes". Mas o **progresso** não sobrevivia:

- `loadState()` existia em `lib/storage.ts` e **nunca era chamado**;
- `handleResume` ignorava o estado salvo e começava do zero;
- o save só acontecia enquanto `stage === "quiz"`, com debounce de 800 ms.

### O que mudou

**Persistência em todas as telas.** O estado passou a ser gravado com
debounce de 600 ms em qualquer etapa (quiz ou resultado). Para não gravar a
cada segundo do cronômetro, o efeito depende de uma *assinatura* do estado
(`índice:respostas:marcadores:fim`) e não do objeto inteiro.

**Retomar.** A lista de "Quizzes salvos" mostra o estado de cada um:

| Estado | Ação principal |
| --- | --- |
| Nunca iniciado | **Começar** |
| Em andamento | **Continuar** (volta na mesma questão, com as respostas) |
| Finalizado | **Ver resultado** (abre a tela de placar) |

Além disso, cada item tem **Refazer** (zera o progresso e recomeça) e
**Remover**.

**Reiniciar do zero.** O botão "Refazer" zera respostas, marcador, posição e
cronômetro, tanto na lista de quizzes salvos quanto na tela de resultado.

### Bug encontrado no caminho

| # | Problema | Causa | Correção |
| --- | --- | --- | --- |
| 30 | A última resposta se perdia ao sair do quiz | Ao clicar "Novo PDF", `quiz` virava `null` e o efeito de save era cancelado — o timeout pendente nunca disparava | Os handlers de transição (`handleNewFile`, `handleFinish`, `handleRetry`, `handleRestart`) gravam o estado **na hora**, antes de trocar de tela |

Validação: responder 3 questões e sair imediatamente (sem esperar o
debounce) → `3/3` respostas salvas.

---

## 15. Auditoria de mobile (390 × 844)

O app foi auditado num viewport de **390 × 844 px** (iPhone 14/15), usando
um iframe de teste com as mesmas medidas — a largura do iframe é o que
dispara as media queries do Tailwind.

### Resultado por tela

| Tela | Overflow horizontal | Alvos de toque pequenos |
| --- | --- | --- |
| Landing | 0 px | — |
| Configuração | 0 px | 3 switches (44×24) |
| Quiz | 0 px | — |
| Quiz respondida | 0 px | — |
| Resultado | 0 px | — |

### Correções aplicadas

| Elemento | Antes | Depois |
| --- | --- | --- |
| Botão "marcar para revisar" | 28 × 28 px | 40 × 40 px |
| Botões da paleta de questões | 36 × 36 px | 40 × 40 px |
| Switch de configuração | 36 × 20 px | 44 × 24 px |
| Botões Continuar/Refazer/Remover | 28–30 px de altura | 36 px (`min-h-9`) |
| "Enviar outro PDF" | link de 20 px | botão com ícone e 36 px |

Nenhuma tela apresentou scroll horizontal — as alternativas, o enunciado
longo e a análise por alternativa quebram corretamente em telas estreitas.

---

## 16. Login com Google e sincronização entre aparelhos

### O pedido

"Quero salvar um quiz para terminar depois, e quero que ele fique salvo mesmo
depois de tudo pronto" — e, se necessário, um login (principalmente via
Google).

O `localStorage` já resolvia o caso de uso de um único aparelho (ver §14), mas
não sincronizava entre celular e computador nem protegia contra a limpeza
dos dados do navegador.

### O que foi implementado

**Supabase Auth com provider Google**, escolhido por já estar no padrão do
outro projeto do usuário (`norvo-gestao`).

| Arquivo | Papel |
| --- | --- |
| `lib/supabase/client.ts` | Cliente do navegador (`@supabase/ssr`) |
| `lib/supabase/use-auth.ts` | Hook `useAuth()` — sessão, login e logout |
| `lib/supabase/schema.sql` | Tabelas + RLS (para rodar no SQL Editor) |
| `lib/sync.ts` | Persistência unificada: local **ou** nuvem |
| `components/auth-button.tsx` | Botão de entrar/sair |

**O app continua funcionando sem o Supabase.** Sem as variáveis de ambiente,
o botão de login nem aparece e tudo usa o `localStorage`. O login é um
upgrade opcional, não um requisito.

### O login funciona sem servidor (nem em localhost)

O `@supabase/ssr` foi verificado no código-fonte instalado:

| Comportamento | Onde | Efeito |
| --- | --- | --- |
| `flowType: "pkce"` | `createBrowserClient.ts:148` | Fluxo PKCE, sem `client_secret` no browser |
| `detectSessionInUrl: isBrowser()` | `createBrowserClient.ts:150` | O `?code=` que volta do Google é trocado por sessão **no navegador** (`GoTrueClient.ts:691`) |
| Sessão em cookie | `createStorageFromOptions` | Via `document.cookie`, gerenciada pelo cliente |

Consequência prática: **não existe rota de callback, `proxy.ts`/middleware nem
dependência de `localhost`**. O `redirectTo` é `window.location.origin`, que
na Vercel vira `https://seu-app.vercel.app` sozinho. O deploy é 100% Vercel.

O único ajuste necessário é na allow-list do Supabase: `https://*.vercel.app`
para os deploys de preview (URL aleatória).

**Erro tratado:** se o provider Google ainda não foi ativado no painel, o
Supabase responde `Unsupported provider: provider is not enabled`. O botão de
login agora mostra essa mensagem em vez de falhar em silêncio.

### Limitação do Google: origem exata nas "JavaScript origins"

A instrução original sugeria o curinga `https://*.vercel.app` nas **Authorized
JavaScript origins** do Google Cloud. **Está errada** — o Google recusa:

> Origem inválida: não é permitido que o domínio contenha um caractere
> curinga ('*').

E também recusa caminho e barra final: a origem precisa ser exatamente
`https://host`.

| Onde | Curinga? |
| --- | --- |
| **Supabase** → Redirect URLs | ✅ aceito (`*`, `**`, `?`, `[a-z]`) — é o padrão recomendado pela doc do Supabase para Vercel: `https://*-<time>.vercel.app/**` |
| **Google** → Authorized JavaScript origins | ❌ recusado — só a origem exata de produção |

Consequência: os deploys de **preview** da Vercel (URL aleatória) não
conseguem entrar com Google, porque o Google exige a origem exata. Não
afeta o restante do app — só o login nesses previews. Para testar o login,
use o deploy de produção; a saída definitiva seria um domínio próprio
(fixo em todos os ambientes) ou cadastrar cada origem manualmente.

A configuração correta ficou no README e na página `/supabase-setup`.

**Configuração final validada** (URL de produção `https://apoquiz.vercel.app`):

| Onde | Valor |
| --- | --- |
| Google → Authorized JavaScript origins | `https://apoquiz.vercel.app` (sem barra final) |
| Google → Authorized redirect URIs | `https://gxzzcdywhjhasjttklry.supabase.co/auth/v1/callback` |
| Supabase → Site URL | `https://apoquiz.vercel.app` |
| Supabase → Redirect URLs | `https://apoquiz.vercel.app` (+ `http://localhost:3000` em dev) |

### Validação da configuração do Supabase

Testada direto na API REST do projeto:

| Teste | Resultado |
| --- | --- |
| Provider Google | ✅ `google: true` e 302 para `accounts.google.com` |
| Tabelas `quizzes`, `quiz_questions`, `quiz_states` | ✅ existem, com as colunas esperadas (inclusive `qid`) |
| Insert anônimo em `quizzes` | ✅ bloqueado: `42501 new row violates row-level security policy` |
| Fluxo do botão "Entrar" | ✅ `client_id`, `response_type=code`, `scope=email profile` e `redirect_uri` = callback do Supabase |

### O deploy está no ar — mas sem as variáveis de ambiente

O bundle publicado em `https://apoquiz.vercel.app` contém o *placeholder*
`process.env.NEXT_PUBLIC_SUPABASE_URL` (não substituído), o que faz
`isSupabaseConfigured()` retornar `false` e **o botão de login não aparecer**.

Variáveis `NEXT_PUBLIC_*` são **inlinadas no build**: sem elas definidas no
projeto da Vercel, é preciso adicionar e **redeployar** (Deployments →
⋯ → Redeploy, ou um novo push).

### Bug encontrado no deploy: `gemini-2.5-flash` não existe mais para contas novas

Com as variáveis no lugar, o `aiEnabled` ficou `true`, mas a chamada real ao
Gemini respondeu:

```
404 This model models/gemini-2.5-flash is no longer available to new users.
Please update your code to use models/gemini-3.8-flash
```

A documentação do Gemini confirma: *"we are limiting access to the 2.5 models
to users who have actively used them in the past... For any new projects, use
our latest models: 3.5 Flash-Lite or 3.8 Flash"*.

Correções:

- O modelo padrão passou a ser **`gemini-3.8-flash`**
- O provider agora tem **fallback automático**: se o modelo responder 404
  (indisponível para aquela conta), ele tenta sozinho `gemini-3.6-flash` e
  `gemini-3.5-flash-lite`. Um modelo fora da lista continua sendo o
  primeiro da fila, só entra depois como reserva
- O erro que chega ao cliente ficou legível (modelo + status + trecho da
  resposta da API)

**Validação no ar:** depois do redeploy, `POST /api/extract` respondeu
**HTTP 200** com a explicação escrita pelo Gemini e a letra correta mantida
em `C` (o gabarito do PDF tem prioridade sobre a IA).

### Tier free: limite de requisições

A chave é do **tier free** do Gemini, que tem limite de requisições por
minuto/dia e devolve `429 RESOURCE_EXHAUSTED` quando estoura. O provider
passou a tratar isso: até **4 tentativas** com espera crescente
(2 s, 4 s, 6 s + jitter) antes de desistir.

Somando as proteções que já existiam:

| Camada | Limite |
|---|---|
| Lotes | 12 questões por chamada, 3 em paralelo |
| Retry no 429 | 4 tentativas com backoff |
| Rate limit do app | 40 requisições / 10 min por IP |
| Teto por PDF | 150 questões enviadas à IA |

Observação de privacidade: no tier free o conteúdo enviado ao Gemini pode ser
usado pelo Google para melhorar os produtos — isso vale para os enunciados
das questões. Documentado no README.

### O que vai para a nuvem

| Item | Vai para o servidor? |
| --- | --- |
| O **PDF** | ❌ nunca — lido e descartado no navegador |
| Enunciados, alternativas, gabarito, explicações | ✅ |
| Respostas e progresso | ✅ |

O processamento continua 100% no cliente; só o JSON do quiz pronto é
sincronizado.

### Decisões de modelagem

**Metadados separados das questões.** A lista de quizzes salvos carrega só
os metadados (título, data, estatísticas). As questões são carregadas
**sob demanda**, quando o quiz é aberto. Antes disso, o `localStorage`
guardava o quiz inteiro como um blob JSON — uma apostila de 1.824 questões
com explicações passa fácil de 5 MB, que é o limite do `localStorage` (e o
`writeJSON` engolia o erro em silêncio).

**Tabelas normalizadas.** Em vez de um JSON gigante, o Supabase recebe três
tabelas: `quizzes` (metadados), `quiz_questions` (uma linha por questão, com
`position` para manter a ordem) e `quiz_states` (o progresso).

**RLS por usuário.** Cada tabela tem `user_id` e policies
`auth.uid() = user_id`. As questões são acessadas via o quiz dono. A chave
`service_role` **não** é necessária: tudo usa a chave `anon` com RLS ativa.

**`qid` preservado.** O id original de cada questão é salvo em uma coluna
própria — é ele que indexa as respostas em `quiz_states`. Sem isso, as
respostas salvas não casariam com as questões recarregadas.

**ID em UUID.** `buildQuiz` passou a gerar `crypto.randomUUID()`, que serve
tanto como chave do `localStorage` quanto como `uuid` das tabelas.

**Escritas em lote.** As questões são gravadas em chunks de 200 linhas — uma
apostila com 1.824 questões vira 10 requests em vez de 1.824.

### Interface

- Botão **"Entrar com Google"** no cabeçalho (some sozinho quando o
  Supabase não está configurado)
- Avatar com a inicial + botão de sair, quando logado
- Aviso na lista de salvos: "Entre com o Google para guardar seus quizzes
  na nuvem e continuar de onde parou em qualquer aparelho."
- A lista passa a dizer "Sincronizados com a sua conta" quando logado

### Validação

- **Modo local** (sem Supabase): botão de login ausente, criar → responder →
  sair → voltar mostra "Em andamento · 2/10 respondidas", metadados sem as
  questões e o quiz completo em chave separada ✅
- `typecheck`, `lint` e `build` limpos ✅
- O caminho de nuvem (login real, RLS, escrita e leitura na nuvem) **precisa
  de um projeto Supabase com o Google provider habilitado** — não foi
  possível exercitá-lo de ponta a ponta sem as credenciais do usuário.

---

## 17. Estado final

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ sem erros |
| `npm run build` | ✅ `/` estático, `/api/extract` dinâmico |
| PDF com gabarito | ✅ 10/10 questões com resposta do PDF |
| PDF real (1.pdf) | ✅ 43/43 questões extraídas |
| **Apostila editorial (2.706 pág.)** | ✅ **1.824/1.824 questões, 1.824/1.824 gabarito, 1.824/1.824 explicações, 1.824/1.824 análises por alternativa** |
| Fluxo completo no navegador | ✅ upload → setup → quiz → resultado |
| Salvar / retomar / reiniciar | ✅ quiz salvo sobrevive a fechar o navegador |
| Mobile 390 × 844 | ✅ zero overflow horizontal, alvos de toque ≥ 32 px |
| Modo local (sem Supabase) | ✅ funciona igual, sem botão de login |
| Login com Google | ⚙️ implementado — falta ativar o provider no Supabase |

### O que falta para produção

1. **Chave de IA**: adicionar `GEMINI_API_KEY` nas variáveis de ambiente da
   Vercel. Sem ela o app funciona normalmente com o gabarito do PDF — apenas
   sem as explicações e sem resolver questões sem gabarito.
2. **Conectar a Vercel**: importar o repositório e fazer o deploy. Nenhuma
   configuração extra é necessária.
3. **Apostilas com gabarito**: o `1.pdf` testado não tinha gabarito. Com um
   PDF que tenha, a detecção já funciona (validado no PDF de teste).
4. **Limite de 150 questões por PDF** na camada de IA: um PDF com 1.824
   questões recebe explicação só nas primeiras 150. O gabarito do PDF, esse,
   vale para todas.
