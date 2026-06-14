"""
Continuum core — the one shared ingest pipeline.
Location: daemon/core/pipeline.py

capture -> normalize -> (dedupe) -> embed -> store, identical for EVERY platform.
The core branches on nothing platform-specific; that all lives in the connector.
"""
from __future__ import annotations

from typing import Dict, List


def ingest(connector, payload: dict, provider, store) -> Dict:
    """
    Run a connector's raw payload through the full pipeline.
    `provider` = EmbeddingProvider (seam #1). `store` = MemoryStore (seam #2).
    Returns a small report; idempotent via (source_app, external_id).
    """
    stored_ids: List[str] = []
    skipped_duplicate = 0
    dropped = 0

    for raw in connector.capture(payload):
        event = connector.normalize(raw)
        if event is None:
            dropped += 1
            continue

        event.ensure_external_id()
        if store.exists(event.source_app, event.external_id):
            skipped_duplicate += 1
            continue

        emb = provider.embed(event.text)
        stored_ids.append(store.add_event(event, emb))

    return {
        "connector": connector.name,
        "ingested": len(stored_ids),
        "skipped_duplicate": skipped_duplicate,
        "dropped": dropped,
        "ids": stored_ids,
    }
