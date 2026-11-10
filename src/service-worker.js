// Nome da versao do cache. Quando os arquivos mudam, aumentar esse valor forca nova instalacao.
const CACHE_NAME = "tower-v12";
// Arquivos essenciais que deixam o PWA abrir mesmo sem internet depois do primeiro carregamento.
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./logo.png", "./manifest.webmanifest"];

// Instalacao do service worker: abre o cache e grava todos os assets principais.
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Intercepta requisicoes: usa o arquivo em cache quando existir, senao busca na rede.
self.addEventListener("fetch", (event) => {
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
