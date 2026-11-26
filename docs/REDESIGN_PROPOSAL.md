# Revised architecture and selection proposal

Reviewer finding, accepted: v1 is one small app split into three, not three substantial projects. Lines of code or a PWA wrapper would not change that. Depth for a student application comes from a real problem, sustained real use, honest measurement and what the student understands and changed. None of that can be produced overnight by an AI.

## Option A (recommended): one substantial project, "Focus Lab", done for real
One product with real subsystems, and a real two-to-four week use period by the student:
1. Recorder: offline-installable web app, device-independent storage (IndexedDB), session resume (done in v2), export/import (done in v2), backup reminders.
2. Reports: descriptive weekly report (time-of-day pattern, triggers, goal completion, planned vs actual per subject) as a readable page. WeekPlan becomes this view instead of a separate project.
3. A routine experiment, designed only after we know his device and what he is willing to change: schedule made in advance, outcome measured in a way that does not depend on the condition (e.g. minutes of problems solved, not only tapped distractions), reported descriptively.
4. Student-owned artifact: his dated log, what he changed and why, and a short write-up in his own words. This is the part that carries weight; AI help is stated plainly.
Needs from him: device (phone or computer) while studying, hours per week, what he is willing to change.

## Option B: three genuinely distinct projects
Only if he supplies three different real problems or interests (for example a tool for a real person or business he can reach, a sci-math investigation such as a physics simulation tied to his curriculum, and the focus project above). Each would need its own user, a measurable outcome and a real review. I cannot pick these honestly without his answers; picking them now would repeat v1.

## Recommendation
Keep Focus Lab (A), fold WeekPlan into its reports, and ask him for the three answers above before building more. Do not present v2 as the "big" projects he asked for.
