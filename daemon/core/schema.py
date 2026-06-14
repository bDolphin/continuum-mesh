"""
Continuum core — the normalized event every connector emits.
Location: daemon/core/schema.py

This is THE decoupling point. The core never sees a Slack payload or a DOM node;
it only ever sees a MemoryEvent. Add a platform => map it to this. That's all.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional

SCHEMA_VERSION = 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class MemoryEvent:
    text: str                                  # content to embed/store
    source_app: str                            # "chatgpt" | "perplexity" | "slack" | ...
    external_id: Optional[str] = None          # stable id within the source (dedupe key)
    timestamp: str = field(default_factory=_now)
    url: Optional[str] = None
    conversation_id: Optional[str] = None
    message_type: Optional[str] = None         # "prompt" | "response" | "note" | "message"
    tags: List[str] = field(default_factory=list)
    author: Optional[str] = None               # who said it (team memory later)
    raw: dict = field(default_factory=dict)    # original payload, kept for re-normalization
    schema_version: int = SCHEMA_VERSION

    def ensure_external_id(self) -> str:
        """
        Connectors should set external_id, but if a source can't provide a stable
        one we derive a deterministic fallback so dedupe still works: the same
        text in the same conversation won't be stored twice.
        """
        if self.external_id:
            return self.external_id
        basis = f"{self.conversation_id or 'na'}|{self.text}"
        self.external_id = hashlib.sha1(basis.encode("utf-8")).hexdigest()[:16]
        return self.external_id
