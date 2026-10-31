"use strict";

/*
  ArdProgress
  مكتبة إدارة تقدم الطالب على Supabase.

  التحسينات:
  1. منع تكرار طلبات تحميل التقدم المتزامنة.
  2. تخزين مؤقت لمدة 20 ثانية.
  3. إلغاء التخزين المؤقت عند تغيير البيانات.
  4. منع تكرار نقل البيانات المحلية.
  5. حذف البيانات المحلية بعد نجاح النقل فقط.
  6. تحديد بيانات الطالب الحالي في الاستعلام.
*/

window.ArdProgress = (function () {

  let db = null;

  const CACHE_DURATION = 20000;

  let cache = null;
  let cacheTime = 0;
  let cacheUserId = null;

  let fetchPromise = null;
  let migrationPromise = null;

  const mutationLocks = new Map();

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

  /* إبطال التخزين المؤقت */

  function invalidateCache() {

    cache = null;
    cacheTime = 0;
    cacheUserId = null;

  }

  /* تحميل جميع بيانات التقدم */

  async function fetchAll(options = {}) {

    need();

    const force = options.force === true;

    const uid = await userId();

    const now = Date.now();

    /* استخدام البيانات المحفوظة */

    if (
      !force &&
      cache &&
      cacheUserId === uid &&
      now - cacheTime < CACHE_DURATION
    ) {

      return cache.map(row => ({ ...row }));

    }

    /* منع تكرار الطلب المتزامن */

    if (
      fetchPromise &&
      !force
    ) {

      return fetchPromise;

    }

    const request = (async function () {

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

      cache = rows.map(row => ({ ...row }));
      cacheUserId = uid;
      cacheTime = Date.now();

      return rows;

    })();

    fetchPromise = request;

    try {

      return await request;

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

    /* منع إرسال نفس العملية المتزامنة */

    if (mutationLocks.has(lockKey)) {

      await mutationLocks.get(lockKey);

    }

    const operation = (async function () {

      const row = {

        user_id: uid,

        lecture_id: id,

        ...patch,

        updated_at: new Date().toISOString()

      };

      const {
        error
      } = await db
        .from("lecture_progress")
        .upsert(
          row,
          {
            onConflict: "user_id,lecture_id"
          }
        );

      if (error) throw error;

      invalidateCache();

      window.dispatchEvent(
        new Event("ard:progress")
      );

    })();

    mutationLocks.set(
      lockKey,
      operation
    );

    try {

      await operation;

    } finally {

      if (
        mutationLocks.get(lockKey) === operation
      ) {

        mutationLocks.delete(lockKey);

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

    /* منع تشغيل النقل أكثر من مرة بالتزامن */

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

      const ids = [
        ...new Set([
          ...saved,
          ...completed
        ])
      ];

      const now =
        new Date().toISOString();

      const rows = ids.map(id => ({

        user_id: uid,

        lecture_id: id,

        saved: saved.includes(id),

        completed: completed.includes(id),

        completed_at: completed.includes(id)
          ? now
          : null,

        updated_at: now

      }));

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

      if (error) {

        throw error;

      }

      /* الحذف بعد نجاح النقل فقط */

      localStorage.removeItem(savedKey);

      localStorage.removeItem(completedKey);

      invalidateCache();

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

    mutationLocks.clear();

  }

  /* تنظيف البيانات عند تغيير الحساب */

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
