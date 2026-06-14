# Continuum — Modularization & Connector Architecture

_How to make every platform (ChatGPT, Perplexity, Cursor, Slack, Notion, …) a
plug-in/plug-out module without ever touching the core._

---

## The core idea: a stable spine with three pluggable seams

Continuum should be a small, stable **core** that knows nothing about any
specific platform, surrounded by **adapters** behind narrow interfaces. When the
interface is fixed and narrow, you add or remove a platform by writing/deleting
one file — the core never changes.

```
                 ┌──────────────────────────────────────────┐
                 │                  CORE                      │
   capture       │   MemoryEvent (normalized schema)          │   read
  ───────────►   │        │                                   │ ◄────────
  CONNECTORS     │        ▼                                   │  CONSUMERS
  (per platform) │   EmbeddingProvider  ──►  MemoryStore      │  (dashboard,
                 │      (seam #1)            (seam #2)         │   recall API,
                 │                                            │   MCP, agents)
                 └──────────────────────────────────────────┘
                            seam #3 = Connector
```

Three seams, each an interface with multiple interchangeable implementations:

| Seam | Interface | Implementations (now / future) | Status |
|------|-----------|--------------------------------|--------|
| **#1 Embedding** | `EmbeddingProvider.embed(text) -> EmbeddingResult` | local · openai · hash | ✅ done (`embeddings.py`) |
| **#2 Store** | `MemoryStore` (add/recall/delete/stats/reembed) | SQLite now · Chroma/Qdrant/pgvector later | ✅ interface exists; formalize as ABC |
| **#3 Connector** | `Connector.capture/normalize` → `MemoryEvent` | chatgpt · perplexity · (slack, notion, cursor…) | ⬜ to build (formalize the ad-hoc content scripts) |

Seams #1 and #2 already exist from the daemon rebuild. This doc focuses on
**#3, the connector layer**, because that's what "plug any platform in/out" means
— and it formalizes the pattern your two content scripts already hint at.

---

## The contract everything agrees on: `MemoryEvent`

Every connector, no matter the platform, emits the same normalized object. The
core only ever sees this — never a Slack payload or a DOM node. This one schema
is the decoupling point.

```python
# core/schema.py
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timezone

@dataclass
class MemoryEvent:
    text: str                      # the content to embed/store
    source_app: str                # "chatgpt" | "perplexity" | "slack" | ...
    external_id: str               # stable id within the source (dedupe key)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    url: Optional[str] = None
    conversation_id: Optional[str] = None
    message_type: Optional[str] = None   # "prompt" | "response" | "note" | ...
    tags: list[str] = field(default_factory=list)
    author: Optional[str] = None         # who said it (for Slack/team memory later)
    raw: dict = field(default_factory=dict)  # provenance: original payload, kept for re-normalization
```

`external_id` is what makes connectors **idempotent**: the same Slack message or
ChatGPT turn captured twice should not create two memories. (Add a UNIQUE index
on `(source_app, external_id)` in the store.)

---

## Seam #3: the `Connector` interface

This is the `capture() / normalize() / embed() / store()` pipeline from your
original notes, made concrete. Note that **embed and store are NOT the
connector's job** — they belong to the core. A connector only knows how to pull
raw data from its platform and normalize it. That separation is what keeps
connectors tiny and the core reusable.

```python
# core/connector.py
from abc import ABC, abstractmethod
from typing import Iterable
from .schema import MemoryEvent

class Connector(ABC):
    """One per platform. Knows ONLY how to read its platform and normalize."""

    name: str                      # "slack", unique; used in registry + source_app
    capabilities: set[str] = set() # e.g. {"capture", "backfill", "realtime"}

    @abstractmethod
    def capture(self, payload: dict) -> Iterable[dict]:
        """Pull raw items from the platform (a webhook body, an API page, a DOM
        scrape result). Returns raw dicts — no normalization yet."""

    @abstractmethod
    def normalize(self, raw: dict) -> MemoryEvent | None:
        """Map ONE raw item to a MemoryEvent. Return None to drop it (noise,
        empty, system message). This is where platform quirks are absorbed."""

    def health(self) -> dict:
        return {"name": self.name, "ok": True}
```

The core provides the shared `ingest` pipeline once, for all connectors:

```python
# core/pipeline.py
def ingest(connector, payload, provider, store) -> list[str]:
    ids = []
    for raw in connector.capture(payload):
        event = connector.normalize(raw)
        if event is None:
            continue
        if store.exists(event.source_app, event.external_id):  # idempotency
            continue
        emb = provider.embed(event.text)        # seam #1
        ids.append(store.add_event(event, emb)) # seam #2
    return ids
```

Adding a platform = implement two methods. Removing one = delete the file and
its registry line. The core (`pipeline.ingest`, embedding, store, recall) is
never edited.

---

## The registry: plug in / plug out

Connectors self-register, and a config file decides which are live. Unplugging a
platform is a config flag, not a code change.

```python
# core/registry.py
_REGISTRY: dict[str, type] = {}

def register(cls):                  # decorator
    _REGISTRY[cls.name] = cls
    return cls

def build_enabled(config) -> dict:
    return {name: _REGISTRY[name]() for name in config["enabled_connectors"]
            if name in _REGISTRY}
```

```python
# connectors/slack.py
from core.registry import register
from core.connector import Connector
from core.schema import MemoryEvent

@register
class SlackConnector(Connector):
    name = "slack"
    capabilities = {"capture", "realtime"}

    def capture(self, payload):
        # payload = a Slack Events API webhook body
        if payload.get("event", {}).get("type") == "message":
            yield payload["event"]

    def normalize(self, raw):
        text = (raw.get("text") or "").strip()
        if not text or raw.get("subtype") == "bot_message":
            return None
        return MemoryEvent(
            text=text,
            source_app="slack",
            external_id=f"{raw['channel']}:{raw['ts']}",
            conversation_id=raw["channel"],
            author=raw.get("user"),
            message_type="message",
            raw=raw,
        )
```

```jsonc
// config.json
{ "enabled_connectors": ["chatgpt", "perplexity", "slack"] }   // drop "slack" to unplug it
```

The daemon exposes one generic ingest route that dispatches by connector name —
so you never add a new endpoint per platform:

```python
@app.post("/ingest/{connector_name}")
async def ingest_route(connector_name: str, payload: dict):
    connector = CONNECTORS.get(connector_name)
    if not connector:
        raise HTTPException(404, f"connector '{connector_name}' not enabled")
    ids = ingest(connector, payload, config.provider, store)
    return {"success": True, "ingested": len(ids), "ids": ids}
```

---

## Two connector locations (don't force one shape)

Platforms split cleanly into two delivery models. Same `MemoryEvent` contract,
different transport:

1. **Client-side (browser) connectors** — ChatGPT, Perplexity, Claude.ai. They
   live in the extension as content scripts. Their `capture()` is DOM scraping;
   they POST normalized events to the daemon's `/ingest/<name>` (or keep using
   `/store`). Your current `content/chatgpt.js` and `content/perplexity.js` are
   exactly these — today they hand-roll the payload; formalize them to emit a
   `MemoryEvent` shape so the server treats every source identically.

2. **Server-side connectors** — Slack, Notion, GitHub, Linear. No browser
   involved; the daemon (or a small worker) calls their APIs / receives their
   webhooks and runs the same `ingest` pipeline. These get `backfill`
   (historical import) and `realtime` (webhook) capabilities.

A connector declares which model it is via `capabilities`; the core routes
accordingly. Nothing else differs.

---

## Proposed directory layout

```
daemon/
  core/
    schema.py          # MemoryEvent
    connector.py       # Connector ABC
    pipeline.py        # ingest() — the one shared capture→normalize→embed→store flow
    registry.py        # register() + build_enabled()
    store.py           # MemoryStore ABC (formalize current SQLite impl behind it)
  embeddings.py        # EmbeddingProvider (seam #1) — already done
  stores/
    sqlite_store.py    # current impl, moved behind the ABC
    qdrant_store.py    # future, same interface
  connectors/
    chatgpt.py         # browser connector (normalizes events the extension sends)
    perplexity.py
    slack.py           # server connector
    notion.py
  main.py              # thin: wires config → providers → /ingest, /recall, /evaluate
  config.json          # enabled_connectors + active embedding model
```

---

## Migration path (incremental — don't rewrite at once)

You already have the hard parts. Formalize in this order, each step shippable:

1. **Extract `MemoryEvent` + `MemoryStore` ABC.** Make today's SQLite store
   implement the ABC. Zero behavior change; pure refactor. _(½ day)_
2. **Add `Connector` ABC + registry + `/ingest/{name}`.** Keep `/store` working
   as a legacy alias. _(½ day)_
3. **Convert chatgpt & perplexity** into real `Connector` classes; the extension
   posts `MemoryEvent`-shaped JSON. Now both browsers go through one code path. _(1 day)_
4. **Add the first server connector (Slack or Notion)** to prove a non-browser
   platform plugs in with no core change. This is the moment the architecture
   pays off — and a strong portfolio milestone. _(1–2 days)_
5. **Add `(source_app, external_id)` UNIQUE index + `store.exists()`** for
   idempotent capture across all connectors. _(½ day)_

---

## How each seam stays swappable (the rules that keep it clean)

- **Narrow interfaces only.** A connector may import `core.schema` and
  `core.connector` — nothing else. If a connector needs to import the store or
  the embedder, the boundary has leaked.
- **The core never branches on `source_app`.** Any `if source_app == "slack"`
  in core code is a design smell; that logic belongs in the connector.
- **Versioned contracts.** `MemoryEvent` gets a `schema_version`; the embedding
  model is already versioned per-vector. Store-level migrations go through
  `reembed_all` (seam #1) and a future `migrate()` (seam #2).
- **Capabilities, not assumptions.** Code asks `"backfill" in connector.capabilities`
  rather than assuming what a platform supports.
- **Config decides what's live.** Plug/unplug is editing `enabled_connectors`,
  never editing code.

---

## Why this is also the moat (tie-back to strategy)

This connector layer *is* the "GitHub of AI memory" claim made concrete: a
neutral, vendor-agnostic ingestion standard that no single hyperscaler will
build because it requires integrating with competitors. Every connector you add
widens the cross-tool graph; the `MemoryEvent` schema becomes the interchange
format others can target. Keep the core tiny and the seams narrow, and "plug any
platform in or out" stops being an aspiration and becomes a one-file operation.
