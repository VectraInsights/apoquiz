/**
 * O pdf.js e publicado como ESM sem `exports` no package.json.
 * O build minificado nao tem tipos proprios, mas expoe a mesma API do
 * entrypoint principal - reaproveitamos os tipos de `pdfjs-dist`.
 */
declare module "pdfjs-dist/build/pdf.min.mjs" {
  export * from "pdfjs-dist";
}
