"""
Continuum — Persistent vector store (SQLite + numpy)
Location: daemon/memory_store.py

Why this replaces the old file
------------------------------
The previous MemoryStore kept everything in a Python dict, so every memory
vanished when the daemon restarted. ChromaDB was listed in requirements but
disabled (Python 3.14 build issues), so nothing was actually persisted.

This implementation:
  - persists to a single SQLite file on disk (durable, zero external services),
  - stores each vector as a float32 BLOB plus its embedding model_id + dim,
  - does exact cosine search in numpy (fine to tens of thousands of rows; swap
    in Chroma/Qdrant later behind this same interface),
  - REFUSES to compare vectors from different embedding models, so a model
    upgrade can't silently corrupt recall.

Interface is intentionally identical to the old one (add_memory / recall /
delete_memory / get_all_memories) so main.py and the extension keep working,
plus a few additions (stats, count, embedding-version awareness).
"""
from __future__ import annotations

import json
import math
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import numpy as np


class MemoryStore:
    def __init__(self, persist_directory: str = "./chroma_db", db_filename: str = "continuum.db"):
        self.persist_directory = persist_directory
        os.makedirs(persist_directory, exist_ok=True)
        self.db_path = os.path.join(persist_directory, db_filename)
        # check_same_thread=False: FastAPI may touch this from different threads.
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    # ------------------------------------------------------------------ #
    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS memories (
                id              TEXT PRIMARY KEY,
                text            TEXT NOT NULL,
                source_app      TEXT,
                external_id     TEXT,           -- stable id within source (dedupe)
                author          TEXT,
                url             TEXT,
                conversation_id TEXT,
                message_type    TEXT,
                tags            TEXT,           -- comma-joined
                timestamp       TEXT NOT NULL,
                embed_model     TEXT NOT NULL,  -- provenance: which model made `vector`
                embed_dim       INTEGER NOT NULL,
                vector          BLOB NOT NULL   -- float32 bytes
            );
            CREATE INDEX IF NOT EXISTS idx_source ON memories(source_app);
            CREATE INDEX IF NOT EXISTS idx_model  ON memories(embed_model);
            CREATE INDEX IF NOT EXISTS idx_ts     ON memories(timestamp);

            -- Implicit-feedback log for the learned ranker (Cycle 2b).
            -- One row per candidate SHOWN for a recall; accepted=1 when the
            -- user later acts on it. Training reads (features -> accepted).
            CREATE TABLE IF NOT EXISTS recall_events (
                id          TEXT PRIMARY KEY,
                recall_id   TEXT NOT NULL,   -- groups the candidates of one query
                ts          TEXT NOT NULL,
                query       TEXT,
                memory_id   TEXT,
                rank        INTEGER,
                features    TEXT,            -- json: similarity/recency/source/tag
                accepted    INTEGER DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_re_recall ON recall_events(recall_id);
            CREATE INDEX IF NOT EXISTS idx_re_mem    ON recall_events(memory_id);
            """
        )
        self._migrate_columns()
        # NULL external_ids are treated as distinct by SQLite, so legacy rows
        # (pre-connector) never collide on this unique index.
        self._conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_source_extid "
            "ON memories(source_app, external_id)"
        )
        self._conn.commit()

    def _migrate_columns(self) -> None:
        """Add columns introduced after a DB was first created (idempotent)."""
        existing = {r["name"] for r in self._conn.execute("PRAGMA table_info(memories)")}
        for col in ("external_id", "author"):
            if col not in existing:
                self._conn.execute(f"ALTER TABLE memories ADD COLUMN {col} TEXT")
        self._conn.commit()

    # ------------------------------------------------------------------ #
    def add_memory(
        self,
        text: str,
        embedding: List[float],
        source_app: str,
        tags: Optional[List[str]] = None,
        url: Optional[str] = None,
        conversation_id: Optional[str] = None,
        message_type: Optional[str] = None,
        embed_model: str = "unknown",
        external_id: Optional[str] = None,
        author: Optional[str] = None,
        timestamp: Optional[str] = None,
    ) -> str:
        memory_id = str(uuid.uuid4())
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        vec = np.asarray(embedding, dtype=np.float32)

        self._conn.execute(
            """INSERT INTO memories
               (id, text, source_app, external_id, author, url, conversation_id,
                message_type, tags, timestamp, embed_model, embed_dim, vector)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                memory_id,
                text,
                source_app,
                external_id,
                author,
                url,
                conversation_id,
                message_type,
                ",".join(tags) if tags else "",
                ts,
                embed_model,
                int(vec.shape[0]),
                vec.tobytes(),
            ),
        )
        self._conn.commit()
        return memory_id

    def exists(self, source_app: str, external_id: Optional[str]) -> bool:
        """Idempotency check for connector ingest."""
        if not external_id:
            return False
        row = self._conn.execute(
            "SELECT 1 FROM memories WHERE source_app = ? AND external_id = ? LIMIT 1",
            (source_app, external_id),
        ).fetchone()
        return row is not None

    def add_event(self, event, emb) -> str:
        """
        Store a normalized MemoryEvent + its EmbeddingResult. Duck-typed: this
        method does not import core.schema, so the store stays decoupled from it.
        """
        return self.add_memory(
            text=event.text,
            embedding=emb.vector,
            source_app=event.source_app,
            tags=list(event.tags or []),
            url=event.url,
            conversation_id=event.conversation_id,
            message_type=event.message_type,
            embed_model=emb.model_id,
            external_id=event.external_id,
            author=event.author,
            timestamp=event.timestamp,
        )

    # ------------------------------------------------------------------ #
    def recall(
        self,
        query_embedding: List[float],
        n_results: int = 10,
        source_app: Optional[str] = None,
        tags: Optional[List[str]] = None,
        query_model: Optional[str] = None,
    ) -> List[Dict]:
        """
        Cosine search. If query_model is given, only rows embedded by the SAME
        model are searched — comparing across embedding spaces is meaningless.
        """
        q = np.asarray(query_embedding, dtype=np.float32)
        qn = np.linalg.norm(q)
        if qn == 0:
            return []
        q = q / qn

        sql = "SELECT * FROM memories"
        clauses, params = [], []
        if source_app:
            clauses.append("source_app = ?")
            params.append(source_app)
        if query_model:
            clauses.append("embed_model = ?")
            params.append(query_model)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)

        rows = self._conn.execute(sql, params).fetchall()

        scored = []
        want_tags = set(tags) if tags else None
        for row in rows:
            if want_tags:
                row_tags = set((row["tags"] or "").split(",")) - {""}
                if not (want_tags & row_tags):
                    continue
            v = np.frombuffer(row["vector"], dtype=np.float32)
            if v.shape[0] != q.shape[0]:
                continue  # different dim => different space, skip
            vn = np.linalg.norm(v)
            if vn == 0:
                continue
            sim = float(np.dot(q, v / vn))  # cosine in [-1, 1]
            scored.append((sim, row))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            {
                "id": row["id"],
                "text": row["text"],
                "metadata": self._metadata(row),
                "distance": 1.0 - sim,  # keep old contract (smaller = closer)
                "score": sim,
            }
            for sim, row in scored[:n_results]
        ]

    # ------------------------------------------------------------------ #
    def delete_memory(self, memory_id: str) -> bool:
        cur = self._conn.execute("DELETE FROM memories WHERE id = ?", (memory_id,))
        self._conn.commit()
        return cur.rowcount > 0

    def get_all_memories(self, limit: int = 100) -> List[Dict]:
        rows = self._conn.execute(
            "SELECT * FROM memories ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
        return [
            {"id": r["id"], "text": r["text"], "metadata": self._metadata(r)}
            for r in rows
        ]

    def count(self) -> int:
        return int(self._conn.execute("SELECT COUNT(*) AS c FROM memories").fetchone()["c"])

    def stats(self) -> Dict:
        """Lightweight observability: totals broken down by source and model."""
        by_source = {
            r["source_app"] or "unknown": r["c"]
            for r in self._conn.execute(
                "SELECT source_app, COUNT(*) AS c FROM memories GROUP BY source_app"
            ).fetchall()
        }
        by_model = {
            r["embed_model"]: r["c"]
            for r in self._conn.execute(
                "SELECT embed_model, COUNT(*) AS c FROM memories GROUP BY embed_model"
            ).fetchall()
        }
        return {
            "total_memories": self.count(),
            "by_source_app": by_source,
            "by_embed_model": by_model,
            "db_path": self.db_path,
        }

    # ------------------------------------------------------------------ #
    # Re-embedding / migration support
    # ------------------------------------------------------------------ #
    def model_breakdown(self) -> Dict[str, int]:
        return {
            r["embed_model"]: r["c"]
            for r in self._conn.execute(
                "SELECT embed_model, COUNT(*) AS c FROM memories GROUP BY embed_model"
            ).fetchall()
        }

    def reembed_all(self, provider, target_model_id: str, only_mismatched: bool = True) -> Dict:
        """
        Re-encode stored text under `provider` so old vectors (e.g. hash-era)
        move into the current embedding space. `provider` must expose
        .embed(text) -> object with .vector / .model_id / .dim (see embeddings.py).

        only_mismatched=True skips rows already at target_model_id (idempotent,
        resumable). Returns counts. Run with the daemon stopped to avoid two
        writers on the SQLite file.
        """
        if only_mismatched:
            rows = self._conn.execute(
                "SELECT id, text FROM memories WHERE embed_model != ?", (target_model_id,)
            ).fetchall()
        else:
            rows = self._conn.execute("SELECT id, text FROM memories").fetchall()

        migrated = 0
        for r in rows:
            emb = provider.embed(r["text"])
            vec = np.asarray(emb.vector, dtype=np.float32)
            self._conn.execute(
                "UPDATE memories SET vector=?, embed_model=?, embed_dim=? WHERE id=?",
                (vec.tobytes(), emb.model_id, int(vec.shape[0]), r["id"]),
            )
            migrated += 1
        self._conn.commit()
        return {"migrated": migrated, "skipped": self.count() - migrated, "target_model": target_model_id}

    # ------------------------------------------------------------------ #
    # Implicit-feedback logging for the learned ranker (Cycle 2b)
    # ------------------------------------------------------------------ #
    def log_recall(self, recall_id: str, query: str, shown: List[Dict]) -> None:
        """Log every candidate shown for a recall, with its ranker features."""
        import json as _json
        ts = datetime.now(timezone.utc).isoformat()
        rows = []
        for rank, c in enumerate(shown, start=1):
            rows.append((
                str(uuid.uuid4()), recall_id, ts, query, c.get("id"), rank,
                _json.dumps(c.get("rank_components") or {}), 0,
            ))
        self._conn.executemany(
            """INSERT INTO recall_events
               (id, recall_id, ts, query, memory_id, rank, features, accepted)
               VALUES (?,?,?,?,?,?,?,?)""",
            rows,
        )
        self._conn.commit()

    def mark_accepted(self, memory_id: str, recall_id: Optional[str] = None) -> int:
        """Mark a shown candidate as accepted (the positive training signal)."""
        if recall_id:
            cur = self._conn.execute(
                "UPDATE recall_events SET accepted=1 WHERE memory_id=? AND recall_id=?",
                (memory_id, recall_id),
            )
        else:
            # most recent event for this memory_id
            cur = self._conn.execute(
                "UPDATE recall_events SET accepted=1 WHERE id = ("
                "  SELECT id FROM recall_events WHERE memory_id=? ORDER BY ts DESC LIMIT 1)",
                (memory_id,),
            )
        self._conn.commit()
        return cur.rowcount

    def training_rows(self) -> List[Dict]:
        """Return logged events with parsed features for offline training."""
        import json as _json
        out = []
        for r in self._conn.execute(
            "SELECT features, accepted FROM recall_events WHERE features != '{}'"
        ).fetchall():
            try:
                feats = _json.loads(r["features"])
            except Exception:
                continue
            if feats:
                out.append({"features": feats, "accepted": int(r["accepted"])})
        return out

    def recall_event_stats(self) -> Dict:
        total = self._conn.execute("SELECT COUNT(*) c FROM recall_events").fetchone()["c"]
        pos = self._conn.execute("SELECT COUNT(*) c FROM recall_events WHERE accepted=1").fetchone()["c"]
        return {"events": total, "accepted": pos}

    # ------------------------------------------------------------------ #
    @staticmethod
    def _metadata(row: sqlite3.Row) -> Dict:
        md = {
            "source_app": row["source_app"],
            "timestamp": row["timestamp"],
            "tags": row["tags"] or "",
            "embed_model": row["embed_model"],
        }
        if row["url"]:
            md["url"] = row["url"]
        if row["conversation_id"]:
            md["conversation_id"] = row["conversation_id"]
        if row["message_type"]:
            md["message_type"] = row["message_type"]
        return md
