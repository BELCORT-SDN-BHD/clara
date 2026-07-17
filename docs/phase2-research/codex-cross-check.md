## Q1 — CONCUR, conditionally

I concur with AI SDK 7 + Workflow DevKit as the preferred candidate, subject to the production spike, and concur with excluding both incumbent SDKs as complete runtime replacements.

The single strongest argument against the recommendation is that WDK step memoization is being treated too much like an exactly-once guarantee. It is not. A `SECURITY DEFINER` posting function can commit successfully, after which the worker can die before WDK records the step as completed. Replay may then invoke that step again. “Completed steps never re-run” applies only after completion is durably acknowledged.

I concede this argument. WDK reduces the re-execution surface substantially, but it does not eliminate Clara’s permanent need for database idempotency. The recommendation still stands because Postgres already owns that guarantee: every mutation must accept a stable operation key, enforce uniqueness, and return the original canonical receipt on duplicate execution. Add one mandatory spike test: kill the worker immediately after the financial transaction commits but before the step completion is recorded, then prove replay produces one posting and the same receipt.

The code-evolution test is also correctly a hard gate. Vercel’s managed World explicitly documents deployment pinning for in-flight runs, while the self-hosted [Postgres World](https://workflow-sdk.dev/worlds/postgres) documents durable restart recovery but does not state the same deployment-pinning guarantee that the [Vercel World](https://workflow-sdk.dev/worlds/vercel) provides. Clara should therefore assume explicit workflow-name versioning and retention of old workflow code for the maximum parked-run lifetime unless the spike proves something stronger.

Neither incumbent fulfills the whole requirement set instead:

- OpenAI Agents SDK still lacks a durable TypeScript step engine. Putting another durable orchestrator around it could work, but then that orchestrator—not OpenAI Agents SDK—is fulfilling the decisive requirements.
- Claude Agent SDK’s native defer and OTel are genuinely valuable, but they do not supply replay-safe steps. The silent non-park behavior on parallel tool-call turns is structurally mismatched with Clara’s loop, and the mirroring, resource and contractual issues remain. Even if model-agnosticism is relaxed, Claude still loses on durability and operational fit.

The 12/12 should therefore mean “best requirements coverage and admitted to the spike,” not “production-proven.” If the spike fails, LangGraph is a rational fallback, with the understanding that its broader re-execution behavior makes database idempotency even more important.

Model-agnosticism is over-weighted as a hard veto for a small SaaS. Clara needs a clean provider seam, portable model/tool contracts, and a tested exit plan—not an assertion that models are behaviorally interchangeable. Every provider change will require accounting-specific evaluation anyway, and treating portability as absolute can force lowest-common-denominator design and exclude useful native capabilities.

Keep AI SDK’s provider abstraction—it is comparatively cheap and useful—but remove R7 as a decisive disqualifier. The [AI SDK provider interface](https://ai-sdk.dev/docs/foundations/providers-and-models) gives technical substitutability, not behavioral equivalence. Importantly, relaxing R7 does not change today’s winner: Claude still loses for independent R4, defer-batching, persistence and operational reasons.

## Q2 — Vendor tracing

### (a) What the vendor adds

A trace vendor adds an LLM-operations workbench, not durability or accounting assurance:

- Navigable model/tool/workflow trace trees.
- Search and failure clustering across runs, releases and models.
- Token, cost and latency analysis.
- Prompt/model comparisons, annotations, evaluations and regression datasets.
- Shared dashboards, alerts and incident-review workflows.

An OTel collector is primarily transport. Clara’s Postgres run history is authoritative for resumability, approvals, attribution and posted receipts, but it is not naturally optimized for high-cardinality trace analysis.

The vendor adds no financial correctness, idempotency or evidentiary authority. It must remain an asynchronous diagnostic copy linked to Clara’s authoritative record by an opaque `trace_id`.

Full-content export also creates a second searchable repository containing invoices, ledger narratives, names, bank details and commercial information. Langfuse states that it stores submitted content as-is, and event retention is indefinite by default unless explicitly configured. Its DPA and security controls mitigate that exposure; they do not make it disappear. [Langfuse DPA](https://langfuse.com/security/dpa), [Langfuse retention](https://langfuse.com/docs/administration/data-retention).

### (b) What a prudent CTO should do

Default to a self-hosted OTel collector feeding a Clara-controlled trace backend at launch, and add the cloud vendor later. I would reverse the “blanket full-content vendor export by default” ruling.

Before enabling production export, require an executed DPA, subprocessor and security review, documented cross-border-transfer basis and records, client-facing authorization and notices, short explicit retention, tested deletion, SSO/MFA, least-privilege access and field-level minimization. A DPA regulates Clara’s relationship with the processor; it does not itself confer the client authority contemplated by MIA confidentiality rules.

MIA’s current rules prohibit disclosure outside the firm without proper and specific authority unless a legal or professional right or duty applies. Malaysian cross-border guidance also expects processor contracts, security obligations and transfer records. [MIA By-Laws, confidentiality](https://mia.org.my/storage/2024/04/MIA-By-Laws-2024-UPDATED.pdf), [Malaysia cross-border guidance](https://www.pdp.gov.my/ppdpv1/wp-content/uploads/2025/08/GP_CBPDT_EN-1.pdf).

When the vendor is eventually enabled, begin with short-retention, minimized or redacted telemetry. Keep blanket full-content capture inside Clara-controlled infrastructure; permit targeted content export only through an approved diagnostic process.

### (c) Export before a DPA

No production trace containing client books, personal data or confidential information should be exported before the DPA is legally in force. Debugging convenience is not a defensible exception.

Synthetic traffic containing no client or confidential information is acceptable, but that is not meaningfully “client trace export.” Likewise, nominally metadata-only traces require classification because tenant IDs, URLs and error payloads often reveal protected information.

Concrete recommendation: launch `Clara → self-hosted OTel collector → Clara-controlled trace storage`, with the cloud exporter disabled. Enable a minimized vendor feed only after the contractual, cross-border, client-authority, retention, deletion and access-control gates have passed. Do not enable blanket full-content cloud tracing by default.