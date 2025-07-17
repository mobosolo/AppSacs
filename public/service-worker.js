const CACHE_NAME = "transports-cache-v2"; // Change le nom du cache à chaque mise à jour
const urlsToCache = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  // Ajoute tous les fichiers dont l'application a besoin
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// Installe le service worker et met en cache les fichiers
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Opened cache");
      return cache.addAll(urlsToCache);
    })
  );
});

// Supprime les anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Gère les requêtes du réseau
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - retourne la réponse du cache
      if (response) {
        return response;
      }
      return fetch(event.request);
    })
  );
});
