"""
Continuum — retrieval eval gate + optional Evidently monitoring
Location: daemon/scripts/monitor_eval.py

Runs the eval against the live daemon, ALWAYS enforces thresholds (so CI can
fail on a regression), and OPTIONALLY emits Evidently reports when turned on.

Exit code: 0 if metrics meet thresholds, 1 otherwise  -> drives the CI gate.

Usage:
    python scripts/monitor_eval.py                 # gate only (no Evidently)
    python scripts/monitor_eval.py --evidently     # + Evidently HTML/snapshot
    EVIDENTLY_ENABLED=1 python scripts/monitor_eval.py   # same, via env flag
"""
import json
import os
import sys
import urllib.request

DAEMON = os.getenv("DAEMON_URL", "http://127.0.0.1:2789")
HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, DAEMON_DIR)

PROBES = os.path.join(DAEMON_DIR, "eval", "probes.json")
THRESHOLDS = os.path.join(DAEMON_DIR, "monitoring", "thresholds.json")
REPORT_DIR = os.path.join(DAEMON_DIR, "monitoring", "reports")


def _post(path, payload):
    req = urllib.request.Request(
        f"{DAEMON}{path}", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main():
    evidently_flag = "--evidently" in sys.argv or \
        os.getenv("EVIDENTLY_ENABLED", "0").lower() in ("1", "true", "yes", "on")

    if not os.path.exists(PROBES):
        sys.exit(f"❌ {PROBES} not found. Run: python seed_demo.py")
    with open(PROBES) as f:
        probes_payload = json.load(f)
    thresholds = json.load(open(THRESHOLDS)) if os.path.exists(THRESHOLDS) else {}
    min_p = float(thresholds.get("min_precision_at_k", 0.5))
    min_mrr = float(thresholds.get("min_mrr", 0.5))

    try:
        result = _post("/evaluate", probes_payload)
    except Exception as e:
        sys.exit(f"❌ /evaluate failed ({e}). Is the daemon running on {DAEMON}?")

    p = result["mean_precision_at_k"]
    mrr = result["mean_reciprocal_rank"]
    print("=" * 60)
    print(f"  model         : {result['embedding_model']}")
    print(f"  precision@{result['k']}    : {p}   (min {min_p})")
    print(f"  MRR           : {mrr}   (min {min_mrr})")
    print("=" * 60)

    # --- optional Evidently report (flag-gated, never required) ---
    if evidently_flag:
        from monitoring.evidently_monitor import build_eval_report
        rpt = build_eval_report(result, thresholds, REPORT_DIR, enabled=True)
        if rpt.get("skipped"):
            print(f"  ⚠️  Evidently skipped: {rpt['reason']}")
        elif rpt.get("enabled"):
            print(f"  📊 Evidently report : {rpt['html_path']}")
            print(f"  📸 Snapshot         : {rpt['snapshot_path']}")
            for t in rpt["tests"]:
                mark = "✅" if t["status"] == "SUCCESS" else "❌"
                print(f"     {mark} {t['description']}")
    else:
        print("  (Evidently off — pass --evidently or EVIDENTLY_ENABLED=1 to enable)")

    # --- the gate (always enforced, independent of Evidently) ---
    passed = (p >= min_p) and (mrr >= min_mrr)
    print("\nRESULT:", "✅ PASS" if passed else "❌ FAIL (retrieval regressed below thresholds)")
    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
