# Known limits (no zero-bug claim)

- Tested: logic by unit tests and scripted headless-Chrome flows. Current counts come from `./run_tests.sh` (v4.3: 42 PASS lines, 0 FAIL; focuslog 32, weekplan 10, selftest suite, two Chrome flows); counts quoted in older review notes are historical. Not tested: real phones, Safari/Firefox, screen readers, other locales, very large histories, a real study week.
- FocusLog cannot block or detect apps. Distraction counts are self-reported taps.
- Time semantics (do not read more into them): TRACKED minutes = time the page was running and ticking. UNVERIFIED minutes = time that passed with the page NOT ticking (phone asleep, tab suspended, browser killed). Unverified time may have been real study or not; the app cannot tell. Tracked time is also not proof of focus: the page can be open while the student is on another app. Distraction rates use tracked time only. Whether browsers throttle a hidden tab enough to trigger the 5-second gap rule was NOT reproduced in headless Chrome and is untested on real phones, so the exact split between tracked and unverified on a real device is unknown.
- An unfinished session is saved locally every few seconds and resumed or saved on next open (the gap is recorded as unverified). A browser that wipes site data still loses it. Only one tab owns a running session; a second tab cannot start or take it over while it is live (last tick under 15 s), and a tab that lost ownership stops without saving. Race conditions between tabs were tested with a scripted second tab only, not with real simultaneous users.
- Safety copies: at most 3 each of corrupt, dropped and cleared copies are kept and identical copies are not repeated. "Clear all" keeps a recoverable copy; restore merges it back.
- Data is only in one browser's local storage. Clearing site data deletes it. Export CSV regularly. No sync, no account.
- WeekPlan reads FocusLog's storage only when both pages share an origin (same folder/site). Imported CSV sessions are saved on this device and merged without double counting.
- Conditions are free text typed by the user; the app assumes no particular experiment or device.
- SelfTest is descriptive only. It runs no significance test and claims no effect. The earlier permutation test was removed after review: the design (unblinded self-report, device unknown, phone-away condition may conflict with logging on a phone) did not support inference. The protocol generator is a planning aid, not proof of a valid experiment.
- Import rejects impossible dates/times, non-integers and out-of-range values; same-session records with different data are reported as conflicts and not merged.
- Arabic UI text was written by the assistant and not reviewed by a native editor.
- No security review beyond: no innerHTML with user data, CSV formula neutralization, file size cap 2 MB.

- Reports: weekly sums and rates over very few sessions say little; no trend, causal or significance claims are made. Time-of-day uses the session start time on the device clock. Week start (Saturday by default) comes from the WeekPlan setting.
- Reports and WeekPlan targets share browser storage, so they need the same origin (same folder/site).
- Not an installable/offline app (no service worker); it works when the files are opened locally.

## Import conflicts vs finish/restore (docs-only clarification, v4.1.1)
- CSV/report import (WeekPlan imported store): if a record has the same identity as a saved one but different content, the saved version wins and a conflict is counted and shown as a warning in Reports.
- Finishing a session and restore-after-clear: both versions are kept on purpose, so two tabs never lose data. Duplicates here are possible and visible, not silently merged.
- Code-equivalence: v4.1.1 differs from reviewed v4.1 (sha ee72d06f3aa57752) only in this file. Source files are unchanged.
