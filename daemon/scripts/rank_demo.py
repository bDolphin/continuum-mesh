"""
Continuum — ranker demo (Cycle 2)
Location: daemon/scripts/rank_demo.py

Shows the composite ranker changing order vs pure cosine. Ingests two same-topic
notes that are near-identical semantically but differ in age + source, then
queries under both RANKER modes so you can see recency/source break the tie.

Run with the daemon up:
    python scripts/rank_demo.py
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone, timedelta

DAEMON = os.getenv("DAEMON_URL", "http://127.0.0.1:2789")


def post(path, payload):
    req = urllib.request.Request(
        f"{DAEMON}{path}", data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def get(path):
    with urllib.request.urlopen(f"{DAEMON}{path}", timeout=30) as r:
        return json.loads(r.read().decode())


def main():
    now = datetime.now(timezone.utc)
    old = (now - timedelta(days=120)).isoformat()
    recent = (now - timedelta(hours=2)).isoformat()

    # two near-identical notes: one old (perplexity), one fresh (chatgpt)
    post("/ingest/perplexity", {"items": [{
        "text": "Use an AWS Network Load Balancer for layer 4 TCP load balancing.",
        "external_id": "rankdemo-old", "timestamp": old, "tags": ["aws"]}]})
    post("/ingest/chatgpt", {"items": [{
        "text": "Use an AWS Network Load Balancer for layer 4 TCP load balancing today.",
        "external_id": "rankdemo-new", "timestamp": recent, "tags": ["aws"]}]})

    q = "network load balancer layer 4"
    cfg = get("/config").get("ranker", {})
    print(f"active ranker: {cfg.get('mode')}  weights={cfg.get('weights')}\n")
    res = get(f"/recall?query={urllib.parse.quote(q)}&limit=3")
    print(f"query: {q}   (ranker={res.get('ranker')})")
    for i, m in enumerate(res["memories"], 1):
        comp = m.get("rank_components")
        print(f"  {i}. score={m['score']:.3f} cos={m.get('cosine',0):.3f} "
              f"[{m['metadata'].get('source_app')}] {m['content'][:48]}")
        if comp:
            print(f"      components: {comp}")
    print("\nTip: restart the daemon with RANKER=cosine to see the order ignore "
          "recency/source, then RANKER=heuristic to see the fresh note rise.")


if __name__ == "__main__":
    import urllib.parse
    main()
