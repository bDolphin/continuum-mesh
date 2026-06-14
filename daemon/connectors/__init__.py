"""
Importing this package registers all connectors (side effect of @register).
Add a new platform by creating a module here and importing it below.
"""
from . import chatgpt      # noqa: F401
from . import perplexity   # noqa: F401
from . import slack        # noqa: F401  (registered but disabled by default in config.json)
