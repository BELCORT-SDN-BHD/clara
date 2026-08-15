# WAVE E · E-b + E-c DESIGN — **PART 2** (§6–§12): LANES ε, ζ, η

> **CONTINUATION of `wave-e-design-reporting.md` — one document in two files** (the repo's
> 500-line file discipline; the `wave-e-design-skeleton.md`/`-part2.md` split precedent). Part 1
> carries §0 (verification ledger) · §1 (scope + the two dominating laws) · §§2–5 (**lane δ** — the
> typed metric algebra, the catalog, the evaluator/freeze/cell record, the edge policies).
> **This file carries §6–§9 (lane ε — template layers, claim assessment, charts, sealed artifacts) ·
> §10 (lane ζ — the render worker + DR §10) · §11 (lane η — E-c) · §12 (E-R8's floors, the lane map,
> the decision ledger).** Section numbers are continuous across the two files; a citation like
> "reporting §7" resolves here.
>
> **THE PACKET IS SEVEN FILES.** Besides this one and `wave-e-design-reporting.md` (§0–§5):
> `wave-e-design-skeleton.md` (**§0–§2.4**) · `wave-e-design-skeleton-part2.md` (**§2.5–§2.8** — the
> closed-period wall, continuity, close receipts, reopen) · `wave-e-design-skeleton-part3.md`
> (**§2.9** E-R6 activation · **§2.10** the E-R11 keys · **§2.11–§2.12** lane γ) ·
> `wave-e-design-skeleton-part4.md` (**§3** the E-R12 trio · §4–§6) ·
> `wave-e-acceptance-matrix.md` (the falsifiable cells).
>
> All of Part 1's banners, markers and evidence discipline apply unchanged: **the contract
> (`docs/plan/active/wave-e-contract.md`) wins**; every EXISTS claim carries a file:line read taken
> 2026-08-09 in this pass; *(ruled — E-R#)* = contract law, *(builder choice)* = adjustable;
> migration numbers and CLR codes are proposals claimed at MERGE. Round-1 fixes carry the
> orchestrator ruling id they discharge *(R7..R15, R18)*.

## 6. Lane ε · THE SIX-LAYER TEMPLATE MODEL (E-R14)

Layers, edit authority and claim effect are **ruled — E-R14** (detail in
`docs/plan/research/wave-e/fs-template-design-codex-2026-08-08.md`). The research's table names are
a SKETCH; adoptions and amendments are named:

| Layer | Tables | ADOPT / AMEND | Writer |
|---|---|---|---|
| 1 statutory authority profile | `statutory_profiles`/`_versions`, `statutory_sections`, `statutory_slots` | ADOPT | **none** — migration-only. No curator UI in E. |
| 2 verified locale pack | `statutory_wording` | **AMEND** — a flat 0016-idiom fact table, PK `(profile_key, wording_key, locale, applies_to_periods_beginning_from)`, plus `…_to`, `wording_text`, `source_manifest jsonb`, `source_sha256`, `verification_state`, `source_note not null`. Rationale: system reference data, not a firm-editable object — `sst_threshold_schedule` (`0016:237-244`) is the repo's idiom for exactly this; the column names say *periods beginning* because E-R14's 2027-01-01 boundary is a period-beginning boundary (`wave-e-contract.md:290-292`), not a render-date one. | **none** — migration-only |
| 3 firm house style | `house_styles`/`_versions` | ADOPT | `publish_house_style_version` — **OWNER floor** *(R18/MINOR 14; E-R14 `wave-e-contract.md:306` says owner-sovereign)*; LLM drafts, human publishes |
| 4 registered firm template | `report_templates`/`_versions` (`report_class`, `claim_capability`, bound profile+style version ids) | ADOPT; immutable after publication | `publish_report_template_version` (admin+) |
| 5 report-instance overrides | `report_specs`/`_versions` **+ `report_runs`** | **AMEND** — split spec from run. Rationale: the seal binds a RUN (one snapshot, one dataset, one artifact); one spec legitimately runs against many snapshots. | `draft_report_spec` (bookkeeper+), `approve_report_for_issue` (key ② floor — see the note below) |
| 6 management templates | the same `report_templates`, `report_class='management'` | **AMEND** — one registry, not a seventh table. Rationale: `claim_capability` stays the single decision point; a second registry is a second place to forget it. | `publish_report_template_version` (bookkeeper+) |

**On "owner/partner"** *(R11)*: E-R11's factory default is written `owner/partner only`
(`wave-e-contract.md:233`), and "partner" has no structural representation in the live role set. The
campaign's default is **owner-only — CONFIRMED by the owner 2026-08-09** (the ruling record is
`wave-e-design-skeleton-part4.md` §6 item 2; a partner who is not the firm owner joins by explicit
audited grant). This document uses "key ② floor" and resolves to that ruling.

**Wording tables are BORN two-versioned** *(ruled)*: one act inserts both vintages' row sets — but only
once #43 has verified the text. Lane ε ships the STRUCTURE with zero MPERS rows and a CHECK forbidding
`verification_state='verified'` without `source_manifest`, `source_sha256`, `verified_by`,
`verified_at`. A profile whose required slot has no verified wording assesses **`failed`** and renders
nothing — it never emits a blank heading that reads as a real one.

**Grant matrix — three classes, mirroring `0004:744-799` exactly** *(R14; rewritten)*:
**(a) Human writers** (`publish_house_style_version`, `publish_report_template_version`,
`draft_report_spec`, `propose_/approve_/reject_/supersede_metric_definition`,
`approve_report_for_issue`) → EXECUTE to **`clara_authenticated` only**, the `0004:766-780` shape.
**(b) Wake DRAFT-ONLY writers** — the four named wrappers of §11 → EXECUTE to
**`clara_wake_interactive` only**, each with a `wake_fn_allowlist` row for the `interactive` kind and
never `proactive`, the `0004:782-788` shape. They mint drafts and previews; they cannot approve,
publish, or produce a `pre_sign` artifact.

**(c) Reads** → `clara_authenticated` on every read function. **The model's catalog read is an
RLS-scoped table SELECT, and the grant is NAMED here rather than implied** *(round-2: "the agent gains
nothing" was true of EXECUTE and read as though it were true of everything, which would leave
`list_metric_catalog` with no reachable path to its own data)*:

```sql
grant select on clara.metric_definitions, clara.metric_definition_versions,
                clara.account_sets, clara.account_set_versions,
                clara.presentation_maps, clara.presentation_map_versions,
                clara.metric_constants, clara.edge_policy_sets, clara.metric_edge_policies
  to clara_authenticated, clara_agent_ro;
```

The precedent is exact and was re-read this pass: `0005_event_spine.sql:406-407` grants SELECT on four
REFERENCE tables to `clara_authenticated, clara_agent_ro, clara_runtime`, and `:408` does the same for
`clara.domain_events`. Every table above carries forced RLS with a firm-scoped policy, so the grant
widens **reachability, never scope**. **`clara.metric_cells` and every write-side table are NOT in the
list** — the model reads what a metric IS, never what a client's figures ARE.

**The negative, correctly scoped:** `clara_agent_ro` receives **ZERO new EXECUTE grants**, and no new
grant of any kind — SELECT included — on any close-, approve- or publish-class object. What it gains
is exactly the catalog SELECT above, and the matrix asserts that table list **positively**, rather
than asserting an absence.

## 7. Lane ε · CLAIM ASSESSMENT, ANTI-SMUGGLING, PROTECTED PLACEHOLDERS

**The row.** `clara.report_claim_assessments(report_run_id, status, reason_codes jsonb, check_receipt
jsonb, claim_policy_version_id, evaluator_version_id, assessed_at)` — one immutable row per run. The
four states are **ruled — E-R14**; the label comes from versioned claim-policy rows, and the product's
own wording is "presentation-profile checks passed", never a certification.

**The enforcement point** *(builder choice — the states are ruled, the point was not)*:
`assess_report_claim(run_id)` runs **inside the same transaction that seals the dataset**, and
**before** any render job is enqueued; the manifest carries the assessment id + status. Three
fail-closed gates follow.

**Gate 1 — the seal gate** *(R13 — corrected; `stripped` SEALS)*. `pre_sign` is refused when, and only
when: there is **no** assessment row; the status key is unreadable or unknown; or the status is
**`failed`**. `eligible`, `not_applicable` **and `stripped` all seal** — `stripped` never blocks
generation *(ruled — E-R14, `wave-e-contract.md:309`)*. A stripped pack seals and renders **with the
compliance claim removed** and the assessment id + status recorded in the manifest and on the artifact
row. Absence is refusal; `stripped` is not absence. (Matrix D6 already states this outcome; §7 is now
aligned to it, not the reverse.)

**Gate 2 — the render gate.** The renderer refuses a manifest whose claim-status key is missing,
unknown or unreadable (Law 2: "nothing said stripped" is a derived state, not a positive read). A
`failed` run may still render a **watermarked, non-issuable** draft so the preparer can see what
failed *(builder choice)* — gate 3 keeps the claim phrase out of that artifact.

**Gate 3 — the pre-seal claim scan, which OBSERVES THE FINAL PDF** *(R9 redesigned the scan; the
round-2 fix moved it onto the produced bytes — a sidecar the renderer emits alongside the PDF binds
the sidecar to the manifest, not the manifest to what the PDF actually says)*. A raw byte scan proves
nothing on its own: page text lives in FlateDecode-compressed content streams and font subsetting
routinely splits a phrase across separate `Tj` operators. So the scan does the one thing that closes
the gap between "what the renderer says it drew" and "what the artifact says": **it extracts text FROM
the produced PDF and reads that.** Four positive reads, run after assembly and before sealing:

- (a) **the inputs** — the resolved layout AST, the fully resolved render manifest (every substituted
  string), and the `statutory_wording` / house-style rows the run bound;
- (b) **a deterministic text extraction over the FINAL PDF BYTES** — decompress the content streams
  and reassemble the text runs per page, using an extraction tool **pinned in the renderer image**,
  with the tool's name + exact version a REQUIRED manifest key (§9) beside the extracted-text sha256.
  Pinning is what makes the extraction reproducible seven years later; an unpinned extractor makes the
  scan's own result unrepeatable;
- (c) **cross-check (a) against (b)** — every protected placeholder's resolved value must appear in
  the extracted text. A phrase that the manifest says was drawn and the extraction cannot find means
  the two disagree, and disagreement refuses the seal rather than picking a winner;
- (d) **the uncompressed metadata** — the Info dictionary (`Title`/`Subject`/`Keywords`/`Author`) and
  the XMP packet.

Matching runs against `clara.claim_phrase_lexicon` (versioned EN/MY/ZH policy rows, 0016 idiom) and
refuses when a claim phrase appears while status ≠ `eligible`.

**The one residual, with its honest boundary** *(written into the function's own comment, in
`verify_report_artifact`'s idiom, §9)*: **claim text rendered INSIDE an image** — a logo or a cover
graphic with words baked into pixels — is not reachable by text extraction, and this design does not
OCR. The boundary that makes that acceptable is structural rather than hopeful: images enter a render
only as **content-addressed assets published by the firm owner** through `publish_house_style_version`
(§6, owner floor), every hash pinned in the manifest (§9). It is a recorded human act by the one role
that could also just approve a false claim directly — **not a model-reachable channel, and not a
user-supplied one**. If image OCR is ever wanted it is a lane-ζ addition, not a hole in this gate.
The byte-level *reproduction* guarantee remains the double-render equality drill (§9/§10); this gate
is about content, that one is about determinism.

**The filename vector is structurally closed:** the storage key is content-addressed
(`firms/{uuid}/reports/{sha256}.pdf`) and the download filename is DB-derived from the run row —
**no user- or model-supplied filename exists anywhere in the path** *(builder choice — the cheapest
kill for the ruled anti-smuggling requirement)*.

**Protected placeholders** — `clara.protected_placeholders` enumerates them (entity legal name,
registration identifiers, reporting period, currency/unit, statement titles, totals, note
references, claim wording), enforced twice: the layout-AST validator rejects any template or spec
binding a protected placeholder to a user-supplied literal (publish time), and the manifest
resolves them from DB values only (render time).

## 8. Lane ε · THE CHART AST

Adopt **`clara.chart/v1`** and the four-stage validation pipeline *(ruled shape — E-R14,
`wave-e-contract.md:315-319`)*: (1) closed JSON-schema validation, (2) DB semantic validation (RLS
scope, metric versions, units, grain compatibility, allowed filters, catalog effective dates), (3)
versioned DB evaluator execution against the **pinned** books snapshot, (4) **persistence of the typed
dataset BEFORE rendering**.

Tables: `chart_templates`/`_versions` (firm-scoped, `chart_spec_ast`, content hash);
`report_datasets(report_run_id, chart_spec_version_id, books_snapshot_id, evaluator_version_id,
dataset_sha256)`; `report_dataset_points(dataset_id, metric_version_id, **cell_id** → the §4.3
provenance row, `value_cents bigint | value_numeric | value_date | value_text`, dimensions)`. The
`cell_id` FK is this design's one addition to the sketch *(builder choice — it makes "which cell is
this pixel" a join, not an inference)*.

**No inline values, SQL, JS or user formulas** *(ruled)*; threshold/target lines reference DB rows
(metric versions or `metric_constants`), never literals. **Named axis policies only** —
`include_zero` | `data_extent` | `symmetric` | `disclosed_manual` (the last renders a conspicuous
disclosure line); no arbitrary clipping. **Every chart carries an accessible same-source data
table** generated from the SAME `report_dataset_points` rows, with a CI parity test asserting
series-vs-table value equality *(builder choice — mirrors DIRECTION's card-catalog parity gate,
which exists precisely because two renderers of one truth drift)*. Model-generated image charts are
forbidden; charts are deterministic vector geometry.

## 9. Lane ε/ζ · SEALED ARTIFACTS

**The pin list, carried verbatim (14 lines, the FS-template dossier (e) —
`docs/plan/research/wave-e/fs-template-design-codex-2026-08-08.md`):** report spec/version and
parameters · statutory profile, wording, house-style and chart version IDs + hashes · books
snapshot/event sequence · typed metric/fact dataset + dataset hash · all applicability and
claim-assessment receipts · evaluator function versions + definition hashes · assembler version ·
renderer OCI image digest and source commit · Node/OS/architecture/font-engine versions · every
font/logo/image hash · locale, timezone and deterministic document metadata · canonical
render-manifest hash · pre-sign PDF hash · signed-original PDF hash and signature evidence. Each is
a REQUIRED key of the manifest; a missing key is a seal refusal, not a default. **Plus two keys this
design adds** *(builder choice — the scan is only honest if what it read, and the instrument that read
it, are both pinned)*: the §7 gate-3 **extracted-text sha256**, and the **extraction tool's name +
exact version** as pinned in the renderer image. **Ordering, stated because the two constraints look
circular otherwise:** the PDF bytes are produced → the pinned extractor reads them → the scan runs
over that extraction → the extraction's hash and the tool version join the manifest → the manifest is
sealed. The scan therefore runs strictly BEFORE the seal and its output is an INPUT to the seal; the
manifest key is never a precondition of the scan.

**The registry.** `clara.report_artifacts(id, report_run_id, kind
('draft_watermarked'|'pre_sign'|'signed_original'), storage_key, sha256, byte_size, manifest jsonb,
claim_assessment_id, prior_artifact_id, sealed_by, sealed_at)` — insert-once, UPDATE/DELETE
trigger-blocked, chained to its predecessor: directly the `bank_reconciliations` shape (`0040:262`,
`:351`, `:379`). `clara.verify_report_artifact(id)` is the `verify_bank_reconciliation` analogue
(`0040:4537-4644`) with one honest limit written into its own comment: the DB half **recomputes
dataset and manifest hashes from source facts and diffs them** (strict) and reports the byte-level
claim as *unverified-by-this-function* — **byte reproduction is the render lane's drill (§10), because
the bytes are produced outside the database.** Any other split would let a green DB check imply a byte
claim nobody made.

**Custody.** `safeReportKey()` — a third key family beside `safeKey` (`storage.mjs:16-22`) and
`safeWikiKey`: `firms/{uuid}/reports/{sha256-hex}.{pdf|json}`, same `x-upsert:false`
overwrite-impossible PUT, same streaming re-hash verify, same positive role-claim check (`:40-62`).
**Same `firm-docs` bucket** *(builder choice — the wiki family made exactly this call so the daily R2
mirror covers the bytes for free; a new bucket needs its own mirror, restore drill and role)*.
**The bucket policy is an explicit lane-ζ item, not an inheritance** *(R18/MINOR 25)*: `safeKey`'s
live regex admits only `firms/…/docs/…` (`storage.mjs:16-22`) and the role check (`:40-62`) is about
the ROLE, not the prefix — so the storage role's policy must be extended to the `reports/` prefix
deliberately, and the extension is a named ceremony step with a positive read (upload one object,
read it back by key) before the first seal. **The signed original is retained and retrieved, never
regenerated** *(ruled)*; the pre-sign bytes are reproducible byte-exactly — a **CI obligation**
(double render in one image → identical sha256) **and a DR obligation** (§10).

## 10. Lane ζ · THE RENDER WORKER

**Shape.** `packages/reporting-render/` *(name: builder choice)* → a **separate Fly app**
`clara-render`, region `sin`, `[build] dockerfile`, **no `[http_service]`, no `[[services]]`** — a
batch job, not a server (`packages/backup/fly.toml:27-29` is the precedent and states that law
itself). Built **build-only + push from the repo root with `--dockerfile` explicit**; the machine is
created by `fly machine run`, **which disregards fly.toml configuration entirely — its flag set IS the
runtime contract** (`fly.toml:13-17`). Per that file's own law (`:8-11`), **the exact commands live in
ONE place — `docs/ops/DR.md` §10 — never restated in the toml.** Liveness is a dead-man's switch, not
an HTTP check. It must never ride `clara-runtime`'s machine: that app is explicitly non-HA (single-leader
advisory lock), and a font-loading, memory-spiky renderer there risks the durable engine.

**Trigger** *(builder choice — the contract specifies none)*: **a DB-queued `clara.render_jobs`
table, claimed with `for update skip locked`.** Four reasons: (a) the request is enqueued **inside
the same audited transaction** that seals the dataset and writes the claim assessment — no window
in which a render exists without a seal; (b) the worker needs **no inbound network** (it dials out
to Postgres and object storage only, which is what "offline at render time" requires); (c)
at-least-once is safe — the idempotency key is `(run_id, manifest_sha256)` and the output key is
content-addressed, so a duplicate render is a no-op write under `x-upsert:false`; (d) no new
authenticated HTTP surface. **Dispatch:** the runtime leader already holds a session and already
runs periodic sweeps (`packages/runtime/lib/reconciler.mjs`'s five daily sweeps are the precedent), so it starts a
render machine when a claimable job exists — **the one place lane ζ touches runtime judgement
logic, so it carries a Law-1 independent review.** A coarse scheduled wake is the fallback (Fly's
granularity is hourly at best and approximate — `packages/backup/fly.toml:40-45`), so a leader outage
delays renders rather than stranding them. The Fly API token is an environment secret — never argv,
never code. **This surface is celled: `wave-e-acceptance-matrix.md` **A33** asks all three arms —
dispatch within cadence, leader outage → delayed-not-stranded, and duplicate dispatch → one artifact
— because a judgement surface the matrix never asks is the ADR-066 lesson repeating.**

**Determinism obligations.** Network disabled during layout/PDF · content-addressed
fonts/logos/images, no system fonts · one pinned OS/CPU architecture and an exact renderer image
**digest**, not a tag · no ambient `now()`, randomness or mutable URLs — creation metadata,
document ids and timestamps derive from the manifest · deterministic font embedding/subsetting ·
normalized PDF metadata and trailer identifiers · the §7 text-extract emitted in the same pass ·
archive the image or its reproducible build inputs. **A declarative PDF layout engine is preferred
over printing a live webpage**; if a browser is ever used, the entire browser/OS/font stack must be
pinned and archived. The engine choice is a build-time spike; the **acceptance test is fixed either
way** — double-render byte equality in CI, re-render-from-archived-digest equality in the drill.

> **AMENDMENT 2026-08-15 (lane ζ as-built, owner-ruled).** "Normalized PDF metadata **and trailer
> identifiers**" is narrowed to what the pinned engine can actually carry. Typst 0.12.0 sets
> `title`, `author`, `keywords` and `date`; it offers no facility for a PDF **Subject** or for the
> trailer **/ID**, and this image deliberately carries no post-processing tool that could write
> them. The manifest therefore pins neither: a manifest that pinned a document id the artifact does
> not hold would be a claim about a document that does not exist — the exact disagreement §7(d)'s
> cross-check exists to catch, and one that cross-check could never have caught, because it never
> looked at those fields. The honest manifest wins over the aspirational one. **What replaces the
> lost coverage:** the date pin is proven by the drill's clock arm (a changed `SOURCE_DATE_EPOCH`
> must leave the bytes identical) and its control arm (a changed pinned input must move them),
> which together are a stronger instrument than a substring match ever was. If the engine pin
> moves to ≥0.13, `subject` returns via `#set document(description:)` and rejoins the checked set;
> the trailer /ID would still need a tool this image does not ship.

**DR.md §10 + Supavisor.** DR.md's last `##` is §9 (`docs/ops/DR.md:349`; the file runs to `:497`);
§10 lands after it, structured like §5/§5b (described drill at `:152` + exercised evidence at `:203`)
and joined to §9's existing cadence **in DR.md's own vocabulary, quoted exactly** — the section header
is *"Verify cadence (a backup you never restored is not a backup)"* (`:491`) and its two bullets are
spelled **`Monthly-light`** (`:493-495`) and **`Quarterly-full`** (`:496-497`). *(v2 wrote "quarterly
STRICT", which is the prose used at `:329`/`:344` about the drill, not the cadence bullet's own label;
a new section that renames an existing cadence is a second vocabulary.)* So: *Monthly-light* = also
re-render the most recent sealed pre-sign artifact and compare sha256; *Quarterly-full* = also
re-render one artifact per pinned renderer image digest still referenced by a retained artifact, plus
a signed-original retrieval + hash check. In DR.md's own idiom:
a sealed artifact you have never re-rendered from its pinned dataset + evaluator + renderer digest is
not proven reproducible. **Supavisor: last measured 35/60** (`docs/plan/completed/wave-e-f6f9-acceptance.md:51`,
`:196`). The `clara-backup` shape adds **no standing sessions** — a short-lived DSN session per job, no
pool, no LISTEN client; worker concurrency capped at 1 in v1, so peak adds 1. **Re-verify headroom
before deploy** (the standing law every consumer-adding wave has followed).

## 11. Lane η · E-c, THE AD-HOC AUTHORING LANE

**Where it lives.** The chat lane is frozen (`chatTurn_v10`, `registry.ts:38-47`), so new tools ship
as **`chatTurn_v11`** — six files, registry repoint, `pnpm freeze:update`, deploy-lock AFTER the
ceremony *(Appendix A)*. Grep the built bundle after the edit (the WDK silent directive-swallow).

**The DB privilege path, specified exactly** *(R14; Codex 12)*. Each writing tool reaches the DB
through ONE named wake wrapper; the wrapper is SECURITY DEFINER with a pinned `search_path`, is granted
**EXECUTE to `clara_wake_interactive` only** (the `0004:782-788` shape), and carries a
`clara.wake_fn_allowlist` row (`0002:247-251`) for `interactive` **only, never `proactive`**. The
evaluator and the catalog writers themselves stay ungranted to every wake role; the wrapper reaches
them as an **internal, ungranted call under `clara_fn_owner`** — the containment `0004:749-750`
already describes for `_*_core` helpers.

| Tool | Wake wrapper (EXECUTE → `clara_wake_interactive` only) | Effect | Guard |
|---|---|---|---|
| `list_metric_catalog(client, as_of)` | **none, and none is needed** — the tool issues an RLS-scoped `SELECT` directly against the catalog tables §6(c) grants, so there is no `clara.list_metric_catalog` function to go looking for (`0005:406-408` precedent) | read | RLS scopes it to the wake's firm; no EXECUTE grant is created and none of the write-side tables is in the grant list |
| `compose_metric_preview(ast, periods)` | `clara.wake_compose_metric_preview` | validator + evaluator in **preview** mode; cells with `report_run_id is null` | numbers come from the evaluator (E-R4 satisfied); the model narrates by **placeholder substitution only** |
| `save_metric_definition_draft(ast, …)` | `clara.wake_save_metric_definition_draft` | a `draft` version row | **SAVING a composition mints a draft** *(ruled — E-R5)*; never `firm_approved` |
| `draft_report_spec(template_version_id, params, overrides)` | `clara.wake_draft_report_spec` | a draft spec | never approves, never issues |
| `request_report_preview(spec_draft_id)` | `clara.wake_request_report_preview` | a render job of kind `draft_watermarked` | can never produce `pre_sign` (§7 gate 1 is a seal-side refusal, not a caller-side promise) |

**`clara_agent_ro` gains no EXECUTE, on anything** (`0004:744-799`) — its only new privilege in all of
E-b/E-c is §6(c)'s named catalog SELECT.

**Human approval.** `approve_metric_definition(version_id, expected_formula_sha256, reason)` (admin+
floor *(builder choice — mirrors `role_rank` ≥ 2; E-R11's keys are close-scoped and belong to E-a)*,
**plus PRD §2 segregation — approver ≠ proposer**, §3.2) · `publish_house_style_version` (owner) ·
`publish_report_template_version` · `approve_report_for_issue(run_id, expected_artifact_sha256)` (key
② floor; maker/checker per PRD §2 — the attestation binds the **exact sealed artifact hash** *(ruled —
E-R14, `wave-e-contract.md:312-313`)*, and the model can never be checker).

**The uncertified watermark is enforced in the DB, not the prompt** — three fail-closed points: (1)
`assess_report_claim` sets `uncertified = true` whenever ANY contributing cell's definition version
is `draft`; (2) the **seal refuses** to mint a `pre_sign` artifact for a dataset referencing a
`draft` definition, so "draft never statutory" is structural, not a label; (3) the renderer stamps
every page from the manifest flag and **refuses to render when the flag is absent or unreadable**
(absence is not permission).

**Composition vs new definition.** Composing already-approved metrics ad hoc is **composition, not
a new definition** *(ruled)*: such a cell records `definition_version_id = NULL` with
`formula_sha256` populated — exactly what provenance field 1's disjunction ("definition version /
normalized formula hash") allows. Since statutory eligibility (§3.2) requires a non-null definition
version in `canonical`/`firm_approved`, an ad-hoc composition is mechanically barred from a statutory
pack with no extra rule. **Saving** it mints a `draft` on the approval lane.

## 12. E-R8's floors, the lane map, and what was decided

**The two floors** *(ruled — E-R8)*. Management report design is user sovereignty (layout, grouping,
comparatives, language, branding) with exactly two floors, bound mechanically here: ① **every cell's
figure comes from the DB/algebra** — so the layout AST has **no numeric literal node**, only structural
integers (column spans, row counts, font sizes); no user and no model can type a number into a report
in any layer, including layer 6. ② **every render is a durable reproducible artifact** — there is no
"preview-only, not persisted" path; every render mints a `report_artifacts` row with its full manifest,
watermarked drafts included.

| Lane | Contents | Size | Build-depends on | Law-1 judgement PR? |
|---|---|---|---|---|
| **δ** | AST + validator + primitives · catalog + lifecycle fns · edge-policy + sampling rows · `evaluate_metric_v1` + `metric_cells` + `metric_cell_periods` · **the freeze family's DB half** (`evaluator_versions`, `verify_evaluator_freeze()`, the `migrate.mjs` hook, the per-migration tails — §4.2) · ratio seeds | **XL** | **γ** — `clara.reporting_periods` is the junction's FK target and `days_in_period`'s only input *(R7; a BUILD dependency, not merely acceptance)* | **Yes** — validator, lifecycle, edge policies, freeze |
| **ε** | six template layers · wording STRUCTURE (zero MPERS rows) · claim assessment + protected placeholders + phrase lexicon · chart AST tables · `report_artifacts` + `verify_report_artifact` | **L** | δ (cells) | **Yes** — claim assessment, anti-smuggling |
| **ζ** | `packages/reporting-render` + Fly app · `render_jobs` + leader dispatch · the pinned text extractor (§7 gate 3) · `safeReportKey` + the bucket-prefix step · **the freeze family's CI/runtime half** (`check-frozen-evaluators.mjs` + manifest; marking the render modules `@frozen` — §4.2) · DR.md §10 | **L** | ε (manifest + seal) | **Yes** — the leader-dispatch touch |
| **η** | `chatTurn_v11` tools · the four wake wrappers + allowlist rows · approval fns · watermark enforcement | **M** | δ, ε | **Yes** — watermark enforcement |

**Acceptance.** The CORPUS is **ruled — E-R9** (`wave-e-contract.md:196-203`): the full synthetic
sandbox battery **including the synthetic goods-trader closing-stock fixture (WD-R11)** → **BEE FY2025**
first real close → **RPR historical-FY** MPERS pack → **RS** snapshot/staleness witness → BEE sole-prop
format. The **execution order is F → A → B → C → D → E**, stated identically in this document, the
skeleton and `wave-e-acceptance-matrix.md` *(R18)*; the falsifiable cells live in the matrix, not here.

**Decisions taken at the round-1 fix pass — DECIDED (orchestrator, 2026-08-09)** *(R18/MINOR 16: these
are orchestrator decisions, not contract law; the *(ruled — E-R#)* marker is reserved for the
contract)*:

1. **Draft-artifact byte retention — bytes kept indefinitely in v1.** The 90-day proposal is
   withdrawn: E-R8 floor ② is ruled, and stretching it buys a capacity win nobody measured a need
   for. A future retention policy is an ADR. §9's registry keeps every artifact's bytes.
2. **The three added primitives — approved as extensibility, not a ruling change.** The ruled list
   carries a trailing "…"; "closed" means closed at runtime, and each addition rides a migration +
   evaluator `_vN` + independent review, exactly as §2.2 binds.
3. **The classification seam — classification sets seed in δ** (structure, not wording); the owner's
   MASB sitting (task #43) also eyeballs the classification seed as a cross-check.
4. **`metric_cells` capacity — moved to the matrix:** cell **D8** measures the RPR pack + RS snapshot
   count and projects seven-year growth before the campaign closes.
5. **Renderer engine spike — inside lane ζ**; the fixed acceptance test (double-render byte equality
   in CI; re-render-from-archived-digest equality in the drill) is unchanged either way.
6. **The event trigger — off the critical path, optional, live-probed (§4.2).**

**Still with the OWNER, not decided here:** the E-R11 factory-default reading (owner-only vs
owner/partner), carried as the same one-line open item in
`wave-e-design-skeleton-part4.md` §6 item 2 and cited at §6 above.

*End. §§2-11 are proposals at implementable precision; every ruled item is cited, never restated.*
