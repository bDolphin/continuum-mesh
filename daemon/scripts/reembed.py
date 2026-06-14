"""
Continuum — re-embed stored memories under the active model
Location: daemon/scripts/reembed.py

Old memories may have been stored under the non-semantic 'hash' model. Recall
refuses to compare across embedding spaces, so those rows are invisible to a
'local' query. This migrates them into the current space in place.

Run with the daemon STOPPED (avoids two writers on the SQLite file):
    EMBEDDING_MODE=local python scripts/reembed.py            # migrate mismatched rows
    EMBEDDING_MODE=local python scripts/reembed.py --all      # re-embed everything
    python scripts/reembed.py --dry-run                       # just show the breakdown
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DAEMON_DIR = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, DAEMON_DIR)

from memory_store import MemoryStore          # noqa: E402
from embeddings import build_provider          # noqa: E402


def main():
    dry_run = "--dry-run" in sys.argv
    do_all = "--all" in sys.argv
    mode = os.getenv("EMBEDDING_MODE", "local")

    store = MemoryStore(persist_directory=os.path.join(DAEMON_DIR, "chroma_db"))
    print("Current breakdown by embed_model:")
    for model, n in store.model_breakdown().items():
        print(f"   {model:<32} {n}")

    if dry_run:
        print("\n(dry run — nothing changed)")
        return

    provider = build_provider(mode, os.getenv("OPENAI_API_KEY", ""))
    target = provider.model_id
    print(f"\nRe-embedding under: {target}  (mode={mode})")

    result = store.reembed_all(provider, target_model_id=target, only_mismatched=not do_all)
    print(f"✅ migrated={result['migrated']}  now-at-target={target}")
    print("\nNew breakdown:")
    for model, n in store.model_breakdown().items():
        print(f"   {model:<32} {n}")


if __name__ == "__main__":
    main()
