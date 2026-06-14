"""Perplexity connector (browser-sourced)."""
from core.registry import register
from ._browser import BrowserConnector


@register
class PerplexityConnector(BrowserConnector):
    name = "perplexity"
    default_message_type = "research"
