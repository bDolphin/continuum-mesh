# Continuum — Evaluation Monitoring & CI Gate (EvidentlyAI, optional)

Retrieval quality is now measurable, gateable, and monitorable — and the whole
Evidently layer is **optional and flag-controlled**, so it adds zero weight until
you turn it on.

## The pieces

| File | Role |
|------|------|
| `daemon/eval/dataset.py` | seed snippets + labeled probes (your ground truth) |
| `daemon/seed_demo.py` | stores snippets, writes `eval/probes.json` |
| `daemon/monitoring/thresholds.json` | the gate: `min_precision_at_k`, `min_mrr` |
| `daemon/monitoring/evidently_monitor.py` | optional Evidently reports (flag-gated, graceful no-op) |
| `daemon/scripts/monitor_eval.py` | runs eval, enforces thresholds (exit code), emits Evidently report if enabled |
| `daemon/requirements-eval.txt` | optional extras (evidently, pandas) |
| `.github/workflows/eval.yml` | CI: seed → evaluate → gate → upload report |

## The flag (two equivalent ways)

Evidently is **off by default**. Turn it on with either:

```bash
EVIDENTLY_ENABLED=1 python scripts/monitor_eval.py     # env var
python scripts/monitor_eval.py --evidently             # CLI flag
```

Behavior matrix:

| Flag | evidently installed? | Result |
|------|----------------------|--------|
| off | — | threshold gate only (exit 0/1). No Evidently. |
| on | no | gate still runs; rich report skipped with a warning (CI never silently passes) |
| on | yes | gate + Evidently HTML report + JSON snapshot in `monitoring/reports/` |

The threshold gate (precision@k, MRR) runs **regardless** of Evidently, so the
CI signal never depends on the optional dependency being present.

## Local usage

```bash
cd daemon
pip install -r requirements-eval.txt        # one-time, only if you want Evidently
EMBEDDING_MODE=local python main.py          # terminal 1
python seed_demo.py                          # terminal 2
python scripts/monitor_eval.py --evidently   # → reports/eval_report.html + snapshot
```

`monitoring/reports/eval_snapshot.json` is an Evidently snapshot — you can load a
series of them into an Evidently monitoring workspace/UI to watch precision@k and
MRR trend over time, not just per-run.

## CI/CD

`.github/workflows/eval.yml` runs on any push/PR under `daemon/**`:

1. Installs deps + `model2vec` (light local embeddings — no torch in CI) + the Evidently extra.
2. Boots the daemon, seeds memories, generates probes.
3. Runs `monitor_eval.py --evidently`:
   - **fails the job** if precision@k or MRR fall below `thresholds.json`,
   - uploads `monitoring/reports/` as the `evidently-eval-report` artifact (even on failure).

Tighten `thresholds.json` as retrieval improves so quality can only ratchet up —
a change that regresses recall can't merge.

## How this fits the roadmap

This is the MLOps backbone for **Cycle 2+**: when you add the recency/source
ranker (or swap embedding models), you change one thing, run `monitor_eval.py`,
and keep the change only if the numbers go up. Evidently turns that from a
one-off check into a tracked, visual, CI-enforced practice — exactly the
forward-deployed-engineer discipline of never shipping a retrieval change blind.

## Optional: embedding drift

`evidently_monitor.build_embedding_drift_report(reference_vectors, current_vectors, out_dir)`
produces an Evidently embedding-drift report (also flag-gated, best-effort). Use
it to detect when the topic distribution of incoming memories shifts away from
your reference set — an early signal that retrieval relevance may degrade.
