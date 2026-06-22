"""
Continuum — composite retrieval ranker (Cycle 2)
Location: daemon/ranker.py

Pure cosine top-k answers "what's semantically closest" but ignores that a note
from this morning usually beats a near-identical one from six months ago, and
that some sources are more trustworthy for a given user. This re-ranks a cosine
candidate pool with a weighted blend:

    score = w_sim·cosine + w_rec·recency + w_src·source_priority + w_tag·tag_match

Modes (RANKER env var, or ranker.json "mode"):
    "cosine"     -> passthrough: original similarity order (the baseline)
    "heuristic"  -> the weighted blend above  [default]
    "learned"    -> weights learned from logged recall-acceptance feedback
                    (ranker_model.json, produced by scripts/train_ranker.py);
                    falls back to heuristic if no model file is present.

Everything is config-driven (ranker.json) and degrades gracefully: missing
timestamps => neutral recency, unknown source => neutral priority, no tags =>
neutral tag_match. So turning it on never breaks recall; at worst a component is
inert. Weights are normalized to sum to 1 so the final score stays ~0..1 and is
directly comparable to cosine.
"""
from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

_TOKEN = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set:
    return set(_TOKEN.findall((text or "").lower()))


def _parse_ts(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


FEATURES = ("similarity", "recency", "source_priority", "tag_match")


@dataclass
class RankerConfig:
    mode: str = "heuristic"                 # "cosine" | "heuristic" | "learned"
    half_life_days: float = 14.0            # recency decay
    fetch_multiplier: int = 5               # candidate pool = top_k * this (min 20)
    weights: Dict[str, float] = field(default_factory=lambda: {
        "similarity": 0.6, "recency": 0.2, "source_priority": 0.1, "tag_match": 0.1,
    })
    source_priority: Dict[str, float] = field(default_factory=dict)  # name -> 0..1 (default 1.0)
    model: Optional[Dict] = None            # learned model: {"bias": x, "coef": {feat: w}}

    @classmethod
    def load(cls, path: Optional[str] = None) -> "RankerConfig":
        cfg = cls()
        if path and os.path.exists(path):
            try:
                data = json.loads(open(path).read())
                cfg.mode = data.get("mode", cfg.mode)
                cfg.half_life_days = float(data.get("half_life_days", cfg.half_life_days))
                cfg.fetch_multiplier = int(data.get("fetch_multiplier", cfg.fetch_multiplier))
                cfg.weights = {**cfg.weights, **data.get("weights", {})}
                cfg.source_priority = data.get("source_priority", cfg.source_priority)
            except Exception as e:
                print(f"⚠️  ranker.json unreadable ({e}); using defaults")
        # env override wins (so CI / experiments can flip mode without editing files)
        cfg.mode = os.getenv("RANKER", cfg.mode).lower()
        # normalize weights to sum 1
        total = sum(cfg.weights.values()) or 1.0
        cfg.weights = {k: v / total for k, v in cfg.weights.items()}

        # learned mode: load the trained model sibling to ranker.json
        if cfg.mode == "learned":
            model_path = os.path.join(os.path.dirname(path or "."), "ranker_model.json")
            if os.path.exists(model_path):
                try:
                    cfg.model = json.loads(open(model_path).read())
                except Exception as e:
                    print(f"⚠️  ranker_model.json unreadable ({e}); falling back to heuristic")
                    cfg.mode = "heuristic"
            else:
                print("ℹ️  RANKER=learned but no ranker_model.json yet; using heuristic. "
                      "Collect feedback then run scripts/train_ranker.py.")
                cfg.mode = "heuristic"
        return cfg


class Ranker:
    def __init__(self, cfg: Optional[RankerConfig] = None):
        self.cfg = cfg or RankerConfig()

    # --- individual signal functions (each returns 0..1) ---
    def _recency(self, ts: Optional[str], now: datetime) -> float:
        dt = _parse_ts(ts)
        if dt is None:
            return 0.5  # neutral when unknown
        age_days = max(0.0, (now - dt).total_seconds() / 86400.0)
        return math.exp(-age_days / max(self.cfg.half_life_days, 1e-6))

    def _source(self, source_app: Optional[str]) -> float:
        return float(self.cfg.source_priority.get(source_app or "", 1.0))

    def _tag_match(self, candidate: Dict, query_tokens: set) -> float:
        md = candidate.get("metadata", {})
        tags = [t for t in (md.get("tags", "") or "").split(",") if t]
        if not tags:
            return 0.5  # neutral when no tags
        hits = sum(1 for t in tags if _tokens(t) & query_tokens)
        return min(1.0, hits / len(tags))

    def _learned_score(self, comp: Dict[str, float]) -> float:
        """Logistic model: sigmoid(bias + Σ coef_f · feature_f)."""
        model = self.cfg.model or {}
        bias = float(model.get("bias", 0.0))
        coef = model.get("coef", {})
        z = bias + sum(float(coef.get(f, 0.0)) * comp.get(f, 0.0) for f in FEATURES)
        return 1.0 / (1.0 + math.exp(-max(-60.0, min(60.0, z))))

    # --- main entry ---
    def rerank(self, candidates: List[Dict], query: str, top_k: int) -> List[Dict]:
        if self.cfg.mode == "cosine":
            out = candidates[:top_k]
            for c in out:
                c["rank_score"] = c.get("score", 0.0)
            return out

        now = datetime.now(timezone.utc)
        qtok = _tokens(query)
        w = self.cfg.weights
        learned = self.cfg.mode == "learned"
        for c in candidates:
            md = c.get("metadata", {})
            comp = {
                "similarity": float(c.get("score", 0.0)),
                "recency": self._recency(md.get("timestamp"), now),
                "source_priority": self._source(md.get("source_app")),
                "tag_match": self._tag_match(c, qtok),
            }
            c["rank_components"] = {k: round(v, 4) for k, v in comp.items()}
            if learned:
                c["rank_score"] = round(self._learned_score(comp), 6)
            else:
                c["rank_score"] = round(sum(w[k] * comp[k] for k in w), 6)

        candidates.sort(key=lambda x: x["rank_score"], reverse=True)
        return candidates[:top_k]

    def candidate_pool_size(self, top_k: int) -> int:
        if self.cfg.mode == "cosine":
            return top_k
        return max(top_k * self.cfg.fetch_multiplier, 20)

    def info(self) -> Dict:
        return {
            "mode": self.cfg.mode,
            "weights": self.cfg.weights,
            "half_life_days": self.cfg.half_life_days,
            "source_priority": self.cfg.source_priority,
        }
