"""
Continuum — Embedding providers (pluggable + versioned)
Location: daemon/embeddings.py

Why this file exists
--------------------
The original daemon embedded text with a SHA-256 hash ("testing mode").
A hash is deterministic but carries ZERO semantic signal: two sentences that
mean the same thing land as far apart as two unrelated ones. Cosine search over
hash vectors is noise, so "semantic continuity" was mathematically impossible.

This module replaces that with real, local-first embeddings and treats the
embedding model as a *versioned artifact* (model_id + dim). That versioning is
the seam every MLOps practice hangs off later: migrations, A/B evals, and
"which model produced this vector" provenance.

Providers (set via EMBEDDING_MODE):
  - "local"   : real semantic embeddings, runs on your machine, no API key.
                Tries sentence-transformers, then model2vec (no torch).  [default]
  - "openai"  : OpenAI text-embedding-3-small (needs OPENAI_API_KEY).
  - "hash"    : the old hash. Kept ONLY so tests can run with no deps.
                NOT semantic — do not use for real recall. ("testing" is an alias)

Every provider returns an EmbeddingResult so callers always know the vector's
provenance and can store it alongside the memory.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class EmbeddingResult:
    vector: List[float]
    model_id: str      # e.g. "sentence-transformers/all-MiniLM-L6-v2"
    dim: int           # vector length — guards against mixing incompatible spaces


class EmbeddingProvider:
    """Base interface. Subclasses must set model_id and implement embed()."""
    model_id: str = "unknown"

    def embed(self, text: str) -> EmbeddingResult:  # pragma: no cover - interface
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# Local, real, semantic. No API key. This is the default and the moat.
# --------------------------------------------------------------------------- #
class LocalProvider(EmbeddingProvider):
    """
    Real local embeddings. Tries two backends so it works across environments:
      1. sentence-transformers (all-MiniLM-L6-v2, 384-dim) — best quality.
      2. model2vec (potion-base-8M) — no torch, installs on Python 3.14.
    """

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or os.getenv(
            "LOCAL_EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2"
        )
        self._encode = None
        self.model_id = None
        self._load()

    def _load(self) -> None:
        # Backend 1: sentence-transformers
        try:
            from sentence_transformers import SentenceTransformer

            model = SentenceTransformer(self.model_name)
            self._encode = lambda t: model.encode(t, normalize_embeddings=True).tolist()
            self.model_id = f"st/{self.model_name}"
            print(f"✅ Local embeddings: sentence-transformers · {self.model_name}")
            return
        except Exception as e:  # not installed, or model fetch failed
            print(f"ℹ️  sentence-transformers unavailable ({e.__class__.__name__}); trying model2vec…")

        # Backend 2: model2vec (no torch — works on Python 3.14)
        try:
            from model2vec import StaticModel

            m2v_name = os.getenv("LOCAL_EMBED_MODEL_M2V", "minishlab/potion-base-8M")
            model = StaticModel.from_pretrained(m2v_name)

            def _enc(t: str):
                import numpy as np

                v = np.asarray(model.encode([t])[0], dtype="float32")
                n = float(np.linalg.norm(v))
                return (v / n).tolist() if n else v.tolist()

            self._encode = _enc
            self.model_id = f"m2v/{m2v_name}"
            print(f"✅ Local embeddings: model2vec · {m2v_name}")
            return
        except Exception as e:
            raise RuntimeError(
                "No local embedding backend available. Install one of:\n"
                "    pip install sentence-transformers     # best quality (needs torch)\n"
                "    pip install model2vec                  # no torch, Python 3.14 friendly\n"
                f"  (underlying error: {e})"
            )

    def embed(self, text: str) -> EmbeddingResult:
        vec = self._encode(text)
        return EmbeddingResult(vector=vec, model_id=self.model_id, dim=len(vec))


# --------------------------------------------------------------------------- #
# OpenAI — higher quality, needs a key and network. Not local-first.
# --------------------------------------------------------------------------- #
class OpenAIProvider(EmbeddingProvider):
    MODEL = "text-embedding-3-small"  # 1536-dim

    def __init__(self, api_key: str):
        from openai import OpenAI

        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for openai embedding mode")
        self._client = OpenAI(api_key=api_key)
        self.model_id = f"openai/{self.MODEL}"
        print(f"✅ OpenAI embeddings: {self.MODEL}")

    def embed(self, text: str) -> EmbeddingResult:
        resp = self._client.embeddings.create(model=self.MODEL, input=text)
        vec = resp.data[0].embedding
        return EmbeddingResult(vector=vec, model_id=self.model_id, dim=len(vec))


# --------------------------------------------------------------------------- #
# Hash — the old behavior. Deterministic, dependency-free, NOT semantic.
# Kept only so the test suite can run with zero installs.
# --------------------------------------------------------------------------- #
class HashProvider(EmbeddingProvider):
    model_id = "hash/sha256-16"

    def embed(self, text: str) -> EmbeddingResult:
        h = hashlib.sha256(text.encode("utf-8")).digest()
        vec = [b / 255.0 for b in h[:16]]
        return EmbeddingResult(vector=vec, model_id=self.model_id, dim=len(vec))


# --------------------------------------------------------------------------- #
# Factory
# --------------------------------------------------------------------------- #
def build_provider(mode: str, openai_api_key: str = "") -> EmbeddingProvider:
    """
    Construct a provider from a mode string. Falls back to hash ONLY for the
    explicit testing modes — never silently, so you always know what you're running.
    """
    mode = (mode or "local").lower()
    if mode in ("hash", "testing"):
        return HashProvider()
    if mode == "openai":
        return OpenAIProvider(openai_api_key)
    if mode == "local":
        return LocalProvider()
    raise ValueError(f"Unknown EMBEDDING_MODE '{mode}'. Use: local | openai | hash")
