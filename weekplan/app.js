(function () {
  var TK = "weekplan.targets.v1", SK = "focuslog.sessions.v1", WK = "weekplan.weekstart.v1", IK = "weekplan.imported.v1";
  var $ = function (i) { return document.getElementById(i); };
  var targets = {}, sessions = [];
  function say(t) { var m = $("msg"); m.textContent = t; m.hidden = !t; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { say("مقدرناش نحفظ على الجهاز."); } }
  function init() {
    try { targets = WeekPlan.validateTargets(JSON.parse(get(TK) || "{}")).targets; } catch (e) { targets = {}; say("هدف محفوظ تالف واتتجاهل."); }
    var r = FocusCore.loadStore(get(SK)); sessions = r.sessions;
    var imp = FocusCore.loadStore(get(IK)); if (!imp.corrupt && !imp.future) sessions = union(sessions, imp.sessions);
    var ws = get(WK); if (ws !== null && /^[0-6]$/.test(ws)) $("ws").value = ws;
  }
  function union(a, b) {
    var out = a.slice();
    b.forEach(function (x) { var m = FocusCore.mergeSession(out, x, true); out = m.sessions; });
    return out;
  }
  function today() { var d = new Date(); return FocusCore.dateKey(d); }
  function render() {
    var out = $("out"); out.textContent = "";
    var p = WeekPlan.progress(targets, sessions, today(), { weekStart: Number($("ws").value) });
    if (!p.rows.length) { out.textContent = "ضيف هدف مادة الأول."; $("note").textContent = ""; return; }
    p.rows.forEach(function (r) {
      var box = document.createElement("div");
      var t = document.createElement("div"); t.textContent = r.subject + ": " + r.done + " / " + r.target + " دقيقة متتبعة (" + r.pct + "%)";
      var bar = document.createElement("div"); bar.className = "bar"; bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuenow", r.pct); bar.setAttribute("aria-valuemin", 0); bar.setAttribute("aria-valuemax", 100);
      var f = document.createElement("div"); f.style.width = r.pct + "%"; bar.appendChild(f);
      var s = document.createElement("div"); s.className = "mute";
      s.textContent = r.left ? "الناقص " + r.left + " دقيقة، حوالي " + r.perDayToCatchUp + " في اليوم لباقي الأسبوع" : "خلصت الهدف";
      var rm = document.createElement("button"); rm.className = "sec"; rm.textContent = "حذف"; rm.setAttribute("aria-label", "حذف " + r.subject);
      rm.addEventListener("click", function () { delete targets[r.subject]; put(TK, JSON.stringify(targets)); render(); });
      [t, bar, s, rm].forEach(function (x) { box.appendChild(x); });
      box.style.marginBottom = "14px"; out.appendChild(box);
    });
    if (p.unassignedMin) { var u = document.createElement("div"); u.className = "mute"; u.textContent = "وقت على مواد من غير هدف: " + p.unassignedMin + " دقيقة"; out.appendChild(u); }
    $("note").textContent = p.note;
  }
  $("add").addEventListener("click", function () {
    var o = {}; o[$("sub").value] = $("min").value;
    var v = WeekPlan.validateTargets(o);
    if (v.errors.length) { say(v.errors[0]); return; }
    Object.assign(targets, v.targets); put(TK, JSON.stringify(targets)); say(""); render();
  });
  $("ws").addEventListener("change", function () { put(WK, $("ws").value); render(); });
  $("import").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    if (f.size > 2000000) { say("الملف كبير أوي."); return; }
    var rd = new FileReader();
    rd.onload = function () {
      var r = FocusCore.importCSV(String(rd.result), sessions);
      var prev = FocusCore.loadStore(get(IK)); var saved = (prev.corrupt || prev.future) ? [] : prev.sessions;
      var all = union(saved, r.added);
      put(IK, FocusCore.saveStore(all));            // kept on this device, so the plan survives a reload
      sessions = union(sessions, r.added);
      say("اتضاف " + r.added.length + " جلسة وانحفظت هنا" + (r.skipped ? "، متكرر " + r.skipped : "") + (r.conflicts ? "، متعارض " + r.conflicts : "") + (r.errors.length ? "، ملاحظات: " + r.errors.length : "")); render();
    };
    rd.readAsText(f); this.value = "";
  });
  init(); render();
})();
