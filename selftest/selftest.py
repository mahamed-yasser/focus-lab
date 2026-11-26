#!/usr/bin/env python3
"""SelfTest: plan personal focus routines and DESCRIBE FocusLog exports. Descriptive only.

  protocol  make a schedule (which study day gets which condition), randomized in blocks.
            A planning aid. Whether a condition is workable (e.g. phone away while logging on that
            phone) is for the user to judge; this tool does not know the device.
  analyze   describe a FocusLog export: per-condition day counts and distraction rates, excluded
            days, plan adherence, goal completion. It makes NO significance claim and prints no
            p-value. Differences shown are descriptions of this one person's logged days, not evidence of effect.
"""
import argparse, csv, datetime as dt, json, math, random, sys
from collections import defaultdict

MIN_DAYS_PER_ARM = 8      # a protocol needs at least this many days per condition


def make_protocol(start, days, conditions, seed, block=2):
    """Block-randomized assignment by calendar day. Unit of randomization = the study day.
    Each block of len(conditions)*? consecutive days holds each condition equally often."""
    if len(conditions) != 2 or conditions[0] == conditions[1]:
        raise ValueError("need exactly two different conditions")
    if days < 2 * MIN_DAYS_PER_ARM:
        raise ValueError("days must be at least %d for a usable comparison" % (2 * MIN_DAYS_PER_ARM))
    if block % 2 or block < 2:
        raise ValueError("block size must be a positive even number")
    rng = random.Random(seed)
    sched, d = [], start
    remaining = days
    while remaining > 0:
        n = min(block, remaining)
        b = [conditions[0]] * (n // 2) + [conditions[1]] * (n // 2)
        if n % 2:
            b.append(rng.choice(conditions))
        rng.shuffle(b)
        for c in b:
            sched.append({"date": d.isoformat(), "condition": c})
            d += dt.timedelta(days=1)
        remaining -= n
    return {"seed": seed, "block": block, "start": start.isoformat(), "days": days,
            "conditions": conditions, "schedule": sched,
            "note": "Planning aid. Assigned before data collection; do not re-roll; log skipped days as skipped. Descriptive analysis only."}


def read_sessions(path):
    out, bad = [], 0
    with open(path, newline="", encoding="utf-8-sig") as f:   # FocusLog exports a UTF-8 BOM
        rd = csv.DictReader(f)
        need = {"date", "planned_min", "actual_min", "distractions"}
        if not rd.fieldnames or not need <= set(rd.fieldnames):
            raise ValueError("CSV missing columns: %s" % sorted(need - set(rd.fieldnames or [])))
        for r in rd:
            try:
                dt.date.fromisoformat(r["date"])
                s = {"date": r["date"], "condition": (r.get("condition") or "").strip(),
                     "actual": float(r["actual_min"]), "dist": float(r["distractions"]),
                     "unverified": float(r.get("unverified_min") or 0),
                     "goal_done": r.get("goal_done") == "yes", "has_goal": bool(r.get("goal"))}
                if s["actual"] < 0 or s["dist"] < 0 or s["unverified"] < 0 or not all(map(math.isfinite, (s["actual"], s["dist"], s["unverified"]))):
                    raise ValueError
                out.append(s)
            except (ValueError, TypeError, KeyError):
                bad += 1
    return out, bad


def day_table(sessions, min_minutes=10):
    """One row per day. Days with mixed or empty conditions, or too few minutes, are reported, not used."""
    by = defaultdict(list)
    for s in sessions:
        by[s["date"]].append(s)
    days, excluded = [], {"mixed_condition": 0, "no_condition": 0, "too_short": 0}
    for date in sorted(by):
        ss = by[date]
        conds = {s["condition"] for s in ss}
        mins = sum(s["actual"] for s in ss)
        if "" in conds and len(conds) == 1:
            excluded["no_condition"] += 1; continue
        if len(conds) > 1:
            excluded["mixed_condition"] += 1; continue
        if mins < min_minutes:
            excluded["too_short"] += 1; continue
        days.append({"date": date, "condition": conds.pop(), "minutes": mins,
                     "rate": sum(s["dist"] for s in ss) / (mins / 60.0)})
    return days, excluded


def mean(xs):
    return sum(xs) / len(xs)


def adherence(days, protocol):
    plan = {r["date"]: r["condition"] for r in protocol["schedule"]}
    matched = sum(1 for d in days if plan.get(d["date"]) == d["condition"])
    off = [d["date"] for d in days if d["date"] in plan and plan[d["date"]] != d["condition"]]
    missing = [dd for dd in plan if dd not in {d["date"] for d in days}]
    return {"planned_days": len(plan), "usable_days_matching_plan": matched,
            "usable_days_not_matching_plan": off, "planned_days_without_usable_data": len(missing)}


def analyze(sessions, protocol=None):
    days, excluded = day_table(sessions)
    conds = sorted({d["condition"] for d in days})
    rep = {"mode": "descriptive", "sessions": len(sessions),
           "tracked_minutes_total": round(sum(s["actual"] for s in sessions)),
           "unverified_minutes_total": round(sum(s.get("unverified", 0) for s in sessions)), "usable_days": len(days), "excluded_days": excluded,
           "per_condition": {}, "caveats": []}
    for c in conds:
        r = [d["rate"] for d in days if d["condition"] == c]
        rep["per_condition"][c] = {"days": len(r), "mean_distractions_per_hour": round(mean(r), 2)}
    goals = [s for s in sessions if s["has_goal"]]
    if goals:
        rep["goal_completion"] = {"sessions_with_goal": len(goals),
                                  "share_done": round(sum(s["goal_done"] for s in goals) / len(goals), 2)}
    if protocol:
        rep["adherence"] = adherence(days, protocol)
    rep["caveats"] = [
        "Descriptive only. No significance test is run and no effect is claimed.",
        "Tracked minutes mean the FocusLog page was running; unverified minutes are time it was not. Neither proves focus or study.",
        "One person, unblinded, self-reported taps: counts depend on noticing and honesty and can differ by condition for that reason alone.",
        "Differences between conditions can come from exam weeks, sleep, subject difficulty or mood, especially if days were not assigned by a schedule made before starting.",
    ]
    if any(c["days"] < MIN_DAYS_PER_ARM for c in rep["per_condition"].values()):
        rep["caveats"].append("Fewer than %d usable days in some condition: treat those numbers as anecdotes." % MIN_DAYS_PER_ARM)
    return rep


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("protocol")
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--days", type=int, default=24)
    p.add_argument("--a", required=True, help="condition name, e.g. study_at_desk"); p.add_argument("--b", required=True)
    p.add_argument("--seed", type=int, required=True, help="write it down; same seed = same schedule")
    p.add_argument("--out", help="write JSON here")
    a = sub.add_parser("analyze")
    a.add_argument("csv"); a.add_argument("--protocol")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "protocol":
            prot = make_protocol(dt.date.fromisoformat(args.start), args.days, [args.a, args.b], args.seed)
            txt = json.dumps(prot, ensure_ascii=False, indent=2)
            if args.out:
                open(args.out, "w", encoding="utf-8").write(txt + "\n")
            print(txt)
        else:
            sessions, bad = read_sessions(args.csv)
            prot = json.load(open(args.protocol, encoding="utf-8")) if args.protocol else None
            rep = analyze(sessions, prot)
            rep["unreadable_rows"] = bad
            print(json.dumps(rep, ensure_ascii=False, indent=2))
    except (ValueError, OSError, json.JSONDecodeError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
