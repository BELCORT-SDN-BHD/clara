# Typed egress activation runbook (migration 0020 · WB-R23)

**Owner-only. Run per client, at the owner's pace, AFTER the 0020 ceremony.**
*(Updated 2026-07-25 for the ratified contract v1.1 amendments: step 1 now has a real
owner verb, and consumption re-verifies the dispatch it is used for.)*
Activation is deliberately **not** part of the deploy ceremony: 0020 ships with zero
typed consents and zero activations, and that emptiness is what makes model synthesis
dark. Lighting a client is a separate, considered act.

There is **no consent-granting dashboard surface** and 0020 does not build one. All five
verbs — `classify_consent_evidence_document`, `grant_`, `activate_`, `deactivate_` and
`revoke_client_egress_purpose` — are owner-RPC-only through PostgREST under an **owner**
JWT (`clara_authenticated` EXECUTE + an in-function `owner` role floor). They are
unreachable by `clara_runtime`, `clara_agent_ro` and both wake roles.

---

## What activation actually authorizes

`wiki_synthesis` — sending one client's confidential context to a third-party model to
maintain that client's CLARA advisory wiki pages. Nothing else.

It does **not** touch the invoice-facts lane. That lane is governed by the legacy,
purpose-blind `clara.client_egress_consents` relation and its own owner verbs
(`grant_client_egress` / `revoke_client_egress`), which 0020 leaves byte-identical. The
two surfaces are separate relations on purpose: a wiki grant can never authorize
invoice-facts egress, and a wiki revoke can never disturb it.

**A grant alone never authorizes.** Consent and activation are two records. That is the
whole point of step 3 below — confirm the verdict is still `unknown` after granting.

---

## The recipe

### 1. Ingest the signed re-attestation letter, then classify it as consent evidence

Get the client's signed per-client re-attestation letter into `clara.documents` through
the normal intake and confirm its bytes are verified. Then stamp it:

```sql
select clara.classify_consent_evidence_document(
  '<evidence-doc>', '<why — e.g. "signed WB-R23 re-attestation, 2026-07-25">', '<op key>');
```

Returns `{"document_id": "...", "document_kind": "consent_evidence", "prior_kind": null}`.

Confirm:

```sql
select id, document_kind, bytes_verified_at
from clara.documents
where id = '<evidence-doc>' and firm_id = '<firm>';
```

You need `document_kind = 'consent_evidence'` **and** a non-null `bytes_verified_at`.

Refusals: `CLR10` blank op key or blank reason · `CLR11` the document is not in your firm
· `CLR28` `evidence_mismatch` (not ingested, or bytes not verified) · `CLR28`
`evidence_kind_conflict` (the document is already classified as something else — you
cannot re-label a coded invoice as a consent letter) · `CLR03`/`CLR04` if the caller is
not an owner. It is idempotent: the same op key with the same arguments replays the
receipt, and re-classifying an already-`consent_evidence` document is a no-op.

> **What this verb does and does not do.** It stamps the kind and **grants nothing** — no
> legacy consent, no typed consent, no activation, no authorization. That separation is
> the point of the verb. `clara.grant_client_egress_purpose` (step 2) is a *reader* of
> the evidence artifact: it validates the stamp, it never applies it and it never mutates
> `clara.documents`.
>
> **Why it exists (added 2026-07-25).** Until this verb landed, the only live writer of
> `document_kind='consent_evidence'` was the **legacy** `clara.grant_client_egress`
> (0014), which in the same call mints a purpose-blind consent authorizing invoice-facts
> egress — and `clara.set_document_kind` refuses the kind outright ("consent-evidence
> classification is owned by the egress consent path", CLR28). So a client who consented
> **only** to wiki synthesis could not be onboarded without being granted egress they
> never agreed to. Wiki consent now requires no legacy consent at all.
>
> The stamp also makes the letter structurally non-egressable in the other direction:
> 0014's `_enqueue_invoice_facts_core` exempts a `consent_evidence` document, so the
> consent letter itself is never sent to a vendor.

### 2. Grant the typed consent

```sql
select clara.grant_client_egress_purpose(
  '<client>', 'wiki_synthesis', '<evidence-doc>',
  '<scope note — what the client actually agreed to>',
  '<op key, unique per attempt>');
```

Returns `{"consent_id": "...", "purpose": "wiki_synthesis", "status": "live"}`.

Refusals: `CLR10` malformed args / blank op key / unknown purpose · `CLR11` client not
active in your firm · `CLR28` `evidence_mismatch` (null, wrong kind, unverified bytes, or
another firm's document) · `CLR28` `duplicate_live` (this client already has a live typed
consent for this purpose — revoke it first) · `CLR10` from `_reserve_op` if you reuse an
op key with different arguments · `CLR03`/`CLR04` if the caller is not an owner.

### 3. Confirm the verdict is STILL `unknown`

This is the proof that a grant alone does not authorize. Run it as `clara_runtime`
(the only role that can):

```sql
set role clara_runtime;
select clara.prepare_egress_dispatch('<firm>', '<client>', 'wiki_synthesis', 0, 'probe');
reset role;
```

Expect exactly `{"verdict": "unknown", "authorization_id": null}`.

*(A probe mints nothing when the verdict is `unknown`; on `granted` it does mint a
single-use, 120-second authorization row — harmless, it simply expires unconsumed.)*

### 4. Activate

```sql
select clara.activate_client_egress_purpose(
  '<client>', 'wiki_synthesis', '<consent_id from step 2>', '<op key>');
```

`p_consent` must **be** the live typed consent for that (client, purpose) — a blind
activation is impossible. This is the version-match law: a later revoke-and-regrant mints
a **new** consent id that no existing activation names, so re-attestation alone can never
silently re-authorize dispatch. The owner must activate the new consent explicitly.

Refusals: `CLR28` `no_consent` · `CLR28` `consent_mismatch` · `CLR28` `duplicate_live`.

Activation also clears the client's wiki synthesis hold, through the audited writer.

### 5. Confirm it is lit — for that client only

```sql
set role clara_runtime;
select clara.prepare_egress_dispatch('<firm>', '<client>', 'wiki_synthesis', 0, 'probe');
reset role;

select * from clara.wiki_synthesis_holds where client_id = '<client>';   -- expect zero rows
```

Expect `{"verdict": "granted", "authorization_id": "<uuid>"}` and no hold row. Synthesis
lights for **that client only**. Every un-activated client stays fail-closed, and
deterministic ingest and the deterministic counterparty paths are independent of all of
this.

### 6. Withdrawal

```sql
-- full withdrawal: revoke the consent, deactivate its activation, invalidate every
-- unconsumed authorization, set the hold — all in one transaction.
select clara.revoke_client_egress_purpose('<client>', 'wiki_synthesis', '<reason>', '<op key>');

-- or PAUSE without discarding the consent record:
select clara.deactivate_client_egress_purpose('<client>', 'wiki_synthesis', '<reason>', '<op key>');
```

Both refuse with `CLR10` on a blank reason or op key, and `CLR28` (`no_consent` /
`no_activation`) when there is nothing live to withdraw.

To resume after a pause, run step 4 again against the same still-live consent.

---

## What withdrawal does and does not stop — stated honestly

**Consumption is the dispatch linearization point.**

- A revocation **committed before** an authorization is consumed **must refuse**, and
  does: `consume_egress_dispatch` returns `unknown`, the model is never called, nothing is
  published, and the event records `held_consent`.
- An authorization can only ever be spent on **the dispatch it was minted for**. Consume
  re-verifies the firm, the client, the purpose and the exact event before consuming; a
  mismatch returns the same `unknown` and leaves the authorization untouched. So a
  cached, injected or misassociated authorization cannot carry one client's data under
  another client's consent — that binding is enforced in the database, not by the
  runtime remembering which id belongs to which client.
- The 120-second TTL is **wall clock**. A caller sitting inside a long-open transaction
  cannot extend it by holding that transaction open.
- An authorization **consumed before** the revocation commits **may dispatch**. Those
  bytes were authorized; the revocation applies from its own commit forward.
- **Absolute cancellation after consumption but before the bytes leave the process is not
  achievable** by this design, and nothing here claims it. Closing it would require
  holding a database lock across the external HTTP request (an external stall would pin a
  connection and a row lock indefinitely) or routing egress through a transactional
  outbound proxy — a different architecture. The residual window is the interval between
  `consume_egress_dispatch` committing and the request reaching the socket: normal-case
  sub-millisecond.

This is strictly stronger than the pre-0020 behaviour, where the window ran from a
plan-time consent read through a wiki-context read to the model call and the revoker had
no way to invalidate anything at all.

**One more known behaviour, benign and visible.** An event that planned `held_consent`
just before an activation can commit its hold just after it, re-parking a client you have
just lit. It fails in the safe direction, it is visible (the hold row carries a reason and
a `since`), and you clear it by re-activating.

---

## What the owner can see (and the runtime cannot)

Withdrawal history, evidence, scope notes, grant times and identifiers live in
`clara.client_egress_purpose_consents`, `clara.client_egress_purpose_activations`,
`clara.egress_dispatch_authorizations`, the audit log, and the four
`egress.purpose_*` domain events. All three relations are FORCE-RLS with a single
`clara_fn_owner` policy and **no table grant to any application role** — the DEFINER verbs
are the entire surface.

The runtime sees exactly two things: `granted | unknown`, and an opaque authorization id.
No timestamps, no consent id, no evidence, no scope, no history, no counts. `unknown`
covers "never attested", "attested then withdrawn", "granted but never activated",
"deactivated", "foreign firm", "unknown client" and "unknown purpose" with a
byte-identical payload — because all of them lead to the same safety action, and telling
them apart would hand the runtime an oracle for "did this client ever consent, and did
they withdraw?".
