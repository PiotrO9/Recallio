const shellCache = "recallio-study-shell-v1";
const offlineShell = "/study/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function isStatic(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  );
}

async function prepare() {
  const cache = await caches.open(shellCache);
  const response = await fetch(offlineShell, {
    credentials: "omit",
    cache: "reload",
    redirect: "error",
  });
  if (!response.ok) throw new Error("Offline shell unavailable");
  const html = await response.clone().text();
  const assets = new Set(
    [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => new URL(match[1], self.location.origin))
      .filter(isStatic)
      .map((url) => url.href),
  );
  if (!assets.size) throw new Error("Offline shell has no assets");
  await cache.addAll([...assets]);
  await cache.put(offlineShell, response);
}

self.addEventListener("message", (event) => {
  if (event.data === "prepare-study" && event.ports[0]) {
    event.waitUntil(
      prepare().then(
        () => event.ports[0].postMessage("study-ready"),
        () => event.ports[0].postMessage("unavailable"),
      ),
    );
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/study") {
    event.respondWith(
      fetch(event.request).catch(
        async () =>
          (await caches.match(offlineShell, { cacheName: shellCache })) ??
          Response.error(),
      ),
    );
  } else if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(shellCache);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })(),
    );
  }
});
