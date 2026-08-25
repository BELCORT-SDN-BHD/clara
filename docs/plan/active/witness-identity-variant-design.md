# The candidate-parameterized `evaluate_witness_identity` variant — DESIGN v1

> **Design doc of record for the forward-obligation item minted at the 2026-08-24 β review ladder**
> (`PROGRESS.md` Backlog, "Forward obligations…"), scoped as **pi/F-A1-successor** and identified in
> `0126_f_a7_beta_filing_verb.sql:1205-1217` as **"path (i)."** DESIGN ONLY — this branch
> (branch debt/evaluator-variant-design) ships no product code and no migration; every SQL block below is
> illustrative shape, to be authored as a real migration by the build lane that picks this up, with
> its own number claimed at merge (hard constraint 10).
>
> **Companion.** `witness-identity-variant-survey.md` — the estate as-found (§1 the current
> evaluator's exact behaviour, §2 the B2/B3 ladder and the outcome-bearing re-derivation, §3 the
> homoglyph gap, §4 the freeze law, §5 the security question, §6 the design space). This file is the
> design; the survey is its evidence. `witness-identity-variant-annex.md` — the battery/cell table,
> the confusables seed set, and the decision log.
>
> Binding law: hard constraints 1/2/3/9/10 (`AGENTS.md`); PRD §6; review law 1 (judgement logic gets
> an independent pass before merge — **every rung below is judgement logic**); the evaluator-freeze
> law (`wave-f-lane-brief.md:72-77`, D-16). Design of record for the surface this variant plugs into:
> `filing-and-interview-design.md` §3.2-3.3 (B2/B3), `f-a1-witness-pair-design.md` §3.3/§3.4 (D12,
> the identity leaf's own design).

---

## 1 · Scope, fixed by the item's own framing

This design covers exactly the item PROGRESS.md names: a candidate-parameterized
`evaluate_witness_identity` variant, the B2/B3 wiring delta it enables, the homoglyph gap that
sequencing exposes, and the freeze/migration shape to ship it safely. It does **not** design the
candidates-mandatory runtime prompt itself (a separate, F-A2/PR-2-successor runtime item — §4 states
the seam contract it must honour), does not touch `evaluate_witness_fact_state_v1` or either of its
two frozen closures, and does not reopen B1/B4-B10 of the 0126 ladder (unaffected by this variant).

---

## 2 · The variant: `clara.evaluate_witness_identity_v2`

### 2.1 Signature

```sql
create function clara.evaluate_witness_identity_v2(
    p_document uuid, p_text_x uuid, p_contest boolean, p_candidates uuid[])
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $ident$
```

`p_document`, `p_text_x`, `p_contest` are unchanged from v1 — same meaning, same types. **`p_candidates`
is new: an explicit array of candidate `clara.clients.id` values**, supplied by the caller instead of
the function self-deriving one client from `document_filings`. This is the whole of the change in
kind: v1 answers *"is this document's identity geometry consistent with whichever client currently
holds a filing on it"*; v2 answers *"is this document's identity geometry consistent with THIS
CANDIDATE, for each candidate the caller names."*

### 2.2 What stays identical to v1, byte for byte in effect

- The geometry test (§1 of the survey, item 3): squared 2D box distance over pinned OCR polygons,
  exact in `numeric`, no `sqrt`. **Unchanged, and still candidate-independent** — it is a fact about
  the document's layout, not about any client.
- The contest-withdraws rule (`p_contest` true ⇒ every cited side withdraws as
  `'withdrawn_contest'`, `identity_contest := true`).
- The verdict vocabulary: `'corroborated' | 'not_corroborated' | 'withdrawn_self_referential' |
  'withdrawn_contest'`.
- Missing-anchor-refuses, tie-refuses, polarity-freedom (no `document_kind`/`direction` read — v2's
  tail carries the same `NEVER RAISE A POLARITY SIGNAL` assertion `0091:268-274` carries).

### 2.3 What changes: the candidate binding

```sql
-- v2's candidate resolution, replacing v1's self-derivation (0091:118-127)
select coalesce(array_agg(distinct cl.id), '{}'::uuid[])
  into v_candidates
  from unnest(p_candidates) as raw(id)
  join clara.clients cl on cl.id = raw.id
  join clara.documents d on d.id = p_document
 where cl.firm_id = d.firm_id;   -- THE FIRM GUARD (survey §5) — never trust the caller's array alone
```

A candidate uuid that does not resolve to a live client row **in the same firm as `p_document`** is
silently excluded — never raised, matching the estate's "a rung's own evaluation may never raise"
discipline and the fail-closed-on-unknown law. This is the one hard security requirement carried
from the survey (§7 restates it as a named rung with its own battery cell); it is **not** optional
polish — a candidate array from a caller that got the firm boundary wrong must fail closed by
exclusion, not by raising and aborting an unrelated transaction, and must never silently trust an
out-of-firm id.

**Geometry, computed once** (unchanged from v1's `:143-193`, no per-candidate cost). **Self-referential
withdrawal, computed per resolved candidate:**

```sql
-- per candidate c in v_candidates:
v_vreg_self_c := v_vreg is not null and exists(
  select 1 from clara.client_identifiers ci
   where ci.client_id = c and ci.kind in ('tin','ssm') and ci.value_normalized = v_vreg);
v_creg_self_c := v_creg is not null and exists(
  select 1 from clara.client_identifiers ci
   where ci.client_id = c and ci.kind in ('tin','ssm') and ci.value_normalized = v_creg);
```

**Per-candidate verdict, mirroring v1's case ladder (`0091:195-214`) exactly, with `v_client is
null` replaced by "this specific candidate `c`" standing in for `v_client`:**

```
for candidate c:
  vendor_registration_verdict(c) :=
    case
      when v_vreg_n = 0 then null
      when p_contest then 'withdrawn_contest'
      when v_vreg_self_c then 'withdrawn_self_referential'
      when v_vreg_n <> 1 then 'not_corroborated'
      when v_d_vv is null or v_d_vc is null then 'not_corroborated'
      when v_d_vv < v_d_vc then 'corroborated'
      else 'not_corroborated'
    end
  -- symmetric for customer_registration_verdict(c)
```

`identity_contest` stays document-wide and candidate-independent (unchanged from v1: `p_contest`, or
both sides self-referential for **any single** candidate — a party appearing on both sides of its own
invoice is a contest regardless of who else is in the candidate set).

### 2.4 Output envelope

```json
{
  "identity_contest": false,
  "candidates": {
    "3fa8...-uuid": {
      "vendor_registration_verdict": "corroborated",
      "customer_registration_verdict": "withdrawn_self_referential"
    },
    "9c11...-uuid": {
      "vendor_registration_verdict": "not_corroborated"
    }
  }
}
```

Same appended-only-when-cited discipline v1 uses (`0091:217-219`): a candidate that never had a
registration cited against it at all carries `{}`; `p_candidates = '{}'::uuid[]` or an array that
resolves to zero candidates (survey §5's firm guard, or a genuinely empty request) returns
`"candidates": {}` — a well-defined, non-error answer. **A caller reading `candidates -> p_client::text
->> 'vendor_registration_verdict'` on a key that is absent gets SQL `NULL` from `->>`, which is
neither `'corroborated'` nor truthy — the fail-closed default a B3-style caller needs falls out of
ordinary jsonb-absence semantics, with no special-case code required at the call site.** This is the
same idiom `evaluate_witness_fact_state_v1` itself relies on (`0092:210-217`: "the refusal envelope is
NOT `{}`… an unresolvable pair returns a REAL envelope whose `corroborated` is FALSE").

### 2.5 Worked example — path (i)'s own call site

```sql
-- 0126-successor's B3 arm (b), rewritten. No v_wc_n / v_wc_client gate: the candidate IS the input.
v_text_x := clara._document_facts_extraction(p_document);
if v_text_x is not null then
  v_ident := clara.evaluate_witness_identity_v2(p_document, v_text_x, false, array[p_client]);
  v_witness_corroborated :=
    (v_ident->'candidates'->p_client::text->>'vendor_registration_verdict' = 'corroborated')
    or (v_ident->'candidates'->p_client::text->>'customer_registration_verdict' = 'corroborated');
  if v_witness_corroborated is null then v_witness_corroborated := false; end if;
else
  v_witness_corroborated := false;
end if;
```

This is reachable on a **fresh** filing (`document_filings` carries zero rows for the document) —
the exact case v1 structurally could not serve. No `v_wc_n`/`v_wc_client` read remains: the candidate
the caller cares about is supplied directly, not inferred from filing state that does not exist yet.

---

## 3 · Determinism argument — why `p_candidates` does not break PRD §6

Hard constraint 2's law: *"no model-generated numeral enters a durable artifact unless a versioned
deterministic evaluator reproduces it from DB-owned inputs."* The candidate array is not a numeral,
not a verdict, and not the judgement — it is a **selector over the judgement's domain**, the same
role `p_name` plays in `clara.name_family_candidates(p_firm, p_name)` (already accepted, unrevised
by this design) and the same role `p_document`/`p_text_x` already play in v1. Three properties hold,
each load-bearing:

1. **The judgement is still computed entirely from DB-owned data.** For any fixed
   `(p_document, p_text_x, p_contest, p_candidates)`, the geometry comparison reads only
   `clara.document_regions` (server-verified, cite-and-verify at write time, §3.4 of
   `f-a1-witness-pair-design.md`) and the self-referential check reads only
   `clara.client_identifiers` (written exclusively through `clara.add_client_identifier`, itself
   unchanged by this design — B9's name-only wall, `filing-and-interview-design.md` §3.6). **No key
   in the output envelope is ever assigned from `p_verdict`, from model text, or from anything the
   caller asserts as true** — the caller supplies WHICH candidates to check, the DB alone supplies
   the ANSWER for each. This is the identical shape §6 already accepts for `name_family_candidates`
   (`p_name` selects; the DB owns whether a match exists) and for every `evaluate_*` function that
   takes a document/extraction id as a parameter (the id selects; the DB owns the verdict).
2. **`STABLE`, not `IMMUTABLE`, is the correct — and pre-existing — volatility class, and this design
   introduces no new category.** v1 is already `stable`: its self-referential check reads
   `client_identifiers`, a table that changes over time (a promoted identifier added after the fact
   changes v1's own answer on a re-evaluation). "Versioned deterministic evaluator" in this codebase
   has never meant "eternally pinned regardless of DB state" — `STABLE` means "reproducible from the
   DB's current authoritative state within one statement," which is exactly what §6 requires
   ("reproduces it from DB-owned inputs"). v2 inherits this reading unchanged; it does not weaken it
   by one degree, because the only new input (`p_candidates`) is filtered to `clara.clients` rows
   that exist NOW, exactly as `v_client` was filtered to a `document_filings` row that existed NOW.
3. **The firm guard (§2.3) makes the selector's own domain DB-verified, not caller-asserted.** A
   candidate the caller names but that does not resolve to a same-firm client is not merely ignored
   by convention — it is provably absent from `v_candidates` before any judgement runs, so no
   caller-supplied identity ever reaches the corroboration logic un-checked against the DB's own
   `clients`/`documents` tables.

**The one thing that is new, named precisely so no later reader has to re-derive it:** v1's candidate
was a DB-derived FACT the function computed for itself (whichever client's filing is live); v2's
candidate SET is a DB-VERIFIED SUBSET of a caller-proposed list. The judgement inside that subset is
identical in kind to v1's judgement inside its single self-derived candidate. Nothing about this
design lets a model's stated confidence, its own corroboration claim, or any unverified text become
part of the verdict — the verdict is still 100% re-derived from `document_regions` polygons and
`client_identifiers` rows on every call, which is the property §6 actually protects.

---

## 4 · The seam contract — who feeds `p_candidates`, and what the runtime prompt owes

**The DB never receives a raw client uuid from the model.** The candidates-mandatory prompt (a
separate F-A2/PR-2-successor runtime item, not built by this design and not built by this branch) is
obligated to satisfy exactly one contract at the seam:

> **`p_verdict->'candidates'` MUST be populated, non-null, a JSON array, whenever the model's own
> read names more than zero candidate parties for either `invoice.vendor_name` or
> `invoice.customer_name`** — element shape `{"name": text, ...}`, matching what B2 arm (b) already
> reads today (`0126:1144-1149` checks only `jsonb_typeof(...) = 'array'` and array length; this
> design adds no new required key, so the seam is satisfiable by a prompt change alone, no schema
> migration on the receiving side).

**Resolution to `uuid` happens entirely inside the DB**, at the 0126-successor call site, before
`evaluate_witness_identity_v2` is ever invoked:

```sql
-- Assembling p_candidates for the v2 call, inside the same core that already computes v_ambiguous
select coalesce(array_agg(distinct fc.bound_client) filter (where fc.bound_client is not null), '{}')
  into v_family_candidates
  from unnest(v_server_names || (select array_agg(x->>'name') from jsonb_array_elements(v_candidates) x))
       as nm(name)
  cross join lateral clara.name_family_candidates(p_firm, nm.name) fc;

v_p_candidates := array_distinct(array[p_client] || v_family_candidates);
```

(`array_distinct` here is illustrative — the real migration authors the dedup with `array_agg(distinct
...)` over an `unnest`, matching the estate's own idiom elsewhere in 0126.) **This is why the runtime
prompt's obligation is narrow and cheap: it supplies NAMES, in the same shape B2 already partially
reads, and the DB — not the model, not the prompt, not the runtime — is the only thing that ever
turns a name into a `clients.id`, through `name_family_candidates`, which is itself DB-owned and
already firm-scoped (`0103:762,769`).** A model that never populates `candidates` degrades v2's call
to `array[p_client]` alone (arm (a)'s server-derived names still flow into `v_family_candidates`
independently of the model) — never a raise, never a wider candidate set than the DB itself derived.

---

## 5 · The B2/B3 wiring delta, made explicit

**B3 (`0126:1218-1234` → replaced by §2.5's worked example):** removes the `v_wc_n`/`v_wc_client`
gate entirely; calls `evaluate_witness_identity_v2` with `array[p_client]`, reachable on a fresh
filing. **This is the whole of path (i).**

**B2 (`0126:1101-1163`): unchanged in this design**, except that its arm (a) now runs over a
confusable-widened `name_family_candidates` (§6). No other line of B2 moves. The outcome-bearing
transition (survey §2.3) is a **consequence** of B3's fix, not a code change to B2 itself — stated
here so a future reader does not go looking for a B2 diff that does not exist.

**Sequencing requirement, load-bearing and non-optional:** the B3 fix (§2.5) and the B2 homoglyph
widening (§6) **ship in the same migration, or the homoglyph widening ships strictly first.** Reason,
restated from the survey: before this variant ships, B3 refuses every fresh filing lacking a hard-id
match regardless of B2, so a homoglyph-confused document is refused today by blunt force. After the
variant ships alone (without the widening), that same document can newly be ADMITTED whenever its
geometry is well-formed — B2's deterministic arm still cannot see the homoglyph collision, and B2's
model arm is unfed until the separate prompt item lands. **Shipping the variant without the widening
is a regression, not a neutral change**, and this design treats the two as one build unit for exactly
that reason.

---

## 6 · Homoglyph coverage — closing the arm-(a) gap deterministically

### 6.1 Design choice, resolved from standing law (survey §6 table)

Widen `clara.name_family_candidates` **in place**, via `create or replace function` (legal: it is not
`clara.evaluate_*`, confirmed absent from both frozen closures in survey §1). Leave
`clara.name_family_token` **untouched** — still `IMMUTABLE`, still the strict fold, still every
existing caller's behaviour byte-identical on a non-confusable name. Add one new function and one new
append-only table; OR the new comparison into the existing predicate so the widening is strictly
additive (can only ADD a candidate row, never remove one) — the same "widening never narrowing"
posture `0126:1096-1100` already established at this exact call site for arm (a)'s `engine_kind`
change.

### 6.2 The confusables table

```sql
create table clara.name_family_confusables (
  from_char text primary key check (from_char ~ '^.$'),   -- exactly one character
  to_char   text not null check (to_char ~ '^[a-z0-9]$'),  -- exactly one, target alphabet only
  class     text not null check (class in ('digit_letter','cyrillic_latin','greek_latin')),
  added_at  timestamptz not null default now()
);
comment on table clara.name_family_confusables is
  'The DETERMINISTIC visual-confusable fold B2 arm (a) applies before name_family_token''s strict '
  'comparison. Append-only and extend-only, mirroring clara.agent_receipt_contract''s pattern '
  '(0103): a new confusable pair is a one-row INSERT migration, never a function CoR.';
```

**Seed set (full table in the annex; class coverage summarized here):**

- `digit_letter` — `0→o`, `1→l`, `3→e`, `4→a`, `5→s`, `6→g`, `7→t`, `8→b`, `$→s`. Closes `R0ME`
  (digit-zero) → `rome` — the motivating fact, verified directly: `translate('R0ME', '0', 'o')` (case
  handled by the surrounding `lower()`, unaffected by digit substitution) `= 'ROme'` →
  `name_family_token_confusable` reduces it to `'rome'`, matching `ROME PROPERTIES`'s own
  `'rome'` token.
- `cyrillic_latin` — **both cases mapped explicitly, independent of `lower()`'s own Unicode
  behaviour** (a positive prestate check in §7 verifies what `lower()` actually does to Cyrillic on
  the live database's collation before this table is trusted to matter — see the migration-shape
  note below). Lowercase: `а→a, е→e, о→o, р→p, с→c, х→x, у→y, і→i, ѕ→s, ј→j, м→m, н→h, к→k, в→b, т→t`.
  Uppercase: `А→a, В→b, Е→e, К→k, М→m, Н→h, О→o, Р→p, С→c, Т→t, Х→x, Ѕ→s, Ј→j, У→y, І→i`. Covers the
  Cyrillic/Latin confusable set most commonly used for visual spoofing of Latin-script company names
  (Е for E, О for O, Р for P, С for C, etc.).
- `greek_latin` — a small, named-not-exhaustive set (`Α→a, Β→b, Ε→e, Ζ→z, Η→h, Ι→i, Κ→k, Μ→m, Ν→n,
  Ο→o, Ρ→p, Τ→t, Υ→y, Χ→x`), included for completeness against the same visual-spoofing class; not a
  measured production incident, carried because the mechanism costs nothing extra once the table
  exists.

**Why one canonical target per source character, not a fuzzy multi-way fold:** `translate()` is a
1:1 positional substitution; a source character maps to exactly one target. This does not need to be
a perfect OCR-correction (`1` could mean `l` or `i` in different fonts) — it only needs to be a
**stable, deterministic, many-to-one** function, because **both** the untrusted document name and
every client/counterparty's own name pass through the identical fold before comparison. Two names
collapsing to the same folded token is the only thing that matters; which canonical letter the fold
picks is an implementation choice, not a correctness requirement, and is documented as such rather
than left for a reader to wonder whether `1→l` was a considered decision.

### 6.3 The fold function and the widened predicate

```sql
create function clara.name_family_token_confusable(p_name text) returns text
  language sql stable set search_path = clara, pg_temp as $fn$
  select nullif(
           split_part(
             btrim(regexp_replace(
               lower(translate(coalesce(p_name, ''),
                 (select string_agg(from_char, '' order by from_char) from clara.name_family_confusables),
                 (select string_agg(to_char, '' order by from_char) from clara.name_family_confusables))),
               '[^a-z0-9]+', ' ', 'g')),
             ' ', 1),
           '')
$fn$;
```

`translate()` runs BEFORE `lower()` and maps every confusable — both cases, where relevant — directly
to its lowercase Latin/digit target, so the fold's correctness never depends on how `lower()` treats
non-ASCII input on this database's collation (survey §3.1 flags this as unverified; §7 below makes it
a positive prestate check rather than an assumption). `STABLE`, not `IMMUTABLE` — it reads
`clara.name_family_confusables` — a genuinely new volatility class for a NEW function, never applied
to the existing `name_family_token`.

```sql
create or replace function clara.name_family_candidates(p_firm uuid, p_name text)
  returns table (party_kind text, party_id uuid, party_name text, bound_client uuid)
  language sql stable set search_path = clara, pg_temp as $fn$
  with tok as (select clara.name_family_token(p_name) as t,
                      clara.name_family_token_confusable(p_name) as tc)
  select 'client'::text, cl.id, cl.name, cl.id
    from clara.clients cl, tok
   where p_firm is not null and cl.firm_id = p_firm
     and ((tok.t is not null and clara.name_family_token(cl.name) = tok.t)
       or (tok.tc is not null and clara.name_family_token_confusable(cl.name) = tok.tc))
  union all
  select 'counterparty'::text, cp.id, cp.name, cp.client_id
    from clara.counterparties cp, tok
   where p_firm is not null and cp.firm_id = p_firm
     and cp.retired_at is null and cp.merged_into is null
     and ((tok.t is not null and clara.name_family_token(cp.name) = tok.t)
       or (tok.tc is not null and clara.name_family_token_confusable(cp.name) = tok.tc))
  order by 1, 3, 2
$fn$;
```

**Strictly widening:** every row the OLD predicate returned is still returned (the `or` only adds a
second way to match); the only behavioural change is that a document/query name whose confusable fold
matches a candidate's confusable fold — but whose strict fold does not — now ALSO appears.
`name_family_is_ambiguous` needs no change (it is `count(*) > 1` over `name_family_candidates`'s
output, and the widening is entirely inside that function).

---

## 7 · The migration shape

*(Illustrative structure only — this branch ships no migration. A build lane authors the real file,
claims its number at merge per the standing law, and re-derives every prestate claim against the live
frontier at that time, not against this design's numbers.)*

**Prestate (fail-closed on any false premise, mirroring `0091`'s own discipline):**

1. `to_regprocedure('clara.evaluate_witness_identity_v2(uuid,uuid,boolean,uuid[])') is null` — not
   already applied.
2. `to_regprocedure('clara.evaluate_witness_identity_v1(uuid,uuid,boolean)') is not null` — v1 still
   live (v2 does not replace it; both coexist).
3. `not exists (select 1 from clara.evaluator_versions where evaluator_name = 'evaluate_witness_identity' and version = 2)`.
4. `(select count(*) from clara.evaluator_versions where evaluator_name = 'evaluate_witness_identity') = 1`
   — exactly v1 exists before this file runs; the tail re-asserts `= 2` after.
5. **The Cyrillic `lower()` positive control** (survey §3.1's flagged unknown, settled here rather
   than assumed): `select lower(U&'\0415') = U&'\0435'` — does the live database's collation actually
   fold uppercase Cyrillic Е to lowercase е? **Read positively either way** — if true, the confusables
   table's uppercase Cyrillic rows are still correct (mapping directly to the Latin target
   independent of `lower()`) and merely redundant with what `lower()` would have done anyway; if
   false (a `C`-locale database, the more likely case), the explicit uppercase rows are load-bearing
   and this prestate check is the evidence that they are, not a decoration.
6. No functional index depends on `clara.name_family_token` (a `pg_index`/`pg_depend` scan for any
   index expression naming the function) — survey §3.1 predicts zero; the migration proves it.
7. `pg_get_functiondef('clara.name_family_candidates(uuid,text)'::regprocedure)` matches the exact
   text this design quotes in §6.1's "before" state (0103's committed body) — a prosrc-SHA prestate
   pin on the live body being CoR'd, the same discipline every CoR in this estate carries.
8. The two existing frozen closures (`evaluate_witness_fact_state`, F-A2's nil-tax predicate) are
   read and their `closure_sha256` values captured **before** this file runs anything — the tail
   proves they are byte-identical **after**, positive evidence that v2's registration touched neither.

**Tail (re-reads the live catalog, never trusts the file's own intent):**

1. `clara.verify_evaluator_freeze()` returns `ok`.
2. Exactly 2 `evaluator_versions` rows for `evaluator_name = 'evaluate_witness_identity'` (versions
   `1` and `2`), and v2's own `evaluator_version_members` closure has exactly 1 member — mirroring
   `0091`'s "own 1-member closure" pattern precisely.
3. The two PRE-EXISTING closures' `closure_sha256` are unchanged from the prestate capture — the
   direct, positive proof that this migration is additive to those two entrypoints, not a silent
   re-hash.
4. `evaluate_witness_identity_v2`'s committed body, comment-stripped, does not match
   `document_kind|direction|polarity|coding_kind` — the same polarity-freedom assertion `0091:268-274`
   carries, re-run against the new body rather than assumed inherited.
5. `name_family_candidates`'s NEW body (post-CoR) still returns EVERY row the OLD body would have
   returned on a fixed fixture set (a differential replay against a captured pre-CoR result set,
   never a self-referential "the new body looks additive" read) — the positive proof of §6.3's
   "strictly widening" claim.
6. The confusables table seed count matches what this design's annex enumerates — a census, not a
   trust.
7. `revoke all on function clara.evaluate_witness_identity_v2(...) from public` holds; owner is
   `clara_fn_owner`; `search_path` pinned — the same T18-hygiene tail every evaluator in this estate
   carries.

**D1 (write-quiesce) assessment:**

- `evaluate_witness_identity_v2` — **new function, D1 EMPTY.** Nothing it replaces.
- `name_family_candidates`/new `name_family_token_confusable` — **CoR of a live, already-merged, but
  STABLE (read-only) function.** No writer body is replaced; the D1 concern (an in-flight call
  finishing on a stale body) does not apply to a pure read predicate the way it applies to a body
  that mints an `event_seq` or writes a row — a call that started under the old body and finishes
  under it produces a stale-but-internally-consistent read, never a torn write. Still gated by review
  law 1 (judgement logic) and carries its own D1 line item in the migration for the record, per the
  db-migrations.md rule that a heavy pass states whether its timeout/window is load-bearing rather
  than leaving a reader to guess — here: **not load-bearing, stated as such.**

---

## 8 · Census/roster additions

- **`clara.evaluator_versions`**: +1 row (`evaluate_witness_identity`, version 2, `deployed = false`
  at registration — same convention as v1's own insert, `0091:239-243`). Whether/when this specific
  evaluator family ever reads a `deployed` flip (unlike `evaluate_metric`/`evaluate_fs_pack`'s
  ceremony-gated dispatch) is a build-time question to confirm against the live semantics for THIS
  evaluator, not a design blocker — v2's only live caller (§2.5) selects it by literal function name
  in source, the same way 0126 selects `_v1` today.
- **`clara.evaluator_version_members`**: +1 row (v2's own 1-member closure).
- **0126-successor's own function-existence prestate census** (the array at `0126:503-513`, itself
  the pattern every train in this item follows): gains
  `'clara.evaluate_witness_identity_v2(uuid,uuid,boolean,uuid[])'` and
  `'clara.name_family_token_confusable(text)'`.
- **No `wake_fn_allowlist` change** — this design adds no new wake-reachable verb; the ladder core
  `wake_file_document` already reaches, and its allowlist row is untouched.
- **No new event type, no new `firm_open_questions.kind` value** — B2's existing `'collision'` kind
  (`0126:1438`) already covers the newly-outcome-bearing case; nothing about *why* B2 fired changes
  in a way the firm question's typed vocabulary needs to represent.
- **`clara.name_family_confusables`**: a new, append-only, extend-only table — its own row count
  becomes a named census line (the annex's decision log records the seeded count so a later addition
  is visibly an addition, not silently absorbed).

---

## 9 · Open questions

Tried against standing law first, per the working protocol; both resolve without an owner ruling.

1. ~~Single candidate parameter vs. an array?~~ **Resolved** — survey §6: the array generalizes
   cleanly, costs nothing extra at the one call site that needs a singleton today, and matches the
   task's own framing of "a candidate set."
2. ~~CoR `name_family_candidates` in place, or mint a parallel sibling?~~ **Resolved** — survey §6:
   not a frozen evaluator, the estate's own precedent at this call site is in-place widening, and the
   migration shape (§7) carries the differential-replay proof that resolving-from-law demands rather
   than asking the owner to bless an assumption.

**One item this design surfaces but does not resolve, because it is genuinely a build-time fact, not
a design-time judgement call:**

3. **Whether `evaluate_witness_identity`'s `evaluator_versions.deployed` flag is read by anything at
   all today**, or whether this evaluator family is (like `evaluate_witness_fact_state`) selected
   purely by which literal function name a caller's source code invokes. If some future ceremony
   DOES gate on `deployed` for this family, v2's registration ships `deployed = false` and the build
   lane must confirm whether a flip ceremony is required before 0126-successor's call site can safely
   switch to `_v2` in production. **Not a blocker to this design** — the call-site switch (§2.5) does
   not read `evaluator_versions.deployed` anywhere in its own logic, matching how 0126 calls `_v1`
   today (by name, not by a deployed-flag dispatch) — flagged here only so the build lane checks it
   rather than assumes it, consistent with review law 2 ("absence is not evidence").
