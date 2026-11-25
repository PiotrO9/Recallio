const cachePrefix = "recallio-study-shell-";
const shellCache = cachePrefix + "v6";
const offlineShell = "/study/offline";

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
  if (event.data === "activate-update" && event.ports[0]) {
    event.waitUntil(
      prepare().then(
        () => self.skipWaiting(),
        () => event.ports[0].postMessage("unavailable"),
      ),
    );
  } else if (event.data === "prepare-study" && event.ports[0]) {
    event.waitUntil(
      prepare().then(
        () => event.ports[0].postMessage("study-ready"),
        (error) =>
          event.ports[0].postMessage(
            error?.name === "QuotaExceededError" ? "quota" : "unavailable",
          ),
      ),
    );
  }
});

async function matchShell(request) {
  const current = await caches.match(request, { cacheName: shellCache });
  if (current) return current;
  const previous = (await caches.keys())
    .filter((name) => name.startsWith(cachePrefix) && name !== shellCache)
    .reverse();
  for (const cacheName of previous) {
    const match = await caches.match(request, { cacheName });
    if (match) return match;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/study") {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await matchShell(offlineShell)) ?? Response.error(),
      ),
    );
  } else if (isStatic(url)) {
    event.respondWith(
      matchShell(event.request).then(
        (cached) => cached ?? fetch(event.request),
      ),
    );
  }
});
