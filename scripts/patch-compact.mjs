/** Compacta a tela de configuracao: reduz padding, margens e tamanhos. */
import { readFileSync, writeFileSync } from "node:fs";

const path = "components/setup-panel.tsx";
let src = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function trocar(de, para) {
  if (!src.includes(de)) {
    console.error("NAO ENCONTRADO:", de.slice(0, 80).replace(/\n/g, "\\n"));
    process.exit(1);
  }
  src = src.replace(de, para);
}

// 1. wrapper principal: pb-6 pt-2 -> pb-4 pt-1
trocar('className="mx-auto w-full max-w-6xl px-4 pb-6 pt-2 sm:px-6"', 'className="mx-auto w-full max-w-6xl px-4 pb-4 pt-1 sm:px-6"');

// 2. topBar mb-3 -> mb-2
trocar('{topBar ? <div className="mb-3">{topBar}</div> : null}', '{topBar ? <div className="mb-2">{topBar}</div> : null}');

// 3. max-w-5xl container (ja estava max-w-5xl, ok)

// 4. grid gap-3 -> gap-2
trocar('className="grid gap-3 lg:grid-cols-2"', 'className="grid gap-2 lg:grid-cols-2"');

// 4b. painel Quase la p-4 -> p-3 (ja feito no primeiro patch, mas garante)
trocar('className="panel p-4">\n            <h2 className="text-lg font-semibold">Quase lá</h2>', 'className="panel p-3">\n            <h2 className="text-base font-semibold">Quase lá</h2>');

// 5. titulo do quiz mt-3 -> mt-2
trocar('className="mt-3 block">\n              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">\n                Título do quiz', 'className="mt-2 block">\n              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">\n                Título do quiz');

// 4c. input py-2.5 -> py-2
trocar('px-3.5 py-2.5 text-sm', 'px-3 py-2 text-sm');

// 5. sourceFile mt-3 -> mt-2
trocar('className="mt-3 flex items-center gap-2 text-xs text-ink-faint">\n              <FileText className="size-3.5" />', 'className="mt-2 flex items-center gap-2 text-xs text-ink-faint">\n              <FileText className="size-3.5" />');

// 6. painel quantidades p-4 -> p-3
trocar('className="panel p-4">\n            <div className="grid grid-cols-3 gap-3">', 'className="panel p-3">\n            <div className="grid grid-cols-3 gap-2">');

// 6b. Stat label text-lg -> text-base, px-3 py-2.5 -> px-3 py-2 (ja feito no ui.tsx)

// 7. warnings mt-3 -> mt-2, p-3.5 -> p-2.5, rounded-xl -> rounded-lg, text-sm -> text-xs, size-4 -> size-3.5, text-sm -> text-xs, mt-2 -> mt-1.5, text-xs -> text-[10px], mt-2 -> mt-1.5
trocar(
`            {diagnostics && diagnostics.warnings.length > 0 ? (
              <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-warn">
                  <CircleAlert className="size-4" />
                  O PDF tem {diagnostics.warnings.length}{" "}
                  {diagnostics.warnings.length === 1 ? "problema" : "problemas"}
                </p>
                <ul className="mt-2 space-y-1.5 text-sm text-warn/90">`,
`            {diagnostics && diagnostics.warnings.length > 0 ? (
              <div className="mt-2 rounded-lg border border-warn/30 bg-warn/10 p-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
                  <CircleAlert className="size-3.5" />
                  O PDF tem {diagnostics.warnings.length}{" "}
                  {diagnostics.warnings.length === 1 ? "problema" : "problemas"}
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-warn/90">`);

// 8. aiMessage mt-3 -> mt-2, p-3.5 -> p-2.5, rounded-xl -> rounded-lg, text-sm -> text-xs, size-4 -> size-3.5
trocar(
`            {aiMessage ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-sm text-ok">
                <Check className="mt-0.5 size-4 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA
                  não precisou ser chamada.
                </span>
              </div>
            ) : null}`, 
`            {aiMessage ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-ok/30 bg-ok/10 p-2.5 text-xs text-ok">
                <Check className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA
                  não precisou ser chamada.
                </span>
              </div>
            ) : null}`);

// 9. stats.without mt-3 -> mt-2
trocar(
`            {stats.without > 0 ? (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 p-3.5 text-sm text-warn">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {countLabel(stats.without, "questão", "questões")}{" "}
                  {verbFor(stats.without, "ficou", "ficaram")} sem resposta: o
                  PDF não trazia o gabarito e a IA não soube responder. Elas
                  aparecem no quiz sem correção.
                </span>
              </div>
            ) : null}`,
`            {stats.without > 0 ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {countLabel(stats.without, "questão", "questões")}{" "}
                  {verbFor(stats.without, "ficou", "ficaram")} sem resposta: o
                  PDF não trazia o gabarito e a IA não soube responder. Elas
                  aparecem no quiz sem correção.
                </span>
              </div>
            ) : null}`);

// 8. painel Modo de resposta p-4 -> p-3, h3 text-sm -> text-xs, mt-2.5 -> mt-1.5, space-y-2 -> space-y-1.5
trocar(
`          {/* 3. Modo de resposta */}
          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Modo de resposta</h3>
            <div className="mt-2.5 space-y-2">`,
`          {/* 3. Modo de resposta */}
          <div className="panel p-3">
            <h3 className="text-xs font-semibold">Modo de resposta</h3>
            <div className="mt-1.5 space-y-1.5">`);

// 9. Toggle hint text-sm -> text-xs
trocar('hint="Mostra o gabarito e a explicação logo após responder."', 'hint="Mostra o gabarito e a explicação logo após responder."');

// 9b. label mt-3 -> mt-2, text-xs -> text-xs (ja), mb-1.5 -> mb-1
trocar(
`            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                Agrupar por
              </span>`,
`            <label className="mt-2 block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
                Agrupar por
              </span>`);

// 9c. select py-2.5 -> py-2, px-3.5 -> px-3, text-sm -> text-xs
trocar('px-3.5 py-2.5 text-sm', 'px-3 py-2 text-xs');

// 9d. p mt-1.5 -> mt-1, text-[11px] -> text-[10px]
trocar('className="mt-1.5 text-[11px] text-ink-faint">', 'className="mt-1 text-[10px] text-ink-faint">');

// 9e. Dificuldade mt-3 -> mt-2, h3 text-sm -> text-xs (ja), mt-2.5 -> mt-1.5
trocar(
`            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                Dificuldade das questões
              </span>
              <select
                value={settings.order}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    order: event.target.value as QuizSettings["order"],
                  }))
                }
                className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              >
                <option value="facil-first">Do mais fácil ao mais difícil</option>
                <option value="dificil-first">Do mais difícil ao mais fácil</option>
              </select>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                As questões sem nível ficam no fim.
              </p>
            </label>`,
`            <label className="mt-2 block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
                Dificuldade das questões
              </span>
              <select
                value={settings.order}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    order: event.target.value as QuizSettings["order"],
                  }))
                }
                className="w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-xs outline-none transition focus:border-brand"
              >
                <option value="facil-first">Do mais fácil ao mais difícil</option>
                <option value="dificil-first">Do mais difícil ao mais fácil</option>
              </select>
              <p className="mt-1 text-[10px] text-ink-faint">
                As questões sem nível ficam no fim.
              </p>
            </label>`);

// 9f. painel Tempo/assunto/nivel p-4 -> p-3
trocar('          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-4">', '          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-3">');

// 9g. label block mt-3 -> mt-2, mb-1.5 -> mb-1
trocar('className="block">\n              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">', 'className="block">\n              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">');

// 9h. input py-2.5 -> py-2, px-3.5 -> px-3, text-sm -> text-xs
trocar('px-3.5 py-2.5 text-sm', 'px-3 py-2 text-xs');

// 9i. mt-4 -> mt-3, gap-2 -> gap-1.5
trocar('className="mt-4 block">', 'className="mt-3 block">');

// 9j. flex-wrap gap-1.5 -> gap-1
trocar('className="mt-1.5 flex flex-wrap gap-1.5">', 'className="mt-1 flex flex-wrap gap-1">');

// 9k. preset button py-2.5 -> py-2, px-3.5 -> px-3, text-sm -> text-xs (ja em chip)
// chip className provavelmente em ui.tsx, deixa

// 9l. Assunto mt-3 -> mt-2, mb-1.5 -> mb-1, py-2.5 -> py-2, px-3.5 -> px-3, text-sm -> text-xs
trocar(
`            {topics.length > 0 ? (
              <label className="mt-3 block">
                <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
                  Assunto
                </span>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
                >`,
`            {topics.length > 0 ? (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
                  Assunto
                </span>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-xs outline-none transition focus:border-brand"
                >`);

// 9m. option mt-3 -> mt-2, mb-1.5 -> mb-1
trocar(
`            {levelCounts.length > 0 ? (
              <div className="mt-3">`,
`            {levelCounts.length > 0 ? (
              <div className="mt-2">`);

// 9n. label mt-3 -> mt-2, mb-1.5 -> mb-1
trocar('className="mt-3 block">\n              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">', 'className="mt-2 block">\n              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">');

// 9o. p mt-2 -> mt-1.5, text-[11px] -> text-[10px]
trocar('className="mt-2 text-[11px] text-ink-faint">', 'className="mt-1.5 text-[10px] text-ink-faint">');

// 9p. painel 5. Iniciar quiz lg:col-span-2 - ok
// 9q. button py-3 -> py-2.5, text-base -> text-sm
trocar('className="btn btn-primary w-full py-3 text-base"', 'className="btn btn-primary w-full py-2.5 text-sm"');

// 9r. wrapper principal pb-6 pt-2 -> pb-4 pt-1, max-w-6xl -> max-w-5xl (ja)
trocar('className="mx-auto w-full max-w-6xl px-4 pb-6 pt-2 sm:px-6"', 'className="mx-auto w-full max-w-5xl px-4 pb-4 pt-1 sm:px-6"');

// 9s. topBar mb-3 -> mb-2 (ja feito acima)

// 9t. grid gap-3 -> gap-2 (ja feito acima)

writeFileSync(path, src, "utf8");
console.log("setup-panel.tsx compactado");