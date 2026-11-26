"""End to end: real FocusLog JS export (with BOM) -> real SelfTest reader. Skipped if node is missing."""
import json, os, shutil, subprocess, sys, tempfile, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import selftest as st
CORE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "focuslog", "core.js"))

@unittest.skipUnless(shutil.which("node"), "needs node")
class JsToPython(unittest.TestCase):
    def export(self):
        js = """const C=require(process.argv[1]);const fs=require('fs');
        const mk=(d,h,cond,act,un,dist,subj)=>C.makeSession({start:new Date(2026,11,d,h,0),plannedMin:25,actualMin:act,unverifiedMin:un,distractions:dist,subject:subj,condition:cond,triggers:['a|b'],goal:'=هدف',goalDone:true,parked:['x']});
        const rows=[mk(1,9,'مكتب',20,0,2,'تكامل, فيزياء'),mk(2,9,'برا',25,10,5,'"q"')];
        fs.writeFileSync(process.argv[2],C.toCSVFile(rows));"""
        out = os.path.join(tempfile.mkdtemp(), "e.csv")
        subprocess.run(["node", "-e", js, CORE, out], check=True)
        return out
    def test_bom_file_is_read_and_columns_survive(self):
        p = self.export()
        self.assertEqual(open(p, "rb").read(3), b"\xef\xbb\xbf")        # the export really has a BOM
        sessions, bad = st.read_sessions(p)
        self.assertEqual((len(sessions), bad), (2, 0))
        self.assertEqual([s["condition"] for s in sessions], ["مكتب", "برا"])
        self.assertEqual(sessions[1]["unverified"], 10); self.assertTrue(sessions[0]["goal_done"])
    def test_analyze_reports_tracked_and_unverified(self):
        sessions, _ = st.read_sessions(self.export())
        r = st.analyze(sessions)
        self.assertEqual((r["tracked_minutes_total"], r["unverified_minutes_total"]), (45, 10))
        self.assertEqual(r["mode"], "descriptive")
    def test_old_utf8_without_bom_still_reads(self):
        p = self.export(); raw = open(p, "rb").read()[3:]; open(p, "wb").write(raw)
        self.assertEqual(len(st.read_sessions(p)[0]), 2)

if __name__ == "__main__":
    unittest.main()
