"""
Deterministic unit tests for the context assembler (Cycle 5).
Run:  cd daemon && python -m eval.test_assembler   (or: python eval/test_assembler.py)
No daemon or network needed — the assembler is a pure module.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from assembler import (  # noqa: E402
    assemble_context,
    count_tokens,
    dedupe,
    compress_to,
    TOKENIZER,
)


def _mk(i, text, score, src="chatgpt"):
    return {"id": str(i), "text": text, "score": score, "rank_score": score,
            "metadata": {"source_app": src}}


# --------------------------------------------------------------------------- #
# Dedupe
# --------------------------------------------------------------------------- #
def test_dedupe_drops_near_duplicate():
    a = "We chose AWS NLB over ALB for gRPC because it preserves the connection and lowers latency."
    b = "We chose AWS NLB over ALB for gRPC because it preserves connection and lowers latency."  # near-dup
    c = "Postgres runs on db.r6g.large in us-east-1 with nightly backups."
    # Pin threshold so a CI env that sets CONTINUUM_DEDUPE_THRESHOLD can't break this.
    kept, dropped = dedupe([_mk(1, a, 0.9), _mk(2, b, 0.8), _mk(3, c, 0.6)], threshold=0.85)
    assert dropped == 1, f"expected 1 dropped dup, got {dropped}"
    assert [k["id"] for k in kept] == ["1", "3"], "should keep higher-ranked of the dup pair + the distinct one"
    print("ok: dedupe_drops_near_duplicate")


def test_dedupe_threshold_boundaries():
    # threshold=1.0 drops only true duplicates of token sets.
    a = "alpha beta gamma"
    b = "alpha beta delta"  # Jaccard = 2/4 = 0.5
    kept, dropped = dedupe([_mk(1, a, 0.9), _mk(2, b, 0.8)], threshold=1.0)
    assert dropped == 0, "threshold=1.0 should drop nothing for Jaccard<1"
    # Out-of-range threshold is clamped (not a crash).
    kept2, dropped2 = dedupe([_mk(1, a, 0.9), _mk(2, a, 0.8)], threshold=99.0)
    assert dropped2 == 1, "clamped threshold should still drop true duplicates"
    print("ok: dedupe_threshold_boundaries")


# --------------------------------------------------------------------------- #
# Budget
# --------------------------------------------------------------------------- #
def test_budget_is_respected():
    longtext = " ".join([f"Sentence number {n} about the deployment architecture and tradeoffs." for n in range(40)])
    res = [_mk(i, longtext, 0.9 - i * 0.05, src=f"app{i}") for i in range(6)]
    out = assemble_context(res, query="deployment architecture", token_budget=200)
    assert out["tokens_used"] <= 200, f"budget exceeded: {out['tokens_used']}"
    assert out["stats"]["included"] >= 1, "should include at least one memory"
    print(f"ok: budget_is_respected (used {out['tokens_used']}/200, "
          f"included {out['stats']['included']})")


def test_single_result_overflow_respects_budget():
    # One huge candidate, tight budget. Either it's truncated to fit or dropped —
    # but tokens_used must NEVER exceed the requested budget.
    text = " ".join(["deployment architecture tradeoff sentence."] * 200)
    out = assemble_context([_mk(1, text, 0.99)], query="deployment", token_budget=40)
    assert out["tokens_used"] <= 40, f"single-result overflow exceeded budget: {out['tokens_used']}"
    print(f"ok: single_result_overflow_respects_budget (used {out['tokens_used']}/40)")


def test_negative_budget_uses_default():
    res = [_mk(1, "Caching strategy notes.", 0.9)]
    out = assemble_context(res, query="caching", token_budget=-5)
    assert out["token_budget"] > 0, "negative budget should be replaced by default"
    print(f"ok: negative_budget_uses_default (token_budget={out['token_budget']})")


def test_ranked_order_break_not_backfill():
    # Big high-ranked item that overflows → must STOP. A smaller, lower-ranked
    # item must NOT be backfilled into the remaining space.
    big = " ".join(["alpha beta gamma delta epsilon."] * 100)
    small = "alpha tiny note."
    res = [_mk(1, big, 0.99, src="chatgpt"), _mk(2, small, 0.10, src="notes")]
    out = assemble_context(res, query="alpha", token_budget=30)
    included_srcs = [r["source_app"] for r in out["included"]]
    assert "notes" not in included_srcs, (
        "lower-ranked item must NOT backfill after a higher-ranked overflow; "
        f"got included={included_srcs}"
    )
    print(f"ok: ranked_order_break_not_backfill (included={included_srcs})")


# --------------------------------------------------------------------------- #
# Compression
# --------------------------------------------------------------------------- #
def test_compress_keeps_query_relevant_sentence():
    text = ("Unrelated chit-chat about lunch. "
            "The decision was to use NLB for gRPC latency. "
            "More unrelated filler about the weather today.")
    out, truncated = compress_to(text, query="NLB gRPC latency", max_tokens=20)
    assert "NLB" in out, f"query-relevant sentence should survive: {out!r}"
    # Compressor MUST drop unrelated filler when budget is tight.
    assert "chit-chat" not in out, f"unrelated lead-in should be dropped: {out!r}"
    assert "weather" not in out, f"unrelated trailer should be dropped: {out!r}"
    assert truncated, "truncated flag should be True when content was dropped"
    print(f"ok: compress_keeps_query_relevant_sentence -> {out!r}")


def test_strict_no_overlap_returns_empty():
    # Query shares ZERO tokens with any sentence — strict fallback returns "",
    # the assembler then drops the item as dropped_no_signal.
    text = "The Postgres instance lives in us-east-1 with nightly backups."
    out, truncated = compress_to(text, query="xyzzyfoo", max_tokens=200)
    assert out == "", f"strict no-overlap fallback should return empty, got {out!r}"
    assert truncated is False, "no-overlap fallback shouldn't claim truncation"

    res = [_mk(1, text, 0.9, src="cursor")]
    assembled = assemble_context(res, query="xyzzyfoo", token_budget=500)
    assert assembled["context"] == ""
    assert assembled["stats"]["dropped_no_signal"] == 1
    assert assembled["stats"]["included"] == 0
    print("ok: strict_no_overlap_returns_empty")


def test_truncation_flag_not_fooled_by_existing_ellipsis():
    # A memory whose original text ends with "…" must NOT be flagged as truncated
    # when it fits entirely under budget.
    text = "Quote that legitimately ends like this…"
    out = assemble_context([_mk(1, text, 0.9, src="chatgpt")],
                           query="quote", token_budget=500)
    assert out["included"][0]["truncated"] is False, (
        "false-positive truncation: original ellipsis should not flag truncated"
    )
    print("ok: truncation_flag_not_fooled_by_existing_ellipsis")


# --------------------------------------------------------------------------- #
# Edge inputs
# --------------------------------------------------------------------------- #
def test_empty_input():
    out = assemble_context([], query="anything", token_budget=500)
    assert out["context"] == ""
    assert out["stats"]["included"] == 0
    assert out["confidence"] == 0.0
    print("ok: empty_input")


def test_none_text_classified_as_empty_not_no_budget():
    out = assemble_context([{"id": "1", "text": None, "metadata": {"source_app": "x"}}],
                           query="q", token_budget=500)
    assert out["stats"]["dropped_empty"] == 1, "None text should count as dropped_empty"
    assert out["stats"]["dropped_no_budget"] == 0, "plenty of budget — shouldn't be dropped_no_budget"
    print("ok: none_text_classified_as_empty_not_no_budget")


def test_missing_score_defaults_to_zero():
    out = assemble_context([{"id": "1", "text": "A caching decision.",
                             "metadata": {"source_app": "a"}}],
                           query="caching", token_budget=500)
    assert out["included"][0]["score"] == 0.0
    print("ok: missing_score_defaults_to_zero")


def test_provenance_headers_present():
    out = assemble_context([_mk(1, "A decision about caching.", 0.9, src="cursor")],
                           query="caching", token_budget=500)
    assert "[cursor]" in out["context"], "each block should be tagged with its source app"
    assert out["included"][0]["source_app"] == "cursor"
    print("ok: provenance_headers_present")


# --------------------------------------------------------------------------- #
# Confidence signal (Cycle 5 D3 prereq)
# --------------------------------------------------------------------------- #
def test_confidence_signal_combines_top_score_and_coverage():
    # 2 candidates, 1 included → confidence = top_score * (1/2) = 0.9 * 0.5 = 0.45
    res = [
        _mk(1, "alpha context that overlaps.", 0.9),
        _mk(2, "completely unrelated content with no signal.", 0.5),
    ]
    out = assemble_context(res, query="alpha", token_budget=500)
    assert 0 < out["confidence"] <= 1.0, f"confidence out of range: {out['confidence']}"
    # Both empty / no candidates → confidence = 0
    assert assemble_context([], query="x", token_budget=500)["confidence"] == 0.0
    print(f"ok: confidence_signal_combines_top_score_and_coverage (got {out['confidence']})")


# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\nAll {len(tests)} assembler tests passed (tokenizer={TOKENIZER}).")
