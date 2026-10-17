"use strict";
/* منطق التقدم المشترك بين الصفحات — يخزن في جدول lecture_progress على Supabase
   الاستخدام في أي صفحة: ArdProgress.init(supabaseClient) ثم setSaved / setCompleted */
window.ArdProgress = (function () {
  let db = null;

  function need() { if (!db) throw new Error("استدعِ ArdProgress.init(client) أولاً"); }

  async function userId() {
    need();
    const { data: { session } } = await db.auth.getSession();
    if (!session) throw new Error("سجّل الدخول أولاً");
    return session.user.id;
  }

  async function fetchAll() {
    need();
    const { data, error } = await db.from("lecture_progress").select("lecture_id, saved, completed, completed_at");
    if (error) throw error;
    return data || [];
  }

  async function upsert(lectureId, patch) {
    const row = { user_id: await userId(), lecture_id: String(lectureId), ...patch, updated_at: new Date().toISOString() };
    const { error } = await db.from("lecture_progress").upsert(row, { onConflict: "user_id,lecture_id" });
    if (error) throw error;
    window.dispatchEvent(new Event("ard:progress"));
  }

  const setSaved = (lectureId, value) => upsert(lectureId, { saved: !!value });
  const setCompleted = (lectureId, value) =>
    upsert(lectureId, { completed: !!value, completed_at: value ? new Date().toISOString() : null });

  /* نقل بيانات الإصدار القديم (localStorage) إلى الحساب مرة واحدة */
  async function migrateLocal() {
    const uid = await userId();
    const read = t => {
      try { const v = JSON.parse(localStorage.getItem("ard_" + t + "_" + uid) || "[]"); return Array.isArray(v) ? v.map(String) : []; }
      catch { return []; }
    };
    const saved = read("saved"), done = read("completed");
    if (!saved.length && !done.length) return;
    const now = new Date().toISOString();
    const rows = [...new Set([...saved, ...done])].map(id => ({
      user_id: uid, lecture_id: id, saved: saved.includes(id), completed: done.includes(id), completed_at: done.includes(id) ? now : null
    }));
    const { error } = await db.from("lecture_progress").upsert(rows, { onConflict: "user_id,lecture_id" });
    if (error) throw error; // نُبقي البيانات المحلية إن فشل النقل
    localStorage.removeItem("ard_saved_" + uid);
    localStorage.removeItem("ard_completed_" + uid);
  }

  return { init: c => { db = c; }, fetchAll, setSaved, setCompleted, migrateLocal };
})();
