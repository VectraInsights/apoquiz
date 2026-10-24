/*
 * Service worker do ApoQuiz.
 *
 * Estrategia:
 *  - navegacoes: rede primeiro, com o cache como reserva (o app continua
 *    funcionando offline, que e o que importa para estudar no onibus)
 *  - estaticos (/_next/static, icones): cache primeiro
 *  - /api/*: nunca e cacheado (os dados precisam ser atuais)
 */

const CACHE = "apoquiz-v3";
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API nunca em cache: o gabarito e o progresso precisam ser atuais.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match("/")),
        ),
    );
    return;
  }

  // Estaticos com hash no nome: cache primeiro, o arquivo nunca muda.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Imagens (icones do app): rede primeiro, cache so como reserva. O
  // caminho do arquivo e o mesmo quando o icone muda, entao servir do
  // cache seguraria a versao antiga na tela de inicio.
  if (url.pathname.endsWith(".png")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? Response.error()),
        ),
    );
  }
});
