# F-A4 PR-2c — the close-prep chat lane (FS-7 echelon 1.5)

*Design of record, 2026-09-01. Authored by the opus design lane under 裁-99; costs re-ruled 裁-100
(owner: build all twelve now, ≈4.5 units, frontend sprint runs in parallel and is not displaced).
Sub-rulings: 裁-100① `wake_open_fiscal_year` keeps the ADMIN floor on the attended lane;
裁-100② `wake_propose_close` needs bookkeeper only, NO `close_and_attest` (the settle door is the wall).
This file lands in PR A as the design doc.*

## 0. Premise corrections (measured, file:line)

(A) `wake_kind='interactive'` is STRUCTURALLY impossible as the carrier:
`ck_wake_credentials_client_0011` (0126:599-605) forces client_id NULL on `interactive`, and
`_close_wake_ctx`'s client-pin rung (0138:1296-1300) refuses a NULL client. Widening that CHECK is
the change F-A2/D34/R-1 REFUSED on census grounds (chatTurn.v13.infra.ts:24-32). The correct kind is
**`interactive_client`** (0126:602 — requires client), the chat lane's pinned kind, minted by
pools.mjs:428, used by questionScoped (chatTurn.v13.infra.ts:117-129).

(B) FOUR walls, not one: W1 allowlist rows (0138:2521-2533, close_prep only today) · W2 client pin ·
W3 `_wake_task_id()` non-null (0138:1302-1306; sole writer mint_wake_credential_for_task 0138:849-853,
which refuses non-close_prep kinds at :820-823) · W4 task-KIND congruence (0138:843-848 requires
task.kind = wake_kind; a chat turn's task is kind='chat_turn', 0006:142 / 0120:261).

(C) The card needs NO new door: `clara.list_agent_act_receipts(uuid,timestamptz)` exists
(0138:1764-1786), granted clara_authenticated (0138:2563), already consumed at
apps/web/lib/close/api.ts:271-278 → components/close/AgentActReceiptsPanel.tsx:36-38.

## 1. The opening (Q1) — a new sibling door + shared helper + rung A8

**(1) New minter, `mint_wake_credential_for_task` BYTE-UNTOUCHED:**
```sql
create function clara.mint_chat_close_credential(
    p_firm uuid, p_client uuid, p_agent_task uuid, p_on_behalf_of uuid,
    p_ttl interval default '00:15:00'::interval)
  returns table(credential_id uuid, secret text)
```
- Kind HARDCODED `'interactive_client'` (law 68 — structural, never caller's choice; mirrors
  mintBankAgentCredential's reasoning, wake-mints.mjs:22-30).
- `p_on_behalf_of` MANDATORY (CLR10 if null), active bookkeeper+ of the firm, and byte-bound to
  the chat task's own `created_by` director. A NULL-obo
  interactive_client credential from chat would be unattended authority — `wake_context()`'s
  liveness predicate (0011:1146-1152) passes NULL obo trivially. Forbidding NULL is a wall.
- `p_client` mandatory, firm-congruent, status='active' (byte-mirrors 0133:735-745).
- `p_agent_task` mandatory: congruence via the shared helper with p_task_kind := 'chat_turn',
  PLUS a NEW liveness rung: `agent_tasks.status in ('queued','running','awaiting_input')` —
  a completed turn must not mint fresh authority.
- Grant: clara_runtime only (mirrors 0138:2557).

**(2) Shared congruence helper** `clara._assert_wake_task_congruent(p_task, p_firm, p_client,
p_task_kind, p_on_behalf_of) returns void` — ungranted, definer, CLR11 `wake_task_incongruent`,
plus the separate CLR11 `wake_task_director_mismatch` binding to `agent_tasks.created_by`. Do NOT CoR
mint_wake_credential_for_task to adopt it in this PR (live-writer body, D1 argument, zero gain);
pin non-drift with the two-door drift CELL instead (battery cell 7).

**(3) RUNG A8 — the attended-authority floor (the load-bearing addition).**
The twelve wrappers deliberately carry no capability gate (0138:1275-1279) — sound on the clocked
lane (no human to escalate), a capability-laundering path on the attended lane. Measured gaps:
begin_close/abandon_close human doors require bookkeeper + `close_and_attest` (0120:1147-1152,
:1211); open_fiscal_year requires `_human_ctx(admin)` (0120:1330); mint_month_snapshot and the six
reads have no gap. Fix — CoR `clara._close_wake_ctx` adding:
```
if w.on_behalf_of is not null then
  perform clara._assert_attended_close_floor(p_verb, w.firm_id, w.on_behalf_of);
end if;
```
`_assert_attended_close_floor`: new, ungranted, IMMUTABLE per-verb mapping (min rank, required
capability) via `clara._has_capability` (0056:1114) + role_rank. Per 裁-100①: open_fiscal_year maps
to ADMIN rank. Per 裁-100②: propose_close maps to bookkeeper, no capability. Tier A (raise), not
Tier B: `_close_wake_ctx` is stable (0138:1282) and an authority failure is the Tier-A class.
**Clocked lane: on_behalf_of IS NULL by construction (0138:850-853) → A8 provably no-op; F-A4
shipped behaviour bit-for-bit unchanged (battery cell 2 proves it, including a pre-migration
byte-compare).**
Deploy shape: `_close_wake_ctx` is a stable read-gate with zero live callers today — not
because no closePrep.v1 body exists, but because `clara.wake_engine_sources`'s `close_prep` row
stays `enabled=false`, so the wake-execution engine structurally never calls `start()` on it. No
D1 window; the PR states this with the evidence (see the correction immediately below and the
migration header's own §DEPLOY-SHAPE section for the checked-precondition this correction requires).

**2026-09-01 correction (owner ruling, via the PR-A driver's STOP):** the original wording above
("close_prep source disabled 0133 §G; no closePrep.v1 shipped") was a STALE premise —
`closePrep_v1` shipped in #437 (2026-08-30, one day before this design was authored):
`packages/runtime/workflows/closePrep.v1.ts` exists, is `@frozen`, and is registered at
`registry.ts:133` (`closePrep: closePrep_v1`), with its impl/tools modules issuing real SQL calls
to all twelve `wake_*` close verbs. The safety CONCLUSION is UNCHANGED (zero live callers today,
no D1 window for the A8 CoR) but rests on the STRONGER, correctly-cited mechanism stated above, not
on the body's absence. Three independent sources, each confirming the engine never dispatches it
while the row is `enabled=false`: `PROGRESS.md` line 119 ("NOT deployed, both switches OFF —
the 裁-40 flip is inert until G1 PR-2 builds the two PRODUCERS"); `packages/runtime/workflows/
registry.ts:121-128` ("Both sources stay enabled=false, so the engine never claims for them and
never calls start() on either export"); and `packages/runtime/plugins/startWorld.ts:246-256`
("both seed rows remain enabled=false, so the engine claims nothing for either source until the
owner flips them through `clara.set_wake_source_enabled` at the G1 rollout ceremony"). Because a
ceremony can flip this flag, the migration's own deploy-shape evidence must be a CHECKED
PRECONDITION at apply time, never a dated snapshot (the dated-tripwire class — never pin a
ceremony-state as eternal): the migration header re-verifies `enabled=false` for the `close_prep`
row immediately before applying, and refuses to apply (requiring a D1 write-quiesce window instead)
if the G1 flip has already happened. The G1 flip is post-beta-sequenced (裁-76/79), so the window
described above is real but the check must exist regardless.

**(4) The invariant, formally.** INV-1 task binding: every close act runs under c with
c.agent_task_id NOT NULL and r.wake_task_id = c.agent_task_id, read via _wake_task_id() never a
caller argument. INV-2 op-key derivation: op_key = sha256(task ‖ verb ‖ subject)
(0138:1310-1313 / :2513-2517) — task A's key refused on task B (`op_key_not_derived`); same-(verb,
subject) retry within a task replays _reserve_op's stored outcome. INV-3 (NEW): when
c.on_behalf_of IS NOT NULL, no act may exceed what the directing human could do directly (rung A8).
The security property is "one op ↔ one (task, verb, subject)" — NOT "one credential ↔ one task";
many credentials per task is correct (writeScoped mints per tool call). uq_agent_task_one_live_turn
(0006:165-166) makes each chat turn a fresh task ⇒ fresh keys ⇒ fresh measurement; the attended
lane is strictly TIGHTER than the clocked one (shorter-lived tasks).

## 2. The twelve rows (Q2)

`('interactive_client', wake_xxx)` × 12 — extend-only. Precedent for the multi-domain kind:
0107:257, 0131:1450, 0129:1155. EXECUTE grants: NONE needed — the twelve already grant
clara_wake_interactive (0138:2539-2551) and withWriteWakeScoped SET ROLEs to exactly that role
(pools.mjs:476); prove with a positive-control cell, not an assumption. All twelve are VOLATILE and
write receipts (the six reads included) ⇒ every close tool rides withWriteWakeScoped, never
readScoped. Open all twelve; A8 does the narrowing (law-71 verbatim, fa4-pr1c-fix-order:11-24 —
human-reserved acts are exactly finalize/reopen/attest/settle). `wake_establish_prepayment_schedule`
is absent only from this new `interactive_client` roster: 0140 ended its `close_prep` park
(`0140:4531`) and inserted that kind's row at `0140:3685`. A8's closed-map `else` still fails
`attended_close_verb_unmapped` if an attended row appears without a ruling.

## 3. The card (Q3)

```ts
export type CloseActReceiptPart = {
  type: "close_act_receipt";
  receipt_id: string;   // clara.agent_act_receipts.id — the address
  client_id: string;    // list_agent_act_receipts' own p_client; NOT NULL
  created_at: string;   // read-narrowing hint ONLY (p_since); never trusted as truth
};
```
Deliberately absent (docblock states it): act_kind, verdict, rationale, rung_vector, subject refs —
all DB-owned outcomes; the wire carries an ADDRESS, the DB owns the answer (PRD §6 / constraint 2).
One generic kind for all twelve verbs (裁-96①). created_at earns its place: no single-row getter
exists, so the card fetches with p_since = created_at and picks by id (the close_proposal fallback
idiom, V16ActCards.tsx:327-330).
Hydration: runtime emits in chatTurn.v17.impl.ts after every close tool call — receipt id present on
BOTH verdicts (every agent core returns jsonb with receipt_id, 0138:2098-2108 et al; a REFUSED act
also renders a card, the point of F-A4). Web: useHydratedPart → listAgentActReceipts(client_id,
created_at) → find by receipt_id; card = CloseActReceiptCard in V17Cards.tsx modelled on
AgentReceiptCard (V16Cards.tsx:88-148); MalformedPart on wire/hydrated client mismatch
(V16Cards.tsx:102-104 idiom); null row → HydrateState "not found". Shows verb, verdict badge,
subject link, model+version, rationale, rung_vector on refusal — all hydrated.

## 4. Battery + mutant panel (Q4)

Cells: (1) cross-task staleness BOTH directions (task A's op_key under task B → CLR10
op_key_not_derived; task A's credential on a task-B call → receipt records A, B-derived key
refused); (2) A8 no-op on the clocked lane — close_prep credential (obo NULL) walks all twelve as
today, byte-compared against the pre-migration body; (3) A8 bites attended — bookkeeper WITHOUT
close_and_attest refused on begin_close, granted → succeeds; REAL grant/revoke on a live rig with a
positive control; same for admin on open_fiscal_year; (4) refused-credential trio: plain
interactive → refused at the ALLOWLIST wall (CLR03, no structured detail — see the 2026-09-01
correction below, not `wake_client_pin_mismatch`); interactive_client via plain mint (no task) →
CLR03 wake_task_unbound; NULL obo → CLR10; (5) task-kind/liveness: wake/close_prep task id → CLR11;
completed chat task → refused; (6) cross-tenant: foreign fiscal year → CLR11; wrong client →
wake_client_pin_mismatch; (7) two-door drift: both minters driven through the same four congruence
facts, identical refusal tokens; (8) the law-71 census re-run UNCHANGED + new arms: interactive_client
reaches ZERO of finalize/reopen/attest/settle/hold/release; (9) card emission: acted + refused each
emit exactly one part with the returned receipt_id; web card hydrates a planted row; client mismatch
→ MalformedPart. (10) task-director binding: a Bob-authored turn minted on behalf of Alice (both
bookkeeper+) → CLR11 `wake_task_director_mismatch`; Bob/Bob succeeds.
Mutant panel (each OUTSIDE any walked list; MUST-NOT-RED controls named): M1 drop A8's obo-condition
→ cell 2 reds; M2 A8 checks agent_user_id() instead of the director → cell 3 reds (the plausible
wrong implementation); M3 relax the kind check → cell 5 reds; M4 drop the liveness rung → cell 5's
completed-task arm reds; M5 hash only (verb,subject) in _close_expected_op_key → cell 1 reds while
cells 2 and 8 MUST stay green.

**2026-09-01 correction (owner ruling, via the PR-A driver's second STOP):** cell 4's first arm
originally read "plain interactive → wake_client_pin_mismatch." That refusal is UNREACHABLE under
the rung order this design mandates stays unchanged: `_close_wake_ctx` calls
`clara.assert_wake_allowed(w.wake_kind, p_verb)` (the allowlist wall) BEFORE the client-pin check,
and `wake_fn_allowlist` carries rows only for `close_prep` (today) and `interactive_client` (this
PR) against the twelve close verbs — never `interactive`. So a plain `interactive` credential is
refused at the ALLOWLIST wall (`assert_wake_allowed`, `packages/db/migrations/0004_governed_fns.sql:
114-121`: `raise exception 'wake kind % may not call %' using errcode='CLR03'`, with NO `detail`
argument at all) and never reaches the client-pin rung (whose own CLR03 DOES carry
`detail='{"reason":"wake_client_pin_mismatch"}'`, 0138:1296-1300). Both walls raise the same
SQLSTATE, so the battery's arm must pin WHICH wall fired, not just the SQLSTATE: assert
`errcode = CLR03` AND the structured `detail`/`reason` is ABSENT (equivalently, the message matches
the allowlist's "wake kind % may not call %" shape) — never merely "some CLR03 was raised." This
makes a future regression that adds an `interactive` allowlist row (pushing the refusal down to the
client-pin wall, now WITH a detail) RED on this cell instead of sliding through on the shared
SQLSTATE. The other two arms of the trio are unaffected — both involve credentials that DO pass the
allowlist check, so they reach the rungs the design always intended.

**Behaviour change on a live lane (2026-09-01, PR #490 review):** the shipped v16 chat lane's
legacy `interactive_client` credential has non-NULL `on_behalf_of` but no `agent_task_id`. Before
these twelve rows it stopped uniformly at W2/CLR03; now it can expose the director's A8 result as
CLR04 before still failing closed at W5/CLR03 `wake_task_unbound`. No authority opens, but the
refusal code can reveal the directing human's rank/capability bucket, so the shape change is explicit.

**Amendment #3 (2026-09-01, owner-ratified batch rung-order audit, via the PR-A driver).** STOPs 2
and 3 both traced to the same root cause: a cell's expected refusal token was written without
tracing which wall actually fires first. Rather than keep finding these one at a time, every §4
cell was audited against the MEASURED rung order below. Going forward this table is the audit
surface — trace against it, never re-derive it from the source by eye.

**The W-sequence — `clara._close_wake_ctx(p_verb, p_subject_kind, p_subject_id, p_op_key)`, shipped
0138 body UNMODIFIED plus this PR's A8 insertion at its actual written position:**

| # | Rung | Code | `reason` (or bare message) | Fires when |
|---|---|---|---|---|
| W1 | `wake_context()` resolution | CLR03 | `no_wake_credential` | `w.credential_id is null` — bad/expired/revoked secret, OR (for an attended credential) `wake_context()`'s own liveness predicate finds `on_behalf_of` no longer an active bookkeeper+ |
| W2 | `assert_wake_allowed(w.wake_kind, p_verb)` | CLR03 | NONE — bare `'wake kind % may not call %'`, no `detail` argument at all | `(wake_kind, verb)` has no `wake_fn_allowlist` row |
| **W3 (NEW, A8)** | `_assert_attended_close_floor(p_verb, w.firm_id, w.on_behalf_of)` | CLR04 | `insufficient_role` or `capability_missing` | **ONLY evaluated when `w.on_behalf_of IS NOT NULL`** — unconditionally SKIPPED (true no-op) when NULL, which is what makes cell 2 hold |
| W4 | client pin (`_close_subject_client` vs `w.client_id`) | CLR03 | `wake_client_pin_mismatch` | subject's resolved client ≠ the credential's pinned client (or either is null) |
| W5 | task bound (`_wake_task_id()`) | CLR03 | `wake_task_unbound` | credential carries no `agent_task_id` |
| W6 | op_key nonempty | CLR10 | `invalid_request` / class `op_key` / constraint `nonempty` | supplied op_key blank/null |
| W7 | op_key derived (`_close_expected_op_key`) | CLR10 | `op_key_not_derived` | supplied op_key ≠ sha256(the REAL `_wake_task_id()`-bound task ‖ verb ‖ subject) |
| W8 | firm check (subject's `clients.firm_id` vs `w.firm_id`) | CLR11 | `fiscal_year_not_in_firm` | STRUCTURALLY UNREACHABLE via the credential-pin path, for any subject kind — see cell 6 below. LEFT UNTOUCHED (PR-1c inheritance, not this PR's to fix), added to the standing follow-up ledger for a dedicated pass |

**The M-sequence — `clara.mint_chat_close_credential(p_firm, p_client, p_agent_task, p_on_behalf_of,
p_ttl)`, this PR, new:**

| # | Rung | Code | `reason` (or bare message) |
|---|---|---|---|
| M1 | firm exists | CLR10 | NONE — bare `'unknown firm'` |
| M2 | `on_behalf_of` not null | CLR10 | `on_behalf_of_required` |
| M3 | `on_behalf_of` active bookkeeper+ of the firm | CLR10 | `on_behalf_of_incongruent` |
| M4 | client firm-congruent + active | CLR10 | `interactive_client_client_incongruent` |
| M5 | `agent_task` not null | CLR10 | `wake_task_unbound` |
| M6 | `_assert_wake_task_congruent`: task firm/client/kind | CLR11 | `wake_task_incongruent` |
| M7 | `_assert_wake_task_congruent`: task `created_by` equals `on_behalf_of` (`IS DISTINCT FROM`, never nullable `<>`) | CLR11 | `wake_task_director_mismatch` |
| M8 | task `status in ('queued','running','awaiting_input')` | CLR13 | `wake_task_not_live` (precedent: `0006_runtime_core.sql:161`'s own note that the ingress maps the one-live-turn 23505 to CLR13 — the task-lifecycle-conflict code) |
| M9 | mint succeeds | — | — |

**NORMATIVE BATTERY CONSTRAINTS (fixture MUST, not prose advice — a fixture that stalls at an
earlier wall than the one it means to exercise is the false-confidence class: it still goes green,
having proved nothing about the wall it names).**

- **CONSTRAINT A (cells 1, 4 arm 2, 6 both arms):** any cell whose target wall is W4 or later on an
  ATTENDED credential MUST either (i) drive the call through a verb in W3's viewer/no-op bucket (the
  six reads only, corrected below), so A8 passes trivially regardless of the
  director's rank, or (ii) mint the test credential with an `on_behalf_of` whose rank/capability is
  independently verified to satisfy A8 for the exact verb under test. Skipping this check is exactly
  how cell 6 became a STOP: a plausible fixture reaches W3 first and the intended wall is never
  exercised.
- **CONSTRAINT B (cell 4 arm 2 specifically):** mint the "interactive_client via plain mint, no task"
  probe with `on_behalf_of = NULL` through the legacy 5-arg `mint_wake_credential` (legal — that
  minter's `interactive_client` arm keeps the general `on_behalf_of`-if-supplied check but does not
  REQUIRE one). This is not a product-flow simulation — every REAL chat credential is minted through
  `mint_chat_close_credential`, whose M2 makes `on_behalf_of` mandatory — it is a deliberate, legal
  test isolation of wall W5 alone, satisfying Constraint A by construction (W3 is skipped, not merely
  satisfied) rather than by picking a lucky verb.

**Cell-by-cell corrections and pins, this amendment:**

- **Cell 4 arm 1** (plain interactive): already corrected above (STOP 2) — W2, CLR03, no detail.
  Unchanged by this amendment.
- **Cell 4 arm 2** (interactive_client via plain mint, no task): text unchanged (CLR03
  `wake_task_unbound`, wall W5) — Constraint B above is now the normative construction rule, not an
  aside.
- **Cell 5 arm 2** (completed chat task): PIN the code explicitly — CLR13 `wake_task_not_live` (wall
  M7), rather than the unpinned "refused" the original text left implicit.
- **Cell 6, BOTH arms** (foreign fiscal year; wrong client): BOTH now read CLR03
  `wake_client_pin_mismatch` at wall W4. The foreign-fiscal-year probe MUST be byte-indistinguishable
  from the wrong-client probe — same code, same `detail`, same message — so a caller can never learn
  from the refusal shape alone whether a guessed fiscal-year id exists in a foreign firm or does not
  exist at all (no existence leak). Constraint A applies to both arms. Wall W8 (CLR11) is
  structurally unreachable via this path (see the W-sequence table) and this PR does not touch, test,
  or attempt to make it reachable — whether it is defense-in-depth or dead code in the shipped PR-1c
  body is out of this PR's scope, tracked on the standing follow-up ledger.
- **Cell 7** (two-door drift), equality-mode clarified: "identical refusal tokens" is BYTE-EQUALITY
  for the bad-firm check (bare CLR10 `'unknown firm'`, no detail, identical in both minters) and for
  the task-bound and task-congruence facts (CLR10 `wake_task_unbound` byte-identical; CLR11
  `wake_task_incongruent` byte-identical BY CONSTRUCTION, since `mint_chat_close_credential` calls
  the shared `_assert_wake_task_congruent` and `mint_wake_credential_for_task`'s own untouched inline
  check is proven equivalent, not identical code). The bad-client fact is CODE-AND-SHAPE equality
  (CLR10, an `_client_incongruent`-suffixed reason) but NOT string equality — the reason text is
  kind-named (`close_prep_client_incongruent` vs `interactive_client_client_incongruent`), matching
  the estate's own established per-kind wording convention (autodraft/bank_agent/close_prep each
  already carry their own worded reason in the legacy minter). The cell must assert this distinction
  explicitly rather than attempt a doomed byte-equality check across all four facts uniformly.
- **Cell 9** (card emission): deferred to PR B, with the conflation warning on record — Tier A raises
  (every wall W1-W8 above) write no receipt and reach no card by design ("Tier A raises, writes
  nothing"); PR B's own battery must not conflate a Tier-A raise with a Tier-B/C receipted business
  refusal when proving the card emits.
- **Mutants M1-M5**: confirmed, no rung-order corrections needed — each mutant's fired/not-fired
  signal depends on logic content the mutant changes, not on wall ordering. MUST-NOT-RED controls as
  originally stated: M1 leaves cell 8 untouched; M2 leaves cell 2 untouched (its guard condition is
  keyed on the real `on_behalf_of`, which M2 does not touch); M3/M4 leave every cell but 5 untouched;
  M5 leaves cells 2 and 8 green.

**2026-09-01 SECOND CORRECTION WITHIN AMENDMENT #3 (PR #490 opus review, owner-ruled):** the prior
paragraph moved `wake_mint_month_snapshot` from the implementation's original bookkeeper/no-capability
arm into the viewer arm. That ruling was wrong; the original placement was correct. §1(3)'s
"mint_month_snapshot and the six reads have no gap" premise was a false measurement: the human twin
`mint_month_snapshot` opens `_human_ctx(role_rank('bookkeeper'))` at `0120:1439`, while the agent
path converges at `0138:2451` from `_agent_mint_month_snapshot_core` onto the SAME
`_mint_month_snapshot_core` writer used by that human door. The A8 path therefore cannot gate the
identical write lighter than bookkeeper. This reversal preserves the wrong ruling in the record
rather than silently editing it away. The corrected closed map is:

- **viewer, no capability** — the six reads only: `wake_list_fiscal_years`,
  `wake_get_close_plan`, `wake_get_close_readiness`, `wake_verify_close`, `wake_snapshot_state`,
  `wake_dry_run_close_readiness`.
- **admin, no capability** — `wake_open_fiscal_year` (裁-100①).
- **bookkeeper, `close_and_attest`** — `wake_begin_close`, `wake_abandon_close`.
- **bookkeeper, no capability** — `wake_propose_close`, `wake_run_depreciation_catchup`, and
  `wake_mint_month_snapshot` — three verbs.

Twelve verbs, four buckets (6/1/2/3), zero duplicates. The viewer arm is not behaviourally
testable for an under-floor: mint-time M3 already forces every attended director to bookkeeper+.
The migration tail therefore censuses every verb exactly once and pins the complete grouping;
no battery cell is claimed as coverage for this specific floor.

## 5. PR topology (Q5) + file list

**PR A — DB, targets main directly (independent of #485; can start immediately).**
Migration (number at merge; stem f_a4_pr_2c_close_chat_lane): _assert_wake_task_congruent,
_assert_attended_close_floor, mint_chat_close_credential, the _close_wake_ctx CoR (A8), 12 rows,
one clara_runtime grant, census tail. + f-a4-pr2c-chat-lane.test.mjs (the battery) + the
f-a4-pr1c-walls-census interactive_client arms + rig-meta.mjs (clara_runtime roster,
F_A4_PR1C_RUNTIME_FNS region :1067/:1504) + x42-s5-helpers.mjs (clock roster,
F_A4_PR1C_CLOCK_NAMES :361-364 — statement_timestamp() + p_ttl like its sibling).
Ladder: full ADR-061 + opus review + Codex read-only leg (law 28, auth surface).

**PR B — runtime + web, stacks on #485, merges after PR A.**
Runtime: wake-mints.mjs new export mintChatCloseCredential; chatTurn.v17 closure gains the twelve
tools + closeScoped in v17.infra.ts (task-bound analogue of questionScoped — refuse without
clientId, mint through the new door alone); registry + freeze registration; p6-1-chatturn-v17 tests.
Do NOT add close_act_receipt to PRODUCED_ELSEWHERE_PART_KINDS — the runtime genuinely constructs it;
the parity gate must bite.
Web: types.ts field-for-field transcription (cite the v17 blob sha per house style :181-183);
V17Cards.tsx CloseActReceiptCard; PartRenderer branch; catalog.ts fixtures + entry; catalog.test.tsx
count 26→27 (:102-139). No new read/door/grant.
Ladder: opus review + Playwright e2e leg (frontend train).
REVIEW CHECKLIST NOTE: field-for-field parity between declarer and reader is convention + review
only — check-parts-parity compares kind NAMES, never fields; put the field diff on the checklist.

## 6. Acceptance

1. A client-pinned chat turn calls all twelve; each writes exactly one agent_act_receipts row with
   via_wake_kind='interactive_client', on_behalf_of = the director, wake_task_id = the turn's task.
2. The clocked close_prep lane byte-unchanged — proven by re-running the F-A4 PR-1c battery, not
   asserted.
3. Every escalation cell refuses (no-capability, wrong-rank, unbound, client-less, foreign-task,
   dead-task).
4. Cross-task staleness refused both directions.
5. Law-71 census green with the new arms; the four human doors unreachable from every wake role.
6. close_act_receipt renders a resolved card on both verdicts against a real rig row; client
   mismatch → MalformedPart.
7. Mutant panel: five REDs on target, MUST-NOT-RED controls green.

Units: PR A ≈2 (Codex xhigh) · PR B runtime ≈2 (Codex xhigh) · PR B web ≈0.5 (sonnet xhigh)
+ 1 opus review per PR + Codex leg on PR A + Playwright on PR B.
