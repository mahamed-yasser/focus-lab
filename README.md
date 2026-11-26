# Focus Lab

One study-tracking app (FocusLog) with a weekly Reports view, plus two companions. AI-assisted study project, made by Mahamed Yasser. See PROVENANCE.md and LIMITS.md first.

| Part | What it does | Run |
|---|---|---|
| focuslog (the app) | Study session timer. Tap what pulled you away, park urges for the break, set a session goal, export/import CSV. NEW in this revision: a **weekly report** inside the page (tracked vs unverified minutes per day, time-of-day buckets, planned vs tracked per subject, goals met, top triggers, previous/next week, and your WeekPlan targets with percent done). Descriptive numbers only. Data stays in this browser. | open `focuslog/index.html` |
| weekplan | The page where you set weekly minute targets per subject and import a CSV. FocusLog's report reads those targets and imported sessions from the same browser storage, so the two pages must be opened from the same folder/site. It still works on its own too. | open `weekplan/index.html` |
| selftest | Makes a day-by-day randomized plan for two conditions you name, and DESCRIBES a FocusLog export (no p-values, no effect claims). Python. | `python3 selftest/selftest.py protocol --start 2026-12-01 --days 24 --seed 7 --a cond_a --b cond_b` then `python3 selftest/selftest.py analyze export.csv --protocol protocol.json` |

Not an installable app and not tested on real phones; see LIMITS.md.

Tests: `./run_tests.sh` (node, python3, optional headless chrome).

Layout: `*/core.js|plan.js|selftest.py` are pure logic with tests; `app.js` + `index.html` are thin UI. `evidence/` has screenshots (demo data, not real use) and a synthetic SelfTest run.
Revision: v4.1 (v3.1 + Reports view, Escape-on-resume fix, prototype-key and import-conflict fixes) after independent review (see docs/ISSUES.md, docs/REDESIGN_PROPOSAL.md). v1 is preserved separately as focus-lab-v1.
Data format: FocusLog CSV columns are date,start,subject,condition,planned_min,actual_min,unverified_min,distractions,triggers,goal,goal_done,parked,note (older files without unverified_min still import, default 0). Browser storage is versioned (v2); v1 arrays migrate on load.

## UI revision (v4.3)
Shared `theme.css`, three phone views (today / report / log) with a bottom tab bar, a two-column desktop layout, bars in the weekly report, and WeekPlan restyled to match. The log shows tracked minutes with a separate "+N غير متحقق" (unverified) line. Display changes only (index.html, theme.css, weekplan/index.html, and the log-row render in app.js). Screenshots in `evidence/` made before v4.3 are HISTORICAL and show the old layout. Not tested on a real phone or with a real on-screen keyboard.
