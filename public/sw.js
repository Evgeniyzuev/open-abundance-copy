const CACHE_NAME = "open-abundance-v6";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon2.svg"];
const NAVIGATION_NETWORK_TIMEOUT_MS = 700;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, event));
    return;
  }

  event.respondWith(handleAsset(request, event));
});

async function handleNavigation(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedShell = await cache.match("/");
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put("/", response.clone()).catch(() => undefined);
      }
      return response;
    });

  if (!cachedShell) {
    return fetchPromise.catch(() => offlineResponse());
  }

  event.waitUntil(fetchPromise.catch(() => undefined));

  if (self.navigator && self.navigator.onLine === false) {
    return cachedShell;
  }

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(cachedShell), NAVIGATION_NETWORK_TIMEOUT_MS);
  });

  return Promise.race([fetchPromise, timeoutPromise]).catch(() => cachedShell);
}

async function handleAsset(request, event) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(async (response) => {
    if (shouldCache(response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
  });

  if (cached) {
    event.waitUntil(fetchPromise.catch(() => undefined));
    return cached;
  }

  return fetchPromise;
}

function shouldCache(response) {
  return response && (response.ok || response.type === "opaque");
}

function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: {
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}
