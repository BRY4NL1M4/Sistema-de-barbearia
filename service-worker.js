// Nome da versao do cache. Quando os arquivos mudam, aumentar esse valor forca nova instalacao.
const CACHE_NAME = "tower-v29";
// Arquivos essenciais que deixam o PWA abrir mesmo sem internet depois do primeiro carregamento.
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./logo.png", "./manifest.webmanifest"];

// Instalacao do service worker: abre o cache e grava todos os assets principais.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

// Ativacao: remove caches antigos e assume o controle das abas abertas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Intercepta arquivos do proprio app: online, atualiza o cache com a versao mais recente;
// offline, recupera a ultima copia salva para manter o PWA funcionando.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
