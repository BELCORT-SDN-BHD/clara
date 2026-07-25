# Migration 0020 — typed egress consent + dispatch authorization (WB-R23 · WB-R24(iii)) · design contract v1.5 (RATIFIED)

> **Status: RATIFIED v1.5 — v1.4 plus the ratified OWNER RULING A8 (2026-07-25): the
> canonicalization is corrected AT THE EVENT SPINE, §5.8.** Ratchet R4 re-derived the whole
> authorization chain independently and found it CONVERGED — no alternate production path
> around the consume boundary, the canonical form closed across all twelve caller-reachable
> fields, no third caller-prose channel. It then found that A7's own remediation was right
> about the rows and wrong about the architecture: `domain_events` is **append-only**, the
> pre-0020 backfill wrote the filename-bearing title, hash, storage key and size into
> `wiki.page_published` / `wiki.source_ingested` as well, and A7's two bare `update`s corrected
> only the tables. So the table bridge passed while a projection **rebuilt from the event log**
> restored the old title and reconstruction envelope — reopening A7's caller-prose channel in a
> rebuilt projection and violating the W4/P17 event-only, bit-identical rebuild invariant. A8 is
> the owner's adjudication: a **fifth** bridge direction that checks the spine, an **audited
> correction operation** shipped as `packages/db/deploy/wave-b-0020-a7-*.sql` that corrects the
> rows *and* appends replay-understood correction envelopes, and a **new event type**
> `wiki.page_canonicalized` that is how you lawfully correct an append-only log. A8 also wires
> the 19→20 upgrade drill into CI (it had been proposed in a comment and skipped in every
> normal run — a misleading green) and **corrects §§5.3/8's stale A6 prose**, which described
> behaviour A7 had already replaced and which a blind lane would have reimplemented.
> Everything about A1–A7's rulings is otherwise unchanged.
>
> **Status: RATIFIED v1.4 — v1.3 plus the ratified OWNER RULING A7 (2026-07-25): the exempt
> page's bytes are made STRUCTURALLY CANONICAL, §5.7.** Ratchet R3 reviewed A5/A6 and found
> that A6 had fixed a channel rather than the defect. Its bridge proved only that no
> *model-path publication row* existed, which a pre-0020 `p_note` call satisfies while carrying
> arbitrary prose; and its central claim — that `p_note` was **the one** caller-controlled
> content channel — was simply wrong: `documents.original_filename` was copied into the page
> **body and title** by the same two lines. A7 is the owner's adjudication and is **one** fix,
> not two checks: a source page's title and body are now derived from fixed text plus the
> opaque document uuid and from **nothing a caller supplied**, which closes the filename channel
> outright and lets the apply-time bridge verify **any** historical page by RECONSTRUCTION —
> subsuming A6's proxy test. A7 also fixes an **idempotency regression A6 introduced**: its
> floor raised *before* `_reserve_op`, so a delayed exact retry of a legitimate pre-0020 noted
> call errored instead of replaying its receipt. Two **errata** in §§8/9 are corrected with it.
> Everything about A1–A6's rulings is otherwise unchanged.
>
> **Status: RATIFIED v1.3 — v1.2 plus the ratified OWNER RULING A6 (2026-07-25): what the
> A5 exemption was still missing, §5.6.** A5 was reviewed adversarially after it was built.
> The discriminator held; the exemption was incomplete in three places — the daily lint went
> superlinear on the population A5 unbounded (§5.6a), the apply-time bridge proved set
> membership rather than content provenance (§5.6b), and the exemption's premise that source
> bytes are machine-generated was a **caller convention** rather than a structural fact
> (§5.6c). A6 is the owner's adjudication of all three. Residual **A5-R1** is restated
> plainly and promoted to §11; the *context-pack* half is deliberately **not** fixed here.
> Ratchet **R2**'s cross-firm lock reach in `classify_consent_evidence_document` lands in the
> same PR as a build fix — see the v1.2 → v1.3 changelog. Everything about A1–A5 is unchanged.
>
> **Status: RATIFIED v1.2 — v1.1 plus the ratified OWNER RULING A5 (2026-07-25): the
> two-class wiki page budget, §5.5.** A5 is not a ratchet finding. Lighting deterministic
> ingest (§5.3/§10.1) made a latent defect in the *inherited* WB-R8 page budget operative —
> one budget was silently bounding two different classes of page — and the owner ruled on it
> before the migration shipped. §5.5 is that ruling; the amendment table below carries its
> row. Everything about A1–A4 is unchanged.
>
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
> | **A5** *(owner ruling, 2026-07-25)* | The WB-R8 per-client page cap is **split into two classes**. Deterministic `sources/<document_id>` pages are **exempt** from `max_pages_per_client` and bounded by their own key **`max_source_pages_per_client`** with its own typed reason; the **`sources/` slug namespace is reserved** so the exemption cannot be forged. Lighting ingest would otherwise have un-indexed every busy client at 40 documents. | **§5.5** (new), **§5.3**, **§8**, **§9.6**, **§10.1** |
> | **A6** *(owner ruling, 2026-07-25)* | Three things the A5 exemption was still missing: the orphan lint narrows to exclude the reserved namespace (it had gone superlinear), a **third** apply-time bridge direction, and a structural **`p_note is null`** floor on the ingest verb. | **§5.6** (new), **§6.1**, **§8**, **§9.7** |
> | **A7** *(owner ruling, 2026-07-25)* | The exempt page's **bytes are made canonical**: title and body derive from fixed text plus the opaque document uuid and from **no caller-supplied string** — closing `documents.original_filename`, the channel A6 missed, and letting the bridge verify any historical page by **reconstruction** (a **fourth** direction that subsumes the third). The `p_note` floor is kept as defence in depth but moves **behind `_reserve_op`**, restoring op-key replay. | **§5.7** (new), **§5.6**, **§6.1**, **§8**, **§9.7** |
> | **A8** *(owner ruling, 2026-07-25)* | Canonicalization is corrected **at the append-only event spine**, not only in the rows: a **fifth** bridge direction, an **audited correction operation** (two shipped deploy artifacts) replacing A7's two bare `update`s, and the `wiki.page_canonicalized` correction event type. The 19→20 upgrade drill is **wired into CI**, and §§5.3/8's stale A6 prose is corrected. | **§5.8** (new), **§5.3**, **§5.7**, **§8**, **§9.7**, **§10.3**, **§11** |
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

**`record_wiki_source_ingest` does not gain a uniqueness requirement.** Making it require
uniqueness would break the `entry.approved` lane, which carries an authoritative `client_id`
on the event and must keep working for a document legitimately filed to more than one client.
The uniqueness requirement belongs to the *resolver-driven* path only, which is why it lives
in a new entry point.

> **ERRATUM (A8, ratified 2026-07-25).** v1.0–v1.4 said "`record_wiki_source_ingest` is **NOT
> modified**" — true when written, false from **A7**, which makes exactly **two** edits to it:
> the canonical source-page form (§5.7) and the `p_note` floor, the latter placed **behind**
> `_reserve_op`. Its §6.1 pin is not retuned; the tail reverses both edits and re-hashes to
> 0017's original pin (§8). The sentence above is narrowed to the claim that was actually
> being made — no *uniqueness* requirement is added to this verb — because a blind lane
> reading the old wording would have left A7 unimplemented.

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

### 5.5 The two-class page budget (AMENDMENT A5, owner ruling, ratified 2026-07-25)

**What the cap conflated.** WB-R8 seeded exactly one per-client page budget —
`clara.wiki_budgets('max_pages_per_client', 40)` — and the publication core charges
**every** new slug against it. That budget was written to bound **synthesized** pages: the
two costs it protects against are **model spend** and **context-pack noise**. Until this
migration nothing else could create pages at volume, so one budget was one class and the
conflation was invisible.

**Why lighting deterministic ingest surfaced it.** §5.3 / §10.1 make a uniquely-filed
`document.classified` publish deterministically, and `record_wiki_source_ingest` mints
**one page per document** at slug `sources/<document_id>`. Those pages were charged against
the same 40. At RPR-scale document volume a client reaches 40 **in weeks**, and from that
moment the client is silently un-indexed: every further ingest *and* every synthesized page
refuses `CLR32/cap_exceeded`, and every later `document.filing_retired` re-drive takes the
`skipped_cap` path. A volume threshold, not a knowledge threshold, would have stopped the
wiki — quietly, on the busiest clients first.

**The ruling.** A `sources/*` page is a **deterministic provenance record**: no model call,
no synthesis, no consent surface, one per document, and it scales with **document volume**
rather than with **knowledge**. A synthesized page scales with knowledge and costs a model
call. *The two classes must not share a budget.* Deterministic source pages are therefore
**exempt** from `max_pages_per_client` and bounded by their own key. Unbounded growth is not
wanted either — a separate ceiling costs almost nothing and keeps the classes honest.

**The discriminator, and why every weaker candidate was rejected.** The test a discriminator
must pass is that a **model-synthesis path cannot publish a page satisfying it**. That is not
hypothetical: the seeding `wiki_fact` lane publishes `slug` / `title` / `page_kind` /
`content` taken **verbatim** from a seeding proposal a **model authored**, calling
`publish_wiki_page_version` with `synthesis='deterministic'`, `engine_id=null`.

| Candidate | Verdict |
|---|---|
| The `sources/` **slug prefix** alone | **Rejected — forgeable.** The slug is a caller argument on the granted wrapper, `sources/<uuid>` satisfies the W1 slug grammar, and the lane above hands a model direct authorship of it. Worse than losing the exemption: a model page would land in the **source counting bucket**, so the synthesized cap would stop binding. |
| **`page_kind`** | **Rejected — cannot separate them even in principle.** `record_wiki_source_ingest` uses `period_context`, and the deterministic `wiki_fact` lane may also use `period_context`. |
| **`p_synthesis='deterministic'`** | **Rejected — a caller argument, and a *claim*.** It asserts how the bytes were produced; the DB cannot verify it, and the `wiki_fact` lane already passes exactly that value. |
| **`p_engine_id is null`** | **Rejected — not independent.** The preamble already enforces `(p_synthesis='model') <> (p_engine_id is not null)`, so this is `synthesis='deterministic'` restated, forgeable identically. |
| The citation detail flag `deterministic_ingest: true` | **Rejected — caller-supplied JSON the core never validates.** A claim, not a fact. |
| **`p_log_action='ingest'`** | **CHOSEN.** `p_log_action` is a parameter of `clara._publish_wiki_page_version_core`, which is **ungranted**; its only callers are the two `SECURITY DEFINER` wrappers, and each **hard-codes** its value (`'publish'` / `'ingest'`). No grantee, and no argument of the granted surface, can reach `'ingest'`. It is the only term on this path a model-synthesis caller **structurally cannot reach**. |

The installed condition is `p_log_action='ingest'` **in conjunction with**
`p_synthesis='deterministic'`, `p_engine_id is null`, `p_projected_from_seq is null` and the
canonical `sources/<uuid>` slug shape. Those four are a **consistency belt** over facts the
ingest wrapper fixes, never the cut — a future wrapper passing `'ingest'` with different
values **fails closed** into the tighter synthesized cap rather than silently inheriting the
exemption.

The conjunction is wrapped in `coalesce(…, false)`, and that is **load-bearing**. `p_log_action`
is the only term that can be `NULL`; without the coalesce the conjunction is `NULL`, `not
v_is_src` is `NULL`, so the namespace refusal **silently does not fire** while the exemption
branch also fails — and the page publishes **into** the reserved namespace and is counted in
the **source** bucket: a synthesized page escaping its own cap through three-valued logic.
`UNKNOWN` must mean *not a source page*, which is both fail-closed halves at once.

**The row-level half.** The discriminator decides one call's *arguments*; the cap must also
**count** the existing population per class, and a `wiki_pages` row carries no arguments.
Joining each page to its `wiki_log` `action='ingest'` row is exact but has no index. So the
namespace is **reserved structurally**: the core now refuses, typed
(`CLR32` / `reserved_slug_namespace`), any publication into `sources/%` that is not a
deterministic ingest. With that refusal in place `slug like 'sources/%'` is an exact
restatement of the unforgeable argument fact, and the cheap predicate is used. The bridge for
pages that already exist is proven **empirically at apply time, in both directions**, and a
single stray page aborts the apply.

**The new budget key.** `max_source_pages_per_client`, default **50000**, seeded into
`clara.wiki_budgets` (which becomes a five-row closed set). Generous by construction: the slug
namespace is keyed by document id, so a client's source pages can never outnumber the
documents actively filed to it — 50000 is roughly a century of a 500-document-a-year client.
It is read through 0017's own idiom and joins the **same** null check, so a missing row raises
`CLR32/budget_unknown`, which stays a **CONFIGURATION** refusal in the runtime (never
terminal; the checkpoint stays behind it).

**What deliberately does not change.**

- The synthesized refusal keeps its **exact** shape — message, `CLR32`, reason
  `cap_exceeded`, `budget_key` `max_pages_per_client`, same `limit`. Only the population it
  counts narrows.
- The new ceiling refuses with its **own** reason `source_cap_exceeded` and its own
  `budget_key`, so the two exhaustion modes are never confused in a receipt, a dead-letter or
  a lint finding. The consumer maps it to its own terminal status `skipped_source_cap`
  (§9.6); `reserved_slug_namespace` maps to `skipped_bad_state` — both **must** be enumerated,
  or an unrecognised typed refusal would block the firm cursor.
- The L7 `cap_pages` lint belt narrows to the **synthesized** population it measures. No
  second lint finding kind is added for the source ceiling: 50000 is not an operational
  target to warn about at 90%, its breach is already a hard typed refusal carrying its own
  reason, and a new kind would mean widening the `lint_findings` `finding_kind` CHECK.
- **No grant is added, no signature changes, no new error code.**

**One interaction worth stating plainly.** Reserving the namespace means
`publish_wiki_page_version` can no longer supersede a `sources/*` page. Nothing in production
did — the runtime lanes mint `counterparty/<id>` slugs and model/seeding-proposal slugs — but
one consequence follows: 0019 §5's monotonic guard case "a **non-null** new
`projected_from_seq` over an **ingest-made null** prior" is now **unreachable**, because the
only writer permitted in that namespace passes `null` itself. The guard's null-prior branch is
unchanged and still fully reachable on any non-source page; only that particular combination
is gone, and it is gone **by design**, not by accident.

**Named residual A5-R1 (not fixed here; needs its own ruling).** `get_context_pack` ranks
candidates by `page_kind` priority, and `period_context` is priority **2 of 6**. Deterministic
source pages carry `page_kind='period_context'` and are the most recently updated pages a busy
client has, so once six exist the pack window is theirs and treatments / recurring patterns /
counterparty pages are crowded out. That is a consequence of **lighting ingest**, not of A5 —
at the old shared cap of 40 the same six slots were already taken, and A5 does not change what
the pack selects. It is recorded because this ruling names *context-pack noise* as one of the
two things WB-R8's cap protected, and the **pack half of that protection is demonstrably not
doing its job**.

> **A5-R1, restated plainly (ratchet A5-R, 2026-07-25).** The paragraph above understates it,
> and the understatement mattered enough to correct. WB-R8's single cap was protecting **two**
> things: model spend and context-pack noise. A5 keeps the spend half bounded — the synthesized
> cap still binds at 40, on exactly the population that costs money. It does **not** keep the
> pack half bounded, and it **raises the ceiling on the population that crowds the pack from 40
> to 50000**. Both halves of what the cap protected therefore now scale with **document
> volume**, and A6 (below) is the same story on the lint surface: every exempt source page was
> simultaneously a permanently-open `orphan_page` finding and a priority-2 pack candidate. A6
> fixes the lint half structurally. **The pack half is not fixed and is not fixable here** —
> `get_context_pack`'s ranking is WB-R8 / W6 contract surface, and changing what the six-page
> window selects is a ruling of its own, not a patch attached to a budget amendment. It is
> recorded as the **open residual it is**, with the honest consequence stated: on a
> document-heavy client the six-page pack is, today, six provenance stubs.

### 5.6 What the exemption was still missing (AMENDMENT A6, owner ruling, ratified 2026-07-25)

A5 was reviewed adversarially after it was built. The review did not find the discriminator
wrong — it found the exemption **incomplete in three places**, each of which follows from the
same oversight: A5 decided *who* may publish into the reserved namespace and *how many* pages
that namespace may hold, and then stopped. It did not ask what the exempt pages **cost the
rest of the system**, what the exempt **bytes** are, or what the apply-time bridge actually
**proves**. A6 is the owner's adjudication of that review.

**(a) The exemption made the daily lint a superlinear work queue.** L's orphan rule
(`0017:4716-4728`) opens an `orphan_page` finding for any active page with **zero**
`wiki_page_refs`. A deterministic source page has zero refs **by construction** —
`record_wiki_source_ingest` always passes `p_refs = '[]'::jsonb` (`0017:2269`). So every
ingested document produced a permanently-open finding **and** an L6 `lint_finding_opened`
notification, on a population A5 had just re-ceilinged from 40 to 50000. Worse than noise: the
supersede sweep rescans the whole conditions array once per open finding (`0017:4863-4866`), so
`run_client_lint` costs **O(N²)** in exactly that population, and `run_lint_all` iterates every
active client in one call (`0017:4927-4934`) — one document-heavy client stalls the firm's whole
daily pass. **Measured on the rig** (local PG17, one client, steady state):

| Source pages | `run_client_lint`, before | after | open findings, before → after |
|---|---|---|---|
| 900 | 307 ms (first pass 1,526 ms) | 2 ms | 900 → 0 |
| 2,700 | 10,991 ms (first pass 33,242 ms) | 3 ms | 2,700 → 0 |

3× the pages, **35.8×** the time. The fix is one more drift-guarded narrowing in the same
change-of-record block A5 already owns: the orphan rule skips the reserved namespace. The rule
is **not** disabled — a synthesized page with no refs is still an orphan, asserted by its own
cell. Pages that already carry stale findings **self-heal**: the existing not-in-conditions
sweep supersedes them on the next pass (measured: 4,881 ms once for 2,700 findings, then 3 ms
steady). No backfill, no data fix, nothing to run by hand.

*Rejected: teaching the ingest verb to write a ref.* A ref is a **knowledge edge** between wiki
pages; a provenance record has none, and manufacturing one to satisfy a linter is writing the
graph to fit the tool. The page's tie to its document already lives in its citation and in its
`wiki_log` ingest row.

**(b) The apply-time bridge proved set membership, not content provenance.** v1.2's bridge
asked, in both directions, whether the `sources/%` population and the `wiki_log action='ingest'`
population coincide. Neither direction notices that a page's **current version is
model-synthesized**. Before 0020 the namespace was unreserved, so a model
`publish_wiki_page_version` **could** have superseded an ingested `sources/<doc>` page; the
result carries an `ingest` row from its birth, satisfies both directions, applies clean, and
becomes **permanently exempt and unrepairable** — the reservation now refuses a re-publish, and
a `record_wiki_source_ingest` re-drive returns the `_reserve_op` dedupe receipt without
re-entering the core. Live likelihood is near zero. A claim the apply cannot substantiate is
not. **A third fail-closed direction is added** — no `sources/%` page carries a `wiki_log`
`action='publish'` row, which only `publish_wiki_page_version` can write — and v1.2's wording
("proven empirically, in both directions") is **corrected**: what is proven is **creation and
every publication**, not set membership. §10.3 step 3's receipt is corrected the same way.

**(c) The exemption's premise was a caller convention. It is now structural.** A5 argues that a
`sources/*` page is a deterministic provenance record — machine-generated bytes, no model, no
consent surface — and grants the exemption **on that basis**. But
`record_wiki_source_ingest` built its page content as
`coalesce(nullif(btrim(p_note),''), 'Source document: '||filename)` (`0017:2255-2256`), and
`p_note` is a **caller argument on a verb granted to `clara_runtime`**. Arbitrary prose could
therefore be written as page body, stamped `synthesis='deterministic'`, and made exempt from
`max_pages_per_client`. And because the W9 synthesis-hold gate fires only for
`p_synthesis='model'` (`0017:2040-2044`), that prose **published onto a client under a live
synthesis hold**, in the same transaction where a model page is refused `consent_held`. Both
halves were driven on the rig.

> **Ruling.** `p_note` must be **NULL** on the exempt path. **All three** production callers
> already pass null — `packages/runtime/lib/wiki-projection.mjs` `planDeterministicIngest`,
> `packages/runtime/lib/wiki-projection-ops.mjs` `backfillWikiSources` (the ceremony's
> deterministic backfill), and §5.3's `resolve_and_ingest_wiki_source` — so it costs nothing
> today and closes the channel
> structurally. A documented "callers must pass null" limit would be exactly the model
> discipline this project rejects — the cardinal invariant is that guarantees are enforced in
> the DB, not by caller convention, and R1's F1 was refused on the same ground. If a future lane
> genuinely needs a human note on a source page, it revisits this **deliberately** rather than
> inheriting a silent hole.

The refusal is typed with its own discriminant — **CLR10 / `source_note_not_permitted`**, in
§7.1's argument-validation grammar — and is placed **first**, after the op-key check and before
every read, lock and `_reserve_op` call, so a noted call reserves nothing, reads nothing and
cannot be turned into a document-existence probe. The predicate is `is not null`, **not**
`btrim(...) <> ''`: the channel is closed, not the subset that happens to reach the content.
The **parameter is kept** — dropping it would change a signature 0019 pins by exact identity,
that the grant and the wiki whitelist both name, and that the runtime caller passes.

**The trade this costs.** `record_wiki_source_ingest` is a member of §6.1's EXACT-source pinned
set, and A6 is the one deliberate change to it. Its pin is therefore **not retuned to a new
opaque hash** — that would say only "it is whatever it is now". It is made **stronger**: strip
exactly the A6 insertion and the remainder must still hash to **0017's original pin**, byte for
byte. The assertion proves two things at once — the floor is present in its exact shape, and
nothing else in that function moved, including under an edit that also carried the A6 text.

> **Superseded in part by A7 (see §5.7, "The §6 trade, restated").** From A7 this verb carries
> **two** edits, not one — the canonical form and the floor — and the tail strips **both**
> before re-hashing to 0017's pin. The method above is unchanged; only the count is.
> Implement §5.7 and §8, not this paragraph.

**Rig cost, stated rather than hidden.** The rig's `recordWikiIngest` helper defaulted to a
non-null note, so six fixtures passed prose the DB now refuses. The helper default becomes
`null` (matching production) and each fixture is updated. One of them — the `op_key` mutation
law in `wb-g-opkeys` — used `p_note` as the field it moved to prove "same key, different args →
CLR10"; it now moves the **document** instead, over two filed sources on the same client. No
assertion anywhere depended on the note's content.

**What A6 does not change.** No grant. No signature. No new error code. No `finding_kind`
CHECK. The synthesized cap, the source ceiling, both typed reasons, both budget keys and every
receipt token are exactly as A5 ratified them.

**Where the proof lives.** A5's battery, `packages/db/tests/wave-b/wb-0020-source-budget.test.mjs`
— **not** a blind lane, and it says so: it is written alongside the SQL as the amendment's own
adversarial proof. A6 adds six cells to it: **E2** (a ref-less *synthesized* page is still an
orphan — the rule was narrowed, not disabled), **F / F2 / F3** (the note refusal; that it
precedes every read, lock and `_reserve_op`; and that the channel it closed was a hold bypass),
and **G / G2** (no page in the namespace carries a model-path publication, corpus-wide, plus
the mechanism that keeps it true). **E** is tightened to pin the orphan population by exact
slug rather than asserting only about `cap_pages`. The R2 build fix is proven by a two-session
cell **with a control** in `wb-0020-tail.test.mjs`, and the §6 strip-and-compare pin lives in
`wb-0020-legacy.test.mjs`.

> **A7 supersedes two of A6's three parts.** §5.6(b)'s third bridge direction is kept but is no
> longer the load-bearing test, and §5.6(c)'s claim that `p_note` is "the ONE argument" is
> **retracted**. §5.6(a) — the orphan-lint narrowing — stands unchanged. See §5.7.

---

### 5.7 The exempt page's bytes, made canonical (AMENDMENT A7, owner ruling, ratified 2026-07-25)

Ratchet **R3** reviewed A5 and A6 together. It confirmed the authorization core clean and the
A5 discriminator sound, and then found that **A6 had fixed a channel rather than the defect** —
two MEDIUMs which the owner adjudicated as **one root cause**.

**(a) The bridge proved a proxy, not provenance.** §5.6(b) added a third direction that asks
whether any `sources/%` page carries a `wiki_log` `action='publish'` row. That catches a
*model-path supersede*. It does not catch the thing the exemption actually depends on. A
pre-0020 `record_wiki_source_ingest` call carrying model prose in `p_note` produces a page with
`action='ingest'`, `synthesis='deterministic'` and **no** `publish` row — so it satisfies all
three directions, applies clean, and is granted the cap and orphan exemptions over arbitrary
caller text.

**(b) `p_note` was never the only content channel.** `0017:2255-2256` copies
`documents.original_filename` into the page **body** and `0017:2259` copies it into the
**title**. A filename is caller-chosen: intake accepts up to 255 printable characters
(`packages/runtime/lib/intake.mjs`) and the column carries no content constraint
(`0007:106`). So a bookkeeper who uploads a document whose filename is prose gets that prose
published — under a live synthesis hold, into a page exempt from `max_pages_per_client` and
from the zero-ref orphan lint — with `p_note` **null the whole way**. A6's "only channel" claim
was wrong, and the cell that blessed it asserted only a **prefix**
(`/^Source document: /`), which `Source document: <prose filename>` also satisfies.

> **Ruling.** Do not bolt a second check onto a second channel. Make the exempt page's bytes
> **structurally canonical**: derive title and body from **fixed text plus the document's opaque
> uuid**, and from no caller-supplied string at all.
>
> ```
> title   = 'Source: '           || <document_id>
> content = 'Source document: '  || <document_id>
> ```
>
> This is deliberately **0017's own null-filename branch**, promoted from a fallback to the only
> form: `coalesce(d.original_filename, p_document::text)` becomes `p_document::text`. It is the
> smallest change that makes the property computable, and a corpus whose documents had no
> filename already satisfies it.

**Why one change closes both findings.** (b) is closed outright — no caller-controlled string
reaches the bytes, whatever argument it rode in on. (a) is **subsumed**: with a canonical form
the bridge stops hunting for a mechanism and instead **reconstructs**. A **fourth** direction
computes each page's canonical title and body from the document uuid in its slug and compares
against the stored `wiki_pages.title` and **every** `wiki_page_versions.content`. Any page that
does not reconstruct is carrying non-canonical bytes — whether they came from a note, from a
filename, or from a model-path publication — and no request-hash archaeology is needed. That is
strictly stronger than direction 3, which is kept as belt because it names the mechanism and is
the cheap index-friendly half. The `p_note is null` floor is likewise kept as **defence in
depth**: the argument still travels the granted surface into the op-key hash, and "reachable but
inert" is the shape of the next hole.

**Fail-closed, with a real remediation.** A page that cannot be reconstructed **ABORTS the
apply**; it is never exempted. The abort names the offending slugs (first 25) and the
remediation below. The remediation is a **pure re-derivation of a machine artifact** — it
recomputes title, content, `content_sha256`, `storage_key` and `size_bytes` from the document
uuid in the slug, touches no other namespace, and is idempotent. It exists because the two
alternatives do not: `retire_wiki_page` + re-ingest is **impossible** (the publication core
refuses a retired page's slug, `0017:2075-2077`, and the slug is unique per client), and a
delete would destroy audit history.

> ### ⚠ SUPERSEDED BY AMENDMENT A8 (2026-07-25) — DO NOT RUN THE TWO `update`s
>
> A7's remediation was **two bare `update` statements** over `wiki_pages` /
> `wiki_page_versions`. **Ratchet R4 (finding F1) proved them insufficient and unsafe on
> production:** `clara.domain_events` is append-only, the same pre-0020 ingest wrote the
> filename-bearing title / hash / storage key / size into `wiki.page_published` and
> `wiki.source_ingested`, and correcting only the rows leaves that spine stale — so a
> projection **rebuilt from events** restores the prose. **§5.8 is the ruling that replaces
> them.** The remediation is now the shipped, audited, idempotent pair
> `packages/db/deploy/wave-b-0020-a7-probe.sql` (read-only) and
> `packages/db/deploy/wave-b-0020-a7-preflight.sql`, and migration 0020 gains a **fifth**
> bridge direction that **refuses** a rows-only remediation fail-closed. The two `update`s
> survive in the repository only as the upgrade fixture's **negative control**
> (`wb-0020-upgrade.test.mjs`), where they must FAIL to apply.
>
> Everything else in §5.7 — the canonical form, the fourth direction, the floor reordering,
> the §6 trade, A7-R1 — stands unchanged.

> **Live-deploy consequence, stated rather than discovered at the ceremony.** The 30 pages the
> 0019 ceremony backfilled were written by the pre-A7 verb from real uploads, so their bodies
> and titles carry their filenames. **0020 will abort on them**, and §10.3 must run the
> remediation above as an explicit pre-flight step before the apply. It rewrites DB bytes only;
> the object-storage blob at each page's *old* `content_sha256` key is left in place and a blob
> at the new key is not written. Nothing reads it — `get_wiki_page`, `list_wiki_pages`,
> `get_context_pack` and the dashboard all serve `wiki_page_versions.content` from the database
> — but the orphaned object is real and is named here rather than left to be found.

**The idempotency regression A6 introduced, and its fix.** A6 placed its floor **before**
`_reserve_op` so a noted call would "reserve nothing, read nothing". That reasoning was sound
about leakage and wrong about receipts: **op-key replay is a core invariant of every governed
verb in this system** (`_reserve_op` / `_finish_op`; R19 — the same intent keeps its `op_key`
and a retry REPLAYS). With the floor ahead of the reservation, a delayed **exact** retry of a
legitimate pre-0020 noted call raised `CLR10` instead of returning its stored receipt — a
governed verb forgetting its own receipt. A7 restores the order: **reserve first**, return the
dedupe receipt unchanged, and apply the floor only to a **fresh** invocation. Nothing is leaked
by the change (a null-note caller could already probe document existence through this verb), and
a refused call's own transaction rolls the reservation back, so a refused key stays reusable.
The visible consequence, asserted rather than hidden: a *noted* call on a **nonexistent**
document now draws the verb's own `CLR02` document floor rather than `CLR10`.

**What A7 changes downstream, and what it does not.** No grant. No signature. No new error code.
No `finding_kind` CHECK. Both budget keys, both typed reasons and every receipt token are
exactly as A5 ratified them. The **filename is not erased** — it stays on `clara.documents`,
which is where every human surface already reads it (`apps/dashboard/app/documents/*`,
`apps/dashboard/app/chat/page.tsx`). What is lost is the filename appearing *in the source
page's own title and body*: a wiki page list now reads `Source: 3f2b…` rather than
`Source: invoice-jan.pdf`. **No code depends on it** — the runtime suite (598/598) and the DB
suite are green without a single call-site change — but it is a human-readability cost, and the
place to pay it back is a **join, not page bytes**: the page's citation already carries
`document_id` and `document_sha256`, so any surface that wants the filename can join
`clara.documents`. Recorded as residual **A7-R1** in §11.

**The §6 trade, restated.** `record_wiki_source_ingest` is a member of §6.1's EXACT-source
pinned set, and it now carries **two** deliberate edits. Its pin is still not retuned to a new
opaque hash: **reverse** both edits — strip the floor block, strip the canonical-form comment,
and substitute 0017's own content/title derivation back — and the remainder must still hash to
**0017's original pin**, byte for byte.

**Where the proof lives.** `wb-0020-source-budget.test.mjs` gains **F1b** (a hostile filename
reaches neither body nor title), and **F**, **F2** and **G** are rewritten rather than extended:
**F** asserts **exact** canonical bytes instead of the prefix that blessed the hole, **F2**
proves the reordering *and* that an exact retry replays byte-identically, and **G** replaces its
log-action/label corpus scan with the reconstruction. The half none of them can reach — what the
**migration** does to a corpus that already exists — is a new reset-gated drill,
`wb-0020-upgrade.test.mjs`: it builds a 19-migration world with **both** hostile pages, proves
the apply **aborts** naming both, runs the remediation above **verbatim**, proves the apply then
**succeeds**, proves the pre-0020 noted op key still **replays** across the upgrade while a
fresh noted call is refused, and carries a negative control (a canonical pre-0020 corpus
upgrades untouched, with no remediation).

### 5.8 The correction goes to the EVENT SPINE, not only the rows (AMENDMENT A8, owner ruling, ratified 2026-07-25)

Ratchet **R4** re-derived the authorization chain independently and found it **converged**:
evidence classification grants nothing; a live purpose-specific consent and an exact-consent
activation must coexist; prepare binds firm/client/purpose/consent/activation/event; consume
locks by authorization *and* firm, compares every dispatch field, checks wall-clock expiry and
the exact live consent/activation, then commits; the runtime commits that consume in its own
transaction before calling the model; revocation invalidates transactionally. **No alternate
production path around that boundary exists.** The canonical form is closed across all twelve
caller-reachable fields, and there is **no third caller-prose channel** in the live writer.

It then found **one new production defect, introduced by A7's own remediation**.

**Canonicalizing the rows leaves the event spine non-canonical.** `clara.domain_events` is
**append-only**, trigger-enforced (`0005:288-291`). The pre-0020 ingest verb wrote the
filename-bearing title, content hash, storage key and size into `wiki.page_published`
(`0017:2280`), and the hash and key into `wiki.source_ingested` (`0017:2277`) — not only into
the wiki tables. A7's two `update`s correct only the tables. So:

* 0020's table bridge (direction 4) **passes**, while
* a projection **rebuilt from the event log** — the W4/P17 invariant this entire design rests
  on, the property `wb-r1-followon.test.mjs:167` and `wb-w-pack.test.mjs` exist to protect, and
  what a DR restore of the index actually performs — **restores the old filename-bearing title
  and the old reconstruction envelope**, or fails against the old storage key.

That silently reopens, in a rebuilt projection, exactly the caller-prose channel A7 closed.
The fix was right about the rows and wrong about the architecture.

> **Ruling.** Correct the log the only way an append-only log may be corrected: **append**.
> Canonicalization becomes an **audited correction operation** that, in ONE transaction,
> updates the rows **and** appends a replay-understood **canonical correction envelope** for
> every affected version. It is the same reverse-not-delete discipline the books use for a
> posted entry — you never rewrite history, you append the correction. And the migration
> **checks the spine**, so a rows-only remediation cannot apply.

**The correction event type.** `wiki.page_canonicalized` — client-scoped, taxonomy decision
`ignore`, the **fourth** `wiki.*` type and the only one 0020 registers. The projection consumer
does not subscribe `wiki.*` (P17), so nothing routes and no outbox row is minted. Its payload
uses the **same key names** `wiki.page_published` uses for the corrected fields, so a rebuild
needs one extra rule and no new field mapping:

```json
{ "correction": "a7_canonicalization", "reconstruction_schema": 1,
  "page_id": "...", "slug": "sources/<doc>", "version_id": "...", "version_n": 1,
  "title": "Source: <doc>", "content": "Source document: <doc>",
  "content_sha256": "...", "storage_key": "firms/<firm>/wiki/<client>/<sha>.md",
  "size_bytes": 40,
  "preimage": { "title": "...", "content": "...", "content_sha256": "...",
                "storage_key": "...", "size_bytes": 123 } }
```

**THE REBUILD RULE (normative).** Apply `wiki.page_published` in seq order; then, for each
`(page_id, version_id)`, apply the **latest** `wiki.page_canonicalized` that is **later in
seq**. The correction overrides **`title`, `content`, `content_sha256`, `storage_key` and
`size_bytes` — and nothing else**: not synthesis, engine, `projected_from_seq`, citations,
refs, `page_kind`, slug or lifecycle state. A correction corrects bytes; it does not republish
a page. **`payload.preimage` is audit-only and never enters a rebuilt projection.**

**Direction 5 — the spine, made structural.** The apply-time bridge gains a fifth direction:
for every page in the reserved namespace, **no** `wiki.page_published` / `wiki.source_ingested`
event may carry a non-canonical title, hash, key or size **unless a later
`wiki.page_canonicalized` for the same `(page_id, version_id)` supersedes it**. Fail-closed: an
uncorrected envelope **ABORTS the apply**, names the pages, and names the preflight. Direction 5
is re-read in the §8 tail as a receipt, exactly as direction 4 is. `page_id` is compared as
**text**, so no untrusted payload string is ever cast to `uuid`.

**The remediation, as shipped.** Two artifacts, both in `packages/db/deploy/`, both run by the
upgrade fixture **verbatim** (a copy inside the test would prove the copy, not the artifact):

| Artifact | What it is |
|---|---|
| `wave-b-0020-a7-probe.sql` | **Read-only.** Statement 1 asserts the read environment and **refuses to report** if row-level security could filter any of the four source relations for the current role (ratchet R5-C: under `clara_authenticated` every count reads zero, which is byte-identical to a clean database — a silent false-clean in the one artifact a human uses to decide whether to remediate). Statement 2 reports **all five bridge directions**, not two — D1/D2/D3 are set-membership and mechanism facts **no script can repair**, and it says so in the row's `remedy`; D4/D5 are the preflight's job. It also reports the residual **A8-R1 completeness population** as advisory, and lists up to 25 offending slugs per failing check from the *same* predicates, so summary and detail cannot drift. Writes nothing; safe on production at any time. |
| `wave-b-0020-a7-preflight.sql` | **The audited correction.** One `do` block = one statement = one transaction. Registers the correction event type if absent; for every page non-canonical **in the rows or in the spine**, re-derives the title and every version's content/hash/key/size, appends **one envelope per version**, writes an `audit_log` row per page; then **re-asserts bridge directions 4 and 5** and raises if either would still abort. |

The preflight runs at **nineteen** migrations, so it registers the event type itself; 0020
registers the byte-identical row `on conflict do nothing`. A database that needed the preflight
and one whose corpus was already canonical therefore **converge on the same catalog at 20** —
the event-type roster is a function of the migration level and of nothing else, and the §8 tail
asserts exactly that.

**Idempotent and row-scoped**, by construction: the driving predicate is "this page is not
canonical, in the rows or in the spine". A second run selects nothing, updates nothing, appends
nothing. A page that is already canonical is never touched and never gets an envelope. Nothing
outside `slug like 'sources/%'` is read or written.

**Where the preimage goes, and why.** Into `payload.preimage` of the correction envelope — not
destroyed, and not put back into page bytes. The property A7 bought is that **caller prose is
not in exempt page BYTES**: the thing `get_wiki_page` / `list_wiki_pages` / `get_context_pack`
serve, and the only wiki text a model ever sees. `domain_events` is in **no** wiki read path and
is **not** an input to synthesis (the projection prompt carries page kind, counterparty id and
event *type* only — `packages/runtime/lib/wiki-projection.mjs`), and it **already holds the
non-canonical title forever** in the original `wiki.page_published` payload, where it cannot be
removed. The one thing that would otherwise be **lost** is a `p_note` body: the publication
envelope never carried `content`. So the correction records it, deliberately — erasing a
provenance record was never the goal, and the tension resolves in favour of preserving it
because the log is not a channel into the model. A **filename** preimage is additionally still
on `clara.documents`, which is where every human surface already reads it (A7-R1).

**Named honestly:** if an operator has *already* run A7's two `update`s, the `p_note` body is
**gone before the preflight can see it**. The preflight still repairs the spine and the apply
still succeeds, but that preimage is unrecoverable. It is why §10.3 names the preflight — never
the `update`s — and why the upgrade fixture asserts exactly this loss in its negative control.

**A side effect, stated rather than discovered.** Each correction advances the firm's
`firm_event_seq`, as any append does. Run it inside the quiesced ceremony window (§10.3 step 1),
where no wake or freshness token straddles it. The orphaned-blob consequence is unchanged from
A7 and is named there.

**The misleading green (R4 finding F2).** `wb-0020-upgrade.test.mjs` is the only proof of the
19→20 path and it skips whenever `CLARA_RIG_ALLOW_RESET` is unset — which normal CI leaves
unset; the CI step existed only as a **comment inside the test file**. A bridge or remediation
regression could therefore have merged with the advertised suite green, which this repository
already treats as a defect class in its own right. A8 **wires the step**: *"Wave-B 0020 A7/A8
upgrade drill (isolated DB)"* in `.github/workflows/ci.yml`, in its own throwaway database,
beside the C9 / document-pipeline / coding-floor drills — and a skip now prints a loud line on
stdout saying the upgrade path was **not** proven by that run.

**Where the proof lives.** `wb-0020-upgrade.test.mjs` grows from two cells to three:

1. **the main path** — the probe reports **both** halves; the apply aborts on direction 4 naming
   the shipped preflight; the preflight corrects rows **and** spine; the apply succeeds; **the
   index is rebuilt from `domain_events` alone and every logical field is compared** against the
   live rows (slug, page_kind, title, counterparty, state, version_n, hash, storage key, size,
   synthesis, engine, `projected_from_seq`, full citation rows, full ref rows, and the bytes
   re-hashed to the digest); the preimage is preserved; and a second preflight appends nothing
   and changes nothing;
2. **the F1 cell** — on its own corpus, A7's rows-only remediation runs verbatim; the probe
   shows `bytes_non_canonical = 0` while `spine_non_canonical = 2`; the **event-only rebuild
   disagrees with the live rows by restoring the prose filename into the page title**; and the
   apply **ABORTS on direction 5**. Before A8 the apply *succeeded* here;
3. **the clean-corpus control** — no remediation, no envelope, and the event-only rebuild is
   exact **without any correction in play**.

No existing replay test is weakened: `wb-r1-followon.test.mjs` [R2-F7] and `wb-w-pack.test.mjs`
W4/P17 are untouched, and their shadow models already produce canonical state because a
post-0020 corpus has no corrections in it. Two 0019 cells that pinned the `wiki.*` family as
"exactly the three 0017 types" become **migration-level exact** — three at 19 (0019's negative
proof, unchanged) and four at 20 — which keeps the closed set closed rather than loosening it.

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
- The four new typed-consent event types are registered, client-scoped, and in the ACTIVE
  taxonomy. A3's verb emits none.
- **(A8)** A **fifth** type, `wiki.page_canonicalized`, is registered — client-scoped, decision
  `ignore` — as **exactly one** row in each of `event_types` and the active taxonomy. It is the
  correction envelope direction 5 depends on, and the assertion is the negative proof that the
  preflight (which registers the identical row at 19) and the migration cannot diverge.
  *(ERRATUM, A8: v1.0–v1.4 said "the four new event types … and **only** those four", which was
  true before direction 5 existed. There are **five**, and no more than five.)*

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
- The **five** owner RPCs (four in v1.0; **A3** added `classify_consent_evidence_document`)
  → **`clara_authenticated` ONLY**, and each source contains the
  `_human_ctx(role_rank('owner'))` floor. *(ERRATUM, A7: v1.0–v1.3 said "four" here and in
  §9.1/§9.5 while A3 had already made it five. The implementation grants and audits all five;
  the prose was stale.)*
- **PUBLIC-execute sweep = 0** over every new function.
- **No table grant** to any role on the three new relations nor on
  `clara.client_egress_consents` — asserted absent; the DEFINER functions are the only
  surface. For **`clara.document_filings`** the assertion is **`clara_runtime`-scoped**:
  `0007:2740-2741` grants `select` on it to `clara_authenticated` and `clara_agent_ro`, those
  grants are **deliberately preserved**, and it is `clara_runtime` that must hold nothing.
  *(ERRATUM, A7: v1.0–v1.3 claimed "no table grant … on `clara.document_filings`" without
  qualification, which contradicts 0007. The tail was always runtime-scoped and correct;
  removing the legitimate authenticated/agent read grants to match the stale prose would be
  the bug.)*
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
  - **A6/A7 exception, and it is stricter, not looser.** `record_wiki_source_ingest` is the
    one member 0020 deliberately changes, and after **A7** it carries **two** edits, not one
    (§5.7): the canonical source-page form, and the `p_note` floor. Its pin is **not** retuned:
    the tail strips **both** A7 edits — the floor block and the canonical-form comment — and
    substitutes 0017's own content/title derivation back, then asserts the remainder still
    hashes to **0017's original pin**. So the assertion carries both halves — both edits are
    present in their exact shape, **and** nothing else in that function moved.
    *(ERRATUM, A8: v1.3–v1.4 still said "exactly the A6 insertion", singular. A blind lane
    reading that would have pinned one edit and dropped the canonical form.)*
- Their **EXECUTE ACLs** are pinned as one closed-set string.
- `client_egress_consents` has no new column, **and** its constraints, indexes,
  non-internal triggers, RLS flags/owner and policies are pinned as one exact
  structural digest (§6.1).

**The two-class page budget (§5.5, amendment A5)**
- `clara.wiki_budgets` is a **five**-row closed set: the four WB-R8 values unchanged, plus
  `max_source_pages_per_client = 50000`.
- The **persisted** `_publish_wiki_page_version_core` carries **both** classes — the
  `p_log_action='ingest'` discriminator, the `reserved_slug_namespace` refusal, the new
  budget read joined to the existing `budget_unknown` null check, the `source_cap_exceeded`
  ceiling, **and** the synthesized `cap_exceeded` refusal byte-for-byte in its original shape,
  narrowed to `slug not like 'sources/%'`. 0019's `isolation_unsupported` and
  `stale_projected_from_seq` guards are asserted to have **survived** the layering.
- **(A6)** The persisted core is asserted to **count** the source bucket
  (`slug like 'sources/%' ) >= v_max_src`), not merely to name the `source_cap_exceeded`
  reason. Without that, a body whose exempt-branch count had been inverted or dropped would
  satisfy every presence, reason and body-order assertion above.
- The persisted `run_client_lint` still opens `cap_pages` against `max_pages_per_client`,
  narrowed to the synthesized population, and still carries 0019's `stale_citation`
  condition — **and (A6)** still opens `orphan_page`, narrowed to skip the reserved namespace.
  Both narrowings are pinned in forms that cannot be satisfied by the other.
- **(A6, reordered by A7)** The persisted `record_wiki_source_ingest` carries the **canonical
  source-page form** (title and body derived from the document uuid alone, with no
  `original_filename` and no `p_note` coalesce) **and** the `p_note` floor with its
  `source_note_not_permitted` discriminant — the floor **after** its `_reserve_op` call, so an
  exact retry of a legitimate pre-0020 noted call still **replays its receipt** (§5.7).
  *(ERRATUM, A8: v1.3–v1.4 said the floor precedes `_reserve_op`. A7 moved it deliberately,
  because op-key replay is a core invariant of every governed verb; a blind lane following the
  stale clause would have reintroduced A6's replay regression.)*
- **Apply-time bridge, FIVE directions (A6 → A7 → A8):** (1) no pre-existing page occupies
  `sources/%` without a deterministic-ingest `wiki_log` row; (2) no deterministic-ingest page
  lives outside it; (3) **no `sources/%` page carries a `wiki_log` `action='publish'` row**;
  (4) **(A7)** every `sources/%` page's stored title and **every** stored version body equals
  its **canonical reconstruction** from the document uuid in its slug; (5) **(A8)** no
  `wiki.page_published` / `wiki.source_ingested` event of a `sources/%` page carries a
  non-canonical title / hash / storage key / size **unless a later `wiki.page_canonicalized`
  for the same `(page_id, version_id)` supersedes it**. (1) and (2) are set membership; (3)
  names one mechanism; (4) is the computable property of the live bytes and subsumes (3); (5)
  is the same property **where a rebuild reads it**, and is independent of (4) — the rows can
  be canonical while the spine is stale. A single stray page or envelope in **any** direction
  **aborts the apply**, and (3), (4) and (5) are re-read in the tail as receipts.
  *(ERRATUM, A8: v1.3 said "three directions"; A7 made it four and A8 makes it five.)*
- **Functional probe (rolled back):** a synthesized publication into the reserved namespace,
  driven through `publish_wiki_page_version` — the granted verb the model-fed seeding
  `wiki_fact` lane calls — is refused `CLR32/reserved_slug_namespace` and writes nothing.
- **Functional probe (rolled back, A6 → A7):** `record_wiki_source_ingest` with a non-null
  `p_note` on a **real, filed, verified** document is refused
  `CLR10/source_note_not_permitted` and writes nothing; the same call with a **null** note is
  unchanged. A **noted** call against a document uuid that does **not exist** now draws the
  verb's own **`CLR02`**, because the op reservation — and therefore op-key replay — comes
  first. *(ERRATUM, A8: v1.3–v1.4 said that call returns `CLR10`, "proving the floor precedes
  every read". A7 deliberately inverted that ordering; the reason discriminant is unchanged,
  the code for the nonexistent-document case is not.)*
- **Functional probe (rolled back, A7):** a null-note ingest on a document whose
  `original_filename` is arbitrary text publishes a page whose title is exactly
  `Source: <document_id>` and whose body is exactly `Source document: <document_id>`, with no
  fragment of the filename in either; repeating the same op key returns the same receipt and
  writes no second version.

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
- A non-owner caller on any of the **five** owner RPCs → the owner floor (CLR03/CLR04).
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
  roles; the **five** owner RPCs unreachable by `clara_runtime`.
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
- **(A5) The two-class page budget.** `skipped_source_cap` for `CLR32/source_cap_exceeded`
  (the deterministic-source ceiling) — **distinct** from `skipped_cap`, which now means only
  the synthesized cap. `skipped_bad_state` for `CLR32/reserved_slug_namespace` (a publication
  into the reserved `sources/` namespace by anything other than deterministic ingest — a
  malformed write). Both **must** be enumerated in the closed terminal table:
  an unrecognised typed refusal is deliberately non-terminal and would **block the firm
  cursor**. `CLR32/budget_unknown` stays a CONFIGURATION refusal after the third budget row
  joins the same null check.
- **(A6) No new consumer receipt, deliberately.** `CLR10/source_note_not_permitted` cannot
  reach the consumer: both production callers pass `p_note = null`, and the DB now refuses
  anything else. If a future lane ever raised it, the existing `CLR10 → skipped_invalid`
  mapping already applies — a typed terminal for a caller bug, which is the right shape. No
  entry is added to the closed terminal table for a refusal the runtime cannot provoke.

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

**A6 lockstep (2026-07-25).** `recordWikiIngest`'s `note` default in `wb-helpers.mjs` moves
from `"rig ingest"` to **`null`**, matching both production callers, because the DB now
refuses a non-null note (§5.6c). Six fixtures that passed prose incidentally are updated;
none of their assertions read the note. One is a genuine substitution rather than a deletion:
`wb-g-opkeys`'s same-key/different-args law used `p_note` as the field it moved for
`record_wiki_source_ingest`, and now moves the **document** instead, over two verified
actively-filed sources on the same client. A cell that *wants* the refusal passes a note
explicitly.

**A8 lockstep (2026-07-25).** Three test-side consequences, none of them a weakening.
(i) `wb-0020-upgrade.test.mjs` runs the SHIPPED deploy artifacts **verbatim** by reading
`packages/db/deploy/wave-b-0020-a7-{probe,preflight}.sql` off disk — a copy of that SQL inside
the test would prove the copy, not the artifact the owner runs — and gains the event-only
shadow rebuild plus the rows-only negative-control cell (§5.8).
(ii) The two 0019 cells that pinned `event_types` `wiki.%` as "exactly the three 0017 types"
(`wb-0019-tail`, `wb-0019-consumer`) become **migration-level exact** via the existing
`has0020()` gate — three at 19, four at 20 — so 0019's negative proof survives intact while a
fifth, unsanctioned type still fails.
(iii) `WB_EVENT_TYPES` in `wb-helpers.mjs` is **deliberately not extended**: it is the 0017
roster that `wb-g-tail` G1 iterates against any database at ≥17, and `wiki.page_canonicalized`
is a 0020 type. Its registration is asserted by the 0020 tail and by the ceremony probe in
§10.3, which is where a 0020 pin belongs.
`wb-r1-followon.test.mjs` [R2-F7] and `wb-w-pack.test.mjs` W4/P17 are **untouched**.

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
6. **(A5)** The per-client page budget becomes **two** budgets (§5.5). Deterministic
   `sources/*` pages stop being charged to `max_pages_per_client` and are charged to
   `max_source_pages_per_client` instead; the `sources/` slug namespace becomes **reserved**,
   so a publication into it by anything but deterministic ingest is refused
   `CLR32/reserved_slug_namespace`; two new receipt tokens exist (§9.6); and the L7
   `cap_pages` lint belt counts the synthesized population only. This is a direct
   consequence of item 1 — without it, lighting ingest un-indexes a busy client at 40
   documents. It is a **deliberate** behaviour change and is not part of the DARK claim.

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
1b. **(A7, corrected by A8) PRE-FLIGHT — canonicalize the existing `sources/` corpus, rows
   AND event spine.** The 0019 ceremony backfilled ~30 source pages with the pre-A7 verb, whose
   title and body carried the document's `original_filename` — and which wrote those same bytes
   into the **append-only** event log. 0020's bridge **will abort on them**, on direction 4 and
   then on direction 5. Three commands, in this order, from the repository root, as the
   migration/owner role (the same role `pnpm db:migrate` uses):

   **(i) LOOK FIRST — the read-only probe. Writes nothing; safe to run at any time.**
   ```
   psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-probe.sql
   ```
   **It refuses to run as the wrong role.** Every relation it reads is under RLS; as
   `clara_authenticated` or `clara_agent_ro` every count would read **zero**, which is
   byte-identical to a clean database. Statement 1 proves from the catalog that RLS cannot
   filter for the current role and raises otherwise (ratchet R5-C). The live ceremony role
   (`postgres`, `rolbypassrls`) passes; so does `clara_fn_owner`, which reads through an
   unconditional policy under FORCE RLS.

   A vertical `ord | metric | n | status | remedy` table comes back — **all five bridge
   directions**, not two, plus the advisory population and up to 25 offending slugs per
   failing check:

   | metric | what it means | expected NOW | expected AFTER (ii) |
   |---|---|---|---|
   | `source_pages_total` | pages in the reserved `sources/` namespace | ~30 | unchanged |
   | `d1_sources_page_without_ingest_log` | a `sources/` page no deterministic ingest created — **direction 1 aborts** | 0 | 0 |
   | `d2_ingest_page_outside_namespace` | a deterministic-ingest page outside `sources/` — **direction 2 aborts** | 0 | 0 |
   | `d3_sources_page_with_model_publication` | a model-path publication in the namespace — **direction 3 aborts** | 0 | 0 |
   | `d4_bytes_non_canonical` | STORED title/body not canonical — **direction 4 aborts** | > 0 | **0** |
   | `d5_spine_non_canonical` | RECONSTRUCTION EVENTS stale — **direction 5 aborts** | > 0 | **0** |
   | `needs_canonicalization (d4 ∪ d5)` | how many pages step (ii) will correct | > 0 | **0** |
   | `a8r1_versions_without_publication_event` | **advisory, does NOT block** — the residual §11 A8-R1 gap, made visible | 0 | 0 |

   **D1, D2 and D3 are not remediable by any script** and the preflight will not clear them:
   they are facts about how a page was *created*, and `wiki_log` is append-only. A non-zero
   count there means **stop and investigate** — whose page, which caller, when — and rule on
   the finding before 0020 can apply. Only if D1/D2/D3 are `0` **and**
   `needs_canonicalization` is `0` is there nothing to do; skip to step 2. An earlier draft of
   this probe computed D4/D5 alone while promising the whole question, so a D1 violation read
   as `needs_canonicalization = 0`, `<none>` — clean — and the apply then aborted. Reproduced
   on the rig, both halves: the old file exits 0 reporting clean, the corrected file names D1,
   and `migrate` fails with exactly the direction the probe named.

   **(ii) CORRECT — the audited preflight. One transaction; safe to re-run.**
   ```
   psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-preflight.sql
   ```
   It re-derives each page's title and every version's content / hash / storage key / size from
   the document uuid in the slug and from nothing else, appends **one `wiki.page_canonicalized`
   correction envelope per version** (carrying the preimage), writes an `audit_log` row per
   page, and then re-asserts bridge directions 4 and 5 itself — so if it returns without error,
   the apply will clear both. It prints a `NOTICE` naming the counts. **Do NOT run the two
   `update` statements that appeared in §5.7 of contract v1.4:** they correct the rows only,
   leave the append-only spine stale, and 0020 now **refuses** that state (§5.8).

   **(iii) CONFIRM — re-run the probe from (i).** Every count must read **0** and
   `first_25_offenders` must read `<none>`. Only then proceed to step 2.

   This rewrites database bytes and appends events; the object-storage blob at each page's old
   `content_sha256` key is orphaned and no blob is written at the new key — nothing reads it
   (every read surface serves `wiki_page_versions.content` from the database), and it is named
   in §5.7 rather than discovered later. Each correction advances the firm's `firm_event_seq`,
   which is why this belongs inside the quiesced window of step 1.
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
   - **(A5) `clara.wiki_budgets` is a five-row set** — the four WB-R8 values *unchanged*
     plus `max_source_pages_per_client = 50000`. (The 0017 ceremony runbook's "the four
     WB-R8 values" expectation becomes "these four, of five".)
   - **(A5, corrected by A6, completed by A7, closed by A8)** **Five** counts, not two.
     `select count(*) from clara.wiki_pages where slug like 'sources/%'` **equals** the count of
     pages carrying a `wiki_log` `action='ingest'` row (both directions); the count of
     `sources/%` pages carrying a `wiki_log` `action='publish'` row is **zero**; the
     **`d4_bytes_non_canonical` count from step 1b(iii) is zero** — every page's title and every
     version's body equals its canonical form; and the **`d5_spine_non_canonical` count from the
     same probe is zero** — every reconstruction event either is canonical or is superseded by a
     correction envelope. Since ratchet R5 the probe reports all five directly (as `d1`…`d5`),
     so this receipt is one re-run of step 1b(i), not five hand-written queries. The first two
     are set membership (the page was *created* by
     deterministic ingest). The third names one mechanism. The fourth is a computable property
     of the live bytes. **The fifth is that same property where a REBUILD reads it**, and it is
     independent of the fourth — canonical rows over a stale spine is exactly the state ratchet
     R4 found, and it is what would have shipped the defect. The apply aborts on any of the
     five, so a green apply has already proven them — re-read them as a receipt.
   - **(A8)** `select name from clara.event_types where name like 'wiki.%' order by name` returns
     **exactly four**: `wiki.page_canonicalized`, `wiki.page_published`, `wiki.page_retired`,
     `wiki.source_ingested` — and the first is `client_scoped` with decision `ignore` in the
     ACTIVE taxonomy. This holds whether or not step 1b(ii) ran: the preflight registers the
     identical row at 19 and the migration registers it `on conflict do nothing` at 20.
   - **(A5)** A `clara_runtime`-role `publish_wiki_page_version` probe with slug
     `sources/<any uuid>` refuses `CLR32` / `reserved_slug_namespace` and writes nothing.
   - **(A6, reordered by A7)** A `clara_runtime`-role `record_wiki_source_ingest` probe with a
     **non-null** `p_note` on a **real, filed, verified** document refuses `CLR10` /
     `source_note_not_permitted` and writes nothing. The same call with a **null** note is
     unchanged. Note the deliberate A7 ordering change: the same *noted* call against a document
     uuid that does not exist now draws `CLR02` (the verb's own document floor), because the op
     reservation — and therefore op-key replay — comes first.
   - **(A7)** A `clara_runtime`-role null-note `record_wiki_source_ingest` on a document whose
     `original_filename` is arbitrary text publishes a page whose title is exactly
     `Source: <document_id>` and whose body is exactly `Source document: <document_id>`, with no
     fragment of the filename in either. Repeating the **same op key** returns the **same
     receipt** and writes no second version.
   - **(A6)** `run_client_lint` on the busiest existing client returns promptly and opens **no**
     `orphan_page` finding against any `sources/%` page. On a database that ran the pre-A6 lint,
     expect the first post-deploy pass to **supersede** the accumulated source-page findings —
     that pass is proportional to how many there were, and every pass after it is not.
4. **Deploy the runtime image** (`fly deploy`); confirm `/ready` 200 and the
   `WIKI_PROJECTION` lane acquires. The image **must** be one that enumerates
   `source_cap_exceeded` and `reserved_slug_namespace` in the wiki consumer's closed terminal
   table (§9.6) — an older image treats them as unrecognised typed refusals and **blocks the
   firm cursor**. Runtime-image-first is therefore also acceptable here; DB-first is not
   acceptable with an image that predates A5.
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
| **A5-R1** | **The context pack is not protected, and A5 widened the population that crowds it** (raised with A5, restated plainly with A6). `get_context_pack` ranks by `page_kind`, `period_context` is priority 2 of 6, and every deterministic source page is a recently-updated `period_context`. WB-R8's cap protected model spend **and** pack noise; A5 keeps spend bounded at 40 and raises the pack-crowding ceiling to 50000. On a document-heavy client the six-page pack is, today, six provenance stubs. | **Open, and named as open.** Not fixable inside a budget amendment: what the six-page window selects is WB-R8 / W6 contract surface and needs its own ruling. A6 fixed the *lint* half of the same compounding (§5.6a); the *pack* half is deliberately untouched — no ranking change was attempted. **A7 makes this cheaper to live with, not worse**: a crowding stub is now `Source: <uuid>`, six tokens instead of six filenames. |
| **A8-R1** | **Direction 5 checks the events that EXIST; it does not prove event COMPLETENESS.** A version carrying no `wiki.page_published` envelope at all would not be reconstructible, and direction 5 would not see it — its scope is "whatever the log says about a `sources/` page must be canonical", not "the log says something about every version". | **Named, and out of 0020's scope by construction.** Completeness is a pre-existing property of the 0017 writers (`_publish_wiki_page_version_core` emits one envelope per publication on every path, and the ingest verb's own R1-F6 append makes the deterministic path no exception), which 0020 neither creates nor changes; inventing a synthetic publication envelope for a version that never had one would fabricate history, which is the opposite of what A8 is for. The read-only probe reports the population so a gap is **visible** rather than silent — as `a8r1_versions_without_publication_event`, flagged `VISIBLE (advisory)`, with the offending `slug  version_n=` pairs listed; **[R5-B]** that sentence described an intent, not a shipped file, until the R5 correction put the count in the probe — and the rig's bijection assertion (`wb-r1-followon.test.mjs` [R2-F7]) is where a writer-side regression would surface. |
| **A7-R1** | **A source page no longer names its document in human terms.** A7 removes `documents.original_filename` from the exempt page's title and body, so `get_wiki_page` / `list_wiki_pages` / `get_context_pack` show `Source: 3f2b…` rather than `Source: invoice-jan.pdf`. **No code depends on it** (DB and runtime suites are green with zero call-site changes) — it is a human-readability cost only. | **Open, with the right shape already available.** The filename is **not lost**: it lives on `clara.documents`, and the page's own citation carries `document_id` + `document_sha256`, so any surface that wants it can **join** — which is where a caller-chosen string belongs. Putting it back into exempt page bytes is exactly the defect A7 closed and must not be the fix. If a human surface needs it, the display join is a dashboard/read-verb change (`get_wiki_page` could return the citation's document filename as a *field*, never as page content) and needs its own small ruling. |

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

## Changelog v1.1 → v1.2 (owner ruling A5, ratified 2026-07-25)

A5 did not come from a review of the build. It came from reading what §10.1 actually turns
on: lighting deterministic ingest made a defect in the **inherited** WB-R8 budget operative
for the first time. The contract text was not wrong about anything it said — it simply had
never had to say which class of page the 40 was for.

| # | What v1.1 assumed | Why it stopped being true | Where it landed |
|---|---|---|---|
| **A5** | One per-client page budget, `max_pages_per_client = 40`, charged for every new slug (inherited from WB-R8 / 0017, restated nowhere in this contract). | §5.3 mints **one page per uniquely-filed classified document**. Those pages are provenance records, not knowledge: no model call, no synthesis, scaling with document **volume**. Charging them to a budget written for model spend and pack noise silently un-indexes a busy client after 40 documents — weeks, at RPR scale — and every later re-drive takes `skipped_cap`. | **§5.5** (new), **§5.3**, **§8**, **§9.6**, **§10.1** |

**Rejected alternatives are recorded in §5.5**, one row each, with the reason each is weaker
than `p_log_action`. The short version: every other candidate is a **caller argument on the
granted wrapper**, and the seeding `wiki_fact` lane already hands a **model** authorship of
the slug, the page kind and the synthesis claim.

**Named residual A5-R1** (pack ranking gives `period_context` priority 2, so source pages
crowd the six-page window) is **not** fixed by A5 and needs its own ruling — see §5.5.

**Not adopted, with reasons.** (a) A `domain_events` cross-check inside
`prepare_egress_dispatch` — one review's suggested extra: it would give a runtime-callable
existence probe over the event log, and A1's re-binding already prevents spending an
authorization on a different dispatch. (b) The §10.2 two-PR split as a *rewrite of history*:
the staging requirement stands and is decided at PR time; commits are not restructured
retroactively.

---

## Changelog v1.2 → v1.3 (owner ruling A6 + ratchet R2, ratified 2026-07-25)

A5 was reviewed adversarially after it was built. The discriminator survived; the **exemption**
did not, in three places — each the same oversight, that A5 decided *who may publish* and *how
many pages* and never asked what the exempt pages cost, what the exempt bytes are, or what the
apply-time bridge proves. A6 is the owner's adjudication. One further finding, queued from
ratchet R2, is a **build** defect rather than a contract one and is recorded below the table.

| # | What v1.2 assumed | Why it was wrong | Where it landed |
|---|---|---|---|
| **A6(a)** | Exempting `sources/*` from the page cap was the whole cost of the exemption. | L's orphan rule opens a finding for any active page with zero refs, and a source page has zero refs **by construction** — so every ingested document became a permanently-open finding **plus** an L6 notification, on a population A5 re-ceilinged from 40 to 50000. The supersede sweep rescans the conditions array per open finding, making `run_client_lint` **O(N²)** in exactly that population, and `run_lint_all` iterates every active client in one call. Measured: 900 pages → 307 ms, 2,700 → 10,991 ms. | **§5.6a**, **§8**, **§9.6**, **§10.3**. Fixed by a second drift-guarded narrowing in A5's own `run_client_lint` block; measured after: **3 ms, zero findings**. Existing findings self-heal on the next pass. |
| **A6(b)** | "The bridge is proven empirically, **in both directions**." | Both directions prove **set membership** (creation). Neither notices a page whose **current version is model-synthesized** — reachable before 0020 reserved the namespace, and thereafter permanently exempt and unrepairable. The claim was broader than the evidence. | **§5.6b**, **§8**, **§10.3**. A **third** fail-closed direction (no `sources/%` page carries a `wiki_log action='publish'` row) and the wording corrected to **creation and every publication**. |
| **A6(c)** | A `sources/*` page holds machine-generated bytes. | `p_note` is a **caller argument on a granted verb** that becomes the page body. Arbitrary prose could be stamped `deterministic` and exempted — and because the W9 hold gate fires only for `synthesis='model'`, it published onto a client **under a live synthesis hold**. Both halves driven on the rig. The premise was a caller convention, not a fact. | **§5.6c**, **§7.1** grammar, **§8**, **§9.6**, **§9.7**, **§10.3**. `p_note` must be **NULL**; typed **CLR10 / `source_note_not_permitted`**, placed before every read, lock and `_reserve_op`. |

**Erratum ratified with them.**

| Erratum | v1.2 said | Correct |
|---|---|---|
| Residual A5-R1 (§5.5) | "A5 does not change what the pack selects", recorded as a pre-existing consequence of lighting ingest. | **Understated.** WB-R8's cap protected model spend **and** pack noise; A5 keeps spend bounded and **raises the pack-crowding ceiling from 40 to 50000**. Both halves of that protection now scale with document volume. A6 fixes the *lint* half; the *pack* half is **not fixed, not fixable here**, and is promoted to the §11 residual register as **A5-R1**. No pack-ranking change was attempted — that is WB-R8 / W6 surface and needs its own ruling. |
| §6 closed set (§8) | Five functions with unchanged EXACT `prosrc` pins. | Still five, but `record_wiki_source_ingest` is deliberately amended by A6. Its pin is **not retuned**: strip exactly the A6 insertion and the remainder must still hash to **0017's original pin**. Stronger than the original assertion, not weaker — and enforced identically in the migration tail and in the rig's §6 diff cell. |

**Ratchet R2 build fix (no contract change).** `classify_consent_evidence_document` (added by
A3) read `clara.documents ... for update` and compared `firm_id` **afterwards**, while its own
comment claimed the opposite. A firm-A owner holding a firm-B document UUID therefore reached
and **waited on** firm B's row before receiving CLR11 — cross-tenant lock contention plus a
timing oracle, the same defect class R1-F5 fixed in `activate`/`deactivate`/`revoke`, and a
straight violation of §7.1's already-ratified "firm membership is verified **first**". The fix
puts `firm_id` in the predicate; `NOT FOUND` still means CLR11, so foreign and nonexistent stay
indistinguishable in the **result** as well as now in the **wait**. Proven by a two-session
cell with a control: firm B holds the row, a plain `FOR UPDATE` on it times out, and the
cross-firm call still returns CLR11 in single-digit milliseconds.

---

## Changelog v1.3 → v1.4 (owner ruling A7, ratchet R3, ratified 2026-07-25)

Ratchet R3 reviewed the A5/A6 build. It confirmed the authorization core **clean** — §§1–4, the
resolver, savepoint containment, 0019's guarantees, the R2 document lock, the A5 cap and lint
predicates — and returned two MEDIUMs against **the fixes themselves**. The owner adjudicated
them as **one root cause with one fix**: A6 had closed a *channel* rather than made the exempt
bytes *decidable*. A7 is that adjudication. A third finding is an idempotency regression A6
introduced and is fixed with it; the NIT is contract prose only, and the implementation was
right.

| # | What v1.3 assumed | Why it was wrong | Where it landed |
|---|---|---|---|
| **A7(a)** *(R3 M1)* | A6's third bridge direction proves content provenance. | It proves the **absence of a model-path publication row**, which is a proxy. A pre-0020 `record_wiki_source_ingest` carrying model prose in `p_note` yields `action='ingest'`, `synthesis='deterministic'` and **no** `publish` row — it satisfies all three directions and is granted the cap and orphan exemptions over arbitrary caller text. | **§5.7**, **§8**, **§10.3**. A **fourth** direction verifies every historical page by **RECONSTRUCTION** against its canonical form, which subsumes the third. Fail-closed: unreconstructable **aborts the apply**, naming the offenders and a remediation that is proven to work. |
| **A7(b)** *(R3 M2)* | `p_note` is "the ONE argument on this verb that can put caller-chosen bytes into a page body". | **False.** The same two lines copy `documents.original_filename` into the body (`0017:2255-2256`) and into the **title** (`0017:2259`). Intake accepts 255 printable characters with no content constraint, so a prose filename publishes under a live synthesis hold into a cap- and lint-exempt page with `p_note` null the whole way. The battery's prefix-only assertion (`/^Source document: /`) *blessed* those bytes as machine-generated. | **§5.7**, **§5.6** (claim retracted), **§6.1**, **§8**, **§9.7**, **§10.3**. Title and body now derive from **fixed text plus the opaque document uuid** and from no caller-supplied string. The `p_note` floor is kept as defence in depth. |
| **A7(c)** *(R3, inside M1)* | Placing the floor **before** `_reserve_op` was strictly safer. | It broke **op-key replay**, a core invariant of every governed verb (R19 — the same intent keeps its `op_key` and a retry REPLAYS). A delayed **exact** retry of a legitimate pre-0020 noted call raised CLR10 instead of returning its stored receipt. | **§5.7**. The reservation comes **first** and its dedupe receipt returns unchanged; only a **fresh** invocation reaches the floor. Visible consequence, asserted not hidden: a *noted* call on a nonexistent document now draws the verb's own **CLR02**. |

**Errata ratified with them (prose only — the implementation was already correct).**

| Erratum | v1.3 said | Correct |
|---|---|---|
| §§8/9 RPC inventory | "the **four** owner RPCs". | **Five**, since **A3** added `classify_consent_evidence_document`. The migration grants, audits and asserts all five; only the prose was stale. Corrected in **§8** and **§9.1/§9.5**, and in the migration's own grants comment. |
| §8 table grants | "**No table grant** to any role … nor on `clara.document_filings`". | Contradicts `0007:2740-2741`, which grants `select` on `document_filings` to `clara_authenticated` and `clara_agent_ro`. Those grants are **deliberately preserved**; the promise is **`clara_runtime`-scoped**, which is exactly how the tail has always asserted it. Removing the legitimate read grants to match the stale prose would have been the bug. |
| Migration header | "Authority: … (v1.0, RATIFIED)". | **v1.4**, RATIFIED — v1.0 plus A1–A7. Corrected in `packages/db/migrations/0020_typed_consent.sql`. |

**Live-deploy consequence, surfaced rather than deferred.** The canonical form changes what a
source page's bytes **are**, so the 30 pages the 0019 ceremony backfilled — written from real
uploads, with their filenames in title and body — **will abort 0020's apply**. §10.3 gains an
explicit pre-flight step **1b** that runs the §5.7 canonicalization and re-checks to zero. The
alternatives were examined and rejected: `retire_wiki_page` + re-ingest is **impossible** (the
publication core refuses a retired page's slug and the slug is unique per client), and deleting
the pages would destroy audit history. Recorded openly: the remediation rewrites database bytes
only, orphaning the object-storage blob at each page's old `content_sha256` key. Nothing reads
it — every read surface serves `wiki_page_versions.content` — but it is named in §5.7.

**What A7 costs, named as residual A7-R1.** A source page no longer shows its document's
filename: `Source: 3f2b…` rather than `Source: invoice-jan.pdf`, in `get_wiki_page`,
`list_wiki_pages`, `get_context_pack` and the dashboard's wiki surfaces. **No code depends on
it** — the full DB suite and the runtime suite (598/598) are green with zero call-site changes —
so this is a human-readability cost, not a break. The filename is not lost: it lives on
`clara.documents`, the page's citation carries `document_id` and `document_sha256`, and the
right place to restore it is a **join on a read surface**, never page bytes.

**Where the proof lives.** `wb-0020-source-budget.test.mjs` gains **F1b** (hostile filename) and
rewrites **F** (exact canonical bytes, replacing the prefix assertion R3 flagged), **F2** (the
reordering plus a byte-identical replay) and **G** (corpus reconstruction, replacing the
log-action/label scan R3 flagged). The migration half — what the **apply** does to a corpus that
already exists — is a new reset-gated drill, `wb-0020-upgrade.test.mjs`, which builds a
19-migration world carrying **both** hostile pages, proves the apply aborts naming both, runs
the §5.7 remediation verbatim, proves the apply then succeeds, proves the pre-0020 noted op key
still **replays** across the upgrade while a fresh noted call is refused, and carries a negative
control (a canonical pre-0020 corpus upgrades untouched).

---

## Changelog v1.4 → v1.5 (owner ruling A8, ratchet R4, ratified 2026-07-25)

Ratchet **R4** was a fifth, independent, repo-grounded adversarial pass. It re-derived the
authorization chain from scratch and returned **CONVERGED** on it: no alternate production path
around the consume boundary, the canonical form closed across all twelve caller-reachable
fields, no third caller-prose channel. Three findings remained, all of them about the fix rather
than the design.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **F1** | **Canonicalizing the rows leaves the append-only EVENT SPINE non-canonical.** The pre-0020 backfill wrote the filename-bearing title / hash / storage key / size into `wiki.page_published` (`0017:2280`) and `wiki.source_ingested` (`0017:2277`); A7's remediation rewrote only `wiki_pages` / `wiki_page_versions`. The table bridge therefore passed while a projection **rebuilt from events** restored the old title and reconstruction envelope — reopening A7's caller-prose channel in a rebuilt projection and violating the W4/P17 invariant. | MEDIUM | **ACCEPTED and fixed structurally, not procedurally** — §5.8. A **fifth** bridge direction refuses a stale spine fail-closed; the remediation becomes an **audited correction operation** (`packages/db/deploy/wave-b-0020-a7-{probe,preflight}.sql`) that corrects the rows *and* appends one `wiki.page_canonicalized` envelope per version, preserving the preimage; a **new event type** makes the correction replay-understood. The upgrade fixture gains an **event-only shadow rebuild that compares every logical field**, plus a cell that runs A7's two `update`s verbatim and proves the apply now **REFUSES** them. No existing replay test is weakened. |
| **F2** | **The upgrade proof was a misleading green.** `wb-0020-upgrade.test.mjs` skips whenever `CLARA_RIG_ALLOW_RESET` is unset — which normal CI leaves unset — and the CI step existed only as a comment inside the test file. A bridge or remediation regression could have merged with the advertised suite green. | LOW | **ACCEPTED.** The isolated-database step *"Wave-B 0020 A7/A8 upgrade drill (isolated DB)"* is wired into `.github/workflows/ci.yml` beside the C9 / document-pipeline / coding-floor drills, and a skip now prints a loud stdout line saying the upgrade path was not proven by that run. |
| **F3** | **§§5.3/8's prose still described A6**, which A7 had replaced: the floor "before `_reserve_op`", a "three direction" bridge, a noted nonexistent document returning `CLR10`, "exactly the A6 insertion" (singular), and "`record_wiki_source_ingest` is **NOT modified**". The contract's own stated invariant is that it is sufficient alone for a blind lane — as written, a blind lane would have reintroduced A6's replay regression. | NIT | **ACCEPTED. The prose moved to match the implementation, never the reverse.** Five errata are ratified in place: the post-dedupe floor, the five-direction bridge, the `CLR02` nonexistent-document case, the **two** A7 edits behind the §6.1 pin, and the narrowed §5.3 sentence. |

**Also ratified with A8**

* The event-type roster is a function of the **migration level** and of nothing else: the
  preflight (which runs at 19) and the migration (at 20) register the byte-identical
  `wiki.page_canonicalized` row `on conflict do nothing`, and the §8 tail asserts exactly one
  such row, client-scoped, `ignore` in the ACTIVE taxonomy.
* The two 0019 cells that pinned the `wiki.*` family as "exactly the three 0017 types" become
  **migration-level exact** — three at 19 (0019's negative proof, untouched) and four at 20.
* **§10.3 step 1b is rewritten as three numbered owner commands** — probe, correct, confirm —
  with the probe's five columns tabulated and their expected values before and after, so the
  ceremony can be followed at the keyboard without inferring anything.
* Residual **A8-R1** (direction 5 checks the events that exist, not event completeness) is
  named in §11.
