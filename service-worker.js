```javascript
const CACHE_VERSION = "ardh-al-ahyaa-v3";
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const APP_FILES = [
  "./",
  "./index.html",
  "./videos/index.html",
  "./notes/index.html",
  "./champion/index.html",
  "./forum/index.html",
  "./account/index.html",
  "./login/index.html",
  "./progress.js",
  "./logo.png",
  "./favicon.ico",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then((cache) =>
        Promise.allSettled(
          APP_FILES.map((file) =>
            cache.add(new Request(file, { cache: "reload" }))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("ardh-al-ahyaa-") &&
                key !== PAGE_CACHE &&
                key !== STATIC_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // لا نخزّن طلبات Supabase أو بيانات المستخدم الحساسة.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/storage/v1/")
  ) {
    return;
  }

  // التعامل مع صفحات المنصة فقط.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const cachedPage = await cache.match(request);

        const networkRequest = fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              await cache.put(request, response.clone());
            }
            return response;
          });

        // عرض الصفحة المحفوظة فورًا، مع تحديثها في الخلفية.
        if (cachedPage) {
          event.waitUntil(
            networkRequest.catch(() => {})
          );
          return cachedPage;
        }

        try {
          return await networkRequest;
        } catch {
          return (
            (await cache.match("./index.html")) ||
            new Response(
              "أنت غير متصل بالإنترنت. افتح صفحة سبق تحميلها أو أعد الاتصال.",
              {
                status: 503,
                headers: {
                  "Content-Type": "text/plain; charset=utf-8"
                }
              }
            )
          );
        }
      })()
    );

    return;
  }

  // الملفات الثابتة: الكاش أولًا، ثم تحديث النسخة في الخلفية.
  if (
    url.origin === self.location.origin &&
    /\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|ttf|ico)$/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);

        const update = fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              await cache.put(request, response.clone());
            }
            return response;
          });

        if (cached) {
          event.waitUntil(update.catch(() => {}));
          return cached;
        }

        try {
          return await update;
        } catch {
          return new Response("", { status: 503 });
        }
      })()
    );
  }
});
```
