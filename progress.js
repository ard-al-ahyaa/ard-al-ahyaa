"use strict";

/*
  ArdProgress
  مكتبة إدارة تقدم الطالب على Supabase.

  التحسينات:
  1. منع تكرار طلبات تحميل التقدم.
  2. تخزين مؤقت لمدة 30 ثانية.
  3. ترتيب عمليات الحفظ لكل محاضرة.
  4. الحفاظ على حالة الحفظ والإكمال معًا.
  5. تحديث الكاش بعد نجاح الحفظ.
  6. منع تكرار نقل البيانات المحلية.
  7. دمج البيانات المحلية مع بيانات Supabase.
  8. تحديد بيانات الطالب الحالي في الاستعلام.
*/

window.ArdProgress = (function () {

  let db = null;

  const CACHE_DURATION = 30000;

  let cache = null;
  let cacheTime = 0;
  let cacheUserId = null;

  let fetchPromise = null;
  let migrationPromise = null;

  // سلسلة عمليات الحفظ لكل محاضرة.
  const mutationQueues = new Map();

  /* التحقق من الاتصال */

  function need() {

    if (!db) {
      throw new Error(
        "يجب استدعاء ArdProgress.init(client) أولاً."
      );
    }

  }

  /* الحصول على المستخدم */

  async function userId() {

    need();

    const {
      data,
      error
    } = await db.auth.getSession();

    if (error) throw error;

    const session = data?.session;

    if (!session) {
      throw new Error("سجّل الدخول أولاً.");
    }

    return session.user.id;

  }

  /* نسخ البيانات */

  function cloneRows(rows) {

    return (rows || []).map(row => ({
      ...row
    }));

  }

  /* إبطال التخزين المؤقت */

  function invalidateCache() {

    cache = null;
    cacheTime = 0;
    cacheUserId = null;

  }

  /* تحديث صف داخل الكاش */

  function updateCachedRow(uid, row) {

    if (
      !cache ||
      cacheUserId !== uid
    ) {
      return;
    }

    const id = String(row.lecture_id);

    const index = cache.findIndex(
      item =>
        String(item.lecture_id) === id
    );

    if (index >= 0) {

      cache[index] = {
        ...row
      };

    } else {

      cache.push({
        ...row
      });

    }

    cacheTime = Date.now();

  }

  /* تحميل جميع بيانات التقدم */

  async function fetchAll(options = {}) {

    need();

    const force = options.force === true;

    // منع الطلبات المتزامنة.
    if (fetchPromise) {

      return cloneRows(
        await fetchPromise
      );

    }

    const request = (async function () {

      const uid = await userId();

      const now = Date.now();

      // استخدام الكاش إذا كانت البيانات حديثة.
      if (
        !force &&
        cache &&
        cacheUserId === uid &&
        now - cacheTime < CACHE_DURATION
      ) {

        return cloneRows(cache);

      }

      const {
        data,
        error
      } = await db
        .from("lecture_progress")
        .select(
          "lecture_id, saved, completed, completed_at"
        )
        .eq("user_id", uid);

      if (error) throw error;

      const rows = data || [];

      cache = cloneRows(rows);
      cacheUserId = uid;
      cacheTime = Date.now();

      return cloneRows(rows);

    })();

    fetchPromise = request;

    try {

      return cloneRows(
        await request
      );

    } finally {

      if (fetchPromise === request) {
        fetchPromise = null;
      }

    }

  }

  /* حفظ تغيير في التقدم */

  async function upsert(lectureId, patch) {

    need();

    const uid = await userId();

    const id = String(lectureId);

    const lockKey = uid + ":" + id;

    /*
      ترتيب عمليات الحفظ:
      كل عملية تنتظر انتهاء العملية السابقة
      الخاصة بالمحاضرة نفسها.
    */

    const previous =
      mutationQueues.get(lockKey) ||
      Promise.resolve();

    const operation = previous
      .catch(() => {})
      .then(async function () {

        /*
          نقرأ الحالة الحالية أولًا،
          حتى لا يؤدي تحديث saved إلى
          مسح completed أو العكس.
        */

        const rows = await fetchAll();

        const existing = rows.find(
          row =>
            String(row.lecture_id) === id
        ) || {};

        const now =
          new Date().toISOString();

        const merged = {

          user_id: uid,

          lecture_id: id,

          saved:
            existing.saved === true,

          completed:
            existing.completed === true,

          completed_at:
            existing.completed_at || null,

          ...patch,

          updated_at: now

        };

        // عند إلغاء الإكمال نمسح تاريخه.
        if (
          patch.completed === false &&
          !Object.prototype.hasOwnProperty.call(
            patch,
            "completed_at"
          )
        ) {

          merged.completed_at = null;

        }

        const {
          error
        } = await db
          .from("lecture_progress")
          .upsert(
            merged,
            {
              onConflict: "user_id,lecture_id"
            }
          );

        if (error) throw error;

        // تحديث الكاش بدل إبطاله.
        updateCachedRow(uid, {

          lecture_id: id,

          saved: !!merged.saved,

          completed: !!merged.completed,

          completed_at:
            merged.completed_at

        });

        // إشعار لوحة الطالب بتغيير البيانات.
        window.dispatchEvent(
          new Event("ard:progress")
        );

      });

    mutationQueues.set(
      lockKey,
      operation
    );

    try {

      await operation;

    } finally {

      if (
        mutationQueues.get(lockKey) === operation
      ) {

        mutationQueues.delete(lockKey);

      }

    }

  }

  /* حفظ المحاضرة */

  function setSaved(lectureId, value) {

    return upsert(
      lectureId,
      {
        saved: !!value
      }
    );

  }

  /* تسجيل إكمال المحاضرة */

  function setCompleted(lectureId, value) {

    return upsert(
      lectureId,
      {

        completed: !!value,

        completed_at: value
          ? new Date().toISOString()
          : null

      }
    );

  }

  /* قراءة البيانات المحلية القديمة */

  function readLocal(key) {

    try {

      const value = JSON.parse(
        localStorage.getItem(key) || "[]"
      );

      return Array.isArray(value)
        ? [...new Set(value.map(String))]
        : [];

    } catch (_) {

      return [];

    }

  }

  /* نقل البيانات القديمة */

  async function migrateLocal() {

    need();

    // منع تشغيل النقل أكثر من مرة بالتزامن.
    if (migrationPromise) {
      return migrationPromise;
    }

    const task = (async function () {

      const uid = await userId();

      const savedKey =
        "ard_saved_" + uid;

      const completedKey =
        "ard_completed_" + uid;

      const saved =
        readLocal(savedKey);

      const completed =
        readLocal(completedKey);

      if (
        !saved.length &&
        !completed.length
      ) {

        return;

      }

      /*
        تحميل بيانات Supabase الحالية
        قبل النقل حتى لا نمسح حالات سابقة.
      */

      const serverRows =
        await fetchAll();

      const serverMap = new Map(
        serverRows.map(row => [
          String(row.lecture_id),
          row
        ])
      );

      const ids = [
        ...new Set([
          ...saved,
          ...completed
        ])
      ];

      const now =
        new Date().toISOString();

      const rows = ids.map(id => {

        const existing =
          serverMap.get(id) || {};

        const localSaved =
          saved.includes(id);

        const localCompleted =
          completed.includes(id);

        return {

          user_id: uid,

          lecture_id: id,

          saved:
            existing.saved === true ||
            localSaved,

          completed:
            existing.completed === true ||
            localCompleted,

          completed_at:
            existing.completed_at ||
            (
              localCompleted
                ? now
                : null
            ),

          updated_at: now

        };

      });

      const {
        error
      } = await db
        .from("lecture_progress")
        .upsert(
          rows,
          {
            onConflict: "user_id,lecture_id"
          }
        );

      if (error) throw error;

      /*
        تحديث الكاش بعد نجاح النقل.
      */

      rows.forEach(row => {

        updateCachedRow(uid, {

          lecture_id: String(row.lecture_id),

          saved: !!row.saved,

          completed: !!row.completed,

          completed_at: row.completed_at

        });

      });

      /*
        حذف البيانات المحلية بعد نجاح النقل فقط.
      */

      localStorage.removeItem(savedKey);

      localStorage.removeItem(completedKey);

      window.dispatchEvent(
        new Event("ard:progress")
      );

    })();

    migrationPromise = task;

    try {

      await task;

    } finally {

      if (migrationPromise === task) {
        migrationPromise = null;
      }

    }

  }

  /* تهيئة المكتبة */

  function init(client) {

    if (
      !client ||
      typeof client.from !== "function"
    ) {

      throw new Error(
        "عميل Supabase غير صالح."
      );

    }

    if (db === client) {
      return;
    }

    db = client;

    invalidateCache();

    fetchPromise = null;
    migrationPromise = null;

    mutationQueues.clear();

  }

  /* تنظيف البيانات المؤقتة */

  function clearCache() {

    invalidateCache();

    fetchPromise = null;

  }

  return {

    init,

    fetchAll,

    setSaved,

    setCompleted,

    migrateLocal,

    clearCache

  };

})();
