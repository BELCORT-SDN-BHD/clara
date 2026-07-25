# Migration 0020 — typed egress consent + dispatch authorization (WB-R23 · WB-R24(iii)) · design contract v1.1 (RATIFIED)

> **Status: RATIFIED v1.1 — v1.0 plus the ratified ratchet-R1 amendments (2026-07-25).**
> v1.0 was ratified as a *design* contract; ratchet R1 reviewed the BUILD against it,
> cross-model and repo-grounded, and found four things wrong **with the contract
> itself**, not merely with the build. All four are amended below, in place, with the
> v1.0 wording preserved wherever it is still true. Nothing else in this document is
> rewritten.
>
> | # | Amendment | Landed in |
> |---|---|---|
> | **A1** | `consume_egress_dispatch` takes **six** arguments and re-verifies the dispatch it is being used for. v1.0's two-argument form made §3.2's client/purpose/event binding **audit-only** — two independent reviews found it, one as a NIT and one as a BLOCKER. | **§3.2**, **§3.4**, **§3.7**, **§8**, **§9.1**, **§10.2** |
> | **A2** | TTL and expiry are **wall clock** (`clock_timestamp()`), and the runtime's consume helper runs in its **own committed transaction**. v1.0 left §3.6's linearization claim conditional on a caller nobody had audited. | **§3.2**, **§3.4**, **§3.6**, **§3.7**, **§9.3** |
> | **A3** | A fifth owner RPC, `classify_consent_evidence_document`. v1.0's §7.2 step 1 was **not executable**: no verb could stamp `document_kind='consent_evidence'` without also granting purpose-blind legacy egress. | **§7.1**, **§7.2**, **§8**, **§9.1**, **§9.7** |
> | **A4** | §6's byte-identity pins hash **exact `prosrc` with SHA-256** and add legacy **ACL** and **relation-structure** pins. v1.0's normalized-md5 pin was neither byte nor semantic identity. | **§6**, **§8** |
>
> Two **errata** are ratified with them: §8's "three partial unique indexes" is wrong
> (two uniques + one non-unique open-authorization index — see §8), and §3.3/§5.1's
> absolute timing-oracle language is replaced by an honest, bounded statement (§3.3).
>
> **Ratification of v1.0** followed the ADR-037 method: an
> orchestrator draft (v0.1) → a cross-model adversarial design debate (Codex
> `gpt-5.6-sol`, xhigh, read-only, repo-grounded) which returned **REJECT as a
> ratification basis** with twelve BINDING AMENDMENTS and four named authorization
> blockers (cross-purpose consent bleed · nondeterministic revocation · ineffective
> activation · surviving dispatch/resolver races) → orchestrator adjudication, which
> **accepted all twelve** and verified every cited anchor at source. v0.1's central
> schema decision (typed purposes carried on `clara.client_egress_consents`) is
> **withdrawn**; §9's open-item list is **closed**. The changelog at the end maps each
> amendment to where it landed and records the citations that were wrong.
>
> This contract is the build authority. It is written to be sufficient **alone** for a
> blind SQL-build lane and, independently, a blind test lane. It states WHAT must hold
> and HOW it is verified; it contains no SQL implementation.
>
> **Discipline (WB-R24(iii)):** an ADDITIVE micro-migration · rig-validated on a
> throwaway PG17 · dual-reviewed · behind an OWNER-gated ceremony · per-gate
> version-pinned. **No workflow-body changes; zero freeze-manifest implication** — the
> wiki-projection consumer is a `startWorld` plugin, not a frozen WDK workflow, so
> `check-frozen-workflows.mjs` does not apply and no `_vN` bump is required.
>
> **Built and applied AFTER 0019.** Every anchor below that lives in a file 0019
> rewrites is stated by SYMBOL, never by line, and marked *anchor re-grounded at build
> time, post-0019*.

---

## 0. Scope

The WB-R23 trio, with the machinery the ruling actually requires:

1. **Typed purposes** in the consent surface — a **separate** relation, first and only
   entry `wiki_synthesis`; legacy free-text rows never map (§1).
2. **A short-lived audited authorization** bound to firm + client + typed purpose +
   consent version + activation version + dispatch intent, **prepared** at plan time
   and **consumed** atomically at the model-dispatch boundary (§3). Plus the positive
   owner-only **activation** the ruling's "explicit owner re-attestation before
   synthesis lights" implies (§2).
3. **The discriminated doc→client resolver** — `unresolved | unique | ambiguous`, an
   id released only on `unique` — with uniqueness **re-decided at effect time** under a
   filing-topology serialization primitive, and a **re-drive** path when the topology
   later collapses to one (§5).

Plus: purpose-discriminated consent events (§4), the legacy byte-identity closed set
(§6), the owner re-attestation runbook (§7), the in-transaction tail (§8), the blind
battery (§9), and the ceremony with a **narrowly stated** DARK claim (§10).

**OUT of 0020 (hard scope guards):**

- The **invoice-facts** consent gate stays **purpose-BLIND and byte-identical**. The
  live predicate is the **0015 replacement** of `claim_document_processing_task`
  (`0015:3340` create; the per-client consent predicate reads
  `clara.client_egress_consents` at `0015:3364`), **not** the 0011 body v0.1 cited. 0020 does not type it, does not touch it, and — because
  typed grants live in a different relation (§1) — cannot perturb it. Note the
  vocabulary correction: **raw OCR is kill-switch-only** (it structurally precedes
  client attribution, WA-D1); the per-client consent check gates **`invoice_facts`**
  (`wave-a-egress.test.mjs:1-8`). v0.1's repeated "OCR lane" wording was inaccurate and
  is replaced throughout by "invoice-facts lane".
- The **C6 vendor-trace-export** items (DPA execution, firm-facing disclosure text, the
  PDPA cross-border check) — OWNER/legal, PROJECTLOG PART 2. 0020 governs ONLY the
  product's own cross-border processor (the wiki-synthesis model call) and makes **no
  PDPA-compliance claim** beyond the WB-R23 alignment note (Data-Protection-by-Design:
  explicit purposes, positive activation, withdrawal handling).
- **A second typed purpose** (the deferred `entry.approved` → treatment /
  recurring_pattern synthesis sibling). The purpose CHECK ships single-valued;
  widening needs a follow-on ruling.
- **Lighting.** Activation is a per-client owner act, paced by the owner, taken AFTER
  the 0020 ceremony (§10). 0020 ships with zero typed consents and zero activations.
- **Making the visibility hold a dispatch gate** (§4). 0020 makes *activation* the
  dispatch gate; the hold stays a publish-time backstop and a visibility signal.

**Provenance label (corrected).** The per-client egress consent surface came from
**WA-R2 / WA-D1 and ADR-024** (PROJECTLOG ADR-022 §WA-D1; ADR-024 full-provenance
consent evidence). **WA2-R2 is MyInvois local intake**
(`wave-a2-ar-myinvois-contract.md:32`); the cross-border **rescoping** of the consent
gate is **WA2-R14** (`:37`). v0.1's "WA2-R2 envelope" attribution — which also survives
as a comment in `packages/runtime/lib/egress.mjs` — is wrong; the code comment is a
cosmetic follow-up, not a 0020 deliverable.

---

## Dependencies on 0019

0019 lands and deploys **first**. 0020 assumes, and the build lane must verify present
before starting:

| 0019 delivers (by section) | What 0020 relies on |
|---|---|
| §1 veto removal | A retirement/correction commits atomically in the authority domain, so a filing-topology change is a real, observable event 0020 can re-drive from. |
| §3 `mark_wiki_citations_stale` writer + §4 consumer lane | The consumer already subscribes `document.filing_retired` and dispatches it to a plan. 0020 **extends that same case**; it does not add the subscription. |
| §5 monotonic `projected_from_seq` guard | 0020's deterministic re-drive publishes with `projected_from_seq = null`, which the guard is specified NULL-safe against — no interaction. Assert it. |
| §6 `stale_citation` lint class | The visibility surface for citations 0020's re-drive does not repair. |
| §9 clean-end-state closed-set scan + whitelist | 0020's new functions must leave that scan **passing**. The pinned design achieves this by calling the audited wiki writers (`record_wiki_source_ingest`, `set_/clear_wiki_synthesis_hold`) rather than touching the seven wiki relations by name. **If any 0020 function's normalized source does reference one of those relations word-bounded, 0020 MUST add it to 0019's whitelist** — a tail assertion, not a hope. |

**The one thing 0019 explicitly does NOT do, which 0020 therefore OWNS:** 0019's
retirement lane marks a retired filing's citations **stale**; it does **not** re-resolve
the document for the surviving client. A document that resolved `ambiguous(A,B)` and
was skipped, whose B filing is later retired, is now uniquely filed to A — and its
`document.classified` event is permanently checkpointed. **The re-drive in §5.4 is
0020's, not 0019's.** This is the single genuine coupling between the two migrations.

**Anchor discipline.** `packages/runtime/lib/wiki-projection.mjs` and the 0017 bodies
0019 patches (`_publish_wiki_page_version_core`, `retire_document_filing`,
`approve_wrong_client_correction`) are cited **by symbol only**. Every such reference
carries *anchor re-grounded at build time, post-0019*.

---

## 1. The typed-consent relation — separate, never the legacy table

### 1.1 Why not the legacy table (the withdrawn v0.1 decision)

`clara.client_egress_consents` (0011:910-934) is load-bearing for a **purpose-blind**
gate: the live invoice-facts predicate accepts **any** row with `revoked_at is null`
for the client (`0015:3361-3366`). Carrying a typed `wiki_synthesis` row in that table
therefore makes a wiki grant **also authorize invoice-facts egress** — a client with
only a wiki grant, or whose legacy grant was revoked while the wiki row stayed live,
passes the legacy gate. That defeats purpose limitation, which is the entire point of
WB-R23(1).

Second, independently fatal: `revoke_client_egress` (`0014:143-155`) selects the live
row with `where client_id=p_client and revoked_at is null for update` — **no purpose,
no ordering, no `STRICT`**. Once two live rows can coexist for one client, PL/pgSQL's
`SELECT INTO` keeps an arbitrary first row and silently discards the rest: the owner
asks to revoke wiki and may revoke invoice-facts instead, or the reverse. **Revocation
becomes nondeterministic** — unacceptable for a withdrawal control.

**Ruling: the legacy table, its one-live index, its writers, its revoker and the 0015
claim body are UNTOUCHED (§6).** Typed consent gets its own relation.

### 1.2 `clara.client_egress_purpose_consents`

A new relation with the 0011 consent-table shape, plus a mandatory non-null purpose:

- `id` uuid PK · `firm_id` · `client_id` · **`purpose text NOT NULL CHECK (purpose in
  ('wiki_synthesis'))`** · `scope_note text NOT NULL` non-blank ·
  **`evidence_document_id uuid NOT NULL`** · `granted_by uuid NOT NULL` → `clara.users`
  · `granted_at timestamptz NOT NULL default now()` · `revoked_by` / `revoked_at` /
  `revoke_reason` with the 0011 paired revocation CHECK (all three null, or all three
  present with a non-blank reason).
- Same-firm composite FKs on client and evidence document, mirroring 0011:922-925.
- Uniqueness surfaces the rest of 0020 binds to: `unique(id, firm_id, client_id)` **and**
  `unique(id, firm_id, client_id, purpose)` — the second exists so §2's activation can
  carry a composite FK that structurally forces activation.purpose = consent.purpose.
- **`unique index ... on (client_id, purpose) where revoked_at is null`** — at most one
  live typed consent per (client, purpose). No `NULLS NOT DISTINCT` is needed anywhere:
  purpose is non-null by CHECK.
- **Immutability trigger**, the `_tf_egress_consent_update` shape (0011:1048-1060):
  `DELETE` → CLR08; any `UPDATE` touching a column outside
  `{revoked_by, revoked_at, revoke_reason}`, or a second revocation, → CLR08. A typed
  consent is INSERT-once / REVOKE-once. A no-truncate trigger, matching 0011:1088-1089.
- **FORCE ROW LEVEL SECURITY** with a single `clara_fn_owner` all-policy, matching the
  0011 loop (0011:1091-1106). **No role but `clara_fn_owner` reads or writes it** — not
  `clara_runtime`, not `clara_authenticated`, not `clara_agent_ro`, not the wake roles.
  Every access is through a named DEFINER function.

**Legacy rows never map.** There is no backfill, no migration of `client_egress_consents`
rows into this table, and no code path that reads one to satisfy the other. A client
with a live legacy row and no typed row is, for wiki synthesis, **unknown** — fail-closed
per client, exactly as WB-R23(1) rules.

### 1.3 Evidence is mandatory and real

A typed grant REQUIRES a non-null `evidence_document_id` naming a document that is, at
grant time: in the same firm; `document_kind = 'consent_evidence'`; and
`bytes_verified_at IS NOT NULL`. Any other document, or a null, is refused **CLR28**.

The owner-declaration path is **not available for typed consent**. 0012 itself described
that route as a deliberate weakening of the PDPA/MIA evidence control, taken over the
orchestrator's recommendation, with the evidence "PENDING, not waived"
(`0012:5-19`); ADR-024 then chose the full-provenance signed-PDF path and built 0014 to
make a consent artifact structurally non-egressable. Typed consent starts where ADR-024
ended. The 0012 null-document path **remains available on the legacy table**, untouched.

**Stated honestly:** the DB can prove the artifact exists, was ingested, and had its
bytes verified, and can bind the owner's attestation to it. It **cannot** cryptographically
verify a handwritten or electronic signature on that artifact. 0020 claims the former
only.

---

## 2. Activation — the positive, owner-only gate

### 2.1 Why activation exists as a separate record

The debate verified, and this contract confirms at source, that activation as v0.1
imagined it is **nonfunctional**:

- `clear_wiki_synthesis_hold(uuid,text)` is granted to **`clara_runtime`**, not to an
  owner JWT — it sits in the 0017 runtime grant block alongside
  `record_wiki_source_ingest` and `set_wiki_synthesis_hold`
  (`0017:5126-5134`; the clear at `0017:5129`). It is not an owner control.
- The synthesis planner (`planCounterpartySynthesis`) resolves consent and then calls
  the model **without ever reading `wiki_synthesis_holds`** — *anchor re-grounded at
  build time, post-0019*. The hold's only structural effect is at publication:
  `publish_wiki_page_version` refuses `p_synthesis='model'` under a live hold with
  CLR32 `consent_held` (0017:2040-2043). **It refuses the commit after client content
  has already reached the model.**
- The consumer's legacy consent lane (`planConsentTransition`) **clears the hold on
  `egress.consent_granted`** — so a null-purpose legacy grant, made for invoice-facts,
  today silently releases the wiki visibility state.

So "grant then clear the hold" is not a gate. 0020 replaces it with a positive record.

### 2.2 `clara.client_egress_purpose_activations`

- `id` · `firm_id` · `client_id` · `purpose` · **`consent_id`** · `activated_by uuid
  NOT NULL` → `clara.users` · `activated_at` · `deactivated_by` / `deactivated_at` /
  `deactivation_reason` with the same paired CHECK shape.
- **Composite FK `(consent_id, firm_id, client_id, purpose)` → the typed consent's
  `(id, firm_id, client_id, purpose)`** — an activation structurally cannot name a
  consent belonging to another client, another firm, or another purpose.
- `unique index ... on (client_id, purpose) where deactivated_at is null` — at most one
  live activation per (client, purpose).
- Immutability trigger (DELETE → CLR08; UPDATE outside the three deactivation columns,
  or a second deactivation, → CLR08), no-truncate trigger, FORCE RLS, owner-only policy
  — identical discipline to §1.2.

### 2.3 The version-match law

**Consent version, activation version, and authorization version must all agree.** An
authorization (§3) is minted only when a live typed consent C and a live activation A
exist with `A.consent_id = C.id`; the authorization records both ids; consumption
re-checks both are still live and still bound. A revoke-and-regrant mints a new consent
id, which no existing activation names — so **re-attestation alone never re-authorizes
dispatch**. The owner must activate the new consent explicitly.

---

## 3. Two-phase dispatch authorization

### 3.1 The race v0.1's call-twice did not close

v0.1 read consent at plan time and re-read it immediately before the model call. That
does not close the race, because the model call still happens **after** the second read
returns: `planCounterpartySynthesis` resolves consent → reads wiki context → calls
`deps.synthesize` (*anchor re-grounded at build time, post-0019*). A revoke that commits
between the second read and `generateText` is invisible, and the DB hold catches only
the publication (0017:2040-2043) — after the bytes have left.

The fix is not a third read. It is to make the last DB interaction a **state transition
that the revoker can observe and invalidate**, not a query.

### 3.2 `clara.egress_dispatch_authorizations`

One row per prepared dispatch:

- `id` uuid PK default random — **this is the only value that leaves the DB**. It is
  opaque: it encodes nothing about the consent, the evidence, the grant time, or the
  history.
- `firm_id` · `client_id` · `purpose` · `consent_id` · `activation_id` — composite FKs
  binding consent and activation to the same (firm, client, purpose).
- **Dispatch intent:** `event_seq bigint NOT NULL` · `event_type text NOT NULL` —
  the event this authorization was prepared for.

  **AMENDMENT A1 (ratified 2026-07-25).** In v1.0 the word *binds* in this section was
  **false advertising** for `client_id`, `purpose`, `event_seq` and `event_type`:
  §3.4 never compared them, so they were recorded for audit and nothing more. The
  scope of an authorization held only for as long as the caller kept the id in the
  right local variable — which is model discipline, and Clara's cardinal invariant is
  that authorization is structural and enforced in the DB. **§3.4 now re-verifies all
  four**, so *binds* means what it says. See §3.4 for the failure this closes.
- `document_sha256 text NULL` with `CHECK (purpose <> 'wiki_synthesis' OR
  document_sha256 IS NULL)` — WB-R23's "*+ document hash where applicable*" slot.
  Counterparty synthesis is not document-tied, so it is n/a today; the column exists so
  a future document-tied purpose binds structurally rather than by convention.
- `issued_at timestamptz NOT NULL default now()` · **`expires_at timestamptz NOT NULL`**
  · `consumed_at` · `invalidated_at` + `invalidated_reason`.
- `CHECK (consumed_at IS NULL OR invalidated_at IS NULL)` — at most one terminal.
- **TTL: 120 seconds of WALL CLOCK**, a single named constant in the migration,
  asserted by the tail. The plan→consume gap is one wiki-context read; 120s is generous
  by orders of magnitude and short enough that a stranded authorization cannot be
  replayed later. Expiry is time-derived — no sweep job, no expiry write.

  **AMENDMENT A2 (ratified 2026-07-25).** `issued_at` / `expires_at` are stamped from
  `clock_timestamp()`, and §3.4 compares expiry against `clock_timestamp()` — **never
  `now()`**. `now()` is transaction-stable: it returns the caller's transaction start
  time for the whole transaction, so a consume called from a long-open transaction saw
  an authorization that expired minutes earlier as still live, and the TTL stopped
  bounding anything. The property this buys is stated plainly: **the 120 seconds are
  120 seconds of wall clock for every caller, whatever transaction they are in.**
- **Single use.** A consumed authorization is terminal. If the model call fails and the
  event is re-driven, planning starts over and mints a **new** authorization. There is
  no reuse path.
- FORCE RLS, owner-only policy, no table grant to any role. Append-only apart from the
  two terminal transitions, enforced by trigger.

### 3.3 `clara.prepare_egress_dispatch` — the verdict function

`clara.prepare_egress_dispatch(p_firm uuid, p_client uuid, p_purpose text,
p_event_seq bigint, p_event_type text) returns jsonb`

SECURITY DEFINER · `set search_path = clara, pg_temp` · `revoke all from public` ·
**GRANT EXECUTE to `clara_runtime` ONLY** — never a table grant (the `get_wiki_page`
DEFINER idiom, 0017 R1-F4).

Returns **exactly two keys**:

- `{"verdict":"granted","authorization_id":"<uuid>"}` — iff a live typed consent C for
  `(p_client, p_purpose)` exists AND a live activation A exists with
  `A.consent_id = C.id` AND `p_client` belongs to `p_firm`. A fresh authorization row is
  inserted and its id returned.
- `{"verdict":"unknown","authorization_id":null}` — **every other case, without
  distinction**: never attested · attested then revoked · consent live but never
  activated · consent live and activation deactivated · foreign firm · nonexistent
  client · unknown purpose.

**`denied` is deleted from the vocabulary.** Both non-granted states lead to the identical
safety action, so distinguishing them is pure existence leakage — a runtime-readable
oracle for "did this client ever consent, and did they withdraw?". Withdrawal history
lives in the typed-consent table and the audit/event trail, owner-only.

**The return-key allowlist is structural, not stylistic.** `granted_at`, `consent_id`,
`activation_id`, `evidence_document_id`, `scope_note`, `granted_by`, `revoke_reason`,
`expires_at` and any count **never** appear in the return. Asserted by the tail (§8) and
by a battery cell (§9).

**The timing property, stated honestly (erratum, ratified 2026-07-25).** v1.0 asserted
"no timing branch a caller can distinguish" here and in §5.1, as an absolute. **That
claim cannot be substantiated in SQL and is withdrawn.** The *payload* is byte-identical
across every non-granted cause and that is enforced; *execution* is not constant-time,
and cannot be made so at this layer — an index hit and an index miss do measurably
different work, and no amount of SQL changes that. What 0020 claims instead, and what is
implemented:

- Both non-granted **payloads and error shapes are byte-identical**, always. This is
  the property the design actually rests on, and it is asserted exhaustively (§9.1).
- The coarsest observable differences are **removed**: a firm-leading partial index on
  live activations (`(firm_id, client_id, purpose) where deactivated_at is null`) means
  the verdict probe is one index descent whether the client is lit, dark, foreign or
  nonexistent; and §5.1's candidate aggregation is **capped at two rows**, so a
  document's filing count cannot be inferred from how long the resolver takes.
- **A residual remains, and is named** (R-7, §11): a determined attacker with precise
  repeated timings against these DEFINER verbs may still be able to distinguish some
  states. Closing it needs an architectural control (a constant-time gateway, a rate
  limit on the runtime verbs), not a SQL patch. Claiming otherwise would be worse than
  the residual: it would tell a future reader that a control exists where none does.
  Same discipline as §3.6's honest linearization note.

### 3.4 `clara.consume_egress_dispatch` — the dispatch linearization point

> **AMENDED 2026-07-25 (ratified amendment A1 + A2, ratchet R1).** v1.0 specified
> `consume_egress_dispatch(p_firm uuid, p_authorization uuid)` and listed exactly five
> liveness checks — none of which touched the client, the purpose, or the dispatch
> intent the row records. **This was a weakness in the ratified contract, not a build
> deviation:** the build matched §3.4 precisely, and two independent cross-model
> reviews found the same hole from opposite directions (one filed it as a NIT, one as a
> BLOCKER).
>
> **The failure it permitted.** Same firm. Client A is lit; client B is not. An
> authorization X is prepared for A. During a **B** event, an injected, cached or simply
> misassociated authorization id — X — is presented to consume. Consume saw a live,
> same-firm, unexpired, unconsumed row whose consent and activation were both live, and
> returned `granted`. **B's confidential context then went to the model with no B
> consent and no B activation, and the database could not detect it.** The same defect
> permitted cross-event reuse, and would have made cross-purpose reuse live the moment a
> second purpose was admitted.
>
> **Why it had to be fixed rather than documented.** §3.2 says the authorization row
> *binds* client, purpose and event. If consumption never checks them, that word is
> false: the binding is audit data, and the actual scope of an authorization is
> whatever the caller chooses to spend it on. An authorization whose scope holds only
> because the caller keeps it in the right local variable is exactly the "enforced by
> model discipline" that Clara's structural invariants exist to abolish.

`clara.consume_egress_dispatch(p_firm uuid, p_authorization uuid, p_client uuid,
p_purpose text, p_event_seq bigint, p_event_type text) returns jsonb`

Same DEFINER/ACL discipline. Returns `{"verdict":"granted"}` or `{"verdict":"unknown"}` —
**one key**.

It must, atomically in one transaction:

1. Return `unknown` if **any** argument is null.
2. Lock the authorization row **`where id = p_authorization AND firm_id = p_firm`** —
   `firm_id` is in the *lock predicate*, so a foreign-firm caller never reaches, and
   never takes a row lock on, another firm's authorization.
3. **Re-verify the dispatch this authorization is being used for.** Return `unknown`
   unless `client_id = p_client` **and** `purpose = p_purpose` **and**
   `event_seq = p_event_seq` **and** `event_type = p_event_type`. A mismatch is
   **not** consumed and **not** distinguished — same uniform `unknown`, byte-identical
   to every other refusal, so it can never become a "which client is this for?" oracle.
   The presented authorization stays live for its own legitimate dispatch.
4. Return `unknown` unless ALL hold: `consumed_at IS NULL`; `invalidated_at IS NULL`;
   **`expires_at > clock_timestamp()`** (A2 — wall clock, never the caller's
   transaction-stable `now()`); the named consent is still live (`revoked_at IS NULL`);
   the named activation is still live (`deactivated_at IS NULL`) and still names that
   consent.
5. On success, set `consumed_at = clock_timestamp()` and return `granted`.

A second consume of the same id returns `unknown`. There is no "peek" variant.

**What the DB cannot do, stated plainly (A2).** A PostgreSQL function cannot commit its
caller's transaction. `granted` therefore means *committed* only if the caller's
transaction commits — a caller may consume, call the model, and then roll back, leaving
no committed `consumed_at` even though the bytes left. That is a property of the
capability, not of any particular caller, so it is closed on the **caller** side: the
runtime's default consume helper runs this verb in its own explicit `begin`/`commit`
before the model can be reached (§3.7). §3.6's linearization statement is unconditional
only because of that discipline, and both halves are asserted — the DB-side limit by a
rig cell that consumes and rolls back, the runtime-side fix by a unit cell that pins the
helper's statement sequence.

### 3.5 Invalidation on withdrawal

`revoke_client_egress_purpose` and `deactivate_client_egress_purpose` (§7.1) must, in
the **same transaction** as the withdrawal, set `invalidated_at` + `invalidated_reason`
on **every** authorization row for that consent that is neither consumed nor already
invalidated. Revoke-and-regrant therefore invalidates the old consent's outstanding
authorizations **even if the new consent is immediately activated** — the new activation
names a new consent id, and the stranded authorizations name the old one.

### 3.6 Linearization semantics — stated honestly

**Consumption is the dispatch linearization point.**

- An authorization **consumed before** a revocation commits **may dispatch**. The bytes
  are already authorized; the revocation applies from its own commit forward.
- A revocation **committed before** consumption **must refuse**: consume returns
  `unknown` and no model call occurs.
- **Absolute cancellation after consumption but before the bytes leave the process is
  NOT achievable** by this design, and this contract does not claim it. It would require
  either holding a database lock across the external HTTP request (unacceptable — an
  external stall would pin a connection and a row lock indefinitely) or routing egress
  through a transactional outbound proxy (a different architecture, not in Wave B).
  The residual window is the interval between `consume_egress_dispatch` committing and
  the AI-SDK request being written to the socket — normal-case sub-millisecond.

**The commit precondition (A2, ratified 2026-07-25).** The two statements above are
about *committed* consumption. A PostgreSQL function cannot commit its caller's
transaction, so "a revocation committed before consumption must refuse" is unconditional
only if `granted` implies committed — which it does **not** for an arbitrary caller. The
contract therefore now states the caller-side obligation as part of the guarantee: **the
consume must run in its own committed transaction, and must return before the model call
is made.** The runtime's default helper does exactly this (§3.7). A caller that consumes
inside a longer transaction and later rolls back gets a `granted` that leaves no record —
the bytes left, the audit trail says they did not. That is a caller defect, and it is now
a stated precondition rather than an unexamined assumption.

This is a strictly stronger guarantee than as-built (where the window is
read→context-read→model-call, and the revoker has no way to invalidate anything), and it
is the strongest guarantee available without changing the egress architecture.

### 3.7 The runtime shape

*Anchor re-grounded at build time, post-0019 — stated by symbol.*

- `resolveConsentDefault` is **retired**. Its raw `select 1 from
  clara.client_egress_consents ...` against a table `clara_runtime` cannot read (42501 →
  `'unknown'`) is replaced by `prepare_egress_dispatch`.
- `planCounterpartySynthesis`: call `prepare_egress_dispatch(firmId, clientId,
  'wiki_synthesis', ev.seq, ev.eventType)`. On `verdict != 'granted'` → `held_consent`
  with `set_wiki_synthesis_hold(clientId, 'wiki synthesis consent unknown',
  'wikihold:<client>:<seq>')` — **the reason token and op-key shape are unchanged from
  as-built**, which is what makes the DARK claim in §10 true. On `granted`, carry
  `authorization_id`.
- Immediately before the model call (`deps.synthesize ?? synthesizeWikiPageDefault`),
  and **after** the wiki-context read, call `consume_egress_dispatch(firmId,
  authorizationId, clientId, 'wiki_synthesis', ev.seq, ev.eventType)` — **the same
  dispatch intent that was prepared** (A1). Proceed to the model **only** on `granted`.
  Otherwise abandon: no `synthesize`, no `putAndVerifyContent`, no `publish` — return
  `held_consent` with the same reason token. The refusal is a **typed terminal**: a
  checkpoint-only advance, never a crash, never a dead-letter loop.
- **The default consume helper owns its transaction (A2).** It issues `begin` → consume
  → `commit`, and on failure `rollback` + rethrow (never a silent `unknown`, which would
  be indistinguishable from a refusal). This is what makes §3.6's linearization
  statement true for any caller, not just for the loop's dedicated autocommit
  `pg.Client`. A consumer-test cell pins the statement sequence.
- Both calls are behind exact-signature surface guards (§10.2). Absent surface → the
  lane falls back to today's dark held path; the rest of wiki projection stays active.
- **Injected `deps` cannot stay unchanged.** The consumer tests must model
  prepare/consume as two distinct injectable steps and must include a cell proving the
  second boundary cannot be bypassed (a `deps.synthesize` that runs without a prior
  successful consume is a test failure, not a passing default).

---

## 4. Purpose-discriminated consent events, and what the hold is for

### 4.1 New event types

Registered in the 0007 event catalog (`0007:2687-2691` shape), all client-scoped:

- `egress.purpose_consent_granted` · `egress.purpose_consent_revoked`
- `egress.purpose_activated` · `egress.purpose_deactivated`

Payloads carry the purpose, the consent id, the activation id where applicable, and the
evidence document id **in the payload, never the typed `document_id` column** — the 0014
rule (a consent artifact must not trip the filing-history provenance trigger) applies
identically to typed consent.

### 4.2 The consumer's event handling changes

- **`egress.consent_granted` / `egress.consent_revoked` (legacy, null-purpose) become
  CHECKPOINT-ONLY for wiki.** They must **stop** clearing and stop setting wiki
  synthesis authorization state. Today `planConsentTransition` clears the hold on a
  legacy grant — an invoice-facts consent silently releasing a wiki control. That ends.
  *Anchor re-grounded at build time, post-0019.*
- **The four typed events are also checkpoint-only in the consumer.** The DB owns the
  hold transitions for typed purposes (§4.3), so the consumer has nothing to do but
  advance. They are subscribed for observability and ordering, not for effect.
- **A typed grant does NOT activate**, and emits no hold transition. Only
  `activate_client_egress_purpose` clears the hold.

### 4.3 What the hold is, and what it is not

`clara.wiki_synthesis_holds` (0017:984-992) is, after 0020:

- **NOT the dispatch gate.** Activation is. The hold is not read before the model call
  today and 0020 does not make it so — adding a plan-time hold read would be a second
  TOCTOU, not a control.
- **A publish-time backstop.** `publish_wiki_page_version` still refuses
  `p_synthesis='model'` under a live hold, CLR32 `consent_held`. Unchanged.
- **A visibility signal** — the surface a human reads to see that a client's synthesis
  is parked, with a reason and a `since`.

Its transitions for typed purposes move **inside** the owner-floored typed RPCs, which
call the existing audited `set_wiki_synthesis_hold` / `clear_wiki_synthesis_hold` rather
than writing the table (the cardinal invariant: never hand-write a row when an audited
function exists). Op keys are derived and replay-safe:
`wikihold:purpose:<consent_id>` on revoke, `wikirelease:purpose:<activation_id>` on
activate, `wikihold:purpose:deact:<activation_id>` on deactivate.

**`clear_wiki_synthesis_hold`'s existing body and its `clara_runtime` EXECUTE grant stay
byte-identical.** 0020 does not restrict them, because under this design the ability to
clear a hold is no longer an authorization capability. Changing a live ACL to fix a
problem the design has already dissolved would be gratuitous live risk.

**Named residual (R-3, §11):** an event that planned `held_consent` before an activation
can commit its `set_wiki_synthesis_hold` after that activation, re-parking an activated
client. It fails in the **safe** direction, it is visible (the hold row carries reason +
`since`), and the owner clears it by re-activating. Not fixed in 0020.

---

## 5. The doc→client resolver, effect-time serialization, and the re-drive

### 5.1 `clara.resolve_document_client`

`clara.resolve_document_client(p_firm uuid, p_document uuid) returns jsonb`

SECURITY DEFINER · `set search_path = clara, pg_temp` · `revoke all from public` ·
**GRANT EXECUTE to `clara_runtime` ONLY**. `clara_runtime` holds **no** table grant on
`clara.document_filings`; this DEFINER function is the entire surface.

**`p_firm` is required.** Global document-UUID uniqueness and same-firm composite FKs
(0007:63ff) give *integrity*, not *caller authorization*, and `clara_runtime`'s RLS is
expressly **not** the tenant boundary — the runtime lane's `using(true)` policies are the
0006/0007 convention, with firm scoping carried in SQL (`0008:26-28`). A single-argument
resolver would let a caller in firm B learn firm A's client for any document id it can
guess. v0.1's "single-arg is firm-safe" reasoning is withdrawn.

Resolution is over **active filings of a verified document**: join `clara.documents`
requiring `firm_id = p_firm` **and `bytes_verified_at IS NOT NULL`** (matching the
existing ingest floor in `record_wiki_source_ingest`, `0017:2238-2242`), then
`clara.document_filings` with `retired_at IS NULL`, over the DISTINCT `client_id` set:

- **zero** → `{"status":"unresolved"}`
- **exactly one** → `{"status":"unique","client_id":"<uuid>"}`
- **two or more** → `{"status":"ambiguous"}`

**No count is returned.** `status` already conveys zero/one/many; an exact `candidates_n`
is a gratuitous topology oracle. (The debate permitted a capped `0|1|2` sentinel *at
most*; this contract takes the strictly stronger option and returns nothing beyond the
status.) A `client_id` is released **only** on `unique`, never on `ambiguous`.

**Uniform not-found.** Foreign-firm, nonexistent, bytes-unverified, and genuinely
zero-active-filing inputs all return the **identical** `{"status":"unresolved"}` — byte
for byte, same key set, no error.

**Erratum (ratified 2026-07-25):** v1.0 ended that sentence with "no timing branch a
caller can distinguish". That absolute is withdrawn — see §3.3's honest timing note and
residual **R-7**. Concretely here: the distinct-client aggregation is **capped at two
rows** (`select distinct client_id … limit 2`), because `status` conveys zero/one/many
and a client id is released only on `unique`, so a third row can never change any
caller-visible outcome — while aggregating every filing of a large topology made the
response time a coarse oracle for how many clients a document is filed to. The cap
bounds the work a repeated prober can induce; it does not make the function
constant-time, and this contract no longer says it does.

### 5.2 Why a read-then-mutate resolver is not enough

Two races survive a plan-time resolve followed by a separate effect-time write:

- **Resolve `unique(A)`, then a filing for B commits.** `record_wiki_source_ingest`
  re-checks only that **A still has an active filing** — its join is
  `f.client_id = p_client and f.retired_at is null` (`0017:2238-2242`). It does **not**
  check that A is still the *only* client. The page publishes as uniquely resolved when
  it no longer is.
- **Resolve `ambiguous`, then B retires.** The document is now uniquely A's, but the
  `document.classified` event is checkpointed permanently and never revisited. 0019's
  retirement lane marks citations stale; it does not re-resolve (see *Dependencies on
  0019*).

### 5.3 `clara.resolve_and_ingest_wiki_source` — one serialized operation

`clara.resolve_and_ingest_wiki_source(p_firm uuid, p_document uuid) returns jsonb`

SECURITY DEFINER · `clara_runtime` EXECUTE only. **The uniqueness decision and the
ingest happen in ONE transaction, under locks that exclude every filing-topology
transition**, and the ingest itself goes through the existing audited writer — 0020
hand-writes nothing.

**Lock acquisition order (pinned — a blind lane must not invent its own):**

1. `clara.document_filings` rows for `p_document` — **FOR SHARE**. This blocks a
   concurrent `retire_document_filing`, which takes the filing row **FOR UPDATE**
   (`0007`, verified: it locks only the filing row and never `clara.documents`).
2. The `clara.documents` row for `(p_document, p_firm)` — **FOR UPDATE**. This is the
   phantom guard: an INSERT into `clara.document_filings` must take **FOR KEY SHARE** on
   the referenced parent row to enforce `fk_document_filings_document` (0007:79-80), and
   `FOR KEY SHARE` conflicts with `FOR UPDATE`. **No new filing for this document can
   commit while the lock is held** — no writer change required anywhere.
3. **Re-read** the distinct active-filing client set under both locks. This read, not
   the plan-time one, is authoritative.

This order matches the acquisition order of `approve_wrong_client_correction` (which
retires a filing before inserting the new one, i.e. filings-then-documents), so no
lock-order inversion exists against either authority function.

**Outcome, from the authoritative re-read:**

- exactly one client A → call `clara.record_wiki_source_ingest(A, p_document, null,
  'wikiingest:'||A||':'||p_document)`. The op key is **derived inside the function**, in
  the **byte-identical shape** the consumer uses today for `entry.approved`, so the two
  paths share one op receipt per (client, document) and can never double-publish.
  Returns the writer's receipt with `{"status":"projected"}`.
- zero → `{"status":"skipped_unresolved_client"}`, no write.
- two or more → `{"status":"skipped_ambiguous_client"}`, no write.
- The writer's own refusals (client not active/onboarding → CLR10; `consent_evidence`
  document → CLR28; not actively filed / not verified → CLR02) propagate unchanged.

**`record_wiki_source_ingest` is NOT modified.** Making it require uniqueness would break
the `entry.approved` lane, which carries an authoritative `client_id` on the event and
must keep working for a document legitimately filed to more than one client. The
uniqueness requirement belongs to the *resolver-driven* path only, which is why it lives
in a new entry point.

**Residual (R-1, §11):** a deadlock (40P01) against a concurrent authority function is
possible in principle. It aborts the 0020 transaction; the consumer's at-least-once
delivery re-drives the event and converges. A battery cell must exercise it and prove
convergence rather than assume it.

### 5.4 The consumer lanes

*Anchor re-grounded at build time, post-0019 — stated by symbol.*

- **`document.classified`** → `resolve_and_ingest_wiki_source(firmId, ev.documentId)`.
  `resolveDocumentClientDefault` (which returns `null` unconditionally) is retired for
  this lane. Receipts: `projected` on unique · **`skipped_ambiguous_client`** on
  ambiguous (a **new** receipt token — the discriminant survives operationally) ·
  `skipped_unresolved_client` on zero. `entry.approved` is unchanged: it carries
  `client_id` and keeps calling `record_wiki_source_ingest` directly.
- **The re-drive.** `document.filing_retired` (subscribed by 0019 §4) and
  `document.filed` (`0007:2687`, emitted by `file_document`, the intake finalizer, the
  rule-filed path and `approve_wrong_client_correction`) both change filing topology.
  Both lanes must, **after** their existing 0019 effect, attempt
  `resolve_and_ingest_wiki_source` for `ev.documentId`. The attempt is cheap and
  idempotent: on non-unique it is a no-op skip; on unique the op-key dedupe makes a
  repeat a replay. `document.filed` is a **new** subscription in
  `WIKI_PROJECTION_EVENT_TYPES`; adding it changes no existing lane's behaviour.
- **The re-drive fires only for classified documents.** A newly filed document that was
  never classified must not be ingested. `resolve_and_ingest_wiki_source` requires a
  prior `document.classified` event for `p_document` to exist before it publishes;
  absent one it returns `{"status":"skipped_unclassified"}` and writes nothing.

---

## 6. Legacy egress fidelity — the byte-identity closed set

0020 changes **nothing** in the following. Each is asserted unchanged by the tail (§8)
and probed by the battery (§9):

| Object | Anchor |
|---|---|
| `clara.client_egress_consents` — columns, CHECKs, FKs, triggers, RLS | 0011:910-934, 1048-1060, 1088-1089, 1091-1106 |
| `uq_client_egress_consents_one_live` — partial UNIQUE on `(client_id) where revoked_at is null` | 0011:931-932 |
| `clara.grant_client_egress` — signature, body, op-key hash expression, ACL | 0014 (as amended by 0012's nullable evidence) |
| `clara.revoke_client_egress` — signature, body, ACL | 0014:143-172 |
| `clara.claim_document_processing_task` — the **0015** body, including the purpose-blind per-client consent predicate | 0015:3340; the `client_egress_consents` read at 0015:3364 |
| `clara._enqueue_invoice_facts_core` — the `consent_evidence` structural exemption | 0014 |
| `packages/db/tests/wave-a-egress.test.mjs` — including the "exactly one LIVE consent row per client" assertion | `:175-176` |
| `packages/db/tests/wave-a-fixtures.mjs` — `grantClientEgress` / `revokeClientEgress` signatures | unchanged; new typed helpers are **added**, never repurposed |

**The invoice-facts gate cannot be perturbed by 0020**, structurally: typed consent lives
in a different relation, and the 0015 predicate names `clara.client_egress_consents`
only. This is the property the separate-relation decision buys, and it is why v0.1's
whole "one-live-index resolution" problem no longer exists.

### 6.1 How "byte-identical" is actually pinned (AMENDMENT A4, ratified 2026-07-25)

v1.0 left the pin mechanism to the build lane, and the build chose
`md5(regexp_replace(lower(prosrc), '\s+', '', 'g'))`. **That is neither byte identity nor
semantic identity.** Lowercasing and whitespace-stripping reach *inside string literals*,
so renaming a case-sensitive downstream token — `'{"reason":"no_consent"}'` to
`'{"reason":"NO_CONSENT"}'`, say — passed the pin unchanged while breaking every consumer
that matches on it. The v1.0 tail also pinned only the legacy table's **columns** and one
index definition: a dropped trigger, a relaxed FK, an RLS/policy alteration or a widened
function ACL all sailed through while the tail reported "byte identity". The word was
doing work the assertion did not.

The pins are therefore:

- **Exact `prosrc`, SHA-256, no normalization**, for each of the five closed-set
  functions. A readable normalized digest may be kept *alongside* it as a diffing aid;
  only the exact digest is load-bearing.
- **The legacy functions' EXECUTE ACLs as a closed set** — the full `proacl` of all five,
  sorted and compared as one string. §6 promises the ACLs, so they are pinned.
- **The legacy relation's full structure as one digest**: every constraint definition,
  every index definition, every non-internal trigger definition, the RLS flags and owner,
  and every policy (name, command, roles, USING, WITH CHECK).

All three are asserted in the migration tail (§8) **and** mirrored against the live
catalog by the battery, so a later migration cannot quietly widen them either.

---

## 7. Re-attestation and activation surface (owner RPC, not UI)

There is **no consent-granting dashboard surface** and 0020 does not build one. Consent
is owner-RPC-only through PostgREST under an owner JWT. The 0020 deliverable is a
documented runbook, not UI.

### 7.1 The owner RPCs (four in v1.0; **five** after amendment A3)

All: SECURITY DEFINER · `set search_path = clara, pg_temp` · **owner floor in-function
via `clara._human_ctx(clara.role_rank('owner'))`** · `revoke all from public` · **GRANT
EXECUTE to `clara_authenticated` ONLY** (never `clara_runtime`, never the agent or wake
roles) · op-keyed through `_reserve_op` / `_finish_op` · each writes an `_audit` row, and
each of the four consent verbs emits its §4.1 event.

| Function | Effect |
|---|---|
| `classify_consent_evidence_document(p_document, p_reason, p_op_key)` | **AMENDMENT A3.** Stamps `document_kind = 'consent_evidence'` on an in-firm, `status='ingested'`, bytes-verified document and **grants no egress of any kind**. Refuses a document already classified as something else with **CLR28** `evidence_kind_conflict` (you cannot re-label a coded bill as a consent letter — the 0014 rule, kept), an unverified one with **CLR28** `evidence_mismatch`, and a foreign-firm one with **CLR11**. Emits **no domain event** — see below. |
| `grant_client_egress_purpose(p_client, p_purpose, p_evidence_document, p_scope_note, p_op_key)` | Mints a typed consent (§1.2), evidence validated (§1.3). **Does NOT activate.** Refuses a second live consent for the same (client, purpose) with **CLR28** `duplicate_live`. |
| `activate_client_egress_purpose(p_client, p_purpose, p_consent, p_op_key)` | Requires `p_consent` to BE the live typed consent for (client, purpose) — a blind activation is impossible. Mints the activation, clears the wiki hold via the audited writer. Refuses a second live activation **CLR28**. |
| `deactivate_client_egress_purpose(p_client, p_purpose, p_reason, p_op_key)` | Deactivates without revoking consent (a pause). Invalidates unconsumed authorizations (§3.5), sets the hold. |
| `revoke_client_egress_purpose(p_client, p_purpose, p_reason, p_op_key)` | Revokes the live typed consent, deactivates its activation, invalidates unconsumed authorizations, sets the hold — **all in one transaction**. |

**Why A3 exists — v1.0's §7.2 step 1 was not executable.** The typed grant is a *reader*
of the evidence artifact: §1.3 deliberately makes it validate the stamp and never apply
it. But at v1.0 **no verb could apply that stamp without also granting egress**.
`clara.set_document_kind` refuses the kind outright ("consent-evidence classification is
owned by the egress consent path", CLR28), and the only live writer of it was the
**legacy `grant_client_egress`**, which in the same call mints a purpose-blind consent
that authorizes invoice-facts egress. So a client who consented **only** to wiki
synthesis could not be onboarded without being granted egress they never agreed to —
precisely the purpose bleed §1.1 exists to abolish. The typed positive path appeared to
work only because the rig's superuser fixture applied the stamp itself; a fixture is not
an operational path, and a battery that depends on one is proving the wrong thing.

**What A3 deliberately does not do.** It emits **no** domain event. Emitting
`document.classified` would be actively wrong: §5.4's re-drive gate fires on that event,
and `record_wiki_source_ingest` refuses a `consent_evidence` source (CLR28), so the event
would manufacture a guaranteed refusal for a document that is not wiki material at all.
The 0014 precedent agrees — `grant_client_egress` stamps the kind and emits no
classification event. It also mints no consent, no activation and no authorization, and
touches neither consent relation: classification is not attestation.

**Firm membership is verified FIRST (amendment, ratchet R1-F5).** `activate`,
`deactivate` and `revoke` must confirm the client belongs to the caller's firm **before**
any state lookup, and must carry `firm_id` in **every** state-row predicate. v1.0's
ordering let each of them search globally by `(client, purpose)`, take `FOR UPDATE` on a
**foreign firm's** live row, and only then compare `firm_id` — cross-firm lock reach, and
it returned **CLR28** where §7.1 mandates **CLR11**. That substitution is itself an
existence oracle: CLR28 means "nothing live here", CLR11 means "not your client", and a
foreign caller could tell them apart. The battery requires **CLR11 exactly**.

Argument-validation refusals are **CLR10** (missing/blank op key, blank reason);
client/document-not-in-firm is **CLR11**; state refusals (no live typed consent,
duplicate live, ineligible evidence, already revoked/deactivated) are **CLR28**;
the owner floor raises through `_human_ctx` (CLR03/CLR04). **0020 introduces no new
error codes.**

**Op-key discipline correction:** `_reserve_op` raises **CLR10** — *"op_key reused with
different args"* (`0004:57`; the contract comment at `0004:45`) — on a same-key /
different-args reuse. v0.1 said CLR28. Every battery cell must expect CLR10.

### 7.2 The activation runbook

Ships in `docs/ops/` alongside the ceremony (§10), as an ordered owner recipe:

1. Ingest the signed per-client re-attestation letter through the normal document
   intake, confirm `bytes_verified_at`, then classify it:
   **`classify_consent_evidence_document(<doc>, <reason>, <op key>)`** (amendment A3).
   This stamps `document_kind='consent_evidence'` and grants **nothing**. Before A3 this
   step had no executable form that did not also grant legacy invoice-facts egress — see
   §7.1.
2. `grant_client_egress_purpose(client, 'wiki_synthesis', <doc>, <scope note>, <op key>)`.
3. Confirm the typed consent is live and the client's **verdict is still `unknown`** —
   this is the proof that a grant alone does not authorize.
4. `activate_client_egress_purpose(client, 'wiki_synthesis', <consent id>, <op key>)`.
5. Confirm the verdict is now `granted` and the hold is cleared. Synthesis lights **for
   that client only**.
6. Withdrawal: `revoke_client_egress_purpose(...)` — or `deactivate_...` to pause
   without discarding the consent record.

Every un-activated client stays fail-closed. Deterministic ingest and the counterparty
deterministic paths are independent of all of this.

**If** a consent dashboard surface is later built, a purpose-aware rider ships as a
**post-ceremony** PR: the Pages auto-deploy rule means a UI merge ships immediately, so
no dashboard code may reference the typed surface before 0020 is live.

---

## 8. The 0020 in-transaction tail battery (apply-time, one transaction)

0011/0017/0018 idioms plus 0020's additions. **Every functional probe runs inside a
forced-rollback subtransaction** — no fixture consent, activation, authorization, audit
or event row is ever committed. Function bodies are created under `set role
clara_fn_owner` / `reset role`. One transaction; **any failure aborts the apply**.

**Structural / catalog**
- The three new relations exist with the pinned columns, CHECKs (purpose closed to
  `wiki_synthesis`; the paired revocation/deactivation CHECKs; the
  `document_sha256`-null-for-wiki CHECK; the one-terminal CHECK), composite FKs, and
  the partial indexes.

  > **ERRATUM (ratified 2026-07-25).** v1.0 said "the **three** partial unique indexes".
  > There are **two** one-live UNIQUE indexes — `(client_id, purpose) where revoked_at is
  > null` on consents and `(client_id, purpose) where deactivated_at is null` on
  > activations — plus **one NON-unique** partial index on open authorizations
  > (`(consent_id) where consumed_at is null and invalidated_at is null`), which drives
  > §3.5's withdrawal sweep. **Do not make the third one unique.** §3.3 mints a fresh
  > authorization on every granted prepare, so many outstanding authorizations
  > legitimately share one `consent_id`; a unique index there would make the second
  > concurrent dispatch for a client fail with a constraint violation. The tail asserts
  > the two uniques by definition and the third as explicitly non-unique.
  >
  > A fourth partial index is added by the timing erratum (§3.3):
  > `(firm_id, client_id, purpose) where deactivated_at is null` on activations,
  > firm-leading, which the verdict probe drives. Also non-unique.
- The immutability and no-truncate triggers exist on all three; FORCE RLS is on with a
  single `clara_fn_owner` policy each.
- The **nine** new functions (eight in v1.0 + `classify_consent_evidence_document`, A3)
  exist with the pinned argument names, types and defaults, `SECURITY DEFINER`,
  `search_path=clara,pg_temp`, and `clara_fn_owner` ownership. The pinned
  `consume_egress_dispatch` signature is the **six-argument** one (A1).
- The 120-second TTL constant is present in `prepare_egress_dispatch`'s source.
- The four new event types are registered — and **only** those four: A3's verb emits
  none.

**Return-shape**
- `prepare_egress_dispatch` returns exactly `{verdict, authorization_id}` and its source
  contains **no** reference to `granted_at`, `scope_note`, `evidence_document_id`,
  `granted_by`, `revoke_reason`, or a count expression.
- `consume_egress_dispatch` returns exactly `{verdict}`.
- `resolve_document_client` returns exactly `{status}`, plus `client_id` **only** on
  `unique`; its source contains no count expression in the return path.
- The literal `'denied'` appears in **no** 0020 function source.

**Grants / capability closed set**
- `prepare_egress_dispatch`, `consume_egress_dispatch`, `resolve_document_client`,
  `resolve_and_ingest_wiki_source` → **`clara_runtime` ONLY**; unreachable by
  `clara_authenticated`, `clara_agent_ro`, `clara_wake_interactive`,
  `clara_wake_proactive`.
- The four owner RPCs → **`clara_authenticated` ONLY**, and each source contains the
  `_human_ctx(role_rank('owner'))` floor.
- **PUBLIC-execute sweep = 0** over every new function.
- **No table grant** to any role on the three new relations, nor on
  `clara.client_egress_consents`, nor on `clara.document_filings` — asserted absent. The
  DEFINER functions are the only surface.
- 0019's clean-end-state wiki closed-set scan **still passes** with 0020's functions
  present (see *Dependencies on 0019*).
- The existing wiki-leak / sightings / autopost proname scans run over every new
  function.

**Legacy byte-identity (§6, as amended by A4)**
- `uq_client_egress_consents_one_live` exists with its original definition; a second
  live row for the same client still refuses.
- `grant_client_egress`, `revoke_client_egress`, `claim_document_processing_task`,
  `_enqueue_invoice_facts_core`, `record_wiki_source_ingest` have exactly one overload
  each, with unchanged argument signatures and **exact `prosrc` SHA-256 pins — no
  normalization** (§6.1).
- Their **EXECUTE ACLs** are pinned as one closed-set string.
- `client_egress_consents` has no new column, **and** its constraints, indexes,
  non-internal triggers, RLS flags/owner and policies are pinned as one exact
  structural digest (§6.1).

**Apply-time precondition (empirical, never assumed)**
- The three new relations are empty at end of apply — **zero typed consents, zero
  activations, zero authorizations**. This is the structural basis of the §10 DARK claim.

**Explicitly NOT in the tail.** The tail is one transaction and **cannot** prove
concurrency. No revocation-race, ambiguity-race, deadlock or two-session cell belongs
here; they live in the rig (§9). v0.1's §6 implied otherwise; corrected.

---

## 9. The blind battery's charter (contract-only; SQL-unread)

Authored by a contract-blind lane against **this document** with the migration SQL
unread, then reconciled on the rig with orchestrator adjudication (the 0017/0018
discipline).

### 9.1 Typed-consent ladder

- A live typed `wiki_synthesis` consent with a live activation → verdict `granted`, one
  opaque `authorization_id`, **zero row contents** in the return.
- Typed consent live, **never activated** → `unknown`. **A grant alone never
  authorizes** — and the model is never called even when no hold row exists.
- Typed consent live, activation **deactivated** → `unknown`.
- Typed consent **revoked** → `unknown` (not `denied`; the token does not exist).
- Client with **only** a live legacy null-purpose row (RPR's live shape) → `unknown`.
- Client with **no** consent row anywhere → `unknown`. All five non-granted cases return
  a **byte-identical** payload.
- The purpose CHECK rejects an off-enum purpose string; `prepare_egress_dispatch` with
  an unknown purpose returns `unknown`, never an error.
- A typed grant with a null / non-`consent_evidence` / bytes-unverified / foreign-firm
  evidence document → **CLR28**.
- **(A1) The dispatch re-binding.** An authorization minted for client A, presented
  during a client-B dispatch, returns `unknown`, is **not** consumed, and still consumes
  cleanly for A. B must itself be **fully lit** in the cell, so the refusal cannot be
  explained by B lacking consent. The same for a mismatched purpose, `event_seq` and
  `event_type`, each byte-identical to every other `unknown`.
- **(A2) Time and commit.** A consume inside a transaction whose `now()` predates
  expiry, executed after wall-clock expiry, returns `unknown` (the cell must *show* that
  `now() < expires_at < clock_timestamp()`, or it proves nothing). And a consume that
  its caller rolls back leaves the authorization unconsumed and spendable — the DB-side
  limit that §3.7's own-transaction helper closes.
- **(A3) The owner evidence path.** The positive ladder must start from an
  **unclassified** ingested document and stamp it through
  `classify_consent_evidence_document` — never by handing `consent_evidence` to a
  superuser seed fixture. A cell must assert that doing so grants **no** legacy consent
  and **no** typed consent, that a bookkeeper is refused (CLR03/CLR04), that a
  foreign-firm owner gets CLR11, and that an already-classified invoice is refused
  CLR28 `evidence_kind_conflict`.
- A second live typed consent for the same (client, purpose) → **CLR28**
  `duplicate_live`; a second live activation → **CLR28**.
- A non-owner caller on any of the four typed RPCs → the owner floor (CLR03/CLR04).
- `_reserve_op` same-key/different-args reuse on a typed RPC → **CLR10**.

### 9.2 Cross-purpose isolation (the blocker the separate relation closes)

- A typed wiki grant (and activation) with **no** legacy row → the invoice-facts lane is
  **NOT** authorized: `claim_document_processing_task` holds with CLR28 `no_consent`,
  byte-identically to a client with no consent at all.
- A **legacy revoke** leaves a live typed wiki consent untouched (verdict still
  `granted`); a **typed revoke** leaves the legacy invoice-facts consent untouched (the
  invoice-facts claim still authorizes).
- The legacy grant/revoke path — receipts, event payloads, op hashes, the resulting
  invoice-facts behaviour, and the "exactly one live row per client" invariant — is
  **byte-identical** before and after 0020.
- With a legacy row live and no typed row (RPR's exact production shape), invoice-facts
  remains authorized and wiki synthesis remains held. This is the production
  non-regression cell.

### 9.3 Revocation and dispatch races (two-session — the ruling's before-lighting bar)

- **(a)** A prepares (`granted`, auth X); B revokes the typed consent; A's consume →
  `unknown` → **no model call, no publish**, `held_consent` recorded.
- **(b)** A prepares (X); B revokes **and** re-grants **and activates** a new consent Y;
  A's consume → `unknown`. A fresh grant is never a silent re-authorization.
- **(c)** A prepares (X); B **deactivates** without revoking; A's consume → `unknown`.
- **(d)** No-race baseline: A prepares, consumes `granted`, the model is called, the page
  publishes. (The rig lights a typed consent + activation to exercise the positive path;
  production stays dark.)
- **(e)** Consume **twice** with the same authorization id → the second is `unknown`.
- **(f)** Consume after the TTL elapses → `unknown`.
- **(g)** Consume an authorization prepared for a **different firm** → `unknown`.
- **(h)** Consume-then-revoke (the linearization statement): a consume that commits
  before the revoke **does** dispatch. This cell asserts the documented semantics — it is
  not a bug report.
- **(i)** The bypass cell: a test harness that calls `synthesize` without a prior
  successful consume **must fail the suite**.

### 9.4 Resolver and topology races

- Zero active filings → `unresolved` → `skipped_unresolved_client`, no write.
- Exactly one → `unique`, id released → deterministic ingest fires → `projected`.
- Two or more distinct clients → `ambiguous` → **`skipped_ambiguous_client`**, no
  `client_id` ever returned, no write.
- A document whose bytes are **not** verified → `unresolved` (the ingest floor).
- **Foreign-firm / nonexistent / unverified / zero-filing return the identical payload**
  — asserted by exact equality across all four inputs, for both
  `resolve_document_client` and `prepare_egress_dispatch`.
- **`unique(A)` → concurrent file-to-B** (two-session): the ingest either serializes
  before B's filing commits and publishes for A, or observes B and refuses as ambiguous.
  It must **never** publish as uniquely resolved once B's filing is committed and
  visible.
- **`ambiguous` → retire-B** (two-session): the document is **eventually re-resolved and
  published for A** via the `document.filing_retired` re-drive — not permanently lost.
  This is the cell that proves the 0019 coupling is owned.
- **Zero → filed** : a document classified with no filing, later filed to exactly one
  client, publishes via the `document.filed` re-drive.
- **Never-classified → filed**: no publication (`skipped_unclassified`).
- **Deadlock convergence** (R-1): the resolve-and-ingest transaction run against a
  concurrent `retire_document_filing` / `approve_wrong_client_correction` either
  serializes cleanly or aborts 40P01 and converges on re-drive. No lost publication, no
  duplicate version.
- Idempotence: re-driving the same (client, document) twice produces **one** wiki source
  page and **one** op receipt.

### 9.5 Grant / RLS closed set

- Both runtime functions and both resolver functions are EXECUTE-granted to
  `clara_runtime` only; PUBLIC-execute 0; unreachable by `clara_agent_ro` and both wake
  roles; the four owner RPCs unreachable by `clara_runtime`.
- No role holds a table grant on the three new relations; a direct `select` as
  `clara_runtime` fails.
- Cross-firm DEFINER probes on all four runtime functions return the single uniform
  not-found shape.

### 9.6 Receipt vocabulary

- `document.classified` and the two re-drive lanes: `projected` (unique) ·
  `skipped_ambiguous_client` (ambiguous) · `skipped_unresolved_client` (zero) ·
  `skipped_unclassified` (re-drive on a never-classified document).
- Wiki synthesis: `held_consent` with reason token **exactly** `wiki synthesis consent
  unknown` for every non-granted verdict, at **both** the prepare and consume boundaries
  · `projected` only when prepared-granted **and** consumed-granted.
- Every refusal is a typed terminal: checkpoint-only advance, never a crash, never a
  dead-letter loop.

### 9.7 Lockstep test updates

`wave-a-egress` and the 0012/0014 consent tests must pass **unchanged** — that is the
legacy-fidelity proof. New typed helpers are **added** to `wave-a-fixtures.mjs`
(`grantClientEgressPurpose`, `activateClientEgressPurpose`,
`deactivateClientEgressPurpose`, `revokeClientEgressPurpose`, plus
`classifyConsentEvidenceDocument` for A3); the existing `grantClientEgress` /
`revokeClientEgress` helpers keep their signatures.
`wave-b-wiki-projection-consumer` and its unit suite change: the default path moves from
`resolveConsentDefault` to prepare/consume, `document.classified` gains the three-way
receipt, and the injected `deps` gain the two authorization steps (§3.7).

---

## 10. Deployment — DB-first, and what "DARK" actually means

### 10.1 The narrow DARK claim (v0.1's claim was false)

v0.1 said "every new path degrades exactly to today". **That is not true**, and the
contract will not say it. Before any activation, 0020 **deliberately changes**:

1. A uniquely filed `document.classified` event goes from `skipped_unresolved_client` to
   **deterministic wiki publication**. This is WB-R23(3), ruled — it is the point of the
   resolver, not a side effect.
2. Ambiguous documents get a **new receipt token**, `skipped_ambiguous_client`.
3. **Legacy consent events stop touching wiki authorization state** — an
   `egress.consent_granted` no longer clears the wiki hold.
4. Two **new re-drive subscriptions** (`document.filed`, and a second effect on
   `document.filing_retired`).
5. The catalog/API surface gains three relations and **nine** functions (eight in v1.0
   plus `classify_consent_evidence_document`, amendment A3).

**What is DARK is MODEL SYNTHESIS.** With zero typed consents and zero activations —
asserted at apply time (§8) and re-asserted post-apply (§10.3) — the model-egress path is
externally **byte-equivalent** to today: every verdict is `unknown`, every counterparty
event records `held_consent` with the **unchanged** reason token `wiki synthesis consent
unknown` and the unchanged `wikihold:<client>:<seq>` op key, **zero** `synthesize` calls,
**zero** model-lane publications. That, and only that, is the DARK claim.

### 10.2 The two PRs

**PR-A (DB).** Migration 0020 + the §8 tail + the new rig fixture helpers. Merges
pre-ceremony, undeployed.

**PR-B (runtime + consumer tests).** The `wiki-projection.mjs` rewire (§3.7, §5.4) plus
the consumer-test lockstep. Every new DB dependency is behind an **exact-signature**
guard — `to_regprocedure('clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text)')`
and the equivalents for
`consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text)` (the **six-argument**
signature, A1), `resolve_document_client`, `resolve_and_ingest_wiki_source` — **not** an
overloaded-name `to_regproc` check, which cannot distinguish signatures. The exact-arity
guard is load-bearing for A1: an image carrying the two-argument consume would otherwise
appear to have the surface it needs. The fallback is **lane-local**: absent synthesis pair →
the counterparty lane records `held_consent` exactly as today; absent resolver pair →
`document.classified` stays `skipped_unresolved_client` and the re-drive lanes are
checkpoint-only. Every other wiki-projection lane stays fully active. **Not a `_vN`
bump** (plugin, not a frozen workflow). The image ships DARK.

### 10.3 The ceremony (owner-`!`-gated, DB-first)

DB-first because the runtime rewire READS functions that must exist first, and because
neither order can light synthesis — there is no silent-loss window in either direction.

1. **Backup-first** → quiesce.
2. Apply 0020 (the §8 tail runs in-transaction; any failure aborts) →
   `NOTIFY pgrst, 'reload schema'`.
3. **Post-verify probes**, run under a `clara_runtime`-role probe:
   - `prepare_egress_dispatch` returns `{"verdict":"unknown","authorization_id":null}`
     for **every** client including RPR (whose legacy row is live) — and the payload is
     byte-identical across them.
   - `resolve_document_client` returns the three discriminated shapes on known
     fixtures, and the identical `unresolved` payload for a foreign-firm probe.
   - The three new relations are **empty**.
   - The invoice-facts lane is still authorized for RPR (a read-only consent-count
     probe against `claim_document_processing_task`'s predicate).
   - No table grant to `clara_runtime` on any consent relation.
4. **Deploy the runtime image** (`fly deploy`); confirm `/ready` 200 and the
   `WIKI_PROJECTION` lane acquires.
5. **Verify DARK:** every counterparty event still records `held_consent` with the
   unchanged reason token; zero `synthesize`; zero model-lane publications;
   `document.classified` publishes only on unique; invoice-facts unaffected.
6. Unquiesce → **record the version pin**: migration count → **20**, plus the new runtime
   image tag. Per WB-R24, **no gate journey straddles this deploy.**

**Activation is NOT part of the ceremony.** It is the §7.2 owner runbook, run per client,
at the owner's pace, afterwards.

---

## 11. Named residuals

| # | Residual | Disposition |
|---|---|---|
| **R-1** | Deadlock (40P01) between `resolve_and_ingest_wiki_source` and a concurrent authority function. | Bounded and self-healing: the transaction aborts, the consumer re-drives, the op key makes it converge. Battery cell §9.4. |
| **R-2** | The post-consumption / pre-socket window (§3.6). | Not closable without a lock held across the external request or a transactional outbound proxy. Documented, not claimed away. |
| **R-3** | A stale in-flight `held_consent` plan can re-park an activated client (§4.3). | Fails safe, visible via the hold's reason + `since`, cleared by re-activation. Not fixed in 0020. |
| **R-4** | `packages/runtime/lib/egress.mjs` still labels the purpose registry "WA2-R2 envelope" and names `client_egress_consents` as the wiki consent surface. | Cosmetic comment drift; fix in PR-B, no behavioural weight. |
| **R-5** | The hold is not a plan-time gate. | Deliberate (§4.3): activation is the gate. Revisiting would require a ruling, not a patch. |
| **R-6** | A second typed purpose will need per-purpose revocation semantics on any future shared surface. | The typed relation is already per-purpose; the legacy relation stays single-lane. No action now. |
| **R-7** | **Timing side channel on the runtime DEFINER verbs** (added 2026-07-25 with the §3.3 erratum). Payloads and error shapes are byte-identical across every non-granted cause, and the two coarsest differences are removed (the firm-leading live-activation index; the resolver's two-row cap). Execution is nevertheless **not constant-time**, and SQL cannot make it so. | **Named, not claimed away.** Closing it needs an architectural control — a constant-time gateway, or a rate limit on `prepare_egress_dispatch` / `resolve_document_client` for `clara_runtime` — which is a ruling, not a patch. v1.0's absolute "no timing branch a caller can distinguish" is withdrawn from §3.3 and §5.1. |
| **R-8** | **The consume must be committed by its caller** (added 2026-07-25 with amendment A2). A PostgreSQL function cannot commit its caller's transaction, so `granted` implies committed only if the caller commits before calling the model. | Closed on the caller side: the runtime's default consume helper runs its own `begin`/`commit` (§3.7), pinned by a unit cell. It remains a **precondition on any other caller** of the verb, stated in §3.4 and §3.6 rather than assumed. |

---

## Changelog v0.1 → v1.0

Every amendment was ACCEPTED. Where an amendment's literal wording would have broken
as-built behaviour, the adjudication is recorded.

| # | Binding amendment | Landed in |
|---|---|---|
| 1 | Separate FORCE-RLS typed-consent relation; do not relax or repurpose `client_egress_consents`. | **§1** (v0.1 §1 fully rewritten; the `NULLS NOT DISTINCT` one-live-index proposal is **withdrawn**), **§6**. |
| 2 | Dedicated owner-floored typed grant/revoke RPCs; purpose non-null, closed to `wiki_synthesis`; evidence mandatory, no owner-declaration path. | **§7.1**, **§1.3**. v0.1's DROP-and-recreate of `grant_client_egress` is **withdrawn** — the legacy writer is untouched. |
| 3 | Positive owner-only activation record bound to the exact consent id; consent/activation/authorization versions all match. | **§2** (new section), **§2.3**, **§7.1**. The two nonfunctional-activation claims are verified in-source and stated in **§2.1**. |
| 4 | Legacy `grant_client_egress`, `revoke_client_egress`, the one-live index and the 0015 invoice-facts body stay byte-identical. | **§6** (new section) + tail pins in **§8**. The 0011-vs-0015 citation correction is in **§0**. |
| 5 | Purpose-discriminated consent events; legacy events checkpoint-only for wiki; typed grant does not activate; typed revoke deactivates and sets the hold. | **§4** (new section), **§7.1**. |
| 6 | Verdict returns only `granted\|unknown` + an opaque short-lived authorization id; `denied` collapsed. | **§3.3**, tail assertions in **§8**, cells in **§9.1**. |
| 7 | Two-phase authorization: prepare at plan time, atomically consume before `generateText`; revoke+regrant invalidates unconsumed authorizations. | **§3.2–§3.5**, runtime shape **§3.7**. v0.1's "call-twice" is **withdrawn** as insufficient (**§3.1**). |
| 8 | State the linearization semantics honestly. | **§3.6**, residual **R-2**. |
| 9 | Both the verdict fn and the resolver take `p_firm`; foreign-firm/nonexistent/unverified/zero-filing produce identical output. | **§3.3**, **§5.1**. v0.1's "single-arg is firm-safe" reasoning is explicitly withdrawn, with the `0008:26-28` basis. |
| 10 | Re-resolve uniqueness at effect time under a filing-topology serialization primitive; provide a re-drive when zero/many becomes one. | **§5.2–§5.4** (new), *Dependencies on 0019*. |
| 11 | Preserve the resolver discriminant operationally; never expose candidate identities or an exact count. | **§5.1** (no count at all — stronger than the permitted capped sentinel), **§5.4** (`skipped_ambiguous_client`). v0.1's orchestrator pin of a single collapsed receipt is **withdrawn**. |
| 12 | Rewrite the DARK claim narrowly; re-ground anchors after 0019. | **§10.1**, plus the anchor discipline in *Dependencies on 0019*. |

**Smaller corrections applied.** The resolver joins `documents` and requires
`bytes_verified_at IS NOT NULL` (**§5.1**). `_reserve_op` mismatch raises **CLR10**, not
CLR28 (**§7.1**). The in-transaction tail no longer claims to prove concurrency
(**§8**, closing paragraph). The provenance label is corrected to WA-R2 / WA-D1 +
ADR-024, with WA2-R2 identified as MyInvois local intake and WA2-R14 as the cross-border
rescoping (**§0**). The "OCR lane" vocabulary is corrected to "invoice-facts lane"
throughout (**§0**). Every §7 battery cell from the debate is present in **§9**.
v0.1 **§9 (open design items) is deleted** — all eight are settled: 1 → moot (separate
relation) · 2 → moot (legacy writer untouched) · 3 → collapse to `unknown` · 4 → `p_firm`
+ verified documents + no count + distinct ambiguous receipt + effect-time serialization
· 5 → DB-first with exact-signature guards · 6 → evidence mandatory · 7 → document hash
n/a, slot reserved · 8 → injected deps must change.

**Citations found wrong and corrected.**

| Claim | v0.1 / debate said | Verified at source |
|---|---|---|
| The live invoice-facts consent predicate | v0.1: `0011:2333-2362` | The 0011 body is at `0011:2315`; the **live** definition is the 0015 CoR — `0015:3340`, predicate `0015:3361-3366`. |
| `_reserve_op` mismatch code | v0.1: CLR28 | **CLR10**, raised at `0004:57` (comment `0004:45`). The debate's `0004:54` anchor is also imprecise. |
| Consent provenance | v0.1 (and `egress.mjs`): "WA2-R2 envelope" | **WA-R2 / WA-D1 + ADR-024**; WA2-R2 is MyInvois local intake, WA2-R14 the cross-border rescoping. |
| The consent-gated lane | v0.1: "the OCR lane" | Raw **OCR is kill-switch-only**; the per-client consent gate is **`invoice_facts`** (`wave-a-egress.test.mjs:1-8`). |
| RLS one-live/FORCE-RLS block | v0.1: `0011:1091-1105` | `0011:1091-1106`. Table `0011:910-934` and trigger `0011:1048-1060` **confirmed exact**. |
| `clear_wiki_synthesis_hold` grant | debate: `0017:5125` | The runtime grant block is `0017:5126-5134`; the clear at **`0017:5129`**. Substance confirmed: it is granted to `clara_runtime`, not an owner JWT. |
| `record_wiki_source_ingest` uniqueness check | debate: `0017:2238` | **Confirmed** — `0017:2238-2242` joins `f.client_id = p_client and f.retired_at is null`, never uniqueness. |
| `revoke_client_egress` nondeterminism | debate: `0014:155` | **Confirmed** — `0014:155-156`, no purpose, no ordering, no `STRICT`. |

---

## Changelog v1.0 → v1.1 (ratchet R1, ratified 2026-07-25)

Ratchet R1 reviewed the **build** against v1.0, cross-model and repo-grounded. Four of its
findings were contract defects rather than build deviations — the build matched the ratified
text, and the text was wrong. Those are amendments A1–A4; the rest were build fixes.

| # | What v1.0 said | Why it was wrong | Where it landed |
|---|---|---|---|
| **A1** | `consume_egress_dispatch(p_firm, p_authorization)`, validating firm + liveness only (§3.4). | §3.2 said the row *binds* client, purpose and event; §3.4 never compared them, so the binding was **audit-only**. An authorization minted for a lit client A was consumable during a dark client B's dispatch, and B's context reached the model with no B consent. Found independently by two reviews. | **§3.2**, **§3.4** (rewritten), **§3.7**, **§8**, **§9.1**, **§10.2** |
| **A2** | `expires_at > now()`; §3.6's linearization stated unconditionally. | `now()` is transaction-stable: a caller in a long-open transaction never saw expiry. And a PL/pgSQL function cannot commit its caller's transaction, so `granted` did not imply committed for an arbitrary caller. | **§3.2**, **§3.4**, **§3.6**, **§3.7**, **§9.3**, residual **R-8** |
| **A3** | Four owner RPCs; §7.2 step 1 "ingest the letter as a `consent_evidence` document". | **Step 1 had no executable form.** Only the legacy `grant_client_egress` could stamp that kind, and it granted purpose-blind invoice-facts egress in the same call; `set_document_kind` refuses the kind. A wiki-only consent could not be onboarded. | **§7.1** (fifth RPC), **§7.2**, **§8**, **§9.1**, **§9.7** |
| **A4** | "byte-identical", mechanism unspecified; the build chose normalized md5. | Lowercasing + whitespace-stripping reach inside string literals, and the tail pinned neither the legacy ACLs nor the legacy relation's triggers/FKs/RLS/policies — all of which §6 promises. | **§6.1** (new), **§8** |

**Errata ratified with them.**

| Erratum | v1.0 said | Correct |
|---|---|---|
| Index count (§8) | "the three partial unique indexes" | **Two** one-live uniques + **one non-unique** open-authorization index (plus A-timing's fourth, also non-unique). Making the third unique would break concurrent dispatch for one client. |
| Timing (§3.3, §5.1) | "no timing branch a caller can distinguish" | Withdrawn as unachievable in SQL. Payload/error-shape uniformity is enforced; the two coarsest execution differences are removed; the remainder is **named** as residual **R-7**. |
| Refusal code (§7.1) | CLR11 for client-not-in-firm | Kept — but the ordering is now specified: firm membership is verified **first**, and `firm_id` is in every state-row predicate, so `activate`/`deactivate`/`revoke` neither return CLR28 nor lock a foreign firm's row. |

**Not adopted, with reasons.** (a) A `domain_events` cross-check inside
`prepare_egress_dispatch` — one review's suggested extra: it would give a runtime-callable
existence probe over the event log, and A1's re-binding already prevents spending an
authorization on a different dispatch. (b) The §10.2 two-PR split as a *rewrite of history*:
the staging requirement stands and is decided at PR time; commits are not restructured
retroactively.
