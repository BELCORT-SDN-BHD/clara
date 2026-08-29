# 裁-18b — Annex K: the fold-round verb contracts (2026-08-30, PR-1 as shipped)

> Companion to `binding-proposal-annexes.md` (v2, 2026-08-30 fold round), split into its own
> file to keep the parent under this repo's per-file line cap. Referenced from that file's
> Annex K stub and from its Annex F change log.

*(Added by the fold round; no prior version of the annex specified any of the three verbs
below — the gate's M7 finding named this gap explicitly: "Annex A specifies no `decline` verb
at all — no name, signature, floor, audit/event or transition guard.")*

Every fact below is read directly from `packages/db/migrations/UNNUMBERED_binding_proposal_pr_1.sql`
(tip `7829adf0`), not inferred and not copied from any older draft.

## K.0 — the one lock, the one order (H6 / C-1)

Every lifecycle writer on `clara.vendor_identity_bindings` — both proposal doors, `sign_`,
`decline_`, `reset_binding_decline` and the stale-proposal sweep below — now follows **one**
protocol, in **one** order, via **one** helper (`clara._binding_lock_pair(p_client uuid,
p_counterparty uuid)`, `SECURITY DEFINER`, ungranted, `pg_advisory_xact_lock` over
`hashtextextended(client::text || ':' || counterparty::text, 0)`, transaction-scoped and
reentrant):

1. **Read the immutable `(client_id, counterparty_id)` pair WITHOUT locking** — for a door
   handed a `binding_id` rather than a pair (both verbs below). Those two columns have no writer
   anywhere in the estate, so an unlocked read of them cannot go stale.
2. **Take the pair advisory transaction lock** — `clara._binding_lock_pair`.
3. **Re-read the row `FOR UPDATE`**, and judge everything from that second read.

A door that is handed the pair directly (both proposal doors, `_expire_stale_proposals`) starts
at step 2. Before this fold round the lifecycle ran three different protocols: both proposal
doors took the pair key; `sign_` took the row lock and only then the pair key (the inverted
order, driven to a real `40P01`); `decline`, `reset` and the sweep took no pair key at all — the
gap that let a `decline` committing inside an open transaction race a concurrent `propose` past
its own suppression read and land a live binding on a pair a human had just refused.

## K.1 — `clara.decline_vendor_identity_binding(p_binding uuid, p_reason text, p_op_key text) returns jsonb`

The human "no" (gate ruling G7, first half). Closes survey A3: the `status` CHECK has admitted
`'declined'` since `0028` and no verb had ever written it.

- **Role floor.** `clara._human_ctx(clara.role_rank('admin'))` — the signer's own floor, because
  declining is that decision said the other way.
- **Required arguments and refusal tokens.**
  - `p_op_key` — required, non-blank, else `'op_key is required'` (`CLR10`).
  - `p_binding` — required (not null), else `'binding is required'` (`CLR10`).
  - `p_reason` — required after `btrim`, else `decline_reason_required` (`CLR36`).
  - The binding must exist and belong to the caller's firm — checked on both the initial
    unlocked pair read and the post-lock `FOR UPDATE` re-read — else `'binding not found'`
    (`CLR11`).
  - The binding's `status` must be `'proposed'`, else `binding_not_proposed` (`CLR36`).
- **Status transition.** `proposed → declined`. Sets `declined_by = <acting admin>`,
  `declined_at = now()`, `decline_reason = <the trimmed reason>`.
- **Lock order.** K.0's protocol from step 1: read `(firm_id, client_id, counterparty_id)`
  unlocked by `id`, confirm firm congruence, `clara._binding_lock_pair(client_id,
  counterparty_id)`, re-read the row `FOR UPDATE`, re-confirm firm congruence and `status`.
- **Idempotency.** `_reserve_op` / `_finish_op` on `p_op_key`, hashed over
  `{binding_id, reason}`.
- **Audit payload** (`clara._audit`, action `decline_vendor_identity_binding`): `binding_id`,
  `client_id`, `counterparty_id`, `reason`, `op_key`.
- **Domain event.** `kb_binding.declined`, keyed on `client_id`, actor the declining admin,
  payload `{binding_id, counterparty_id}`.
- **Grant.** `clara_authenticated`.
- **Read by.** The loop brake in `clara.wake_list_binding_candidates` and the declined-history
  suppression wall in the recut `propose_vendor_identity_binding` — via
  `clara._binding_suppression` — so Clara never re-proposes what a human just declined.

## K.2 — `clara.reset_binding_decline(p_binding uuid, p_reason text, p_op_key text) returns jsonb`

The named human door out of a decline (gate ruling (b)). Without it a single "no" would mean
"never, by anyone, forever."

- **Role floor.** `clara._human_ctx(clara.role_rank('admin'))` — the same rank that declined.
- **Required arguments and refusal tokens.**
  - `p_op_key` — required, non-blank, else `'op_key is required'` (`CLR10`).
  - `p_binding` — required (not null), else `'binding is required'` (`CLR10`).
  - `p_reason` — required after `btrim`, else `reset_reason_required` (`CLR36`).
  - The binding must exist and belong to the caller's firm — checked on both reads, else
    `'binding not found'` (`CLR11`).
  - `status` must be `'declined'` or `'revoked'`, else `binding_not_suppressing` (`CLR36`).
  - **If `status = 'revoked'`, the door refuses** with `binding_revoked_reset_requires_ruling`
    (`CLR36`) — **this door lifts a DECLINE only.** M-11 (2026-08-30): a decline is "I looked at
    this card and said no"; a revocation is "I trusted this binding, watched it post real
    entries, and took the authority away" — a stronger statement, and letting the same
    reason-and-a-click undo it was a relaxation nobody ruled. This is the fail-closed default,
    deliberately, pending a separate owner ruling on what ceremony should lift a revocation; it
    is an **open question**, not yet answered.
- **Status transition.** `declined → expired` (not deleted, not re-opened to `proposed` — it does
  **not** re-propose). Clears `declined_at` and `decline_reason` to `null` in the same statement
  (`ck_vib_declined` pairs `declined_at` with `status = 'declined'`, so the stamp cannot survive
  on an `'expired'` row). `declined_by` is deliberately left on the row — it is not CHECK-paired
  to `status`, and who said no is history worth keeping. A `'revoked'` row never reaches this
  update (refused above).
- **Lock order.** K.0's protocol, identical to K.1's.
- **Idempotency.** `_reserve_op` / `_finish_op` on `p_op_key`, hashed over
  `{binding_id, reason}`.
- **Audit payload** (`clara._audit`, action `reset_binding_decline`): `binding_id`, `client_id`,
  `counterparty_id`, `reason`, **plus every column the door cleared** —
  `declined_by`, `declined_at`, `decline_reason`, `prior_status` — and `op_key` (M-11, second
  half: an audit line naming only some of what it erased is a summary, not a receipt).
- **Domain event.** `kb_binding.decline_reset`, keyed on `client_id`, actor the resetting admin,
  payload `{binding_id, counterparty_id}`.
- **Grant.** `clara_authenticated`.

## K.3 — `clara._expire_stale_proposals(p_firm uuid, p_client uuid, p_counterparty uuid) returns integer`

The in-door stale-`proposed` sweep (gate B5). Not a door any role calls directly — an internal,
ungranted helper called FIRST by **both proposal writers**, for exactly one
`(client, counterparty)` pair at a time.

> **NOT by the eligibility read (M8).** `clara.wake_list_binding_candidates` is `STABLE` and
> calls nothing that writes: it treats a past-expiry `'proposed'` row as non-open **in its own
> predicate**, which is the same answer this sweep would produce, arrived at without writing. An
> earlier cut did call this helper from that read, which contradicted the volatility contract,
> gave the read a stale snapshot over its own side effects, and escaped as an untyped `25006`
> inside `begin read only`. The drain lives in the locked writer doors and nowhere else.

- **Role floor / grant.** None — `SECURITY DEFINER`, `revoke all … from public`. It has no
  caller-facing floor because it is not itself a caller-facing door.
- **Why it exists.** Nothing in the estate had ever expired a `'proposed'` row — every
  `status = 'expired'` write in `0028` filters `status = 'live'`. Once
  `uq_vib_one_active_binding` covers `('proposed','live')`, an unanswered twelve-month-old
  proposal would otherwise be simultaneously unsignable (`sign_` refuses `binding_expired`) and
  un-re-proposable (the unique index refuses the new row) — permanently stuck behind a
  `binding_conflict` nobody could act on.
- **Required arguments and refusal tokens.** `p_firm`, `p_client`, `p_counterparty` — no
  refusal tokens of its own; it does not raise on a business-rule failure, it performs the sweep
  and returns the count of rows it expired. (`clara._binding_lock_pair` underneath it still
  raises `invalid_request`/`pair_lock` (`CLR10`) if either id is null.)
- **Status transition.** `proposed → expired`, for every row scoped to
  `(firm_id, client_id, counterparty_id)` where `status = 'proposed'` and `expires_at <= now()`
  — one row at a time, in a loop, each with its own audit line and event.
- **Lock order.** K.0's protocol from step 2: it is handed the pair directly by its callers, so
  it takes `clara._binding_lock_pair(p_client, p_counterparty)` immediately, before its `UPDATE`
  takes any row lock. Reentrant, so a caller that already holds the key (both proposal writers,
  which call `_binding_lock_pair` themselves first) calls straight through.
- **Audit payload, per expired row** (`clara._audit`, actor `clara.agent_user_id()`, action
  `expire_stale_binding_proposal`): `binding_id`, `client_id`, `counterparty_id`,
  `proposed_by` (the expired row's `created_by`).
- **Domain event, per expired row.** `kb_binding.expired`, keyed on `client_id`, actor
  `clara.agent_user_id()`, payload `{binding_id, counterparty_id}`.
- **Scope note.** This is the in-door half only, scoped to one pair at a time and run inline by
  a writer. The clocked, estate-wide sweep (every stale `'proposed'` row, unattended) is PR-4's,
  where law 80's per-run receipt obligation applies — this function is not that sweep and is not
  itself receipted as a "run."

## K.4 — the identity walls' NAMED LIMITS (recorded, not papered over)

Written down because a wall whose edges are not stated will be trusted past them.

- **`binding_client_identity_unproven` is a real cost, not a formality.** A client whose SSM or
  TIN the firm has not recorded in `clara.client_identifiers` gets **no vendor binding at all**.
  That is the fail-closed answer to a wall that otherwise cannot be evaluated: "no matching
  identifier row" is the same answer a client with none gives and a client with a genuinely
  foreign vendor gives, and reading it as the second is absence-as-evidence (`0049:967` refuses
  the same inference one lane over). The FE surfaces it as *"record this client's SSM or TIN
  first"*, not as an error.
- **"Recorded" is not yet "comparable" — the rung's own hairline tail.** Rung 1 asks whether a
  `client_identifiers` row of kind `tin`/`ssm` exists; rung 2 compares it through
  `clara._binding_hard_id_norm`, which is NULL for a value carrying no alphanumerics at all.
  `0007:228` forbids only a blank after `btrim`, so a recorded identifier of `"---"` clears rung 1
  and is invisible to rung 2 — the same absence-cannot-be-evaluated shape, one level down. The fix
  is one conjunct (`… is not null` on rung 1, so both rungs range over the same set) and it can
  only tighten. **Open, awaiting a ruling** — recorded here rather than argued away from `0007`'s
  CHECK, which would be exactly the derivation this annex refuses one bullet up.
- **ONE recorded kind is enough, and that leaves a hole.** Requiring both would strand the many
  Malaysian SMEs that hold an SSM long before a TIN, for a reason unrelated to the vendor being
  bound. The consequence: **a TIN-only client cannot detect its own SSM mislabelled as a vendor
  id.** The customer-side wall (`binding_identifier_ambiguous_party`) covers the case where the
  page LABELS that number as the buyer's; the unlabelled case is open until the client records
  the other kind.
- **`invoice.vendor_registration` is the extractor's CLAIM that a region is the vendor's**, and
  these walls trust that claim. A mislabelled customer block is an extraction defect, not a
  binding defect — except in the two cases above, which are cheap to refuse and never lawful.
- **The economic fingerprint is not tamper-proof, by design.** Three rescans with EDITED totals
  are three forged bills a human approved over fourteen days: an insider approving forgeries is
  outside this wall's threat model, and the wall's job is the ACCIDENTAL and the OPPORTUNISTIC
  three-scans-of-one-invoice case. The lawful collision — two genuinely different invoices with
  identical economics — is a fail-closed FALSE REFUSAL carrying its own token, which a human can
  see and act on.
- **The later upgrade.** Validated e-invoice supplier identity (MyInvois) makes the issuer's
  identity cryptographically attested rather than extracted, and retires most of this section.
  That is P6+, and deliberately not this PR.
