const CACHE_VERSION = "ardh-al-ahyaa-v6";

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

// توحيد رابط التخزين وإزالة Query String.
function normalizeURL(url) {
  const normalized = new URL(url);
  normalized.hash = "";
  normalized.search = "";
  return normalized.href;
}

// التحقق من صلاحية الاستجابة للتخزين.
function isCacheable(response) {
  if (!response || !response.ok) return false;

  if (
    response.type !== "basic" &&
    response.type !== "default"
  ) {
    return false;
  }

  const cacheControl =
    response.headers.get("Cache-Control") || "";

  if (/no-store/i.test(cacheControl)) {
    return false;
  }

  return true;
}

// تثبيت الملفات الأساسية.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pageCache = await caches.open(PAGE_CACHE);
      const staticCache = await caches.open(STATIC_CACHE);

      async function precache(cache, files) {
        await Promise.allSettled(
          files.map(async (file) => {
            const url = appURL(file);

            try {
              const response = await fetch(
                new Request(url, {
                  cache: "reload"
                })
              );

              if (isCacheable(response)) {
                await cache.put(
                  normalizeURL(url),
                  response.clone()
                );
              }
            } catch (error) {
              console.warn(
                "تعذر تخزين الملف:",
                file,
                error
              );
            }
          })
        );
      }

      await Promise.all([
        precache(pageCache, PAGE_FILES),
        precache(staticCache, STATIC_FILES)
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
          .filter((key) =>
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

// تجاهل الطلبات الحساسة.
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

// صفحة عدم الاتصال بالإنترنت.
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
        * {
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 45px 20px;
          background: #f4f8f7;
          color: #004e4d;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }

        .box {
          width: 100%;
          max-width: 420px;
          padding: 35px 22px;
          background: white;
          border-radius: 20px;
          box-shadow: 0 8px 30px #004e4d12;
        }

        .icon {
          font-size: 55px;
          margin-bottom: 15px;
        }

        h2 {
          margin-bottom: 10px;
        }

        p {
          color: #647b78;
          line-height: 2;
          font-size: 14px;
        }

        button {
          margin-top: 20px;
          padding: 13px 25px;
          border: 0;
          border-radius: 12px;
          background: #004e4d;
          color: white;
          font-weight: bold;
          cursor: pointer;
        }
      </style>
    </head>

    <body>
      <div class="box">
        <div class="icon">📡</div>

        <h2>أنت غير متصل بالإنترنت</h2>

        <p>
          لا يمكن تحميل الصفحة حاليًا.
          تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.
        </p>

        <button onclick="location.reload()">
          إعادة المحاولة
        </button>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}

// تحديث الملفات الثابتة في الخلفية.
async function updateStaticCache(request, cache) {
  try {
    const response = await fetch(request);

    if (isCacheable(response)) {
      await cache.put(
        normalizeURL(request.url),
        response.clone()
      );
    }

    return response;
  } catch (error) {
    return null;
  }
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
        const cacheKey = normalizeURL(request.url);

        try {
          const response = await fetch(request);

          if (isCacheable(response)) {
            await cache.put(
              cacheKey,
              response.clone()
            );
          }

          return response;
        } catch (error) {
          const cachedPage = await cache.match(cacheKey);

          if (cachedPage) {
            return cachedPage;
          }

          const homePage = await cache.match(
            normalizeURL(appURL("./index.html"))
          );

          return homePage || offlinePage();
        }
      })()
    );

    return;
  }

  // الملفات الثابتة: الكاش أولًا مع تحديث الخلفية.
  if (
    /\.(?:css|js|png|jpg|jpeg|webp|gif|svg|woff2?|ttf|ico)$/i.test(
      url.pathname
    )
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cacheKey = normalizeURL(request.url);

        const cachedFile = await cache.match(cacheKey);

        if (cachedFile) {
          event.waitUntil(
            updateStaticCache(request, cache)
          );

          return cachedFile;
        }

        const response = await updateStaticCache(
          request,
          cache
        );

        if (response) {
          return response;
        }

        return new Response(
          "الملف غير متاح دون اتصال بالإنترنت",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })()
    );
  }
});
