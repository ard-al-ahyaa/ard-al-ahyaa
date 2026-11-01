"use strict";

window.ArdProgress = (function () {

  let db = null;

  const CACHE_DURATION = 30000;

  let cache = null;
  let cacheTime = 0;
  let cacheUserId = null;

  let fetchPromise = null;
  let fetchUserId = null;

  let migrationPromise = null;
  const mutationQueues = new Map();

  function need() {
    if (!db) {
      throw new Error("يجب استدعاء ArdProgress.init(client) أولاً.");
    }
  }

  async function userId() {
    need();

    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    const uid = data?.session?.user?.id;

    if (!uid) {
      throw new Error("سجّل الدخول أولاً.");
    }

    return uid;
  }

  function cloneRows(rows) {
    return (rows || []).map(row => ({ ...row }));
  }

  function invalidateCache() {
    cache = null;
    cacheTime = 0;
    cacheUserId = null;
  }

  function updateCachedRow(uid, row) {
    if (!cache || cacheUserId !== uid) return;

    const id = String(row.lecture_id);

    const index = cache.findIndex(
      item => String(item.lecture_id) === id
    );

    if (index >= 0) {
      cache[index] = { ...row };
    } else {
      cache.push({ ...row });
    }

    cacheTime = Date.now();
  }

  async function fetchAll(options = {}) {
    need();

    const uid = await userId();
    const force = options.force === true;

    if (
      !force &&
      cache &&
      cacheUserId === uid &&
      Date.now() - cacheTime < CACHE_DURATION
    ) {
      return cloneRows(cache);
    }

    if (fetchPromise && fetchUserId === uid) {
      return cloneRows(await fetchPromise);
    }

    const request = (async () => {

      const { data, error } = await db
        .from("lecture_progress")
        .select("lecture_id,saved,completed,completed_at")
        .eq("user_id", uid);

      if (error) throw error;

      const rows = data || [];

      cache = cloneRows(rows);
      cacheUserId = uid;
      cacheTime = Date.now();

      return cloneRows(rows);

    })();

    fetchPromise = request;
    fetchUserId = uid;

    try {
      return cloneRows(await request);
    } finally {
      if (fetchPromise === request) {
        fetchPromise = null;
        fetchUserId = null;
      }
    }
  }

  async function upsert(lectureId, patch) {
    need();

    const uid = await userId();
    const id = String(lectureId);

    if (!id) {
      throw new Error("رقم المحاضرة غير صالح.");
    }

    const lockKey = uid + ":" + id;

    const previous =
      mutationQueues.get(lockKey) || Promise.resolve();

    const operation = previous
      .catch(() => {})
      .then(async () => {

        const rows = await fetchAll({ force: true });

        const existing = rows.find(
          row => String(row.lecture_id) === id
        ) || {};

        const merged = {
          user_id: uid,
          lecture_id: id,
          saved: existing.saved === true,
          completed: existing.completed === true,
          completed_at: existing.completed_at || null,
          ...patch,
          updated_at: new Date().toISOString()
        };

        if (
          patch.completed === false &&
          !Object.prototype.hasOwnProperty.call(patch, "completed_at")
        ) {
          merged.completed_at = null;
        }

        const { error } = await db
          .from("lecture_progress")
          .upsert(merged, {
            onConflict: "user_id,lecture_id"
          });

        if (error) throw error;

        updateCachedRow(uid, {
          lecture_id: id,
          saved: !!merged.saved,
          completed: !!merged.completed,
          completed_at: merged.completed_at
        });

        window.dispatchEvent(
          new Event("ard:progress")
        );

      });

    mutationQueues.set(lockKey, operation);

    try {
      await operation;
    } finally {
      if (mutationQueues.get(lockKey) === operation) {
        mutationQueues.delete(lockKey);
      }
    }
  }

  function setSaved(lectureId, value) {
    return upsert(lectureId, {
      saved: !!value
    });
  }

  function setCompleted(lectureId, value) {
    return upsert(lectureId, {
      completed: !!value,
      completed_at: value
        ? new Date().toISOString()
        : null
    });
  }

  function readLocal(key) {
    try {
      const value = JSON.parse(
        localStorage.getItem(key) || "[]"
      );

      return Array.isArray(value)
        ? [...new Set(value.map(String))]
        : [];

    } catch {
      return [];
    }
  }

  async function migrateLocal() {
    need();

    if (migrationPromise) return migrationPromise;

    const task = (async () => {

      const uid = await userId();

      const savedKey = "ard_saved_" + uid;
      const completedKey = "ard_completed_" + uid;

      const saved = readLocal(savedKey);
      const completed = readLocal(completedKey);

      if (!saved.length && !completed.length) return;

      const serverRows = await fetchAll({ force: true });

      const serverMap = new Map(
        serverRows.map(row => [
          String(row.lecture_id),
          row
        ])
      );

      const ids = [
        ...new Set([...saved, ...completed])
      ];

      const now = new Date().toISOString();

      const rows = ids.map(id => {

        const existing = serverMap.get(id) || {};

        const localCompleted = completed.includes(id);

        return {
          user_id: uid,
          lecture_id: id,

          saved:
            existing.saved === true ||
            saved.includes(id),

          completed:
            existing.completed === true ||
            localCompleted,

          completed_at:
            existing.completed_at ||
            (localCompleted ? now : null),

          updated_at: now
        };

      });

      const { error } = await db
        .from("lecture_progress")
        .upsert(rows, {
          onConflict: "user_id,lecture_id"
        });

      if (error) throw error;

      rows.forEach(row => {
        updateCachedRow(uid, {
          lecture_id: String(row.lecture_id),
          saved: !!row.saved,
          completed: !!row.completed,
          completed_at: row.completed_at
        });
      });

      localStorage.removeItem(savedKey);
      localStorage.removeItem(completedKey);

      invalidateCache();

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

  function init(client) {
    if (!client || typeof client.from !== "function") {
      throw new Error("عميل Supabase غير صالح.");
    }

    if (db !== client) {
      db = client;
      invalidateCache();
      fetchPromise = null;
      fetchUserId = null;
      migrationPromise = null;
      mutationQueues.clear();
    }
  }

  function clearCache() {
    invalidateCache();
    fetchPromise = null;
    fetchUserId = null;
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
