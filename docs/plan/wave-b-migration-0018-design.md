# Migration 0018 — the Gate-K/accounting domain (WB-R24(i)) · design contract v1.0

> **Status: RATIFIED for build (2026-07-24)** under the owner's standing delegation
> (ADR-037 method): orchestrator draft v0.1 → Codex gpt-5.6-sol xhigh adversarial
> design debate (verdicts AGREE/AMEND ×many, REJECT ×2 — both accepted after
> orchestrator verification) → this v1.0. The debate's structural finds are baked in:
> the **K5 stranding hole** (verified: the approve loop joins `opening_items`
> directly at 0017:3959-3963 while `_opening_seed_basis` counts reversals via
> `e.reversal_of` at 0017:3613 — a replacement-correction's reversal can strand under
> a finalized seed), the **binding-escape leak** (a bound resolution must not pass
> the generic loose assert), and the **auto-deploy split** (§8).
> Discipline: blind lanes (battery SQL-unread / SQL battery-unread) → rig reconcile
> with orchestrator adjudication → cross-model ratchet → dual review → the two-PR
> deployment split. **No workflow-body changes; zero freeze-manifest implication.**

## 0. Scope

Four DB items + one dashboard rider (separate PR, §8). OUT of 0018: typifying the
sibling op_key CLR10 family (follow-on candidate) · the W2 veto removal + tail
(0019) · consent (0020) · any binding semantics beyond `'opening_seed'` scope.

## 1. Subject-bound keyed resolutions

**As-built gap (0004:94-97):** keyed lane accepts ANY live human/rule ≥0.95
resolution of the client; cross-seed/cross-item replay is unblocked; the
`evidence->>seed_id` convention is dashboard-only.

**Structural binding — `clara.client_resolutions` gains:**
- `bound_scope_kind text null CHECK (bound_scope_kind in ('opening_seed'))`
- `bound_scope_id uuid null`
- `CHECK ((bound_scope_kind is null) = (bound_scope_id is null))`
- composite FK `(bound_scope_id, firm_id, client_id) →
  clara.opening_seed_registry(id, firm_id, client_id)` (the referenced unique key
  exists — 0017:1097)
- **UNIQUE** partial index on `(bound_scope_kind, bound_scope_id) where
  superseded_at is null` — one live binding per scope, structural [AMB-0018-3].

**Supersession mechanism (pinned at reconcile, AMB-0018-3):** the bound mint
AUTO-SUPERSEDES — inside its transaction it sets `superseded_at=now()` on any
prior live bound row of the same `(scope_kind, scope_id)` before inserting the new
one (re-attribution after an operator error is one mint, no extra verb; the UPDATE
serializes against the bound assert's FOR SHARE). No standalone supersede verb
ships in 0018.

**The bound mint verb:** `clara.record_opening_keyed_resolution(p_client uuid,
p_seed uuid, p_evidence jsonb, p_op_key text) returns jsonb` — human lane,
bookkeeper+ floor (CLR04/CLR03); CLR11 firm/client/seed; the seed must belong to
p_client AND be KEYED (`tie_document_id is null`), else CLR10
`{"reason":"tie_document_present"}`; mints `subject_kind='manual'`,
`subject_id=p_seed`, `method='human'`, **confidence pinned 1.0** (no caller
confidence — a categorical human confirmation, per debate §9.2),
`bound_scope_kind='opening_seed'`, `bound_scope_id=p_seed`, canonical evidence
(caller evidence merged under a `{source:'opening_keyed_seed', seed_id}` spine);
`_reserve_op` hash covers EVERY argument; audited; GRANT `clara_authenticated`
ONLY. The generic `record_client_resolution` is untouched.

**The bound assert (PRIVATE — no grants, like the other `assert_*` internals):**
`clara.assert_client_resolved_bound(p_client, p_resolution, p_scope_kind,
p_scope_id)` — the 0004 predicate (human/rule, ≥0.95, live) PLUS the binding
equality, and it locks the qualifying resolution row **FOR SHARE** (supersede
race). Refusal class CLR01. **Post-commit supersession semantics (pinned):**
superseding a resolution prevents FUTURE drafts; it does not retroactively
invalidate an already-attributed draft.

**Capability confinement (the binding-escape fix):** generic
`clara.assert_client_resolved` gains one predicate line — `AND r.bound_scope_kind
IS NULL`. All existing rows are unbound (columns are new) so every one of the 16
consumers keeps byte-identical behavior; a BOUND resolution becomes usable ONLY on
its bound lane. This is the sole touch to the shared fn.

**Enforcement:** `_draft_opening_item_core` — keyed lane (`p_document IS NULL`)
calls the bound assert with `('opening_seed', p_seed)`; document-tied lane
unchanged. No live keyed flows exist, but the migration must not assume it: §6's
apply-time precondition asserts zero existing keyed opening items empirically.

## 2. `seed_fixed_asset` + `p_resolution`

DROP the 4-arg signature; CREATE `clara.seed_fixed_asset(p_client uuid, p_seed
uuid, p_asset jsonb, p_op_key text, p_resolution uuid default null)`.
- **Tied seed:** lock the exact active filing FIRST via
  `_active_document_filing(..., true)` and derive the resolution from THAT filing id
  (closes the retire/refile race vs the unlocked read at 0017:3551); a NON-NULL
  `p_resolution` alongside a tie refuses CLR10
  `{"reason":"resolution_conflicts_with_tie"}` (explicit null ≡ omitted — DEFAULT
  NULL cannot distinguish them; the contract treats null as omitted).
- **Keyed seed:** `p_resolution` flows to the core → the §1 bound assert.
- **Op-key hash compatibility (binding):** when `p_resolution IS NULL` the
  `_reserve_op` hash expression is BYTE-IDENTICAL to the 4-arg as-built expression
  (pre-0018 document-tied receipts replay byte-identically); when non-null, the
  hash includes it (same intent + different resolution = CLR10 reuse refusal).
- FORK-7 straight-line CLR30 floor, K8 shape, bookkeeper+ floor: unchanged.
  Re-GRANT the 5-arg sig to `clara_authenticated` under `clara_fn_owner`.

## 3. Dual-lane purity guards (supersedes the single-sided draft)

ONE private authoritative classifier (helper fn or inlined identical predicate,
the ratchet decides the form) partitions a seed's draft `is_opening_balance`
entries: **associated** = direct `opening_items` row OR reversal-of a seed item;
**correction** = direct row with `supersedes_item_id IS NOT NULL` OR
reversal-of-a-seed-item (a pure reversal's synthetic item carries
`supersedes_item_id` — 0017:4127; FA replacements carry the same lineage —
0017:3439); **non-correction** = associated minus correction.
- `approve_opening_seed` (K5) refuses when any **correction** draft exists:
  CLR31 `{"reason":"correction_draft_present"}` — closes the verified K5
  stranding hole.
- `approve_opening_correction` (K6) refuses when any **non-correction** draft
  exists: CLR31 `{"reason":"non_correction_draft_present"}` — closes the dossier's
  K6 hole. Guard placement: after the has-correction-drafts check (post-4207),
  before `_assert_opening_tie` (pre-4232), inside the existing advisory-lock +
  serializable envelope; no new lock key (the seed FOR UPDATE already serializes
  both verbs against `_draft_opening_item_core`'s FOR SHARE).
- The predicate must be the EXACT set algebra above — a sloppy complement
  false-positives on legitimate reversal/replacement/multi-round/FA-replacement
  shapes and breaks every K6 cell (wb-r1 F10/F12, wb-r3, wb-k-supersede-fa).

## 4. Typed reasons on the commit-refusal CLR10s

`commit_client_onboarding`: the four free-text CLR10s gain detail tokens, site 2
SPLIT into ordered branches with pinned precedence — (1) `plan_not_open`, (2)
`client_not_onboarding` — then `op_key_required`, `questions_unresolved`,
`opening_position_required`. Codes stay CLR10; messages stay human. A cell where
BOTH split conditions are false pins the precedence. Sibling family: out of scope.

## 5. Dashboard rider (SEPARATE PR — merges only after the 0018 ceremony, §8)

- `rpcSerializableOnce` returns the body (first success AND the 40001-retry body —
  both tested, same op key). `approveOpeningSeed`/`approveOpeningCorrection` return
  a runtime-validated `ApprovalReceipt` `{seed_id, status, batch_n, entry_count,
  entries}` — **`entry_count` is DB-authored**: both approval verbs add it to their
  return jsonb in 0018 (never a client-computed count).
- `OpeningCeremony` persists the receipt visibly (no unmount race: the receipt
  renders and a Done/Reload action triggers `onFinalized`; never React-batched
  away — debate §5).
- `OpeningItemForm` ENABLES fixed assets on keyed seeds (the as-built exclusion at
  :87/:304 would make keyed FA unreachable) — sends `p_resolution` on keyed seeds,
  omits it on tied seeds; the prohibition-locking test (OpeningItemForm.test.tsx:24)
  updates to the new behavior.
- `recordKeyedClientResolution` → the bound mint verb; the read-back filters
  `bound_scope_kind=opening_seed AND bound_scope_id=eq.<seed>` PLUS live/method/
  confidence eligibility (never id alone).

## 6. The 0018 in-transaction tail battery

0017 idioms plus the debate's additions — asserts: grant closed-set (5-arg
`seed_fixed_asset` + the bound mint = `clara_authenticated` ONLY; the bound assert
is PRIVATE — zero grants); PUBLIC-execute sweep; wiki-leak + sightings/autopost
proname scans over every touched fn; catalog shape (exact 4-input `pg_proc` row
ABSENT, arg names/defaults/owner/SECURITY DEFINER/search_path of the new fns);
binding columns + paired CHECKs + composite FK + partial index exist; generic
assert REJECTS a bound row; the bound assert's body contains the FOR SHARE lock;
BOTH lane guards present; `get_context_pack`'s serialized resolution shape
EXCLUDES the binding columns; **apply-time precondition: zero existing keyed
opening items/drafts** (empirical, never assumed). **Every functional tail probe
runs inside a forced-rollback subtransaction** (a probe must never commit fixture
audit/event/receipt rows into production). Fn bodies under `set role
clara_fn_owner`/`reset role`. One transaction; any failure aborts the apply.

## 7. The blind battery's charter (contract-only; SQL-unread)

Everything from v0.1 §7 PLUS the debate's cells: opening-bound resolution REFUSES
generic keyed `draft_entry` (capability confinement) while an unbound one still
passes there · the same bound resolution serves two items in one seed, a
reopen/additive batch, and a same-seed supersede (seed-grain binding is by design)
· supersession races (before/during draft; post-draft pinned semantics) ·
0017→0018 upgrade replay: a pre-0018 4-arg document-tied FA receipt replays
byte-identically · FA op-key reuse with a DIFFERENT resolution refuses CLR10 ·
tied-FA filing/resolution congruence under retire/refile concurrency · 4-arg
invocation succeeds via the default while the exact old catalog row is absent ·
K5 refuses replacement, pure-reversal, and FA correction drafts
(`correction_draft_present`) · K6 accepts pure reversal, replacement, second-round
supersede-of-the-current-replacement (sequential ceremonies), and FA replacement;
refuses additive (`non_correction_draft_present`) · **multi-item corrections are
SEQUENTIAL per-item ceremonies BY DESIGN** (the S4 per-item precedent; a second
`supersede_opening_item` while the seed is open refuses CLR31 `registry_not_open`
— pinned as intended, AMB-0018-4) · draft-vs-approval races in both orders
· the five commit reasons each asserted by token + the both-false precedence cell
· cross-firm probes for the new mint (extends wb-x-crossfirm) · dashboard: keyed
FA reachable + sends resolution, tied omits; receipt survives render-before-reload;
the 40001-retry body returns.

## 8. Deployment (two PRs; the WB-R24 pin)

**PR-A (DB):** migration 0018 + the battery + wb-calls helper update. Merges
pre-ceremony (undeployed). **The ceremony (owner-`!`-gated):** backup-first →
quiesce → apply 0018 (tail in-txn) → `NOTIFY pgrst, 'reload schema'` → post-verify
probes (bound refusal via PostgREST, receipt shape, catalog) → **PR-B (dashboard
rider) merges ONLY now** (Pages auto-deploys from main — merging it earlier ships
UI against missing fns) → verify bound mint/read, keyed FA, receipt rendering →
unquiesce → record the Gate-K version pin. If Gate K's window opens first, Gate K
runs as-built (document-primary / keyed minus FA) on its own pin.

## 9. Debate verdicts (recorded)

1. Columns not a table — with FK + index (AMEND, accepted). 2. Confidence pinned
1.0, no `p_confidence` (AMEND, accepted). 3. `resolution_conflicts_with_tie` kept
(AGREE). 4. K5 is NOT safe as-built — dual-lane guards from one classifier
(REJECT of the draft's single-sided guard; verified and accepted). 5. Token family:
`correction_draft_present` + `non_correction_draft_present` (AMEND, accepted).
Deployment: same-PR rider REJECTED → the §8 split. Full debate record:
session scratchpad `codex-0018-debate.md`; grounding dossier: workflow
`wf_40ff1dc9-8b6`.

## 10. Reconcile adjudications (2026-07-24; the fix round cites these tags)

- **[AMB-0018-1] The keyed-lane tightening is INTENDED breakage.** Nine
  pre-existing 0017-era cells (wb-x-crossfirm before-hook +5 dependents, K5
  maker=checker + SOLO, K3 WB-R15 keyed fallback, and kin) pin the loose keyed
  lane (generic unbound resolution). They UPDATE to the bound mint
  (`record_opening_keyed_resolution`) — WB-R15's attributed-keyed spirit is
  preserved; the attribution becomes seed-bound per WB-R24(i). Prefer one
  fixture-level staging switch over per-cell edits where the battery's staging
  helpers centralize the keyed mint.
- **[AMB-0018-2] K6 guard ordering (SQL fix):** the `non_correction_draft_present`
  guard runs BEFORE the pre-existing has-correction-drafts existence check, so a
  pure-additive-only seed surfaces the new typed reason, never the legacy one.
- **[AMB-0018-3] Supersession pinned (SQL fix + §1 amendment):** mint
  auto-supersedes the prior live bound row of the same scope in-txn; the partial
  index becomes UNIQUE. No standalone supersede verb.
- **[AMB-0018-4] Multi-item corrections are sequential per-item ceremonies BY
  DESIGN (charter amendment §7):** the second-supersede-while-open CLR31
  `registry_not_open` refusal is pinned as intended; the battery cell asserts it.
- **[AMB-0018-5] Closed-roster companions (battery fix):** rig-isolation T17,
  wb-g-opkeys G4, wb-g-tail G2 rosters gain `record_opening_keyed_resolution` +
  the 5-arg `seed_fixed_asset` signature.
- **[AMB-0018-6..9] Battery-authoring bugs (battery fixes, per the reconcile
  lane's verified diagnoses):** no double-reopen after supersede (the supersede
  already reopens); build K6 entry-revision sets from the supersede receipt's
  `reversal_entry_id` + replacement id (the wb-k-supersede-fa pattern), never from
  `opening_items` alone; keyed `draft_opening_item` named-arg calls carry ALL
  eight args (`p_document`/`p_sha256` explicitly null); two-session claims
  `set_config(..., true)` require an explicit BEGIN first.
