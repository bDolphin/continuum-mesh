# Continuum — MCP Server (Cycle 5)

Exposes Continuum's memory as Model Context Protocol tools so any MCP client —
Claude Desktop, Cursor, or your own agents — can recall and store memories.
This is the step that turns Continuum from an app into **shared agent
infrastructure**: the same cross-tool memory, now callable by the models
themselves.

## Tools exposed

| Tool | What it does |
|------|--------------|
| `recall(query, k=5, source_app=None)` | semantic search over the user's memory (goes through the ranker) |
| `store(text, source_app="mcp", tags=[])` | save a new memory |
| `stats()` | counts by source app + embedding model |

The server is a thin MCP front-end over the daemon's HTTP API — it never touches
the store or embeddings directly, so the ranker, dedupe, and provenance stay in
one place and the MCP view can't drift from the dashboard/extension.

## Run it

```bash
cd daemon
pip install -r requirements-mcp.txt
# daemon must be running on :2789 in another terminal
python mcp_server.py        # stdio transport
```

## Register with a client

**Claude Desktop** — add to `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "continuum": {
      "command": "python",
      "args": ["/absolute/path/to/continuum-mesh/daemon/mcp_server.py"],
      "env": { "DAEMON_URL": "http://127.0.0.1:2789" }
    }
  }
}
```

**Cursor** — add the same block under `mcpServers` in your Cursor MCP settings.

After registering, the model can call e.g. `recall("AWS NLB research")` and get
your prior cross-tool context injected automatically — the "Memory OS" thesis,
made usable by agents.

## Notes

- The daemon must be running; the MCP server proxies to it.
- `recall` returns results already ranked by whatever `RANKER` mode the daemon
  is in (cosine / heuristic / learned).
- Keep the file named `mcp_server.py` (not a `mcp/` package) so it doesn't shadow
  the installed `mcp` library.
- Next step (Cycle 5+): add a `remember_this_conversation` style tool and wire
  `store` to auto-tag, so agents can persist their own useful outputs.
