// FocusLog core logic. Pure functions, no DOM, tested with node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FocusCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var CSV_HEADER = ["date", "start", "subject", "condition", "planned_min", "actual_min", "unverified_min", "distractions", "triggers", "goal", "goal_done", "parked", "note"];
  var SCHEMA_VERSION = 2;

  var MAX_PLANNED = 600, MAX_ACTUAL = 1440, MAX_DIST = 2000;
  function isInt(x) { return typeof x === "number" && Number.isInteger(x); }
  function realDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str); if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function realTime(str) { var m = /^(\d{2}):(\d{2})$/.exec(str); return !!m && +m[1] < 24 && +m[2] < 60; }
  // Lists are stored in one CSV cell separated by "|". "\\" and "|" inside an item are escaped.
  function joinList(a) { return a.map(function (x) { return String(x).replace(/\\/g, "\\\\").replace(/\|/g, "\\|"); }).join("|"); }
  function splitList(str) {
    if (!str) return [];
    var out = [], cur = "";
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (c === "\\" && i + 1 < str.length) { cur += str[++i]; }
      else if (c === "|") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur); return out;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // Build a session record. Minutes are whole numbers, never negative, never above planned+30.
  function makeSession(opts) {
    var planned = Math.min(MAX_PLANNED, Math.max(1, Math.round(Number(opts.plannedMin) || 0)));
    var actual = Math.max(0, Math.round(Number(opts.actualMin) || 0));
    var unver = Math.min(MAX_ACTUAL, Math.max(0, Math.round(Number(opts.unverifiedMin) || 0)));
    var start = opts.start instanceof Date ? opts.start : new Date(opts.start);
    return {
      date: dateKey(start),
      start: pad(start.getHours()) + ":" + pad(start.getMinutes()),
      subject: String(opts.subject || "").trim(),
      condition: String(opts.condition || "").trim(),
      plannedMin: planned,
      actualMin: Math.min(actual, planned + 30),   // TRACKED minutes: the page was running and ticking
      unverifiedMin: unver,                        // time that passed with the page NOT ticking; may or may not have been study

      distractions: Math.min(MAX_DIST, Math.max(0, Math.round(Number(opts.distractions) || 0))),
      triggers: (opts.triggers || []).map(String),
      goal: String(opts.goal || "").trim(),
      goalDone: opts.goalDone === true,
      parked: (opts.parked || []).map(String),
      note: String(opts.note || "").trim()
    };
  }

  function csvCell(v) {
    var s = String(v);
    // Neutralize spreadsheet formulas when the file is opened in Excel/Sheets.
    if (/^'*[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(sessions) {
    var lines = [CSV_HEADER.join(",")];
    sessions.forEach(function (s) {
      lines.push([s.date, s.start, s.subject, s.condition, s.plannedMin, s.actualMin, s.unverifiedMin,
        s.distractions, joinList(s.triggers), s.goal, s.goalDone ? "yes" : "no", joinList(s.parked), s.note].map(csvCell).join(","));
    });
    return lines.join("\n") + "\n";
  }

  // Minimal RFC4180 parser for round-trip tests and import.
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false, i = 0;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function summarize(sessions, today) {
    var total = 0, unver = 0, dist = 0, byTrigger = Object.create(null), bySubject = Object.create(null);
    sessions.forEach(function (s) {
      total += s.actualMin; unver += s.unverifiedMin || 0; dist += s.distractions;
      s.triggers.forEach(function (t) { byTrigger[t] = (byTrigger[t] || 0) + 1; });
      if (s.subject) bySubject[s.subject] = (bySubject[s.subject] || 0) + s.actualMin;
    });
    var todayKey = today ? dateKey(today) : null;
    var todayMin = 0;
    sessions.forEach(function (s) { if (s.date === todayKey) todayMin += s.actualMin; });
    return {
      sessions: sessions.length,
      totalMin: total,
      unverifiedMin: unver,
      todayMin: todayMin,
      distractions: dist,
      distractionsPerHour: total > 0 ? Math.round((dist / (total / 60)) * 10) / 10 : 0,
      byTrigger: byTrigger,
      bySubject: bySubject
    };
  }

  // ---- weekly report (descriptive only: sums and rates for one week, no inference, no advice about causes) ----
  function addDays(key, n) { var p = key.split("-"); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function weekStartOf(key, weekStartDay) {
    var p = key.split("-"); var wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
    return addDays(key, -((wd - weekStartDay + 7) % 7));
  }
  function partOfDay(hhmm) { var h = parseInt(hhmm, 10); return h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night"; }
  function emptyWeek(start) {
    var days = []; for (var i = 0; i < 7; i++) days.push({ date: addDays(start, i), trackedMin: 0, unverifiedMin: 0, sessions: 0 });
    return days;
  }
  function weeklyReport(sessions, anyDayInWeek, weekStartDay) {
    var start = weekStartOf(anyDayInWeek, weekStartDay == null ? 6 : weekStartDay), end = addDays(start, 6);
    var days = emptyWeek(start), parts = Object.create(null), subjects = Object.create(null), triggers = Object.create(null), tracked = 0, unver = 0, dist = 0, withGoal = 0, goalDone = 0, n = 0;
    ["morning", "afternoon", "evening", "night"].forEach(function (k) { parts[k] = { trackedMin: 0, distractions: 0, sessions: 0, perHour: null }; });
    sessions.forEach(function (s) {
      if (s.date < start || s.date > end) return;
      n++; tracked += s.actualMin; unver += s.unverifiedMin || 0; dist += s.distractions;
      var d = days[Math.round((Date.parse(s.date) - Date.parse(start)) / 86400000)]; d.trackedMin += s.actualMin; d.unverifiedMin += s.unverifiedMin || 0; d.sessions++;
      var p = parts[partOfDay(s.start)]; p.trackedMin += s.actualMin; p.distractions += s.distractions; p.sessions++;
      var sub = s.subject || "-"; var r = subjects[sub] || (subjects[sub] = { subject: sub, plannedMin: 0, trackedMin: 0, sessions: 0 });
      r.plannedMin += s.plannedMin; r.trackedMin += s.actualMin; r.sessions++;
      s.triggers.forEach(function (t) { triggers[t] = (triggers[t] || 0) + 1; });
      if (s.goal) { withGoal++; if (s.goalDone) goalDone++; }
    });
    Object.keys(parts).forEach(function (k) { var p = parts[k]; p.perHour = p.trackedMin >= 30 ? Math.round(p.distractions / (p.trackedMin / 60) * 10) / 10 : null; }); // under 30 tracked minutes: no rate shown
    return { start: start, end: end, sessions: n, trackedMin: tracked, unverifiedMin: unver, distractions: dist,
      perHour: tracked >= 30 ? Math.round(dist / (tracked / 60) * 10) / 10 : null,
      days: days, parts: parts, goals: { withGoal: withGoal, done: goalDone },
      subjects: Object.keys(subjects).map(function (k) { return subjects[k]; }).sort(function (a, b) { return b.trackedMin - a.trackedMin; }),
      triggers: Object.keys(triggers).map(function (k) { return { trigger: k, count: triggers[k] }; }).sort(function (a, b) { return b.count - a.count; }),
      prevStart: addDays(start, -7), nextStart: addDays(start, 7) };
  }

  function validRecord(x) {
    return !!x && typeof x === "object" && realDate(x.date) && realTime(x.start) &&
      isInt(x.plannedMin) && x.plannedMin >= 1 && x.plannedMin <= MAX_PLANNED &&
      isInt(x.actualMin) && x.actualMin >= 0 && x.actualMin <= MAX_ACTUAL &&
      isInt(x.unverifiedMin) && x.unverifiedMin >= 0 && x.unverifiedMin <= MAX_ACTUAL &&
      isInt(x.distractions) && x.distractions >= 0 && x.distractions <= MAX_DIST && Array.isArray(x.triggers);
  }

  // Accepts raw localStorage text. Returns {sessions, dropped, corrupt}. Never throws.
  // v1 was a bare array of sessions; v2 is {version, sessions}.
  function loadStore(raw) {
    if (raw == null || raw === "") return { sessions: [], dropped: 0, corrupt: false };
    var data;
    try { data = JSON.parse(raw); } catch (e) { return { sessions: [], dropped: 0, corrupt: true }; }
    if (data && !Array.isArray(data) && typeof data.version === "number" && data.version > SCHEMA_VERSION)
      return { sessions: [], dropped: 0, corrupt: false, future: true };
    var arr = Array.isArray(data) ? data : (data && Array.isArray(data.sessions) ? data.sessions : null);
    if (!arr) return { sessions: [], dropped: 0, corrupt: true };
    var out = [], dropped = 0;
    arr.forEach(function (x) {
      if (x && typeof x === "object" && x.unverifiedMin === undefined) x = Object.assign({}, x, { unverifiedMin: 0 });   // records saved before this field existed
      if (!validRecord(x)) { dropped++; return; }
      out.push({ date: x.date, start: x.start, subject: String(x.subject || ""), condition: String(x.condition || ""),
        plannedMin: x.plannedMin, actualMin: x.actualMin, unverifiedMin: x.unverifiedMin, distractions: x.distractions, triggers: x.triggers.map(String),
        goal: String(x.goal || ""), goalDone: x.goalDone === true, parked: Array.isArray(x.parked) ? x.parked.map(String) : [],
        note: String(x.note || "") });
    });
    return { sessions: out, dropped: dropped, corrupt: false };
  }

  function saveStore(sessions) { return JSON.stringify({ version: SCHEMA_VERSION, sessions: sessions }); }

  function key(s) { return JSON.stringify([s.date, s.start, s.subject, s.plannedMin]); }
  function full(s) { return JSON.stringify([s.date, s.start, s.subject, s.condition, s.plannedMin, s.actualMin, s.unverifiedMin, s.distractions, s.triggers, s.goal, s.goalDone, s.parked, s.note]); }

  function strictNum(v) { return /^\d{1,6}$/.test(String(v).trim()) ? Number(v) : NaN; }

  // Import a CSV (current or older 9-column header). Returns {added, skipped, errors[]}; skips duplicates.
  function importCSV(text, existing) {
    var rows = parseCSV(text), errors = [], added = [], seen = Object.create(null), conflicts = 0;
    existing.forEach(function (s) { seen[key(s)] = full(s); });
    if (!rows.length) return { added: [], skipped: 0, conflicts: 0, errors: ["الملف فاضي"] };
    if (rows[0].length === 1 && rows[0][0].indexOf(";") >= 0) return { added: [], skipped: 0, conflicts: 0, errors: ["الملف بفاصلة منقوطة. احفظه بفاصلة عادية (,)"] };
    var head = rows[0].map(function (h) { return h.trim(); });
    var need = ["date", "start", "planned_min", "actual_min", "distractions"];
    for (var i = 0; i < need.length; i++) if (head.indexOf(need[i]) < 0) return { added: [], skipped: 0, conflicts: 0, errors: ["عمود ناقص: " + need[i]] };
    var skipped = 0;
    rows.slice(1).forEach(function (r, idx) {
      if (r.length === 1 && r[0] === "") return;
      var o = {}; head.forEach(function (h, j) { o[h] = r[j] === undefined ? "" : r[j]; });
      var rec = {
        date: o.date, start: o.start, subject: o.subject || "", condition: o.condition || "",
        plannedMin: strictNum(o.planned_min), actualMin: strictNum(o.actual_min), unverifiedMin: o.unverified_min === undefined || o.unverified_min === "" ? 0 : strictNum(o.unverified_min), distractions: strictNum(o.distractions),
        triggers: splitList(o.triggers), goal: o.goal || "", goalDone: o.goal_done === "yes",
        parked: splitList(o.parked), note: o.note || ""
      };
      ["subject", "goal", "note", "condition"].forEach(function (f) { rec[f] = rec[f].replace(/^'(?='*[=+\-@\t\r])/, ""); });
      if (!validRecord(rec)) { errors.push("سطر " + (idx + 2) + " غير صالح"); return; }
      var k = key(rec);
      if (seen[k] !== undefined) {
        if (seen[k] === full(rec)) skipped++;
        else { conflicts++; errors.push("سطر " + (idx + 2) + " نفس الجلسة بس ببيانات مختلفة، اتساب"); }
        return;
      }
      seen[k] = full(rec); added.push(rec);
    });
    return { added: added, skipped: skipped, conflicts: conflicts, errors: errors };
  }

  // Active-session clock. Time only counts while the page keeps ticking (gaps over MAX_TICK_MS,
  // e.g. phone asleep or tab suspended, are tracked as away time and never counted as focus).
  var MAX_TICK_MS = 5000;
  function newActive(opts, now) {
    return { v: 1, startAt: now, last: now, activeMs: 0, awayMs: 0, planned: opts.planned, subject: opts.subject || "",
      cond: opts.cond || "", goal: opts.goal || "", distractions: 0, triggers: [], parked: [] };
  }
  function advance(a, now) {
    var d = now - a.last;
    if (d < 0) { a.last = now; return a; }           // clock moved back: ignore
    if (d <= MAX_TICK_MS) a.activeMs += d; else a.awayMs += d;
    a.last = now;
    if (a.activeMs > a.planned * 60000) a.activeMs = a.planned * 60000;
    return a;
  }
  function activeDone(a) { return a.activeMs >= a.planned * 60000; }
  function activeValid(a) {
    return !!a && a.v === 1 && Number.isFinite(a.startAt) && Number.isFinite(a.last) && Number.isFinite(a.activeMs) &&
      a.activeMs >= 0 && isInt(a.planned) && a.planned >= 1 && a.planned <= MAX_PLANNED && Array.isArray(a.triggers) && Array.isArray(a.parked) &&
      isInt(a.distractions) && a.distractions >= 0;
  }
  function activeToSession(a, goalDone) {
    return makeSession({ start: new Date(a.startAt), subject: a.subject, condition: a.cond, plannedMin: a.planned,
      actualMin: Math.round(a.activeMs / 60000), unverifiedMin: Math.round(a.awayMs / 60000), distractions: a.distractions, triggers: a.triggers,
      goal: a.goal, goalDone: goalDone, parked: a.parked, note: "" });
  }

  // CSV for a file download: UTF-8 with BOM so Excel shows Arabic correctly. Readers must accept the BOM.
  function toCSVFile(sessions) { return "\uFEFF" + toCSV(sessions); }

  // Keep at most `max` safety copies per kind, and do not write the same copy twice.
  // entries: [{key, value}] already in storage for that kind (key names sort by time). Returns {write, remove[]}.
  function backupPlan(entries, raw, max) {
    if (entries.some(function (e) { return e.value === raw; })) return { write: false, remove: [] };
    var sorted = entries.slice().sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    var drop = Math.max(0, sorted.length + 1 - max);
    return { write: true, remove: sorted.slice(0, drop).map(function (e) { return e.key; }) };
  }

  // Add a finished session to what is already stored (another tab may have written meanwhile).
  // preferExisting: a record with the same identity but different content is NOT added (the stored one wins) and is reported as a conflict.
  function mergeSession(stored, rec, preferExisting) {
    var k = key(rec), f = full(rec), conflict = false;
    for (var i = 0; i < stored.length; i++) if (key(stored[i]) === k) {
      if (full(stored[i]) === f) return { sessions: stored, added: false, conflict: false };
      conflict = true;
      if (preferExisting) return { sessions: stored, added: false, conflict: true };
    }
    return { sessions: stored.concat([rec]), added: true, conflict: conflict };
  }

  return { toCSVFile: toCSVFile, backupPlan: backupPlan, mergeSession: mergeSession, newActive: newActive, advance: advance, activeDone: activeDone, activeValid: activeValid, activeToSession: activeToSession,
    MAX_TICK_MS: MAX_TICK_MS, loadStore: loadStore, saveStore: saveStore, importCSV: importCSV, SCHEMA_VERSION: SCHEMA_VERSION, CSV_HEADER: CSV_HEADER, makeSession: makeSession, toCSV: toCSV, parseCSV: parseCSV, summarize: summarize, dateKey: dateKey, weeklyReport: weeklyReport, weekStartOf: weekStartOf, addDays: addDays };
});
