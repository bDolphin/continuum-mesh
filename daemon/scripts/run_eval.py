"""
Continuum — retrieval eval runner
Location: daemon/scripts/run_eval.py

Reads eval/probes.json, POSTs it to the daemon's /evaluate endpoint, and prints
precision@k + MRR for the LIVE embedding model. This is your regression test:
run it before and after any retrieval change and keep the change only if the
numbers go up.

Usage (daemon running on :2789):
    python scripts/run_eval.py
"""
import json
import os
import sys
import urllib.request

DAEMON = os.getenv("DAEMON_URL", "http://127.0.0.1:2789")
HERE = os.path.dirname(os.path.abspath(__file__))
PROBES = os.path.join(HERE, "..", "eval", "probes.json")


def main():
    if not os.path.exists(PROBES):
        sys.exit(f"❌ {PROBES} not found. Run: python seed_demo.py")

    with open(PROBES) as f:
        payload = json.load(f)

    req = urllib.request.Request(
        f"{DAEMON}/evaluate",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            result = json.loads(r.read().decode())
    except Exception as e:
        sys.exit(f"❌ /evaluate failed ({e}). Is the daemon running on {DAEMON}?")

    print("=" * 60)
    print(f"  model           : {result['embedding_model']}")
    print(f"  k               : {result['k']}")
    print(f"  precision@{result['k']}      : {result['mean_precision_at_k']}")
    print(f"  MRR             : {result['mean_reciprocal_rank']}")
    print("=" * 60)
    for p in result["per_probe"]:
        flag = "✅" if p["reciprocal_rank"] > 0 else "❌"
        print(f"  {flag} p@k={p['precision_at_k']:.2f} rr={p['reciprocal_rank']:.2f}  {p['query'][:55]}")
    print("\nTip: a near-zero score here usually means hash mode or a model")
    print("     mismatch — run scripts/reembed.py and set EMBEDDING_MODE=local.")


if __name__ == "__main__":
    main()
