# FS golden template + style/chart architecture — evidence + design of record (2026-08-08)

> The Wave-E grill's Q11: the owner has no in-house illustrative FS ("没有,你可以去
> research") and asked whether users may specify the golden template's design style and
> customize charts/data viz, ordering a Codex collaboration. Two lanes ran 2026-08-08:
> a golden-source research agent (sonnet-5) and a Codex gpt-5.6-sol xhigh design lane
> (direct `codex exec`, read-only). The owner RATIFIED the synthesis as E-R14
> (`docs/plan/wave-e-contract.md`, ADR-065). This file preserves both lanes as the
> design-of-record. **Standing caution carried into the build:** every illustrative-FS
> PDF below resisted AUTOMATED text extraction (the encodings are unverified — only the
> failures were observed) — a manual pull + HUMAN verification is required before any
> wording enters the policy tables. *(Portability note: workstation-absolute repo links
> in the verbatim Codex section below were rewritten repo-relative; content otherwise
> verbatim.)*

---

## Lane 1 — MPERS golden-source research brief (as returned)

**MASB OFFICIAL — authoritative text**

1. **MPERS (2016)**, full text: `https://www.masb.org.my/pdf/MPERSDec2016_website.pdf`
(linked from `masb.org.my/pages.php?id=614`). "Word-for-word the IFRS for SMEs Accounting
Standard [2009 ed.] issued by the IASB," one carve-out (Property Development Activities).
Effective periods beginning on/after 1 Jan 2016; amended Oct 2023 (Pillar Two).
**Withdrawn for periods beginning on/after 1 Jan 2027.** Verdict: THE golden source for
current wording — what Clara's live clients (2025/26 periods) must match.

2. **MPERS (2025)**, issued 10 Oct 2025, based on the IASB's IFRS for SMEs **third
edition** (issued Feb 2025), scope adapted for Malaysia. Effective periods beginning
on/after **1 Jan 2027**, early adoption permitted. Full text:
`masb.org.my/pdf.php?pdf=MPERS%202025.pdf&file_path=pdf_file`. The revision touches
nearly every section. **Effective-dating implication: wording templates keyed to
MPERS(2016) now, with MPERS(2025) as a second effective-dated version activating for
periods beginning ≥ 1 Jan 2027 — the tax-policy-table pattern.**

3. **MASB's own illustrative FS**: "Basis for Conclusions and Illustrative Financial
Statements" bundled with MPERS(2025) at `masb.org.my/pdf_file/MPERS_2025_BC_IE.pdf`.
Could not extract text (image/binary PDF, two attempts); existence confirmed by
title/linked-document metadata only. **Manual pull required** — if it holds up, it
outranks every practitioner source (standard-setter provenance). *[Ed., review round 3:
"image/binary" is the lane's inference — only the extraction FAILURE was observed; the
encoding is unverified. E-R14's mandatory manual-pull + human-verification step governs.]*

**PRACTITIONER ILLUSTRATIVE FS — secondary, for cross-checking**

4. **MIA — "Illustrative MPERS Financial Statements, with Commentaries and Guidance
Notes"**, 2nd ed. (print 2018, e-book 2020), incorporates CA 2016 requirements. Order
form only (`mia.org.my/wp-content/uploads/2022/05/MPERS_Order_Form.pdf`) — **paid MIA
publication, not freely downloadable**. Highest-authority secondary source; worth buying
if the free sources prove thin.
5. **KPMG Malaysia — "Wonderful SME Sdn Bhd" Illustrative FS** (2016 vintage,
first-time-adoption focus), freely downloadable:
`assets.kpmg.com/content/dam/kpmgsites/my/pdf/2025/01/Wonderful-SME-Sdn-Bhd-Illustrative-Financial-Statements-2016.pdf`.
Big-4 provenance; content unverified (image PDF). Good free cross-check; vintage 2016.
6. **Forvis Mazars — "MPERS Series"** (5-part set), freely downloadable, no year stamped —
vintage uncertain.
7. **NK Associates — MPERS Illustrative FS FY2023**, freely downloadable
(`nk.com.my/cdn/pdf/MPERS_Illustrative_Financial_Statements.pdf`), boutique firm, most
recent vintage found, content unverified.
8. **Baker Tilly — Illustrative Directors' Report and FS**, freely downloadable, content
unverified.
9. A Scribd "AXP-MPERS" upload: user-hosted, no provenance — NOT a golden source.

**Common caveat (4–8):** no fetch could extract readable text — existence/publisher/date
confirmed, component completeness NOT verified by content. A human opens at least one
(MIA or KPMG) before treating it as wording ground truth.

**SOLE PROPRIETORSHIPS — NOT FOUND (no authoritative format)** *[Ed., review round 3:
this heading states the lane's search outcome, not a proven absence — E-R14 treats the
sole-prop authority question as UNRESOLVED pending a positive primary check (LHDN / MIA /
ROBA) at build; the convention label is interim.]*

Sole props are not MPERS-bound; no legal FS-format requirement (ROBA 1956 governs
registration only). LHDN's Form B requires the data, not a presentation format. No
MIA/MASB/LHDN prescribed layout found; practitioner convention converges on "P&L + SoFP +
capital-account movement" (one BNM bank-facing template exists, not a reporting
standard). Wave E's sole-prop format is convention-based and must be labelled as such,
never cited as MPERS-equivalent.

---

## Lane 2 — the Codex gpt-5.6-sol design (verbatim below; ratified as E-R14's architecture)

The architecture should treat a firm’s “golden FS template” as a versioned composition, not a fork of statutory truth: an exact statutory profile + an exact firm house style + constrained preferences. This extends Clara’s existing [reporting-engine boundary](../../../architecture/ARCHITECTURE.md:157), [honest-FS requirement](../../../prd/PRD.md:84), and [Wave E scope](../../REBUILD-PLAN.md:357).

## 1. Layered template model

### Layers and authority

| Layer | Contents | Who may change it | Effect on claim |
|---|---|---|---|
| Statutory authority profile | MPERS statement set, protected sections, disclosure/applicability rules, required slots, ordering constraints, verified wording keys and source citations | Clara compliance curator through an operator-only audited function; never a firm user or LLM | Exact applicable version is required for claim eligibility |
| Verified locale pack | Approved English/Malay/Chinese labels and statutory wording translations | Same controlled curation lane | Approved translation retains eligibility; replacing authoritative wording with user text strips it |
| Firm house style | Logo, embedded fonts, spacing tokens, colours, headers/footers, cover treatment, approved locale selection, safe note-order preferences | Firm admin/owner; LLM may draft, human publishes | Retains eligibility when all choices stay within the statutory profile’s presentation envelope |
| Registered firm template | Exact binding of statutory-profile version + house-style version + allowed preferences | Firm admin/owner publishes; immutable after publication | This is the firm’s legitimate “golden variant” |
| Report-instance overrides | Cover subtitle, issue date, signatory blocks, optional supplementary schedules, allowed visual switches | Bookkeeper may draft; issued statutory packs require human approval/checking | Presentation-only overrides retain eligibility; semantic overrides automatically produce a custom cut with claim stripped |
| Management-report template | Sections, groups, narrative placeholders, charts, language and layout | User sovereign; LLM may design drafts | No statutory claim is attached, so freedom is much broader; E-R4/E-R5 still apply |

Bilingual labels are not wholly “style.” Selecting a verified locale pack is style; writing a new translation is content. A firm may add an explicitly secondary, unverified convenience translation while retaining the authoritative primary wording, but the claim must apply only to the authoritative language. Replacing it makes the pack a custom cut.

Likewise, note ordering is safe only where the statutory profile marks sections as reorderable. Model this as ordering constraints—a DAG or protected predecessor rules—not as an unrestricted drag-and-drop list.

### Compliance behaviour

Do not store `is_mpers_compliant = true`. That overstates what software can certify. Store an instance-specific assessment:

- `eligible`: the applicable statutory profile is intact and all deterministic presentation/disclosure checks passed.
- `stripped`: a requested customization changed protected semantics, wording, inclusion, grouping, or ordering.
- `not_applicable`: management report or other non-statutory artifact.
- `failed`: the artifact cannot be issued because data, applicability decisions, approval, or rendering integrity is incomplete.

`stripped` must not block generation. Clara renders an honestly labelled custom financial report and obtains its label from a versioned claim-policy row. It must also prevent the filename, cover, metadata, or UI from independently reintroducing an MPERS claim.

A visual customization must never be able to edit protected DB placeholders such as legal entity name, registration identifiers, reporting period, currency/unit, statement titles, totals, note references, or claim wording.

### Concrete data-model sketch

Use logical handles plus immutable versions, following the repo’s `wiki_pages`/`wiki_page_versions` pattern:

```text
statutory_profiles
  id, framework_code, jurisdiction, report_class, state

statutory_profile_versions
  id, profile_id, version_n
  effective_from, effective_to, applicability_rule_version_id
  content_sha256, state
  verified_by, verified_at, supersedes_version_id

statutory_sections
  profile_version_id, section_key, parent_key
  required_rule_id, protected, ordering_group, ordinal_floor

statutory_slots
  profile_version_id, section_key, slot_key
  slot_kind                 -- metric | wording | client_fact | decision | child_section
  metric_version_id, wording_key, format_policy_id
  required_rule_id

statutory_wording_versions
  id, profile_version_id, wording_key, locale
  wording_text, source_manifest, source_sha256
  effective_from, effective_to, verification_state

house_styles
  id, firm_id, name, state

house_style_versions
  id, house_style_id, firm_id, version_n
  design_tokens_json, locale_policy_json
  asset_manifest_sha256, content_sha256
  state, published_by, published_at

report_templates
  id, firm_id, name
  report_class              -- statutory_bound | custom_cut | management
  state

report_template_versions
  id, template_id, firm_id, version_n
  statutory_profile_version_id nullable
  house_style_version_id
  layout_spec_json, allowed_preferences_json
  semantic_delta_json
  claim_capability          -- eligible_candidate | permanently_stripped | n/a
  content_sha256, state, published_by, supersedes_version_id

report_spec_versions
  id, firm_id, client_id, template_version_id, version_n
  parameters_json, override_spec_json, books_version_token
  revision_token, state, content_sha256

report_claim_assessments
  id, report_spec_version_id, profile_version_id
  status, reason_codes_json, check_receipt_json
  evaluator_version_id, assessed_at

report_approvals
  report_spec_version_id, artifact_id
  maker, checker, attestation, exact_artifact_sha256
```

Any JSON is a closed, typed AST validated at publication—unknown fields rejected—not a raw styling/programming escape hatch. Statutory sections and slots should remain relational because their requiredness, ordering and metric bindings are authoritative.

Writes go through named functions such as `publish_house_style_version`, `publish_report_template_version`, `assess_report_claim`, `seal_report_artifact`, and `approve_report_for_issue`. Apply Clara’s normal controls: forced RLS, composite firm/client FKs, revoked direct DML, idempotency keys, revision-token checks, audit events and immutable published rows. The LLM may create a draft; it cannot publish a template, approve a translation, declare eligibility, or sign an artifact.

A statutory-profile update must not silently mutate firm variants. For a later reporting period, Clara should require the firm to publish a new binding after previewing the house style against the new profile. The old binding remains available for historical reproduction.

## 2. Chart-spec architecture under E-R4

Use both reusable chart templates and one-off report specs—but every executed chart must resolve to an immutable registered version. An ad-hoc chart simply has `reusable = false`.

```json
{
  "schema": "clara.chart/v1",
  "mark": "line",
  "dataset": {
    "metric_versions": [
      {"alias": "revenue", "version_id": "…"}
    ],
    "dimensions": [
      {"field": "accounting_period", "grain": "month"}
    ],
    "scope_refs": {
      "client": "$report.client_id",
      "from": "$report.period_start",
      "to": "$report.period_end"
    },
    "filters": [],
    "comparison": "prior_period"
  },
  "encoding": {
    "x": {"field": "accounting_period"},
    "y": {"field": "revenue", "format_policy": "myr_v1"},
    "series": null
  },
  "presentation": {
    "style_token": "firm.primary_chart",
    "legend": "bottom",
    "axis_policy": "include_zero",
    "data_labels": "none"
  },
  "disclosure": {
    "show_scope": true,
    "show_unit": true,
    "accessible_table": true
  }
}
```

The spec must contain no `values`, `points`, inline data arrays, arbitrary SQL, JavaScript, or user-authored formulas. Threshold lines and KPI targets must reference DB-owned target/policy rows; they cannot be literal numbers painted into the spec.

Supporting model:

```text
metric_definitions / metric_definition_versions
  scope, result_type, unit, grain, algebra_ast
  evaluator_function_version, effective dates
  approval state, content hash

chart_templates / chart_template_versions
  firm_id, reusable, chart_spec_ast
  content hash, publication state, supersedes id

report_datasets
  report_run_id, chart_spec_version_id
  books_snapshot_id, evaluator_version_id, dataset_sha256

report_dataset_points
  dataset_id, series_key, dimension_key, ordinal
  value_bigint | value_numeric | value_date | value_text
  metric_version_id, provenance_json
```

Money remains `bigint` cents. Units, signs, null behaviour, grain, aggregation and comparison semantics come from metric versions, not the chart.

The user/LLM may safely choose:

- Approved metrics and dimensions.
- Chart type, grouping, filters, comparisons and deterministic top-N requests.
- Layout position, palette/style tokens, legend, titles and language.
- Placeholder narration such as “Revenue changed by `{{metric:revenue_change}}`.”

It may not choose:

- Inline values or hand-entered points.
- Arbitrary formulas or implicit unit conversion.
- Literal target/benchmark lines not registered in the DB.
- Hidden category suppression, unexplained sign reversal or silent “Other” removal.
- Arbitrary numeric axis clipping. Prefer named policies such as `include_zero`, `data_extent`, `symmetric`, or a conspicuously disclosed advanced mode.
- Model-generated image charts. Charts are deterministic SVG/PDF geometry, not image generation.

Validation should occur in four stages:

1. Closed JSON-schema validation.
2. DB semantic validation of RLS scope, metric versions, units, compatible grains, allowed filters and catalog effective dates.
3. Versioned DB evaluator execution against the pinned books snapshot.
4. Persistence of the resulting typed dataset before rendering.

The chart renderer only maps persisted values to pixels and formats labels. It cannot aggregate, calculate ratios or invent missing points. Every chart must offer an accessible table backed by the same `dataset_id`, plus visible scope, period, unit, filters and comparison basis.

Firm-specific metrics are legitimate, but they first become approved, effective-dated metric-definition versions. The LLM can propose the algebra AST; a human approves it and the deterministic evaluator executes it.

## 3. Reproducibility mechanics

A books-version token alone is insufficient for a seven-year promise. Clara must preserve the exact DB-owned fact set that was rendered, its lineage, and the software environment that transformed it.

A sealed artifact should pin:

```text
report spec/version and parameters
statutory profile, wording, house-style and chart version IDs + hashes
books snapshot/event sequence
typed metric/fact dataset + dataset hash
all applicability and claim-assessment receipts
evaluator function versions + definition hashes
assembler version
renderer OCI image digest and source commit
Node/OS/architecture/font-engine versions
every font/logo/image hash
locale, timezone and deterministic document metadata
canonical render-manifest hash
pre-sign PDF hash
signed-original PDF hash and signature evidence
```

Reporting evaluators need the same immutability law as deployed workflows: use versioned names such as `evaluate_fs_pack_v1`; never `CREATE OR REPLACE` a function already referenced by an artifact. A lint should reject mutation or deletion of referenced evaluator bodies.

Rendering should run in a dedicated Node worker on Fly, not in the Next.js dashboard or Cloudflare Pages. Pages requests a durable render job and displays the resulting artifact. The renderer should:

- Consume only the canonical manifest and persisted fact datasets.
- Run offline with network access disabled.
- Use content-addressed fonts, logos and images.
- Pin one OS/CPU architecture and an exact renderer image digest.
- Eliminate ambient `now()`, randomness, mutable URLs and system fonts.
- Derive creation metadata, document IDs and timestamps from the stored manifest.
- Deterministically embed/subset fonts and normalize PDF metadata/trailer identifiers.
- Archive the renderer image or reproducible build inputs, not merely its tag.
- Pass repeat-render CI tests asserting identical SHA-256 output.

If browser print-to-PDF is used, the entire browser, OS libraries and font stack must be pinned and archived. Given the byte-stability contract, I would prefer a declarative, programmatic PDF layout engine over printing a live webpage.

The durable artifact registry should retain both canonical pre-sign bytes and the issued signed original at content-addressed, non-overwritable storage keys. Storage update/delete grants remain absent, hashes are verified on read and restore, and both assets and registry rows participate in the seven-year backup/restore test.

One mechanical correction is essential: a digital signature or timestamp generally cannot be regenerated byte-for-byte years later. Therefore:

- Clara reproduces and hash-compares the exact pre-sign PDF.
- The signed PDF is the immutable retained original, retrieved rather than regenerated.
- A wet-signed scan is likewise an original evidence object, never a render target.

So “re-render the 2026 signed pack in 2033” should mean: retrieve the exact signed bytes, and independently reproduce the exact pre-sign bytes from the sealed manifest. Calling a newly signed reconstruction “the same signed document” would be false.

## 4. Risks, pushback and required guardrails

| Quiet corruption risk | Required guardrail |
|---|---|
| A “style” edit hides a statement, total, unit, period or note reference | Protected semantic slots cannot be overridden; semantic change converts the pack to `custom_cut` |
| Firm wording subtly changes statutory meaning | Only wording/locale catalog references in a claim-bearing pack; model-authored statutory narration forbidden |
| Arbitrary note reordering breaks structure or references | Profile-owned ordering constraints and deterministic cross-reference validation |
| Logo/cover text implies “audited” or “MPERS compliant” without authority | Claim-bearing phrases are protected policy placeholders driven only by the claim receipt |
| Fonts, bilingual expansion or long figures clip content | Worst-case fixture tests plus runtime overflow/orphan/truncation detection; clipping is never allowed, even in a custom cut |
| A chart tells a misleading story through axis or omitted categories | Named axis policies, disclosed filters, composition reconciliation, required “Other” where applicable and accessible source table |
| A chart recomputes values in JavaScript | Renderer accepts already-evaluated points only; transforms live in versioned metric algebra |
| LLM-produced prose repeats a figure incorrectly | Narrative AST with DB placeholders; reject model-authored numeric literals outside approved wording keys |
| A new MPERS profile silently changes old reports | Exact version binding; no “latest” lookup during rendering |
| A firm variant stays on an obsolete profile for a new period | Applicability check strips the claim until a new variant is explicitly published |
| Raw CSS/HTML/JS changes pagination or creates injection/network dependencies | Declarative components and style tokens only; no arbitrary executable template code |
| “Passed checks” is marketed as legal certification | Call it “presentation-profile checks passed” or equivalent approved wording; final issue remains a professional human act |
| Approval attaches to a mutable report | Human attestation binds the exact sealed artifact hash, not merely the report/template ID |

I would also insist on semantic and visual diffs whenever a firm publishes a new golden variant: the semantic diff must be empty for claim eligibility, while the visual diff shows exactly what branding/layout changed. Statutory issue should require a human checker on the exact artifact revision.

**Plain-language summary:** Your firm can absolutely have its own beautiful “golden” financial-statement design—logo, fonts, spacing, cover, approved bilingual wording and permitted note order—but Clara keeps the MPERS structure and verified wording locked underneath. If someone changes that protected content, Clara still produces the requested custom report but honestly removes the compliance claim. Charts work the same way: users choose what to show and how it looks, while every value is calculated from the database. For long-term records, Clara stores the exact data, template, software, fonts and PDF hashes used; in 2033 it can retrieve the original signed file and reproduce the exact pre-sign document without guessing or using today’s templates.
