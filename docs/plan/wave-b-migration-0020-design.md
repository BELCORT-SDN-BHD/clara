# Migration 0020 — consent/privacy (WB-R24(iii)) · design contract v0.1 (DRAFT)

> **Status: DRAFT v0.1 — NOT ratified. Pending the cross-model design debate**
> (ADR-037 method): this orchestrator draft → Codex gpt-5.6-sol xhigh adversarial
> design debate (read-only, repo-grounded; verdicts AGREE / AMEND / REJECT, each
> accepted only after orchestrator verification) → v1.0. The debate MAY amend every
> decision below; the pinned decisions are the starting position, not the ruling.
> The load-bearing anchors here are verified at source (0011:910-934 / 1048-1060 /
> 931-932 / 1091-1105; wiki-projection.mjs:86-101 / 214 / 223-224 / 320-324;
> egress.mjs:185-195; wiki-projection-ops.mjs:100-108).
> Discipline (per WB-R24): an ADDITIVE, independently-DARK micro-migration —
> rig-validated on throwaway PG · dual-reviewed · behind an OWNER-gated ceremony ·
> per-gate version-pinned. **No workflow-body changes; zero freeze-manifest
> implication** (the wiki-projection consumer is a `startWorld` plugin, not a
> frozen WDK workflow — `check-frozen-workflows.mjs` does not apply, no `_vN` bump).
> Built AFTER 0019 lands (0019 = the wiki-boundary; 0020 does not exist on disk
> until 0019 is built/deployed — consequence queue line 185-186).

## 0. Scope

The WB-R23 trio, deployed DARK: (1) TYPED purposes in the consent schema
(first/only entry `wiki_synthesis`) · (2) the dispatch-time VERDICT fn + the
runtime call-twice re-check · (3) the discriminated doc→client RESOLVER + the
`document.classified` un-skip. Plus the schema/writer changes those require and
the in-transaction tail + blind battery.

**OUT of 0020 (hard scope guards):**
- The **invoice_facts / Azure-DI OCR** consent gate stays **purpose-BLIND**
  (`claim_document_processing_task`, 0011:2333-2362) — 0020 does NOT type it (§4).
  This is the sharpest edge: making it purpose-aware would de-authorize RPR's
  running production OCR lane (firm-breaking).
- The **C6 vendor-trace-export** items (DPA execution, firm-facing disclosure text,
  the PDPA cross-border check) — OWNER/legal, PROJECTLOG PART 2 (ADR-011, WA2-R2).
  0020 governs ONLY the product's OWN cross-border processor (the wiki-synthesis
  model call). It makes **no PDPA-compliance claim** beyond the WB-R23 alignment
  note (Data-Protection-by-Design: explicit purposes + withdrawal handling).
- A **second typed purpose** (the deferred `entry.approved`→treatment/
  recurring_pattern synthesis sibling) — the enum ships single-valued; widening
  needs a follow-on ruling.
- **Lighting** synthesis — activation (per-client re-attestation + hold clears +
  runtime repoint) is a SEPARATE owner-paced ceremony, NOT part of 0020 (§8).

## 1. Typed purposes on `clara.client_egress_consents`

**As-built (0011:910-934, verified):** the table carries only free-text
`scope_note` (`not null check btrim<>''`); a single live consent per client is
enforced by `uq_client_egress_consents_one_live` (partial UNIQUE on `(client_id)
where revoked_at is null`, 0011:931-932). The immutability trigger
`_tf_egress_consent_update` (0011:1048-1060, verified) makes a live row
**INSERT-once / REVOKE-once**: `DELETE` → CLR08; any `UPDATE` touching a field
other than `{revoked_by, revoked_at, revoke_reason}` → CLR08 "egress consent
permits only one revocation". **You therefore cannot retrofit a typed value onto
an existing/live row** — re-attestation must mint a NEW row. FORCE RLS + an
owner-only policy (0011:1091-1105) means no role but `clara_fn_owner` reads/writes
the table.

**The typed column (the 0018 §1a precedent, 0018:36-53):**
- `purpose text null CHECK (purpose in ('wiki_synthesis'))` — an extensible enum,
  identical shape to `bound_scope_kind` in 0018.
- **Legacy rows stay `null` = untyped = they NEVER satisfy a typed verdict**
  (fail-closed per client). The column is new, so every pre-0020 row is null
  (asserted empirically at apply-time, §6).
- **Re-attestation is APPEND-ONLY:** a new consent row with `purpose` set (+ the
  evidence-doc discipline the existing FK enforces); the legacy row **remains as
  history** (it is not revoked — see the one-live-index resolution below).
  Revocation is per-row.

**The one-live-index resolution (the central schema decision — debate settles the
exact shape, §9):** the current `(client_id)`-alone one-live index blocks ANY
second live row, so an appended typed row cannot coexist with a live legacy row.
Revoking the legacy row to make space is the **firm-breaking OCR de-authorization**
(§4). Proposed primary shape: DROP `uq_client_egress_consents_one_live`, CREATE a
partial UNIQUE on `(client_id, purpose) where revoked_at is null` with **`NULLS NOT
DISTINCT`** (PG15+, available on the deployed PG17). This:
- preserves the legacy one-live-per-client guarantee **byte-identically for the
  null-purpose lane** (`NULLS NOT DISTINCT` treats the untyped rows as one class —
  the OCR gate + `wave-a-egress` "exactly 1 live" assertion are unchanged), and
- permits **exactly one live typed row per `(client, purpose)`** to coexist, giving
  the verdict fn a single unambiguous binding row (§2).

**The writer (`grant_client_egress`):** it must accept the purpose. Per the 0018
§2 `seed_fixed_asset` idiom, **DROP the current signature; CREATE
`clara.grant_client_egress(p_client uuid, p_evidence_document uuid, p_scope_note
text, p_op_key text, p_purpose text default null)`.** `p_purpose IS NULL` → the
legacy/OCR untyped path, and the `_reserve_op` hash expression is **BYTE-IDENTICAL
to the pre-0020 expression** (legacy grant receipts replay identically); non-null →
the typed re-attestation path with the hash including purpose (same op-key +
different purpose = CLR28 reuse refusal). The duplicate-live refusal (CLR28
`duplicate_live`) becomes per-`(client, purpose)`. Owner floor unchanged (in-fn
`_human_ctx(role_rank('owner'))`); re-GRANT the new signature to
`clara_authenticated` ONLY under `clara_fn_owner`; the 0011 one-overload tail
assert updates to the new signature. `revoke_client_egress` is untouched (it
revokes the live row it finds; per-purpose revocation is a follow-on if a second
purpose ever ships).

## 2. The verdict fn + the runtime dispatch-boundary re-check (call-twice)

**`clara.check_egress_consent(p_client uuid, p_purpose text) returns jsonb`** —
SECURITY DEFINER `set search_path=clara,pg_temp`, `revoke all from public`, GRANT
EXECUTE to **`clara_runtime` ONLY** (never a table grant — the readWikiContext /
`get_wiki_page` DEFINER idiom, 0017 R1-F4). Returns
`{verdict: 'granted'|'denied'|'unknown', consent_id, granted_at}` and **NEVER
`scope_note` / `evidence_document_id` / `granted_by` / any row contents** (asserted
by a return-key allowlist, §6):
- **`granted`** iff a live typed row matches (`purpose = p_purpose AND revoked_at is
  null`); `consent_id` = that row's id (the natural "consent version" — a
  revoke+re-grant mints a NEW id, per the one-live-per-purpose index),
  `granted_at` = its timestamp.
- **`denied`** — no live typed row, but a **revoked** typed row of this purpose
  exists (explicit prior withdrawal); a stronger fail-closed signal for visibility.
- **`unknown`** — no typed row of this purpose has ever existed (the never-attested
  / legacy state). A legacy null-purpose live row → `unknown` (it never matches a
  typed verdict). With the verdict fn granted to runtime, the old raw-SELECT
  `42501 → unknown` path is **retired** — `unknown` now means "never attested,"
  not "no grant." **All three of `denied`/`unknown`/(absent) ⇒ HELD** (fail-closed);
  the boundary between `denied` and `unknown` is a VISIBILITY choice, not a safety
  one (§9).

**The runtime call-twice (closes the revocation race WB-R23(2)).** As-built,
`planCounterpartySynthesis` (wiki-projection.mjs) resolves consent **ONCE** at
:214 (`resolveConsentDefault`), then the model egress — the actual client-content
egress — happens later at **:224** (`deps.synthesize ?? synthesizeWikiPageDefault`),
with `readWikiContext` at :223 in between. The DB publish gate (`CLR32` under a live
`wiki_synthesis_holds` row, 0017:2040-2043) only catches the COMMIT, not the model
call. 0020 specs BOTH halves:
- **Plan-time verdict (replaces :214):** call `check_egress_consent(clientId,
  'wiki_synthesis')`. If `verdict != 'granted'` → `held_consent` (record
  `set_wiki_synthesis_hold` with a reason token reflecting the verdict, e.g.
  `wiki synthesis consent unknown`). If `granted` → capture `consent_id` (= X).
- **Dispatch-boundary re-check (a NEW step, immediately BEFORE :224, wrapping
  `synthesize`):** re-call `check_egress_consent(clientId, 'wiki_synthesis')` and
  proceed to the model egress **ONLY if** `verdict == 'granted'` **AND** the
  returned `consent_id == X` (the plan-time id). Otherwise ABANDON the egress
  (no `synthesize`, no `publish`) and record `held_consent`. Because a revoke sets
  `revoked_at` non-null (X no longer live → not `granted`) and a revoke+re-grant
  mints Y≠X, the re-check refuses on BOTH — an in-flight authorization is bound to
  the exact consent version and a fresh grant is never silently re-authorized.
- Seam note: this is a runtime-lib edit to the `startWorld` plugin (no `_vN`), and
  it is the SAME call-twice discipline the OCR lane already uses (a last-boundary
  re-check on re-claim, wave-a-egress:113-134) — 0020 brings the wiki lane to
  parity.

## 3. The doc→client resolver + the `document.classified` un-skip

**`clara.resolve_document_client(p_document uuid) returns jsonb`** — SECURITY
DEFINER `set search_path=clara,pg_temp`, `revoke all from public`, GRANT EXECUTE to
**`clara_runtime` ONLY** (again a DEFINER fn, not a table grant: `clara_runtime`
has NO grant on `clara.document_filings`, 0007:2740 / 0008 surface). Resolves
against **active filings** (`clara.document_filings where document_id = p_document
and retired_at is null`, 0007:63-76 per the dossier) by the DISTINCT `client_id`
set. Returns `{status: 'unresolved'|'unique'|'ambiguous', client_id?,
candidates_n}` — `client_id` is present **ONLY on `unique`**:
- **zero** active filings → `unresolved`, `candidates_n = 0`, no `client_id`.
- **exactly one** distinct active-filing client → `unique`, `candidates_n = 1`,
  `client_id` released.
- **multiple** distinct active-filing clients (a document CAN be filed to >1 client
  — the `wave-a-egress` partial_consent shape) → `ambiguous`, `candidates_n = N`,
  **never** a `client_id`.
- A `document_id` is globally unique and its filings are single-firm, so the
  single-arg signature is firm-safe; the runtime wrapper (which carries `firmId`
  from the event) asserts firm congruence before un-skipping (§9 tracks whether to
  add an explicit `p_firm` for cross-firm defense-in-depth).

**The un-skip (planEvent `document.classified`, :320-324).** Today the injected
resolver is `resolveDocumentClientDefault` (:99-101, returns `null`
unconditionally) → `planDeterministicIngest` skips `skipped_unresolved_client`
(:197). 0020's injected `deps.resolveDocumentClient` wraps
`resolve_document_client` and returns `client_id` **only when `status == 'unique'`**,
else `null`. So `document.classified` **un-skips (→ deterministic ingest) ONLY on
`unique`**; the **`skipped_unresolved_client` receipt stays for both `unresolved`
AND `ambiguous`** (an id is never released for an ambiguous document). `entry.approved`
(which already carries `client_id`) is unchanged.

## 4. The dual-purpose hazard — the OCR lane stays purpose-BLIND (non-negotiable)

The SAME live consent row is load-bearing for TWO egress purposes today, but only
wiki is being typed. `claim_document_processing_task` (0011:2333-2362) authorizes
Azure-DI OCR / invoice_facts **cross-border** egress on **any** live
`client_egress_consents` row (`revoked_at is null`, purpose-blind); RPR's ONE live
free-text row (ADR-024) authorizes that OCR lane in production RIGHT NOW. WB-R23
rules legacy rows do NOT auto-map to typed purposes. Therefore **0020 MUST NOT
touch the OCR gate:** it stays purpose-blind, the new nullable `purpose` column is
invisible to its `revoked_at is null` predicate, and RPR's legacy row keeps
authorizing OCR byte-identically. The one-live-index resolution (§1) is chosen
precisely so the typed wiki row COEXISTS with the legacy row rather than revoking
it. A battery cell (§7) pins that the OCR lane's authorization is byte-identical
before/after 0020.

## 5. Re-attestation surface (P5 — do not invent UI)

The dossier confirms there is **NO consent-granting dashboard surface** today —
consent is owner-RPC-only (`grant_client_egress` / `revoke_client_egress` through
PostgREST under an owner JWT; the rig helpers `grantClientEgress`/`revokeClientEgress`
model the call). So the 0020 deliverable is a **documented owner RPC recipe in the
activation runbook**, not UI: the typed grant call
(`grant_client_egress(p_client, p_evidence_document, p_scope_note, p_op_key,
'wiki_synthesis')` with the signed re-attestation evidence-doc discipline of
ADR-024), followed by `clear_wiki_synthesis_hold` for that client. **If** a consent
dashboard surface is later built, a minimal **purpose-aware rider** ships as a
POST-ceremony PR (the Pages auto-deploy rule: a UI merge ships immediately, so it
must never reference the typed path before 0020 is live — the 0018 §8 PR-B
discipline).

## 6. The 0020 in-transaction tail battery (apply-time, one transaction)

0011/0017/0018 idioms plus 0020's additions — asserts: **catalog shape** of the two
new fns (`check_egress_consent`, `resolve_document_client`) and the recreated
`grant_client_egress` (arg names/defaults/owner/`SECURITY DEFINER`/`search_path`);
the **return-key allowlist** — `check_egress_consent`'s jsonb keys are exactly
`{verdict, consent_id, granted_at}` and `scope_note`/`evidence_document_id`/
`granted_by` NEVER appear; **grant closed-set** (`check_egress_consent` +
`resolve_document_client` = `clara_runtime` ONLY, NOT reachable by
`clara_agent_ro`/`clara_wake_*`/`clara_authenticated`; `grant_client_egress` =
`clara_authenticated` ONLY); **PUBLIC-execute sweep == 0**; **NO runtime table
grant** on `client_egress_consents` or `document_filings` (assert absent — the
DEFINER fns are the only surface); the **`purpose` column + CHECK + the relaxed
one-live index** exist and the **legacy null-purpose one-live-per-client guarantee
is preserved** (a second live null-purpose row for the same client REFUSES);
**apply-time precondition** — every existing consent row has null `purpose` and no
client has >1 live row pre-swap (empirical, never assumed); the one-overload assert
updated for the new `grant_client_egress` signature; **wiki-leak / sightings /
autopost proname scans** over every touched fn; FORCE RLS + owner policy on the
table intact. **Every functional tail probe runs inside a forced-rollback
subtransaction** (never commit fixture consent/audit/event rows into the schema).
Fn bodies created under `set role clara_fn_owner` / `reset role`. Any failure
aborts the apply.

## 7. The blind battery's charter (contract-only; SQL-unread)

Built by a contract-blind lane (battery authored against THIS contract, the SQL
unread) and reconciled on the rig with orchestrator adjudication, per the 0018
discipline. Cells:

**Typed-verdict ladder** — `granted` (a live typed `wiki_synthesis` row → verdict
`granted`, `consent_id` = that row, `granted_at` present, contents NEVER leaked) ·
`unknown` on a client with ONLY a live legacy null-purpose row (RPR's shape — the
legacy row never satisfies the typed verdict) · `unknown` on a client with no
consent row at all · `denied` on a client whose typed row was granted-then-revoked
· `granted` after re-attestation where the legacy row and the new typed row COEXIST
(§1) — AND the OCR lane is still authorized by ANY live row (both count) · the CHECK
rejects an off-enum purpose string.

**Revocation races (two-session — the heart the ruling demands before lighting):**
(a) A plans (verdict `granted`, `consent_id = X`); B `revoke_client_egress`(X)
between plan and dispatch; A's dispatch-boundary re-check re-reads → not `granted` →
**REFUSES egress**, records `held_consent`, zero `synthesize`, zero `publish`.
(b) A plans (X); B revokes X AND grants a new typed row Y; A's re-check reads
`granted` but `consent_id = Y ≠ X` → **REFUSES** (a fresh grant is never silent
re-authorization). (c) No-race baseline: A plans (X), re-check reads X still
`granted` → proceeds to `synthesize` (rig lights a typed row to exercise the
positive path — DARK in prod until activation).

**Resolver ladder** — zero active filings → `unresolved`/`candidates_n 0` →
`document.classified` stays `skipped_unresolved_client` · exactly one → `unique`,
`client_id` released → un-skips → deterministic ingest fires · multiple distinct
clients (same document filed to A and B) → `ambiguous`/`candidates_n N`, no
`client_id` → stays `skipped_unresolved_client` · **retire-mid-resolve** (two
active filings, retire one → `unique` to the survivor once the retire commits;
retire all → `unresolved`) under a consistent snapshot.

**Grant / RLS closed-set** — verdict + resolver EXECUTE-granted to `clara_runtime`
ONLY; PUBLIC-execute 0; unreachable by `clara_agent_ro`/`clara_wake_*`/
`clara_authenticated`; NO table grant to runtime on `client_egress_consents` /
`document_filings`; `grant_client_egress` (5-arg) stays `clara_authenticated` ONLY
with the owner floor; cross-firm DEFINER probes on BOTH fns return the single
not-found shape (a firm-B caller cannot learn firm-A's client via the resolver; the
verdict firm-scopes).

**Receipt vocabulary** — `document.classified`: `skipped_unresolved_client`
(unresolved AND ambiguous), `projected` (unique) · wiki synthesis: `held_consent`
(reason token per verdict: unknown/denied/revoked), `projected` only when
granted-and-re-checked-granted · the dispatch-boundary refusal records
`held_consent` (a typed terminal — never a crash, never a dead-letter loop).

**Rig privacy races (the ruling's before-lighting bar)** — the revocation race
(above); the ambiguity race (above); a verdict-never-leaks-contents probe (return
keys exactly `{verdict, consent_id, granted_at}`); the cross-firm DEFINER probes;
the **OCR-lane non-regression** (RPR's legacy row still authorizes invoice_facts
after 0020 — byte-identical `claim_document_processing_task` consent count); op-key
replay (legacy `grant_client_egress` with `p_purpose null` replays byte-identically
to a pre-0020 grant; same op-key + different purpose refuses CLR28). Lockstep test
updates: `wave-a-egress`, `wave-a-0012/0014` consent tests, `wave-a-fixtures`
helpers (`grantClientEgress` gains purpose); runtime `wave-b-wiki-projection-consumer/
unit` (the DEFAULT-path `held_consent` expectations change when
`resolveConsentDefault` → the verdict fn; injected `deps` still pass).

## 8. Deployment (DB-first; everything ships DARK)

**PR-A (DB):** migration 0020 + the tail battery + the fixture/helper updates
(`grantClientEgress` gains purpose). Merges pre-ceremony (undeployed).

**PR-B (runtime image + consumer tests):** the wiki-projection.mjs rewire — the
call-twice verdict at :214 + the dispatch-boundary re-check before :224 + the
resolver wrapper for `document.classified` — **`to_regproc`-guarded** on both new
fns (the `wikiColdStartReady` idiom, wiki-projection-ops.mjs:100-108) so the image
tolerates a pre-migration DB by falling back to the current dark held path. **Not a
`_vN` bump** (plugin, not a frozen workflow). The image ships DARK.

**The ceremony (owner-`!`-gated; DB-first per WB-R24 — the opposite of 0019's
runtime-first, because 0020's runtime rewire READS new DEFINER fns that must exist
first, and neither order can light synthesis so there is no silent-loss window):**
backup-first → quiesce → apply 0020 (tail in-txn) → `NOTIFY pgrst, 'reload schema'`
→ **post-verify probes** (via a `clara_runtime`-role probe: `check_egress_consent`
returns `unknown` for RPR's legacy row and for every client — zero typed rows;
`resolve_document_client` returns the three discriminated shapes; the OCR lane still
authorized; no runtime table grant) → deploy the new runtime image (`fly deploy`)
→ **verify DARK** (every verdict `unknown` ⇒ held; synthesis STILL held;
`document.classified` un-skips only on unique; OCR unaffected) → unquiesce → record
the version pin (**migration count → 20 + the new runtime image tag**; no gate
journey straddles the deploy). Scheduling of PR-A/PR-B/ceremony is the
orchestrator's per WB-R24 pinning.

**ACTIVATION (SEPARATE — post-ceremony, owner-paced, NOT part of 0020):** per-client
owner **re-attestation** (`grant_client_egress(..., 'wiki_synthesis')` with the
evidence doc, §5) → `clear_wiki_synthesis_hold` for that client → the verdict
returns `granted` → the re-check passes → synthesis LIGHTS for THAT client. Every
un-re-attested client stays fail-closed. Deterministic ingest + the counterparty
deterministic paths keep working DARK-independent throughout.

## 9. Open design items — the debate must settle these

1. **The one-live-index shape.** Proposed: `unique (client_id, purpose) where
   revoked_at is null NULLS NOT DISTINCT` (preserves the legacy null-purpose
   one-live-per-client guarantee + gives the verdict one binding row). Debate:
   confirm `NULLS NOT DISTINCT` on the deployed PG17 vs a filtered/expression
   variant vs dropping the index; and whether typed rows are one-live-per-
   `(client,purpose)` (clean binding) or truly unconstrained (P1's literal "any
   live typed row suffices" — which would force the verdict fn to deterministically
   pick the binding row). Preserving the OCR + `wave-a-egress` "exactly 1 live"
   behavior for null-purpose rows is a hard constraint on whatever wins.
2. **`grant_client_egress` arity.** DROP-and-recreate the 5-arg with `p_purpose
   default null` (the 0018 `seed_fixed_asset` idiom) vs a distinct new overload;
   and the op-key-hash byte-compat requirement when `p_purpose` is null (legacy
   replay).
3. **The `denied` vs `unknown` boundary** in the verdict fn (revoked-typed-row-
   exists ⇒ `denied` vs never-attested ⇒ `unknown`). Both map to held — a
   VISIBILITY decision only; confirm the exact predicate and the held reason
   tokens.
4. **The resolver signature + ambiguous receipt.** Honor the pinned
   `(p_document uuid)` (single-firm-safe) vs add `p_firm` for explicit cross-firm
   defense-in-depth; and whether `ambiguous` deserves its own receipt token
   (`skipped_ambiguous_client`) for visibility vs staying `skipped_unresolved_client`
   (orchestrator pinned the latter).
5. **Deploy ordering confirmation.** DB-first (pinned) with the `to_regproc` guard
   making the image order-tolerant — confirm the guard's exact surface (both new
   fns) and the fallback-to-dark-held behavior pre-migration.
6. **The typed-grant evidence discipline.** Does a `wiki_synthesis` grant REQUIRE a
   non-null `evidence_document_id` (the signed re-attestation PDF, ADR-024 shape) or
   permit the owner-declaration null-doc path (0012)? PDPA-by-design leans toward
   requiring evidence for the typed grant.
7. **The `+ document hash where applicable` clause of WB-R23(2).** Counterparty
   wiki synthesis is not document-tied, so doc-hash binding is n/a for 0020's wiki
   lane — confirm it is out of scope here (it would only matter for a future
   document-tied synthesis purpose).
8. **Consumer-test default-path.** Confirm the lockstep rewrite of
   `wave-b-wiki-projection-consumer/unit` DEFAULT-path expectations when
   `resolveConsentDefault` is replaced by the verdict fn (injected `deps` paths
   unchanged).
