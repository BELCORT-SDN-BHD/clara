# Ruling batch WB-R19..R27 (ADR-037, 2026-07-24) — the nine open rulings, adjudicated

> The owner delegated the full open-ruling list ("choose the best modern AI-agentic-SaaS
> / AI-OS practice; collab with Codex"). Method: orchestrator draft packet → Codex
> gpt-5.6-sol xhigh adversarial review (read-only, repo-grounded; verdicts: 0 AGREE,
> 5 AGREE-WITH-AMENDMENT, 4 DISAGREE) → orchestrator verification of every load-bearing
> Codex claim against the repo → this adjudicated record. Draft packet + full Codex
> output: session scratchpad (`ruling-packet-draft.md`, `codex-ruling-review.md`);
> the verdict summary is reproduced faithfully here.
>
> Two Codex claims were corrected on verification: (a) its cited CommitGate path was
> wrong but the defect is real (`apps/dashboard/app/clients/plan/CommitGate.tsx:23`
> links the generic `docs/ops` tree; no admission-ceremony runbook exists); (b) its R9
> "no server exists" framing missed that the dashboard already ships a same-origin
> Cloudflare Pages Function proxy (`functions/api/[[path]].js`) — a natural BFF seam.
> Its gate-disposition footer also conflated the live Gate R2 (rule signatures) with
> the R2 *backup bucket* drills — kept distinct below.

---

## WB-R19 — Gate-2 resume semantics: CLOSED BY POLICY, with the idempotency amendment

**Ruled.** The `{'pending':true}` receipt branch is unreachable from every real caller
(verified: `approve_opening_seed` is one all-or-nothing serializable txn — a mid-batch
failure rolls back the reservation itself; seeding ticks are per-item txns). Standing
policy: every multi-item writer uses one of the two existing shapes — (a) a bounded
single-serializable-transaction batch, or (b) per-item transactions resumed by
authoritative requery. A two-phase reserve-now/finish-later writer is OUT OF SCOPE and
re-opens this ruling with its own migration.

**Codex amendment ACCEPTED (idempotency):** a retry of the SAME logical intent keeps
its op_key until an authoritative requery proves terminal state (the Stripe/AWS
ambiguous-response rule); per-item resume = requery first, then act only on still-open
items. "Fresh key per retry" is struck from the policy wording — fresh keys are for
fresh intents (e.g. a new tick attempt on an item requery has proven still open).

**Codex amendment ACCEPTED (proof bar):** Gate 2's rig proof requires (i) a genuine
MID-MUTATION fault at item K+1 of N (rig-only fault injection during the approval
mutations, not a preflight-loop refusal), asserting full rollback — approvals, entries,
receipt, audit, outbox — and a clean full retry; and (ii) an S4 lost-ACK case: a tick
commits, the response is "lost", the caller requeries → sees ticked → no double-tick;
a premature same-item retry is refused typed by the state guard. The build lane's
first-cut K5 test is adjudicated against this bar before the tests PR merges.

## WB-R20 — Interview expiry: cancellation is NOT expiry; the expiry half is EXPLICITLY DEFERRED

**Ruled (Codex DISAGREE accepted).** Recording a policy timeout as a human cancel
destroys audit evidence, and the `'expired'` terminal is currently unreachable in
production (the route emits only answer/cancel) — it must not be claimed as covered.
Disposition: the CANCELLATION half of the rig gate closes via the real-engine cancel
e2e; the EXPIRY half is explicitly deferred by ruling (WB-R17's deferral clause,
owner-delegated). The future mechanism, when wanted, is an ADDITIVE new frozen `_vN`:
a durable timer-vs-event deadline that preserves all answers, notifies the firm, and
lands a DISTINCT typed stale/expired state — never auto-destroys, never masquerades as
cancel. ≥48h parks remain a product feature (Gate O requires one).

## WB-R21 — The R2-F2 wiki-read veto: a BOUNDARY DEFECT scheduled for removal, not a ratified exception

**Ruled (Codex DISAGREE accepted; the draft's ratify-as-exception is WITHDRAWN).**
The EXISTS-veto in `_assert_filing_wiki_unreferenced` (called by
`approve_wrong_client_correction` + `retire_document_filing`) lets projection-derived
state decide whether an authoritative correction may proceed — against the spirit of
WB-R6 / ADR-004 ("wiki informs, never decides"), even though no figure is influenced
and WB-R6's letter names only gate/bound/floor/autopost fns. A stale wiki citation
forcing manual wiki cleanup before a money correction is a denial-of-correction
ordering inversion.

**Target shape (wiki-boundary micro-migration, WB-R24(ii)):** remove the veto;
retirement/correction proceeds atomically in the authority domain; the retirement
EVENT drives the wiki projection consumer to mark affected citations/pages STALE
(visible, lint-surfaced, history preserved immutably). End-state: ZERO wiki reads from
authority fns, locked by a closed-set tail assertion (superseding 0017's exclusion
loop, which omitted these two call sites).

**Interim disposition for the live Gate W2:** the two call sites are recorded KNOWN
DEVIATIONS (closed set: exactly two; scheduled for removal) — the dependency audit
runs with that disposition, not a permanent exception.

## WB-R22 — Commit lane: temp-admin stands for Gate O WITH the cleanliness precondition; scoped review-attestation is the target

**Ruled (Codex DISAGREE partially accepted).** Verified: the probed lawful lane inserts
a clean THIRD admin (`wb-r2.test.mjs` [R2-F4]: "ANY substantive contributor is
disqualified") — so temp-admin is a two-person lane ONLY when the promoted checker made
no substantive contribution to that client's onboarding. Gate O now runs on the
temp-admin ceremony with that precondition explicit: plan the journey so the checker
stays clean (or a third human joins). Widened self-attestation stays REJECTED (it
degrades maker-checker to one person for the commonest firm shape).

**Defects to fix (dashboard/docs follow-up):** write the admission-ceremony runbook
(`docs/ops/`) and point the F15 link at it (`CommitGate.tsx:23` currently links the
bare `docs/ops` tree); add a lint watch on any `add_member(admin)` not reverted within
24h. **Target shape (future migration, not now):** a scoped REVIEW-ATTESTATION
capability — the non-contributor bookkeeper signs the review without admin elevation;
the owner activates only after that signature (separation of reviewer from activator;
zero standing privilege; if elevation is ever kept, it becomes single-commit-scoped,
time-boxed, auto-reverting with reason + re-auth).

## WB-R23 — Consent surface: typed purposes + dispatch-time authorization + discriminated resolver

**Ruled (Codex amendments accepted, all three).** Verified: `client_egress_consents`
carries only free-text `scope_note` (0011:910) — a purpose-scoped verdict fn cannot be
truthful until purposes are STRUCTURALLY represented. The lighting path (consent
micro-migration, WB-R24(iii)):
1. **Typed purposes** in the consent schema (first entry `wiki_synthesis`); legacy
   free-text rows DO NOT map automatically — each client needs an explicit owner
   re-attestation before synthesis lights for that client (fail-closed per client).
2. **The verdict fn** returns a short-lived audited authorization bound to
   client + typed purpose + consent version (+ document hash where applicable) — never
   row contents, never a table grant — and the egress dispatcher RE-CHECKS it at the
   dispatch boundary (closing the plan-time/revocation race).
3. **The doc→client resolver** returns a discriminated `unresolved | unique |
   ambiguous`; an id is released only on `unique`.
Synthesis stays fail-closed DARK until this ships, the rig proves the
revocation/ambiguity races, and the owner-gated activation ceremony runs. (Fits
Malaysia's PDPA Data-Protection-by-Design guideline: explicit purposes, withdrawal
handling.)

## WB-R24 — Follow-on migrations: SPLIT BY FAILURE DOMAIN + per-gate version pinning

**Ruled (Codex DISAGREE accepted; the single-0018 bundle is withdrawn).** Three
additive, independently-DARK micro-migrations, each rig-validated + dual-reviewed,
each behind an owner-gated ceremony:
- **(i) 0018 — the Gate-K/accounting domain:** subject-bound keyed resolutions +
  `assert_client_resolved` binding check · `seed_fixed_asset` gains `p_resolution`
  (unblocks keyed FA honestly) · `approve_opening_correction` rejects outstanding
  non-correction drafts · typed reason tokens on commit-refusal CLR10s. Built FIRST;
  aims to land before Gate K's commit. Its dashboard counterpart ships the
  receipt-inspection fix (`openingApi.ts` currently discards the approval RPC body).
- **(ii) 0019 — the wiki authority boundary:** the WB-R21 rework (veto → event-driven
  stale-marking) · the monotonic `projected_from_seq` guard · the zero-wiki-reads
  closed-set tail assertion.
- **(iii) 0020 — consent/privacy:** the WB-R23 trio, deployed DARK; lighting is a
  separate runtime activation ceremony.
**Version pinning (binding for every live gate):** each gate receipt records the
migration count + runtime image tag; no gate journey straddles a deploy — Gate O/K's
whole journey (interview → park → commit → carry-down) runs on one pinned state. If
0018 is not live when the window opens, Gate K runs honestly on as-built rules
(document-primary, or the attributed keyed fallback minus keyed-FA).

## WB-R25 — Agent GitHub identity: fine-grained bot PAT now, GitHub App as target

**Ruled (Codex amendment accepted).** Interim (owner action, ~5 min): mint a
fine-grained PAT on `belcorttao` scoped to `BELCORT-SDN-BHD/clara` only —
Contents + Pull-requests write, no administration, ≤90-day expiry, org-approved —
inject via env (never tracked config), swap the MCP server token, revoke the
`mosaladtaooo` PAT, record a rotation/revocation drill note. Target: a GitHub App
installation token (short-lived, permission-scoped, not user-bound) when the MCP lane
supports it.

## WB-R26 — Backup (R2 bucket) drills: monthly light HUMAN-ASSISTED + quarterly strict; custody unbroken

**Ruled (Codex amendment accepted).** Monthly LIGHT drill: human-assisted decrypt (the
owner supplies the backup identity at drill time — the DR.md §custody rule stays
unbroken; no hot key ever lands in automation), agent automates everything else;
sample a RANDOM backup age (not only latest); probes: manifests, all four schemas,
owners/ACLs/RLS, event/outbox continuity, storage objects, one random client/period
spot-check to the sen, measured restore time; the drill receipt stored tamper-evidently
in a different failure domain than the backups. Quarterly STRICT: the full DR.md
rehearsal (fresh-project restore + runtime repoint + RTO/RPO measurement). Cadence is
org-defined against RTO/RPO (NIST-aligned), not claimed as an external mandate.
Naming note: this is the Cloudflare-R2 *backup* drill cadence — distinct from the live
Gate R2 (rule-signature ticks) in contract §4.

## WB-R27 — Dashboard sessions: BFF + __Host- cookie is the target; gates proceed; expansion blocks on it

**Ruled (Codex amendment accepted, softened by verification).** Target architecture:
an opaque `__Host-` Secure HttpOnly session cookie backed by a same-origin BFF that
holds the JWT server-side and attaches it to PostgREST/runtime calls — the existing
Cloudflare Pages Function proxy (`functions/api/[[path]].js`) is the natural seam, so
this is an extension of the shipped architecture, not a rebuild. Ships with: CSP +
Trusted Types, Origin/Fetch-Metadata validation, a session-bound CSRF check, atomic
refresh rotation with reuse detection, logout + idle/absolute expiry. Sequencing:
owner-supervised live-gate runs proceed on the documented house pattern
(sessionStorage stays an explicitly-accepted bounded risk); the BFF migration is
REQUIRED before staff/multi-user routine production use.

---

## Consequence queue (ordered)

1. Adjudicate the in-flight rig-gate build against WB-R19's proof bar (mid-mutation
   K5 + S4 lost-ACK) and WB-R20 (no expiry claim) before the tests PR.
2. Gate-O runbook: write the admission-ceremony doc + fix the F15 link (small PR with
   the lint-watch note) — precondition for the live Gate O.
3. Build 0018 (Gate-K domain) on the rig; then 0019 (wiki boundary); then 0020
   (consent). Ceremonies owner-gated, one at a time, version-pinned around the gates.
4. Owner actions: mint the belcorttao PAT (WB-R25) · schedule the first monthly light
   drill sitting (WB-R26) · client consent re-attestations when 0020 lands (WB-R23).
