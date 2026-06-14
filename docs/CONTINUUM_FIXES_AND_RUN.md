# Continuum — What Was Broken, What Changed, How To Run

_Last updated: 2026-06-13_

## The one-line diagnosis

Your daemon could not do semantic continuity because **both halves of the core were hollow**:

1. **Embeddings were SHA-256 hashes** (`get_testing_embedding`). A hash carries zero
   semantic signal. Measured proof: the cosine between *"set up a network load balancer"*
   and its synonym *"configure an NLB at layer 4"* was **+0.71**, while the cosine to an
   unrelated sentence about **sourdough** was **+0.73** — i.e. recall was ranking noise.
2. **The store was an in-memory dict** (`memory_store.py`), with ChromaDB disabled for
   Python 3.14. Every memory vanished on restart, so there was nothing to be continuous *with*.

The product thesis ("it remembered what I did elsewhere") was mathematically impossible
under that setup, regardless of how good the extension was.

## What changed

| File | Before | After |
|------|--------|-------|
| `daemon/embeddings.py` | _(did not exist)_ | Pluggable, **versioned** providers: `local` (real, no key), `openai`, `hash` (testing only). Each returns vector + `model_id` + `dim`. |
| `daemon/memory_store.py` | In-memory dict, lost on restart | **Persistent SQLite** store (float32 BLOBs), numpy cosine, metadata + tag filtering, refuses to compare vectors across embedding models. Works on Python 3.14. |
| `daemon/main.py` | hash default, no observability | Defaults to **`local`** real embeddings; adds `/health`, `/stats`, `/evaluate`; stores embedding provenance; fixes the extension's `limit` vs `n_results` mismatch. |
| `daemon/requirements.txt` | `chromadb` (didn't build on 3.14) | `numpy` + `sentence-transformers` / `model2vec`; Chroma demoted to a future swap. |

All endpoint contracts and request field names are unchanged, so the Chrome extension keeps working untouched.

## How to run with REAL embeddings

The only real decision is your Python runtime. `sentence-transformers` (best quality) pulls in
torch, which has historically lagged on brand-new Python versions. Two clean paths:

**Path A — stay on Python 3.14, no torch (fastest to working):**
```bash
cd daemon
pip install -r requirements.txt          # model2vec covers you with no torch
export EMBEDDING_MODE=local
python main.py                            # first run downloads a small model (~30MB)
```

**Path B — pin a 3.12 venv for best quality (recommended for the long run):**
```bash
cd daemon
python3.12 -m venv .venv312 && source .venv312/bin/activate
pip install -r requirements.txt
export EMBEDDING_MODE=local               # uses sentence-transformers/all-MiniLM-L6-v2
python main.py
```

Pinning the runtime is the forward-deployed-engineer move — don't fight the bleeding-edge
interpreter when the job is to ship a working retrieval service.

## Prove the magic moment (60 seconds)

```bash
# 1. store a "Perplexity research" note
curl -s localhost:2789/store -H 'content-type: application/json' -d '{
  "text":"AWS Network Load Balancer preserves the client source IP and works at layer 4 for TCP/UDP.",
  "source_app":"perplexity"}'

# 2. recall it from a "Cursor" query that shares NO keywords
curl -s 'localhost:2789/recall?query=how%20do%20I%20keep%20the%20original%20client%20address%20on%20a%20layer-4%20LB&limit=3'
```
With `EMBEDDING_MODE=local` the note comes back with a high score. With `EMBEDDING_MODE=hash`
it won't reliably — that contrast *is* the validation of your core thesis.

## Verify retrieval quality objectively

```bash
curl -s localhost:2789/evaluate -H 'content-type: application/json' -d '{
  "k":5,
  "probes":[{"query":"layer 4 load balancer in terraform","relevant_ids":["<id-from-store>"]}]
}'
# -> mean_precision_at_k, mean_reciprocal_rank
```
This is your regression test for every future retrieval change.

## Notes / gotchas

- The SQLite DB lives at `daemon/chroma_db/continuum.db` on **local disk**. Don't put it on a
  network share (NFS/SMB) — SQLite file locking fails there.
- `hash` mode is retained ONLY so CI can run with zero model downloads. It will always score
  badly on `/evaluate`; that's intended.
