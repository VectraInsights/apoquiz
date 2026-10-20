/**
 * Servidor estatico simples com CORS, so para teste local:
 * permite que a pagina em https://apoquiz.vercel.app baixe o PDF de teste
 * da maquina local e o envie ao input de arquivo.
 *
 * Uso: node scripts/test-server.mjs <arquivo.pdf> [porta]
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const file = process.argv[2];
const port = Number(process.argv[3] ?? 3333);

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Content-Type", "application/pdf");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  try {
    const data = await readFile(file);
    res.writeHead(200).end(data);
  } catch (error) {
    res.writeHead(404).end(String(error));
  }
}).listen(port, () => {
  console.log(`sirvindo ${basename(file)} em http://localhost:${port}/`);
});
