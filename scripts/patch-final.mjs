/** Ajustes finais de compactacao */
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

// Diagnostics warnings
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

// aiMessage
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

// stats.without
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

// Modo de resposta panel
trocar(
`          {/* 3. Modo de resposta */}
          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Modo de resposta</h3>
            <div className="mt-2.5 space-y-2">`,
`          {/* 3. Modo de resposta */}
          <div className="panel p-3">
            <h3 className="text-xs font-semibold">Modo de resposta</h3>
            <div className="mt-1.5 space-y-1.5">`);

// Agrupar por label
trocar(
`            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
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
                className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition focus:border-brand"
              >`,
`            <label className="mt-2 block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
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
                className="w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-xs outline-none transition focus:border-brand"
              >`);

// p mt-1.5 -> mt-1
trocar('className="mt-1.5 text-[11px] text-ink-faint">', 'className="mt-1 text-[10px] text-ink-faint">');

// Dificuldade
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

// painel Tempo/assunto/nivel p-4 -> p-3
trocar('          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-4">', '          {/* 4. Tempo, assunto e nivel */}\n          <div className="panel p-3">');

// Tempo limite label
trocar(
`            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">
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
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
                <span className="shrink-0 text-xs text-ink-faint">min</span>
              </div>
            </label>`,
`            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">
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
                  className="w-full rounded-xl border border-line bg-canvas-soft px-3 py-2 text-xs outline-none transition placeholder:text-ink-faint focus:border-brand"
                />
                <span className="shrink-0 text-xs text-ink-faint">min</span>
              </div>
            </label>`);

// mt-4 -> mt-3
trocar('className="mt-4 block">', 'className="mt-3 block">');

// gap-2 -> gap-1.5
trocar('className="mt-1.5 flex flex-wrap gap-2">', 'className="mt-1 flex flex-wrap gap-1.5">');

// Assunto
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

// levelCounts
trocar(
`            {levelCounts.length > 0 ? (
              <div className="mt-3">`,
`            {levelCounts.length > 0 ? (
              <div className="mt-2">`);

// label mt-3 -> mt-2
trocar('className="mt-3 block">\n              <span className="mb-1.5 block text-xs uppercase tracking-wider text-ink-faint">', 'className="mt-2 block">\n              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-faint">');

// p mt-2 -> mt-1.5
trocar('className="mt-2 text-[11px] text-ink-faint">', 'className="mt-1.5 text-[10px] text-ink-faint">');

// Botão iniciar
trocar('className="btn btn-primary w-full py-3 text-base"', 'className="btn btn-primary w-full py-2.5 text-sm"');

// wrapper principal
trocar('className="mx-auto w-full max-w-6xl px-4 pb-4 pt-1 sm:px-6"', 'className="mx-auto w-full max-w-5xl px-4 pb-3 pt-1 sm:px-6"');

// topBar mb-3 -> mb-2
trocar('{topBar ? <div className="mb-3">{topBar}</div> : null}', '{topBar ? <div className="mb-2">{topBar}</div> : null}');

// grid gap-3 -> gap-2
trocar('className="grid gap-3 lg:grid-cols-2"', 'className="grid gap-2 lg:grid-cols-2"');

writeFileSync(path, src, "utf8");
console.log("setup-panel.tsx: ajustes finais aplicados");