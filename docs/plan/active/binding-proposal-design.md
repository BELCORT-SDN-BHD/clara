# 裁-18b — the Clara vendor-binding PROPOSAL door: DESIGN

> **Design doc of record for the owner-ruled pre-beta item 裁-18(b)**
> (`docs/plan/active/mohe-grill-rulings-2026-08-28.md` §裁-18). **v1, 2026-08-29 — the gate is
> OPEN**: seven owner questions stand in `binding-proposal-gate-record.md`, each with a
> recommendation. **No DB PR opens before that gate closes.**
>
> Companions: `binding-proposal-survey.md` (the as-found, 10 findings + 14 censuses + 6 rig
> predictions) · `binding-proposal-annexes.md` (**A** verbs and columns · **B** the receipt
> contract · **C** the battery · **D** the frontend delta · **E** risks and non-goals ·
> **G** the cross-lane ledger · **J** the D1 inventory) · `binding-proposal-gate-record.md`.
>
> Binds under `AGENTS.md`'s hard constraints (2 · 3 · 5 · 9 · 10), **PRD §6 invariants 1, 2(c),
> 2(d), 9, 10, 11** (`docs/product/PRD.md`), `docs/ARCHITECTURE.md`, the ADR digest
> (`docs/adr/README.md`), and the four rulings 裁-18(a)/(b)/(c) and 裁-22. Every PR takes the
> uniform ADR-061 ladder; **§3.4 in full is judgement logic** (review law 1).
>
> **The headline.** This item replaces **zero audited writer bodies**. The binding table already
> carries a `status='proposed'` lifecycle, `sign_vendor_identity_binding` already refuses anything
> that is not `proposed` and re-derives before signing, and `created_by` already accepts the
> estate's real `is_agent` user row with no FK to relax. The whole door is **additive**: one wake
> wrapper, one non-hashed derivation sibling, three honest-label columns, one partial unique
> index, one receipt table + shim + registry row, and two read-body CoRs that carry no write.

---

## 1 · The ruled shape (fixed, not designable)

From 裁-18, verbatim in substance:

- **The binding is not a coding rule and not Clara's KB.** It is the *human-signed authority that
  lets Clara auto-post* a vendor's invoices without a human eye — `_coding_lane_core`'s
  `vendor_bound` is the reason that carries a document to lane `ready` (survey S10). It binds
  **identity only**: account, amount and direction stay Clara's judgement on every document, and
  any other reason code still routes to `needs_you`.
- **Clara PROPOSES; a human ADMIN SIGNS.** Agent-proposes → human-signs is *the normal two-party
  shape*, and under 裁-18c's strict wall it is **the only path for a single-admin firm**.
- **The proposal is from her own observation** — a stable fingerprint, repeatedly approved — with
  **rationale + model on the receipt**.
- **裁-18a's wall is a separate PR** on the pre-beta hardening batch. This design must leave that
  wall satisfiable, and must not pre-empt it.
- **裁-22 binds the basis**: every citation resolves to a `document_regions` row of the
  triggering document, firm-congruent, current extraction generation; `sightings` is
  DB-derived; an unresolvable citation REFUSES the proposal, typed.

Two things follow that are **not** negotiable in the design:

1. **No model-generated value may enter `clara.vendor_identity_bindings`.** PRD §6 invariant 1.
   The five content fields stay exactly what `_derive_vendor_binding_proposal` returns.
2. **A proposal is a proposal.** It changes no book number, files nothing, and grants nothing.
   Its only effect is that a human sees a card. Every wall below therefore fails *closed* into
   "no card", never into "a weaker card".

---

## 2 · The estate in one paragraph (the survey is the authority)

`propose` / `sign` / `revoke` are live, `clara_authenticated`-only, and `_human_ctx`-floored at
bookkeeper / admin / bookkeeper (S1, S2). Every durable field is DB-derived through an eleven-rung
deterministic ladder that already refuses on every absence (S1a) and whose output is sealed by a
`content_hash` covering the evidence array — so the derivation is *effectively frozen* and cannot
be extended in place (S4). `created_by` has **no FK**, and `clara.agent_user_id()` is a real
`clara.users` row with `is_agent = true`, so an agent-stamped proposal needs no schema
relaxation and makes 裁-18a's wall pass by construction (S3). There is **no wake reach at all**:
88 allowlist rows over 7 kinds, not one naming a binding verb (S2). Three live gaps sit next
door: the post-time re-check was retired with the rules tier and nothing writes
`phase='post'` any more (S5); N open proposals are admissible for one pair (S6); and no verb
ever writes the `declined` status the CHECK admits (A3). The the *admin / vendor-bindings* panel panel and
`VendorBindingDetailView` exist and are wired; F-A7b's PR-e `/needs-you` proposal card does not
(S8), and its copy today says the opposite of what 裁-18a will make true.

---

## 3 · The design

### 3.1 · Which wake kind, and what triggers it — **`filing`, plus `interactive` for the human ask; no new kind, no sweep**

**RECOMMENDED (gate question G1): the `filing` kind carries the proposal, and the same wrapper is
also allowlisted to `interactive` so a human can ask for it.**

```
wrapper   clara.wake_propose_vendor_identity_binding(…)   granted to clara_wake_filing
                                                          AND clara_wake_interactive
allowlist ('filing','wake_propose_vendor_identity_binding')
          ('interactive','wake_propose_vendor_identity_binding')
read      clara.wake_list_binding_candidates(uuid)        same two roles, same two rows
core      clara._propose_vendor_binding_agent_core(…)     ungranted: walls + receipt + insert
derived   clara._derive_vendor_binding_proposal(…)        UNCHANGED, byte-frozen (S4)
sibling   clara._derive_vendor_binding_basis(…)           NEW, non-hashed, DB-derived basis
human     clara.propose_vendor_identity_binding(jsonb,text) UNCHANGED name/arity/ACL/floor
```

**Why `filing` and not a new kind.** A new kind is not one registry row — it is a
`wake_credentials` CHECK **pair** widening (a named shared surface), a new `clara_wake_*` role,
that role's `roles-bootstrap.sql` twin in the same commit (the W2/W3 law ①), a login role, a
`pools.mjs` entry, a `wake_engine_sources` row and a workflow export. `filing` already owns a
dedicated role (`clara_wake_filing`) that is grant-split away from every posting verb, and it is
**the estate's identity lane**: its sibling `wake_propose_identifier_promotion` proposes an
identity promotion, and `wake_propose_client_onboarding` proposes a client's identity. A vendor
identity binding is the third member of that family. Cost: **two allowlist rows and two grants.**

**Why not `autodraft`, despite the coding lane living there.** It is the tempting answer and it
is wrong for a measured reason (S2a): **there is no `clara_wake_autodraft` role.** `coding_lane`
is granted to `clara_agent_ro`/`clara_authenticated`; the autodraft *write* verbs are
`clara_wake_interactive`'s. So `autodraft` buys no GRANT separation (PRD §6 invariant 2(d)) — it
would put the door on `clara_wake_interactive` anyway, with only the allowlist as the wall. If
the door must reach `clara_wake_interactive` regardless (it must, for the human ask), then
`filing` + `interactive` gives strictly more separation than `autodraft` + `interactive` gives.
The two kinds' credentials also differ in a way that matters: `filing` and `interactive`
credentials carry `client_id IS NULL` (S2), so **the client comes in as an argument and is walled
explicitly** — the same shape `wake_propose_identifier_promotion` already uses — rather than
implicitly from a credential the caller chose.

**Why not a new G1 sweep source.** `clara.wake_engine_sources` holds two rows and **both are
disabled** (survey §4). A third row means a workflow export, a login pool and an enable ceremony
for a behaviour two existing lanes can carry as an event. Recorded as the named future extension
(annexes E, N3), not built.

**The trigger — two, both on existing carriers, neither a blind loop.**

| # | trigger | carrier | what makes it fire |
|---|---|---|---|
| T1 | **the filing lane's own turn** | an existing `filing` wake (the same credential that just ran `wake_file_document` on an invoice) | after filing, Clara calls the new READ `wake_list_binding_candidates(p_client)` for that client; if it returns an `eligible` vendor she has not already proposed, she proposes — one proposal per turn |
| T2 | **the human ask** — "Clara, propose a binding for this vendor" from the *admin / vendor-bindings* panel | an `interactive` wake off the chat turn | a human clicks; **this is 裁-18c's first named way out** and is therefore *required*, not optional |

**`wake_list_binding_candidates(p_client uuid)` is what makes T1 honest.** It returns, per active
vendor counterparty of the client: `counterparty_id`, `counterparty_name`, `eligible boolean`,
`reason text` (the derivation's own typed refusal word, or `null`), `matched_approved_entries
int`, and `has_open_proposal boolean` / `has_live_binding boolean`. It is a thin STABLE wrapper
over the same predicates the derivation uses, so **Clara never guesses eligibility and never
learns it by triggering a refusal.** Without it, T1 degenerates into "call the proposal door on
every vendor and see what raises" — a refusal-as-probe pattern the estate has paid for before.

**What T1 is NOT.** It is not `_coding_lane_core` counting fingerprints. The lane's `N`-times
observation is *already* the derivation's window (3 approved entries, 3 distinct posting dates,
≥14 days apart, one stable F1) — re-implementing a count in the lane would be a second,
mutually-unaware computation of one fact, which TA-P11's own test forbids. `_coding_lane_core`
is **not touched** (gate question G3).

### 3.2 · The evidence floor — everything durable is DB-derived; the model supplies three things and none of them is a fact

**The proposal Clara sends:**

```
clara.wake_propose_vendor_identity_binding(
  p_client        uuid,     -- walled to w.firm_id
  p_counterparty  uuid,     -- walled by the derivation's canonicalisation
  p_basis         jsonb,    -- 裁-22: {citations:[…]} only; NO model sightings
  p_rationale     text,     -- prose, receipt-only, never a fact
  p_model         jsonb,    -- {provider, model, version}, all three non-blank
  p_op_key        text
) returns jsonb              -- {binding_id, receipt_id, status:'proposed'} | the dedupe echo
```

**Three of the six arguments are identifiers the DB re-validates; two are provenance; one is an
idempotency key. There is no argument the model can use to assert a fact.**

**What the DB derives and durably stores** (unchanged from the human path — `_derive_vendor_binding_proposal`
at prosrc `de0f5807…`, byte-frozen):

`f1_vendor_name_norm` (the windowed LCP, floored) · `f2_invoice_prefix` (the invoice-id common
prefix, ≥6 chars, ≥3 alphabetic, not one of the 14 generic leading tokens) ·
`registration_at_signing` · `content_hash` (sha256 over the four fields + the evidence array) ·
the three evidence rows (`entry_id`, `document_id`, `facts_extraction_id`, `ocr_extraction_id`,
`posting_date`).

**What the DB derives and shows the human but does NOT hash** — the new sibling
`clara._derive_vendor_binding_basis(p_firm, p_client, p_counterparty)`, a STABLE SECURITY DEFINER
read returning:

| key | meaning | why it is not in the hash |
|---|---|---|
| `matched_approved_entries` | the **count** of approved, un-reversed, document-bearing entries whose lines canonicalise to this counterparty — the same predicate as the window but **without** its `limit 3` | a count is a running total; hashing it would make every new invoice drift an open proposal |
| `window_span_days`, `distinct_posting_dates` | the two window facts the ladder gates on | same |
| `resolved_citations` | for each of the three evidence documents, the `document_regions` **row ids** and `text_content` behind `invoice.vendor_name` and `invoice.invoice_id` at that document's current `invoice_facts` extraction | region ids are generation-scoped; a re-extraction would drift the hash and un-sign a valid proposal (S4) |
| `f1_evidence`, `f2_evidence` | the three per-document normalised names and invoice ids the LCP was taken over | derived, presentational |

**This is a strictly stronger 裁-22 posture than the ruling's floor, in the one direction that
matters:** the other two doors take model-supplied citations and must *resolve* them; this door
takes **no citation the model authored as a fact**. `sightings` never appears in the signature.

**And `p_basis` is still required, still resolved, and still refuses.** 裁-22 says *this door's
basis MUST use the shared resolver the `db-proposal-basis` lane is building*, and it does:

- `p_basis` must be an object carrying a non-empty `citations` array. **`sightings` is a
  forbidden key** — supplying it is a typed `CLR10` refusal (`{"reason":"invalid_request",
  "class":"basis","constraint":"no_model_sightings"}`), because the DB owns that number.
- **Every element of `citations` is passed to the shared resolver.** Each must resolve to a
  `clara.document_regions` row that is (a) firm-congruent with `w.firm_id`, (b) attached to the
  **current** extraction generation of (c) **one of the three evidence documents the derivation
  selected**. An unresolvable, cross-firm, stale-generation or foreign-document citation
  **REFUSES the proposal**, typed — nothing is written, no receipt, no card.
- The resolved rows are stored **on the receipt** (`verdict.basis.resolved`), never on the
  binding row, and the sign dialog renders them (§3.6).

> **Interface obligation on the `db-proposal-basis` lane (裁-22).** Its resolver is being written
> for a **one-document** door (`p_document`, the triggering document). This door's basis spans
> **three** documents. The shared resolver must therefore accept a **document set** — e.g.
> `_resolve_proposal_basis(p_firm uuid, p_documents uuid[], p_citations jsonb)` — or this door
> cannot use it and 裁-22's "one contract, never one door" is broken by a signature. **This is
> gate question G2 and the single hardest cross-lane dependency in the item.** The design assumes
> the array form and states the fallback (annexes E, R2).

### 3.3 · What the human sees before signing

The sign dialog is where the two-party shape actually happens, so it carries the whole basis.
`VendorBindingDetailView` (`apps/web/components/firm-admin/vendor-binding-ceremony.tsx:68-106`)
gains an **agent-proposal block**, rendered only when `proposed_by_agent` is true:

1. **Who proposed** — "Clara (agent)" by name, not `shortId(created_by)`. The label is derived
   from `proposed_by_agent`, never from spelling the uuid (review law 3).
2. **The model** — provider / model / version, verbatim from the receipt.
3. **Her rationale** — verbatim, labelled as *Clara's reasoning*, visually separated from every
   DB-derived figure so no reader can mistake prose for a fact.
4. **The DB-derived fingerprint** — F1, F2, the registration at signing, and the 16-char
   `content_hash` prefix the view already renders.
5. **The DB-derived count** — "*N* approved invoices from this vendor match this fingerprint",
   with the window facts (3 dates, span in days) beside it. **`matched_approved_entries`, from
   the DB, never from Clara.**
6. **The resolved citations** — for each of the three evidence documents, the region text the
   fingerprint was taken from, deep-linked to the document. Per 裁-22 this list is *resolved or
   absent*: there is no "unresolved" state to render, because an unresolvable citation refused
   the proposal before the card existed.
7. **The unchanged consent line**, re-worded — see §3.6 and annexes G.

### 3.4 · The walls — every one behavioural, every one fail-closed

| # | wall | mechanism | refusal |
|---|---|---|---|
| **W1** | a live wake credential | `wake_context()`; `credential_id is null` ⇒ refuse | `CLR03` |
| **W2** | the per-kind allowlist (PRD §6 2(c)) | `assert_wake_allowed(w.wake_kind, 'wake_propose_vendor_identity_binding')` — `filing` and `interactive` admitted, the other five kinds refused | `CLR03` |
| **W3** | firm congruence on the client | `exists(select 1 from clara.clients where id=p_client and firm_id=w.firm_id)` — the `wake_propose_identifier_promotion` idiom, needed because `filing`/`interactive` credentials carry `client_id IS NULL` (S2) | `CLR11` |
| **W4** | counterparty congruence + liveness | delegated, unchanged, to `_derive_vendor_binding_proposal`: canonical, `kind='vendor'`, `merged_into is null`, `retired_at is null`, non-blank `registration_normalized` | `CLR36` `binding_counterparty_inactive` / `binding_unattributable` |
| **W5** | rationale present, model complete | typed `CLR10` on a blank `p_rationale`; typed `CLR10` unless `p_model` is an object with non-blank `provider`+`model`+`version` | `CLR10` |
| **W6** | **裁-22 basis** | object; non-empty `citations`; **`sightings` forbidden**; every citation resolved by the shared resolver against the three evidence documents, firm-congruent, current generation | `CLR10` (shape) / `CLR36` `basis_unresolvable` |
| **W7** | **no duplicate OPEN proposal** (closes S6) | **`create unique index uq_vib_one_open_proposal on clara.vendor_identity_bindings(client_id, counterparty_id) where status='proposed'`** — no body change: `propose_vendor_identity_binding` already maps `unique_violation` → `binding_conflict` (`0028:770-772`), and the new core does the same | `CLR36` `binding_conflict` |
| **W8** | no live binding already | delegated, unchanged, to the derivation's `binding_conflict` rung | `CLR36` |
| **W9** | expiry ≤ 12 months | unchanged: `expires_at = now() + interval '12 months'`, capped by the live `ck_vib_expiry CHECK (expires_at <= created_at + '1 year')` | `23514` |
| **W10** | **the honest label** | `check (proposed_by_agent = (created_by = clara.agent_user_id()))` — **bidirectional**, so a human row cannot claim agency AND an agent row cannot hide it. Legal because `agent_user_id()` is `sql IMMUTABLE` and relation-free (S3); prediction P-2 settles it on the rig | `23514` |
| **W11** | the model/receipt honesty pair | `check (proposer_model is null or proposed_by_agent)` and `check (proposal_receipt_id is null or proposed_by_agent)` — 0142's D-3 idiom | `23514` |
| **W12** | receipt congruence | `foreign key (proposal_receipt_id, firm_id) references clara.binding_agent_receipts(id, firm_id)` — a structural FK, not a bare uuid (0142's `fk_onboarding_plans_opened_from_question` idiom) | `23503` |
| **W13** | reserve-first idempotency | `_reserve_op(w.firm_id, 'wake_propose_vendor_identity_binding', p_op_key, _hash({client, counterparty, basis}))` placed **before** W7/W8, so a genuine replay short-circuits before it can trip the duplicate wall against its own first call (0142's own rig lesson, `:415-432`). `p_rationale` and `p_model` are deliberately **outside** the hash | dedupe echo |

**On W5's placement.** `p_rationale`/`p_model` are checked **before** `_reserve_op` (the
`wake_propose_identifier_promotion` N-1 fix: without it the refusal still happens, via the table
CHECK, but as an untyped `23514` *after* the reservation).

**On 裁-18a (not this item, but this design must not break it).** The wall the hardening lane
will add to `sign_vendor_identity_binding` must be written as
`if b.signed_by_candidate = b.created_by then refuse` — i.e. **an actor comparison, not a
"the proposer must be human" test.** Written the second way it would refuse Clara's proposals and
strand every single-admin firm, defeating 裁-18c. `created_by = agent_user_id()` is never equal
to any human `c.actor`, so the correct form passes trivially. Flagged to that lane in annexes G.

### 3.5 · Receipts — a NINTH registered member (`binding_agent_receipts`)

Neither existing table can host this act (survey S7, measured): `agent_filing_receipts`'
`ck_agent_filing_receipts_filed_iff_clean` makes a clean, filing-less receipt structurally
impossible, and relaxing it is the vacuous-relaxation class the W2/W3 close named (lesson ③);
`agent_act_receipts` demands a `wake_task_id` FK the chat-turn trigger has not got, plus two
close-domain closed-world CHECK widenings.

So: **`clara.binding_agent_receipts`**, mirroring `0142`'s D-4 exactly — the table, the shim view,
the registry row, the two closed-world regex widenings, and the ninth `UNION ALL` arm in
`clara._agent_receipts_all` (`clara.agent_receipts_visible` itself stays untouched; it already
reads `r.*` from the union). Shape, the 19-column contract mapping and the tail-census cells are
annexes B.

Key shape decisions, each with its reason:

- `client_id NOT NULL` and `counterparty_id NOT NULL` — this act is always client- and
  counterparty-scoped; unlike F-A7b's plan-tied acts there is no future member that is not.
- `binding_id uuid` **nullable**, `subject_id` in the shim = `coalesce(binding_id, counterparty_id)::text` —
  a **refused** proposal has no binding row, and a refusal receipt is still a receipt.
- `verdict jsonb NOT NULL` carrying `{outcome:'proposed'|'refused', basis:{citations, resolved},
  derived:{f1, f2, registration, content_hash, matched_approved_entries, window_span_days,
  distinct_posting_dates}}` — **the derived block is written from the DB's own return value**, so
  the receipt reproduces the card from DB-owned inputs.
- `failing_rungs text[] NOT NULL default '{}'` + `check ((binding_id is not null) = (failing_rungs = '{}'))`
  — the `0126` filed-iff-clean idiom, in the form that is *true* for this act rather than
  borrowed and relaxed.
- `trigger_kind check in ('wake_task','chat_turn')` and `trigger_id` — carrying the pre-existing
  contract looseness the 裁-22 record already minutes (`trigger_id` = the credential uuid); this
  item does **not** invent a fix, it inherits the backlog item verbatim.
- append-only trigger pair, forced RLS, owner-only policy, **zero** non-owner table grants — the
  receipt is read through `agent_receipts_visible` and nowhere else.

**The registry key is gate question G4.** The live regexes admit `^f_a[0-9]+[a-z]?$` only. This
item has no F-A number (it is a pre-beta ruling item), so an honest key needs one more widening.
Recommendation and the two alternatives: gate record G4.

### 3.6 · The frontend — the panel first, the inbox row second

**PR-e-shaped card, but the home is the panel, not `/needs-you` — in train 1.**

Measured (S8): `vendor_binding` is not a `list_review_queue` `row_kind`; 裁-17 is minting the
**ninth** (`seeding_proposal`) right now on the same body; F-A7b's PR-e `/needs-you` proposal card
does not exist yet. Two lanes CoR-ing `clara.list_review_queue` in one window is the exact
first-chain-meeting collision the W2/W3 close paid for (lesson ⑥).

So the design splits the frontend in two:

**Train 1 — the *admin / vendor-bindings* panel (no DB read-surface risk, no shared-body CoR).**

1. **Row badge.** `list_vendor_bindings` gains `created_by uuid` and `proposed_by_agent boolean`
   so `VendorBindingRowActions` can render an "Proposed by Clara" chip **from the boolean**,
   never by comparing a uuid in TypeScript (review law 3 — the client must not carry the agent
   sentinel as a constant).
2. **The sign dialog** gains the §3.3 agent-proposal block inside `VendorBindingDetailView`.
3. **"Ask Clara to propose"** — a control beside `ProposeBindingDialog` that opens the T2 chat
   ask. It is the 裁-18c escape hatch and must be reachable **even when the manual propose door
   refuses** (the F3 lesson from PR #395: a failed read must never make a trigger vanish).
4. **The copy flips back.** `apps/web/messages/en.json:1898` and `:1915-1917` currently say
   *"the same admin who proposed it may also sign it"* / *"not required to be different
   people"* — true today, **false the day 裁-18a lands**. Annexes G carries this as a
   cross-lane obligation with both strings quoted.

**Train 2 (sequenced AFTER 裁-17's ninth row_kind merges) — the inbox row.** A tenth
`row_kind = 'vendor_binding_proposed'`, one row per open agent-proposed binding, deep-linking
into the *admin / vendor-bindings* panel, plus its `NEEDS_YOU_AFFORDANCES` entry and its
`REVIEW_QUEUE_ROW_KINDS` extension. Gate question **G5**.

**Not built here:** a `ClaraPart` member. The 18-member union
(`apps/web/lib/parts/types.ts:102-120`) and `PART_CATALOG` are guarded by a compile-time
exhaustiveness check and land in one batched wire bump; a binding-proposal part rides that bump
or nothing (annexes E, N4).

---

## 4 · The build sequence

| PR | scope | D1 | ceremony |
|---|---|---|---|
| **PR-1 (additive)** | `_derive_vendor_binding_basis` · the three honest-label columns + W10/W11/W12 · `uq_vib_one_open_proposal` · `binding_agent_receipts` + shim + registry row + the two regex widenings + the ninth union arm | **EMPTY** — no PL/pgSQL body replaced; one view (`_agent_receipts_all`) CoR'd, which is not a D1 event (0142 §0's own reasoning) | none |
| **PR-2 (the door)** | `_propose_vendor_binding_agent_core` · `wake_propose_vendor_identity_binding` · `wake_list_binding_candidates` · 4 allowlist rows · 4 grants | **EMPTY** — both are new names | none |
| **PR-3 (reads)** | CoR `list_vendor_bindings` (+2 columns) and `get_vendor_binding` (+`proposal` key) | **two STABLE read bodies** — pinned by prosrc, no write-quiesce (annexes J) | none |
| **PR-4 (frontend, train 1)** | the badge · the sign-dialog basis block · "ask Clara to propose" · the copy flip | — | — |
| **PR-5 (frontend/DB, train 2)** | the tenth `row_kind` — **only after 裁-17's ninth merges** | `list_review_queue` (STABLE read) | none |

**Dependency:** PR-2 cannot merge before 裁-22's shared resolver exists (W6). If 裁-22 slips,
PR-1 still lands and PR-2 waits — it does **not** ship with a shape-only basis floor, because
that would mint a third door for 裁-22 to fix (annexes E, R2).

---

## 5 · What this design deliberately does NOT do

1. **It does not touch `_derive_vendor_binding_proposal`.** The hash covers the evidence (S4);
   every extension is a non-hashed sibling.
2. **It does not touch `sign_vendor_identity_binding`.** The signer already accepts any
   `proposed` row and re-derives. 裁-18a's wall is that lane's PR.
3. **It does not touch `_coding_lane_core`.** No second count of a fact the derivation already
   computes (gate question G3).
4. **It does not restore the post-time re-check** (S5). Real gap, `_approve_entry_core` blast
   radius, its own ruling — gate question G6.
5. **It does not add a `decline` verb or an expiry sweep** (A3/A4) — gate question G7.
6. **It does not mint a wake kind, a role, a login pool, a `wake_engine_sources` row or a
   workflow export.**
7. **It does not take an egress authorization** (S9) and therefore does not widen the egress
   purpose CHECK.
8. **It does not let Clara sign, decline, revoke or shorten an expiry.** The door proposes. The
   only status transition it can cause is `null → proposed`.
