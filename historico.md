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
| Supabase → Redirect URLs | `https://apoquiz.vercel.app` |

### Validação da configuração do Supabase

Testada direto na API REST do projeto:

| Teste | Resultado |
| --- | --- |
| Provider Google | ✅ `google: true` e 302 para `accounts.google.com` |
| Tabelas `quizzes`, `quiz_questions`, `quiz_states` | ✅ existem, com as colunas esperadas (inclusive `qid`) |
| Insert anônimo em `quizzes` | ✅ bloqueado: `42501 new row violates row-level security policy` |
| Fluxo do botão "Entrar" | ✅ `client_id`, `response_type=code`, `scope=email profile` e `redirect_uri` = callback do Supabase |

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
- O caminho de nuvem (login real, RLS, escrita e leitura na nuvem) foi
  **testado pelo usuário no deploy**: o login pelo Google abre, a sessão
  fica ativa e o quiz salvo aparece na lista sincronizado ✅
- O `redirect_to` é validado contra a allow-list do Supabase: uma URL
  fora da lista faz o callback cair na **Site URL**, o que fecha o open
  redirect (§16, tabela de configuração)

---

## 17. Deploy e IA em produção: do bundle sem variáveis ao Gemini estável

Com o app no ar, a última peça a fechar foi a camada de IA. Este bloco
reúne o que quebrou no deploy e como cada problema foi resolvido — do
botão de login que não aparecia até as variáveis existirem, até o Gemini
reagindo 503 e gastando 30 s para refazer o que o PDF já tinha entregado.

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

### O Gemini ficou instável (503 e travas de 60 s)

No deploy com as variáveis, a chamada real respondeu:

```
504 FUNCTION_INVOCATION_TIMEOUT   (a função foi morta em 60 s)
502 Gemini 503 (gemini-3.8-flash)  (modelo sobrecarregado)
```

A cadeia de fallback só reagia a **404** (modelo inexistente), então uma
falha de *capacidade* derrubava a chamada inteira. Correções:

- **timeout de 20 s por chamada** (`AbortSignal.timeout`): uma requisição
  travada não consome mais o tempo inteiro da função
- **503 e 504 também caem no fallback** para o próximo modelo da família
- **429 passa a respeitar o header `Retry-After`**
- `maxDuration` da rota: 60 s → **120 s** (o limite do plano Hobby é 300 s)

Validação no ar depois da correção: **HTTP 200 em 33 s**, com a letra `C`
mantida do gabarito do PDF e a explicação escrita pelo Gemini.

### A IA estava refazendo o que o PDF já entregava

O detalhe mais importante do diagnóstico: numa apostila editorial com seção
de comentários, **todas as 1.824 questões já vêm com explicação e análise por
alternativa** lidas do PDF. A IA estava regenerando tudo isso — gastando
30 s+ para um resultado que era descartado logo depois (o PDF sempre tem
prioridade).

Agora a IA é chamada **só para o que falta**:

| Situação | Chamadas à IA |
| --- | --- |
| Apostila com seção de comentários | **zero** — resultado instantâneo |
| Apostila só com gabarito | só as 150 primeiras, em lotes de 12 |
| PDF sem Recognizable (parser falhou) | extração completa do texto |

A checagem existe nos dois lados: o cliente não faz a requisição, e o
servidor também não chama a API se não houver nada a enricher. A tela de
configuração mostra *"O PDF já trazia a resolução comentada de cada questão
— a IA não precisou ser chamada"*.

---

## 18. Nível de dificuldade como filtro

O PDF das apostilas editoriais declara o nível de cada questão de duas
formas, e as duas eram jogadas fora como ruído:

```
Questão 2                          <- cabeçalho
2 ○ ○ ○ FÁCIL                      <- marcador da questão
ASPECTOS GEOGRÁFICOS, ...          <- tópico
No contexto das pesquisas...       <- enunciado
```

```
1.1.2 Questões de Nível Médio      <- título da seção
```

### O que foi implementado

**Parser.** O marcador por questão (`matchDifficulty`) tem prioridade; na
ausência dele, a questão herda o nível do título da seção
(`levelFromTitle`). A legenda do medidor (`●○○ fácil, ●●○ médio, ●●●
difícil.`) também passou a ser filtrada.

Na apostila de 2.706 páginas:

| Nível | Questões |
| --- | --- |
| Fácil | 441 |
| Médio | 793 |
| Difícil | 590 |
| **Total** | **1.824** (100% com nível) |

**Quando o PDF não informa o nível, a IA classifica.** O campo `level`
entrou no schema de saída da IA (`facil` / `medio` / `dificil`) e no
prompt, com a instrução de manter o valor do PDF quando ele existe. Na
mesma linha de prioridade do gabarito e da explicação: **o PDF sempre
vence**.

**Interface.**
- Chips de **multi-seleção** na tela de configuração (dá para escolher
  Fácil + Difícil, por exemplo), com a contagem de questões por nível
- O filtro combina com o de assunto (assunto + nível ao mesmo tempo)
- Badge colorido no quiz: verde (fácil), amarelo (médio), vermelho (difícil)
- Painel **"Desempenho por nível"** na tela de resultado
- Coluna `level` nas tabelas do Supabase

### Bug encontrado no caminho

| # | Problema | Causa | Correção |
| --- | --- | --- | --- |
| 31 | 474 questões sem nível (de 1.824) | O regex do marcador aceitava só 1–3 dígitos, e as questões vão até 1.824 (`1008 ○ ○ ○ DIFÍCIL`) | Regex voltou para 1–4 dígitos |
| 32 | Nenhuma questão com nível | O `matchDifficulty` era chamado **depois** do `isNoise`, que descartava a linha antes | A leitura do nível vem antes do filtro de ruído |
| 33 | O ícone antigo ficava travado na tela de início do celular | O service worker servia as imagens (`.png`) **cache primeiro**, e o caminho do arquivo é o mesmo quando o ícone muda — quem já tinha o app instalado continuava vendo a versão antiga | Cache versão `v1` → `v2` (o `activate` apaga o cache antigo) e as imagens passaram a ser **rede primeiro**, com o cache só como reserva |

---

## 19. Apostilas com layout quebrado: o app interpreta e reporta

Uma apostila separada por capitulo (gerada por ferramenta de split) chega com
o texto **grudado**: o cabecalho corrente da apostila entra no meio das
alternativas, o numero de pagina cola no fim do texto e o cabecalho da
proxima questao gruda no rodape da anterior.

### O que o app passou a fazer

**1. Descarta a camada de texto duplicada.** Alguns PDFs desenham o mesmo
conteudo duas vezes (camada visivel + camada invisivel de acessibilidade).
A assinatura de uma copia e um deslocamento vertical **constante** em varios
textos ao mesmo tempo. Quando isso cobre boa parte dos itens da pagina, a
segunda passagem e descartada.

**2. Remove o cabecalho corrente pela repeticao.** O cabecalho ("1. Lingua
Portuguesa", "1.2. Acentuacao Grafica") repete em quase todas as paginas.
O que o distingue do topico da questao (que tambem repete) e o formato: o
cabecalho comeca com um caminho de secao, o topico nao. Como a deteccao
precisa do documento inteiro, as paginas so sao montadas depois de ler
todas (`buildDocumentPages`).

**3. Remove fragmentos de interface grudados no texto.** "LIGHTBULB Tente
resolver antes de conferir EYE VER GABARITO E COMENTARIOS" e afins sao
removidos da linha antes de qualquer analise — e era isso que escondia o
cabecalho "Questao 55" e o titulo da secao "1.2.4 Gabaritos e Comentarios".

**4. Numero de pagina colado.** Itens no formato "113 / 2706" sao
descartados; antes eles entravam no texto da alternativa.

**5. Rotulo de alternativa sozinho na linha.** Algumas apostilas colocam o
"A" numa linha e o texto na seguinte. O padrao novo cobre esse formato.

### O relatorio de diagnostico

O app nao falha em silencio: `lib/pdf/diagnostics.ts` analisa o documento e
a tela de configuracao mostra o que encontrou.

| Verificacao | O que detecta |
| --- | --- |
| `missingQuestions` | questoes que o gabarito do PDF tem mas o parser nao leu |
| `numberingGaps` | saltos na numeracao (ex.: 58, 83, 94) |
| `overlappingLines` | linhas com texto sobreposto (layout quebrado) |
| `duplicatedPages` | paginas com conteudo desenhado duas vezes |
| `withoutAnswer` | questoes sem gabarito |

### Resultado no PDF de layout quebrado

Antes: 54 questoes lidas, 53 com resposta (uma **questao falsa** contada
como questao, e 4 alternativas corrompidas por cabecalho grudado).

Depois:

    paginas:            53
    questoes lidas:     53
    com resposta:       53
    nao reconhecidas:   nenhuma
    saltos na numeracao: nenhum
    linhas sobrepostas: 3

O PDF de verdade tem 53 questoes (54 a 106) e 53 respostas — o app agora
bate exatamente. E o original de 2.706 paginas segue em **1.824/1.824**.

---

## 20. Instalar no celular (PWA)

O app agora e um **PWA**: da para instalar na tela de inicio do Android e
do iPhone, e funciona **offline**.

| Arquivo | Papel |
| --- | --- |
| `app/manifest.ts` | manifesto (nome, cores, icones, display standalone) |
| `public/sw.js` | service worker: rede primeiro nas navegacoes, cache nos estaticos, nunca cacheia `/api` |
| `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | icones do manifesto (gerados por `scripts/gerar-icones.py`) |
| `public/apple-touch-icon.png` | icone da tela de inicio no iOS |
| `components/install-prompt.tsx` | registra o service worker e convida a instalar |

No Android/Chrome aparece um botao **Instalar**; no iOS/Safari, um aviso
explica o caminho (Compartilhar > "Adicionar a Tela de Inicio").

O service worker guarda o app shell, entao a apostila ja aberta continua
funcionando sem internet. As chamadas de IA sao ignoradas offline (e
precisam de rede, claro).

---

## 21. Botao de instalacao: Android e iPhone

O primeiro botao "Instalar" aparecia mas **nao fazia nada** no Android. A
causa: o evento `beforeinstallprompt` do Chrome so pode ser usado **uma
vez**. Se a pessoa recusou o dialogo nativo uma vez (ou o evento ja
consumido), a segunda chamada a `event.prompt()` lanca `InvalidStateError`
— e a excecao nao era tratada, entao o clique morria em silencio.

### Correcoes

| Problema | Correcao |
| --- | --- |
| `prompt()` rejeitado engolia o erro | `try/catch` + queda no caminho manual |
| Botao sumia se o evento nao tivesse chegado a tempo | Botao de download **sempre** no cabecalho, com as instrucoes da plataforma |
| iPadOS 13+ nao era reconhecido (se passa por Mac) | Deteccao por `maxTouchPoints > 1` |
| App ja instalado continuava mostrando o botao | Deteccao de `display-mode: standalone` e do evento `appinstalled` |
| Chrome mostrava o mini-infobar do navegador | `preventDefault()` no `beforeinstallprompt` (mantido) |

### Como instalar em cada plataforma

- **Android / Chrome**: banner "Instalar" no rodape, ou o icone de download no
  cabecalho. Se o dialogo nativo for recusado, o app mostra o caminho manual
  (menu **⋮** > "Instalar app").
- **iPhone / Safari**: o Safari nao tem dialogo nativo de instalacao; o app
  mostra o caminho manual (Compartilhar > "Adicionar a Tela de Inicio").
- **PC**: tambem funciona (Chrome/Edge), com o mesmo banner.

---

## 22. Brave no Android: o app instala como atalho, nao como aplicativo

No Android com o **Brave**, o botao "Instalar" mostrava "instalando" e
nada acontecia. Nao era bug do app: e uma limitacao conhecida do navegador.

| Referencia | O que acontece |
| --- | --- |
| brave/brave-browser#56133 | No Brave para Android, PWAs **nao** sao instaladas como aplicativos standalone: apenas um atalho na tela de inicio, que abre dentro do navegador |
| brave/brave-browser#7357 | O Brave nao gera WebAPK (o pacote real do app) |
| community.brave.com | "when I click it it says it's installing but only gives me the option to add to home screen" |

O `beforeinstallprompt` continua disparando (o ChromeCriteria e atendido),
o dialogo nativo mostra "instalando" — e nenhum aplicativo e criado.

### O que o app faz agora

- **Detecta o Brave** (`navigator.brave.isBrave` + user agent) e **nao
  promete instalacao**: o botao abre direto as instrucoes, que explicam a
  limitacao e dao o caminho do atalho (menu **⋮** > "Adicionar a tela
  inicial") e o caminho de instalacao real (Chrome).
- **Timeout de 4 s** no `event.prompt()`: se o navegador travar sem
  resolver, o app cai no caminho manual em vez de ficar esperando para
  sempre.
- O resto funciona normalmente no Brave: o service worker registra, o app
  abre offline e o atalho criado pela tela inicial funciona.

---

## 23. Banner e painel adaptados ao Brave

Com o Brave no Android confirmado como o navegador em uso, o app deixou de
prometer uma instalacao que nao acontece:

- o banner diz **"Adicione à tela inicial"** (em vez de "Instale") e o botao
  vira **"Como adicionar"**;
- dentro, explica a limitacao do navegador e da o caminho do atalho;
- inclui a dica do **modo aviao**: sem manifesto disponivel, o Brave deixa de
  tentar criar o aplicativo e cria o atalho normalmente.

O app em si esta correto: o manifesto cumpre todos os criterios do Chrome
(verificado por `scripts/check-pwa.ts`: HTTPS, name, short_name, start_url,
display standalone, icones 192/512, service worker com handler de fetch). O
que falha e a criacao do WebAPK, que e do navegador.

---

## 24. Onde ficam os quizzes salvos

O salvamento e **automatico**: ao iniciar um quiz, ele vai para o
`localStorage` do navegador (ate 20 quizzes) junto com o progresso das
respostas. Nao ha botao de "salvar".

Para reencontrar, a secao **"Seus quizzes"** fica **no topo da tela
inicial** (antes da area de upload), com um card por quiz:

| Estado do quiz | Acao principal | Acoes |
| --- | --- | --- |
| Nunca iniciado | **Começar** | Remover |
| Em andamento | **Continuar** (volta na mesma questao, com as respostas) | Refazer, Remover |
| Finalizado | **Ver resultado** | Refazer, Remover |

Sem login, o quiz fica **so naquele aparelho e naquele navegador**. Com o
login do Google, ele vai para o Supabase e aparece em qualquer aparelho —
e o progresso continua sincronizado.

---

## 25. Rotulos do PWA por dispositivo

O botao de instalacao aparecia no PC escrito como "Instalar o app no
celular", o que nao faz sentido numa tela de computador. Agora o rotulo
acompanha o dispositivo:

| Dispositivo | Rotulo do botao | Texto do banner |
| --- | --- | --- |
| Celular/tablet | "Instalar no celular" | "...direto da tela de início do celular" |
| Computador | "Instalar o app" | "...no seu computador, como um app de verdade" |

A deteccao usava `pointer: coarse` (ponteiro grosso, tipico de toque) ou
largura menor que 768 px. *(Depois corrigida: ver §26 — agora e so pela
largura, porque o `pointer: coarse` dava falso positivo no PC. E o botao
nem aparece mais no computador: ver §28.)*

---

## 26. Tela inicial: os 3 mais recentes no topo

A versão com duas colunas (upload à esquerda, quizzes à direita) foi
considerada mais confusa que a original. A tela inicial voltou a **coluna
única**, com os **3 quizzes mais recentes no topo**, antes do hero.

    ┌──────────────────────────────────────────┐
    │ [quiz 1]        [quiz 2]        [quiz 3] │  <- Continuar de onde parou
    ├──────────────────────────────────────────┤
    │              Sua apostila                │
    │            virou quiz                   │
    │      [ Arraste o PDF da apostila ]       │
    │                                          │
    │            Como funciona                 │
    └──────────────────────────────────────────┘

- com mais de 3 quizzes salvos, um link **"Ver todos os N"** mostra a
  lista completa;
- cada card traz título (até 2 linhas), total de questões, data e progresso
  ("Em andamento · 12/1824 respondidas");
- o aviso de entrar com o Google fica acima dos cards, só quando faz
  sentido (Supabase configurado e usuário deslogado).

### Cabeçalho

- passou a ter a **mesma largura do conteúdo** (`max-w-5xl`): antes o
  logo ficava alinhado com a coluna estreita e os botões com a larga;
- os botões do canto direito ficam **agrupados**, sem espaço sobrando.

### Rótulo do botão de instalação no PC

Continuava aparecendo "Instalar no celular" no computador. A causa: a
detecção usava `pointer: coarse`, que dá **falso positivo em notebooks
com tela sensível ao toque** (o ponteiro principal continua sendo o mouse,
mas o navegador reporta "grosso"). Agora a detecção usa **apenas a
largura** (`innerWidth < 900`).

---

## 27. Tela inicial em duas colunas (versão substituída)

Em telas largas, a home ficava com uma coluna estreita (768 px) centralizada
e muita area vazia nas laterais. Agora o container vai ate 1280 px e o conteudo
se organiza em grade de 12 colunas:

| Coluna | Conteudo |
| --- | --- |
| 7 colunas | area de upload (drag & drop) |
| 5 colunas | "Seus quizzes" e, abaixo, "Como funciona" |

No celular continua em coluna unica, na mesma ordem (upload, quizzes, como
funciona).

Outros ajustes que vieram junto:

- o titulo do quiz salvo nao trunca mais em uma linha: quebra em ate duas
  (`line-clamp-2`), que era o que escondia "QUESTÕES CONHECIMENTOS GERAIS E
  ATUALID...";
- os cards de quiz sao empilhados (antes eram duas colunas dentro da
  secao, que ficava espremida na lateral);
- a secao "Como funciona" do rodape virou a lateral no desktop — no mobile
  continua aparecendo logo abaixo do upload.

---

## 28. Identidade visual: logo nova e cabeçalho integrado ao fundo

### A logo

A marca era um quadrado roxo com o ícone de "folha com visto". Agora é uma
**lâmpada com uma interrogação dentro** — o "?" dentro do vidro é a questão
que vira ideia, e a lâmpada carrega o "aha!".

| Elemento | Cor |
| --- | --- |
| Vidro da lâmpada | roxo (`#C4B5FD` → `#8B7CFF`) |
| Base do vidro | azul royal (`#3B82F6`) |
| Soquete | amarelo (`#FDE68A` → `#F59E0B`) |
| Faísca de ideia | verde (`#34D399`) |

A tipografia da marca passou a **Fredoka** — arredondada e em negrito, como
pede a identidade (acessível, de entretenimento leve). A fonte entrou no
`layout.tsx` como `--font-fredoka` e no `globals.css` como `--font-round`
(utilitário `font-round`).

O título grande da home também passou a usar a fonte arredondada, mantendo
*"virou quiz"* na serifada itálica, para o contraste não ficar tudo igual.

### O cabeçalho saiu da "barra"

O cabeçalho tinha fundo (`bg-canvas/80`), blur e uma borda embaixo. No
monitor, virava uma faixa escura solta em cima da página, que não batia com
o fundo e chamava mais atenção que o conteúdo.

Agora ele **começa transparente**, integrado ao fundo: logo, nome e botão de
login pousam direto no fundo da página. O fundo sutil (com blur) e a borda
aparecem **só depois que a página rola** (`scrollY > 8`), para o conteúdo que
passa por baixo não atrapalhar o logo.

### O botão de instalar some no computador

O botão de instalar aparecia em **todos** os dispositivos — o Chrome do PC
também dispara `beforeinstallprompt`. Agora ele é **só no celular**: no
computador, nem o botão nem o banner aparecem.

A instalação no PC continua possível pelo menu do próprio navegador
("Instalar app"), mas o app não insiste nisso.

### Ícones do PWA

`scripts/gerar-icones.py` foi reescrito com a identidade nova: fundo em
gradiente roxo → azul royal, lâmpada branca com a interrogação recortada,
soquete amarelo e a faísca verde. Os quatro PNGs (`icon-192`, `icon-512`,
`icon-maskable-512` e `apple-touch-icon`) foram regenerados — o ícone que
aparece na tela de início do celular agora é o novo.

---

## 29. Apostila recortada: duas renderizações na mesma página

A pasta `ContagemMG_-_Auditor_TI/EXERCICIOS` tem 19 apostilas recortadas de
um documento maior. Ao subir a **ACENTUAÇÃO GRÁFICA**, o app reclamava:

```
15 página(s) têm o conteúdo desenhado duas vezes (camada duplicada)
53 questão(ões) ficaram sem resposta
```

E o texto saía embaralhado — o enunciado repetido no meio das
alternativas, um "Questão 54" colado na alternativa A.

### O que era o PDF

Cada página tinha **duas renderizações** do mesmo conteúdo:

| | Renderização antiga | Renderização nova |
| --- | --- | --- |
| Onde | primeira da página (fundo) | segunda (o recorte) |
| Fonte | grande | normal |
| Numeração | "Questão 54" (do documento de origem) | "Questão 1" (do recorte) |
| Cabeçalho | "1.2 ACENTUAÇÃO GRÁFICA", "87 / 2706" | "Questão 1", "○ ○ ○ FÁCIL" |

As duas se sobrepunham: a linha da alternativa A recebia o "Questão 54" da
renderização antiga, e as linhas do enunciado apareciam duas vezes (com
quebras de linha diferentes, porque a fonte era outra).

### Como foi resolvido

**1) Reconhecer a renderização duplicada** (`lib/pdf/lines.ts`).

A assinatura não é um deslocamento constante (esse caso já era tratado):
a cópia é a mesma página **redesenhada com outra fonte e outra quebra de
linha**. O detector:

1. agrupa os itens da página por texto normalizado e acha as frases que
   aparecem duas vezes;
2. monta os pares de âncora (mesma frase, fontes diferentes) e ajusta uma
   transformada `y' = s·y + d` que leva a cópia até a página real — o
   ajuste tem que servir bem em todos os pares, senão a página é
   considered normal;
3. remove a cópia: mesma frase com fonte maior, frase parecida com outra
   quebra de linha, e o que sobra achado pela posição (transformada, o
   item cai em cima de um item da página real).

**2) Ler o gabarito que estava no próprio PDF.**

O gabarito não é uma tabela: cada questão vem com uma resolução escrita:

```
Resolução da Questão 12
12 Check-Circle GABARITO
A alternativa correta é a C
```

O parser só lia isso dentro de uma seção de gabarito reconhecida pelo
título — e nestas apostilas **não existe** essa seção: as resoluções
estão no fim do capítulo, dentro da própria seção de exercícios. Agora a
leitura acontece em todas as seções (os marcadores são específicos demais
para confundirem com enunciado), e as linhas da resolução são marcadas
para não virarem parte da pergunta.

**3) Detectar o nível com o símbolo colado.** O marcador vinha como
`1 ○ ○ ○FÁCIL` (sem espaço) e o padrão exigia espaço: agora ele aceita.

**4) Diagnóstico honesto.** A contagem de páginas duplicadas usava uma
heurística (uma frase repetida 3+ vezes na página) que accuse 15 páginas
onde havia **uma** duplicada — a linha de navegação "Tente resolver antes
de conferir" é repetida em toda página. Agora usa o sinal real.

### Resultado

| Apostila | Antes | Depois |
| --- | --- | --- |
| ACENTUAÇÃO GRÁFICA | 53 questões, **0 com resposta** | 53 questões, **53 com resposta**, níveis 12/27/14 |
| COERÊNCIA E COESÃO TEXTUAIS | 60 questões, 0 com resposta | 60/60 |
| ORTOGRAFIA OFICIAL | 53 questões, 0 com resposta | 53/53 |
| COMPREENSÃO E INTERPRETAÇÃO | 52 questões, 0 com resposta | 52/52 |
| ESTRUTURA DA ORAÇÃO E DO PERÍODO | 60 questões, 0 com resposta | 60/60 (59 respondidas) |
| VARIACIONAL LINGUÍSTICA | 38 questões, 0 com resposta | 38/38 |

Nos 19 arquivos: **todos** agora leem o gabarito do próprio PDF (13 com
100% e 6 com 1–2 questões de_exception).

Sem regressão na apostila completa: **1.824/1.824 questões com resposta**
(era 1.824/1.824 antes também), e nos demais arquivos grandes
(lp 809/809, rl 1015/1015, ti 912/912).

---

## 30. Só avisa o que é problema de verdade

O painel de configuração da tela "Quase lá" mostrava um bloco amarelo
**"O PDF tem 1 problema"** mesmo com o quiz perfeito:

```
52 questões · 52 com gabarito · 52 do PDF · 0 pela IA
O PDF tem 1 problema
• 105 linha(s) do PDF têm textos sobrepostos — é comum em arquivos
  gerados por ferramentas de separação.
```

O gabarito estava **100% lido do PDF** e mesmo assim a tela acusava um
problema. Três correções:

### 1. O diagnóstico separa problema de informação

| Antes (vira "problema") | Agora |
| --- | --- |
| "N linhas têm textos sobrepostos" | sumiu — o app ajusta a leitura sozinho |
| "N páginas têm o conteúdo desenhado duas vezes" | sumiu — o app descarta a cópia |
| "N questões não foram reconhecidas" | continua sendo aviso |
| "N questões ficaram sem resposta" | continua sendo aviso |

E o aviso de "sem resposta" é recalculado **depois** que a IA passa
(`adjustDiagnostics`): se a IA resolveu as questões que o PDF não trazia,
o aviso simplesmente não existe mais.

### 4. Números que não são números de questão

Três padrões de enunciado que o parser tomava como cabeçalho de questão:

| No PDF | O que é | O que o app fazia |
| --- | --- | --- |
| "52.A4B. Sabe-se que esse número..." | expressão matemática | criava a questão "52" |
| "...as ações em 2000." (linha só com o número) | continuação da frase | criava a questão "2000" |
| "1701) e o início efetivo..." | continuação da frase | criava a questão "1701" |
| "50) +12 − x= + 5" (fração de equação) | parte de uma equação | criava a questão "50" |

Regras novas no cabeçalho de questão:

- o ponto só vale como separador quando vem com texto depois
  ("52. Sabe-se" é enunciado, "52.A4B" é matemática);
- uma linha só com número e ponto é continuação de frase;
- texto começando com letra minúscula depois do número é continuação;
- o guarda de "fórmula matemática" passou a reconhecer os símbolos
  Unicode (− ÷ ± ² ³ √ ≠ ≤ ≥ π), que apareciam nas equações.

### 5. A camada duplicada sem texto repetido

O detector de renderização duplicada exigia que a página tivesse frases
repetidas (para transformar a cópia em âncora). Em algumas apostilas a
cópia é a página do **documento de origem** — ou seja, outra pergunta
inteiramente, sem nenhum texto em comum.

Agora a detecção usa a geometria da página:

- a renderização antiga é desenhada numa **coluna mais estreita** (itens
  bem à direita da margem da página);
- e com **fonte maior** que o corpo do texto (a escala varia de 1,15 a
  1,40 conforme a apostila).

Itens assim, com texto único na página, são descartados — exceto os
títulos de seção, que o parser precisa para saber onde estão as questões
e o gabarito.

### Resultado

Varredura nos **154 PDFs** das pastas do material (ADMINISTRAÇÃO,
AUDITORIA E CONTROLE INTERNO, CONHECIMENTOS GERAIS, DIREITO
CONSTITUCIONAL, LEGISLAÇÃO, PORTUGUÊS, RACIOCÍNIO LÓGICO, TI):

| Arquivo | Resultado |
| --- | --- |
| TI.pdf | **3030/3030** |
| QUESTOES RACIOCÍNIO LÓGICO.pdf | **1009/1009** |
| QUESTOES PORTUGUÊS.pdf | **809/809** |
| QUESTOES CONHECIMENTOS GERAIS.pdf | **348/348** |
| Pastas por assunto (19 + 19 + 9 + 2 + 16 + 18 + 23 + 27) | todas 100% |

Antes: 13 arquivos com pendência (questão com número errado ou sem
resposta). Depois: **0**.

Sem regressão na apostila completa: **1.824/1.824 questões com gabarito
do PDF**.

As pastas **TEORIA** e **RESUMO** não entram na conta: são material de
estudo (sem gabarito no PDF), e quem responde é a IA.
---

## 31. Tela de configuração em duas colunas

A tela "Quase lá" (o passo entre subir o PDF e começar o quiz) tinha duas
colunas: à esquerda a configuração, à direita os contadores e a **revisão
do gabarito** — uma lista com todas as questões abertas de uma vez.

### O que saiu

- **"Revisar gabarito" foi removido por completo**: o botão, a lista de
  cartões com todas as questões, a linha "Gabarito detectado no PDF: N
  resposta(s)" e o componente `ReviewCard` (junto com a lógica de corrigir
  a resposta na mão).
- **"Com gabarito"** (o contador) — o app já puxa o gabarito, o número
  era redundante.

### O que ficou

A tela virou **uma grade de duas colunas** (1024 px, centralizada):

```
┌──────────────────────┬──────────────────────┐
│ 1. Quase lá          │ 2. Quantidades       │
│    título + arquivo  │    Questões/Do PDF/IA│
├──────────────────────┼──────────────────────┤
│ 3. Modo de resposta  │ 4. Tempo, assunto,  │
│    correção,         │    nível             │
│    embaralhar x2     │                      │
├──────────────────────┴──────────────────────┤
│ 5. Iniciar quiz (atravessa as duas colunas)  │
└─────────────────────────────────────────────┘
```

No celular (abaixo de `lg`) as quatro caixas ficam empilhadas na mesma
ordem e o botão continua no fim, com a largura toda.

### Tempo limite digitável

O "Tempo limite" era um `select` fechado (5/10/20/30/60 minutos). Agora é
um **campo onde a pessoa digita o tempo que quiser**, em minutos, com os
atalhos antigos logo abaixo (Sem limite, 5, 10, 20, 30, 60) para quem não
quer digitar. Campo vazio = sem limite.

### Detalhe do aviso

Quando alguma questão fica sem resposta (o PDF não trazia o gabarito e a
IA não soube responder), o aviso agora diz que elas **aparecem no quiz
sem correção** — antes ele mandava a pessoa corrigir na revisão do
gabarito, que não existe mais.
---

## 32. Vários PDFs de uma vez e tela que cabe inteira

### Vários PDFs no mesmo quiz

A área de upload agora aceita **vários arquivos de uma vez** (arrastar ou
escolher). As questões de todos os PDFs entram num **único quiz**, com a
numeração em sequência.

O detalhe que exige cuidado: o gabarito é indexado por
`capitulo#numero` (`"1.2#45"`). Dois arquivos do mesmo capítulo teriam a
**mesma chave** e as respostas se misturariam. Por isso, com mais de um
arquivo, o capítulo ganha o prefixo do arquivo:

| Arquivo | Questão | Capítulo | Chave do gabarito |
| --- | --- | --- | --- |
| A BUROCRACIA (0) | 1 | `0:1.2` | `0:1.2#1` → A |
| A BUROCRACIA (0) | 2 | `0:1.2` | `0:1.2#2` → B |
| GESTÃO LOCAL (1) | 3 | `1:1.2` | `1:1.2#3` → C |

Com um arquivo só, nada muda: o capítulo e a numuração ficam como eram
(`1.2`, `1`, `2`…).

A junção ficou em `mesclarLeituras()` (`lib/client/pipeline.ts`), com teste
em `scripts/check-merge.ts`.

### Tela que cabe na tela

A tela de configuração não cabia inteira: o botão "Iniciar quiz" ficava
abaixo da dobra. O que mudou:

- **"Enviar outro PDF" saiu** — o botão "Novo PDF" do cabeçalho faz esse
  papel (e a tela de upload já aceita vários arquivos);
- **o rodapé saiu** ("ApoQuiz · PDF → quiz interativo com gabarito");
- painéis com `p-4` (antes `p-5`), margens internas e gaps menores;
- os números (Stat) ficaram mais compactos.

### Título por tema

Quando vinha mais de um PDF, o título era gerado por contagem ("3 apostilas
— 102 questões"). Agora o título fala do **conteúdo**: os próprios arquivos
são os temas, então eles viram o título.

| Arquivos | Título |
| --- | --- |
| A BUROCRACIA E O ESTADO.pdf | A BUROCRACIA E O ESTADO |
| A BUROCRACIA… + GESTÃO LOCAL… | A BUROCRACIA E O ESTADO + GESTÃO LOCAL, PODER LOCAL E… |

Acima de 64 caracteres o título corta com reticências. A pessoa pode
editar o campo à vontade.

### Logo clicável e ordem por nível

- **clicar na logo leva para a home** (o mesmo que o botão "Novo PDF"): o
  progresso em andamento é salvo antes de trocar de tela;
- **"Ordem das questões"**: *como veio no PDF* (padrão), *do mais fácil ao
  mais difícil* ou *do mais difícil ao mais fácil*. As questões sem nível
  ficam no fim, qualquer que seja a ordem.

A ordenação é aplicada **depois** do embaralhamento: o nível agrupa as
questões e, dentro de cada nível, a ordem continua embaralhada. O campo
`order` entrou no `QuizSettings` (e no default do Supabase, para os
quizzes já salvos).

### Campo de número sem setinhas

O campo "Tempo limite" (que agora aceita digitação) tinha as setinhas do
navegador; foram escondidas por CSS.

---

## 33. Tópico sem espaços colados

Alguns PDFs desenham o cabeçalho corrente (o "assunto") em **capsulas
menores** e o texto sai colado:

```
Antes:  ADMINISTRACAO· ÉTICAE GESTÃOPÚBLICA
Agora:  ADMINISTRACAO· ÉTICA E GESTÃO PÚBLICA
```

Nesses arquivos, a camada antiga do PDF (a do documento de origem) tem o
mesmo cabeçalho **com os espaços** — em small caps, o espaço entre
palavras some no texto extraído.

### Como foi resolvido

O **título da seção** vem sempre limpo ("2.5 ÉTICA E GESTÃO PÚBLICA") e
fala do mesmo assunto. O parser passou a comparar o tópico com ele
(`repararTopico`):

| Situação | O que faz |
| --- | --- |
| o tópico termina com a versão colada do título | troca o final pelo título limpo |
| o tópico é o título cortado pelo PDF ("… COMPONENTES E") | usa o título inteiro |
| o título é a versão colada do tópico (mesmo assunto, menos espaços) | usa o título |

O corte do PDF ("…" ou "-") também sai do texto final.

Além disso, quando o mesmo cabeçalho aparece em duas versões, vale a
que tem **mais palavras** (a colada tem menos).

### Verificação

- 19 arquivos de ADMINISTRAÇÃO: todos os tópicos limpos;
- apostila completa (2.706 páginas): **1.824/1.824** e os tópicos
  continuam iguais ("LÍNGUA PORTUGUESA · ORTOGRAFIA OFICIAL").

---

## 34. Estado final

### Verificações

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
| Login com Google | ✅ testado pelo usuário no deploy: sessão ativa e quiz salvo na lista |
| Configuração do Supabase | ✅ Site URL e Redirect URLs preenchidos com `https://apoquiz.vercel.app` (open redirect fechado, ver §16) |
| IA no ar (deploy) | ✅ `POST /api/extract` → HTTP 200 com explicação real do Gemini |
| PWA no Android (Chrome) | ✅ instalado pelo usuário, ícone na tela de início |
| PWA no iPhone | ⚙️ instruções documentadas (§21), sem teste do usuário |
| Brave no Android | ⚠️ limitação do navegador (só cria atalho) — o app detecta e explica (§22) |

### O que ainda fica de fora

1. **Limite de 150 questões por PDF** na camada de IA: um PDF com 1.824
   questões recebe explicação só nas primeiras 150. O gabarito do PDF, esse,
   vale para todas.
2. **Brave no Android** não instala o app como aplicativo — é uma
   limitação do navegador (`brave/brave-browser#56133`), não do app. O
   Chrome instala normalmente.
3. **Deploys de preview da Vercel** (URL aleatória) não conseguem entrar
   com o Google: o Google exige a origem exata, sem curinga (§16).

### Onde as coisas estão

| Assunto | Arquivo |
| --- | --- |
| Tela inicial, hero e lista de quizzes | `components/quiz-app.tsx` |
| Parser do PDF (heurístico) | `lib/pdf/parser.ts` |
| Reconstrução de linhas e páginas | `lib/pdf/lines.ts` |
| Relatório de problemas do PDF | `lib/pdf/diagnostics.ts` |
| Providers de IA (Gemini / OpenAI) | `lib/ai/provider.ts` |
| Persistência local ou nuvem | `lib/sync.ts` |
| Tabelas e RLS | `lib/supabase/schema.sql` |
| Botão de instalar / detecção de Brave | `components/install-prompt.tsx` |

---

## 36. Quiz na tela: enunciado, alternativas e abas consertados

### O problema

O componente `QuizPlayer` (`components/quiz-player.tsx`) não estava exibindo o
conteúdo da questão na tela do quiz. O usuário via apenas o título do quiz, o
placar, a barra de progresso e a paleta de botões numerados — mas **nenhum
enunciado e nenhuma alternativa** apareciam. Além disso, as abas de seção
(tópicos) ficavam sobrepostas e ilegíveis quando os títulos eram longos.

### O que mudou em `components/quiz-player.tsx`

**1. Enunciado da questão**

Adicionado `question.statement` logo abaixo do cabeçalho "Questão X de Y",
renderizado como parágrafo em destaque.

**2. Alternativas com feedback visual**

Cada alternativa (`question.options`) agora é renderizada como um botão
clicável com:
- Letra da alternativa (A, B, C, D, E)
- Texto da alternativa
- Estado visual de selecionada (azul/marca)
- Quando a correção instantânea está ativa e a resposta já foi dada:
  - alternativa correta → verde com ícone ✓
  - alternativa selecionada e errada → vermelho com ícone ✗

**3. Explicação da questão**

Quando `question.explanation` existe e o resultado está sendo mostrado
(correção instantânea), a explicação é exibida abaixo das alternativas.

**4. Abas de seção não sobrepostas**

- `min-w-[90px]` → `min-w-[80px] max-w-[140px]` para não esmagar
- Título da aba com `break-words text-[11px] leading-tight text-center`
  para quebrar em duas linhas quando longo
- Contagem de perguntas reduzida para `text-[9px]`

**5. Variável `showResult` no escopo correto**

Definida uma vez no escopo do componente (não dentro do `.map()` das
alternativas) e reutilizada tanto nas alternativas quanto na explicação.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |

---

## 37. Layout do quiz: estilo questionário de faculdade (abas em grade)

### O problema

O layout do `QuizPlayer` não atendia ao esperado: os botões "Anterior /
Próxima" ficavam embaixo (esquecíveis), a resposta selecionada não mostrava se
estava certa (verde) ou errada (vermelha), e a justificativa só aparecia quando
a correção instantânea estava ativa — o usuário queria a justificativa para
**todas** as respostas, independente de correta ou não.

### O que mudou em `components/quiz-player.tsx`

**1. Navegação no TOPO, acima da pergunta**

- Botões "Anterior" / contador "X / Y" / "Próxima" ficam no cabeçalho,
  logo abaixo do título do quiz e acima do enunciado — fáceis de alcançar
- Labels "Anterior"/"Próxima" removidos: só setas simples (◀ / ▶)

**2. Feedback visual nas alternativas (verde/vermelho)**

- Quando o usuário seleciona uma alternativa:
  - se for a correta → fica **verde** (fundo e letra)
  - se for incorreta → fica **vermelha** (fundo e letra)
- Se a alternativa não foi selecionada mas é a correta → fica verde suave
  (mostra o gabarito)
- Letra da alternativa dentro de um círculo à esquerda do texto

**3. Justificativa para TODAS as respostas**

- A explicação (`question.explanation`) é exibida abaixo das alternativas
  **sempre que existir**, independente de a resposta estar certa ou errada
  (não depende mais da correção instantânea)

**4. Abas de navegação em grade (barra lateral direita)**

- Barra fixa à direita (`sm:w-80`) com o título "Navegação do questionário"
- Todas as questões como botões quadrados em grade de 5 colunas
- Estado visual por questão: verde (correta), vermelho (errada), índigo
  (respondida), roxo (atual), branco (não respondida)
- Ícone de bandeira em questões marcadas para revisão

**5. Placar integrado**

- Barra de progresso + contagem de acertos/erros logo abaixo da área da
  questão

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |

---

## 35. Build do TypeScript: `questoesAgrupadas` inexistente, `secoes` faltando e `percentage` null

### O problema

O `next build` na Vercel falhava na checagem de tipos (`tsc`) com 11 erros:

| Arquivo | Erro |
| --- | --- |
| `lib/quiz.ts` | `questoesAgrupadas` não existe — nome errado da variável (7 ocorrências) |
| `lib/sync.ts` | `Property 'secoes' is missing` no objeto retornado por `getQuiz` |
| `components/quiz-player.tsx` | `'score.percentage' is possibly 'null'` no `ProgressBar` |

### Causa e correção

**`lib/quiz.ts` — `questoesAgrupadas` → `questoesPorSecao`**

A função `buildQuiz` criava `questoesPorSecao` (linhas 91–100) mas usava `questoesAgrupadas` — um nome que nunca foi declarado — para montar as seções, a lista de questões e as estatísticas (`total`, `withAnswer`, `fromGabarito`, `fromAI`, `withoutAnswer`). Todas as 7 ocorrências foram trocadas por `questoesPorSecao`.

**`lib/sync.ts` — `secoes: []` em `getQuiz`**

O tipo `Quiz` exige `secoes: QuizSection[]`, mas `getQuiz` (caminho da nuvem/Supabase) não devolvia esse campo. Adicionado `secoes: []` ao objeto retornado (o quiz carregado da nuvem não traz agrupamento por seção).

**`components/quiz-player.tsx` — `percentage ?? 0`**

`score.percentage` é `null` quando não há questões com gabarito (`gradeable === 0`). O `ProgressBar` exige um número, então passou a usar `(score.percentage ?? 0) / 100`.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ sem erros |
| `npm run build` | ✅ build de produção concluído |

---

## 38. Restauração do QuizPlayer: layout UniFatecie e feedback visual

### O problema

O `components/quiz-player.tsx` foi acidentalmente truncado para uma única linha
(o JSX da linha 186 substituiu todo o conteúdo do arquivo), quebrando o build
com erro de sintaxe `Expected ';', got ':'` em `) : null}`. Além disso, o
layout do quiz não atendia ao esperado: as abas de seção ficavam sobrepostas,
os botões Anterior/Próxima ficavam embaixo (esquecíveis), a resposta selecionada
não indicava se estava certa (verde) ou errada (vermelha), e a justificativa
apenas aparecia com correção instantânea ativa.

### O que mudou em `components/quiz-player.tsx`

**1. Restauração completa do arquivo**

Toda a estrutura do componente foi reescrita, mantendo o contrato de props
(`topBar`, `quiz`, `state`, `onStateChange`, `onFinish`) e a integração com
`quiz-app.tsx`, `ui.tsx` (`ProgressBar`, `Stat`), `option-notes.tsx`
(`OptionNotes`) e `brand-bar.tsx` (`BrandBar`, versão `v1.3`).

**2. Abas de seção à esquerda (§36 item 4)**

- Abas (tópicos) ficam à esquerda, abaixo da logo, em um painel colapsável
  (`secoesVisiveis`).
- Cada aba mostra o nome da seção e a quantidade de questões, quebrando em
  duas linhas quando longo (`break-words text-[11px] leading-tight`).
- Clique em uma aba navega diretamente para a primeira questão dela.

**3. Navegação no TOPO, acima da pergunta (§37 item 1)**

- Botões "Anterior" (◀) / contador "X / Y" / "Próxima" (▶) ficam centralizados
  no cabeçalho, logo abaixo do título do quiz e acima do enunciado.
- Labels "Anterior"/"Próxima" removidos: só setas simples.

**4. Enunciado da questão (§36 item 1)**

- `question.statement` renderizado como parágrafo em destaque, logo abaixo da
  navegação.

**5. Feedback visual verde/vermelho nas alternativas (§36 item 2, §37 item 2)**

- Cada alternativa é um botão clicável com letra (círculo) e texto.
- Quando respondida:
  - alternativa correta → verde com ícone ✓
  - alternativa selecionada e errada → vermelho com ícone ✗
  - alternativa não selecionada mas correta → verde suave (mostra o gabarito)
- Usa as classes CSS `.option` com `data-state` já definidas em
  `app/globals.css` (`selected`, `correct`, `wrong`).

**6. Explicação para TODAS as respostas (§37 item 3)**

- `question.explanation` exibida abaixo das alternativas **sempre que existir**,
  independente de a resposta estar certa ou errada.
- Não depende mais da correção instantânea (`showResult` definido no escopo
  do componente, reutilizado por alternativas e explicação).

**7. Painel direito: grade de numeração (§37 item 4)**

- Barra fixa à direita (`lg:hidden` em telas pequenas) com "Navegação do
  questionário".
- Todas as questões como botões quadrados em grade de 5 colunas.
- Estado visual por questão: verde (correta), vermelho (errada), índigo
  (respondida), roxo (atual), branco (não respondida).
- Ícone de bandeira em questões marcadas para revisão.

**8. Placar integrado**

- Barra de progresso + contagem de acertos/erros logo abaixo da área da
  questão.

**9. Suporte a scroll horizontal**

- Conteúdo principal e painel lateral com `min-w-0` para permitir scroll
  horizontal em telas estreitas sem quebrar o layout.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |
| Quiz com gabarito | ✅ enunciado, alternativas, feedback e explicação exibidos |

---

## 39. Quiz em largura total da tela

### O pedido

O layout do `QuizPlayer` estava limitado a `max-w-5xl`, deixando largas
margens em branco nas laterais de monitores mais largos. O usuário pediu que
as informações ocupassem toda a largura da tela.

### O que mudou em `components/quiz-player.tsx`

**1. Container da marca — largura total**

- `mx-auto w-full max-w-5xl px-4 sm:px-6` → `w-full px-4 sm:px-6`
  (removeu `mx-auto` e `max-w-5xl`).

**2. Container principal — largura total**

- `mx-auto w-full max-w-5xl px-4 sm:px-6 pb-20` →
  `w-full px-4 sm:px-6 pb-20` (removeu `mx-auto` e `max-w-5xl`).

**3. Grid rebalanceado (12 colunas no `lg`)**

- Abas esquerda: `lg:col-span-2` → `lg:col-span-3` (`max-w` passou de
  `220px` para `260px`).
- Conteúdo principal: `lg:col-span-10` → `lg:col-span-7`.
- Painel direito (grade de numeração): `lg:col-span-2` (mantido).
  Soma: 3 + 7 + 2 = 12 colunas.

**4. Enunciado — sem limite de largura**

- Removeu `max-w-2xl` do enunciado, que agora usa a largura disponível do
  conteúdo central.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |
| Layout em telas largas | ✅ conteúdo ocupa toda a largura disponível |

---

## 40. Tópicos do quiz exibidos na barra lateral esquerda

### O problema

A barra lateral esquerda do `QuizPlayer` mostrava "0 seções" mesmo em quizzes
com múltiplos tópicos (ex.: 19 tópicos). Isso acontecia porque o componente
dependia de `quiz.secoes`, que só é preenchido quando `groupMode === "by-pdf"`
(`lib/quiz.ts`, linha 103-105). No modo padrão (mixed), `secoes` vem vazio
`[]`, então nenhum tópico era exibido. Além disso, o rótulo "Seções" não
batia com a terminologia do app ("Tópico").

### O que mudou em `components/quiz-player.tsx`

**1. Tópicos calculados diretamente das questões**

Substituído `const sections = quiz.secoes ?? []` por um `useMemo` que extrai
os tópicos únicos de `quiz.questions`, independente do `groupMode`:

- Agrupa questões por `topic` (ou "Sem tópico" quando nulo)
- Cada entrada guarda o nome do tópico e os índices das questões dele
- Assim o sidebar sempre mostra todos os tópicos disponíveis

**2. Renomeado "Seções" → "Tópico"**

- Rótulo do painel: "Seções" → "Tópicos"
- Contador: "X seções" → "X tópico(s)"
- Clique em um tópico navega para a primeira questão daquele tópico

**3. Navegação por tópico**

- `toggleSection(topico)` agora recebe o nome do tópico, encontra o índice
  da primeira questão dele e atualiza `state.currentIndex` e
  `state.secaoAtual`.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |
| Tópicos na barra lateral | ✅ exibe todos os tópicos únicos das questões |
| Clique em tópico | ✅ navega para a primeira questão do tópico |

---

## 41. Versão indicada ao lado do logo (`v1.4`)

### O pedido

A versão do app (`v1.3` ao lado do logo) não estava sendo atualizada a cada
correção visível. O usuário solicitou que a versão suba a cada mudança que
altere a interface ou o comportamento do quiz.

### O que mudou

**1. `components/brand-bar.tsx`**

- `APP_VERSION` incrementado de `"1.3"` para `"1.4"`.
- A versão é exibida ao lado do logo na barra de marca de todas as telas
  (upload, quiz, resultado, etc.).

**2. Convenção adotada**

A partir de agora, toda alteração visível no app deve incrementar
`APP_VERSION` em `components/brand-bar.tsx` (ex.: `1.4` → `1.5` → `1.6`…)
antes de commitar e pushar.

### Verificação

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | ✅ sem erros |
| `npm run lint` | ✅ 0 errors |
| `npm run build` | ✅ build de produção concluído |
| Versão exibida | ✅ `v1.4` ao lado do logo |
