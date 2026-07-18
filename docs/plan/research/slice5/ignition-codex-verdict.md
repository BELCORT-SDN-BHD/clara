## Verdict: amend

Keep the core of your position: Slice 5 should ignite deterministic processing, not an autonomous LLM run.

But narrow what may become a `rule` resolution:

- Unique, exact, document-role-aware hard identifiers—TIN/SSM or a bank-statement account number—may create a server-verified `rule` resolution.
- An exact registered name or alias match should normally be a non-authorizing suggestion. Names can appear as issuer, recipient, counterparty, or in intercompany documents; arbitrary exact text occurrence is not proof of ownership.
- Any conflicting identifiers, multiple Clara clients named in one document, ambiguous document roles, or non-unique aliases must cause abstention.

That amendment preserves your safety position while giving the ruled grouping UX useful input.

## The four alternatives, steelmanned

| Alternative | Strongest case | Decisive weakness |
|---|---|---|
| Fully inert | Zero suggestion-induced trust damage; every assignment becomes clean ground truth for the future eval corpus. | Makes an 80-document month-end batch unnecessarily manual and leaves the already-ruled grouping UI empty. It also fails to exploit identifiers that are logically verifiable without AI. |
| Deterministic-only | Explainable, reproducible, cheap, tenant-safe, and compatible with the legal `rule` method. Every match can point to an actual OCR region. | Coverage may be poor. More importantly, “exact string” is not automatically “correct attribution”; careless name/alias rules can be confidently wrong. |
| LLM suggestion + human confirm | The strongest counterargument. A proposal clearly labelled as unverified, stored outside resolutions, with human confirmation as the only authorizing act is not E‑9. It could cover the long tail and generate correction labels. | Group placement itself communicates authority. Without measurement, Clara cannot know whether it saves review time or creates batch rubber-stamping and trust erosion. |
| Full agentic ignition | Attribution and coding could be prepared before the accountant opens the queue; the durable held-task machinery limits direct accounting risk. | Attribution is unresolved, so there is no safe client context pack for coding. It also requires a new background wake lane and jumps into work assigned to Slice 6, which explicitly introduces the first coding workflow ([REBUILD-PLAN.md](</C:/Users/zhant/Desktop/clara-rebuild/docs/plan/REBUILD-PLAN.md:21>)). |

## Strongest counterargument to your position

Option 3 is materially stronger than your provisional position gives it credit for.

Current products do not choose simply between “manual” and “autonomous.” They expose a ladder:

- QuickBooks places extracted receipts and suggested matches in a review queue; they affect the books only after review or confirmation. [QuickBooks receipt workflow](https://quickbooks.intuit.com/learn-support/en-uk/help-article/import-transactions/upload-receipts-bills-quickbooks-online/L862MmZHn_GB_en_GB)
- Dext lets firms choose manual review or auto-apply per AI guidance, shows explanations, and supports accept/dismiss feedback. [Dext AI Assist](https://help.dext.com/en/articles/500051-what-is-dext-ai-assist)
- Brex separates AI suggestions from accepted mappings and lets users accept, reject, or revise proposed rules. [Brex accounting automation](https://www.brex.com/support/accounting-automation)
- Ramp combines AI coding, confidence-shaped presentation, review groups, and a recommended rollout from deterministic low-risk rules toward AI auto-marking. [Ramp Accounting Agent](https://support.ramp.com/ramp-accounting-agent-enablement-daily-use-admin-guide/)

So human confirmation really does change the epistemics: an explicitly unverified proposal is not a fabricated resolution.

Why I nevertheless reject it for Slice 5: those products have established feedback histories and usually receive documents or transactions inside an already selected company/account. Dext, for example, gives each client a dedicated account and document space. [Dext client accounts](https://help.dext.com/en/articles/339555-how-to-add-a-client-account-in-dext) Clara is attempting the harder firm-wide, unknown-client classification problem. Until measured, a suggested-client group risks becoming E‑9’s successor—not because it can post, but because the queue structure itself says “Clara thinks these belong together.”

## Recommended Slice 5 ignition

After durable OCR completion:

1. **Persist facts first**

   Store the verified document hash, original bytes, OCR text, structured fields, and per-field bounding regions. Evidence-region capture is already an architectural ingestion requirement ([ARCHITECTURE.md](</C:/Users/zhant/Desktop/clara-rebuild/docs/architecture/ARCHITECTURE.md:148>)).

2. **Emit a domain event, but no agent wake**

   A normal idempotent pipeline consumer runs deterministic attribution. It is not an LLM workflow and receives no wake credential.

   The existing taxonomy currently routes `document.ingested` to `background_review` ([0005_event_spine.sql](</C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0005_event_spine.sql:439>)), while Slice 4 turns wake tasks into held rows rather than compute ([0006_runtime_core.sql](</C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0006_runtime_core.sql:214>)). Slice 5 should activate a new taxonomy version that treats OCR completion as a context/projection update, with the deterministic matcher as a dedicated consumer—not one held “agent task” per document.

3. **Run two deterministic lanes**

   - **Authorizing rule:** unique hard identifier, correct document/party role, exact source-region citation, no conflicting client identifier. The DB itself verifies the predicate and stamps `method='rule'` and the gate value.
   - **Advisory deterministic candidate:** unique exact registered name or human-curated alias, but insufficient for rule authorization. It can feed grouping, but human confirmation must create a `human` resolution.
   - Otherwise: abstain.

   A substring occurrence anywhere in OCR text is insufficient. Two Clara clients appearing in the same invoice must always abstain.

4. **Write distinct objects**

   Do not use `client_resolutions` as the generic suggestion store. The current table already allows `agent`, but calls the row a resolution and emits `client.resolved`; that is exactly the semantic blur E‑9 warns against. The gate correctly accepts only `human` and `rule` ([0004_governed_fns.sql](</C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0004_governed_fns.sql:88>)).

   Add versionable proposal infrastructure now:

   - `attribution_attempts`: document, source kind, matcher/model version, input fingerprint, status and abstention reason.
   - `attribution_candidates`: candidate client, rank, rule identifier, matched OCR regions, internal score semantics, disposition and human feedback.
   - Keep `client_resolutions` exclusively for gate-authorizing outcomes.

   One current gap must be fixed: the human writer always stamps `human`, while the wake writer always stamps `agent`; there is no governed `rule` writer today ([0004_governed_fns.sql](</C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations/0004_governed_fns.sql:489>)). Add a dedicated pipeline-only function that takes a document—not caller-supplied client/confidence—and recomputes the qualifying rule server-side.

5. **Show the accountant**

   - Groups such as “Suggested: ABC Sdn Bhd.”
   - Shaped bands: “Verified identifier” or “Name match—review,” never percentages.
   - Evidence chips like “TIN exact” or “statement account exact,” clickable to the OCR region.
   - Conflicts and unmatched documents in “Needs assignment,” excluded from suggested groups by default but always reachable.
   - Bulk assignment only for an explicitly selected group.

   Confirming an advisory candidate creates a `human` resolution. Confirming an authorizing rule assigns the document using its existing `rule` resolution. Reassignment supersedes the old resolution and candidate and records the storage move through the audited lifecycle.

## Cross-client and tenant boundary

The matcher must derive `firm_id` from the persisted document and query only a minimal firm-scoped attribution index. Candidate client identity must be constrained to the same firm in the DB.

Before assignment:

- No client wiki or books context pack is loaded.
- The document is not indexed into any client’s knowledge layer.
- No coding proposal is attempted.

Later model attribution should receive only the minimal firm-level identity index needed to rank opaque candidate IDs—not multiple clients’ ledgers, wiki pages, or accounting histories. Client-scoped context begins only after resolution and assignment.

## Explicitly deferred behind the eval gate

Defer all of the following:

- User-visible model-generated client groups.
- Any model-derived confidence band or probability.
- Model-created `client_resolutions`; later model proposals remain proposals, and confirmation produces `method='human'`.
- Model-based automatic assignment.
- An autonomous background wake lane.
- Attribution-plus-coding in one pre-confirmation run.
- Any widening from proposal → auto-apply based on model confidence.

The eval should measure top-1/top-k attribution precision, coverage and abstention by document class/language/scan quality, collision cases, calibration of UI bands, human override rate, and review-time impact. This directly answers GAP3‑6’s criticism that the old threshold was unmeasurable ([01-findings-report.md](</C:/Users/zhant/Desktop/clara-rebuild/docs/audit/01-findings-report.md:3250>)).

Once that gate passes, unlock model proposals behind human confirmation first. Agentic held coding should be a later, separate step triggered only after confirmed client assignment. The model must never graduate itself from `agent` to `rule`.