// WeekPlan core: weekly study targets per subject vs what FocusLog actually recorded.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WeekPlan = factory();
})(typeof self !== "undefined" ? self : this, function () {
  function parseDate(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 ? d : null; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  // weekStart: 0=Sunday..6=Saturday. Egypt's school week is often Saturday-based, so it is a setting.
  function weekBounds(dateStr, weekStart) {
    var d = parseDate(dateStr); if (!d) throw new Error("bad date");
    var back = (d.getUTCDay() - weekStart + 7) % 7;
    var s = new Date(d.getTime() - back * 86400000), e = new Date(s.getTime() + 6 * 86400000);
    return { start: iso(s), end: iso(e), dayIndex: back };
  }
  // targets: {subject: minutesPerWeek}. sessions: FocusLog records. maxPerDay: realistic cap for catch-up advice.
  function progress(targets, sessions, today, opts) {
    opts = opts || {}; var ws = opts.weekStart == null ? 6 : opts.weekStart, cap = opts.maxPerDay || 240;
    var wb = weekBounds(today, ws), done = Object.create(null), other = 0;
    sessions.forEach(function (s) {
      if (s.date < wb.start || s.date > wb.end) return;
      if (Object.prototype.hasOwnProperty.call(targets, s.subject)) done[s.subject] = (done[s.subject] || 0) + s.actualMin;
      else other += s.actualMin;
    });
    var daysLeft = 7 - wb.dayIndex; // includes today
    var rows = Object.keys(targets).map(function (sub) {
      var t = targets[sub], d = done[sub] || 0, left = Math.max(0, t - d);
      return { subject: sub, target: t, done: d, left: left, pct: t > 0 ? Math.min(100, Math.round(d / t * 100)) : 100,
        perDayToCatchUp: Math.ceil(left / daysLeft) };
    });
    var totalPerDay = rows.reduce(function (a, r) { return a + r.perDayToCatchUp; }, 0);
    return { week: wb, daysLeft: daysLeft, rows: rows, unassignedMin: other, totalPerDay: totalPerDay,
      unrealistic: totalPerDay > cap,
      note: totalPerDay > cap ? "المطلوب في اليوم أكتر من " + cap + " دقيقة. قلل الأهداف أو انقل جزء للأسبوع الجاي." : "" };
  }
  function validateTargets(obj) {
    var out = {}, errs = [];
    Object.keys(obj || {}).forEach(function (k) {
      var name = String(k).trim(), v = Number(obj[k]);
      if (!name) { errs.push("اسم مادة فاضي"); return; }
      if (name === "__proto__") { errs.push("اسم غير مسموح: " + name); return; }
      if (!Number.isFinite(v) || v < 0 || v > 3000) { errs.push("هدف غير صالح: " + name); return; }
      out[name] = Math.round(v);
    });
    return { targets: out, errors: errs };
  }
  return { weekBounds: weekBounds, progress: progress, validateTargets: validateTargets };
});
