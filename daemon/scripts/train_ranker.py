"""
Continuum — train the learned ranker (Cycle 2b)
Location: daemon/scripts/train_ranker.py

Reads logged recall events (features -> accepted) from the store and fits a
logistic-regression ranker in pure numpy (no sklearn dependency). Writes
ranker_model.json, which RANKER=learned then uses.

The features are exactly the ranker's heuristic signals, so the learned model is
"the same blend, but with weights discovered from real user behavior instead of
hand-set." That contrast — heuristic vs learned, A/B'd on the same probe set —
is the Cycle 2b lesson.

Usage (daemon stopped, or any time — it reads the DB directly):
    python scripts/train_ranker.py
    python scripts/train_ranker.py --epochs 4000 --lr 0.1
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, DAEMON_DIR)

from memory_store import MemoryStore   # noqa: E402
from ranker import FEATURES            # noqa: E402

MODEL_OUT = os.path.join(DAEMON_DIR, "ranker_model.json")


def _arg(flag, default, cast):
    if flag in sys.argv:
        return cast(sys.argv[sys.argv.index(flag) + 1])
    return default


def main():
    epochs = _arg("--epochs", 3000, int)
    lr = _arg("--lr", 0.2, float)
    l2 = _arg("--l2", 1e-3, float)

    store = MemoryStore(persist_directory=os.path.join(DAEMON_DIR, "chroma_db"))
    rows = store.training_rows()
    stats = store.recall_event_stats()
    print(f"events={stats['events']} accepted={stats['accepted']} usable={len(rows)}")

    pos = sum(r["accepted"] for r in rows)
    if len(rows) < 10 or pos == 0 or pos == len(rows):
        sys.exit("❌ Not enough labeled feedback yet (need both accepted and "
                 "non-accepted examples). Use the app / POST /feedback, then retrain.")

    X = np.array([[r["features"].get(f, 0.0) for f in FEATURES] for r in rows], dtype=np.float64)
    y = np.array([r["accepted"] for r in rows], dtype=np.float64)

    # standardize for stable gradient descent; fold scaling back into coef later.
    # Zero-variance (constant) features carry no signal — neutralize them so they
    # can't blow up when we divide by sigma during un-standardization.
    mu, sigma = X.mean(0), X.std(0)
    const_mask = sigma < 1e-8
    sigma_safe = np.where(const_mask, 1.0, sigma)
    Xs = (X - mu) / sigma_safe
    Xs[:, const_mask] = 0.0

    rng = np.random.default_rng(0)
    w = rng.normal(0, 0.01, size=Xs.shape[1])
    b = 0.0
    n = len(y)
    for _ in range(epochs):
        z = Xs @ w + b
        p = 1.0 / (1.0 + np.exp(-np.clip(z, -60, 60)))
        grad_w = Xs.T @ (p - y) / n + l2 * w
        grad_b = float(np.mean(p - y))
        w -= lr * grad_w
        b -= lr * grad_b

    # un-standardize: z = b + Σ w_i*(x_i-mu_i)/sigma_i  ->  coef_i = w_i/sigma_i
    # (constant features get coef 0 and contribute nothing to the bias)
    coef = {f: (0.0 if const_mask[i] else float(w[i] / sigma_safe[i]))
            for i, f in enumerate(FEATURES)}
    bias = float(b - sum(0.0 if const_mask[i] else w[i] * mu[i] / sigma_safe[i]
                         for i in range(len(FEATURES))))

    # training accuracy (sanity)
    p = 1.0 / (1.0 + np.exp(-np.clip(X @ np.array([coef[f] for f in FEATURES]) + bias, -60, 60)))
    acc = float(((p > 0.5) == (y > 0.5)).mean())

    model = {"type": "logistic", "features": list(FEATURES),
             "coef": coef, "bias": bias, "train_acc": round(acc, 3), "n": n}
    with open(MODEL_OUT, "w") as f:
        json.dump(model, f, indent=2)
    print(f"✅ wrote {MODEL_OUT}  train_acc={acc:.3f}")
    print("   coef:", {k: round(v, 3) for k, v in coef.items()}, "bias:", round(bias, 3))
    print("   Set RANKER=learned and run scripts/run_eval.py to A/B vs heuristic.")


if __name__ == "__main__":
    main()
