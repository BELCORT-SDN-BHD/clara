# F-A5b — sandbox export: the estate as found (SURVEY v1)

> **Survey of record for Wave-F Track-A lane F-A5b "sandbox export"** — the item severed out of
> F-A5's v2 by the gate-2 width ruling and **registered as its own lane by orchestrator ruling
> R-L15 (2026-08-22)**: `reporting-agency-gate-record.md:239-269`, `PROGRESS.md:128`.
> Companions: `sandbox-export-design.md` (the design of record) ·
> `sandbox-export-annexes.md` (**A** surface · **B** battery · **C** decisions · **D** predictions ·
> **E** owner questions · **F** risks, non-goals, acceptance).
>
> **What this lane owns, in the severance's own words** (`reporting-agency-gate-record.md:248-252`):
> `wake_export_sandbox_view` + `_sandbox_export_core`, `clara.sandbox_exports`, the
> recipient-coverage check, the second render entrance, the `sandbox_watermark` **rows**, and OQ-3.
> **`clara.watermark_policy_versions` DDL stays with F-A5 PR-1** (`:262-267`) — this lane adds ROWS,
> never DDL, to that table.
>
> **Method.** Every finding below was re-derived from migration and renderer text in this repo at
> `origin/main` c8e9b65 and carries the line the instrument printed. A claim that could not be
> settled from bytes is marked **UNVERIFIED** and appears in §5, never inline as an assertion.
> **Nothing in this lane has been rig-replayed** — no live body is read or CoR'd by the design, and
> the two tables it depends on (`clara.watermark_policy_versions`, `clara.freeform_read_log`'s
> hardened shape) **do not exist yet**. §5 is therefore load-bearing, not a footnote.

---

## 1 · What the severance handed this lane, and why

The F-A5 gate found the export path **unbuildable in the order it was written** — three defects,
quoted from `reporting-agency-gate-record.md:210-219`:

1. **`p_view` occurs exactly once in the whole four-file set with no table, shape, owner or
   lifecycle behind it.** The verb's own subject was undefined.
2. **The step order cannot execute.** v1's core recorded the content sha256 in step 3 and handed the
   render out in step 4, into a row the same sentence called append-only.
3. **The coverage check was blind to half its own export** — it derived the exported client set from
   preview cells alone, and `clara.freeform_read_log` has no `client_id` column at all.

R-L15 accepted the severance **as sequencing, explicitly not as a narrowing of TA-P10 C′**
(`gate-record:256-261`). So this survey's job is to find, at the bytes, what the three defects can
be built against — and it finds that **all three have a shipped estate idiom already**, which is
why the item is buildable now and was not buildable inside F-A5's gate.

**The ruling this lane serves** (ADR-0074 TA-P10 C′, `0074:229-246`): sandbox outputs export freely
with the **watermark burned into the BYTES** and an export record · **cross-client export is allowed
when a mechanical check passes — the recipient must cover every `client_id` in the file** ·
watermark wording is a **versioned row the owner signs once in three languages**, code carries no
default string and a **missing row refuses the render** · a free-query aggregate is **NARRATIVE**:
sayable, chartable, exportable, citable as a reasoning input — **never** an authoritative number in
a durable artifact. **Rider:** the sandbox render path is a SECOND entrance to rendering; it shares
one geometry library and is watched under TA-P11's test.

---

## 2 · Findings — the estate at the bytes

### X1 · The watermark is ALREADY burned into the bytes; nothing about the mechanism is new

`layout.mjs:136` emits the stamp as a Typst **page background**, not an overlay the reader can
strip:

```
, background: rotate(-30deg, text(60pt, fill: rgb("#00000014"), <string>)))
```

Typst compiles that into the PDF content stream, so TA-P10 C′ (1)'s "burned into the BYTES (not a
CSS layer)" is satisfied by the mechanism the sealed lane already ships. **What is missing is not
the burn — it is the string, its governance, and a second entrance that always applies it.**

### X2 · The three literals, and exactly where they live

`layout.mjs:178-186` is a two-function block: `watermarkText(d)` returns one of three English
strings (`:179` failed · `:180` `draft_watermarked` · `:181` the fallthrough), and
`uncertifiedText()` at `:183-185` returns the long uncertified sentence rendered in the box at
`layout.mjs:152`. **The cite is byte-accurate as a block range** and the F-A5 gate deliberately left
it alone (`reporting-agency-gate-record.md:295-300`). **These are the SEALED lane's literals.**
F-A5 PR-4 retires them into `watermark_policy_versions` under `policy_key='artifact_watermark'`.

**The sandbox has no literals to fall back to** — the entrance does not exist. So the "missing row
refuses the render" rule has a consequence the sealed lane does not have, recorded as X12.

### X3 · `render_jobs` cannot carry a sandbox render — two NOT NULL columns and a closed kind

`0079:100-141`: `client_id uuid not null` (`:103`), `report_run_id uuid not null` (`:104`),
`kind text not null check (kind in ('draft_watermarked','pre_sign'))` (`:105`).
`clara.enqueue_render_job` (`0080:254`) refuses any other kind (`:258-261`,
`render_kind_unknown`), refuses a run in `drafting` (`:270-274`, `dataset_not_sealed`), and takes a
`p_report_run_id` it looks up (`:265-269`).

A sandbox view has **no report run**, and a cross-client view has **no single client**. So the
sandbox cannot enter this lane without weakening two NOT NULLs and a closed-world CHECK.
**F-A5's survey census C10 already says so and calls it unmoved** (`reporting-agency-survey.md:373`:
*"zeta's render-kind closed world … unmoved — the sandbox never enters the render-job lane"*).
The second entrance is therefore a **sibling job family**, not a widened one.

### X4 · `report_artifacts` is single-client by construction

`0066:264-298`: `client_id uuid not null` (`:267`), a composite FK to
`report_runs(id, firm_id, client_id)`, a content-addressed `storage_key` CHECK
(`ck_ra_content_addressed`), `kind` closed to three values (`:269`), and
`ck_ra_kind_extension` binding kind to extension. **A cross-client export cannot be a
`report_artifacts` row** — it has nowhere to put its second client. The sandbox needs its own
artifact record, and X5 says what shape it must take.

### X5 · The estate's real order passes the hash IN — the fix for defect 2 is a signature, not a redesign

`clara._seal_report_artifact_core` (`0071:121-124`) takes
`p_sha256 text, p_byte_size bigint, p_manifest jsonb` as **arguments**. The worker renders, hashes
the bytes it produced, and the DB records what it is told — it never renders, never re-hashes, and
never updates a row it already wrote. That is the whole of defect 2's fix.

**And the append-only idiom really does block UPDATE**, as the gate said: `clara._tf_append_only` is
attached `before update or delete` (`0003:490-491` on `audit_log`; `0005:280-298` on `event_types`,
`domain_events` and the taxonomy pair). A row under that trigger cannot be completed in place.
So the export's REQUEST half and its COMPLETION half cannot live in one append-only row — the
estate's answer is `render_jobs`' own split: a **lifecycle** row whose request half is frozen by a
lifecycle wall (`0079:136-140` — *"Both columns are part of the REQUEST half of the row, so the
lifecycle wall below freezes them for free"*) and a **content-addressed** artifact row written once.

### X6 · `render_job_payload` is the lease-scoped read the second entrance must mirror

`0081:152-153`, `stable security definer`: the worker holds no SELECT on epsilon's tables and
**asks for the payload of a job it holds** — `state='running'`, `claimed_by = p_worker`,
`lease_expires_at >= now()`, else `CLR43 render_lease_not_held` (`0081:162-168`). The comment at
`0081:140-151` states the floor the sandbox must also honour: **cell values leave as
`displayed_text`, never as a number the renderer could re-format** (E-R8 floor 1).

### X7 · `claim_policy_versions` is the curated shape `watermark_policy_versions` copies

`0066:66-85`: `firm_id uuid references firms(id)` walled to NULL by
`ck_claim_policy_versions_curated` (`:84`) · `policy_key` · `version int check (version > 0)` ·
`locale text check (locale in ('en','ms','zh'))` · a jsonb payload · `effective_from`/`effective_to`
with `ck_cpv_window` · `source_note text not null check (btrim(source_note) <> '')` ·
`unique nulls not distinct (firm_id, policy_key, version, locale)` (`:77`) ·
`ck_cpv_four_ruled_states` (`:81-83`) closing the payload to exactly four keys.

**That last constraint is the one that matters to this lane.** `claim_policy_versions` closes its
payload's key set with a CHECK. If F-A5's `watermark_policy_versions` copies that habit and closes
its payload to the `artifact_watermark` key set, **F-A5b's rows will not fit** and this lane needs a
CHECK extension on a shared surface, not just an INSERT. UNVERIFIED — see §5 U1.

### X8 · There is NO recipient concept anywhere in the schema

A grep of all 102 migrations for `recipient` returns **zero rows**, and no `client_contacts`,
`client_users`, `portal` or `share` relation exists. F-A5's Annex G said as much
(`reporting-agency-annexes-2-record.md:172-176`) and this survey confirms it at the bytes.
**OQ-3 is therefore not a choice between existing models; it is a mint.**

The two identity substrates that DO exist:

- `clara.firm_memberships` (`0002:211-222`) — `role in ('viewer','bookkeeper','admin','owner')`,
  `status in ('active','removed')`, and **`uq_membership_active_user on (user_id) where status =
  'active'`** (`:221-222`): one active membership per user, **total**. A firm member is unambiguous.
- `clara.clients` — the roster, with the same-firm composite key `uq_clients_id_firm` (`0007:59`)
  every client-bearing FK in the estate uses.

**A firm member covers every client of his firm by construction** (RLS is firm-scoped), so coverage
is only a real question for a recipient who is *not* a firm member — which is exactly the group
owner TA-P10 C′ (2) named, and exactly the thing the schema cannot express today.

### X9 · Export is NOT the TA-P3 egress-consent regime, and must not be conflated with it

`clara.client_egress_purpose_consents` (`0020:149-177`) has
`purpose text not null check (purpose in ('wiki_synthesis'))` (`:153`) — a closed world F-A7a
extends. TA-P3 A governs **sending client data to a model provider for processing**
(`0074:74-86`). Handing a watermarked PDF to a named human is a different act with a different
gate (recipient coverage). **The two must not be merged**: widening the purpose CHECK to cover
export would put a human-recipient decision inside a provider-processing register, and every
downstream reader of that register would then be wrong about what a consent row means.

### X10 · The narrative-authority wall lands in F-A5, and this lane inherits it

F-A5 keeps the wall (`reporting-agency-design.md:320-325`,
`reporting-agency-gate-record.md:262-268`): a sandbox figure carries **no `definition_version_id`
and no `cell_id`**, `authority='narrative'` is stamped by whatever writes it, and the receipt
schema refuses a sandbox citation in any field typed as an authoritative basis
(`sandbox_authority_refused`). **The wall ships in F-A5 PR-1; what it guards arrives here.**
The residual F-A6 already registered applies unchanged: `client_facts.basis_kind` is a closed
four-value CHECK (`0055:395-396`), so a **human** can still mislabel an aggregate under
`owner_instruction` — detectable in the receipt, never a door the model can open
(`freeform-read-design.md:368-371`, R-8).

### X11 · The sandbox is the first path that puts MODEL-COMPOSED text in front of the typesetter

In the sealed lane every string the renderer typesets comes from a **governed** source: cell values
arrive as DB-computed `displayed_text` (X6), layout blocks come from published
`report_template_versions`, and the claim labels come from `claim_policy_versions`. `layout.mjs`
defends the boundary with `typstString()` and `typstIdentifier()` — and it **refuses rather than
sanitises** (`layout.mjs:165-166`: *"refuse what is not a plain identifier rather than sanitise it,
because a sanitiser invites an argument about what was stripped"*), on the stated ground that
*"DB text never becomes markup"* (`:164`).

A sandbox view's prose, chart titles and series labels are **composed per call by the model**. That
is a new injection surface, and it is the reason this item carries its own law-28 cross-model pass
rather than riding F-A5's (`gate-record:250-253`). **The attack that matters is not "read another
firm's data" — it is "emit Typst that removes the page background", i.e. an unwatermarked export.**

### X12 · The fail-closed default leaves this lane DARK until one signing

R-L15's default stands: *"no row seeded, the literals stay, R-N1 registered"*
(`gate-record:260-261`). For the **sealed** lane that default is cheap — `layout.mjs:178-186` keeps
rendering English stamps. For the **sandbox** it is not: there is no literal to fall back to, and
TA-P10 C′ (3) says a missing row **refuses the render**. So under the standing default **F-A5b
cannot export anything at all** until the owner signs the `sandbox_watermark` trio.

That is not an argument for a code default — a code default is exactly what TA-P10 C′ (3) forbids
(`0074:236-237`; `0066:64`'s own rule). It is the honest price of the ruling, and it is why the
design's first owner question is the signing and why OQ-2's "one sitting, two keys" recommendation
(`reporting-agency-annexes-2-record.md:165-170`) is worth more to this lane than to F-A5.

---

## 3 · Censuses this lane moves

| census | today | after F-A5b | why it must be re-derived, not asserted |
|---|---|---|---|
| C10 (zeta render-kind closed world, `0080:258-261`) | `('draft_watermarked','pre_sign')`, *"the sandbox never enters the render-job lane"* (`reporting-agency-survey.md:373`) | **UNCHANGED** — and that is now a positive claim, not an absence | the sibling job family is the reason it stays closed; a cell must prove the sandbox path cannot mint a `render_jobs` row |
| C6 (no granted function writes a curated reference table, `tests/epsilon-grants-phase.mjs:133-142`) | holds; watermark rows are **seeded by migration, never by a verb** (`reporting-agency-survey.md:369`) | **HOLDS, and binds this lane** | `sandbox_watermark` rows are migration data. **The census is a NAME LIST inside a prosrc regex** (`:139` enumerates eight curated tables) — `watermark_policy_versions` is not in it today, so F-A5 PR-1 must add it or the census silently does not cover the table this lane writes rows to (**an F-A5 obligation this lane depends on**). `export_recipients` is deliberately NOT curated data — it is firm-scoped operational data with a human writer, and a cell must show the census does not catch it |
| the wake grant roster (F-A5 C.2, name-list in both directions, F5-D30) | 18 granted verbs when F-A5 is done (`reporting-agency-gate-record.md:195`) | **+ this lane's verbs** | the same both-directions rule: a catalog verb the annex does not name fails, and an annex verb the catalog lacks fails too |
| the relation count / table census (C3 family) | moves | **moves by this lane's new relations** | counted from the migration's printed line, never from the annex |

---

## 4 · Predictions — unsettleable from text, the rig must confirm

| # | prediction | how it is settled |
|---|---|---|
| **P-1** | Typst renders the sandbox page background into the PDF content stream such that a text extraction of the produced bytes finds the watermark string **on every page** | render a two-page sandbox export on the rig image and extract; assert per-page, not per-document |
| **P-2** | `typstString()` escaping holds against a hostile model-composed label — no label can close the `text(...)` call or reach `#page(...)` | the law-28 pass composes the payloads; the cell asserts the extracted watermark still present |
| **P-3** | The coverage check's client-set derivation returns the same set on replay from the same view row (it is a pure function of durable rows) | derive twice, compare; and derive after an unrelated client is added to the firm |
| **P-4** | A `sandbox_exports` lifecycle wall freezes the request half without blocking the state machine (the `0079:136-140` idiom transplants) | forced cell per frozen column; forced cell per moving column |
| **P-5** | The sibling job family's leader/dispatch path can share zeta's worker without a second Fly app | measured at PR-3 on the rig image; if it cannot, the cost is a second machine and it is priced, not absorbed |
| **P-6** | `watermark_policy_versions` (F-A5 PR-1) admits a `sandbox_watermark` payload without a CHECK extension | **cannot be predicted from text — the table does not exist.** See U1 |

---

## 5 · The UNVERIFIED register — what this survey could NOT settle

**U1 · `clara.watermark_policy_versions` does not exist.** F-A5 §3.6.1
(`reporting-agency-design.md:328-338`) describes it as *"same curated shape … immutable +
supersede"* and says the sandbox key *"is defined by the same table and seeded by the severed item
— built once, here, so the severed item adds rows, not DDL."* **It does not state whether the
payload's key set is CHECK-closed** (X7's hazard). Until F-A5 PR-1 lands, F-A5b's "rows only" scope
is an assumption. **Treated as a shared-surface dependency, not a fact** — the design routes it to
the conductor and prices the extension.

**U2 · `clara.freeform_read_log`'s hardened shape does not exist.** F-A6 v1's Annex C adds
`scope text not null check (scope in ('client','firm'))` and `client_scope uuid`
(`freeform-read-annexes-1-mechanics.md`, Annex C). Today the table is `0002:308-315` — six columns,
**every one nullable except `at`**, and no client column of any kind. The design's client-set
derivation reads the hardened columns; it is written against F-A6's design, not against a live
table.

**U3 · No rig replay was run for this lane.** No live body is CoR'd by this design and no migration
is authored by this pass, so there was nothing to re-derive by `pg_get_functiondef`. **The first
build PR must replay** `_seal_report_artifact_core`, `render_job_payload` and `enqueue_render_job`
at the frontier before depending on their shapes, because migration text is not a live body.

**U4 · The owner's `sandbox_watermark` wording does not exist** (X12). The design offers a *draft*
in the register of `0067:142-148`'s claim labels; the migration seeds only what the owner returns.

**U5 · Whether a sandbox render can share zeta's worker binary and Fly app** is P-5, and the
`packages/reporting-render` deploy story (`Dockerfile`, `fly.toml`) was read for structure only,
not exercised.

**U6 · The 2026-08-23 owner confirmation on the F-A6 severance** (relevant here only because it
bounds when F-A5b's cross-client precision arrives — see the design's §6 dependency list) is
recorded in this lane's work order but **is not in `PROGRESS.md`, `docs/adr/README.md` or ADR-0074
as of c8e9b65**. Flagged as a docs-truing item, not relied on.
