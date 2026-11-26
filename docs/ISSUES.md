# Issues found during build, fix, regression

1. FocusLog showed no warning after corrupt storage was recovered (the message variable was reset after loading). Found by the browser flow test. Fixed by declaring it before load. Re-run: "user told" passes.
2. WeekPlan: the two input fields overlapped on narrow screens. Found in screenshot. Fixed with min-width and box-sizing. Re-screenshot checked.
3. WeekPlan: a subject named `__proto__` was silently dropped. Found by reasoning about object keys. Fixed by rejecting it with an error. Unit test added.
4. CSV export could execute formulas in Excel (subject starting with "="). Prevented in export, reversed on import. Unit tests cover both.

From the independent review (v1 -> v2), each with a regression test in focuslog/test.js (prefix "R:"), selftest tests, or focuslog/e2e.html:
5. In-progress session lost on reload/kill. Fixed: active session saved to storage every few seconds and on each tap; resume or auto-save on next open (e2e: "recovered session saved").
6. Sleep/suspend counted as focus (actual = full planned). Fixed: only ticking time counts, gaps are away time (tests "active clock...", "clock set backwards...").
7. Pipes/backslashes in parked/triggers corrupted on CSV round trip; subjects starting with an apostrophe changed. Fixed with escaping and apostrophe-aware formula guard (tests "pipes...", "leading apostrophe...").
8. Import/storage accepted impossible dates/times, floats, 1e9 minutes. Fixed with strict validation in both paths.
9. Dedupe silently dropped different data with the same key, and the key was fooled by pipes. Fixed: identical = skipped, different = reported conflict; key is JSON.
10. UTF-8 BOM and CRLF handled; semicolon CSV gets a clear error. Future schema versions are read-only, never overwritten (e2e "future data untouched").
11. SelfTest inference unsupported by the design. Fixed by removing the permutation test and p-values; descriptive only (test "never emits inference").
Only part of the reviewer's item 3 (statistics) reached me truncated; I removed inference entirely, which covers it, but I have not seen every point in it.

Round 2 (v3), from the recheck:
12. FocusLog exports a BOM but the Python reader used plain utf-8 (end-to-end failure). Fixed (utf-8-sig); selftest/tests/test_integration.py runs the REAL JS export (toCSVFile) through the Python reader, also checks a no-BOM file.
13. "Away" gap treated as lost focus: now two separate numbers, tracked_minutes and unverified_minutes (new CSV column unverified_min), shown separately everywhere, with UI and docs saying tracked is not proof of focus and unverified may be real study. Real-phone throttling behaviour is untested.
14. Corrupt/dropped copies grew on every reload: now bounded to 3 per kind, identical copies skipped (browser test with 5 reloads and 6 different corrupt values).
15. Two-tab double finish: session ownership token per tab, second tab cannot start/take over a live session, finishing guard, merge-before-save, duplicate-safe (browser tests incl. a tab that lost ownership). Mutation check: removing the ownership check makes the test fail; the double-click guard alone is not separately proven by a failing test because merge de-duplication also covers it.
16. Clear-all was unrecoverable: now keeps a copy and offers restore (browser test).
17. Fixed phone/desk conditions in the UI: replaced with a free-text condition with suggestions from the user's own earlier entries.
18. WeekPlan import was not persisted: now saved on the device and merged without double counting (browser test, reload + re-import).
19. Touch targets under 44 px and blocking window.confirm dialogs: buttons/inputs min 44 px; confirmations are in-page dialogs with focus on the confirm button. Dialog and running screen screenshot inspected (evidence/focuslog-dialog.png). Screen readers, keyboard-only navigation and real phones are NOT tested.
Round 3 (v3.1), from the targeted review:
20. A 40-character unbroken subject caused horizontal overflow at 320/360 px (the earlier screenshot scrollbar was the test iframe, this one was real). Fixed: wrapping + fixed table layout. Browser test at 320 px fails if the CSS is removed (mutation-checked). Direct-page screenshots: evidence/focuslog-direct-320-longsubject.png and -360-.
21. Dialog: Escape (= the safe "no" answer), Tab/Shift+Tab kept inside the dialog, focus restored to the opening button. Tested in the browser flow. Not tested with a screen reader.
22. Corrupt/dropped safety copies needed devtools to reach: a button now downloads them as a JSON file (nothing is deleted or rewritten; no in-app restore of corrupt data, since it is unreadable by definition).
Round 4 (v4), from the final bounded review:
23. Escape on the resume dialog saved the session (there "no" means save). Now Escape is a third answer, "cancel": resume dialog leaves the draft untouched and not running; goal dialog keeps the session running; clear/discard do nothing. Browser tests; mutation-checked (Escape mapped back to "no" makes 2 tests fail). ISSUES #21 wording was wrong for the resume dialog.
24. "One FocusLab" was only a proposal. FocusLog now has a weekly Reports view (core.weeklyReport, tests W1-W3, browser test) that also reads WeekPlan targets and imported sessions, shows tracked and unverified minutes separately, hides rates under 30 tracked minutes, and states it is descriptive only. WeekPlan remains a separate page for setting targets (not merged into one file). Direct-page screenshots: evidence/focuslog-report-direct-390.png and -320.png (demo data dated relative to today, not real use).
25. README listed three tools and a stale CSV header: updated to the real 13 columns incl. unverified_min.
Round 5 (v4.1), from the targeted review:
26. Plain-object accumulation: subjects, triggers or conditions named __proto__, constructor, toString, hasOwnProperty, valueOf dropped records or wrote numbers onto Object.prototype (weeklyReport, summarize, importCSV dedupe, WeekPlan progress, condition suggestions). Now null-prototype maps everywhere. Regression P1 (report, summary, CSV round trip, import dedupe, Object.prototype unchanged) and P3 (WeekPlan). The reviewer's reproducer script now shows all names listed, no pollution. (WeekPlan target names: "__proto__" is still rejected with a visible error, as before; the others work.)
27. An edited copy of an already saved session imported through WeekPlan was added next to it (doubled). Now mergeSession(..., preferExisting) keeps the saved one, counts a conflict, and the Reports view shows a warning (browser test). Finishing a session and restore-after-clear keep the old both-kept behavior on purpose (two-tab safety).
28. Removed the stray empty mistakebox directory.
Open: see LIMITS.md. v4.1 needs the independent reviewer's recheck.
