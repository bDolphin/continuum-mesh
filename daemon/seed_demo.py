"""
Continuum — seed the store + generate runnable eval probes
Location: daemon/seed_demo.py

Stores the snippets from eval/dataset.py via the daemon's /store endpoint,
captures the real memory ids the daemon assigns, then writes
eval/probes.json with those ids baked in so run_eval.py can score retrieval.

Usage (daemon must be running on :2789):
    python seed_demo.py                 # seed + write probes
    python seed_demo.py --no-store      # only regenerate probes from existing ids (re-runs store)
"""
import json
import os
import sys
import urllib.request

DAEMON = os.getenv("DAEMON_URL", "http://127.0.0.1:2789")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from eval.dataset import SNIPPETS, PROBES  # noqa: E402

PROBES_OUT = os.path.join(HERE, "eval", "probes.json")


def _post(path, payload):
    req = urllib.request.Request(
        f"{DAEMON}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    try:
        with urllib.request.urlopen(f"{DAEMON}/health", timeout=5) as r:
            health = json.loads(r.read().decode())
    except Exception as e:
        sys.exit(f"❌ Daemon not reachable at {DAEMON} ({e}). Start it: python main.py")

    print(f"✅ Daemon up · mode={health.get('embedding_mode')} · existing={health.get('memories')}")

    key_to_id = {}
    for s in SNIPPETS:
        resp = _post("/store", {
            "text": s["text"],
            "source_app": s["source_app"],
            "tags": s.get("tags", []),
        })
        key_to_id[s["key"]] = resp["memory_id"]
        print(f"  stored [{s['source_app']:<10}] {s['key']:<16} -> {resp['memory_id'][:8]}  ({resp['embedding_model']})")

    probes = []
    for p in PROBES:
        rel_ids = [key_to_id[k] for k in p["relevant_keys"] if k in key_to_id]
        probes.append({"query": p["query"], "relevant_ids": rel_ids})

    os.makedirs(os.path.dirname(PROBES_OUT), exist_ok=True)
    with open(PROBES_OUT, "w") as f:
        json.dump({"k": 5, "probes": probes}, f, indent=2)

    print(f"\n✅ Seeded {len(key_to_id)} memories, wrote {len(probes)} probes -> {PROBES_OUT}")
    print("   Next:  python scripts/run_eval.py")


if __name__ == "__main__":
    main()
