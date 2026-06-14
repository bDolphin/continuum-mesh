"""
Slack connector (server-sourced) — registered but DISABLED by default.

Exists to prove the plug-in/plug-out story: a non-browser platform plugs in with
zero core changes, and toggling it is a one-line edit in config.json
("enabled_connectors"). capture() understands a Slack Events API webhook body.
"""
from typing import Iterable, Optional

from core.registry import register
from core.connector import Connector
from core.schema import MemoryEvent


@register
class SlackConnector(Connector):
    name = "slack"
    capabilities = {"capture", "realtime"}

    def capture(self, payload: dict) -> Iterable[dict]:
        event = (payload or {}).get("event", {})
        if event.get("type") == "message":
            yield event

    def normalize(self, raw: dict) -> Optional[MemoryEvent]:
        text = (raw.get("text") or "").strip()
        if not text or raw.get("subtype") == "bot_message":
            return None
        return MemoryEvent(
            text=text,
            source_app="slack",
            external_id=f"{raw.get('channel')}:{raw.get('ts')}",
            conversation_id=raw.get("channel"),
            author=raw.get("user"),
            message_type="message",
            raw=raw,
        )
