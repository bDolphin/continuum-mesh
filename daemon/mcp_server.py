"""
Continuum — MCP server (Cycle 5)
Location: daemon/mcp_server.py

Exposes the memory layer as Model Context Protocol tools so ANY MCP client
(Claude Desktop, Cursor, other agents) can recall and store Continuum memories
directly — turning Continuum from an app into shared agent infrastructure.

Design: this server is a thin MCP front-end over the daemon's HTTP API
(localhost:2789). It does NOT touch the store or embeddings directly, so the
single source of truth (ranker, dedupe, provenance) stays in the daemon and the
MCP layer can never drift from what the dashboard/extension see.

Run:
    pip install -r requirements-mcp.txt
    python mcp_server.py                 # stdio transport (for Claude Desktop / Cursor)

The file is named mcp_server.py (not mcp/) on purpose, so it never shadows the
installed `mcp` package on sys.path.
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from typing import Optional

from mcp.server.fastmcp import FastMCP

DAEMON = os.getenv("DAEMON_URL", "http://127.0.0.1:2789")
mcp = FastMCP("continuum")


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{DAEMON}{path}", timeout=30) as r:
        return json.loads(r.read().decode())


def _post(path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"{DAEMON}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


@mcp.tool()
def recall(query: str, k: int = 5, source_app: Optional[str] = None) -> list:
    """
    Search the user's cross-tool memory and return the most relevant items.
    Use this to retrieve prior research, decisions, or context the user gathered
    in other tools (ChatGPT, Perplexity, etc.) before answering.

    Args:
        query: what to look for (natural language).
        k: number of memories to return (default 5).
        source_app: optional filter, e.g. "perplexity" or "chatgpt".
    Returns: a list of {id, content, score, source_app, timestamp}.
    """
    params = {"query": query, "limit": str(k)}
    if source_app:
        params["source_app"] = source_app
    data = _get("/recall?" + urllib.parse.urlencode(params))
    out = []
    for m in data.get("memories", []):
        md = m.get("metadata", {})
        out.append({
            "id": m["id"],
            "content": m["content"],
            "score": round(m.get("score", 0.0), 4),
            "source_app": md.get("source_app"),
            "timestamp": md.get("timestamp"),
        })
    return out


@mcp.tool()
def store(text: str, source_app: str = "mcp", tags: Optional[list] = None) -> dict:
    """
    Save a new memory to Continuum so it can be recalled later from any tool.

    Args:
        text: the content to remember.
        source_app: where it came from (default "mcp").
        tags: optional list of tags.
    Returns: {id, embedding_model}.
    """
    resp = _post("/store", {"text": text, "source_app": source_app, "tags": tags or []})
    return {"id": resp.get("memory_id"), "embedding_model": resp.get("embedding_model")}


@mcp.tool()
def stats() -> dict:
    """Return memory counts by source app and embedding model."""
    return _get("/stats")


if __name__ == "__main__":
    mcp.run()
