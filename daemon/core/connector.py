"""
Continuum core — the Connector interface.
Location: daemon/core/connector.py

A connector knows ONLY how to read its platform and normalize it. Embedding and
storage are the core's job (seams #1 and #2), never the connector's. That is
what keeps connectors tiny and the core reusable across every platform.

Implement two methods to add a platform:
    capture(payload)  -> iterate raw items
    normalize(raw)    -> one MemoryEvent (or None to drop)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable, Optional

from .schema import MemoryEvent


class Connector(ABC):
    name: str = "unknown"            # unique; also used as source_app
    capabilities: set = set()        # {"capture", "backfill", "realtime"}

    @abstractmethod
    def capture(self, payload: dict) -> Iterable[dict]:
        """Pull raw items from a webhook body / API page / extension POST.
        Returns raw dicts — no normalization yet."""

    @abstractmethod
    def normalize(self, raw: dict) -> Optional[MemoryEvent]:
        """Map ONE raw item to a MemoryEvent, or return None to drop it
        (empty/system/noise). Platform quirks are absorbed here."""

    def health(self) -> dict:
        return {"name": self.name, "ok": True, "capabilities": sorted(self.capabilities)}
