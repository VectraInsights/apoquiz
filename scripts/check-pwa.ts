/**
 * Verifica se o app publicado atende aos criterios de instalacao do
 * Chrome (PWA) e se o codigo mais recente esta no ar.
 *
 * Uso: npx tsx scripts/check-pwa.ts [url]
 */
const base = process.argv[2] ?? "https://apoquiz.vercel.app";

async function main() {
  console.log(`\n=== ${base} ===\n`);

  // 1. A pagina referencia o manifesto?
  const html = await (await fetch(base)).text();
  const manifestHref = html.match(/<link[^>]+rel="manifest"[^>]+href="([^"]+)"/)?.[1];
  console.log(`manifest link no HTML: ${manifestHref ?? "AUSENTE"}`);

  // 2. O manifesto tem os campos exigidos?
  if (manifestHref) {
    const manifest = await (
      await fetch(new URL(manifestHref, base))
    ).json();
    const required = ["name", "short_name", "start_url", "display", "icons"];
    for (const key of required) {
      console.log(`  ${key.padEnd(12)}: ${manifest[key] ? "ok" : "AUSENTE"}`);
    }
    console.log(`  display     : ${manifest.display}`);
    console.log(`  start_url   : ${manifest.start_url}`);
    console.log(
      `  icones      : ${(manifest.icons ?? [])
        .map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? "/" + i.purpose : ""}`)
        .join(", ")}`,
    );
    const tem192 = (manifest.icons ?? []).some(
      (i: { sizes: string }) => i.sizes === "192x192",
    );
    const tem512 = (manifest.icons ?? []).some(
      (i: { sizes: string }) => i.sizes === "512x512",
    );
    console.log(`  192x192: ${tem192 ? "ok" : "AUSENTE"} | 512x512: ${tem512 ? "ok" : "AUSENTE"}`);
  }

  // 3. O service worker tem handler de fetch e responde?
  const sw = await fetch(`${base}/sw.js`);
  const swBody = await sw.text();
  console.log(`\nsw.js: HTTP ${sw.status} | ${sw.headers.get("content-type")}`);
  console.log(`  handler de fetch: ${swBody.includes("addEventListener(\"fetch\"") ? "ok" : "AUSENTE"}`);

  // 4. Os icones existem?
  for (const icon of ["icon-192.png", "icon-512.png", "apple-touch-icon.png"]) {
    const r = await fetch(`${base}/${icon}`);
    console.log(`  ${icon}: HTTP ${r.status} (${r.headers.get("content-type")})`);
  }

  // 5. O codigo mais recente (deteccao do Brave) esta no bundle?
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  let braveDetectado = false;
  let displayOverride = false;
  for (const src of scripts) {
    const js = await (await fetch(new URL(src, base))).text();
    if (js.includes("isBrave")) braveDetectado = true;
    if (js.includes("display_override")) displayOverride = true;
  }
  console.log(`\ncodigo no ar:`);
  console.log(`  deteccao do Brave: ${braveDetectado ? "ok (deploy novo)" : "AUSENTE (deploy antigo)"}`);
  console.log(`  manifest com display_override: ${displayOverride ? "ok" : "nao"}`);

  // 6. A pagina responde em HTTPS (obrigatorio para instalar)?
  console.log(`\nhttps: ${base.startsWith("https://") ? "ok" : "FALHA"} (exigido para instalar)`);
  console.log(`service worker: ${base.startsWith("https://") ? "permitido" : "bloqueado"}`);
}

main();
