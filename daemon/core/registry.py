"""
Continuum core — connector registry.
Location: daemon/core/registry.py

Connectors self-register with @register. A config list decides which are live,
so plugging a platform in/out is editing config — never the core.
"""
from __future__ import annotations

from typing import Dict, List, Type

from .connector import Connector

_REGISTRY: Dict[str, Type[Connector]] = {}


def register(cls: Type[Connector]) -> Type[Connector]:
    if not getattr(cls, "name", None) or cls.name == "unknown":
        raise ValueError(f"{cls.__name__} must set a unique `name`")
    _REGISTRY[cls.name] = cls
    return cls


def available() -> List[str]:
    return sorted(_REGISTRY)


def build_enabled(enabled: List[str]) -> Dict[str, Connector]:
    """Instantiate the enabled connectors. Unknown names are skipped with a warning."""
    built = {}
    for name in enabled:
        cls = _REGISTRY.get(name)
        if cls is None:
            print(f"⚠️  connector '{name}' enabled in config but not registered; skipping")
            continue
        built[name] = cls()
    return built
