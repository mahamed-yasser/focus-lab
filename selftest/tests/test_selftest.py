import csv, datetime as dt, os, sys, tempfile, unittest, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import selftest as st

def sess(date, cond, mins, dist, **k):
    d = {"date": date, "condition": cond, "actual": mins, "dist": dist, "goal_done": False, "has_goal": False}
    d.update(k); return d

def days(n, cond, rate_fn, start=dt.date(2026, 12, 1)):
    return [sess((start + dt.timedelta(days=i)).isoformat(), cond, 60, rate_fn(i)) for i in range(n)]

class Protocol(unittest.TestCase):
    def test_deterministic_and_balanced(self):
        a = st.make_protocol(dt.date(2026, 12, 1), 24, ["x", "y"], 7)
        b = st.make_protocol(dt.date(2026, 12, 1), 24, ["x", "y"], 7)
        self.assertEqual(a, b)
        cs = [r["condition"] for r in a["schedule"]]
        self.assertEqual(cs.count("x"), 12)
        for i in range(0, 24, 2):
            self.assertEqual(sorted(cs[i:i + 2]), ["x", "y"])
    def test_dates_consecutive(self):
        a = st.make_protocol(dt.date(2026, 12, 30), 16, ["x", "y"], 1)
        self.assertEqual(a["schedule"][3]["date"], "2027-01-02")
    def test_rejects_bad_input(self):
        for kw in ({"days": 4}, {"conditions": ["x", "x"]}, {"block": 3}):
            args = dict(start=dt.date(2026, 12, 1), days=16, conditions=["x", "y"], seed=1); args.update(kw)
            with self.assertRaises(ValueError): st.make_protocol(**args)

class Analyze(unittest.TestCase):
    def strong(self):
        return days(8, "a", lambda i: 2 + (i % 3)) + days(8, "b", lambda i: 10 + (i % 3), dt.date(2026, 12, 20))
    def test_never_emits_inference(self):
        r = st.analyze(self.strong())
        self.assertEqual(r["mode"], "descriptive")
        self.assertNotIn("comparison", r); self.assertNotIn("p_value", json.dumps(r))
        self.assertTrue(any("No significance test" in c for c in r["caveats"]))
    def test_per_condition_numbers(self):
        r = st.analyze(self.strong())
        self.assertEqual(r["per_condition"]["a"]["days"], 8)
        self.assertGreater(r["per_condition"]["b"]["mean_distractions_per_hour"], r["per_condition"]["a"]["mean_distractions_per_hour"])
    def test_small_data_flagged_as_anecdote(self):
        r = st.analyze(days(3, "a", lambda i: 3))
        self.assertTrue(any("anecdotes" in c for c in r["caveats"]))
    def test_mixed_day_and_blank_condition_excluded(self):
        s = [sess("2026-12-01", "a", 30, 1), sess("2026-12-01", "b", 30, 1), sess("2026-12-02", "", 60, 1), sess("2026-12-03", "a", 5, 1)]
        r = st.analyze(s)
        self.assertEqual(r["usable_days"], 0)
        self.assertEqual(r["excluded_days"], {"mixed_condition": 1, "no_condition": 1, "too_short": 1})
    def test_zero_minutes_no_crash(self):
        r = st.analyze([sess("2026-12-01", "a", 0, 5)]); self.assertEqual(r["usable_days"], 0)
    def test_adherence(self):
        prot = st.make_protocol(dt.date(2026, 12, 1), 16, ["a", "b"], 1)
        plan = {r["date"]: r["condition"] for r in prot["schedule"]}
        s = [sess(d, ("a" if plan[d] == "b" else "b") if d == "2026-12-01" else plan[d], 60, 1) for d in list(plan)[:4]]
        r = st.analyze(s, prot)["adherence"]
        self.assertEqual(r["usable_days_not_matching_plan"], ["2026-12-01"]); self.assertEqual(r["planned_days_without_usable_data"], 12)

class Io(unittest.TestCase):
    def write(self, text):
        f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, encoding="utf-8"); f.write(text); f.close(); return f.name
    def test_missing_columns(self):
        with self.assertRaises(ValueError): st.read_sessions(self.write("a,b\n1,2\n"))
    def test_bad_rows_counted(self):
        p = self.write("date,condition,planned_min,actual_min,distractions\n2026-12-01,a,25,20,2\nnope,a,25,20,2\n2026-12-02,a,25,-5,1\n2026-12-03,a,25,nan,1\n")
        s, bad = st.read_sessions(p); self.assertEqual((len(s), bad), (1, 3))
    def test_reads_focuslog_export_format(self):
        hdr = "date,start,subject,condition,planned_min,actual_min,distractions,triggers,goal,goal_done,parked,note\n"
        s, bad = st.read_sessions(self.write(hdr + '2026-12-01,09:00,"a, b",phone_away,25,25,2,x|y,g,yes,,"n\nm"\n'))
        self.assertEqual((len(s), bad, s[0]["goal_done"]), (1, 0, True))
    def test_cli_exit_codes(self):
        self.assertEqual(st.main(["analyze", "/nonexistent.csv"]), 2)
        self.assertEqual(st.main(["protocol", "--start", "2026-12-01", "--days", "4", "--seed", "1", "--a", "x", "--b", "y"]), 2)

if __name__ == "__main__":
    unittest.main()
