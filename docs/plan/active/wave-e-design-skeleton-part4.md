# WAVE E — DESIGN SKELETON v2 · **PART 4** (§3–§6)

> **CONTINUATION of `wave-e-design-skeleton.md` + `-part2.md` + `-part3.md` — one document in four
> files** (the repo's 500-line file discipline; the `wave-d-b-asbuilt.md`/`-part2.md` split
> precedent). Part 1 carries §0 (verification ledger + three corrections) · §1 (campaign frame,
> lanes, ceremony) · §2.1–§2.4 (period spine, gate catalog, drawers 1–2). Part 2 carries §2.5–§2.8
> (drawer 3 + the closed-period wall and its permit, continuity math, the close receipt family, the
> reopen path). Part 3 carries §2.9–§2.10 (E-R6 activation, the E-R11 keys) and §2.11–§2.12 (lane γ
> — month snapshots, staleness, the period registry). **This file carries §3 (the E-R12 trio, lane
> α) · §4 (lane θ) · §5 (E-b/E-c pointers) · §6 (open questions + decisions).** Section numbers are
> continuous across the four files; a citation like "skeleton §3.1" resolves here, "skeleton §2.9"
> and "skeleton §2.11" in part 3. **THE PACKET IS SEVEN FILES**; the other three:
> `wave-e-design-reporting.md` (§0–§5), `wave-e-design-reporting-part2.md` (§6–§12),
> `wave-e-acceptance-matrix.md`. Part 1's banners, markers and evidence discipline apply unchanged:
> the contract wins; EXISTS claims carry `file:line` reads taken **2026-08-09 at the v2 fix pass**;
> migration numbers and `CLRnn` codes claim at MERGE.

## 3. E-R12 — the client-facts trio *(lane α)*

### 3.1 F-1 — VERIFY FIRST on the allocation wall; ONE small guard on `apply_open_items`

**Verdict, part 1: E-R12(1) is DISCHARGED BY EXISTING CODE on `allocate_payment` / `allocate_receipt`.**
The reads that establish it (each a quote, not a paraphrase):

1. **The predicate exists on both sides, byte-identical** — `0044:1266-1272` (receipt) and `:1557-1563`
   (payment): `if i.item_date is not null and p_posting_date < i.item_date then raise exception … using
   errcode='CLR10', detail=jsonb_build_object('reason','allocation_to_unborn_item', …)`.
2. **`p_posting_date` IS the allocation's effective date — stated by the code.** The wall's own comment
   (`0044:1260-1265`, verbatim again at `:1551-1556`) reads: *"the buckets are item_date-driven while
   **this allocation is effective-dated at the settlement's posting date**."* E-R12's phrase and the
   live predicate are therefore **the same test**.
3. **The public wrappers forward it unchanged** — `clara.allocate_receipt` (`0044:1642-1657`) and
   `clara.allocate_payment` (`0044:1659-1674`) take `p_posting_date` third and pass it positionally
   into the `_core` with no transformation.
4. **RPR's two documented scars** (as-of 2025-08-31 and 2025-09-30, self-healing at as-of ≥
   2026-08-01, E-R12(1)) are **stored data predating the wall (0041), not a live gap** — the wall
   operates at call time and never retro-touches rows.

**Verdict, part 2: `clara.apply_open_items` needs its OWN guard — the v1 "structurally immune" claim
overstated the code by one conjunct** *(the one genuinely open F-1 sub-question, now closed; both
round-1 review lanes reached the same answer independently).*

- **It is act-dated, and the proof is positive** — but not at `0037:3225`'s file text. `0040` S4.9
  (`0040:6148-6216`) harvests the live body and splices `effective_date = current_date` into both
  inserts (`0040:6206-6213`); `0042` S5.22 (`0042:4809-4915`) re-splices it to `clara._book_today()`
  (`0042:4896-4903`; `_book_today` created `0042:4592`). The producer law is written down at
  `0040:864-877`: *"`operation_kind='apply'` writes the row's own `created_at::date`: `apply_open_items`
  is the ONE allocation writer with no GL entry to anchor on … an application dates itself by the
  ACT."* ⇒ **§3.1's table row and §6 item 1 must read the body via `pg_get_functiondef`, never at
  `0037:3225`.**
- **The missing conjunct.** The immunity argument needs the act date to be on or after **both** items'
  `item_date`. Nothing enforces that: the body loads `si`/`ti` at `0037:3314-3315` (`:3313` is the
  self-reference guard's `end if;` — v2 was off by one) and proceeds through
  self-reference, reversal-lineage, outstanding-sign and outstanding-bound refusals to the two inserts
  at `0037:3384-3389` — and a scan of the whole ladder `0037:3296-3392` for `item_date`,
  `current_date` or `_book_today` returns **zero** hits (the date stamps arrive only via the 0040/0042
  splices, outside the refusal set). Future-dated facts are demonstrably
  reachable in this schema — `0043_wave_d_b1_staff_advances.sql:2814-2831` is a whole GUARD II written
  because "a FUTURE-DATED original produced an unwind that lands BEFORE its own fact".
  Aging admits items at `item_date <= as_of` (`0040:3944-3946`) and allocations at `effective_date <=
  as_of` (`0040:3203-3208`), so with a future-dated source the target carries its `−amt` allocation
  while the source item is out of aging scope — and the zero-GL control account has not moved.
  Σ buckets ≠ control: the F-1 defect class, reached from the source side.
- **The guard** *(lane α; ruled by E-R12(1)'s "REFUSE outright, no override", mechanism a builder
  choice)*: inside the per-pair loop, refuse when `clara._book_today() < greatest(si.item_date,
  ti.item_date)` with `errcode='CLR10'`, `reason='apply_before_item_date'`, in the standing message +
  reason-token shape. **Not** the R9 guard: `0040:6165-6169` explains that R9's `greatest()` exists for
  a NEGATION row sorting before the allocation it negates and correctly says apply_open_items has "no
  antecedent allocation to take a greatest() against" — a different hazard from this one, and naming
  the difference stops a reviewer reading that paragraph as a refutation.
- **Lane α is therefore tests + ONE small guard + the door**, and it carries a D1 window (§1.1).

**What the lane must build.**

| Item | Why it is not optional |
|---|---|
| **A positive caller census, from the live catalog** | the wall lives in `_allocate_*_core`, so any caller inherits it. Enumerate callers from `pg_proc.prosrc` (not file text) and assert the set — 0044 already maintains a name-pinned census at `:5425-5426` / `:5500-5501`; extend it. |
| **Re-read `open_items.item_date NOT NULL`** (`0037:738`) as a build-time assertion | the predicate short-circuits on NULL; if the column is ever relaxed the wall opens **silently**. Assert the constraint, do not assume it. |
| **The `apply_open_items` guard above**, spliced PATCHED-NOT-REBUILT via `pg_get_functiondef` | the live body is three generations past its file text (above); a from-file rebuild would revert 0040's and 0042's splices. |
| **A negative battery** | (a) one day before `item_date` ⇒ `CLR10` / `allocation_to_unborn_item`, message and reason quoted verbatim; (b) **same day ⇒ PASS** (the boundary is `<`, not `<=`); (c) through each public wrapper **and** the composite preheld path (`0044:1927`, `:1946`); (d) under `clara_agent_ro` ⇒ `42501` before the body runs; (e) the new apply guard: future-dated source ⇒ refuse, same-day ⇒ pass. |
| **A field read, not only a battery** | ADR-066's lesson: a zero-count refusal head is a question to open, never a wall to bank. Attempt a genuine RPR-shaped allocation at an as-of **before** 2026-08-01 and record the refusal. A refusal is the PASS. |
| **A ratification record** | one section in `wave-e-acceptance-matrix.md` stating that E-R12(1) was discharged by verification **plus one guard**, citing these lines — so no future session re-builds it. |

### 3.2 `entity_type` + MSIC — ONE capture door, one facts table

**A facts table, not columns on `clara.clients`** *(builder choice — a column carries the value but not
the who/basis/when ADR-062 requires verbatim, and each future fact would need its own column plus its
own door; a facts table makes the door generic and keeps `clara.clients` a registry).*

```
clara.client_facts
  id uuid pk · firm_id · client_id
  fact_key text not null            -- 'entity_type' | 'msic' | … (validated against a catalog)
  fact_value jsonb not null
  basis text not null               -- WHO/BASIS/WHEN: the free-text justification (non-empty)
  basis_kind text not null check (basis_kind in
    ('owner_instruction','document','registry_lookup','interview_carryover'))
  source_document_id uuid           -- required when basis_kind = 'document'
  validated_against text not null   -- e.g. 'enum:ENTITY_TYPES_V2' | 'format_only'
  recorded_by uuid not null references clara.users(id) · recorded_at timestamptz not null default now()
  superseded_by uuid references clara.client_facts(id) · superseded_at timestamptz
  unique index uq_client_fact_live (client_id, fact_key) where superseded_at is null
```

**`clara.record_client_fact(p_client, p_fact_key, p_fact_value, p_basis, p_basis_kind,
p_source_document_id, p_op_key)`** — the named audited door E-R12(3) requires.

- Floor `role_rank('admin')` *(builder choice — a client fact drives coding and statutory presentation;
  above bookkeeper, below a signing key).* Client-in-firm check ⇒ `CLR11`.
- `p_basis` empty ⇒ `CLR10 fact_basis_missing`. Unknown key ⇒ `CLR10 fact_key_unknown`. Value failing
  the key's catalog rule ⇒ `CLR10 fact_value_invalid`.
- **Supersession, never update** — a new row stamps `superseded_by/superseded_at` on the prior. The
  reverse-not-delete culture applied to reference data; it gets its own matrix cell (supersede, then
  prove the live view returns exactly one row and the prior is readable).
- `_reserve_op` → `_audit` → `_finish_op`, exactly as every sanctioned mutator does (`0044:1337-1342`
  is the canonical `_audit` payload shape).
- **Key catalog** `clara.client_fact_keys` (code-populated): `entity_type` validates against the
  interview's own enum — `["sdn_bhd","bhd","sole_prop","partnership","llp","society","cooperative",
  "other"]` (`packages/runtime/workflows/interview.v2.frameworks.ts:50-52`) — and `msic` validates
  **format only** (5 digits). **No MSIC registry table exists** in any migration (searched
  case-insensitively across all 54); the row records `validated_against='format_only'` and the product
  never claims the code was checked against an official list.
- **Why the door and not the interview path:** `clara.commit_client_onboarding` (`0017:2777-2779`)
  refuses with `CLR10` once `cl.status <> 'onboarding'`, and no verb re-opens an active client — the
  exact wall ADR-062 names.
- **Why one door serves both facts:** `entity_type` and `msic` differ only in their catalog rule; two
  doors would mean two audit shapes for the same act.

**Backfill.** `entity_type` is `requiredForCommit: true` on the client interview
(`packages/runtime/workflows/interview.v2.questions.ts:77`), so every committed client plan carries an
answer. The lane backfills `client_facts` from the latest **committed** plan's answered/resolved item
with `basis_kind='interview_carryover'` and `basis` naming the plan id — a real provenance, not a
synthesized one. MSIC is the sparse fact; the three parked codes enter through the door itself.

**The three parked codes** (E-R12(3)): **RPR 68109 · RS 82110 · BEE 74101**, each with
`basis_kind='owner_instruction'` and a `basis` citing the owner's instruction and date, recorded in the
ceremony/acceptance step and quoted verbatim in the acceptance record. *Note for reviewers: the
ENRICHMENT TRAP does not reach this. It forbids enriching RS's name-only **customers** with
registrations or TINs; an MSIC code is the **client's own** industry classification and touches no
counterparty row.*

### 3.3 The context-pack splice — PATCHED, NOT REBUILT

The pack is built entirely in `clara.get_context_pack(uuid, text)`; the runtime passes the whole object
through unfiltered (`packages/runtime/workflows/autoDraft.v7.tools.ts:437-449`), so **surfacing
`entity_type` needs no runtime edit at all.**

The live client object is 0036's msic-augmented literal, **constructed by `||` concatenation at
`0036_wave_c0_deferred_belts.sql:1559-1566`** — *not* the `v_anchor` string declared at `0036:1554`,
which is the PRE-0036 anchor and no longer appears in the live body. 0036's own header states the law,
**"PATCHED, NOT REBUILT"** (`0036:1511-1516`): harvest via `pg_get_functiondef`, `replace()`, never
retype, because 0017/0018/0019 each rewrote the live body and a from-file rebuild would silently revert
them.

Lane α's splice, mirroring 0036's own prestate discipline:

1. Prestate: harvest the live definition; assert **the constructed msic literal of `0036:1559-1566`**
   (not `v_anchor`) appears exactly once, counted with 0036's own idiom
   (`(length(v_def)-length(replace(v_def,<lit>,'')))/length(<lit>)<>1`, `0036:1555`); assert
   `'entity_type'` is not already present. *(A builder reusing `v_anchor` verbatim finds ZERO
   occurrences — v1 did not say which string to count.)*
2. Replace the client object so it carries **both** keys, and so **both** read
   `coalesce(<live client_facts row>, <latest committed plan item>)` — the captured fact wins, the
   interview answer is the fallback. *(builder choice — an MSIC door that writes a table the pack does
   not read would be a door onto a wall; and coalescing avoids recutting `commit_client_onboarding`, an
   audited writer, purely to keep two stores in step.)*
3. Post-assert both keys installed, or RAISE. `SECURITY DEFINER` survives `CREATE OR REPLACE`; the
   definer-owned body already reads `onboarding_plan*` without extra grants (`0036:1504-1509`), and
   `client_facts` is definer-readable on the same basis.

---

## 4. Lane θ — the CLOSE half of plan-as-document, plumbing grade

DIRECTION.md §4 item 4 names it: the onboarding half is built (`/clients/plan`); **the CLOSE half rides
Wave E**. DIRECTION.md:19 **recommends** it be "a first-class, versioned DB object (the
intended-vs-actual audit record)" — the line reads *"**Recommended:** … → **Gate-2 owner
ratification**"*, so it is a recommendation this design adopts, not a requirement it obeys.

**It already is one** — that is the point of §2.2's shape. The *intended* is `clara.close_gate_checks`;
the *actual* is `close_gate_results` + `close_attestations` + the receipt. Lane θ ships a **read and
three surfaces**, not a new persistence model:

- **`clara.get_close_plan(p_fiscal_year_id) returns jsonb`** — the typed plan document: every applicable
  check with its drawer, intended assertion, measured state, attestation (or its absence), and the
  receipt once finalized. Granted to `clara_authenticated` and `clara_agent_ro` (read).
- **`/close`** — the plan-as-document view + the readiness panel. Every gate row renders **shape +
  label, never hue-only and never a raw digit** (DIRECTION §3's a11y floor); drawer-3 signals are
  visibly non-blocking; the attest action is an object-level verb on the row, so the surface passes
  DIRECTION §1's agent-native test.
- **`/reports`** — a sibling of `/rules` (`apps/dashboard/app/rules/page.tsx`): pasted-JWT dev auth in
  `sessionStorage` under the shared `clara_dev_jwt` key, PostgREST `rpc()` reads, no design system, no
  animation. Sealed-artifact links and a snapshot list. **The UI computes no cents.** *(Stated for the
  owner, not hidden: this EXTENDS E-R10 item ③'s hand-minted-JWT pattern to two new surfaces. Fixing
  the JWT story is correctly Wave G; propagating it is a choice, and this is where it is visible.)*
- Any new card registers in the catalog with exactly one authoritative emit path and re-derives its
  authoritative status on hydrate (DIRECTION §1/§3; the parity extractor test is a build gate).

**Out of scope, explicitly (E-R10):** sign-in/sign-up, firm setup, raw-document click-through, the JWT
story, and every other item on the UX-debt register. All of it is Wave G. The E-side painkiller lane
was proposed and **declined**.

---

## 5. E-b / E-c — pointers only

**E-b (lanes δ, ε, ζ) — `wave-e-design-reporting.md` §§2–5 (lane δ) + `wave-e-design-reporting-part2.md`
§§6–10 (lanes ε and ζ).** The typed metric algebra (E-R5), the
approved/versioned/effective-dated catalog, the six-layer FS template model, claim assessment, the
chart AST regime and the sealed-artifact registry (E-R14). Two standing decisions bind it from here:
**the algebra evaluator IS a reporting evaluator for immutability purposes** — versioned `_vN` DB
functions, frozen by extending the freeze-lint family; and **wording tables follow the 0016
`sst_threshold_schedule` idiom** as the certified precedent for effective-dated policy text. The render
worker is a new package mirroring `packages/backup`'s separate-Fly-app batch shape (a short-lived DSN,
no standing pool, offline at render time), which also keeps it off the Supavisor standing budget.
E-a's dependency on E-b is one-way and narrow: **the close receipt pins evaluator versions and a
dataset hash — in the `evaluator_version_ids` and `dataset_sha256` columns §2.7 now declares** — and
nothing more. E-a's dependency ON γ is the reverse edge: δ build-depends on §2.12's period registry.

**E-c (lane η) — `wave-e-design-reporting-part2.md` §11.** The LLM ad-hoc authoring lane: the model composes
catalog items freely and authors novel definitions as formula trees; a novel definition is a `draft`
until human approval (E-R5's lifecycle matrix), approval and publication ride named audited functions
under the standing role floors and PRD §2's segregation model, and direct DML stays revoked. E-a
touches it only through E-R4's law, absolute on both sides: a model may propose or check, and no model
numeral enters a durable report unless a versioned deterministic evaluator **originates** it from
DB-owned inputs.

**Tax computation is NOT in Wave E.** PRD §8's exclusion is `docs/product/PRD.md` §8, the model-computed row — *"Model-computed
numbers in any artifact | Every figure from DB functions (invariant 1)"* — which is the row the E-R4
argument actually rests on; `:184` is the separate tax-gating row. Nothing in the FS-pack or reporting
scope folds a draft tax computation in by another name.

---

## 6. Open questions

All three items are now DECIDED — items 1 and 3 by the orchestrator at design time; item 2 by
the OWNER (2026-08-09; the item carries the ruling record). *(This preamble originally read
"one belongs to the OWNER and is stated as pending" — trued with the lane α PR, the same act
that flips item 2's wording.)*

1. **`clara.apply_open_items` — verified or guarded? CLOSED (2026-08-09): GUARDED.** §3.1 carries the
   read and the verdict — act-dating is mechanized (`0040:6148-6216`, `0042:4896-4903`, producer law
   `0040:864-877`) but conditional, so the verb gets one small refusal and lane α's size moves from
   "tests only" to "tests + one guard + the door". Both independent round-1 review lanes reached this
   answer separately.
2. **The E-R11 factory default — CONFIRMED (`owner` only). RULED BY THE OWNER 2026-08-09** (the
   five-question grill at the campaign-design close, session 43d6f6cf; recorded in the `PROGRESS.md` backlog
   and the handoff; this truing rides lane α's PR per the ruling). Keys ② and ③ default to the
   `owner` role alone; partners/admins join by **explicit audited grant** (`grant_firm_capability` —
   the firm-configurable list ships with lane β; a polished settings UI is Wave G). Reasoning of
   record, unchanged from the proposal: "partner" has no structural representation in the role model
   (`viewer|bookkeeper|admin|owner`, `0002:215`), so an explicit audited grant IS the honest
   mechanism for a partner who is not the firm owner — defaulting the whole `admin` tier in would
   make the list decorative for the largest senior role, and signing authority should fail closed.
   **Adjustable in one `_has_capability` predicate.** The reporting doc's "owner/partner" wording
   resolves to this same ruling.
3. **Lane α's early ride — DECIDED (orchestrator, 2026-08-09): α rides an early ceremony.** §1.1's
   argument stands (an ADR-062 debt discharged, the three parked codes landed without waiting on the
   campaign), amended by §3.1: α now replaces one audited writer body, so it carries its own small D1
   window rather than none. Full ADR-061 ladder on the PR regardless.

**Known risks carried forward, not resolved here.**

- **The closed-period wall (§2.5) is the widest new surface in E-a** — it sits on the hottest table in
  the schema and refuses writes the runtime has never seen refused. Its inertness at deploy (§1.1)
  contains the deploy risk; its correctness is Law-1 judgement logic and gets the full independent
  pass. The matrix must carry **all SEVEN cells §2.5 names** — the plain refusal, the close-vs-post
  race, §2.5(B)'s close-vs-gate-evidence race, the forge attempt, the close's own write, the
  prior-transaction permit, and the over-consumption refusal — and §2.1's shared/exclusive pair has no
  precedent in this schema (grep-verified absent) so it carries its own two-session cells.
- **RPR's historical-FY close may be unreachable until its scars are remediated** *(the discovery both
  round-1 review lanes converged on, registered here as a Section-D precondition).* E-R12(1) records
  RPR's two scars as self-healing at as-of ≥ 2026-08-01 (`wave-e-contract.md:245-249`). Drawer 1
  evaluates its ties at **`fy.ends_on`**, not at an operator-chosen date — so if RPR's historical FY
  ends inside the scar window, `ar_control_tie` returns `mismatch` there **permanently, with no
  override**, and E-R9's "RPR historical FY MPERS pack" close cannot be reached at all. The honest path
  is to remediate the two scars through the audited verbs (`unallocate_group` → re-apply, both
  act-dated per §2.11's table) **before** the close. Section D therefore carries a named precondition
  row, **measured at run time**: read the scar state via `ar_control_tie(RPR, fy.ends_on)` first, and
  record what it says — never assume either outcome.

---

*v2 ends. §1 and §2 are proposals at implementable precision, not decisions; §0's three corrections
are reads and should be treated as findings against the grounding pass. The contract governs
throughout.*
