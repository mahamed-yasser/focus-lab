const assert = require("assert"); const P = require("./plan.js"); let n = 0;
const t = (name, f) => { f(); n++; console.log("ok -", name); };
const S = (date, subject, m) => ({ date, subject, actualMin: m });
t("saturday week bounds", () => {
  assert.deepStrictEqual(P.weekBounds("2026-11-25", 6), { start: "2026-11-21", end: "2026-11-27", dayIndex: 4 }); // Wed
  assert.strictEqual(P.weekBounds("2026-11-21", 6).dayIndex, 0);
  assert.strictEqual(P.weekBounds("2026-11-27", 6).end, "2026-11-27");
});
t("month and year rollover and leap day", () => {
  assert.strictEqual(P.weekBounds("2027-01-01", 6).start, "2026-12-26");
  assert.strictEqual(P.weekBounds("2028-02-29", 1).start, "2028-02-28");
});
t("rejects impossible dates", () => { assert.throws(() => P.weekBounds("2026-02-30", 6)); assert.throws(() => P.weekBounds("x", 6)); });
t("progress counts only this week and target subjects", () => {
  const r = P.progress({ فيزياء: 300, كيمياء: 200 }, [S("2026-11-22", "فيزياء", 100), S("2026-11-14", "فيزياء", 999), S("2026-11-25", "أحياء", 40)], "2026-11-25");
  assert.strictEqual(r.rows[0].done, 100); assert.strictEqual(r.rows[0].pct, 33); assert.strictEqual(r.unassignedMin, 40);
  assert.strictEqual(r.daysLeft, 3); assert.strictEqual(r.rows[0].perDayToCatchUp, 67); assert.strictEqual(r.rows[1].perDayToCatchUp, 67);
});
t("overshoot capped at 100 pct, nothing left", () => {
  const r = P.progress({ a: 60 }, [S("2026-11-22", "a", 500)], "2026-11-25");
  assert.strictEqual(r.rows[0].pct, 100); assert.strictEqual(r.rows[0].left, 0); assert.strictEqual(r.unrealistic, false);
});
t("last day of week with big shortfall flagged unrealistic", () => {
  const r = P.progress({ a: 1000 }, [], "2026-11-27"); assert.strictEqual(r.daysLeft, 1); assert.ok(r.unrealistic && r.note);
});
t("zero target and prototype-key subjects safe", () => {
  const r = P.progress({ a: 0, constructor: 60 }, [S("2026-11-22", "toString", 10)], "2026-11-25");
  assert.strictEqual(r.rows[0].pct, 100); assert.strictEqual(r.unassignedMin, 10);
});
t("validateTargets", () => {
  const v = P.validateTargets({ " a ": "120.4", "": 5, b: -1, c: "x", d: 99999 });
  assert.deepStrictEqual(v.targets, { a: 120 }); assert.strictEqual(v.errors.length, 4);
});
t("regression: __proto__ subject rejected, not silently dropped", () => {
  const o = JSON.parse('{"__proto__": 50, "ok": 10}');
  const v = P.validateTargets(o); assert.deepStrictEqual(Object.keys(v.targets), ["ok"]); assert.strictEqual(v.errors.length, 1);
});
t("P3: WeekPlan targets/subjects named like Object.prototype members work and do not pollute", () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  const v = P.validateTargets(JSON.parse('{"__proto__": 100, "constructor": 50, "toString": 30}'));
  const pr = P.progress(v.targets, [S("2026-11-24", "constructor", 25), S("2026-11-24", "valueOf", 5)], "2026-11-24", { weekStart: 6 });
  assert.ok(v.errors.length === 1 && !("__proto__" in v.targets && Object.prototype.hasOwnProperty.call(v.targets, "__proto__"))); assert.strictEqual(pr.rows.find(r => r.subject === "constructor").done, 25); assert.strictEqual(pr.unassignedMin, 5);
  assert.strictEqual(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
});
console.log(n + " tests passed");
