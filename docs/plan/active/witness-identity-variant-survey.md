# The candidate-parameterized `evaluate_witness_identity` variant — ESTATE SURVEY

> **Companion to `witness-identity-variant-design.md` (v1, 2026-08-25).** Item of record:
> `PROGRESS.md`'s Backlog, **"Forward obligations minted at the 2026-08-24 β review ladder + train
> night"** — *"The candidate-parameterized `evaluate_witness_identity` variant → pi/F-A1-successor
> scope. Widens B3's corroborated-anchor floor beyond hard-id; ALSO the exact event that makes β's
> B2 collision wall outcome-bearing … AND the β named-skip's path (i)."* Design-only lane
> (branch debt/evaluator-variant-design) — **no product code, no migration ships from this branch.**
> Read against `main` at `d20f1ad` (frontier `0127`, F-A5 PR-3 + the W2/W3 as-run).
>
> **Binding law.** Hard constraint 2 (`AGENTS.md`) — *"The DB owns every authoritative number; the
> agent only orchestrates … no model-generated numeral enters a durable artifact unless a versioned
> deterministic evaluator reproduces it from DB-owned inputs"* — `docs/product/PRD.md` §6. Hard
> constraint 9 — workflow/evaluator bodies are immutable once deployed; a behavioural change ships
> as a new `_vN` and repoints the registry. Review law 1 — a PR that changes judgement logic gets an
> independent review pass before merge; **this item is entirely judgement logic** (a corroboration
> verdict feeding an admit/refuse gate) and the design below is written for that bar.
>
> **Method.** Every claim below is either a direct read of a committed migration file (cited at
> file:line) or a re-derivation from those reads, marked as such. Nothing here is asserted from
> memory of a prior session — this lane opened cold in its own worktree and re-read the frontier.

---

## 1 · What already exists — `clara.evaluate_witness_identity_v1`

**Signature and posture** (`packages/db/migrations/0091_f_a1_identity_helper.sql:109-111`):
`clara.evaluate_witness_identity_v1(p_document uuid, p_text_x uuid, p_contest boolean) returns
jsonb`, `language plpgsql stable security definer set search_path = clara, pg_temp`, owned by
`clara_fn_owner`, `revoke all … from public` (`:222`). It decides whether a
`vendor_registration`/`customer_registration` region a TEXT witness cited may be trusted as a
COUNTERPARTY identity, returning a verdict object with up to two conditional keys
(`vendor_registration_verdict`, `customer_registration_verdict`) plus `identity_contest`.

**What it actually computes, read at the bytes:**

1. **`v_client` — SELF-DERIVED, not supplied.** `:124-127` resolves the filing client from
   `clara.document_filings` (live filings only, `retired_at is null`) for `p_document`. **Two live
   filings on the same document → `v_client := null`** (ambiguity fails closed); **zero live
   filings → `v_client` is also `null`**, because the aggregate's `count(distinct client_id)` is `0`,
   not `1`. This is the load-bearing fact the rest of this survey turns on.
2. **Self-referential withdrawal** (`:136-141`) — a registration that normalizes to `v_client`'s own
   `client_identifiers` (kind `tin`/`ssm`) withdraws that side from counterparty corroboration.
   Reads `client_identifiers` **unfiltered by firm** — the only thing keeping this same-firm is that
   `v_client` itself came from a same-document (hence same-firm) `document_filings` row.
3. **The geometry test** (`:169-193`) — squared 2D box distance over pinned OCR polygons, exact in
   `numeric`. This half is **candidate-independent**: it answers "is the vendor-registration region
   closer to the vendor-name region than to the customer-name region," a pure document-layout fact
   that does not mention any client.
4. **The verdict assembly** (`:195-214`) — and this is the second load-bearing fact: **the
   `'corroborated'` arm is gated on `v_client is not null` BEFORE the geometry comparison ever
   runs** (`:205`, `:211`: `when v_client is null or v_vreg_n <> 1 then 'not_corroborated'`). So
   whenever there is no live filing to self-derive a client from, the function returns
   `'not_corroborated'` regardless of what the geometry says.

**Frozen twice over.** `evaluate_witness_identity_v1` carries its OWN one-member
`evaluator_versions` closure (`0091:226-249`, registered under `migration_version =
'0091_f_a1_identity_helper'`) **and** is closure member ordinal 3 of TWO separate frozen
entrypoints that call it: `clara.evaluate_witness_fact_state_v1`
(`packages/db/migrations/0092_f_a1_predicate.sql:481-487,543-567`) and a second, independently
frozen closure in `packages/db/migrations/0100_f_a2_nil_tax_arm_part2.sql:532-629` (F-A2's nil-tax
predicate). **Both closures hash `evaluate_witness_identity_v1`'s exact `pg_get_functiondef` text**
— editing its body in place would break two unrelated frozen evaluators' hashes at the next
migration's `verify_evaluator_freeze()` call, not just this one's. This is the strongest possible
evidence that a behavioural change here is a `_v2` mint, never a CoR (§3 develops the freeze-shape
argument fully).

---

## 2 · The B2/B3 ladder in `wake_file_document` (0126) — where the gap actually bites

`packages/db/migrations/0126_f_a7_beta_filing_verb.sql` builds the unattended filing verb's
admission ladder (design of record: `filing-and-interview-design.md` §3.2). Two rungs matter here.

### 2.1 B2 — the name-family collision guard (`0126:1059-1163`)

**"union of cautions" (owner ruling 2026-08-24, superseding the single-source form, `:1059-1064`):**
three arms feed one shared wall — arm (a) the **server-derived floor** (`:1101-1115`, over
`invoice.customer_name`/`invoice.vendor_name` regions, widened at this same landing to admit
`engine_kind='invoice_facts'` alongside `'ocr'/'structured_parse'`), arm (b) the **model's own
candidate list** (`:1138-1149`, `p_verdict->'candidates'`, **length-only today** — no shape is read
past `jsonb_array_length(...) > 1`), arm (c) the pre-existing single `matched_name` check
(`:1151-1163`). All three route through `clara.name_family_candidates` /
`clara.name_family_is_ambiguous` (0103 — §4 below); **only the NAME each arm feeds it differs**
(`:1064`).

**Arm (a) is deterministic and DB-owned; arm (b) is model-owned and, today, unfed.** `0126:1139`
states this explicitly: *"an array the RUNTIME/PROMPT layer will make MANDATORY (F-A2/PR-2's prompt
file or its successor — a runtime-side obligation this train notes but does NOT implement)."*
`PROGRESS.md`'s Backlog carries the matching forward obligation verbatim: *"F-A2/PR-2-successor
prompt: `candidates` becomes MANDATORY (B2 arm (b)'s feed — the runtime does not supply it today, by
design)."*

### 2.2 B3 — the corroborated-anchor floor (`0126:1165-1238`) — arm (b) is structurally dead today

B3 requires at least one corroborated anchor: arm (a) `v_confirms_client` (a hard TIN/SSM/bank
match, computed earlier in the same function) **OR** arm (b) a witness-corroborated region, read as
a typed status from `clara.evaluate_witness_identity_v1` (`:1172-1178`).

**The finding, in the migration's own words** (`:1180-1217`, an independent cross-model review,
CRITICAL, rig-proven before the fix): a first draft trusted `evaluate_witness_identity_v1`'s verdict
whenever it fired, and because the evaluator self-derives its candidate from **whatever client
currently holds a live filing on the document (any client, not necessarily `p_client`)**, a wholly
unrelated client's `wake_file_document` request could inherit a stranger's corroboration and file
with zero evidence connecting the document to the requester. **The fix, as shipped:**

```sql
-- 0126:1218-1234 (paraphrased, structure preserved)
v_text_x := clara._document_facts_extraction(p_document);
if v_text_x is not null then
  select count(distinct f.client_id), (array_agg(distinct f.client_id))[1]
    into v_wc_n, v_wc_client
    from clara.document_filings f where f.document_id = p_document and f.retired_at is null;
  if v_wc_n = 1 and v_wc_client = p_client then
    v_ident := clara.evaluate_witness_identity_v1(p_document, v_text_x, false);
    v_witness_corroborated := (v_ident->>'vendor_registration_verdict' = 'corroborated')
                            or (v_ident->>'customer_registration_verdict' = 'corroborated');
  else
    v_witness_corroborated := false;
  end if;
end if;
```

This closes the cross-client exploit correctly, but by construction it can **only ever fire when a
live filing to `p_client` already exists** — which is exactly the one case **Tier A already refuses**
before this ladder runs at all (`CLR10`, "document is already actively filed to this client",
`filing-and-interview-design.md` §3.2 Tier A). `0126:1194-1203` says this outright: *"the fix does
not merely patch the hole, it makes arm (b) STRUCTURALLY unreachable via `wake_file_document` BY
CONSTRUCTION."* **For a fresh, first-time unattended filing — the only case that matters in
production — `v_wc_n` is `0`, not `1`, so `v_witness_corroborated` is always `false`, and B3 reduces
to `v_confirms_client` alone.**

**The migration names its own way out** (`:1205-1217`, CONDUCTOR-RULED 2026-08-24): *"Making arm (b)
reachable for real needs one of: (i) a new evaluator variant taking an explicit candidate-client
parameter (out of this train's scope — pi/F-A1-successor's to own), or (ii) restructuring this
core's ladder-before-write ordering around a SAVEPOINT trial-insert-then-rollback … (ii) was
assessed and NOT attempted … `clara._append_event` mints `event_seq` from a sequence, which is NOT
transactional and does not roll back with a SAVEPOINT, so a trial call … would leave a PERMANENT gap
in the firm's event spine … arm-a-only accepted as the floor for now, STRICTER not weaker … path (i)
on the forward-obligation ledger, path (ii) stays rejected."* **This survey reads "path (i)" as the
literal scope of the variant this design designs.**

### 2.3 The re-derivation PROGRESS.md asserts and this survey re-proves

`PROGRESS.md`'s Backlog claims the variant is *"the exact event that makes β's B2 collision wall
outcome-bearing (today B2 is rung-vector/label quality — everything it flags, B3 already refuses)."*
Re-derived from the code above, not taken on faith:

- **Today:** for any fresh filing, `v_witness_corroborated` is always `false` (§2.2). So B3 fires
  (`attribution_no_basis`) on **every** fresh filing where `v_confirms_client` is `false` — which is
  also the only condition under which B2 can fire (`0126:1161`: `v_ambiguous and not
  v_confirms_client`). **Every document B2 flags, B3 refuses independently and unconditionally.**
  B2's own vector entry changes which `firm_open_questions.kind` gets minted
  (`0126:1435-1441`, `'collision'` vs `'unattributed'`) — a **label**, never the admit/refuse
  **outcome**, because B3 already closed the gate.
- **Once path (i) ships:** `v_witness_corroborated` becomes reachable for a fresh filing whenever a
  genuine witness anchor exists for the requested candidate. In that newly-reachable case,
  `v_confirms_client = false` and `v_witness_corroborated = true` — B3 **admits**. The **only**
  remaining gate is B2: if `v_ambiguous` is also true, the filing still refuses on B2 alone; if not,
  it proceeds. **B2's flag now decides the transaction's outcome**, not merely its label. This is
  the mechanical content of "outcome-bearing," and it falls out of shipping path (i) with no
  separate change to B2's own code.

### 2.4 The consequence this survey adds, not present in 0126's own text

Because B3 stops being a blunt universal refusal on fresh filings, **B2 becomes the last remaining
wall against a document whose witness geometry is genuinely well-formed but whose printed identity
is a homoglyph-confused shadow of a real party.** §3 below measures that B2's deterministic arm (a)
has zero coverage on exactly that shape today. Shipping path (i) without closing that gap would
convert a previously-blunt-but-safe refusal into a new, real admission path for a homoglyph-forged
identity. This is why the design in the companion document treats the two as one sequenced unit
rather than two independent debts.

---

## 3 · `name_family_candidates` (0103) — the deterministic floor, and its homoglyph blind spot

**Definition** (`packages/db/migrations/0103_f_a7_pi_additive.sql:725-776`):

```sql
create function clara.name_family_token(p_name text) returns text
  language sql immutable as $fn$
  select nullif(split_part(btrim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g')),
                            ' ', 1), '')
$fn$;

create function clara.name_family_candidates(p_firm uuid, p_name text)
  returns table (party_kind text, party_id uuid, party_name text, bound_client uuid)
  language sql stable set search_path = clara, pg_temp as $fn$
  with tok as (select clara.name_family_token(p_name) as t)
  select 'client', cl.id, cl.name, cl.id from clara.clients cl, tok
   where p_firm is not null and tok.t is not null and cl.firm_id = p_firm
     and clara.name_family_token(cl.name) = tok.t
  union all
  select 'counterparty', cp.id, cp.name, cp.client_id from clara.counterparties cp, tok
   where p_firm is not null and tok.t is not null and cp.firm_id = p_firm
     and cp.retired_at is null and cp.merged_into is null
     and clara.name_family_token(cp.name) = tok.t
  order by 1, 3, 2
$fn$;
```

`name_family_token` is `IMMUTABLE` (a pure string function, no table reads) and is applied to BOTH
the queried name and every candidate's own `name` column — **exact leading-token equality after
lowercasing and stripping to `[a-z0-9]`, nothing else.** `clara.name_family_is_ambiguous(p_firm,
p_name)` (`:781-788`) is `count(*) > 1` over the same predicate. Both are `revoke all … from public`
(`0103:1040-1041`) — **ungranted**, reachable today only through the two `SECURITY DEFINER` cores
that call them (`_firm_question_core`, `_identifier_promotion_core` via
`name_family_is_ambiguous`) and through 0126's ladder core, confirmed present in that file's
prestate function census (`0126:509-510`).

**Domain is `clients` UNION the firm's live `counterparties`** (D-4/D-19), specifically because
ADR-0074 names ROME PUBLIC ADVISORY — a separate firm appearing only as a BELCORT counterparty — the
worked example a clients-only predicate would miss (`0103:738-741`,
`filing-and-interview-design.md:190-203`). This UNION scoping is exactly right for the collision
question and is untouched by anything this design proposes.

### 3.1 The measured gap

`clara.name_family_token('R0ME PROPERTIES')` (digit zero, a common OCR/typo/adversarial substitution
for the letter O) evaluates to `'r0me'`. `clara.name_family_token('ROME PROPERTIES')` evaluates to
`'rome'`. **These are different strings.** `clara.name_family_candidates(p_firm, 'R0ME PROPERTIES')`
therefore returns **zero rows** against a firm whose books carry ROME PROPERTIES and ROME SECRETARY
as real clients (`AGENTS.md` hard constraint 13's own fixture roster) — the deterministic arm (a)
contributes **no ambiguity signal at all** on this shape. The only remaining path that could ever
catch it is arm (b), the model's own candidate list — which §2.1 already established is unfed until
the candidates-mandatory prompt lands. **Today this is inert because B3 refuses regardless (§2.3).
Once path (i) ships, it is a live gap in the wall that decides the outcome.**

The estate has no existing confusable/homoglyph normalization anywhere in the migrations tree —
searched, zero hits for `confusable`/`homoglyph`; the nearest precedent is
`clara._binding_normalize` (`packages/db/migrations/0028_vendor_identity_binding.sql:231-239`),
which strips bidi/zero-width Unicode control characters via `translate(normalize(t, NFC), U&'...',
'')` — a real, working precedent for a `translate()`-based deterministic fold in this codebase, but
it does not touch confusable *letters*, only invisible control characters. No functional index in
the migrations tree depends on `name_family_token`'s current `IMMUTABLE` volatility (searched;
none found) — a fact the design's migration shape re-verifies positively rather than assumes.

---

## 4 · Freeze/versioning mechanics — the standing law this design must not violate

`clara.evaluator_versions` (`packages/db/migrations/0058_wave_e_delta_metrics.sql:213-218`):
`unique nulls not distinct(firm_id, evaluator_name, version)` — **the schema already supports
multiple versions of one `evaluator_name`**; inserting a `version = 2` row beside the existing
`version = 1` row for `evaluate_witness_identity` requires no DDL change.

**The freeze bites at MERGE, with no `deployed` filter** — restated here because it is the entire
reason an in-place edit of `evaluate_witness_identity_v1` is foreclosed, not merely discouraged:
`docs/plan/active/wave-f-lane-brief.md:72-77` — *"`verify_evaluator_freeze` iterates with no `where
deployed`, hashing the full `pg_get_functiondef`… no lane may change its ACL/owner/search_path
without a new evaluator version — the raise lands at YOUR apply."* Independently re-derived and
measured (not merely asserted) at `docs/plan/active/tax-computation-annexes.md:253` (**D-16**):
*"`verify_evaluator_freeze()` iterates `evaluator_versions` with no `where deployed` and hashes the
FULL `pg_get_functiondef` — so registration freezes immediately (`deployed:false` buys nothing)…
and a later ACL/owner/`search_path` change to any member raises **at that later lane's apply**,
pointing at [the wrong lane]."* Confirmed by a positive control at
`docs/plan/active/tax-computation-annexes.md:284` (**P-10**, rig-replayed): registering an
`undeployed` row still freezes it; an `owner to`/`search_path` change with the body untouched still
trips the checker.

**Two live closures already depend on `evaluate_witness_identity_v1`'s exact bytes** (§1) — this is
not a hypothetical cost, it is a currently-paid one. `evaluate_witness_identity_v2` must be an
**entirely new function** with its own name, its own one-member `evaluator_versions` row (mirroring
`0091:226-249`'s exact pattern), and must call, and be called by, nothing in either existing frozen
closure. §3 of the design document develops the exact registration shape.

---

## 5 · The security question this design must answer, not assume

`evaluate_witness_identity_v1` is `SECURITY DEFINER` and reads `clara.client_identifiers`
**unfiltered by firm** — safe today only because `v_client` is self-derived from
`clara.document_filings`, which is transitively same-firm as `p_document` by construction (no
`document_filings` row can exist for a document in a different firm). **A variant that accepts a
caller-supplied candidate parameter removes that transitive guarantee** unless the function itself
re-asserts it. `0103_f_a7_pi_additive.sql:744-754` names the exact hazard class and the reasoning
this design must reproduce: *"a SECURITY DEFINER function with a caller-supplied tenant parameter is
the exact cross-tenant-oracle shape `0002:453-458` records the estate paying for once … reached
under the owner's privilege, its own predicates are the ONLY thing standing between a caller and
another firm's rows."* `name_family_candidates` sidesteps the question by choosing `SECURITY
INVOKER`; `evaluate_witness_identity_v1` cannot make the same choice, because its callers reach it
from inside other `SECURITY DEFINER` cores that themselves need elevated privilege to read
`document_regions`/`document_filings`/`client_identifiers` past RLS on behalf of a wake-credentialed
agent session. **The variant must therefore filter its own candidate parameter to the requesting
document's firm, in its own body, as a hard (never-raise, fail-closed-by-silent-exclusion) rule** —
carried into the design as a named security requirement with its own battery cell, not left as an
assumption a future caller might get right.

---

## 6 · Design space considered, and what this survey rules out or in

| Question | Considered | Ruled |
|---|---|---|
| Edit `evaluate_witness_identity_v1` in place | Rejected outright — §4: two live frozen closures hash its exact bytes; this is a CoR of a frozen evaluator, structurally forbidden (hard constraint 9) regardless of `deployed` state. | OUT |
| A single explicit `p_candidate_client uuid` parameter (mirrors 0126's own "explicit candidate-client parameter" wording literally) | Matches the ONE call site path (i) exists to unblock. Does not generalize to a B2 family-set cross-check without a second call per candidate (N calls, N geometry re-computations — geometry is candidate-independent so this is wasted work, not merely inelegant). | Considered, not chosen alone |
| A caller-supplied **array** of candidate client ids, one evaluator call, per-candidate verdict map | Generalizes the self-derivation `v_client` (singular, implicit) to `p_candidates` (plural, explicit) cleanly; computes geometry once, self-referential-withdrawal per candidate; degrades to the single-candidate case at the one call site that needs it today (`array[p_client]`). Matches the task's own framing ("a caller-supplied candidate **set**"). | IN — the design's signature |
| CoR `name_family_candidates`/`name_family_token` in place vs. mint a new confusable-aware sibling | `name_family_candidates` is NOT a frozen evaluator (not `clara.evaluate_*`; confirmed absent from both closures in §1) — a CoR is legal. The estate's own precedent at this exact call site (`0126:1096-1100`, arm (a)'s `engine_kind` widening) is "strictly a widening, never a narrowing" via in-place CoR, not a parallel sibling. `name_family_token` itself is left untouched (stays `IMMUTABLE`, no volatility change, no re-verification of index dependents needed at the live tip); a **new**, separate `STABLE` function carries the confusable fold, and `name_family_candidates` is CoR'd to OR the two token comparisons together — additive at every step. | IN — resolved from standing law, no owner ruling needed (§6 of the design develops this) |

---

## 7 · What this survey found, in one paragraph

`evaluate_witness_identity_v1`'s candidate binding is implicit and time-dependent (whichever client
currently holds a live filing), which is exactly backwards for the one call site that needs it —
validating a candidate BEFORE its filing exists. `0126` diagnosed this precisely, fixed the
cross-client exploit the blunt way (refuse instead of trust), and named the correct fix as
out-of-scope future work: "path (i)." Shipping path (i) mechanically flips B2 from a cosmetic label
to the deciding wall on a class of filings that, today, are uniformly refused — and on exactly the
homoglyph-confused shape B2's deterministic arm cannot see today, that flip is a regression unless
paired with closing the token-family gap in the same breath. The freeze law is unambiguous that the
identity evaluator's fix is a new version, never an edit; the security law is unambiguous that a
caller-supplied candidate parameter needs its own firm guard, never an inherited one. Both threads
converge on one coherent design, developed in the companion document.
