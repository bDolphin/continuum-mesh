"""
Continuum — Context Assembler (Cycle 5, deliverable 2)
Location: daemon/assembler.py

Turns ranked recall results into an INJECTABLE context block: the right amount
of the right context, trimmed to a token budget.

This is the "retrieval != orchestration" piece. /recall returns raw ranked
memories; the assembler sits on top and does three deterministic things:

    rank (done upstream by ranker)  ->  dedupe  ->  summarize-to-fit

  1. dedupe        drop near-duplicate memories (Jaccard token overlap) so we
                   don't spend budget repeating the same fact captured from two
                   tools (e.g. the same note from ChatGPT and Perplexity).
  2. summarize     query-aware EXTRACTIVE compression: keep each memory's most
                   query-relevant sentences, in original order, up to a per-item
                   cap. STRICT FALLBACK: if no sentence overlaps the query at
                   all, return empty rather than guess — signal beats noise.
  3. fit           walk the ranked list highest-first, include what fits, STOP
                   at the global token budget (ranked order is the contract).

Pure module: no I/O, no daemon imports. main.py calls assemble_context() with
the list that search() already produces.
"""
from __future__ import annotations

import math
import os
import re
from typing import Dict, List, Optional, Tuple

# ----------------------------------------------------------------------------- #
# Tokenisation / counting
# ----------------------------------------------------------------------------- #
_WORD = re.compile(r"[a-z0-9]+")
# Sentence split: end punctuation followed by whitespace, or newlines.
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")
_ELLIPSIS = " …"  # appended when content was trimmed; reserved when budgeting

# Reserve enough headroom for the provenance header at worst-case source-app name.
_HEADER_RESERVE_TOKENS = 8


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        print(f"⚠️  {name}={raw!r} is not an int; falling back to {default}")
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        print(f"⚠️  {name}={raw!r} is not a float; falling back to {default}")
        return default


# Defaults (env-overridable so callers don't have to thread config through).
DEFAULT_BUDGET = _env_int("CONTINUUM_CONTEXT_BUDGET", 1200)
DEFAULT_DEDUPE_THRESHOLD = max(0.0, min(1.0, _env_float("CONTINUUM_DEDUPE_THRESHOLD", 0.85)))

# Try tiktoken for accurate counts; fall back to a ~4-chars/token heuristic.
try:  # pragma: no cover - exercised only when tiktoken is installed
    import tiktoken

    _ENC = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        if not text:
            return 0
        return len(_ENC.encode(text))

    def _truncate_to_tokens(text: str, max_tokens: int) -> str:
        if max_tokens <= 0 or not text:
            return ""
        toks = _ENC.encode(text)
        if len(toks) <= max_tokens:
            return text
        return _ENC.decode(toks[:max_tokens])

    TOKENIZER = "tiktoken/cl100k_base"
except Exception:  # tiktoken not installed -> heuristic
    def count_tokens(text: str) -> int:
        # ~4 chars per token is the standard rough estimate for English.
        if not text:
            return 0
        return math.ceil(len(text) / 4)

    def _truncate_to_tokens(text: str, max_tokens: int) -> str:
        if max_tokens <= 0 or not text:
            return ""
        approx_chars = max_tokens * 4
        if len(text) <= approx_chars:
            return text
        return text[:approx_chars]

    TOKENIZER = "heuristic/4-chars"


def _words(text: Optional[str]) -> set:
    return set(_WORD.findall((text or "").lower()))


def _jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 1.0  # both empty → treat as identical, lets dedupe collapse them
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _sentences(text: Optional[str]) -> List[str]:
    parts = [s.strip() for s in _SENT_SPLIT.split(text or "") if s.strip()]
    return parts or ([text.strip()] if text and text.strip() else [])


def _is_empty_text(text: Optional[str]) -> bool:
    return not text or not str(text).strip()


# ----------------------------------------------------------------------------- #
# Steps
# ----------------------------------------------------------------------------- #
def dedupe(results: List[Dict], threshold: float = DEFAULT_DEDUPE_THRESHOLD) -> Tuple[List[Dict], int]:
    """
    Drop near-duplicates. Input is assumed ranked best-first, so the FIRST
    occurrence (higher rank) is kept and later near-identical ones are dropped.
    Returns (kept, n_dropped).
    """
    threshold = max(0.0, min(1.0, threshold))
    kept: List[Dict] = []
    kept_tokens: List[set] = []
    dropped = 0
    for r in results:
        toks = _words(r.get("text", ""))
        if any(_jaccard(toks, prev) >= threshold for prev in kept_tokens):
            dropped += 1
            continue
        kept.append(r)
        kept_tokens.append(toks)
    return kept, dropped


def compress_to(text: Optional[str], query: str, max_tokens: int) -> Tuple[str, bool]:
    """
    Query-aware extractive compression. Keep the sentences with the most overlap
    with the query, in their ORIGINAL order, until max_tokens is reached.

    STRICT FALLBACK: if NO sentence overlaps the query, return ("", False) —
    explicit "no signal" beats guessing a sentence. The caller will drop the item.

    Returns (text, truncated_flag). The flag is True when content was dropped.
    """
    if max_tokens <= 0 or _is_empty_text(text):
        return "", False

    q = _words(query)
    # STRICT FALLBACK: if the query is non-empty and shares ZERO word-tokens
    # with the entire memory, drop the item (return ""). Better an empty
    # context block than injecting tokenally-irrelevant noise.
    if q and not (_words(text) & q):
        return "", False

    if count_tokens(text) <= max_tokens:
        return text.strip(), False

    sents = _sentences(text)

    if len(sents) <= 1:
        # Reserve room for the ellipsis suffix in the token budget.
        budget = max_tokens - count_tokens(_ELLIPSIS)
        if budget <= 0:
            return "", False
        truncated = _truncate_to_tokens(sents[0], budget).rstrip()
        return (truncated + _ELLIPSIS).strip(), True

    # Multi-sentence path: rank by query-token overlap.
    # key (overlap_desc, idx_asc); negate to keep `reverse=False` semantics clean.
    scored = sorted(
        enumerate(sents),
        key=lambda it: (-len(_words(it[1]) & q), it[0]),
    )

    # STRICT FALLBACK: if best overlap is zero AND we have a query, bail.
    if q and len(_words(scored[0][1]) & q) == 0:
        return "", False

    chosen_idx: List[int] = []
    used = 0
    reserve = count_tokens(_ELLIPSIS)  # in case we end up trimming
    for idx, sent in scored:
        # Stop adding sentences with zero overlap; we already proved at least
        # one overlapped above, so reading further is just padding noise.
        if q and len(_words(sent) & q) == 0:
            break
        t = count_tokens(sent)
        if used + t > max_tokens - reserve:
            continue
        chosen_idx.append(idx)
        used += t
        if used >= max_tokens - reserve:
            break

    if not chosen_idx:
        # Best overlapping sentence itself doesn't fit — truncate it instead of
        # giving up entirely (we know it has at least some signal).
        budget = max_tokens - reserve
        if budget <= 0:
            return "", False
        truncated = _truncate_to_tokens(scored[0][1], budget).rstrip()
        return (truncated + _ELLIPSIS).strip(), True

    chosen_idx.sort()
    out = " ".join(sents[i] for i in chosen_idx)
    if len(chosen_idx) < len(sents):
        out = (out + _ELLIPSIS).strip()
        return out, True
    return out, False


def assemble_context(
    results: List[Dict],
    query: str = "",
    token_budget: int = DEFAULT_BUDGET,
    dedupe_threshold: float = DEFAULT_DEDUPE_THRESHOLD,
    per_item_max_tokens: Optional[int] = None,
) -> Dict:
    """
    Assemble a ranked recall result set into an injectable context block.

    results: list of dicts as produced by main.search() / the ranker. Each must
             have at least "text"; "id", "score", "rank_score", "metadata" are
             carried through into provenance when present.

    Returns a dict:
      {
        "context":  "<the assembled block, ready to inject>",
        "tokens_used": int,
        "token_budget": int,
        "tokenizer": "tiktoken/..." | "heuristic/4-chars",
        "confidence": float,    # top_score * included/candidates  (Cycle 5 D3 signal)
        "stats": {candidates, deduped, included,
                  dropped_duplicates, dropped_empty, dropped_no_budget,
                  dropped_no_signal},
        "included": [ {id, source_app, score, tokens, truncated}, ... ],
      }
    """
    if token_budget <= 0:
        token_budget = DEFAULT_BUDGET
    dedupe_threshold = max(0.0, min(1.0, dedupe_threshold))
    if per_item_max_tokens is None:
        # Soft per-item cap so one huge memory can't eat the whole budget;
        # ensures at least ~4 memories can appear. Caller can override.
        per_item_max_tokens = max(120, token_budget // 4)
    elif per_item_max_tokens <= 0:
        per_item_max_tokens = max(120, token_budget // 4)

    n_candidates = len(results)

    # Drop empty/None text upfront — they can't carry signal and pollute stats.
    non_empty = [r for r in results if not _is_empty_text(r.get("text"))]
    dropped_empty = n_candidates - len(non_empty)

    deduped, dropped_dupes = dedupe(non_empty, dedupe_threshold)

    blocks: List[str] = []
    included: List[Dict] = []
    used = 0
    sep_tokens = count_tokens("\n\n")
    dropped_no_budget = 0
    dropped_no_signal = 0

    for r in deduped:
        sep_cost = sep_tokens if blocks else 0
        remaining = token_budget - used - sep_cost
        if remaining <= _HEADER_RESERVE_TOKENS:
            dropped_no_budget += 1
            continue

        meta = r.get("metadata") or {}
        src = meta.get("source_app", "unknown")
        header = f"[{src}] "
        header_tokens = count_tokens(header)

        allot = min(per_item_max_tokens, remaining - header_tokens)
        if allot <= 0:
            dropped_no_budget += 1
            continue

        snippet, was_truncated = compress_to(r.get("text"), query, allot)
        if not snippet:
            # Could be "no overlapping signal" or "couldn't fit anything".
            # We only know it's the strict-no-overlap path when the query is
            # non-empty AND the candidate has text — otherwise treat as budget.
            if query and not _is_empty_text(r.get("text")):
                dropped_no_signal += 1
            else:
                dropped_no_budget += 1
            continue

        block = f"{header}{snippet}"
        t = count_tokens(block)
        if used + sep_cost + t > token_budget:
            # Ranked order is the contract: stop on first overflow rather than
            # backfilling with smaller, lower-ranked items.
            dropped_no_budget += 1
            break

        used += sep_cost + t
        blocks.append(block)
        score = r.get("rank_score", r.get("score"))
        if score is None:
            score = 0.0
        included.append(
            {
                "id": r.get("id"),
                "source_app": src,
                "score": score,
                "tokens": t,
                "truncated": was_truncated,
            }
        )

    context = "\n\n".join(blocks)
    top_score = float(included[0]["score"]) if included else 0.0
    confidence = (
        round(top_score * (len(included) / n_candidates), 4)
        if n_candidates > 0 and included
        else 0.0
    )
    return {
        "context": context,
        "tokens_used": used,
        "token_budget": token_budget,
        "tokenizer": TOKENIZER,
        "confidence": confidence,
        "stats": {
            "candidates": n_candidates,
            "deduped": len(deduped),
            "included": len(included),
            "dropped_duplicates": dropped_dupes,
            "dropped_empty": dropped_empty,
            "dropped_no_budget": dropped_no_budget,
            "dropped_no_signal": dropped_no_signal,
        },
        "included": included,
    }


# ----------------------------------------------------------------------------- #
# Tiny self-test:  python assembler.py
# ----------------------------------------------------------------------------- #
if __name__ == "__main__":
    sample = [
        {"id": "1", "text": "We chose AWS NLB over ALB for the gRPC service because NLB preserves the client connection and gives lower latency. ALB adds HTTP overhead.", "score": 0.91, "rank_score": 0.91, "metadata": {"source_app": "chatgpt"}},
        {"id": "2", "text": "We chose AWS NLB over ALB for the gRPC service because NLB preserves the connection and gives lower latency. ALB adds HTTP overhead.", "score": 0.88, "rank_score": 0.88, "metadata": {"source_app": "perplexity"}},  # near-dup of #1
        {"id": "3", "text": "The Postgres instance is db.r6g.large in us-east-1. Backups run nightly at 02:00 UTC. Read replica lives in us-west-2.", "score": 0.62, "rank_score": 0.62, "metadata": {"source_app": "cursor"}},
        {"id": "4", "text": "Reminder to buy oat milk.", "score": 0.10, "rank_score": 0.10, "metadata": {"source_app": "notes"}},
    ]
    out = assemble_context(sample, query="why did we pick NLB for grpc", token_budget=120)
    print("tokenizer:", out["tokenizer"])
    print("confidence:", out["confidence"])
    print("stats:", out["stats"])
    print("tokens_used:", out["tokens_used"], "/", out["token_budget"])
    print("included:", out["included"])
    print("---- context ----")
    print(out["context"])
    assert out["stats"]["dropped_duplicates"] == 1, "should drop the NLB near-duplicate"
    assert out["tokens_used"] <= out["token_budget"], "must respect budget"
    print("\nOK")
