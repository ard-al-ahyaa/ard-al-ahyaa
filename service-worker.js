const CACHE_VERSION = "ardh-al-ahyaa-v4";

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

// تحويل المسارات إلى عناوين صحيحة بالنسبة لمكان Service Worker.
function appURL(path) {
  return new URL(path, self.location.href).href;
}

// تثبيت الكاش الأولي.
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(PAGE_CACHE).then(async (cache) => {
        await Promise.allSettled(
          PAGE_FILES.map((file) =>
            cache.add(
              new Request(appURL(file), {
                cache: "reload"
              })
            )
          )
        );
      }),

      caches.open(STATIC_CACHE).then(async (cache) => {
        await Promise.allSettled(
          STATIC_FILES.map((file) =>
            cache.add(
              new Request(appURL(file), {
                cache: "reload"
              })
            )
          )
        );
      })
    ]).then(() => self.skipWaiting())
  );
});

// حذف الإصدارات القديمة.
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

// استقبال طلب تحديث النسخة.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// التعامل مع الطلبات.
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // لا تتدخل في الطلبات الخارجية.
  if (url.origin !== self.location.origin) {
    return;
  }

  // عدم تخزين بيانات Supabase أو طلبات تسجيل الدخول.
  if (
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/auth/") ||
    url.pathname.includes("/rest/v1/") ||
    url.pathname.includes("/storage/v1/")
  ) {
    return;
  }

  // التنقل بين صفحات المنصة.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);

        // عرض الصفحة المحفوظة بأسرع وقت.
        const cachedPage = await cache.match(request);

        // تحديث الصفحة من الإنترنت في الخلفية.
        const networkPromise = fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              await cache.put(request, response.clone());
            }

            return response;
          });

        // عند وجود نسخة محفوظة، اعرضها فورًا.
        if (cachedPage) {
          event.waitUntil(
            networkPromise.catch(() => {})
          );

          return cachedPage;
        }

        // عند عدم وجود نسخة محفوظة، استخدم الإنترنت.
        try {
          return await networkPromise;
        } catch {
          const homePage = await cache.match(
            appURL("./index.html")
          );

          if (homePage) {
            return homePage;
          }

          return new Response(
            `<!DOCTYPE html>
            <html lang="ar" dir="rtl">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <title>منصة أرض الأحياء</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  text-align: center;
                  padding: 40px 20px;
                  background: #f4f8f7;
                  color: #004e4d;
                }
                button {
                  padding: 12px 24px;
                  border: 0;
                  border-radius: 10px;
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
      })()
    );

    return;
  }

  // الملفات الثابتة: الكاش أولًا.
  if (
    /\.(?:css|js|png|jpg|jpeg|webp|svg|woff2?|ttf|ico)$/i.test(
      url.pathname
    )
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cachedFile = await cache.match(request);

        // تحديث الملف المحفوظ في الخلفية.
        const networkPromise = fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              await cache.put(request, response.clone());
            }

            return response;
          });

        if (cachedFile) {
          event.waitUntil(
            networkPromise.catch(() => {})
          );

          return cachedFile;
        }

        try {
          return await networkPromise;
        } catch {
          return new Response("", {
            status: 503
          });
        }
      })()
    );
  }
});
