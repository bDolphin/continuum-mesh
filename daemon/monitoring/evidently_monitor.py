"""
Continuum — EvidentlyAI monitoring (OPTIONAL, flag-gated)
Location: daemon/monitoring/evidently_monitor.py

Turns the retrieval eval into Evidently Reports/Test Suites you can:
  - drop into CI as a pass/fail gate (precision@k / MRR thresholds), and
  - persist as snapshots to load into Evidently's monitoring UI over time.

This module is OPTIONAL. Evidently is NOT a core dependency. Everything here is
gated by a flag and degrades gracefully:
  - if the flag is off  -> functions are no-ops (return {"enabled": False}),
  - if evidently is not installed -> we warn and skip the rich report (the CLI
    still enforces thresholds with plain numbers, so CI never silently passes).

Enable with EITHER:
  - env  EVIDENTLY_ENABLED=1
  - CLI  scripts/monitor_eval.py --evidently
"""
from __future__ import annotations

import os
from typing import Dict, List, Optional


def is_enabled(flag: Optional[bool] = None) -> bool:
    """Flag resolution: explicit arg wins, else EVIDENTLY_ENABLED env var."""
    if flag is not None:
        return flag
    return os.getenv("EVIDENTLY_ENABLED", "0").lower() in ("1", "true", "yes", "on")


def evidently_available() -> bool:
    try:
        import evidently  # noqa: F401
        return True
    except Exception:
        return False


def _collect_test_statuses(run) -> List[Dict]:
    """Walk an Evidently snapshot for test nodes (name/description/status)."""
    import json
    statuses: List[Dict] = []

    def walk(o):
        if isinstance(o, dict):
            if "status" in o and ("name" in o or "description" in o):
                statuses.append({k: o.get(k) for k in ("name", "description", "status")})
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(json.loads(run.json()))
    return statuses


def build_eval_report(
    eval_result: Dict,
    thresholds: Dict,
    out_dir: str,
    enabled: Optional[bool] = None,
) -> Dict:
    """
    Build an Evidently Report from /evaluate output and threshold tests.

    eval_result: the JSON returned by the daemon's POST /evaluate
                 (needs `per_probe` with precision_at_k + reciprocal_rank).
    thresholds : {"min_precision_at_k": 0.5, "min_mrr": 0.5}
    Returns {enabled, passed, tests, html_path, snapshot_path, metrics}.
    """
    if not is_enabled(enabled):
        return {"enabled": False, "reason": "flag off"}

    if not evidently_available():
        return {"enabled": True, "skipped": True,
                "reason": "evidently not installed (pip install -r requirements-eval.txt)"}

    import pandas as pd
    from evidently import Report, Dataset, DataDefinition
    from evidently.metrics import MeanValue
    from evidently.tests import gte

    os.makedirs(out_dir, exist_ok=True)
    probes = eval_result.get("per_probe", [])
    if not probes:
        return {"enabled": True, "skipped": True, "reason": "no per_probe data in eval_result"}

    df = pd.DataFrame(
        {
            "precision_at_k": [p["precision_at_k"] for p in probes],
            "reciprocal_rank": [p["reciprocal_rank"] for p in probes],
        }
    )
    ds = Dataset.from_pandas(df, data_definition=DataDefinition())

    min_p = float(thresholds.get("min_precision_at_k", 0.5))
    min_mrr = float(thresholds.get("min_mrr", 0.5))

    report = Report(metrics=[
        MeanValue(column="precision_at_k", tests=[gte(min_p)]),
        MeanValue(column="reciprocal_rank", tests=[gte(min_mrr)]),
    ])
    run = report.run(ds, None)

    html_path = os.path.join(out_dir, "eval_report.html")
    snapshot_path = os.path.join(out_dir, "eval_snapshot.json")
    run.save_html(html_path)
    with open(snapshot_path, "w") as f:
        f.write(run.json())

    tests = _collect_test_statuses(run)
    passed = all(t.get("status") == "SUCCESS" for t in tests) if tests else False

    return {
        "enabled": True,
        "passed": passed,
        "tests": tests,
        "html_path": html_path,
        "snapshot_path": snapshot_path,
        "metrics": {
            "mean_precision_at_k": eval_result.get("mean_precision_at_k"),
            "mean_reciprocal_rank": eval_result.get("mean_reciprocal_rank"),
            "model": eval_result.get("embedding_model"),
        },
    }


def build_embedding_drift_report(
    reference_vectors,
    current_vectors,
    out_dir: str,
    enabled: Optional[bool] = None,
) -> Dict:
    """
    OPTIONAL embedding-drift report: compares a reference batch of memory
    embeddings against a current batch to flag distribution shift (e.g. your
    incoming content changed topic). Best-effort: any API mismatch is caught so
    it never breaks CI.
    """
    if not is_enabled(enabled):
        return {"enabled": False, "reason": "flag off"}
    if not evidently_available():
        return {"enabled": True, "skipped": True, "reason": "evidently not installed"}

    try:
        import numpy as np
        import pandas as pd
        from evidently import Report, Dataset, DataDefinition
        from evidently.metrics import EmbeddingsDrift

        os.makedirs(out_dir, exist_ok=True)
        ref = np.asarray(reference_vectors, dtype="float32")
        cur = np.asarray(current_vectors, dtype="float32")
        cols = [f"e{i}" for i in range(ref.shape[1])]
        ref_df = pd.DataFrame(ref, columns=cols)
        cur_df = pd.DataFrame(cur, columns=cols)

        dd = DataDefinition(embeddings={"memory": cols})
        ref_ds = Dataset.from_pandas(ref_df, data_definition=dd)
        cur_ds = Dataset.from_pandas(cur_df, data_definition=dd)

        report = Report(metrics=[EmbeddingsDrift(embeddings_name="memory")])
        run = report.run(cur_ds, ref_ds)
        html_path = os.path.join(out_dir, "embedding_drift.html")
        run.save_html(html_path)
        return {"enabled": True, "html_path": html_path}
    except Exception as e:
        return {"enabled": True, "skipped": True, "reason": f"drift report error: {e}"}
