const CACHE_VERSION = "ardh-al-ahyaa-v5";

const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const PAGE_FILES = [
  "./",
  "./index.html",
  "./videos/index.html",
  "./notes/index.html",
  "./champion/index.html",
  "./forum/index.html",
  "./account/index.html",
  "./login/index.html"
];

const STATIC_FILES = [
  "./progress.js",
  "./logo.png",
  "./favicon.ico",
  "./manifest.json"
];

function appURL(path) {
  return new URL(path, self.location.href).href;
}

// تثبيت الملفات الأساسية.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pageCache = await caches.open(PAGE_CACHE);
      const staticCache = await caches.open(STATIC_CACHE);

      await Promise.allSettled([
        ...PAGE_FILES.map(async (file) => {
          const response = await fetch(
            new Request(appURL(file), {
              cache: "reload"
            })
          );

          if (response.ok) {
            await pageCache.put(appURL(file), response);
          }
        }),

        ...STATIC_FILES.map(async (file) => {
          const response = await fetch(
            new Request(appURL(file), {
              cache: "reload"
            })
          );

          if (response.ok) {
            await staticCache.put(appURL(file), response);
          }
        })
      ]);

      await self.skipWaiting();
    })()
  );
});

// تفعيل النسخة الجديدة وحذف الكاش القديم.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("ardh-al-ahyaa-") &&
              key !== PAGE_CACHE &&
              key !== STATIC_CACHE
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

// استقبال رسائل تحديث التطبيق.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// تحديد الطلبات التي لا يجب تخزينها.
function shouldIgnoreRequest(url) {
  return (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/storage/v1/") ||
    url.pathname.includes("/functions/v1/") ||
    url.pathname.includes("/rpc/")
  );
}

// عرض صفحة عدم الاتصال.
function offlinePage() {
  return new Response(
    `<!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#004e4d">
      <title>منصة أرض الأحياء</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 45px 20px;
          background: #f4f8f7;
          color: #004e4d;
        }

        button {
          padding: 13px 25px;
          border: 0;
          border-radius: 12px;
          background: #004e4d;
          color: white;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <h2>أنت غير متصل بالإنترنت</h2>
      <p>اتصل بالإنترنت وحاول فتح الصفحة مرة أخرى.</p>
      <button onclick="location.reload()">إعادة المحاولة</button>
    </body>
    </html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    }
  );
}

// التعامل مع الطلبات.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // تجاهل المواقع الخارجية.
  if (url.origin !== self.location.origin) return;

  // تجاهل بيانات Supabase والطلبات الحساسة.
  if (shouldIgnoreRequest(url)) return;

  // صفحات HTML: الشبكة أولًا ثم الكاش.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch {
          const cachedPage = await cache.match(request);

          if (cachedPage) {
            return cachedPage;
          }

          const homePage = await cache.match(
            appURL("./index.html")
          );

          return homePage || offlinePage();
        }
      })()
    );

    return;
  }

  // الملفات الثابتة: الكاش أولًا ثم الشبكة.
  if (
    /\.(?:css|js|png|jpg|jpeg|webp|gif|svg|woff2?|ttf|ico)$/i.test(
      url.pathname
    )
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);

        const cachedFile = await cache.match(request);

        if (cachedFile) {
          return cachedFile;
        }

        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(request, response.clone());
          }

          return response;
        } catch {
          return new Response("", {
            status: 503
          });
        }
      })()
    );
  }
});
