# The codebase-memory graph — user manual

**Query it, don't grep.** For "where is X defined," "what calls Y," "how does Z fit into the
architecture" — the graph answers in one query at roughly 100× less cost than reading files one
by one. Use Grep/Read to drill into the specific file the graph points you at; don't use them to
rediscover structure the graph already indexed.

## What it is

A stdio MCP server, project-scoped in this repo's `.mcp.json`:

```json
"codebase-memory-mcp": {
  "type": "stdio",
  "command": "C:/Users/zhant/AppData/Local/Programs/codebase-memory-mcp/codebase-memory-mcp.exe"
}
```

It maintains a persistent graph of this repo's code structure (functions, callers, routes,
modules) plus architecture-level notes, separate from and much cheaper to query than reading the
tree file-by-file. It is Claude Code's first stop for any "where / what / who-calls" question —
before Grep, before Read, before spawning an explore agent.

## The tools

All are `mcp__codebase-memory-mcp__*`, deferred (load via `ToolSearch("select:<name>")` before
first use in a session):

| Tool | Use it for |
|---|---|
| `get_architecture` | The high-level shape of the codebase — modules, layers, how they relate. Start here when you don't yet know where to look. |
| `search_graph` | Keyword/semantic search over the indexed graph — find a function, type, route, or concept by name or description. |
| `query_graph` | Structured queries against the graph (more precise than `search_graph` once you know what you're looking for — e.g. a specific relationship or filter). |
| `trace_path` | Follow a call/dependency path between two points — "how does A reach B," "what's between the route handler and the DB write." |
| `search_code` | Find code by content/pattern through the indexed graph rather than a raw filesystem grep. |
| `get_code_snippet` | Pull the actual source for a graph node once you've located it, without a separate file Read. |
| `index_repository` | (Re)build the graph index. Run after any big code change — the graph is only as good as its last index. |
| `index_status` | Check whether the index is fresh, stale, or mid-build before trusting query results. |
| `detect_changes` | See what's changed since the last index — useful to decide whether a re-index is actually needed. |
| `get_graph_schema` | Inspect the graph's own schema (node/edge types) — useful when `query_graph`'s structured filters aren't obvious. |
| `manage_adr` | Read/write ADR-level entries the graph tracks alongside code structure. |
| `ingest_traces` | Feed runtime/execution traces into the graph (where supported) to enrich it beyond static analysis. |
| `list_projects` / `delete_project` | Manage which repos/projects the server has indexed. Rarely needed day-to-day in this single-repo session. |

## The usage doctrine (from `CLAUDE.md`)

- **Graph-first.** On a new or compacted session, before answering an architecture question or
  changing code, query the graph for structure and read the relevant harness row (see
  `CLAUDE.md`'s "where the truth lives" table) — grounding comes from the graph plus the docs,
  not from re-deriving structure by reading files cold.
- **~100× cheaper than grep.** A targeted graph query answers "where/what/who-calls" in one call;
  reading files one by one to reconstruct the same structural fact is the expensive fallback, not
  the default.
- **Re-index after big changes.** `index_repository` (optionally preceded by `detect_changes` /
  `index_status` to confirm it's actually needed) whenever a substantial code change lands — a
  stale index gives confidently wrong answers, which is worse than no index.
- **Drill in with Read after, not instead.** The graph tells you *where*; use Read (or
  `get_code_snippet`) to see the actual code once the graph has pointed you at the right file and
  location. Don't stop at the graph's summary if the task needs the real source.
- **A few targeted queries usually suffice.** For most tasks, `get_architecture` plus one or two
  `search_graph`/`trace_path` calls is enough grounding. Reserve a full grounding fan-out
  (a dedicated Workflow) for genuinely large, opt-in-scale work.
