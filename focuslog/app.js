(function () {
  var KEY = "focuslog.sessions.v1", AKEY = "focuslog.active.v1";
  var MAX_BACKUPS = 3;
  var TRIGGERS = ["إشعار", "يوتيوب", "انستجرام", "تيك توك", "واتساب", "فيسبوك", "ملل", "تعب", "غير ذلك"];
  var $ = function (id) { return document.getElementById(id); };
  var pendingMsg = "", readOnly = false;
  var sessions = load();
  var cur = null, timer = null, tickCount = 0, finishing = false;
  var TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);   // identifies which tab owns the running session

  function say(t) { var m = $("msg"); m.textContent = t; m.hidden = !t; }

  // ---- in-page confirmation (does not block the page like window.confirm) ----
  function ask(text, yes, no) {
    return new Promise(function (resolve) {
      $("dlg-text").textContent = text;
      $("dlg-yes").textContent = yes || "تمام"; $("dlg-no").textContent = no || "لأ";
      var box = $("dlg"), before = document.activeElement; box.hidden = false; $("dlg-yes").focus();
      function done(v) {
        box.hidden = true; $("dlg-yes").onclick = $("dlg-no").onclick = null; document.removeEventListener("keydown", key, true);
        if (before && before.focus && document.contains(before)) before.focus();
        resolve(v);
      }
      // Escape = the safe answer (no); Tab stays inside the dialog.
      function key(e) {
        if (e.key === "Escape") { e.preventDefault(); done(null); }   // null = cancel: callers must treat it as "do nothing", never as yes or no
        else if (e.key === "Tab") {
          var f = [$("dlg-yes"), $("dlg-no")], i = f.indexOf(document.activeElement);
          e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      document.addEventListener("keydown", key, true);
      $("dlg-yes").onclick = function () { done(true); };
      $("dlg-no").onclick = function () { done(false); };
    });
  }

  // ---- storage helpers ----
  function entries(prefix) {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(prefix) === 0) out.push({ key: k, value: localStorage.getItem(k) }); } } catch (e) {}
    return out;
  }
  // Keep a safety copy of raw data under KEY.<kind>.<time>. At most MAX_BACKUPS per kind, no identical repeats.
  function backup(kind, raw) {
    var prefix = KEY + "." + kind + ".";
    var plan = FocusCore.backupPlan(entries(prefix), raw, MAX_BACKUPS);
    try {
      plan.remove.forEach(function (k) { localStorage.removeItem(k); });
      if (plan.write) localStorage.setItem(prefix + String(Date.now()).padStart(15, "0"), raw);
    } catch (e) {}
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { pendingMsg = "التخزين في المتصفح مش متاح، البيانات مش هتتحفظ."; return []; }
    var r = FocusCore.loadStore(raw);
    if (r.future) {
      readOnly = true;
      pendingMsg = "البيانات اتحفظت بنسخة أحدث من التطبيق. مش هنكتب فوقها. حدّث التطبيق.";
    } else if (r.corrupt) {
      backup("corrupt", raw);
      pendingMsg = "البيانات القديمة كانت تالفة واتحفظت نسخة منها على جنب. بدأنا سجل جديد.";
    } else if (r.dropped) {
      backup("dropped", raw);
      pendingMsg = "اتجاهل " + r.dropped + " سجل غير صالح، واتحفظت نسخة من الأصل.";
    }
    return r.sessions;
  }
  function reloadFromStorage() {
    var raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { return; }
    var r = FocusCore.loadStore(raw); if (!r.corrupt && !r.future) sessions = r.sessions;
  }
  function writeSessions(list) {
    if (readOnly) { say("البيانات للقراءة بس (نسخة أحدث). صدّر CSV."); return false; }
    try { localStorage.setItem(KEY, FocusCore.saveStore(list)); return true; }
    catch (e) { say("مقدرناش نحفظ. صدّر CSV دلوقتي احتياطي."); return false; }
  }
  function saveActive() { try { localStorage.setItem(AKEY, JSON.stringify(cur)); } catch (e) {} }
  function saveActive0(a) { try { localStorage.setItem(AKEY, JSON.stringify(a)); } catch (e) {} }
  function clearActive() { try { localStorage.removeItem(AKEY); } catch (e) {} }
  function storedActive() {
    try { var raw = localStorage.getItem(AKEY); if (!raw) return null; var a = JSON.parse(raw); return FocusCore.activeValid(a) ? a : null; } catch (e) { return null; }
  }

  function fmt(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s; }

  function buildChips() {
    var box = $("trigs"); box.innerHTML = "";
    TRIGGERS.forEach(function (t) {
      var b = document.createElement("button");
      b.className = "chip"; b.textContent = t; b.type = "button";
      b.addEventListener("click", function () {
        if (!cur) return;
        cur.distractions++; cur.triggers.push(t); saveActive();
        b.classList.add("on"); setTimeout(function () { b.classList.remove("on"); }, 400);
        $("dcount").textContent = cur.distractions;
      });
      box.appendChild(b);
    });
  }

  function tick() {
    // another tab may have finished or discarded this session
    var s = storedActive();
    if (!s || s.startAt !== cur.startAt || s.owner !== TAB) { stopLocal(); say("الجلسة دي خلصت أو اتلغت في تبويب تاني."); return; }
    FocusCore.advance(cur, Date.now());
    $("clock").textContent = fmt(Math.max(0, cur.planned * 60 - Math.floor(cur.activeMs / 1000)));
    if (++tickCount % 5 === 0) saveActive();
    if (FocusCore.activeDone(cur)) finish();
  }
  function stopLocal() { clearInterval(timer); cur = null; show(false); render(); }
  function show(running) { $("running").hidden = !running; $("setup").hidden = running; }

  function begin(active) {
    cur = active; cur.owner = TAB; tickCount = 0; show(true);
    $("dcount").textContent = String(cur.distractions);
    $("parked-list").textContent = cur.parked.length ? "متأجل: " + cur.parked.join(" ، ") : "";
    saveActive(); tick(); timer = setInterval(tick, 500);
  }

  function start() {
    var planned = Number($("planned").value);
    if (!Number.isInteger(planned) || planned < 5 || planned > 120) { say("المدة رقم صحيح بين 5 و120 دقيقة"); return; }
    if (storedActive()) { say("فيه جلسة شغالة في تبويب تاني أو لسه ماخلصتش. خلّصها الأول."); return; }
    say("");
    begin(FocusCore.newActive({ planned: planned, subject: $("subject").value, cond: $("cond").value.trim().slice(0, 30), goal: $("goal").value }, Date.now()));
  }

  async function finish() {
    if (!cur || finishing) return;
    finishing = true; clearInterval(timer);
    try {
      var mine = cur;
      FocusCore.advance(mine, Date.now());
      var goalDone = mine.goal ? await ask("حققت هدف الجلسة؟\n" + mine.goal, "أيوه", "لأ") : false;
      if (goalDone === null) { timer = setInterval(tick, 500); return; }     // Escape: the session keeps running, nothing is saved
      // two-tab safety: only the tab that still owns the stored active session may save it
      var owner = storedActive();
      if (!owner || owner.startAt !== mine.startAt || owner.owner !== TAB) { say("الجلسة دي اتحفظت أو اتلغت في تبويب تاني."); cur = null; show(false); reloadFromStorage(); render(); return; }
      var rec = FocusCore.activeToSession(mine, goalDone);
      reloadFromStorage();
      var m = FocusCore.mergeSession(sessions, rec);
      var ok = writeSessions(m.sessions);
      if (ok) { sessions = m.sessions; clearActive(); }
      var pk = mine.parked, away = mine.awayMs;
      cur = null; show(false); render();
      var parts = [];
      if (!ok) parts.push("الجلسة لسه محفوظة كمسودة ومحتاجة حفظ.");
      if (pk.length) parts.push("في الاستراحة، ده اللي أجّلته: " + pk.join(" ، "));
      if (away > 60000) parts.push("الصفحة وقفت حوالي " + Math.round(away / 60000) + " دقيقة. اتسجلت كوقت غير متحقق منه، مش كتركيز متتبع. ممكن تكون ذاكرت فيها فعلًا، بس التطبيق مش شايف.");
      if (parts.length) say(parts.join(" "));
    } finally { finishing = false; }
  }

  async function discard() {
    if (!cur) return;
    if (!(await ask("تلغي الجلسة من غير حفظ؟", "إلغاء الجلسة", "كمّل"))) return;
    stopLocal(); clearActive();
  }

  async function resumeIfAny() {
    var a = storedActive();
    if (!a) { try { if (localStorage.getItem(AKEY)) { clearActive(); say("جلسة غير مكتملة كانت تالفة واتجاهلت."); } } catch (e) {} return; }
    if (Date.now() - a.last < 15000) { say("فيه جلسة شغالة دلوقتي في تبويب تاني. كمّل هناك."); return; }
    FocusCore.advance(a, Date.now());          // time since the last tick is recorded as unverified, never as tracked focus
    a.owner = TAB; saveActive0(a);
    if (FocusCore.activeDone(a)) { cur = a; await finish(); return; }
    var yes = await ask("فيه جلسة لسه ماخلصتش (" + Math.floor(a.activeMs / 60000) + " دقيقة متتبعة). تكمل؟ لو لأ هتتحفظ زي ما هي.", "كمّل", "احفظها");
    if (yes === null) { cur = null; say("الجلسة لسه محفوظة كمسودة. افتح الصفحة تاني وقت ما تحب تكمل أو تحفظ."); return; }   // Escape: leave the draft untouched
    if (yes) { begin(a); } else { cur = a; await finish(); }
  }

  function render() {
    var s = FocusCore.summarize(sessions, new Date());
    $("s-n").textContent = s.sessions; $("s-today").textContent = s.todayMin;
    $("s-total").textContent = s.totalMin; $("s-unver").textContent = s.unverifiedMin; $("s-rate").textContent = s.distractionsPerHour;
    var t = Object.keys(s.byTrigger).sort(function (a, b) { return s.byTrigger[b] - s.byTrigger[a]; })
      .map(function (k) { return k + " ×" + s.byTrigger[k]; }).join(" ، ");
    $("s-trig").textContent = t ? "أكتر الأسباب: " + t : "";
    var conds = Object.create(null); sessions.forEach(function (x) { if (x.condition) conds[x.condition] = 1; });
    var dl = $("conds"); dl.innerHTML = "";
    Object.keys(conds).forEach(function (c) { var o = document.createElement("option"); o.value = c; dl.appendChild(o); });
    var body = $("rows"); body.innerHTML = "";
    sessions.slice(-10).reverse().forEach(function (x) {
      var tr = document.createElement("tr");
      [x.date, x.subject || "-", x.actualMin, x.distractions].forEach(function (v, i) {
        var td = document.createElement("td"); td.textContent = v;
        if (i === 2 && x.unverifiedMin) { var u = document.createElement("small"); u.className = "unv"; u.textContent = "+" + x.unverifiedMin + " غير متحقق"; td.appendChild(u); }
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    renderReport();
    $("restore").hidden = entries(KEY + ".cleared.").length === 0;
    $("savecopies").hidden = entries(KEY + ".corrupt.").length + entries(KEY + ".dropped.").length === 0;
  }

  // ---- weekly report (descriptive; targets come from the WeekPlan page's storage and are shown against tracked time) ----
  var repDay = FocusCore.dateKey(new Date());
  var importConflicts = 0;
  function allSessions() {            // FocusLog sessions plus CSV sessions imported through WeekPlan, without double counting
    var out = sessions.slice(); importConflicts = 0;
    try { var imp = FocusCore.loadStore(localStorage.getItem("weekplan.imported.v1")); if (!imp.corrupt && !imp.future) imp.sessions.forEach(function (x) { var m = FocusCore.mergeSession(out, x, true); out = m.sessions; if (m.conflict) importConflicts++; }); } catch (e) {}
    return out;
  }
  function renderReport() {
    var ws = 6; try { var w = localStorage.getItem("weekplan.weekstart.v1"); if (w !== null && /^[0-6]$/.test(w)) ws = Number(w); } catch (e) {}
    var all = allSessions(), r = FocusCore.weeklyReport(all, repDay, ws);
    $("rep-range").textContent = r.start + " → " + r.end;
    var names = { morning: "الصبح (5-12)", afternoon: "الضهر (12-17)", evening: "المغرب (17-22)", night: "الليل (22-5)" };
    function row(cells, head) { var tr = document.createElement("tr"); cells.forEach(function (v) { var c = document.createElement(head ? "th" : "td"); c.textContent = v; tr.appendChild(c); }); return tr; }
    var box = $("rep-body"); box.innerHTML = "";
    if (!r.sessions) { var p = document.createElement("p"); p.className = "mute"; p.textContent = "مفيش جلسات في الأسبوع ده."; box.appendChild(p); return; }
    var sum = document.createElement("p"); sum.textContent = r.sessions + " جلسة، " + r.trackedMin + " دقيقة متتبعة، " + r.unverifiedMin + " غير متحقق منها، " + r.distractions + " تشتت" + (r.perHour === null ? " (المعدل مش بيظهر تحت 30 دقيقة متتبعة)" : "، " + r.perHour + " في الساعة"); box.appendChild(sum);
    function table(heads, rows) { var t = document.createElement("table"), tb = document.createElement("tbody"); t.appendChild(row(heads, true)); rows.forEach(function (x) { tb.appendChild(row(x)); }); t.appendChild(tb); box.appendChild(t); }
    table(["اليوم", "متتبعة", "غير متحقق"], r.days.map(function (d) { return [d.date.slice(5), d.trackedMin, d.unverifiedMin]; }));
    table(["وقت اليوم", "دقائق", "تشتت/ساعة"], Object.keys(names).map(function (k) { var p = r.parts[k]; return [names[k], p.trackedMin, p.perHour === null ? "-" : p.perHour]; }));
    table(["المادة", "مخطط", "متتبع"], r.subjects.map(function (s) { return [s.subject, s.plannedMin, s.trackedMin]; }));
    var g = document.createElement("p"); g.textContent = "أهداف الجلسات: " + r.goals.done + " من " + r.goals.withGoal + " اتحققت" + (r.triggers.length ? ". أكتر المشتتات: " + r.triggers.slice(0, 3).map(function (t) { return t.trigger + " (" + t.count + ")"; }).join(" ، ") : ""); box.appendChild(g);
    var tg = {}; try { tg = JSON.parse(localStorage.getItem("weekplan.targets.v1") || "{}"); } catch (e) {}
    if (typeof WeekPlan !== "undefined" && Object.keys(tg).length) {
      var pr = WeekPlan.progress(tg, all, repDay, { weekStart: ws });
      table(["هدف الأسبوع", "الهدف", "اتعمل", "%"], pr.rows.map(function (x) { return [x.subject, x.target, x.done, x.pct + "%"]; }));
    }
    if (importConflicts) { var cw = document.createElement("p"); cw.className = "mute"; cw.textContent = "تنبيه: " + importConflicts + " جلسة مستوردة ليها نفس الهوية بس بيانات مختلفة عن جلسة محفوظة، فاتجاهلتها واستخدمت المحفوظة."; box.appendChild(cw); }
    var n = document.createElement("p"); n.className = "mute"; n.textContent = "ده وصف لأرقامك بس: مفيش استنتاج عن السبب، وعدد الجلسات صغير غالبًا. الأهداف بتتضبط من صفحة WeekPlan."; box.appendChild(n);
  }
  $("rep-prev").addEventListener("click", function () { repDay = FocusCore.addDays(repDay, -7); renderReport(); });
  $("rep-next").addEventListener("click", function () { repDay = FocusCore.addDays(repDay, 7); renderReport(); });

  function exportCSV() {
    var blob = new Blob([FocusCore.toCSVFile(sessions)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "focuslog-" + FocusCore.dateKey(new Date()) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  $("parkbtn").addEventListener("click", function () {
    var v = $("park").value.trim();
    if (!cur || !v) return;
    cur.parked.push(v); $("park").value = ""; saveActive();
    $("parked-list").textContent = "متأجل: " + cur.parked.join(" ، ");
  });
  $("import").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    if (f.size > 2000000) { say("الملف كبير أوي."); return; }
    var rd = new FileReader();
    rd.onload = function () {
      reloadFromStorage();
      var r = FocusCore.importCSV(String(rd.result), sessions);
      if (r.added.length) { var merged = sessions.concat(r.added); if (writeSessions(merged)) sessions = merged; }
      render();
      say("اتضاف " + r.added.length + "، متكرر " + r.skipped + "، متعارض " + r.conflicts + (r.errors.length ? "، ملاحظات: " + r.errors.slice(0, 3).join(" / ") : ""));
    };
    rd.readAsText(f); this.value = "";
  });
  $("start").addEventListener("click", start);
  $("stop").addEventListener("click", finish);
  $("discard").addEventListener("click", discard);
  $("export").addEventListener("click", exportCSV);
  $("clear").addEventListener("click", async function () {
    if (readOnly) { say("البيانات للقراءة بس."); return; }
    if (!sessions.length) { say("مفيش حاجة تتمسح."); return; }
    if (!(await ask("تمسح كل الجلسات؟ هتتحفظ نسخة تقدر تسترجعها، بس صدّر CSV لو عايز نسخة تانية.", "امسح", "لأ"))) return;
    backup("cleared", FocusCore.saveStore(sessions));
    sessions = []; writeSessions(sessions); render(); say("اتمسح. تقدر تسترجع آخر نسخة بزرار الاسترجاع.");
  });
  // Lets the user download the raw safety copies (corrupt / dropped data) as a text file, no devtools needed. Nothing is deleted.
  $("savecopies").addEventListener("click", function () {
    var all = entries(KEY + ".corrupt.").concat(entries(KEY + ".dropped.")).map(function (e) { return { key: e.key, raw: e.value }; });
    var blob = new Blob([JSON.stringify(all, null, 1)], { type: "application/json" });
    var l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "focuslog-safety-copies.json";
    document.body.appendChild(l); l.click(); l.remove();
  });
  $("restore").addEventListener("click", async function () {
    var list = entries(KEY + ".cleared.").sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    if (!list.length) return;
    var r = FocusCore.loadStore(list[list.length - 1].value);
    if (r.corrupt || r.future) { say("النسخة المحفوظة مش مقروءة."); return; }
    reloadFromStorage();
    var merged = sessions.slice(), added = 0;
    r.sessions.forEach(function (x) { var m = FocusCore.mergeSession(merged, x); if (m.added) { merged = m.sessions; added++; } });
    if (writeSessions(merged)) { sessions = merged; render(); say("اترجع " + added + " جلسة."); }
  });
  window.addEventListener("storage", function (e) { if (e.key === KEY && !cur) { reloadFromStorage(); render(); } });
  buildChips(); render(); if (pendingMsg) say(pendingMsg);
  resumeIfAny();
})();
