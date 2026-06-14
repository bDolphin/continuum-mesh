"""
Shared base for browser-sourced connectors (ChatGPT, Perplexity, Claude.ai).

The extension's content script POSTs already-extracted text to
/ingest/<name>. These connectors just normalize that into a MemoryEvent — the
DOM scraping itself stays in the content script. capture() accepts either a
single item or {"items": [...]} so a content script can batch a whole page.
"""
from __future__ import annotations

from typing import Iterable, Optional

from core.connector import Connector
from core.schema import MemoryEvent


class BrowserConnector(Connector):
    default_message_type = "note"
    capabilities = {"capture"}

    def capture(self, payload: dict) -> Iterable[dict]:
        if not payload:
            return []
        if isinstance(payload.get("items"), list):
            return payload["items"]
        return [payload]

    def normalize(self, raw: dict) -> Optional[MemoryEvent]:
        text = (raw.get("text") or "").strip()
        if len(text) < 3:
            return None
        kwargs = dict(
            text=text,
            source_app=self.name,
            external_id=raw.get("external_id"),  # falls back to a content hash if absent
            url=raw.get("url"),
            conversation_id=raw.get("conversation_id"),
            message_type=raw.get("message_type") or self.default_message_type,
            tags=raw.get("tags") or [],
            raw=raw,
        )
        if raw.get("timestamp"):  # else the dataclass default (now, UTC) applies
            kwargs["timestamp"] = raw["timestamp"]
        return MemoryEvent(**kwargs)
