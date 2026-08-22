# F-A5b — sandbox export: DESIGN v1

> **Design doc of record for Wave-F Track-A lane F-A5b "sandbox export"** — severed out of F-A5's
> v2 by the gate-2 width ruling and registered as its own lane by **R-L15, 2026-08-22**
> (`reporting-agency-gate-record.md:239-269`; `PROGRESS.md:128`). This lane builds **TA-P10 C′**;
> the severance is **sequencing, explicitly not a narrowing of the ruling** (`gate-record:254-261`).
>
> **Companions.** `sandbox-export-survey.md` — the estate at the bytes, findings **X1-X12**,
> censuses, predictions **P-1..P-6**, and the **UNVERIFIED register U1-U6** (load-bearing: two of
> this design's dependencies do not exist yet). `sandbox-export-annexes.md` — **A** surface ·
> **B** battery · **C** decisions · **D** predictions · **E** owner questions · **F** risks,
> non-goals, acceptance. Where a companion and this file disagree, **this file is the design of
> record and the companion is the bug.**
>
> **Binds under:** owner ruling **TA-P10 C′** (ADR-0074:229-246) with its rider, plus **TA-P4 A**
> (receipted reads), **TA-P1 C** + its rider (new authority is a wake SIBLING verb, never a live-body
> rewrite), **TA-P6 A** (the identity pair), **TA-P11 A** (the one-architecture test), **TA-P14 A**
> (minimal doors; done means the loop is walkable). Digest laws **1, 2, 22, 26, 27, 28, 31, 34, 36,
> 68, 71, 74, 75, 78-82**. Every build PR takes the uniform ADR-061 ladder; **§3.2, §3.3 and §3.7
> are judgement logic end to end** (review law 1), and **law 28's cross-model adversarial pass is a
> NAMED pre-merge obligation this lane's own severance imposed** (`gate-record:250-253`) — §3.9
> carries its brief. It is not a review option.
>
> **PREREQUISITES.** The owner's ratification of laws 78-81 is SATISFIED (2026-08-22). This lane's
> remaining prerequisites are **F-A5 PR-1 merged** (the `watermark_policy_versions` DDL — U1),
> **F-A5 PR-4 landed** (the renderer ceremony this lane's second entrance must follow, never
> collide with), and **the owner's `sandbox_watermark` signing** (§3.6, owner question 1) —
> **without which this lane ships DARK by design** (survey X12).

---

## 1 · The ruled shape (fixed, not designable)

1. **Sandbox outputs EXPORT freely** — the watermark **burned into the BYTES**, never a CSS layer,
   with an **export record** (TA-P10 C′ (1)).
2. **Cross-client export is ALLOWED when a mechanical check passes**: the recipient must cover
   **every `client_id` in the file** (TA-P10 C′ (2); F5-D14). A covered-recipient test, never the
   blanket ban, and never a caller-supplied client list.
3. **The watermark wording is a versioned row the owner signs once in three languages. Code carries
   no default string, and a missing row REFUSES the render** (TA-P10 C′ (3); E-R14; law 36).
4. **A free-query aggregate is NARRATIVE** — sayable, chartable, exportable, citable as a reasoning
   input with the query text — and **never** an authoritative number in a durable artifact: not a
   posting amount, not a formal report cell, not a knowledge-base fact (TA-P10 C′ (4); PRD §6).
5. **One geometry library, two entrances** (TA-P10's rider), watched under **TA-P11 A**'s test: *a
   shared deterministic core with one entrance per surface is ONE architecture; two mutually-unaware
   computations of the same fact are TWO.*
6. **New authority arrives as wake SIBLING verbs; no live human body becomes dual-lane** (TA-P1's
   rider). This lane CoRs **no** live body — see §6.
7. **The recipient register is a human act.** TA-P1 C's open register devolves acts it does not
   reserve, but a recipient's coverage is the *content of the wall itself*: an agent that could
   widen coverage could pass any check. §3.3 keeps it human and says why in the ruling's own terms.

---

## 2 · The estate findings that bind this design

**X1** the burn already exists (`layout.mjs:136`) · **X2** the sealed lane's literals and their home
· **X3** `render_jobs` cannot carry a sandbox render (two NOT NULLs and a closed kind; census C10
unmoved) · **X4** `report_artifacts` is single-client by construction (`0066:267`) · **X5** the
estate passes the hash IN (`0071:121-124`) and `_tf_append_only` really does block UPDATE
(`0003:490-491`, `0005:280-298`) · **X6** the lease-scoped payload read (`0081:152-153`) and E-R8
floor 1's `displayed_text` rule · **X7** `claim_policy_versions`' curated shape **and its
key-closing CHECK** (`0066:66-85`) · **X8** the schema has **no recipient concept** and
`firm_memberships` is one-active-per-user (`0002:221-222`) · **X9** export is not TA-P3's egress
regime · **X10** the narrative-authority wall lands in F-A5 · **X11** the sandbox is the first path
putting **model-composed text** in front of the typesetter · **X12** the fail-closed default leaves
this lane dark until one signing.

---

## 3 · The design

### 3.1 What `p_view` is — the defect-1 answer, in two relations

The gate's first defect was that `p_view` had *"no table, shape, owner or lifecycle"*
(`gate-record:211-213`). It gets all four.

```
clara.sandbox_views      IMMUTABLE (append-only + no-truncate, the 0005:280-298 idiom).
                         The thing that is exported. firm_id · authority (frozen 'narrative') ·
                         body jsonb (typed blocks; every figure a displayed_text STRING — E-R8
                         floor 1, X6) · body_sha256 (computed by the DB from canonical json,
                         never supplied) · client_set uuid[] (DERIVED — §3.2) ·
                         client_set_basis text (how it was derived: 'exact' | 'firm_closure') ·
                         basis jsonb (the freeform_read_log ids and/or preview cell ids) ·
                         acting_actor + on_behalf_of (TA-P6's pair) · model_snapshot · created_at.

clara.sandbox_exports    REQUEST + LIFECYCLE + COMPLETION in one row, with a LIFECYCLE WALL
                         freezing the request half — the render_jobs idiom, quoted at 0079:136-140.
                         FROZEN: sandbox_view_id · recipient_id · coverage_proof jsonb ·
                         watermark_policy_version_id · locale · requested_by · on_behalf_of ·
                         op_key. MOVING: state ('claimable'|'running'|'done'|'failed') · attempts ·
                         claimed_by · claimed_at · lease_expires_at · last_error.
                         SET ONCE at completion: artifact_sha256 · byte_size · storage_key.
```

**Why two relations and not one.** Defect 2 was an append-only row being completed in place
(`gate-record:213-215`). The estate's answer is not "make it mutable" but the split it already
ships: the **immutable** thing (what was computed) and the **lifecycle** thing (what happened when
we tried to hand it out). `sandbox_views` is append-only because its `body_sha256` is what makes an
export byte-reproducible; `sandbox_exports` moves through states because a render can fail and be
retried, and the frozen half is frozen by a wall, not by a promise.

**Why not three** (a separate content-addressed artifact row mirroring `report_artifacts`):
considered and **refused**. `report_artifacts`' extra machinery — the linear-chain unique index, the
prior-artifact FK, the claim-assessment FK, the one-per-run partials — all exist to serve the seal
chain, which the sandbox is **structurally unreachable from** (law 74). A fourth relation buying
none of it is weight. `storage_key` is content-addressed on the same `firms/<firm>/…/<sha>.pdf`
shape as `ck_ra_content_addressed` (`0066:290-291`) under its own prefix, so the property survives
without the table.

**The view is minted where the figure is produced, not where the export is asked for** — but v1
mints it on the export path only, because the on-screen half is F-A5/Wave-G. **The seam is stated
so the screen half can close the gap for free** (the SST-02 idiom, `reporting-agency-design.md:398`):
if the screen renders from `sandbox_views.body`, screen and file share one source and the
divergence disappears. **Until it does, v1 does not structurally prevent a screen/file divergence**
— registered as R-1, priced in owner question 6.

### 3.2 The client set — the defect-3 answer, and the one place this design is opinionated

Defect 3 was a coverage check *"blind to the narrative half of its own export"*, because
`clara.freeform_read_log` has **no `client_id` column at all** (`0002:308-315`), so *"a client
entering through an aggregate is structurally unrecoverable from the table the check would read"*
(`gate-record:215-219`).

The fix is not to make the derivation cleverer. It is to make it **fail-closed on the unknown**
(law 36; review law 2 — *absence is not evidence*). `client_set` is derived at mint from the view's
`basis`, one rule per basis kind, and the derivation is a **pure function of durable rows** (P-3):

| basis kind | what the client set is | ground |
|---|---|---|
| a **preview cell** (`report_datasets` / preview cells) | the cell's own `client_id` — **exact** | the cells carry it |
| a **client-pinned** free read (`freeform_read_log.scope='client'`) | `client_scope` — **exact** | F-A6 v1's hardened receipt (survey U2) |
| a **cross-client named** free read (`scope='cross_client'`) | the receipt's named client set — **exact** | **F-A6 v2's verb is what makes this row exist** (§6) |
| a **HOME / firm-wide** free read (`scope='firm'`) | **every client of the firm** — `client_set_basis='firm_closure'` | the read *could* have touched any of them; the log cannot say which, and a derivation is not evidence |
| **no basis rows at all** | **REFUSE the mint** (`sandbox_view_basis_absent`) | an unresolved set is the unknown, not the empty |

**The consequence is the design, stated plainly:** *a chart computed from a HOME free read can only
be exported to a recipient who covers the whole firm's client roster* — in practice, a firm member.
Anyone wanting to hand a group owner a three-company comparison must compute it from **named**
reads. That is not a limitation bolted on; it is TA-P10 C′ (2)'s own coverage test applied honestly
to a log that cannot name its clients, and **it converts F-A6 v2's named client list from a
convenience into the mechanism that makes tight cross-client exports possible at all** (§6).

**Nothing about the set is caller-supplied.** `wake_mint_sandbox_view` takes a `basis`, not a client
list; the DB computes the set. F5-D14's *"computed from the cells' own rows, never from a
caller-supplied list"* is satisfied at the mint, one step earlier than v1 tried to satisfy it.

**`client_set` is frozen with the row** (append-only), so an export's coverage proof is
reproducible years later even if the firm's roster has since changed. A firm that adds a client does
not retroactively widen an old `firm_closure` view — the set is what it was.

### 3.3 The recipient — OQ-3's model, minted because the schema has none (X8)

```
clara.export_recipients   firm-scoped, immutable + supersede (the claim_policy_versions habit,
                          0066:66-85, minus the curated firm_id-is-null wall — this IS firm data).
  kind text check (kind in ('firm_member','external'))
  user_id   uuid   -- NOT NULL iff kind='firm_member'; composite FK into the firm's memberships
  display_name text not null check (btrim(...) <> '')      -- who the person is
  basis        text not null check (btrim(...) <> '')      -- WHY they cover these clients
  covered_clients uuid[]  -- NOT NULL iff kind='external'; cardinality >= 1; every element
                          -- validated at write against clara.clients of THIS firm
  registered_by uuid not null · registered_at · superseded_by uuid · superseded_at
```

**The coverage predicate**, computed at export request, recorded in `coverage_proof`:

- `kind='firm_member'` → covered iff the membership is `status='active'` in **this** firm at request
  time. Coverage over clients is then **total by construction** — a firm member already reads every
  client of his firm under RLS, so an export to him crosses no boundary. **Computed, never stored:**
  a stored roster copy goes stale the moment a client is added, and a stale copy is the class of bug
  §3.2 exists to avoid.
- `kind='external'` → covered iff `view.client_set ⊆ recipient.covered_clients`, both read as rows
  at request time. Uncovered ids are **named in the refusal** (`recipient_coverage_incomplete`) —
  safe, because the refusal is read by a firm member who may see all of them.

**Registering an external recipient is a HUMAN act, admin+ floor** (`clara.register_export_recipient`
/ `clara.supersede_export_recipient`, the `0002:518-520` audit_log floor idiom). Not because TA-P1 C
reserved it — it did not — but because **`covered_clients` IS the wall**: an agent that could write
coverage could satisfy any check, and law 78's open register devolves *acts*, not the authorship of
the guard that judges them. The agent's export verb takes `p_recipient uuid` and **nothing about
coverage**. Recorded as a decision with its ground, and put to the owner as question 2 (he rules
toward maximum autonomy and may want `firm_member` self-registration devolved; the design's
fail-closed default is human for both kinds).

**Superseded and removed recipients refuse** (`export_recipient_superseded`,
`export_recipient_membership_inactive`) — three-valued, never two: absent → refuse, superseded →
refuse, inactive → refuse. A coverage change is a **new row**, so an old export's `coverage_proof`
still points at the row that actually justified it.

### 3.4 The verbs — sibling wake verbs, one human register, one human read

| group | verb | posture |
|---|---|---|
| mint | `clara.wake_mint_sandbox_view(p_body, p_basis, p_rationale, p_model, p_op_key)` | wake wrapper → ungranted core; derives `client_set` (§3.2), stamps `authority='narrative'`, computes `body_sha256` |
| export | `clara.wake_request_sandbox_export(p_view, p_recipient, p_locale, p_rationale, p_model, p_op_key)` | the coverage check (§3.3) **and** the watermark-row presence check (§3.6) run here, **before** a job exists |
| worker | `clara.sandbox_export_payload(p_export, p_worker)` | `stable security definer`, **lease-scoped exactly as `0081:152-168`** — a worker with no live lease reads nothing |
| worker | `clara.complete_sandbox_export(p_export, p_worker, p_sha256, p_byte_size, p_storage_key)` | **the hash comes IN** (X5); set-once arms; `clara_runtime` only |
| worker | `clara.fail_sandbox_export(p_export, p_worker, p_error)` | attempts/backoff; terminal failure is answered through the audited door, the `0080:280-292` rule |
| human | `clara.register_export_recipient(…)` · `clara.supersede_export_recipient(…)` | admin+ floor (§3.3) |
| human | `clara.list_sandbox_exports(p_client uuid default null, p_limit int default 100)` | bookkeeper+ floor, the `0002:518-520` idiom — TA-P14's minimal door |
| read | `clara.wake_sandbox_export_state(p_export)` | `stable` definer reader, its own receipt row (TA-P4 A) |

Every wake wrapper is `SECURITY DEFINER`, `search_path=clara, pg_temp`, resolves
`clara.wake_context()` (`0011:1133` — which re-validates the director's standing at every call, law
69), asserts `clara.assert_wake_allowed(w.wake_kind, '<name>')`, refuses a blank `p_op_key`, refuses
a blank `p_rationale` or an incomplete `p_model`, and delegates to an **ungranted** core.
**No wrapper body carries DML text** — F-A5's C1-at-four-by-construction rule (`0077:23-29`),
inherited. Allowlist rows are `('interactive', …)` and, once F-A2's D34 limb merges,
`('interactive_client', …)`; **never a `'proactive'` row** (law 71's proactive-says-nothing posture)
and never an unattended kind — an export is a deliberate act with a named recipient.

### 3.5 The second render entrance — one geometry library, and a census that proves it

The sandbox does **not** enter `render_jobs` (X3, census C10). It gets a sibling job family keyed on
`sandbox_exports` and served by **the same worker binary, the same Typst pipeline and the same
`chart.mjs` geometry**. `layout.mjs` gains a sibling entry `layoutSandbox(view, decision)` beside
the sealed `layout()`.

**TA-P11 A's test is discharged mechanically, not by assertion.** Two censuses, both directions:

- **G-1 · every geometry export is shared.** Every function exported by `chart.mjs` is reachable
  from **both** entrances or from **neither**. An entrance-local geometry function fails the census
  — that is the "two mutually-unaware computations of the same fact" the test forbids, and N3's
  three new chart kinds (`lineGeometry` / `areaGeometry` / `stackedBarGeometry`,
  `reporting-agency-design.md:377-380`) are exactly where it would happen.
- **G-2 · the sandbox mints no `render_jobs` row.** A prosrc census over the sandbox path plus a
  behavioural cell: the sandbox verbs, called end to end, leave `render_jobs` empty.

**An unknown chart kind REFUSES** (`chart_kind_unknown`) on the sandbox entrance too — no fallback
to bars. F-A5 minted that rule for the sealed lane on the ground that *"the fallback is how S6
stayed invisible"* (`reporting-agency-design.md:380-381`); a second entrance that fell back would
re-open it on the other side.

**Ceremony discipline.** A sandbox entrance is a renderer change: a fresh image digest, the
pre-change digest pullable for seven years, run as a ceremony from merged `main`. **It lands AFTER
F-A5 PR-4** so two renderer ceremonies do not contend (§6).

### 3.6 The watermark — the rows, the refusal, and what the bytes must prove

**Rows only, no DDL** (R-L15's scope, `gate-record:262-267`). F-A5b inserts
`policy_key='sandbox_watermark'` rows into `clara.watermark_policy_versions` in three locales, as
migration data — never through a verb (census C6, survey §3).

**The presence check runs at request time, not at render time.** `wake_request_sandbox_export`
resolves the row for `(policy_key='sandbox_watermark', locale, effective window)` and raises
`watermark_policy_absent` when there is none, pinning the resolved `watermark_policy_version_id`
into the frozen half of the export row. Two reasons: a refusal a person can act on beats a job that
dies on a worker, and **pinning the version makes the render reproducible** — a later supersede does
not change what an old export's bytes said.

**What the renderer does with it.** `layoutSandbox` emits the page background exactly as
`layout.mjs:136` does, with the string taken from the pinned row and **never from a literal**. There
is no `watermarkText()` fallback on this entrance and no `decision.watermark` branch — the sandbox
watermark is **unconditional**, because a sandbox artifact that is not watermarked is
indistinguishable from a sealed one.

**The proof is in the bytes, and it is a POSITIVE control.** Acceptance extracts text from the
produced PDF (the estate already scans extracted PDF text for claim phrases — `0066:87-88`) and
asserts the watermark string is present **on every page**, not once per document. Its differential
twin: with the policy row absent the request **refuses and no bytes exist** — never unwatermarked
bytes. A cell that only observed "the string is there" would have a meaningless YES.

**The wording is the owner's** (OQ-1/OQ-2, moved here). The default that stands is *no row seeded*
(`gate-record:260-261`) — which for this lane means **the export path ships dark** (X12). Annex E
question 1 carries a **draft** trio in the register of `0067:142-148`'s claim labels; the migration
seeds only what the owner returns.

### 3.7 The narrative-authority wall at the export boundary

F-A5 PR-1 builds the wall (X10). This lane's contribution is that **exporting does not launder
authority**:

- `sandbox_views.authority` is frozen `'narrative'`; the row carries **no `definition_version_id`
  and no `cell_id`** — there is no column for one, so the refusal is structural, not a check.
- **Differential cells, not self-referential ones**: a posting's provenance, a `client_facts` row
  and a report cell each handed a `sandbox_view_id` or a `sandbox_exports.id` REFUSE
  (`sandbox_authority_refused`); the same three writers handed a legitimate basis SUCCEED. One arm
  alone proves nothing.
- The residual is inherited and restated, not re-discovered: `client_facts.basis_kind` is a closed
  four-value CHECK (`0055:395-396`), so a **human** can still mislabel an aggregate under
  `owner_instruction` — detectable in the receipt, never a door the model can open (F-A6 R-8).
- **The export record is not a fact.** `sandbox_exports` is an audit artifact; nothing in the
  posting, reporting or knowledge layers may cite it as a basis, and G-3 censuses that by name list
  in both directions.

### 3.8 The minimal human doors (TA-P14 (2))

Crude is fine; absent is not. `/reports` gains a **sandbox exports** panel: a list (view, recipient,
client set, watermark version, state, sha256, when, by whom), the **recipient register** form
(register / supersede, admin+), and the refusal reasons rendered as text a bookkeeper can act on —
`recipient_coverage_incomplete` must name the uncovered clients, `watermark_policy_absent` must say
*"the owner has not signed the sandbox watermark"* rather than a token. Wave-G restyles them in
place; it does not replace the verb (`frontend-handoff-2026-08-23.md` §0's rule).

### 3.9 Law 28's cross-model adversarial pass — the brief this lane's severance imposed

Mandatory at PR-0, before PR-1 merges (`gate-record:250-253`). The brief is **the export surface
specifically**, and X11 says where its centre is: this is the **first path that puts model-composed
text in front of the typesetter**. Given a hostile `p_body` — labels, titles, prose — can it:

1. **Escape `typstString()` and reach `#page(...)`, producing an UNWATERMARKED export?** The headline
   attack. The positive control in §3.6 is the detector; the pass must try to defeat it.
2. **Widen the client set** — a basis crafted so `client_set` derives narrower than what the body
   actually shows, letting a narrower recipient pass coverage.
3. **Forge or re-target an export record** — reach `complete_sandbox_export` with another export's
   id, or re-run a completed one.
4. **Exfiltrate through a label** — carry a sibling client's data into a chart label the recipient
   is not covered for.
5. **Launder authority** — get a `sandbox_view_id` accepted as a basis by a posting, a fact or a
   report cell.
6. **Bypass the recipient register** — pass `p_recipient` a row of another firm, a superseded row,
   or a `firm_member` row whose membership has been removed.

Findings fold into v2 of this design; the pass runs on a lane independent of the author's
(review law 1 is the floor, not the ceiling).

---

## 4 · Walls, censuses and gates that move

**C10 stays closed and is re-proven positively** (G-2). **C6's name list gains
`watermark_policy_versions` — an F-A5 PR-1 obligation this lane depends on** (survey §3); if F-A5
lands without it, F-A5b adds it and says so rather than inheriting an uncovered table.
**The wake grant roster** gains this lane's wrappers, asserted by NAME LIST in both directions
(F5-D30's rule: a roster that can only find extras cannot find omissions). **The relation/table
census** moves by three (`sandbox_views`, `sandbox_exports`, `export_recipients`) — counted from the
migration's printed line, never from an annex. **G-1** is new and is the TA-P11 watch made
mechanical. **The RLS forced-relation census** gains three: all three are firm-scoped and
FORCE RLS, with no `clara_agent_ro` table grant anywhere (F-A5's C4/C5 posture, inherited).

---

## 5 · Judgement logic (review law 1)

**§3.2** (what the client set IS), **§3.3** (whether a recipient covers it) and **§3.7** (whether a
citation is authoritative) each decide *whether something is allowed* — judgement logic end to end,
each taking an independent review pass. §3.6's presence check is judgement logic too: it decides
whether a render may happen at all. **Law 28's pass (§3.9) is separate and additional.**

Three-valued throughout, fail-closed on the missing, the malformed and the unknown: an unresolvable
client set refuses the mint; an absent, superseded or inactive recipient refuses the request; an
absent watermark row refuses the request. **No rung's own evaluation may raise out of the ladder.**

---

## 6 · The train, and what this lane waits on

**PR-0** (this design + the law-28 pass) → **PR-1** (DB: three relations, the verbs, the coverage
check, the derivation, the allowlist rows, the censuses, the `sandbox_watermark` rows **if signed**)
→ **PR-2** (grants + census) → **PR-3** (renderer: the second entrance, the byte-burn, G-1/G-2 —
**a ceremony**) → **PR-4** (human doors + acceptance on real books).

| dependency | why | if it slips |
|---|---|---|
| **F-A5 PR-1** — `watermark_policy_versions` DDL | this lane adds ROWS to a table it does not own (U1). **If the payload's key set is CHECK-closed, this lane needs a CHECK EXTENSION on a shared surface** — routed to the `conductor` lane before authoring, never assumed | PR-1 blocks |
| **F-A5 PR-4** — the sealed lane's renderer ceremony | two renderer ceremonies must not contend; F-A5's drill closes DR-render's unrun boundary first | PR-3 waits |
| **F-A6 PR-1** — `freeform_read_log`'s hardened `scope`/`client_scope` | §3.2's derivation reads them (U2) | the free-read basis kinds are unavailable; preview-cell bases still work |
| **F-A6 v2** — the cross-client named read | **the only source of an EXACT client set for a multi-client narrative basis** (§3.2). Without it every such view derives `firm_closure` and only a firm-covering recipient may receive it | the capability is narrower, not wrong; stated, not hidden |
| **F-A2 PR-1** — `interactive_client` (D34) | a client-pinned sandbox session's allowlist row | `('interactive', …)` rows only; HOME-scoped sandbox works |
| **the owner's signing** | X12 | **the lane ships dark** |

**No D1 write-quiesce window and no train claim.** This lane CoRs no live body: `layout.mjs` gains a
sibling entry rather than a rewrite, and every DB object is new. Whether PR-1 rides another item's
ceremony train is the lead's call, not this design's (the D29 precedent).

---

## 7 · Non-goals, stated so they are not inferred

**Not built here:** the sandbox's **on-screen** half (F-A5 / Wave-G — §3.1 states the seam) · any
change to the seal chain, `report_artifacts`, `render_jobs` or the claim path · SST-02 · a
client-facing portal or any delivery mechanism (this lane produces a file and a record; **who sends
it and how is out of scope**, and owner question 4 asks whether that stays true) · any widening of
`client_egress_purpose_consents` (X9) · e-filing, in any form.

**Explicitly NOT a narrowing of TA-P10 C′.** Every clause of the ruling is built: free export (§3.1,
§3.5), the byte-burn (§3.6), the export record (§3.1), cross-client behind a mechanical
covered-recipient check (§3.2, §3.3), the owner-signed three-language row whose absence refuses
(§3.6), and narrative-only aggregates (§3.7). **The one place the design is narrower than a naive
reading is §3.2's `firm_closure` rule** — a firm-wide free read produces a firm-wide client set — and
that is the ruling's own coverage test applied to a log that cannot name its clients, not a
restriction added on top. It is owner question 3.
