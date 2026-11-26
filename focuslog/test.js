const assert = require("assert");
const C = require("./core.js");
let n = 0;
function t(name, fn) { fn(); n++; console.log("ok -", name); }

t("makeSession clamps and formats", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 9, 5), plannedMin: 25, actualMin: 999, distractions: -3, subject: " math " });
  assert.strictEqual(s.date, "2026-11-25"); assert.strictEqual(s.start, "09:05");
  assert.strictEqual(s.actualMin, 55); assert.strictEqual(s.distractions, 0); assert.strictEqual(s.subject, "math");
});
t("planned minimum is 1", () => {
  assert.strictEqual(C.makeSession({ start: new Date(), plannedMin: 0, actualMin: 0 }).plannedMin, 1);
});
t("csv round trip with commas, quotes, newlines, arabic", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 9, 5), plannedMin: 25, actualMin: 20, distractions: 2,
    subject: "تفاضل, وتكامل", triggers: ["إشعار", "يوتيوب"], note: 'قال "تمام"\nسطر ثاني' });
  const rows = C.parseCSV(C.toCSV([s]));
  assert.deepStrictEqual(rows[0], C.CSV_HEADER);
  const col = (h) => rows[1][C.CSV_HEADER.indexOf(h)];
  assert.strictEqual(col("subject"), "تفاضل, وتكامل"); assert.strictEqual(col("triggers"), "إشعار|يوتيوب");
  assert.strictEqual(col("note"), 'قال "تمام"\nسطر ثاني'); assert.strictEqual(rows.length, 2);
});
t("csv neutralizes formula injection", () => {
  const s = C.makeSession({ start: new Date(), plannedMin: 5, actualMin: 5, subject: "=HYPERLINK(\"x\")" });
  assert.ok(C.toCSV([s]).split("\n")[1].includes("'=HYPERLINK"));
});
t("summarize rate and today", () => {
  const today = new Date(2026, 10, 25, 12);
  const a = C.makeSession({ start: today, plannedMin: 30, actualMin: 30, distractions: 3, triggers: ["a", "a", "b"], subject: "x" });
  const b = C.makeSession({ start: new Date(2026, 10, 24, 12), plannedMin: 30, actualMin: 30, distractions: 1, triggers: ["a"], subject: "x" });
  const s = C.summarize([a, b], today);
  assert.strictEqual(s.todayMin, 30); assert.strictEqual(s.totalMin, 60);
  assert.strictEqual(s.distractionsPerHour, 4); assert.strictEqual(s.byTrigger.a, 3);
});
t("summarize empty has no divide by zero", () => {
  assert.strictEqual(C.summarize([], new Date()).distractionsPerHour, 0);
});

t("loadStore migrates v1 array and drops bad rows", () => {
  const good = C.makeSession({ start: new Date(2026, 10, 25, 9, 5), plannedMin: 25, actualMin: 20 });
  const old = JSON.parse(JSON.stringify(good)); delete old.goal; delete old.goalDone; delete old.parked;
  const r = C.loadStore(JSON.stringify([old, { date: "bad" }, null, 5]));
  assert.strictEqual(r.sessions.length, 1); assert.strictEqual(r.dropped, 3); assert.strictEqual(r.sessions[0].goalDone, false);
});
t("loadStore flags corrupt json without throwing", () => {
  assert.strictEqual(C.loadStore("{not json").corrupt, true);
  assert.strictEqual(C.loadStore('{"version":2,"sessions":"x"}').corrupt, true);
  assert.strictEqual(C.loadStore(null).corrupt, false);
});
t("save then load round trip", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 9, 5), plannedMin: 25, actualMin: 20, goal: "10 مسائل", goalDone: true, parked: ["فيديو"] });
  const r = C.loadStore(C.saveStore([s])); assert.deepStrictEqual(r.sessions[0], s);
});
t("importCSV round trip, dedupes, reports bad rows", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 9, 5), plannedMin: 25, actualMin: 20, subject: "=x", goal: "g", goalDone: true });
  const csv = C.toCSV([s]) + "bad,row\n";
  const r1 = C.importCSV(csv, []);
  assert.strictEqual(r1.added.length, 1); assert.strictEqual(r1.added[0].subject, "=x"); assert.strictEqual(r1.errors.length, 1);
  const r2 = C.importCSV(csv, r1.added); assert.strictEqual(r2.added.length, 0); assert.strictEqual(r2.skipped, 1);
});
t("importCSV rejects file missing columns and empty file", () => {
  assert.ok(C.importCSV("a,b\n1,2\n", []).errors[0].includes("عمود"));
  assert.ok(C.importCSV("", []).errors.length === 1);
});

// ---- regressions from independent review (v1 -> v2 revision) ----
const rt = (s) => C.importCSV(C.toCSV([s]), []).added[0];
t("R: pipes and backslashes in lists survive round trip", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25, parked: ["a|b", "c\\d", ""], triggers: ["x|y"] });
  const r = rt(s); assert.deepStrictEqual(r.parked, ["a|b", "c\\d", ""]); assert.deepStrictEqual(r.triggers, ["x|y"]);
});
t("R: leading apostrophe/formula subjects round trip exactly", () => {
  ["'=real", "=1+1", "-5", "'", "''@x", "+1", "plain"].forEach((sub) => {
    const s = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25, subject: sub, goal: sub, note: sub });
    const r = rt(s); assert.strictEqual(r.subject, sub); assert.strictEqual(r.goal, sub); assert.strictEqual(r.note, sub);
  });
});
t("R: impossible dates, times, huge/float/negative numbers rejected on import", () => {
  const h = "date,start,planned_min,actual_min,distractions\n";
  ["2026-99-99,10:00,25,1,1", "2026-02-30,10:00,25,1,1", "2026-11-25,99:99,25,1,1", "2026-11-25,10:00,25,1e9,5",
   "2026-11-25,10:00,25.5,1,1", "2026-11-25,10:00,25,-1,1", "2026-11-25,10:00,0,1,1", "2026-11-25,10:00,9999,1,1",
   "2026-11-25,10:00,25,1,99999", "2026-11-25,10:00,25,1,Infinity"].forEach((row) => {
    const r = C.importCSV(h + row + "\n", []); assert.strictEqual(r.added.length, 0, row); assert.strictEqual(r.errors.length, 1, row);
  });
});
t("R: loadStore rejects non-integer/impossible stored values", () => {
  const base = { date: "2026-11-25", start: "10:00", plannedMin: 25, actualMin: 20, distractions: 1, triggers: [] };
  const bad = [Object.assign({}, base, { date: "2026-13-01" }), Object.assign({}, base, { actualMin: 1.5 }), Object.assign({}, base, { distractions: 1e9 })];
  const r = C.loadStore(JSON.stringify({ version: 2, sessions: bad.concat([base]) })); assert.strictEqual(r.sessions.length, 1); assert.strictEqual(r.dropped, 3);
});
t("R: same key different data is a reported conflict, not a silent skip", () => {
  const a = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25, subject: "x", distractions: 1 });
  const b = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 20, subject: "x", distractions: 9 });
  const r = C.importCSV(C.toCSV([b]), [a]); assert.strictEqual(r.conflicts, 1); assert.strictEqual(r.skipped, 0); assert.strictEqual(r.added.length, 0);
  assert.strictEqual(C.importCSV(C.toCSV([a]), [a]).skipped, 1);
});
t("R: dedupe key not fooled by pipes in fields", () => {
  const a = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25, subject: "a|10:00" });
  const b = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25, subject: "a" });
  assert.strictEqual(C.importCSV(C.toCSV([b]), [a]).added.length, 1);
});
t("R: BOM and CRLF accepted; semicolon CSV gives a clear error", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 25 });
  const csv = "\uFEFF" + C.toCSV([s]).replace(/\n/g, "\r\n");
  assert.strictEqual(C.importCSV(csv, []).added.length, 1);
  assert.ok(C.importCSV("date;start;planned_min;actual_min;distractions\n2026-11-25;10:00;25;25;1\n", []).errors[0].includes("منقوطة"));
});
t("R: future schema version is flagged, not read or overwritten as v2", () => {
  const r = C.loadStore('{"version":9,"sessions":[]}'); assert.strictEqual(r.future, true); assert.strictEqual(r.sessions.length, 0);
});
t("R: active clock counts only ticking time; sleep gap is away, not focus", () => {
  let a = C.newActive({ planned: 25 }, 0);
  for (let ms = 1000; ms <= 600000; ms += 1000) C.advance(a, ms);      // 10 min of ticks
  assert.strictEqual(a.activeMs, 600000);
  C.advance(a, 600000 + 3 * 3600000);                                    // phone slept 3h
  assert.strictEqual(a.activeMs, 600000); assert.strictEqual(a.awayMs, 3 * 3600000); assert.strictEqual(C.activeDone(a), false);
  const s = C.activeToSession(a, false); assert.strictEqual(s.actualMin, 10); assert.strictEqual(s.unverifiedMin, 180);
});
t("R: clock set backwards does not add time; cap at planned", () => {
  let a = C.newActive({ planned: 5 }, 100000); C.advance(a, 50000); assert.strictEqual(a.activeMs, 0);
  for (let ms = 51000; ms <= 400000; ms += 1000) C.advance(a, ms); assert.strictEqual(a.activeMs, 300000); assert.ok(C.activeDone(a));
});
t("R: activeValid rejects tampered stored session", () => {
  const a = C.newActive({ planned: 25 }, 1);
  assert.ok(C.activeValid(JSON.parse(JSON.stringify(a))));
  [{ planned: 0 }, { planned: 9999 }, { activeMs: -1 }, { triggers: "x" }, { distractions: 1.5 }, { startAt: "x" }].forEach((p) => assert.ok(!C.activeValid(Object.assign(JSON.parse(JSON.stringify(a)), p))));
  assert.ok(!C.activeValid(null));
});
// ---- recheck round 2 ----
t("R2: toCSVFile adds BOM and the BOM file imports; csv has unverified_min column", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 20, unverifiedMin: 7 });
  const f = C.toCSVFile([s]); assert.strictEqual(f.charCodeAt(0), 0xFEFF); assert.ok(C.CSV_HEADER.includes("unverified_min"));
  const r = C.importCSV(f, []); assert.strictEqual(r.added.length, 1); assert.strictEqual(r.added[0].unverifiedMin, 7);
});
t("R2: old CSV and old stored records without unverified_min import/load as 0", () => {
  const r = C.importCSV("date,start,planned_min,actual_min,distractions\n2026-11-25,10:00,25,20,1\n", []); assert.strictEqual(r.added[0].unverifiedMin, 0);
  const base = { date: "2026-11-25", start: "10:00", plannedMin: 25, actualMin: 20, distractions: 1, triggers: [] };
  assert.strictEqual(C.loadStore(JSON.stringify([base])).sessions[0].unverifiedMin, 0);
  assert.strictEqual(C.importCSV("date,start,planned_min,actual_min,unverified_min,distractions\n2026-11-25,10:00,25,20,-1,1\n", []).added.length, 0);
});
t("R2: sleep gap is reported as unverified minutes, tracked minutes stay separate", () => {
  let a = C.newActive({ planned: 25 }, 0); for (let ms = 1000; ms <= 120000; ms += 1000) C.advance(a, ms);
  C.advance(a, 120000 + 30 * 60000); for (let ms = 1; ms <= 60; ms++) C.advance(a, 120000 + 30 * 60000 + ms * 1000);
  const s = C.activeToSession(a, false); assert.strictEqual(s.actualMin, 3); assert.strictEqual(s.unverifiedMin, 30);
  const sm = C.summarize([s], new Date(2026, 0, 1)); assert.strictEqual(sm.unverifiedMin, 30); assert.strictEqual(sm.totalMin, 3);
});
t("R2: backupPlan bounds copies and skips identical ones", () => {
  const e = [{ key: "k.1", value: "a" }, { key: "k.2", value: "b" }, { key: "k.3", value: "c" }];
  assert.deepStrictEqual(C.backupPlan(e, "b", 3), { write: false, remove: [] });
  assert.deepStrictEqual(C.backupPlan(e, "d", 3), { write: true, remove: ["k.1"] });
  assert.deepStrictEqual(C.backupPlan([], "d", 3), { write: true, remove: [] });
  let st = e.slice(); for (let i = 0; i < 20; i++) { const p = C.backupPlan(st, "v" + i, 3); st = st.filter((x) => !p.remove.includes(x.key)); if (p.write) st.push({ key: "k." + (10 + i), value: "v" + i }); }
  assert.strictEqual(st.length, 3);
});
t("R2: mergeSession does not double-add the same finished session (two tabs)", () => {
  const s = C.makeSession({ start: new Date(2026, 10, 25, 10), plannedMin: 25, actualMin: 20 });
  const m1 = C.mergeSession([], s); assert.ok(m1.added);
  const m2 = C.mergeSession(m1.sessions, JSON.parse(JSON.stringify(s))); assert.ok(!m2.added); assert.strictEqual(m2.sessions.length, 1);
  const other = C.makeSession({ start: new Date(2026, 10, 25, 11), plannedMin: 25, actualMin: 20 }); assert.ok(C.mergeSession(m1.sessions, other).added);
});
const mk = (d, h, plan, act, dist, subj, extra) => Object.assign(C.makeSession({ start: new Date(2026, 10, d, h, 0), plannedMin: plan, actualMin: act, distractions: dist, subject: subj, triggers: dist ? ["tiktok"] : [] }), extra || {});
t("W1: weekly report sums one Saturday-based week only, by day, subject, time of day, with goals", () => {
  // 2026-11-21 is a Saturday. Week = 21..27 Nov.
  const s = [mk(21, 9, 25, 25, 1, "math"), mk(22, 20, 25, 20, 3, "math", { goal: "x", goalDone: true }), mk(27, 23, 25, 10, 0, "phys", { goal: "y", goalDone: false }), mk(20, 9, 25, 25, 9, "math"), mk(28, 9, 25, 25, 9, "math")];
  const r = C.weeklyReport(s, "2026-11-25", 6);
  assert.strictEqual(r.start, "2026-11-21"); assert.strictEqual(r.end, "2026-11-27");
  assert.strictEqual(r.sessions, 3); assert.strictEqual(r.trackedMin, 55); assert.strictEqual(r.distractions, 4);
  assert.deepStrictEqual(r.days.map(d => d.trackedMin), [25, 20, 0, 0, 0, 0, 10]);
  assert.strictEqual(r.parts.morning.trackedMin, 25); assert.strictEqual(r.parts.evening.trackedMin, 20); assert.strictEqual(r.parts.night.trackedMin, 10);
  assert.deepStrictEqual(r.goals, { withGoal: 2, done: 1 });
  assert.deepStrictEqual(r.subjects.map(x => [x.subject, x.plannedMin, x.trackedMin]), [["math", 50, 45], ["phys", 25, 10]]);
  assert.strictEqual(r.prevStart, "2026-11-14"); assert.strictEqual(r.nextStart, "2026-11-28");
});
t("W2: rates are not shown for under 30 tracked minutes; empty week is all zeros; bad week start still works", () => {
  const r = C.weeklyReport([mk(22, 9, 25, 20, 5, "a")], "2026-11-22", 6);
  assert.strictEqual(r.perHour, null); assert.strictEqual(r.parts.morning.perHour, null);
  const e = C.weeklyReport([], "2026-11-22", 0); assert.strictEqual(e.sessions, 0); assert.strictEqual(e.perHour, null); assert.strictEqual(e.start, "2026-11-22");
  assert.strictEqual(C.weekStartOf("2026-03-01", 6), "2026-02-28"); assert.strictEqual(C.addDays("2026-12-31", 1), "2027-01-01");
});
t("W3: unverified minutes are reported separately and never added to tracked", () => {
  const r = C.weeklyReport([mk(22, 9, 25, 20, 0, "a", { unverifiedMin: 40 })], "2026-11-22", 6);
  assert.strictEqual(r.trackedMin, 20); assert.strictEqual(r.unverifiedMin, 40);
});
t("P1: subjects/triggers/conditions named like Object.prototype members are kept as data, and Object.prototype is never touched", () => {
  const names = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"];
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  const s = names.map((nm, i) => mk(24, 9 + i, 25, 20, 1, nm, { triggers: [nm] }));
  const r = C.weeklyReport(s, "2026-11-24", 6), su = C.summarize(s, new Date());
  assert.deepStrictEqual(r.subjects.map(x => x.subject).sort(), names.slice().sort()); assert.ok(r.subjects.every(x => x.trackedMin === 20 && x.sessions === 1));
  assert.deepStrictEqual(r.triggers.map(x => x.trigger).sort(), names.slice().sort());
  assert.deepStrictEqual(Object.keys(su.bySubject).sort(), names.slice().sort()); assert.ok(names.every(nm => su.bySubject[nm] === 20 && su.byTrigger[nm] === 1));
  const csv = C.toCSV(s), imp = C.importCSV(csv, []); assert.strictEqual(imp.added.length, 5);
  assert.strictEqual(C.importCSV(csv, imp.added).skipped, 5);
  assert.strictEqual(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
  assert.strictEqual(({}).trackedMin, undefined); assert.strictEqual(({}).sessions, undefined);
});
t("P2: mergeSession preferExisting: same identity with edited content is a conflict, not a double", () => {
  const a = mk(24, 9, 25, 20, 1, "m"), edited = Object.assign({}, a, { actualMin: 22 });
  assert.strictEqual(C.mergeSession([a], edited).sessions.length, 2);                       // default (two-tab safety) keeps both
  const m = C.mergeSession([a], edited, true); assert.deepStrictEqual([m.sessions.length, m.added, m.conflict], [1, false, true]);
  const same = C.mergeSession([a], Object.assign({}, a), true); assert.deepStrictEqual([same.added, same.conflict], [false, false]);
});
console.log(n + " tests passed");
