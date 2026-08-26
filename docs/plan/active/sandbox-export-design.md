# F-A5b — sandbox export: DESIGN v2 (gate-folded 2026-08-23)

> **v2 is the PR-0 gate fold** (`sandbox-export-gate-record.md`, gate ran 2026-08-23: five lenses,
> refute-style verification per finding — **4 blockers · 6 materials · 1 nit confirmed, 5 refuted**).
> Eight of the ten confirmed findings are folded here; **two are OWNER CARDS and stay OPEN** — the
> model-typed `displayed_text` figure against PRD §6 invariant 1 (§7 card 1) and Q4's client-level
> export authority (card 2, Annex E Q4). Neither may be closed by a build.
>
> **STILL OWED before PR-1 merges: law 28's cross-model adversarial pass (§3.9, brief at Annex G).**
> This fold does not discharge it — the pass never ran against v1, and §3.1/§3.2/§3.6/§3.7 all moved
> here, so it runs against **v2**. A NAMED pre-merge obligation the severance imposed
> (`reporting-agency-gate-record.md:250-253`), not a review preference.
>
> **Design doc of record for Wave-F Track-A lane F-A5b "sandbox export"** — severed out of F-A5's
> v2 by the gate-2 width ruling and registered as its own lane by **R-L15, 2026-08-22**
> (`reporting-agency-gate-record.md:239-269`; `PROGRESS.md:128`). This lane builds **TA-P10 C′**;
> the severance is **sequencing, explicitly not a narrowing of the ruling** (`gate-record:254-261`).
>
> **Companions.** `sandbox-export-survey.md` — the estate at the bytes, findings **X1-X12**,
> censuses, predictions **P-1..P-6**, and the **UNVERIFIED register U1-U6** (load-bearing: two of
> this design's dependencies do not exist yet). `sandbox-export-annexes.md` — **A** surface ·
> **B** battery · **C** decisions · **D** predictions · **E** owner questions · **F** risks,
> non-goals, acceptance · **G** law 28's brief · **H** censuses · **I** the render entrance ·
> **J** the human doors · **K** dependencies *(G-K moved there at the fold)*. Where a companion and
> this file disagree, **this file is the design of record and the companion is the bug.**
>
> **Binds under:** owner ruling **TA-P10 C′** (ADR-0074:229-246) with its rider, plus **TA-P4 A**
> (receipted reads), **TA-P1 C** + its rider (new authority is a wake SIBLING verb, never a live-body
> rewrite), **TA-P6 A** (the identity pair), **TA-P11 A** (the one-architecture test), **TA-P14 A**
> (minimal doors; done means the loop is walkable). Digest laws **1, 2, 22, 26, 27, 28, 31, 34, 36,
> 68, 71, 74, 75, 78-82**. Every build PR takes the uniform ADR-061 ladder; **§3.1, §3.2, §3.3, §3.6
> and §3.7 are judgement logic end to end** (review law 1 — §5 is the list, widened at the fold), and
> **law 28's cross-model adversarial pass is a NAMED pre-merge obligation this lane's own severance
> imposed** (`gate-record:250-253`) — §3.9 and Annex G carry its brief. It is not a review option.
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

**NOT in this list — the fold moved it out (gate M9).** v1 carried *"the recipient register is a
human act"* as a seventh item here, the only one with no ADR-0074 clause behind it. It is **not
ruled**: TA-P1 C devolves every act law 71 does not explicitly reserve, and the ratified text is
emphatic that **"adding a reservation is an owner ruling"** (`0074:339`). An admin+ floor on
`register_export_recipient` is this design's **fail-closed DEFAULT pending Annex E question 2** —
argued at §3.3, not settled. The closest analogue in this same wave went the other way:
`clara.wake_add_bank_account` (`bank-agency-annexes-1-mechanics.md:53`) is an agent-reachable wake
verb behind a mechanical check. **A builder must not read §3.3's default as a ruled reservation**;
§3.3 prices devolving the `firm_member` kind, so Q2 stays a question rather than a rebuild.

---

## 2 · The estate findings that bind this design

**X1-X12 live in `sandbox-export-survey.md` §2 and are not restated here** (the fold retired the
duplicate: a second copy of a finding is a second thing to keep true). The four this design leans on
hardest: **X6** E-R8 floor 1's `displayed_text` rule — see owner card 1 · **X8** the schema has **no
recipient concept**, so §3.3 is a mint · **X10** the narrative-authority wall lands in F-A5 **scoped
to the receipt schema** (§3.7) · **X11** model-composed text in front of the typesetter (Annex G).

---

## 3 · The design

### 3.1 What `p_view` is — the defect-1 answer, in two relations

The gate's first defect was that `p_view` had *"no table, shape, owner or lifecycle"*
(`gate-record:211-213`). It gets all four.

```
clara.sandbox_views      IMMUTABLE (append-only + no-truncate, the 0005:280-298 idiom).
                         The thing that is exported. firm_id uuid NOT NULL references clara.firms ·
                         authority (frozen 'narrative') ·
                         body jsonb (typed blocks; every figure a displayed_text STRING — E-R8
                         floor 1, X6; every block carries basis_ref — below) ·
                         body_sha256 (computed by the DB from canonical json,
                         never supplied) · client_set uuid[] (DERIVED — §3.2) ·
                         client_set_basis text (how it was derived: 'exact' | 'firm_closure') ·
                         basis jsonb (the freeform_read_log ids and/or preview cell ids, each
                         under a caller-chosen label a block's basis_ref names) ·
                         acting_actor + on_behalf_of (TA-P6's pair) · model_snapshot · created_at.

clara.sandbox_exports    REQUEST + LIFECYCLE + COMPLETION in one row, with a LIFECYCLE WALL
                         freezing the request half — the render_jobs idiom, quoted at 0079:136-140.
                         FROZEN: firm_id uuid NOT NULL references clara.firms · sandbox_view_id ·
                         recipient_id · coverage_proof jsonb ·
                         watermark_policy_version_id · locale · requested_by · on_behalf_of ·
                         op_key. MOVING: state ('claimable'|'running'|'done'|'failed') · attempts ·
                         claimed_by · claimed_at · lease_expires_at · last_error.
                         SET ONCE at completion: artifact_sha256 · byte_size · storage_key.
```

**`firm_id` is named, NOT NULL, in all three sketches** (the third is §3.3's) — the estate's shape for
every firm-scoped relation (`0079:102`, `0066:191`), written in the sketch rather than left to prose,
because the one counter-example this lane depends on is `freeform_read_log`'s nullable `firm_id`
(`0002:310`), a hole a `firm_id = jwt_firm()` policy hides in both directions.

**Every body block carries `basis_ref`, and a block that does not REFUSES the mint** (gate B0). This
design's first cut made `p_body` and `p_basis` two independent arguments, so `client_set` derived from
*the rows the caller pointed at* rather than *what the file shows*: a body comparing clients A and B,
minted citing only A's read, derives `{A}` and passes a recipient covering only A. TA-P10 C′ (2) says
*"every `client_id` in the file"*, and `freeform_read_log` records no result rows, so nothing
downstream recovers the difference. The wall is at the mint:

- `basis` is a **labelled map**, not a bare list: each element is `{ label, kind, id }`.
- Every typed block of `body` carries `basis_ref` — **a label, never a client id.** F5-D14's *"never
  from a caller-supplied list"* is preserved exactly: the model supplies a POINTER, and the DB derives
  the clients from the durable row it resolves to (§3.2).
- A block with no `basis_ref` refuses (`sandbox_view_block_basis_absent`); a `basis_ref` naming no
  label of this view's own `basis` refuses (`sandbox_view_block_basis_unknown`). **Closed-world both
  ways** — the declared basis can never be narrower than what the body draws on, so omitting a pointer
  refuses instead of silently narrowing the set.
- `coverage_proof` records `body_sha256` beside the derived set, so the proof names **the exact body
  it covered**, and the bytes typeset are the bytes checked (the payload reads the pinned view).

**What this closes, and what it does NOT** — said because a wall that overclaims is worse than none.
It closes the *omitted-basis* channel: **no block can be minted at all without pointing at a cited
read**, so a caller can no longer narrow the set by leaving a read out of `p_basis` — the set is
computed over what the body actually points at, and dropping the pointer refuses. It does **not**
verify that a block's CONTENT came from the read it points at: the model still types the numeral into
`displayed_text`, so a block cited to A's read can carry a figure read elsewhere or invented. **A
pointer cannot fix a transcription**, and that residual is **owner card 1** (§7).

**Why two relations and not one.** Defect 2 was an append-only row completed in place
(`gate-record:213-215`); the estate's answer is the split it already ships — the **immutable** thing
(append-only because `body_sha256` is what makes an export reproducible) and the **lifecycle** thing
(a render can fail and be retried), whose frozen half is frozen by a wall, not by a promise. **Why
not three** (a content-addressed artifact row mirroring `report_artifacts`): **refused** — its chain
machinery serves the seal chain the sandbox is structurally unreachable from (law 74), and
`storage_key` keeps the content-addressed property on `ck_ra_content_addressed`'s own
`firms/<firm>/…/<sha>.pdf` shape (`0066:290-291`) under its own prefix, without the table.

**The view is minted where the figure is produced, not where the export is asked for** — but v1 mints
it on the export path only, because the on-screen half is F-A5/Wave-G. **The seam is stated so the
screen half can close the gap for free** (the SST-02 idiom, `reporting-agency-design.md:398`): if the
screen renders from `sandbox_views.body`, screen and file share one source. **Until it does, a
screen/file divergence is not structurally prevented** — R-1, priced in owner question 6.

### 3.2 The client set — the defect-3 answer, and the one place this design is opinionated

Defect 3 was a coverage check *"blind to the narrative half of its own export"*, because
`clara.freeform_read_log` has **no `client_id` column at all** (`0002:308-315`), so *"a client
entering through an aggregate is structurally unrecoverable from the table the check would read"*
(`gate-record:215-219`). The fix is not a cleverer derivation but a **fail-closed** one (law 36;
review law 2). `client_set` derives at mint from the view's `basis`, one rule per kind, as a **pure
function of durable rows** (P-3):

| basis kind | what the client set is | ground |
|---|---|---|
| a **preview cell** (`report_datasets` / preview cells) | the cell's own `client_id` — **exact** | the cells carry it |
| a **client-pinned** free read (`freeform_read_log.scope='client'`) | `client_scope` — **exact** | F-A6 v1's hardened receipt (survey U2) |
| a **cross-client named** free read (`scope='cross_client'`) | the receipt's named client set — **exact** | **F-A6 v2's verb is what makes this row exist** (§6) |
| a **HOME / firm-wide** free read (`scope='firm'`) | **every row of `clara.clients` for the firm, at ANY `status`** — `client_set_basis='firm_closure'` | the read *could* have touched any of them; the log cannot say which, and a derivation is not evidence. **The status predicate is stated below — it is the one place the estate's house form points the wrong way** |
| **a basis element that does not resolve IN THIS FIRM** | **REFUSE the mint** (`sandbox_view_basis_unknown`) | absent and foreign answer identically — no existence oracle (the `0083:109-111` CLR11 rule) |
| **a body block with no or an unknown `basis_ref`** | **REFUSE the mint** (`sandbox_view_block_basis_absent` / `_unknown`) | §3.1 — the file's own content is what must be covered |
| **no basis rows at all** | **REFUSE the mint** (`sandbox_view_basis_absent`) | an unresolved set is the unknown, not the empty |
| **a resolved set that derives to `{}`** | **REFUSE the mint** (`sandbox_view_client_set_empty`) | a universal quantifier over the empty set is vacuously true — §3.3's wall would pass for every recipient alive |

**The status predicate, stated because the estate's reflex is the wrong one** (gate M2).
`clara.clients.status` is **three-valued** — `('active','archived','onboarding')` (`0003:38`, widened
at `0017:658-659`) — clients are archived, never deleted, and a firm-wide free read has **no client
predicate at all** (F-A6's arm returns NULL for HOME, `freeform-read-v2-design.md:135-150`), so a
non-active client's rows are inside the aggregate. `firm_closure` is therefore
`select id from clara.clients where firm_id = <the caller's firm>` — **no `status` conjunct** — and
that must be written at the rule, because the house form is the opposite and deliberate: both roster
enumerators filter `status='active'` (`0016:866`, `0017:4927-4928`), and `0036:1010-1013` documents
an O8.4 active-client guard on all seven enumerators. A builder reaching for that habit produces an
**under-covering** set §3.3 silently accepts. `onboarding` is not hypothetical: `create_opening_seed`
admits `status in ('active','onboarding')` (`0017:2902`), so such a client has an opening seed, a tie
document and a plan inside the aggregate. B1.12 forces it, with a twin an `active`-only derivation
FAILS.

**The basis is read under an explicit same-firm predicate, and the firm comes from the wrapper**
(gate B6). `_sandbox_client_set` is an **ungranted core reached under `clara_fn_owner`**, whose own
policy is `using (true)` on every relation in the `0002:485-491` bootstrap loop — `freeform_read_log`
included. `clara_fn_owner` is not BYPASSRLS, and that buys nothing: **its policy admits every firm's
rows**, and `freeform_read_log.id` is a single global identity sequence (`0002:309`), so a foreign
basis id is guessable, not secret. **The estate has paid for this exact class once already** —
`0083:102-108` records a round-2 blocker where a definer body relied on *"RLS still scopes the
artifact"*: *"which is FALSE inside a definer body: this runs as `clara_fn_owner`, whose owner policy
on `clara.report_artifacts` is `using (true)`, so the table returns EVERY firm's rows"*, exposing
another firm's manifest, digests and storage key. The rule follows that fix:

- `_sandbox_client_set(p_firm uuid, p_basis jsonb, p_body jsonb)` takes the firm as its **first
  argument**, resolved by the wrapper from `clara.wake_context()` — **never** read off a basis row.
- Every basis-row lookup carries `and firm_id = p_firm` as an **explicit conjunct in the body**.
  Written as equality, **never** `is not distinct from`: `freeform_read_log.firm_id` is nullable
  today (`0002:310`) and a NULL is the unknown, which must fail the predicate and refuse — the
  three-valued arm survives even after F-A6 hardens the column.
- Absent, foreign and NULL-firm all raise the **same** `sandbox_view_basis_unknown`, so a caller
  cannot learn that an id exists by watching which refusal comes back — the same posture B2.4
  already takes on the recipient side (*"never 'found but refused' — it is not visible"*).

**Nothing about the set is caller-supplied.** The mint takes a `basis` and a `body` whose blocks
point INTO it by label, never a client list; the DB resolves every pointer to a durable row **in this
firm** and computes the set. F5-D14's *"computed from the cells' own rows, never from a
caller-supplied list"* is satisfied at the mint — and after the fold it is satisfied against the
**file's own blocks**, not only the pointers the caller chose to declare.

**The consequence is the design, stated plainly:** *a chart computed from a HOME free read can only
be exported to a recipient who covers the whole firm's roster* — in practice, a firm member. A
three-company comparison for a group owner must be computed from **named** reads. That is TA-P10
C′ (2)'s own coverage test applied honestly to a log that cannot name its clients, and **it converts
F-A6 v2's named client list into the mechanism that makes tight cross-client exports possible at
all** (§6). **`client_set` is frozen with the row** (append-only), so a coverage proof is
reproducible years later: adding a client does not retroactively widen an old `firm_closure` view.

### 3.3 The recipient — OQ-3's model, minted because the schema has none (X8)

```
clara.export_recipients   firm-scoped, immutable + supersede (the claim_policy_versions habit,
                          0066:66-85, minus the curated firm_id-is-null wall — this IS firm data).
  firm_id   uuid   not null references clara.firms(id)
  kind text check (kind in ('firm_member','external'))
  user_id   uuid   -- NOT NULL iff kind='firm_member'; composite FK into the firm's memberships
  display_name text not null check (btrim(...) <> '')      -- who the person is
  basis        text not null check (btrim(...) <> '')      -- WHY they cover these clients
  covered_clients uuid[]  -- NOT NULL iff kind='external'; cardinality >= 1; every element
                          -- validated at write against clara.clients of THIS firm, at ANY status
  registered_by uuid not null · registered_at · superseded_by uuid · superseded_at
```

**`covered_clients` is validated without a `status` filter**, for the same reason §3.2's
`firm_closure` carries none: a set containing an `onboarding` or `archived` client must stay
*coverable*. An active-only validation would make the wall **unsatisfiable** rather than fail-closed
— the refusal would name a client no admin could ever add.

**The coverage predicate**, computed at export request, recorded in `coverage_proof`:

- `kind='firm_member'` → covered iff the membership is `status='active'` in **this** firm at request
  time. Coverage over clients is then **total by construction** — a firm member already reads every
  client of his firm under RLS, so an export to him crosses no boundary. **Computed, never stored:**
  a stored roster copy goes stale the moment a client is added, and a stale copy is the class of bug
  §3.2 exists to avoid.
- `kind='external'` → covered iff `view.client_set ⊆ recipient.covered_clients`, both read as rows
  at request time. Uncovered ids are **named in the refusal** (`recipient_coverage_incomplete`) —
  safe, because the refusal is read by a firm member who may see all of them.

**`_recipient_covers` asserts a NON-EMPTY `client_set` before it compares anything** (gate M10), in
the `0020:640-643` idiom — an explicit named zero-cardinality branch *ahead* of the general
comparison (`if cardinality(v.client_set) = 0 then raise 'sandbox_view_client_set_empty' elsif …`),
never a fall-through. **Why both doors** (§3.2 refuses the mint; this refuses the request):
containment over the empty set is **vacuously true** — `ARRAY[]::uuid[] <@ anything` is TRUE, which
is arithmetic and not a Postgres quirk, so every implementation inherits it — and the wall TA-P10
C′ (2) made mechanical would be satisfied by **every registered external recipient alive**, one
covering none of the firm's clients included. `_recipient_covers` is judgement logic (§5), and a
judgement function must never answer YES on an input it cannot judge (review law 2). A zero-client
firm is ordinary here: a firm before its first client, or the window after a Wave-G/ADR-0075 factory
reset before the fixtures re-seed (hard constraint 13).

**Registering an external recipient is a HUMAN act, admin+ floor** (`clara.register_export_recipient`
/ `clara.supersede_export_recipient`, the `0002:518-520` audit_log floor idiom). Not because TA-P1 C
reserved it — it did not — but because **`covered_clients` IS the wall**: an agent that could write
coverage could satisfy any check, and law 78's open register devolves *acts*, not the authorship of
the guard that judges them. The agent's export verb takes `p_recipient uuid` and **nothing about
coverage**. **This is the design's fail-closed DEFAULT, not a ruled reservation** (§1's fold note),
put to the owner as question 2. *Priced, so Q2 is a decision and not a rebuild:* devolving the
`firm_member` kind costs **one wake sibling verb over the same ungranted core plus one allowlist
row**, and nothing else — that kind's coverage is computed from live membership and never stored
(below), so an agent writing the row still could not widen coverage. Devolving **`external`** is the
one that touches the wall, since `covered_clients` is authored there; priced only as Q2's alternative.

**The retirement lever is a registered gap, an owner card, not a silent omission (opus F4's deeper
half, TIER B).** `supersede_export_recipient` is a REPLACEMENT primitive — a successor row is
always minted, carrying the predecessor's own `basis` forward — never a pure RETIREMENT (marking a
recipient dead with no successor). A firm that genuinely wants "Bob no longer receives exports, and
nobody else does either" has no verb for that today: the closest available act is superseding Bob
with a successor whose `basis` still reads as if coverage continues, which is not the same claim.
PR-1 builds the truth half of supersession (A4: basis preserved verbatim, `covered_clients`
explicit and kind-validated, never silently cloned) but does not invent a retirement lever — that
is a distinct verb/shape decision for the owner, not a seeding choice this PR makes unilaterally.

**Superseded and removed recipients refuse** (`export_recipient_superseded`,
`export_recipient_membership_inactive`) — three-valued, never two: absent → refuse, superseded →
refuse, inactive → refuse. A coverage change is a **new row**, so an old export's `coverage_proof`
still points at the row that actually justified it.

### 3.4 The verbs — sibling wake verbs, one human register, one human read

**Annex A.2 is the enumeration and the count** (nine verbs plus four ungranted cores; every census
reads it). The postures, stated here because they are design and not bookkeeping: **the mint**
(`wake_mint_sandbox_view(p_body, p_basis, p_rationale, p_model, p_op_key)`) is a wake wrapper over an
ungranted core that derives `client_set` (§3.1-§3.2), stamps `authority='narrative'` and computes
`body_sha256` · **the export request** runs the coverage check (§3.3) **and** the watermark-row
presence check (§3.6) **before a job exists** · the three **worker** verbs are `clara_runtime`-only,
lease-scoped exactly as `0081:152-168`, with **the hash coming IN** at completion (X5) and terminal
failure through the audited door (`0080:280-292`) · **register/supersede** is admin+ (§3.3) ·
`list_sandbox_exports` is bookkeeper+, the `0002:518-520` idiom, TA-P14's minimal door ·
`wake_sandbox_export_state(p_export)` is a definer reader with its own receipt (TA-P4 A) — ONE
argument, matching Annex A.2's own enumeration exactly (no op_key/rationale/model: a status read
is not itself a durable act needing idempotency, unlike the mint and request verbs above). *(A11/
PR-1 truing, opus final round: earlier text here called it `stable` — self-contradictory alongside
"with its own receipt", since a function marked `stable` may not legitimately perform the write
a receipt is. The shipped body is VOLATILE, matching every other receipted reader in this estate
— A6. The one-argument signature was always the design's own shape; stated explicitly here now
so it does not read as elided.)*
**`_sandbox_client_set` takes the caller's firm as its first argument** (§3.2).

Every wake wrapper is `SECURITY DEFINER`, `search_path=clara, pg_temp`, resolves
`clara.wake_context()` (`0011:1133` — which re-validates the director's standing at every call, law
69), asserts `clara.assert_wake_allowed(w.wake_kind, '<name>')`, refuses a blank `p_op_key`, refuses
a blank `p_rationale` or an incomplete `p_model`, and delegates to an **ungranted** core.
**No wrapper body carries DML text** — F-A5's C1-at-four-by-construction rule (`0077:23-29`),
inherited. Allowlist rows are `('interactive', …)` ONLY — PERMANENTLY, not pending a future merge
(A11/PR-1 truing, 2026-08-25: F-A2's D34 limb IS merged, but the live estate's own GB-3/D34
closed-world wall caps `interactive_client` at exactly one verb, `wake_open_question`, so this
lane does not widen it; Annex K's own fallback shipped instead). **Never a `'proactive'` row** (law
71's proactive-says-nothing posture) and never an unattended kind — an export is a deliberate act
with a named recipient.

### 3.5 The second render entrance — one geometry library, and a census that proves it

The sandbox does **not** enter `render_jobs` (X3, census C10). It gets a sibling job family keyed on
`sandbox_exports`, served by **the same worker binary, the same Typst pipeline and the same
`chart.mjs` geometry**; `layout.mjs` gains a sibling entry `layoutSandbox(view, decision)` beside the
sealed `layout()`. **TA-P11 A's test is discharged mechanically** by two censuses in both directions
— **G-1** (every `chart.mjs` export reachable from both entrances or neither) and **G-2** (the
sandbox path mints no `render_jobs` row) — and **an unknown chart kind REFUSES**
(`chart_kind_unknown`) here too, no fallback to bars, because *"the fallback is how S6 stayed
invisible"* (`reporting-agency-design.md:380-381`). **Annex I** carries the census definitions and
the ceremony discipline (a renderer change: fresh digest, pre-change digest pullable seven years,
run from merged `main`, **after F-A5 PR-4** so two ceremonies do not contend).

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

**What the renderer does with it — and the renderer keeps its OWN wall** (gate B7). `layoutSandbox`
emits the page background exactly as `layout.mjs:136` does, with the string taken from the pinned row
and **never from a literal**. There is no `watermarkText()` fallback on this entrance and no
`decision.watermark` branch — the sandbox watermark is **unconditional**.

**Unconditional is a property of the BRANCH, not of the STRING**, and v1 proved only the branch. The
gate found the gap in the estate's own helper: `typstString(value)` is `'"' + String(value ?? "") …`
(`layout.mjs:73-79`) — it **coerces null and undefined to the empty string and never throws**, so
`text(60pt, fill: rgb("#00000014"), "")` typesets an empty background, the render completes,
`complete_sandbox_export` records `done` with a sha256, and an *unwatermarked* sandbox PDF is
byte-indistinguishable from a sealed one. The request-time check cannot see it: the axis is the
**payload's content**, not the row's presence — a jsonb key-name mismatch, a locale resolving no row
in the payload builder, or a pinned-row lookup returning nothing all keep the pinned id and lose the
string. The sealed lane is safe only by accident (`watermarkText(decision)`, `layout.mjs:178-182`,
returns one of three literals). This entrance's string comes from the DB, so it takes the treatment
every other DB-sourced string in that file already gets:

- **`layoutSandbox` resolves the watermark string through the file's own fail-closed accessor**,
  `need(map, key, kind)` (`layout.mjs:81-88`), which raises `RenderRefusal("<kind>_unresolved")`
  when the payload does not resolve the key. Token: **`watermark_text_unresolved`**.
- **The guard runs BEFORE `typstString`, and rejects blank as well as absent** — `null`, `undefined`,
  `""` and whitespace-only all refuse. Running it after the coercion would be reading the projection
  instead of the thing (review law 3).
- **Both doors keep their wall** — the request-time presence check stays (an actionable refusal beats
  a job dying on a worker) and the renderer refuses on its own account (law 78's rider
  R-TA-P1-walls: an entrance's wall sits at its own door, never borrowed from an upstream one).
- The proof is a **cell that makes the renderer refuse** (B3.6), not the absence of a branch. B3.5's
  v1 *"no code path … forced by rendering with every decision shape"* is re-cut: enumerating
  `decision` shapes never touches the payload-content axis. Two cells, two axes.

**Q1's second key** (gate nit). Annex E Q1 hands the owner a **two-key** payload — a **stamp** (the
page background) and a **footer line** (the boxed sentence) — and v1's §3.6 consumed only the first,
leaving the footer unbuilt by construction. The design of record decides it: **the stamp is what
§3.6 emits, unconditionally, on every page.** A ratified footer line emits **once in flow**, in the
`layout.mjs:152` idiom — that box sits before the sections loop, so it is a page-1 element by
construction and **B3.1's per-page assertion applies to the stamp alone.** Said so the Q1 payload and
this section agree either way, and so no cell is written that cannot pass.

**The proof is in the bytes, and it is a POSITIVE control.** Acceptance extracts text from the
produced PDF (`0066:87-88`'s idiom) and asserts the stamp **on every page**, not once per document;
its differential twin has the policy row absent, the request refusing, and **no bytes at all**. A
cell that only observed "the string is there" would have a meaningless YES. **The wording is the
owner's** (Q1) — the default is *no row seeded* (`gate-record:260-261`), which for this lane means
**the export path ships dark** (X12); the migration seeds only what the owner returns.

### 3.6a The watermark trio — owner-ratified 2026-08-23 (the owner sitting)

*(A11/PR-1 truing, 2026-08-25: "SIGNED" retitled "owner-ratified" throughout this section and its
cross-references — the wording is an owner-approved text ratification, not a cryptographic or
legal signature; Codex #13's naming half.)*

**Q1 (OQ-1 + OQ-2) is CLOSED.** The owner ratified the `sandbox_watermark` trio at the 2026-08-23
sitting, superseding the Annex E Q1 draft above; this is the row text the PR-1 migration seeds,
verbatim:

| locale | owner-ratified text |
|---|---|
| en | WORKING ANALYSIS — FOR DISCUSSION ONLY. Not an audited financial statement, not a statutory report. |
| ms | ANALISIS KERJA — UNTUK PERBINCANGAN SAHAJA. Bukan penyata kewangan beraudit, bukan laporan berkanun. |
| zh | 工作分析稿 — 仅供讨论。非经审计财务报表,非法定报告。 |

**The lane's DARK condition (X12) LIFTS AT BUILD** — once PR-1 seeds these three rows, the
fail-closed *"no row seeded"* default this section and Annex E Q1 both describe no longer applies
for `en`/`ms`/`zh`; every other locale still refuses by the same rule until its own row is owner-ratified.
One sitting, one key (Q2's "two keys" question is moot — the trio is a single string per locale,
not a stamp/footer pair) — Q1's second-key note above stays historical text describing v1's shape.

### 3.6b The substitution seam — B1 RULED 2026-08-23 (the owner sitting)

**Clause (4)'s export half is RULED, and the mechanism is a SUBSTITUTION SEAM, exactly the fold's
priced recommendation (`gate-record:313-317`).** The model writes **placeholders** into `p_body`,
never a typed numeral; the renderer substitutes each placeholder with the DB-read value at mint
time, resolved from the durable result row the export's `basis_ref` pins (§3.1) — the same
provenance chain E-R8 floor ① already requires for the sealed lane, extended to this one. **No
model-typed numeral reaches the sealed bytes**, discharging the hard-constraint-1 collision the
gate found: PRD §6 invariant 1's *"placeholder substitution … never model-retyped"* now governs
both entrances, and TA-P10 C′ (4)'s export permission is satisfied by a DB-executed, provenance-
pinned figure, never a transcription. `sandbox_view_body_malformed` (Annex A) is re-cut from a
type assertion (*"a figure arrived as a number"*) to a **provenance** assertion (*"a figure has no
resolvable basis row"*) — the guard now polices the seam, not the string shape. `chart.mjs`'s
`readSeries` contract (`@frozen`, exact-integer `dimensions`) is satisfied because the substituted
value is DB-read, never model-supplied — R-7's early warning is discharged. **PR-1 (the
result-carrying row on the free-read lane) and PR-3 (the renderer's substitution step) both
unblock; the `displayed_text` figure path as v1 built it is replaced, not resumed.**

**FORWARD POINTER — the mechanism this ruling names but does not build now EXISTS.**
`docs/plan/active/card1-substitution-seam-design.md` (v3, gate-PASSed 2026-08-26; `-part2.md` §3,
`-part3.md` §4-§7, `card1-substitution-seam-annexes.md` A-F) is the design of record for both
stages, and the build is F-A5b card 1's own migration plus
`packages/reporting-render/lib/layout-sandbox.mjs`. **Stage (a)** is the `kind='placeholder'`
block: it carries `{kind, basis_ref}` and no numeral-shaped field at all, so the re-cut of
`sandbox_view_body_malformed` from a TYPE assertion to a PROVENANCE assertion promised above is
realised structurally rather than by a string check. **Stage (b)** is the twelfth AST primitive
`cell`, evaluated by a NEW frozen `evaluate_metric` v2 closure beside the untouched v1 — so a
figure may also be COMPUTED from DB-owned inputs, not only cited. Two consequences land back on
this document: the fail-safe interim recorded in Codex #2 below is now genuinely conditional (a
placeholder-only body carries no free text, so the exact per-basis-kind derivation survives to the
returned `client_set`; a MIXED body still widens, which is the boundary S30 draws), and the CLAIM
verb this lane registered as a gap ships with card 1 as
`clara.claim_sandbox_export` plus the leader's `sandbox_dispatch_begin`/`_record` pair and
`reap_exhausted_sandbox_exports`. **Stage (b) ships DARK** — its closure is born undeployed and
every `wake_compose_metric_preview_v2` call refuses `evaluator_undeployed` until a separate
ceremony runs; that is the expected post-merge state, not a defect.

**Codex #2 — the coverage consequence while the seam itself is unbuilt.** PR-1 (this lane's own
DB layer) ships before the substitution engine does, and every block kind it admits is free text
(model-authored prose, `kind='text'` — a placeholder-typed block is second-render-entrance
territory, PR-3's own). Its fail-safe interim is therefore conservative in one direction only:
the derived client set ALWAYS widens to `firm_closure` whenever free text is present in the body,
regardless of what the exact per-basis-kind derivation would have proven narrower — coverage can
widen while the seam is unbuilt, never narrow below the exact derivation. The mechanism is
`_sandbox_client_set`'s own SECTION 5c(iii) in the PR-1 migration; this sentence is its
design-level registration, so the interim's shape does not live only in a migration comment.

**Split boundary (2026-08-23, the 500-line ceiling): §3.7 onward, incl. §4-§7 and the RULED
disposition of both owner cards, continues in `sandbox-export-design-part2.md`.** Section numbers
unchanged.

**Continued in `sandbox-export-design-part2.md`** — §3.7 (the narrative-authority wall), §3.8 (the
human doors), §3.9 (law 28's pass, still owed), §4 (walls/censuses), §5 (judgement logic), §6 (the
train — the watermark trio owner-ratified and the substitution seam RULED, both discharging their §6
dependency rows) and §7 (non-goals, incl. both owner cards' 2026-08-23 RULED dispositions).
