# Continuum — Composite Ranker (Cycle 2)

Recall used to be pure cosine top-k. That answers "what's semantically closest"
but ignores that a note from this morning usually beats a near-identical one
from six months ago, and that some sources are more reliable for a user. Cycle 2
re-ranks a cosine candidate pool with a weighted blend.

## The score

```
score = w_sim·cosine + w_rec·recency + w_src·source_priority + w_tag·tag_match
```

- **cosine** — semantic similarity (the candidate's original score).
- **recency** — `exp(-age_days / half_life_days)`; newer ⇒ higher. Missing timestamp ⇒ neutral 0.5.
- **source_priority** — per-source weight from `ranker.json` (default 1.0). Unknown source ⇒ 1.0.
- **tag_match** — overlap between the candidate's tags and the query tokens. No tags ⇒ neutral 0.5.

Weights are normalized to sum to 1, so the final score stays ~0..1 and is
directly comparable to cosine. Every component degrades gracefully, so turning
the ranker on never breaks recall — at worst a signal is inert.

## How it runs

`/recall` and `/evaluate` share one `search()` path: embed → fetch a cosine
candidate pool (`top_k × fetch_multiplier`, min 20) → `Ranker.rerank` → top_k.
Because eval uses the same path, the CI gate measures exactly what users get.

`/recall` responses now include `score` (final), `cosine` (raw), and
`rank_components` (the per-signal breakdown) for explainability.

## The flag

Mode comes from the `RANKER` env var (wins) or `ranker.json`:

| Mode | Behavior |
|------|----------|
| `heuristic` | the weighted blend above (default) |
| `cosine` | passthrough — original similarity order (the baseline) |

```bash
RANKER=cosine    python main.py     # baseline
RANKER=heuristic python main.py     # composite (default)
```

Tune weights / source priorities / half-life in `daemon/ranker.json`.

## Prove it helps (the whole point of Cycle 2)

This is the first feature the eval gate was built to protect. A/B it:

```bash
# baseline
RANKER=cosine python main.py &        ; python scripts/run_eval.py   # record numbers
# candidate
RANKER=heuristic python main.py &     ; python scripts/run_eval.py   # compare
```

Keep heuristic only if precision@k / MRR go up. See it reorder live:

```bash
python scripts/rank_demo.py    # ingests an old + a fresh near-duplicate, shows the fresh one rise
```

## Next (Cycle 2b — learned ranker)

The heuristic is v1. Log every recall + whether the user accepted the result
(implicit feedback) into a `recall_events` table, then fit a small
logistic-regression / gradient-boosted ranker on those features offline and A/B
it against the heuristic on the same probe set. Same flag pattern
(`RANKER=learned`), same gate. That's where ranking becomes real ML.
