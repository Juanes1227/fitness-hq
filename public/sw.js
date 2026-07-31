// Service worker mínimo: cachea el app shell para instalación/offline.
// No cachea llamadas a APIs externas (wger/USDA/OpenFoodFacts) — esas siempre van a red.
//
// Estrategia por tipo de request:
//  - Navegación / index.html: network-first. El HTML referencia assets con hash
//    (index-XXXX.js), así que la versión más nueva SIEMPRE debe ganar; el caché
//    es solo el fallback para cuando no hay red.
//  - Assets con hash (/assets/*): cache-first. Son inmutables por diseño (el
//    hash cambia si el contenido cambia), así que cachearlos agresivo es seguro
//    y evita re-descargarlos en cada visita.
const CACHE = "fitness-hq-v2";
const CORE_ASSETS = ["/", "/index.html", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)).catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/index.html");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // deja pasar APIs externas sin cachear
  if (url.pathname.startsWith("/api/")) return; // nunca cachear el backend

  const isNavigation = e.request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html";
  e.respondWith(isNavigation ? networkFirst(e.request) : cacheFirst(e.request));
});
