"use strict";

const CACHE_VERSION = "ard-alahyaa-v1";

const APP_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.png",
  "/logo.png",
  "/progress.js",
  "/videos/index.html",
  "/notes/index.html",
  "/champion/index.html",
  "/forum/index.html",
  "/account/index.html",
  "/login/index.html"
];

/* تثبيت التخزين المؤقت */
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async function (cache) {
      await Promise.all(
        APP_FILES.map(async function (url) {
          try {
            const response = await fetch(
              new Request(url, {
                cache: "reload"
              })
            );

            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (error) {
            console.warn(
              "تعذر تخزين الملف:",
              url
            );
          }
        })
      );

      await self.skipWaiting();
    })
  );
});

/* تفعيل الإصدار الجديد */
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return (
              key.startsWith("ard-alahyaa-") &&
              key !== CACHE_VERSION
            );
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* إدارة الطلبات */
self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /* لا نتدخل في خدمات خارج الموقع */
  if (url.origin !== self.location.origin) {
    return;
  }

  /* التنقل بين الصفحات */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_VERSION).then(
              function (cache) {
                cache.put(request, copy);
              }
            );
          }

          return response;
        })
        .catch(async function () {
          const cached = await caches.match(request);

          if (cached) {
            return cached;
          }

          const home = await caches.match("/index.html");

          if (home) {
            return home;
          }

          return new Response(
            "لا يوجد اتصال بالإنترنت. اتصل بالإنترنت وحاول مرة أخرى.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain; charset=utf-8"
              }
            }
          );
        })
    );

    return;
  }

  /* تخزين الملفات الثابتة من الموقع */
  if (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".jpeg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(
      caches.match(request).then(
        async function (cached) {
          if (cached) {
            return cached;
          }

          const response = await fetch(request);

          if (response.ok) {
            const copy = response.clone();

            const cache = await caches.open(
              CACHE_VERSION
            );

            await cache.put(request, copy);
          }

          return response;
        }
      )
    );
  }
});
