/** Ajustes finais finos de compactacao + remocao imports nao usados */
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

// 1. Remove unused imports
trocar("import { ArrowRight,\n  Check,\n  CircleAlert,\n  FileText,\n  Sparkles,\n} from \"lucide-react\";", "import { ArrowRight,\n  Check,\n  CircleAlert,\n  FileText,\n} from \"lucide-react\";");

// 2. Remove unused aiApplied from props
trocar("  aiApplied: boolean;\n", "");
trocar("  aiApplied,\n", "");

// 3. Container principal
trocar('className="mx-auto w-full max-w-6xl px-4 pb-3 pt-0.5 sm:px-6"', 'className="mx-auto w-full max-w-5xl px-4 pb-2 pt-0 sm:px-6"');

// 4. topBar mb-1 -> mb-0.5
trocar('{topBar ? <div className="mb-1">{topBar}</div> : null}', '{topBar ? <div className="mb-0.5">{topBar}</div> : null}');

// 5. grid gap-1.5 -> gap-1
trocar('className="grid gap-1.5 lg:grid-cols-2"', 'className="grid gap-1 lg:grid-cols-2"');

// 5b. pb-2 -> pb-1.5
trocar('className="mx-auto w-full max-w-5xl px-4 pb-2 pt-0.5 sm:px-6"', 'className="mx-auto w-full max-w-5xl px-4 pb-1.5 pt-0 sm:px-6"');

// 6. topBar mb-1 -> mb-0.5
trocar('{topBar ? <div className="mb-1">{topBar}</div> : null}', '{topBar ? <div className="mb-0.5">{topBar}</div> : null}');

// 7. grid gap-1.5 -> gap-1
trocar('className="grid gap-1.5 lg:grid-cols-2"', 'className="grid gap-1 lg:grid-cols-2"');

// 8. Painel "Quase la" p-2.5 -> p-2, h2 text-base -> text-sm, mt-0.5 -> mt-0.25
trocar('className="panel p-2.5">\n            <h2 className="text-base font-semibold">Quase lá</h2>', 'className="panel p-2">\n            <h2 className="text-sm font-semibold">Quase lá</h2>');
trocar('className="mt-0.5 text-sm text-ink-muted">', 'className="mt-0.25 text-sm text-ink-muted">');

// 8b. titulo do quiz mt-1.5 -> mt-1, mb-1 -> mb-0.5
trocar('className="mt-1.5 block">\n              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">\n                Título do quiz', 'className="mt-1 block">\n              <span className="mb-0.5 block text-xs uppercase tracking-wider text-ink-faint">\n                Título do quiz');

// 8c. input py-2 -> py-1.5, px-2.5 -> px-2
trocar('px-2.5 py-1.5 text-sm', 'px-2 py-1.5 text-sm');

// 8d. sourceFile mt-1.5 -> mt-1
trocar('className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-faint">', 'className="mt-1 flex items-center gap-1.5 text-xs text-ink-faint">');

// 9. Painel quantidades p-2.5 -> p-2, gap-2 -> gap-1.5
trocar('className="panel p-2.5">\n            <div className="grid grid-cols-3 gap-2">', 'className="panel p-2">\n            <div className="grid grid-cols-3 gap-1.5">');

// 10. warnings
trocar(
`            {diagnostics && diagnostics.warnings.length > 0 ? (
              <div className="mt-1.5 rounded border border-warn/30 bg-warn/10 p-2">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-warn">
                  <CircleAlert className="size-3" />
                  O PDF tem {diagnostics.warnings.length}{" "}
                  {diagnostics.warnings.length === 1 ? "problema" : "problemas"}
                </p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-warn/90">`,
`            {diagnostics && diagnostics.warnings.length > 0 ? (
              <div className="mt-1 rounded border border-warn/30 bg-warn/10 p-1.5">
                <p className="flex items-center gap-1 text-[10px] font-semibold text-warn">
                  <CircleAlert className="size-3" />
                  O PDF tem {diagnostics.warnings.length}{" "}
                  {diagnostics.warnings.length === 1 ? "problema" : "problemas"}
                </p>
                <ul className="mt-0.5 space-y-0.5 text-[9px] text-warn/90">`);

// aiMessage
trocar(
`            {aiMessage ? (
              <div className="mt-1.5 flex items-start gap-1.5 rounded border border-warn/30 bg-warn/10 p-1.5 text-[10px] text-warn">
                <CircleAlert className="mt-0.5 size-3 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-1.5 flex items-start gap-1.5 rounded border border-ok/30 bg-ok/10 p-1.5 text-[10px] text-ok">
                <Check className="mt-0.5 size-3 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA
                  não precisou ser chamada.
                </span>
              </div>
            ) : null}`, 
`            {aiMessage ? (
              <div className="mt-1 flex items-start gap-1 rounded border border-warn/30 bg-warn/10 p-1 text-[9px] text-warn">
                <CircleAlert className="mt-0.5 size-2.5 shrink-0" />
                <span>{aiMessage}</span>
              </div>
            ) : aiNotNeeded ? (
              <div className="mt-1 flex items-start gap-1 rounded border border-ok/30 bg-ok/10 p-1 text-[9px] text-ok">
                <Check className="mt-0.5 size-2.5 shrink-0" />
                <span>
                  O PDF já trazia a resolução comentada de cada questão — a IA
                  não precisou ser chamada.
                </span>
              </div>
            ) : null}`);

// stats.without
trocar(
`            {stats.without > 0 ? (
              <div className="mt-1.5 flex items-start gap-1.5 rounded border border-warn/30 bg-warn/10 p-1.5 text-[10px] text-warn">
                <CircleAlert className="mt-0.5 size-3 shrink-0" />
                <span>
                  {countLabel(stats.without, "questão", "questões")}{" "}
                  {verbFor(stats.without, "ficou", "ficaram")} sem resposta: o
                  PDF não trazia o gabarito e a IA não soube responder. Elas
                  aparecem no quiz sem correção.
                </span>
              </div>
            ) : null}`,
`            {stats.without > 0 ? (
              <div className="mt-1 flex items-start gap-1 rounded border border-warn/30 bg-warn/10 p-1 text-[9px] text-warn">
                <CircleAlert className="mt-0.5 size-2.5 shrink-0" />
                <span>
                  {countLabel(stats.without, "questão", "questões")}{" "}
                  {verbFor(stats.without, "ficou", "ficaram")} sem resposta: o
                  PDF não trazia o gabarito e a IA não soube responder. Elas
                  aparecem no quiz sem correção.
                </span>
              </div>
            ) : null}`);

// 3. Modo de resposta panel p-2.5 -> p-1.5
trocar(
`          {/* 3. Modo de resposta */}
          <div className="panel p-2.5">
            <h3 className="text-xs font-semibold">Modo de resposta</h3>
            <div className="mt-1 space-y-1">`,
`          {/* 3. Modo de resposta */}
          <div className="panel p-1.5">
            <h3 className="text-[10px] font-semibold">Modo de resposta</h3>
            <div className="mt-0.5 space-y-0.75">`);

// Agrupar por label
trocar(
`            <label className="mt-1.5 block">
              <span className="mb-0.5 block text-xs uppercase tracking-wider text-ink-faint">
                Agrupar por
              </span>
              <select
                value={settings.groupMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    groupMode: event.target.value as QuizSettings["groupMode"],
                  }))
                }
                className="w-full rounded-lg border border-line bg-canvas-soft px-2.5 py-1.5 text-[10px] outline-none transition focus:border-brand"
              >`,
`            <label className="mt-1 block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">
                Agrupar por
              </span>
              <select
                value={settings.groupMode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    groupMode: event.target.value as QuizSettings["groupMode"],
                  }))
                }
                className="w-full rounded border border-line bg-canvas-soft px-2 py-1 text-[10px] outline-none transition focus:border-brand"
              >`);

// p mt-0.5 -> mt-0.25
trocar('className="mt-0.5 text-[10px] text-ink-faint">', 'className="mt-0.25 text-[9px] text-ink-faint">');

// Dificuldade
trocar(
`            <label className="mt-1.5 block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">
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
                className="w-full rounded-lg border border-line bg-canvas-soft px-2.5 py-1.5 text-[10px] outline-none transition focus:border-brand"
              >
                <option value="facil-first">Do mais fácil ao mais difícil</option>
                <option value="dificil-first">Do mais difícil ao mais fácil</option>
              </select>
              <p className="mt-0.5 text-[9px] text-ink-faint">
                As questões sem nível ficam no fim.
              </p>
            </label>`,
`            <label className="mt-1 block">
              <span className="mb-0.25 block text-[10px] uppercase tracking-wider text-ink-faint">
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
                className="w-full rounded border border-line bg-canvas-soft px-2 py-1 text-[10px] outline-none transition focus:border-brand"
              >
                <option value="facil-first">Do mais fácil ao mais difícil</option>
                <option value="dificil-first">Do mais difícil ao mais fácil</option>
              </select>
              <p className="mt-0.25 text-[9px] text-ink-faint">
                As questões sem nível ficam no fim.
              </p>
            </label>`);

// painel Tempo/assunto/nivel p-2.5 -> p-1.5
trocar('          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-2.5">', '          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-1.5">');

// Tempo limite label
trocar(
`            <label className="block">
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">
                Tempo limite
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={600}
                  inputMode="numeric"
                  value={settings.timerMinutes ?? ""}
                  placeholder="Sem limite"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === "") {
                      setSettings((current) => ({
                        ...current,
                        timerMinutes: null,
                      }));
                      return;
                    }
                    const value = Number(raw);
                    setSettings((current) => ({
                      ...current,
                      timerMinutes:
                        Number.isFinite(value) && value > 0 ? Math.round(value) : null,
                    }));
                  }}
                  className="w-full rounded-lg border border-line bg-canvas-soft px-2.5 py-1.5 text-[10px] outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
                <span className="shrink-0 text-[10px] text-ink-faint">min</span>
              </div>
            </label>`,
`            <label className="block">
              <span className="mb-0.25 block text-[10px] uppercase tracking-wider text-ink-faint">
                Tempo limite
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={600}
                  inputMode="numeric"
                  value={settings.timerMinutes ?? ""}
                  placeholder="Sem limite"
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    if (raw === "") {
                      setSettings((current) => ({
                        ...current,
                        timerMinutes: null,
                      }));
                      return;
                    }
                    const value = Number(raw);
                    setSettings((current) => ({
                      ...current,
                      timerMinutes:
                        Number.isFinite(value) && value > 0 ? Math.round(value) : null,
                    }));
                  }}
                  className="w-full rounded border border-line bg-canvas-soft px-2 py-1 text-[10px] outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
                <span className="shrink-0 text-[9px] text-ink-faint">min</span>
              </div>
            </label>`);

// mt-3 -> mt-2
trocar('className="mt-3 block">', 'className="mt-1.5 block">');

// gap-1.5 -> gap-1
trocar('className="mt-1 flex flex-wrap gap-1.5">', 'className="mt-1 flex flex-wrap gap-1">');

// Assunto
trocar(
`            {topics.length > 0 ? (
              <label className="mt-1.5 block">
                <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">
                  Assunto
                </span>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas-soft px-2.5 py-1.5 text-[10px] outline-none transition focus:border-brand"
                >`,
`            {topics.length > 0 ? (
              <label className="mt-1 block">
                <span className="mb-0.25 block text-[10px] uppercase tracking-wider text-ink-faint">
                  Assunto
                </span>
                <select
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="w-full rounded border border-line bg-canvas-soft px-2 py-1 text-[10px] outline-none transition focus:border-brand"
                >`);

// levelCounts
trocar(
`            {levelCounts.length > 0 ? (
              <div className="mt-1.5">`,
`            {levelCounts.length > 0 ? (
              <div className="mt-1">`);

// label mt-2 -> mt-1
trocar('className="mt-2 block">\n              <span className="mb-0.5 block text-[10px] uppercase tracking-wider text-ink-faint">', 'className="mt-1 block">\n              <span className="mb-0.25 block text-[10px] uppercase tracking-wider text-ink-faint">');

// p mt-1.5 -> mt-0.75
trocar('className="mt-0.75 text-[10px] text-ink-faint">', 'className="mt-0.5 text-[9px] text-ink-faint">');

// Botão iniciar py-2 -> py-1.5, text-sm -> text-xs
trocar('className="btn btn-primary w-full py-2 text-sm"', 'className="btn btn-primary w-full py-1.5 text-[10px]"');

// wrapper principal
trocar('className="mx-auto w-full max-w-5xl px-4 pb-1.5 pt-0 sm:px-6"', 'className="mx-auto w-full max-w-4xl px-4 pb-1 pt-0 sm:px-6"');

// topBar mb-0.5 -> mb-0.25
trocar('{topBar ? <div className="mb-0.5">{topBar}</div> : null}', '{topBar ? <div className="mb-0.25">{topBar}</div> : null}');

// grid gap-1 -> gap-0.5
trocar('className="grid gap-1 lg:grid-cols-2"', 'className="grid gap-0.5 lg:grid-cols-2"');

// 9u. gap-1 -> gap-0.5
trocar('className="mt-1 flex flex-wrap gap-1">', 'className="mt-0.5 flex flex-wrap gap-0.75">');

// 9v. Button iniciar py-1.5 -> py-1, text-xs -> text-[10px]
trocar('className="btn btn-primary w-full py-1.5 text-xs"', 'className="btn btn-primary w-full py-1 text-[10px]"');

// 9w. Sparkles import not used - remove
trocar("import { ArrowRight,\n  Check,\n  CircleAlert,\n  FileText,\n  Sparkles,\n} from \"lucide-react\";", "import { ArrowRight,\n  Check,\n  CircleAlert,\n  FileText,\n} from \"lucide-react\";");

// 9w. remove unused imports
trocar("import { Stat, Toggle } from \"./ui\";", "import { Toggle } from \"./ui\";");

writeFileSync(path, src, "utf8");
console.log("setup-panel.tsx: ajustes finais aplicados");