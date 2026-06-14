# Continuum — Context-Mesh BMAD Plan (MLOps / Forward-Deployed-Engineer track)

_Each cycle ships one usable capability, validates one insight, and deepens one
architectural primitive. Every feature is also tagged with the **career skill** it
builds, so the product doubles as a deliberate FDE/MLOps training program._

BMAD here = **B**usiness hypothesis → **M**agic moment → **A**rchitecture → **D**elivery.
Don't skip B and M. The biggest risk isn't a failed build, it's building the right
infrastructure for a value you never confirmed anyone wants.

---

## Where you are now (post-fix baseline)

You finally have a real spine: persistent store + real local embeddings + a versioned
embedding artifact + an eval endpoint + a stats endpoint. That means for the first time
the question *"did this retrieval change help?"* is answerable with a number. **Build
nothing else until you've seen `/evaluate` return a non-trivial precision@k on your own
data.** That single measurement is the gate.

---

## Cycle 1 — Prove cross-tool continuity (the only thing that matters first)

**B (hypothesis):** A developer who researches something in Perplexity wastes time
re-explaining it to Cursor/ChatGPT the next day.

**M (magic moment):** Research an NLB pattern in Perplexity. Tomorrow, ask Cursor to
implement it. The relevant note surfaces with no keyword overlap.

**A (architecture):** _already built._ Extension capture → `/store` (real embedding +
provenance) → SQLite → `/recall`.

**D (delivery, this week):**
1. Run daemon in `local` mode, seed 20–30 real research snippets from your own browsing.
2. Hand-label 10 probes (query → which memory ids should surface). Save as `eval/probes.json`.
3. Call `/evaluate`. Record `precision@5` and `MRR`. **This is your baseline number.**
4. Ship a `@recall` slash-command in the Cursor/extension UI that hits `/recall`.

**Skill built:** _AI engineering fundamentals_ — embeddings, semantic search, and the
discipline of measuring retrieval instead of eyeballing it. The labeled-probe set is the
single most valuable artifact you'll create this quarter.

---

## Cycle 2 — Make retrieval *good*, not just present (where the moat actually lives)

**B:** Raw top-k cosine surfaces stale or off-task memories; users ignore bad recalls and
churn. Storing memory is easy; retrieving the *right* memory at the *right* moment is the hard,
defensible problem.

**M:** Recall feels uncannily on-point — recent, on-task notes beat older tangential ones.

**A (the context-ranking model — your first real ML):** Move from pure similarity to a
composite score, computed in the store at query time:

```
score = w1*cosine + w2*recency + w3*source_priority + w4*tag/task_match
```

Start with hand-set weights (this is a heuristic ranker, ship it in a day). Then make it
*learned*: log every recall + whether the user accepted it (implicit feedback), and fit a
small logistic-regression / gradient-boosted ranker on those features offline. The
heuristic is your v1; the learned model is v2 you A/B against it.

**D:**
1. Add `recency` (exponential decay on timestamp) and `source_priority` to `recall()`.
2. Log `(query, returned_id, features, accepted?)` to a `recall_events` table.
3. Extend `/evaluate` to compare weight configs side by side.
4. Once you have ~500 logged events, train an offline ranker; expose it behind
   `RANKER=heuristic|learned` and compare on the SAME probe set.

**Skill built:** _Recommendation/ranking systems + feature engineering + offline eval._
This is the most transferable skill on the list — it's literally what Scale/Palantir FDEs and
search/ranking teams do all day.

---

## Cycle 3 — Embedding lifecycle & migrations (real MLOps muscle)

**B:** You'll want to upgrade embedding models (MiniLM → a better one). Today, mixing models
silently corrupts recall (already guarded against — the store refuses cross-model compares).
You need a *safe migration path*, not a guess.

**M:** Swap the embedding model and recall quality goes **up**, with a number proving it and
zero downtime.

**A:** You already version every vector with `embed_model`. Add:
- a `reembed` job that re-encodes all memories under a new `model_id` into new rows,
- a shadow-eval: run `/evaluate` against the new model's rows *before* cutting over,
- a `EMBEDDING_MODEL_ACTIVE` pointer so cutover is one flag flip + rollback is trivial.

**D:**
1. `scripts/reembed.py --to <model>` (idempotent, resumable).
2. Shadow-eval report: precision@k old vs new on the probe set.
3. Cutover flag + documented rollback.

**Skill built:** _Model versioning, migrations, shadow deployments, rollback._ This is the
exact vocabulary that separates "I trained a model" from "I operate models in production."

---

## Cycle 4 — Observability (play to your AWS/DevOps strength)

**B:** You can't operate what you can't see — ingestion spikes, recall latency, model drift.

**M:** A dashboard that shows, live: memories/min by source, p50/p95 recall latency, recall
acceptance rate, vector count, embedding-cost (if OpenAI mode).

**A:** Instrument the daemon with OpenTelemetry → Prometheus; Grafana panels. `/stats` is the
seed; promote those counters to real metrics. This is where your Terraform/Grafana background
compounds — you'll stand the whole stack up faster than any pure-ML person.

**D:**
1. Add `prometheus-fastapi-instrumentator` (or manual OTel counters/histograms).
2. `docker-compose.yml` for Prometheus + Grafana.
3. Terraform module that provisions the same stack (so it's reproducible — your wheelhouse).
4. One Grafana dashboard JSON checked into the repo.

**Skill built:** _AI platform observability_ — the rare AWS + Platform + AI intersection that's
your differentiator. Most ML hobbyists never build this; FDEs are expected to.

---

## Cycle 5 — Context orchestration (memory tool → infrastructure)

**B:** Retrieval ≠ orchestration. The value isn't "here are 10 memories," it's "here is the
*right amount* of the *right* context injected into the *right* tool at the *right* moment."

**M:** ChatGPT/Cursor silently receive a tight, relevant context block — no manual `@recall`.

**A:** A Context Agent (MCP server) that decides *whether* to inject, *what* to summarize, and
*how much* to fit a token budget. This is where MCP earns its place: expose Continuum as an MCP
tool any agent can call. Add summarization/compression so you inject signal, not raw dumps.

**D:**
1. Wrap `/recall` as an MCP tool (`continuum.recall`, `continuum.store`).
2. Budgeted context assembler: rank → dedupe → summarize-to-fit.
3. Auto-inject trigger in the extension with a confidence threshold.

**Skill built:** _Agent orchestration, MCP, context-window engineering, multi-agent design._
Directly the skill set Anthropic/OpenAI/Palantir hire FDEs for.

---

## Cycle 6 — Productize like a platform (the engineer→FDE gap)

**B:** Enterprises need tenancy, access control, audit, and cost accounting before they touch it.

**M:** A second user/workspace can use Continuum without ever seeing the first's memory, and an
admin can audit who recalled what.

**A:** Workspace scoping on every row + table; RBAC (admin/user/viewer); audit log of
store/recall; per-workspace cost tracking (embedding + token + storage).

**D:**
1. `workspace_id` column + filter on every query.
2. API-key auth + role middleware.
3. `audit_log` table + `/audit` endpoint.
4. `/stats` extended with cost columns.

**Skill built:** _Multi-tenancy, RBAC, audit, cost governance._ The "boring" enterprise
concerns that, ironically, are what make you deployable into a real customer environment — the
literal job of a forward-deployed engineer.

---

## The MLOps second track (runs in parallel, same BMAD shape)

Every retrieval/model change goes through this micro-cycle so you build the *habit*:

| Step | What you do | Artifact |
|------|-------------|----------|
| **B** Model hypothesis | "Recency weighting will raise MRR" | one sentence in a PR |
| **M** Metric | precision@k, MRR, recall-acceptance, latency | numbers from `/evaluate` |
| **A** ML architecture | implement behind a flag (`RANKER=`, `EMBEDDING_MODEL=`) | flagged code path |
| **D** Deploy experiment | run A vs B on the SAME probe set, keep the winner | committed eval report |

The discipline — *never ship a retrieval change without a before/after number on a fixed probe
set* — is the single habit that most marks a forward-deployed/MLOps engineer.

---

## 90-day cadence

| Weeks | Cycle | The number you're chasing |
|-------|-------|---------------------------|
| 1–2 | Cycle 1: continuity + baseline eval | first `precision@5` on your own data |
| 3–4 | Cycle 2a: heuristic ranker | precision@5 ↑ vs baseline |
| 5–6 | Cycle 2b: logged feedback + learned ranker | MRR ↑ vs heuristic |
| 7 | Cycle 3: embedding migration + shadow eval | new model ≥ old on probes |
| 8–9 | Cycle 4: observability stack | latency p95 visible + alerting |
| 10–11 | Cycle 5: MCP context orchestration | auto-inject acceptance rate |
| 12 | Cycle 6 (start): workspace scoping + audit | 2 isolated workspaces demoed |

---

## The principle to keep taped to your monitor

> Don't architect for the final "Memory OS" vision.
> Architect for the **next validated capability** — and make each one teach you a
> platform/MLOps skill you can carry into any AI company.

You now have the spine (persistent + semantic + versioned + measurable). Everything above
hangs off it. Start Cycle 1, get your baseline number, and let the data pick what's next.
