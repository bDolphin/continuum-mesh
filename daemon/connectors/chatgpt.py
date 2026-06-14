"""ChatGPT connector (browser-sourced)."""
from core.registry import register
from ._browser import BrowserConnector


@register
class ChatGPTConnector(BrowserConnector):
    name = "chatgpt"
    default_message_type = "response"
