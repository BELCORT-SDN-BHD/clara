# Brief: #657 — 把银行证据匹配到已有入账，避免重复现金分录 (match bank evidence to an already-approved booking, no second cash journal)

## Orchestrator decisions (binding)

- **Migration `0226` only**, ONE file `packages/db/migrations/0226_bank_match_evidence.sql` (DECISIONS §2, row 0226).
  **Creates**: `clara.get_bank_line_matching_context(p_line uuid) returns jsonb` — SECURITY DEFINER, `search_path = clara, pg_temp`,
  `_human_ctx(clara.role_rank('bookkeeper'))`, firm from the session, EXECUTE to `clara_authenticated` only; the granted wrapper over the
  **ungranted** `clara._wdb_line_booking_block(p_line uuid, p_exclude_match uuid default null, p_exception uuid default null)`
  (`0044:2459`, `revoke … from public` at `0044:2780` — grant the wrapper, never the block);
  and ONE ungranted total helper `clara._bank_op_key_task(p_op_key text) returns uuid` (IMMUTABLE STRICT; field 2 of the key, uuid-regex guarded, NULL when absent).
  **Recuts** (every pin MEASURED on your rig off `pg_proc.prosrc`, never transcribed — §2.2, SYNTHESIS §7.4 #1 and K4):
  `list_bank_match_candidates(uuid,uuid)` (`0038:8010-8054`, no splice) **AND its verbatim twin inlined in** `_agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)`
  (create at `0121:5697`, under the H2-finding comment block `0121:5682-5696`; the candidate copy is `0121:5735-5771`) — both in this one file, tail asserts field parity;
  `_match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)`
  (extracted by `0119`, **live body recut whole at `0121:1863`** via `create or replace` — 0038's text is NOT the live body) for the richer `_finish_op`;
  `_agent_verify_inputs_digest` **DROP+CREATE** (2-arg `0121:5026` → 3-arg created at `0129:1038`; the whole ceremony is `0129:1023-1058`) replacing the
  `split_part(coalesce(p_op_key,''), ':', 2)` task derivation (`0129:1048`) and the `split_part(r.op_key, ':', 2)` comparison site (`0129:1052`)
  with a structured task binding, **plus 0129's caller loop over the thirteen `_agent_*_core` bodies (`0129:1063-1106`, roster `0129:1067-1081`), every post-image sha asserted in the tail**;
  and — orchestrator refinement inside #657's own disjoint family, not a contradiction of §2 — `_agent_bank_receipt(uuid,uuid,text,text,uuid,text,jsonb,text,text,jsonb,timestamptz)`
  (created `0121:4953`, CoR-patched `0129:922-995`, CoR-patched again `0134:106` onward) so the binding is **stored**, not re-parsed.
  **Tail**: owner `clara_fn_owner` / SECURITY DEFINER / fixed `search_path` / ACL re-proved byte-for-byte for every touched body; the candidate-projection parity
  assertion; the three lock-order literals re-asserted; **and this file's OWN single-`pg_proc`-row census over every name it installs AND every name it recuts** — the
  earlier censuses (`0119:210-218`, `0129:1197-1199`, `0103:1055-1070`, `0040:6776-6781`) are `do` blocks that run at THEIR file's position in the chain and cannot see
  0226, which is exactly why DECISIONS §2.2 makes every new migration write its own. **Gate module**
  `packages/db/tests/bank-match-evidence-preintegration-gate.mjs` (stem matches `_bank_match_evidence$`, mirrors `preview-invite-preintegration-gate.mjs` verbatim),
  appended to `packages/db/package.json`'s 40-flag chain in MIGRATION order after `--import ./tests/preview-invite-preintegration-gate.mjs` (measured: 40 flags today, that one last).
  **`rig-meta.mjs` cohort**: one 0226 block; the new read joins the roster beside `BANK_0038_COHORT` (`rig-meta.mjs:611-639`; read fns `:623-626`, ungranted fns `:627-635`),
  with `_wdb_line_booking_block` and `_bank_op_key_task` declared UNGRANTED the 0020 way (`rig-meta.mjs:615-616`). This registration is not paperwork: `operation-census.test.mjs`
  fails on a granted routine no cohort in `rig-meta.mjs` claims, and on a lane calling an owner-only internal.
- **NO frozen successor, and that is a measurement, not a preference** (DECISIONS §1.1: "no `bankAgent_v2` (#657 rides `_agent_get_bank_pack_core`'s jsonb)";
  #657 appears in **no** row of §1.2; SYNTHESIS.md:127 agrees). Everything this ticket needs lands BELOW the frozen boundary: the pack rides through as `Record<string, unknown>`
  (`chatTurn.v14.bank.ts:79`), the act result rides through verbatim (`:77`, classifier `:85` onward), a new refusal reason is data. **You write no successor-contract stanza**, cut no
  `_vN`, edit no file in a frozen closure (the four v14 bank files are pinned at repo-root `frozen-workflows.json:554-573` — `chatTurn.v14.bank.ts` `:554`, `bankActs.ts` `:559`,
  `bankActs2.ts` `:564`, `bankSchemas.ts` `:569`), and add **no new runtime module**.
  `wake_match_bank_line`'s signature is untouched, so `wake_fn_allowlist`, `assert_wake_allowed` and the `clara_wake_interactive` grant (`0130:89`) are all untouched.
  What ships now = the whole slice.
- **D14** (binding): the pending line is a **derived, stores-nothing, self-clearing** row — **no new `accounting_work.purpose`** (the Work-lane door's closed purpose IN-list, `0195:1711`),
  **no new table**, **no Work/question object**; #657 writes the mechanics into `CONTEXT.md` as *Settlement candidate row* and is its first instance; #947/#949 are the mirror; #938 is a
  neighbour on the roster, not the family (DECISIONS §6 "§4 (#657 vs #949)" — supersedes gap-657 Q1's hedge). **B3's write path is NOT built this wave** — a named
  residual (supersedes gap-657 Q6's open framing); B3's page already exists (`work-detail.tsx:545`, `:567-647`) and the missing piece is the entrance, which is
  `clara_runtime`-only and refuses without a *running* accounting-work task (`0180:686`, `:607`, `:609-611`, `:613-615`, `:641-642`).
  **All six `/bank` sub-pages become URL-addressable.**
- **D15** (binding): **one decision, one key** on the human bank lane — derived from a **hash of the intent tuple**, never a mutable ref; and the agent lane's `split_part`
  becomes a structured task binding, re-patching the thirteen cores with every sha measured and asserted in the tail.
- **NO new `REVIEW_QUEUE_ROW_KINDS` kind this wave** (DECISIONS §3, rule carried from 2026-09-15 §1.6): #657's pending line renders **on the bank surface**; it may ride an
  EXISTING kind if one fits, otherwise it is a **named residual**. Do not add a literal to `lib/firm/needs-you.ts:97-117`.
- **Q3 / SYNTHESIS J2 ruled** (SYNTHESIS.md:564): show a **deterministic basis, never a score** — `{amount_exact, date_delta_days, counterparty_match:'id'|'name'|'none', class_hint}` plus the
  agent's own eight-rung vector (`0121:5875-6002`) rendered as-is. Do **not** revive `list_bank_line_suggestions` (dropped whole at `0129:395`) or introduce any 0–1
  confidence number; #665's AC3 is retiring classifiers and the two tickets must not fight.
- **Q4 / SYNTHESIS J3 ruled** (SYNTHESIS.md:565): the human read and the pack's inlined copy move **in this one migration**, with a **tail assertion** that the two candidate projections are
  field-identical modulo the firm/ctx binding. Do **not** extract a shared core this wave (that moves `_human_ctx`'s layering — 0119-scale surgery).
- **Ownership (DECISIONS §3, DECISIONS.md:113)**: you OWN `apps/web/components/bank/*` and `apps/web/lib/bank/*` (all five `*-doors.ts`) — **nobody else touches `/bank` this wave**
  (#660 may add ONE sentence to `client-bank-summary.tsx`, SYNTHESIS.md:362). `apps/web/components/bank/action-refusal.tsx` is **inside your lane** despite its Clara-ish name — it is a
  bank component, not a `components/clara/*` one. You commit
  your own `apps/web/package.json` + lockfile change for `ui:add combobox`/`popover` (§3.1 amendment; the integration worker resolves the lockfile ONCE).
  **Do NOT open**: `components/work/work-detail.tsx` (#658 owns the Sources tab, #655 one link block, #636 one row), `client-workspace-overview.tsx` / `client-home/*` (#660),
  `components/clara/*` and `lib/parts/*` (#642 — you register **no** part kind), `lib/firm/needs-you.ts` row kinds, `lib/journals/api.ts` (#655), firm Home (#659),
  `packages/runtime/workflows/registry.ts`, and any frozen module. **Shared files: one line each, at the sorted position** — `apps/web/test/manifest.txt`,
  `apps/web/messages/en.json`, `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`, `packages/db/tests/rig-meta.mjs`, `packages/db/package.json`,
  `.github/actions/db-live-gates/action.yml`, `CONTEXT.md`. **No `lib/navigation/tree.ts` row** (no new route; `/bank` stays
  `{ id: "bank", segment: "bank", labelKey: "accounting.bank", icon: "bank", minimumRole: "viewer" }`, `tree.ts:379`).
- **CONTEXT.md terms you write**, in the house "term / _Avoid_" shape — and the citation is split because the authority is:
  - **Ratified by DECISIONS §3.1 (DECISIONS.md:126-128), mandatory**: **Settlement candidate row** (derived, stores nothing, offers candidates and never chooses,
    self-clearing — the shape #938/#947/#949 inherit) and **Match basis** (deterministic evidence, never a score).
  - **Proposed by gap-657.md's own Docs section, NOT ratified by DECISIONS**, and admitted only under DECISIONS §3.1's closing sentence — *"Every other addition is a
    refinement the integrator unions at its sorted position"* (DECISIONS.md:135-136): **Bank match**, **Statement line**, **Remaining capacity**, **Bank line exception**,
    and the extension of the existing **Settlement allocation** entry (`CONTEXT.md:411-413`, whose *Avoid* at `:413` already reads *"A new cash movement merely because an
    existing movement is matched"* — this ticket is that line's enforcement). Write them as refinements; if the integrator's union rejects one, drop it and name it, do not argue.
- **Boundaries** (DECISIONS §3.2 + SYNTHESIS §4): #655 **births** the open item, #657 **allocates** and ships **no settlement door** (SYNTHESIS.md:439); #671 owns resolve-then-match, refunds and
  write-offs; #675 owns certification (H-14's certify half); #667 / #666 / #665 are **blocked by you** (SYNTHESIS.md:447) — you own the shared chassis and publish the no-new-cash **proof shape**
  as a reusable cell helper; #647 (closed) owns counterparty identity — you **consume** its canonical resolution and write no alias (2026-09-15 D11 stands). Open follow-ups
  named, never fixed: **#876** (filename/filing join), **#889** (`merge_counterparties` residue writers), **#905** (`list_accounting_work` is FROZEN this wave — SYNTHESIS.md:63, :379),
  **#866**, **#869**, **#865**.
- **Non-goals, stated in code comments AND in the report**: no suspense account, no write-off, no refund path, no parameter-loop bypass; no stored bank Work object and no new
  purpose; no B3 write path; no scoring/rules lane; no certification affordance; **no second GL-cash reader on your side** — your AC3 proof compares
  `list_bank_statements`' `tie.gl_balance_cents` (`0038:7942-7947`) before and after, and you add no other cash expression; no change to `settle_from_bank_line`'s contract;
  no hosted claims — write "hosted evidence pending" (DECISIONS §4).
  **Unratified, and you adopt it unilaterally**: gap-657.md:212 recommends ratifying `tie.gl_balance_cents` as *the* shared GL-cash definition with #660. **DECISIONS and
  SYNTHESIS never mention `gl_balance_cents` at all** (measured: zero matches in both files), so no such cross-ticket agreement exists. #660 independently ships
  `get_client_financial_pack`'s **book cash** over its new governed cash-account set (DECISIONS §2 row 0232; CONTEXT term *Book cash* — "never a statement balance",
  DECISIONS.md:130-131). It is safe for you: **#660 recuts nothing** (DECISIONS §2 row 0232, "Recuts: none"), so `list_bank_statements` cannot move under you. State in your
  report that two cash expressions now exist in the product and that nobody ruled them one — as a question for the owner, not as a settled fact.
- **Playwright port triple** (RIG.md, verbatim): `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3360 CLARA_E2E_NEXT_PORT=3361 CLARA_E2E_RUNTIME_PORT=3362`.
  **Rig row** (RIG.md:26): worktree `C:\Users\zhant\Desktop\clara-wt\657`, branch `impl/657-bank-existing-booking`, PG port **55707**, db **clara_657**, base `abcc5030`,
  219 migrations at `0224_preview_invite`, PG 17.11.

## 1. Current state

**DB.** The matching path is complete and live. `clara.match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)` (`0038:3817`, `clara_authenticated` only — `0038:5284`, `:5290-5296`)
is a thin wrapper over `_match_bank_line_core` since 0119; the live core body is `0121:1863`'s. It is the **only** live arity: 0040 added a 7-arg rule overload (`0040:5401`) and
0129 dropped it (`0129:396`), which is why 0040's "exactly TWO arities" census (`0040:6776-6781`) is a 0040-time fact, not a live one. Lock order JE `for update` →
`pg_advisory_xact_lock(203005004, client)` → lines `for update` → statements `for share` (`0038:3990-4002`), pinned as prosrc scans (`0040:6808-6842`) and re-asserted from the
test side by `x38.aa` (`x38-wave-c-b-match.test.mjs:1469`) against the literals `"order by je.id for update"` → `"pg_advisory_xact_lock(203005004"` → `"order by l.id for update"`.
Rereads under the lock: statement `live` else `wrong_period`; one bank account else `wrong_account`; line exclusivity else `already_matched`, re-raised from the index
`unique_violation` (`0038:4041-4051`); entry `approved`, `reversed_by`/`reversal_of` refused by name; per-side capacity minus every pending/live member on the same COA
(`0038:4132-4158`, `detail.side` = `debit`/`credit`); posting-date exception → `period_exception_unacknowledged`; settled period → `recon_period_settled` (`0040:2452-2515`).
The tie identity (Σ lines = Σ entry members, tolerance NONE) is **not** enforced inline in the door — it is the DEFERRED constraint trigger
`clara._tf_bank_match_group_tie()` (`0038:3249`; live arm `:3314-3326`, refusal `amount_beyond_tolerance`; wired on all three tables `:3330-3341`).
Idempotency is real: `_reserve_op` (`0004:46-60`) over `{client, lines, entries, adjustments, ack_period_exceptions}` (`0038:3949-3952`). With `p_adjustments = null` the door writes
`bank_matches`, the two member tables, `bank_match_audit`, one `domain_events` row and one `op_receipts` row and touches **no** `journal_entries` / `journal_lines` / `open_items` /
`open_item_allocations`. Its `_finish_op` payload is `{match_id, status, line_cents, entry_cents, adjustment_cents, adjustment_entry_ids, period_exceptions}` (`0038:4233-4238`).
Reads: `list_unmatched_lines(uuid)` (`0040:4099`, line facts `:4105-4109`, excludes open-excepted lines **by design** `:4117-4122`), `list_bank_match_candidates(uuid,uuid)`
(`0038:8010-8054` — `posting_date, memo, coding_kind, counterparty_id, high_stakes` **hardcoded `false` at `0038:8025`**, `debit/credit_remaining_cents`; **no counterparty name, no
history, no basis**), `list_bank_statements` (`0038:7923-7957`; header/lineage projection `:7932-7940`, `tie.gl_balance_cents` `:7942-7947`, `tie.unmatched_cents` `:7948-7952`),
`get_bank_statement` (`0038:7959`). `bank_statements` carries `source_doc_sha256` (`0038:375`) that no read emits. Agent lane: `_agent_get_bank_pack_core` (`0121:5697`)
**inlines both read bodies verbatim** (`:5714-5734` lines, `:5735-5771` candidates) because the public reads call `_human_ctx`; `learned_payers`/`recon_terms` are literal
`{"not_implemented": true}` (`:5781-5782`); the pack's own digest hashes the WHOLE pack (`:5785`); `_agent_match_bank_line_core` (`0121:5844`) runs the eight-rung vector
(`:5875-6002`; ambiguity rung `same_amount_ambiguous` `:5907-5923`) then delegates (`:6012-6015`).
`_wdb_line_booking_block` (`0044:2459-2779`) already returns `{reason:'exception_booking_outstanding', blocking, exception_id, line_id, bookings[{entry_id, match_id, match_status,
orphaned, caused_by, reverse_blocked_by, remedy_calls, advance_reversal, advance_release}], remedy}` — ungranted (`0044:2780`), **zero consumers in `apps/web` or
`packages/runtime`**. `_agent_verify_inputs_digest(uuid,text,text)` (created `0129:1038`, ceremony `0129:1023-1058`) binds a prior `pack_read` receipt by deriving the task with
`split_part(coalesce(p_op_key,''), ':', 2)` (`0129:1048`) and comparing with `split_part(r.op_key, ':', 2)` (`0129:1052`).
`_agent_bank_receipt` (`0121:4953`) is the **sole** writer of `clara.bank_agent_receipts` (its INSERT column list `0121:4979-4981`, VALUES `:4982-4985` — replaced wholesale by
0129's provenance substitution — `on conflict (firm_id, op_key) do nothing` `:4990`) and it never writes `bank_agent_receipts.wake_task_id` (the column exists, `0121:4370`).
The only two writers of `wake_credentials.agent_task_id` are pinned as an exact closure at `0159:518-529` (`mint_wake_credential_for_task`, `mint_chat_close_credential`)
— **so `clara._wake_task_id()` (`0138:781`, ungranted `:800`) resolves NULL on this lane**, because the bank chat credential is
minted by `clara.mint_wake_credential('interactive_client', …)` (`packages/runtime/lib/pools.mjs:484-492`, through `bankScoped`, `chatTurn.v14.infra.ts:89-98`).
`bank_agent_receipts` is append-only (`0121:4407-4410`), so no backfill UPDATE is lawful.

**Runtime.** `chatTurn_v20` is the pin (`registry.ts:173`); the bank acts live in the frozen v14 closure (`frozen-workflows.json:554-573`). `runMatchBankLine`
(`chatTurn.v14.bankActs.ts:59-72`) calls `wake_match_bank_line` and returns `classifyBankResult`, which passes the DB's jsonb through verbatim (`chatTurn.v14.bank.ts:77`,
`:85` onward). `bankOpKey` = `bank-<verb>:<taskId>:<segment>:<stableJson>` (`chatTurn.v14.bank.ts:64-66`) — so field 2 IS the task id. `bankAgent_v1` is imported at
`registry.ts:63` and registered at `registry.ts:365`, but its wake source is seeded `enabled=false` with zero operator firms (`0133:1058`) — **the live agent lane is chat**
(`clara_wake_interactive`, `0130:89`). `packages/runtime/lib/matcher.mjs` is the document→client attribution consumer on the event spine, **not** the bank matcher.

**Web.** One route `/clients/:clientId/bank` → `BankWorkbench` (`bank-workbench.tsx`), a six-way **`useState`** sub-nav (`:24`) over
`TABS = ["accounts","statements","matching","exceptions","reconciliation","agency"]` (`:19` — the sixth id is `agency`, not `agent`), whose own comment calls it "a deliberate
simplification for this pass" (`:3-7`, the sentence at `:4-5`). `MatchingSection` (`matching-section.tsx`, 244 lines): a `<ul>/<li>` unmatched-line list rendering only
`entry_date · description · amount` (`:148`), bare `<input type="checkbox">` selection, a candidate `<li>` (`:180-196`) rendering `memo ?? entry_id · counterparty_name ?? "—"`
(`:182`) plus one `MoneyInput` (`:183-195`), an ack checkbox, a free-text unmatch-by-uuid form (`:206-239`), and `useHydratedPart().act()` (`:98-115`) reloading on success
**and** failure with an explicit candidate re-read (`:113`, comment `:111-112`). The bank account is derived **silently** from `selectedLines[0]` (`:55`) and the candidate read
hangs off it (`:56-65`). `lib/bank/match-doors.ts:26` is `const opKey = () => crypto.randomUUID()` — **a new key per call**. `match-types.ts:43-56` declares
`counterparty_name` (`:49`) and `high_stakes` (`:50`) that the DB never emits. `ExceptionsSection` names `matched_booking` as its own gap (`exceptions-section.tsx:9-10`). The
house's correct key shape is `useDecisionKey` (`work-cancel-dialog.tsx:92-106`; the `useDecisionDialog` wrapper `:53-70` with its header `:48-52` and the renewal inside
`onOpenChange` `:64-66`). Refusals already carry their discriminant end to end: `DoorRefusal`/`RefusalError` carries `reason` (`lib/doors.ts:41-44`) and `ActionRefusal` renders
`${clr.code} · ${clr.reason}` in the chip (`components/bank/action-refusal.tsx:43`). Primitives installed: `table.tsx`, `field.tsx`, `input-group.tsx`, `alert.tsx`, `empty.tsx`,
`skeleton.tsx`, `command.tsx`, `select.tsx`. **`combobox.tsx` and `popover.tsx` are NOT installed** (appendix D **row 18** — Combobox `None`, "Conditional: searchable
high-cardinality client, account, counterparty or document selection"; that row sits at file line 68). URL-as-truth precedent to copy: `registers-workbench.tsx:28-47`.

**Tests.** DB `x38-wave-c-b-match.test.mjs` (33 cells `x38.a`–`x38.ag` under real per-role sessions; `x38.a:211-233` group ties, `x38.g:387-460` the two-session line race,
`x38.x:1373` op-key replay, `x38.z:1450` authenticated-only, `x38.aa:1469` lock order, `x38.ab` cross-firm, `x38.ad:1714` SELECT-only grants; the counting helper `snap()` at
`:1420-1427`), `x40-wave-c-c-tieout.test.mjs`, `f-a3-pr1c-egress-bank-matching.test.mjs`, `f-a3-pr3-chatturn-v14-bank-parity.test.mjs:111-190`,
`x42-r7-af2-offpath.test.mjs:242` (`x42.r7-af2-7` — the behavioural proof that naming a pre-existing entry in an audit payload does not make the act its creator). Runtime
`g1-wake-bank-e2e.test.mjs:39` (a REAL `bank_agent` credential through the real wrapper stack; its `skip` is false whenever `clara.wake_engine_sources` exists —
`g1-wake-bodies.fixtures.mjs:21-27` — so it RUNS on your migrated rig). Web `matching-section.test.tsx` (2 cells, `:112`, `:165`), `bank-a11y.test.tsx` (2 axe cells), 12
`lib/bank/*.test.ts` (manifest `:51-54`, `:254-265`). **Playwright: none for matching** — `bank-close-registers-walk.spec.ts` covers close/registers only.

## 2. Gaps / rows

| Row | Disposition — and the evidence you must produce |
|---|---|
| **AC1** line/source facts beside candidate facts; ambiguous stay pending with one shared question | **partial → build in three parts.** (a) render the facts `list_unmatched_lines` already returns (`0040:4105-4109`) — walk leg. (b) candidate facts: the DB enrichment (`counterparty_name`, truthful `high_stakes`, bounded `match_history`) → `p657.db.candidate-enrichment`. (c) "one shared question": **D14 — no object**; a derived self-clearing candidate row on the bank surface plus the CONTEXT term; if no existing needs-you kind fits, a **named residual**. |
| **AC2** lock / reread / actionable refusal | **verify-only, re-measured on the redesigned surface.** Cite `0038:3990-4002`, `:4041-4051`, `:4132-4158`, `0040:2452-2515`; prove the refusal reaches the face verbatim with its code → `p657.web.refusal-verbatim` plus the walk's over-capacity leg. |
| **AC3** only the match allocation + receipt; before/after GL cash; no new journal or settlement object | **to build (the PROOF).** The behaviour is implemented; nothing asserts it → `p657.db.no-new-cash`, published as a reusable helper for #666/#667. |
| **AC4** duplicate click / lost response / retry → ONE receipt; concurrent capacity | **to build.** Web: the intent-hash key (D15) → three `p657.web.opkey-*` cells. DB: `p657.db.one-receipt-under-retry` (extends `x38.x`) and `p657.db.capacity-race` (**no cell today races two matches against ONE entry's remaining capacity**; build it in `x38.g`'s two-session shape). |
| **AC5** result links region / line / JE / allocation / counterparty / receipt + a no-new-cash explanation | **partial.** Build the persistent outcome block from the door's own `new_journal_entries: 0`; link line, JE, allocation, receipt op key, counterparty name. **Region: named residual** — 0038's lane contract states it verbatim ("per-line region citations are not carried", `0038:1758-1762`) and `bank_statement_lines` (`0038:537-572`) has no page/region column. |
| **AC6** account/period selection; filename, version lineage, line facts, processing coverage | **partial.** Lineage is already emitted (`0038:7932-7940`) — render it. Build: an explicit bank-account + statement-period selector on Matching (today it silently derives from `selectedLines[0]`, `matching-section.tsx:55`), the **filename** via `bank_statements.document_id → clara.documents.original_filename` (`0003:64-71`, column at `:69`) inside the new context read, and the coverage figures (`line_count`, `total_debit/credit_cents`, `tie.unmatched_cents`). **Page: the same named residual as AC5.** |
| **AC7** posting date, memo, counterparty, JE, capacity, history, confidence/basis, exact cents side by side | **to build.** Render what the enriched read returns; the **line-relative basis** comes from `get_bank_line_matching_context` (§3 item 3), never a score (Q3/J2). Residual arithmetic `Σ lines − Σ entries − Σ adjustments` shown before submit; the authority is the deferred tie trigger `_tf_bank_match_group_tie` (`0038:3249`, live arm `:3314-3326`, wired `:3330-3341`), never the client's own sum. |
| **AC8** a unique sufficient candidate completes; success states no new cash | **partial → build the face.** The operation exists; express "unique sufficient" on the human lane by surfacing the same fact the agent's `same_amount_ambiguous` rung uses (`0121:5907-5923`) — a **display**, not a new DB rung. |
| **AC9** ambiguous/missing/stale/over-capacity leave ONLY that line pending with one Work question; no bypass invented | **partial + named residual (D14).** The "no bypass" half is verify-only and defended by name (`0044:1887`, `:1895`; no suspense account exists in any bank verb). The "one Work question" half ships as the **derived candidate row**; B3's write path is **descoped** with its entrance measured (`0180:686`, `:607-615`, `:641-642`). Per-line isolation re-proved in the walk. |
| **AC10** retry → one receipt; permission/period/source-revision refusal + a current reread | **partial → build.** Retry half = AC4. Reread-before-new-intent is verify-only (`matching-section.tsx:98-115`, its own comment at `:111-112` "never trust the pre-match figures to still hold"). |
| **AC11** exact + one-cent difference, partial/multi-line/multi-entry, open-exception, no-duplicate-cash fixtures; narrow comparison, keyboard/focus, source trace | **partial.** DB coverage is strong (`x38.a/.b/.h/.i/.j/.x/.z/.aa/.ab`). Owed: the one-cent difference **as a difference** (the only token today is `amount_beyond_tolerance`, raised by the deferred tie trigger at `0038:3321-3326`), the no-duplicate-cash assertion (AC3), an open-exception fixture **from the face's side**, and keyboard/focus + source trace in the walk. |
| **AC12** a governing open exception keeps the line pending with an explicit LINKED recovery | **to build (matching side only).** Render `_wdb_line_booking_block`'s payload through the new wrapper; `remedy_calls` become links into the Exceptions tab; **never a resolve button here** (#671). Keep the line VISIBLE and pending although `list_unmatched_lines` excludes it (`0040:4117-4122`) — the context read is how it stays on screen. |
| **AC13** Table line/detail; Combobox for many candidates; Field/InputGroup for cents; inline Alert | **to build.** `table.tsx`/`field.tsx`/`input-group.tsx`/`alert.tsx` are installed; `combobox`+`popover` are not → `pnpm --filter @clara/web ui:add combobox --dry-run` first (appendix D row 18; `apps/web/scripts/ui-add.mjs` guards protected files). |
| **AC14** full state ladder, 320px, 200%, keyboard/focus return, SR names, reduced motion, stable URL/Back, drafts, persistent outcome | **to build.** Includes the six-way URL change (D14) and a **denied** state: `/bank` is `minimumRole: "viewer"` (`tree.ts:379`) while every bank read floors at bookkeeper — a viewer must meet one honest denial, not six error cascades. |
| **AC15** production-facing read/command under real least-privileged roles; label local vs hosted | **partial → extend.** The new battery drives `humanQuery` personas only; re-run `g1-wake-bank-e2e` and the v14 parity battery as inherited evidence; **no Workflow World leg is owed** (no Work object, no new runtime module). `bankAgent_v1` is dormant — any "for Clara" claim must come from the chat lane or it is not evidence. |
| **H-12** statement facts / header / institution / manual-input / terminal-settle preserved (historical FIXED; refresh REDESIGN) | **verify-only, re-measured on the redesigned surface** (`0038:455-466` the two lawful UPDATE shapes, `:468` `_tf_bank_statement_transition`, `:393-398` ingest-mode + human-actor CHECK, `:2211` `void_bank_statement`, `:3588` the void belt). The archived-statement path is outside this write set; real-document and hosted outcomes stay separately labelled. |
| **H-14** certify blocked by an opening difference (historical OPEN-VALID; refresh REDESIGN) | **descoped (authority): #675 owns reconciliation/certification.** #657 carries only the readiness consequence — a settled period refuses a new match by name (`recon_period_settled`, `0040:2470-2478`) — re-proved on the new surface. Build no certification affordance. |
| **C-40** named doors with no UI (CARRIES; REDESIGN) | **to build, narrowed to the matching side**: surface the governing exception on the line and render the recovery payload (`0044:2459-2779`). The reconciliation half is #675's; the refund/write-off half is #671's. |
| **C33.7** bank security · preserve; re-census subject/account/input digest at admission and commit | **verify-only + two NAMED residuals + one new cell.** Residual (a): the binding is CLIENT-scoped, **deliberately** not bank-account-scoped, with its reason at `0121:5018-5022` — an accepted non-goal, not an unbuilt one. Residual (b): `v_digest := coalesce(nullif(btrim(p_inputs_digest),''), p_op_key)` (`0121:4972`) still substitutes the key for a blank digest, unreachable only because every consuming core verifies first. Cell owed: `p657.db.digest-census`. |
| **C33.8** ONE stable operation-key schema; parser-free round trip, retries, attribution | **to build (the smallest half).** (a) the human lane's per-decision intent-hash key; (b) the structured task binding + the thirteen-core re-patch. **Do not unify all four schemas** (`chatTurn.v11.tools.ts:126-135`, `chatTurn.v14.bank.ts:64-66`, `bankAgent.v1.infra.ts:318-320`, `match-doors.ts:26`) — `members/doors.ts:58-66` mints a fresh key **on purpose**; that is its own ticket. Attribution is already structural (`bank_agent_receipts.acting_actor/on_behalf_of/via_wake_kind`, column list `0121:4980`). |

## 3. Slice (one branch)

**Migration `0226_bank_match_evidence.sql`**, written in this order: house header (spec of record #657 + this brief's binding section; the CONTEXT words) → **prestate pins**
(`0195:390-409` idiom: `sha256(convert_to(prosrc,'UTF8'))` off `pg_proc`, each compared to the value **you measured on `clara_657`**) for `list_bank_match_candidates(uuid,uuid)`,
`_agent_get_bank_pack_core(uuid,uuid,text,jsonb,text)`, `_match_bank_line_core(jsonb,uuid,jsonb,jsonb,jsonb,boolean,text)`, `_agent_verify_inputs_digest(uuid,text,text)` and
`_agent_bank_receipt(…11 args…)`, plus **non-regression** pins on `match_bank_line(uuid,jsonb,jsonb,jsonb,boolean,text)` and `_wdb_line_booking_block(uuid,uuid,uuid)` →
objects → grants → events → tail → gate module → cohort. (`0121:126-128` is the in-family precedent for pinning `_match_bank_line_core` by exact regprocedure.)

1. **Recut `list_bank_match_candidates(uuid,uuid)`** — same signature, same floor, same grant. Per candidate add: `counterparty_name` = the name of
   `clara._canonical_counterparty(p_client, <counterparty_id>)` (`0011:1316`, ungranted, definer-reachable) read from `clara.counterparties.name` (`0009:812-818`, column at `:818`),
   NULL-safe; `high_stakes` = `clara.is_high_stakes(entry_id)` (`0004:72`, recut `0009:1513`) replacing the hardcoded `false` at `0038:8025`; `match_history` = a **bounded** array
   (`order by acted_at desc limit 5`) of this entry's prior `bank_match_entry_members` ⋈ `bank_matches` ⋈ `bank_match_audit` rows on this COA, as
   `{match_id, status, matched_cents, acted_at}`. **Keep the 2-arg signature and add no defaulted parameter** — a new parameterisation is a NEW verb (§2.2), and the census that
   would have caught it (`0103:1055-1070`) runs at 0103, so the only thing that catches it is the census **you** write in 0226's own tail.
2. **Recut `_agent_get_bank_pack_core`'s inlined copy identically** (`0121:5735-5771`) — same three additions, same order, firm/ctx binding unchanged. The tail asserts the two
   candidate projections are field-identical (Q4/J3).
3. **New read `clara.get_bank_line_matching_context(p_line uuid) returns jsonb`** — bookkeeper floor, firm from the session, `clara_authenticated` only. Returns: the line's own
   facts; its statement header (`status`, `superseded_by`, `voided_by/at/reason`, `source_doc_sha256` — `0038:375`, present on the table and emitted by no read today — and
   `document_id`) **plus `documents.original_filename`** (`0003:69`); the coverage figures
   (`line_count`, `total_debit/credit_cents`, `tie.unmatched_cents`, `tie.gl_balance_cents`); the governing `bank_line_exceptions` row if any; **`_wdb_line_booking_block(p_line)`'s
   payload verbatim** (its two trailing parameters default to NULL, `0044:2459-2460`); and `candidate_basis[]` — one deterministic row per candidate entry of this line's bank account,
   `{entry_id, amount_exact, date_delta_days, counterparty_match, class_hint}`. **The basis lives here, not on the candidate read**, because a basis is a relation between a LINE
   and a CANDIDATE and `list_bank_match_candidates` has no line in scope; adding one would create exactly the overload §2.2 refuses. **Do not name
   `settlement_entry_id` / `charge_entry_id` / `adjustment_entry_ids` in this body** — `0044:2916-2930` (roster `:2929-2930`, enforcement `:3006-3012`, raise `:3014-3017`) reads those
   three literals as "this act BUILT that entry" and exempts only four names (`_wdb_born_in_booking_act` plus `_settle_from_bank_line_core`, `complete_pending_match`,
   `match_bank_line`). **Measured caveat, and it is the reason this instruction is here rather than in a gate**: that census is a `do` block inside 0044, so it runs at 0044 in the
   chain and can never see a function 0226 creates. Nothing will catch you. The behavioural law it protects is real and is proved live by `x42.r7-af2-7`
   (`x42-r7-af2-offpath.test.mjs:242`). Honour it as a house law and say in the migration header that you did.
4. **Recut `_match_bank_line_core`** to enrich its `_finish_op` payload (the `0038:4233-4238` shape) with `entry_ids`, `line_ids`, `bank_account_id`, `account_code` and, when
   `p_adjustments` is empty, the explicit pair `"new_journal_entries": 0` / `"settlement_objects": 0` — the machine-readable form of AC3/AC5. **Change nothing else**: the three
   lock-order literals `"order by je.id for update"`, `"pg_advisory_xact_lock(203005004"`, `"order by l.id for update"` must survive in that order (`x38.aa`), all seventeen refusal
   tokens keep their spelling and their `detail.reason`, and the public 6-arg signature is untouched.
5. **C33.8's structured binding.** Create `clara._bank_op_key_task(text) returns uuid` (ungranted, IMMUTABLE STRICT, uuid-regex guarded, **total — it never raises**). DROP the
   pinned `_agent_verify_inputs_digest(uuid,text,text)` and CREATE `_agent_verify_inputs_digest(p_client uuid, p_digest text, p_task uuid)`; the derivation at `0129:1048` goes away
   and the comparison at `0129:1052` becomes
   `(p_task is null or coalesce(r.wake_task_id, clara._bank_op_key_task(r.op_key)) = p_task)` — **a typed comparison with no `split_part` at the comparison site**; the null-task
   fallback keeps today's exact semantics and must **not** be tightened (tightening it would refuse a live agent act whose pack was read seconds before the migration). Re-patch
   the **thirteen** call sites with 0129's own loop shape (`0129:1063-1106`, roster `:1067-1081`), replacing 0129's post-image target
   `perform clara._agent_verify_inputs_digest(<client>, p_inputs_digest, p_op_key); -- H2, C2`
   with `… coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key))); -- H2, C2, #657`, asserting the target occurs **exactly once** per body and the `AS $function$`
   split holds, and asserting **every post-image sha** in the tail. **Three of the thirteen bind `v_client`, not `p_client`** (`_agent_complete_bank_reconciliation_core`,
   `_agent_propose_line_exception_core`, `_agent_resolve_bank_line_exception_core`, `_agent_void_bank_reconciliation_core` — read the `|`-suffixed roster at `0129:1067-1081` and
   reproduce it, do not retype it). **If any core has diverged from 0129's shape, STOP and report instead of patching** (DECISIONS §2). Then
   CoR-patch `_agent_bank_receipt` in 0129/0134's own substring-anchored shape (`0129:922-995`, `0134:106` onward) with **two** anchored substitutions, each asserted to occur
   exactly once: (i) the INSERT **column list** (`0121:4979-4981`, untouched by 0129/0134) gains `wake_task_id`, and (ii) the **VALUES** tail — which is 0129's replacement text,
   not 0121's, so measure it — gains `coalesce(clara._wake_task_id(), clara._bank_op_key_task(p_op_key))` at the matching position. The round trip is then parser-free for every row
   written after 0226, while rows written before it keep the fallback, because the table is append-only (`0121:4407-4410`) and no backfill is lawful. **If either fragment does not
   occur exactly once, STOP**: ship the compare-time `coalesce` alone and name the residual.
6. **No new table, no new purpose, no posting-core recut, no new DML grant on any table.** Events registered with `ignore` (0055 idiom). Tail: owner / SECURITY DEFINER /
   `search_path` / ACL for every touched body; the candidate parity assertion; **exactly one `pg_proc` row for every name this file installs and every name it recuts**;
   `_wdb_line_booking_block` and `_bank_op_key_task` still hold **zero** grants.

**Runtime.** **No new module, no route edit, no `registry.ts` change, no successor.** Re-run `f-a3-pr3-chatturn-v14-bank-parity.test.mjs` and `g1-wake-bank-e2e.test.mjs`
**unchanged** as the evidence that the frozen lane still admits against the recut cores.

**Web** (no new route, no `tree.ts` row).
1. **`/bank`'s sub-nav becomes URL-as-truth for all six tabs** — copy `registers-workbench.tsx:28-47` exactly (`TABS` + `isTab` guard + `useSearchParams` +
   `router.replace(pathname + "?" + qs)`), default `accounts`, replacing `bank-workbench.tsx:24`'s `useState` and keeping the six ids from `bank-workbench.tsx:19` verbatim
   (`accounts`, `statements`, `matching`, `exceptions`, `reconciliation`, **`agency`**). Add `?line=<id>` for the Matching detail pane. **Multi-selection
   stays out of the URL** (a selection set is a draft, not an address). `router.replace` creates no history entry — the house's existing behaviour: reload-stability is what the
   walk asserts, and Back returns to the previous page.
2. **`MatchingSection` → a real line/detail composition**: `Table` for the unmatched-line report (date · description · inflow/outflow · amount · statement · class hint) with
   accessible row selection replacing the bare checkboxes, and a detail pane holding the source facts beside the candidate/result. An explicit **bank account + statement period
   selector** (AC6) replaces the silent `selectedLines[0]` derivation (`matching-section.tsx:55`).
3. **Candidate surface**: `Combobox` when the candidate set is large (install through `pnpm --filter @clara/web ui:add combobox --dry-run`, then for real, one component at a time;
   `popover` only if the registry says it is required), falling back to Table rows when the set is small; each row shows posting date, memo, counterparty **name**, JE reference,
   per-side remaining capacity, match history and the deterministic basis. `Field`/`FieldGroup`/`FieldLabel`/`FieldError` + `InputGroup` around the cents input (precedent
   `work-question-form.tsx:70`).
4. **The residual line, before submit**: `Σ statement − Σ selected − Σ adjustment = residual`, computed client-side for display only; the deferred tie trigger
   `_tf_bank_match_group_tie` (`0038:3249`, live arm `:3314-3326`) remains the authority, and the face must never imply otherwise.
5. **One decision, one key** (D15) in `lib/bank/match-doors.ts`, for `match_bank_line` **only** — derived from a hash of the intent tuple `{client, sorted line ids, sorted entry
   ids, cents, ack flag}`, the same tuple `_reserve_op` hashes server-side (`0038:3949-3952`), so "same intent ⇒ same key" is a property of the data rather than of a component's
   lifecycle. **The renewal rule, verbatim in the module header**: *the key renews only on an intentional human act that changes WHAT is being submitted — the set of selected line
   ids, the set of selected entry ids, or a typed cents value; it renews on nothing else: not on a failed or timed-out submit, not on the unconditional `act()` reload
   (`matching-section.tsx:98-115`), not on a re-render, not on a tab switch, not on a dismissed refusal.* Leave the house-wide posture in `members/doors.ts:58-66` alone and say in
   the header why this verb differs.
6. **The persistent outcome**: on success a non-transient block naming the existing JE, the match allocation, the line, the receipt op key and the sentence "no new cash entry was
   created", **sourced from the door's own `new_journal_entries: 0`**, never asserted by the client. No toast.
7. **The exception face (AC12)**: when the context read reports a governing open exception, keep the line visible and pending with an inline `Alert` carrying the exception's kind
   and reason and its `remedy_calls` rendered as links into the Exceptions tab. Never a resolve control here.
8. **States on every touched surface**: loading (shape-matched `Skeleton`), successful-empty, no-results (filters preserved + Clear), partial/stale (`StateBanner`), invalid/saving
   (`aria-invalid` + `FieldError`, **typed cents preserved across a refusal**), denied (the viewer case — names the restriction, offers no fake retry), failed (verbatim message +
   the `code · reason` chip, `components/bank/action-refusal.tsx:43`), cancelled/recovery; 320px; 200% zoom; keyboard + focus return; screen-reader names;
   `prefers-reduced-motion`; stable URL/Back; preserved drafts. New keys under `ClientBank.matching` in `messages/en.json`.

**Docs.** `CONTEXT.md`: the two DECISIONS §3.1 terms **plus** the four gap-map-proposed bank terms and the `Settlement allocation` extension, in the house "term / _Avoid_" shape,
with the split of authority exactly as the binding section states. READMEs:
`packages/db/README.md` (the new read, the two-copy candidate discipline, the ungranted-block/granted-wrapper idiom, the structured task binding), `packages/db/tests/README.md`
(new cells + cohort), `apps/web/README.md` (the `/bank` URL change and the per-decision op key). **Never `docs/PRD.md` or `docs/ARCHITECTURE.md`.** Record as **blueprint drift** in
the report, do not edit: `ARCHITECTURE.md:524` (bank is still not enrolled in the capability registry after this slice) and `PRD.md:109` (银行对账 sits under 当前版本已交付 while
this ticket refines it); `ARCHITECTURE.md:509-512`'s one-receipt paragraph is **unaffected** — this slice adds no second reconciliation call site.

## 4. TDD seams (red first)

**Measure first, on `clara_657`, before one line of SQL is written** — these are the gap map's "unverified" items and SYNTHESIS §7.4's list, and each one changes what you write:
`p657.m1.pins` — every prosrc sha above, taken off `pg_get_functiondef` / `pg_proc.prosrc` and **never transcribed** (three bodies in this blast radius are provably not their
file's text: `match_bank_line/6` patched in place by 0040 S4.4a, `_match_bank_line_core` recut whole at `0121:1863`, `_agent_verify_inputs_digest` dropped and recreated at
`0129:1038`, and `_agent_bank_receipt` twice CoR-patched, `0129:922-995` then `0134:106` onward);
`p657.m2.refusal-reason-wire` — a bank refusal's `detail.reason` reaches `ActionRefusal`'s chip (source-resolved at `lib/doors.ts:41-44` + `components/bank/action-refusal.tsx:43`,
but **no cell asserts it** — assert it); `p657.m3.counterparty-canonical` — which reader is canonical after #647/0215: prove `_canonical_counterparty` + `counterparties.name`
returns the **surviving** name for a merged counterparty; `p657.m4.ui-add-dry-run` — `pnpm --filter @clara/web ui:add combobox --dry-run` resolves for this project's `base-nova`
style and overwrites no protected file (`components.json:24` is `"registries": {}`, appendix D records a CLI failure on that configuration, and the `shadcn` MCP server was
unreachable when the map was written); `p657.m5.task-binding-premise` — `clara._wake_task_id()` is NULL under an `interactive_client` bank credential and
`bank_agent_receipts.wake_task_id` is NULL on every existing row (the premise is sound on paper: the two writers of `wake_credentials.agent_task_id` are pinned as an exact closure
at `0159:518-529` and neither is the bank chat minter, and `_agent_bank_receipt`'s INSERT column list at `0121:4979-4981` omits `wake_task_id` — **prove it on the rig anyway**; if
either is false, simplify §3 item 5 accordingly and say so in the report); `p657.m6.thirteen-core-shape` — each of the thirteen cores still carries the
pinned `_agent_verify_inputs_digest` call **exactly once** and splits at `AS $function$`; **any divergence ⇒ STOP and report**.

**DB battery `packages/db/tests/bank-line-existing-booking.test.mjs`** (its own cohort gate; `humanQuery` least-privileged personas, never `rootQuery` for the assertion under test):

1. `p657.db.no-new-cash` — **the ticket's centre.** Snapshot `count(journal_entries)`, `count(journal_lines)`, `count(open_items)`, `count(open_item_allocations)` and
   `list_bank_statements(...)->'tie'->>'gl_balance_cents'` (`0038:7942-7947`) before and after a successful `match_bank_line` with `p_adjustments = null`; assert all five unchanged
   and exactly one `op_receipts` row; export the helper for #666/#667. *Red: nothing asserts it today — `x38.a:211-233` stops at group ties and the counting helper at `:1420-1427`
   serves only `x38.y`.*
2. `p657.db.one-receipt-under-retry` — the same op key replayed after a simulated lost response returns the **byte-identical** receipt and writes no second match. *Red against the
   enriched `_finish_op`; extends `x38.x:1373`.*
3. `p657.db.capacity-race` — two concurrent sessions, two different lines, one entry with capacity for only one of them: one wins, one refuses by name with `side` in `detail`
   (`0038:4132-4158`), and the entry's post-state capacity is never negative. **Blocking must be PROVEN**, in `x38.g:387-460`'s own two-session shape. *Red: no cell races two
   matches against one entry's capacity.*
4. `p657.db.candidate-enrichment` — the recut read returns the canonical counterparty **name**, a truthful `high_stakes` and a bounded `match_history`; a candidate with zero
   remaining capacity is absent; a foreign firm's entry is invisible under real RLS. *Red: the fields do not exist.*
5. `p657.db.pack-parity` — `_agent_get_bank_pack_core`'s candidate projection equals the public read's, field for field, for the same client/account. *Red until both copies move
   (`0038:8010-8054` vs `0121:5735-5771`).*
6. `p657.db.exception-context` — with a governing open exception, `get_bank_line_matching_context` returns `exception_booking_outstanding` with `blocking`, `caused_by` and
   `remedy_calls`; `match_bank_line` on the same line still refuses `line_excepted`; **no write-off, suspense or adjustment row appears**. *Red: the read does not exist.*
7. `p657.db.opkey-parse-free` — an op key **with no colons** and one **with colons inside the payload** both bind to the right task; a digest from another task refuses
   `inputs_digest_unverified`; a pre-0226 receipt still binds through the fallback. *Red today against the `split_part` pair at `0129:1048` / `:1052`.*
8. `p657.db.digest-census` — every `clara._agent_*_core` in the bank family calls `_agent_verify_inputs_digest`, and the count equals the roster (`0129:1067-1081`). C33.7's re-census.
9. `p657.db.acl` — the new read is refused to `clara_runtime`, to both wake roles and to a viewer; `_wdb_line_booking_block` and `_bank_op_key_task` still hold **zero** grants; every
   recut body keeps owner / SECURITY DEFINER / `search_path` / ACL byte-for-byte.

**Runtime.** No new module, so no new battery and **no World leg is owed**. Inherited evidence, re-run unchanged with the PG env: from `packages/runtime`,
`node --test tests/g1-wake-bank-e2e.test.mjs` (a real `bank_agent` credential still admitted through the real wrapper stack against the recut cores — its `skip` is false on your
rig, and a skip is not evidence); from `packages/db`, `f-a3-pr3-chatturn-v14-bank-parity.test.mjs` (the chat lane still reaches the pack and the act; the digest seam still binds).

**Web unit** — each file registered in `apps/web/test/manifest.txt` at its sorted position: `components/bank/matching-candidates.test.tsx` (name/date/capacity/history/basis render;
an honest "—" only when the name is genuinely absent); `components/bank/matching-residual.test.tsx` (the residual recomputes on every selection change);
`components/bank/matching-refusal.test.tsx` (`p657.web.refusal-verbatim` — the refusal renders verbatim with `code · reason` **and the typed cents survive it**);
`components/bank/matching-exception-face.test.tsx` (`remedy_calls` render as links; **no** resolve control is offered); `components/bank/matching-outcome.test.tsx` (the success
block states "no new cash entry was created" from the door's own field, not from client logic); plus the three op-key cells in `lib/bank/match-opkey.test.ts`, written red first
because a wrong answer here silently reproduces the exact defect AC4/AC10 exist to fix — `p657.web.opkey-stable-across-retry` (a failed or timed-out submit, then an identical
resubmit with an intervening `act()` reload and a re-render and **no human edit** ⇒ the **same** `p_op_key`, and the stored receipt comes back rather than `already_matched`),
`p657.web.opkey-renews-on-intent-change` (a different entry or different cents ⇒ a different key), `p657.web.opkey-does-not-renew-on-noise` (a dismissed refusal, a tab switch away
and back, a parent re-render and a reload ⇒ **unchanged**).

**Playwright** — new `apps/web/e2e/bank-match-walk.spec.ts` + `apps/web/e2e/bank-match-mock.mjs`, registered with one import plus one dispatch line in `e2e/serve-built.mjs` and one
ownership row in `e2e/e2e-fixture-ownership.test.ts` (add the mock to `LANE_MOCKS`, `:53-79`; read POST bodies **only** through `readCachedJson` from `mock-dispatch.mjs`, never a
private reader). The mock answers exactly these verbs:

- **Five verified exclusive to this lane by SYNTHESIS §3.3** (`SYNTHESIS.md:411-413`): `get_bank_line_matching_context`, `match_bank_line`, `unmatch_bank_match`,
  `list_unmatched_lines`, `list_bank_match_candidates`. None needs a `SHARED_RPC_VERBS` row.
- **Two more you need, which SYNTHESIS §3.3 does NOT list in either its shared table or its exclusive list**: `list_bank_statements` and `list_bank_accounts`. They are yours by
  DECISIONS §3's blanket ownership of `/bank` (DECISIONS.md:113, "nobody else touches `/bank` this wave") — **lane-exclusive by inference, not by verification**, and there is a
  measured trap behind them. `e2e/home-board-mock.mjs` answers both **unconditionally** through its `EMPTY_RPCS` array (`home-board-mock.mjs:107-108`, dispatched at `:139-142`,
  returning `[]`), and it is wired into the chain at `serve-built.mjs:720`. The ownership census cannot see it — `RPC_VERB_OPENER`
  (`e2e-fixture-ownership.test.ts:1077`) matches only `verb === "…"`, `fn === "…"` and a literal `path === "/rest/v1/rpc/…"`, and those two verbs live in an array — so the census
  stays green either way. **Two consequences, both load-bearing: (a) dispatch your mock BEFORE `handleHomeBoardSupabase` (above `serve-built.mjs:720`; the sibling bank lane
  `handleL7Supabase` already sits at `:690`), or your walk silently receives `[]` for statements and accounts; (b) do NOT add a `SHARED_RPC_VERBS` row for either verb — the
  reverse check at `e2e-fixture-ownership.test.ts:1262-1265` asserts every declared verb has 2+ CENSUSED claimants, and the census will see only one.** Say both in the mock's header.

Legs: land on `/clients/:id/bank?tab=matching` (URL as truth; a reload keeps the tab); pick a line; read the source facts beside the candidates; match a unique sufficient candidate;
read the persistent no-new-cash outcome; a second identical submit returns the same receipt; an over-capacity pick shows the refusal verbatim with the typed cents intact; an
excepted line stays visible with its recovery link; a viewer meets the denied state. Run at desktop **and 320px**, with an axe scan, 200% zoom, a keyboard-only path, a
focus-return assertion and reduced motion.

**Census suites that red on files you never touched** — register, do not fight them: `tests/sql-oracle.test.ts` (three new SQL functions), `tests/parity-holes.test.ts`,
`tests/firm-scope-surfaces.test.ts`, `tests/firm-scope-fourth-entrance.test.ts` (any new file under `app/**`, any changed href), `e2e/e2e-fixture-ownership.test.ts` (the new mock
and its verbs), `lib/navigation/tree.test.ts` if any href moves, and — the two that actually reach a new SQL function — `packages/db/tests/operation-census.test.mjs` and
`rig-isolation.test.mjs`.

## 5. Risks

1. **The candidate read is duplicated and the duplication is invisible at runtime** — `0038:8010-8054` and `0121:5735-5771` must move together, and nothing fails today if only one
   does. The tail parity assertion is the mitigation (Q4/J3); the precedent for this exact drift class is `0040 FIX WAVE A5` (a belt weaker than the door it guards).
2. **Recutting `_match_bank_line_core` moves both lanes at once** (the human door at `0121:3816` and `_agent_match_bank_line_core` at `0121:6012`) — that is the point and also the
   blast radius. Its live body is `0121:1863`'s, and **a pin taken off file text will not match: 0226 then refuses to apply.**
3. **Signature discipline is on YOU this file.** `0119:210-218`, `0129:1197-1199`, `0103:1055-1070` and `0040:6776-6781` are `do` blocks at their own position in the chain; none of
   them can see 0226. Keep the existing signatures; a defaulted parameter creates an overload; a new parameterisation is a NEW verb — and the only executable proof of that in this
   wave is the single-`pg_proc`-row census 0226 writes over its own installed and recut names (DECISIONS §2.2).
4. **The lock-order pins are prosrc scans** — `0040:6808-6842` per arity and `x38.aa:1469` from the test side, against the three literals named in §3 item 4. Re-spelling or
   reordering those blocks reds `x38.aa`, which IS a live test.
5. **Changing the pack shape changes every future digest** — `_agent_get_bank_pack_core` hashes the whole pack (`0121:5785`). Harmless under the current rule (the verify needs
   *some* prior read in this task) but it invalidates any fixture that hard-codes a digest. Say so in the report.
6. **The `_agent_verify_inputs_digest` DROP+CREATE re-patches thirteen bodies across three out-of-wave domains** — `_agent_add_bank_account_core`,
   `_agent_book_staff_advance_application_core`, `_agent_complete_bank_reconciliation_core`, `_agent_match_bank_line_core`, `_agent_propose_bank_identifier_promotion_core`,
   `_agent_propose_line_exception_core`, `_agent_resolve_and_book_core`, `_agent_resolve_bank_line_exception_core`, `_agent_settle_from_bank_line_core`,
   `_agent_unmatch_bank_match_core`, `_agent_upsert_account_core`, `_agent_void_bank_reconciliation_core`, `_agent_void_bank_statement_core` (`0129:1067-1081`) — #667's, #671's and
   #675's territory plus account-CRUD and staff-advance cores. **Every one gets a new prosrc sha**, so any future bank-family pin must measure against #657's post-image, not
   0129's (SYNTHESIS.md:262-266 "LOUD #2" says the same). Put that sentence in the migration header and in the report.
7. **Three house laws with no executable reach into 0226 — honour them by hand, and say you did.** `0044:2916-2930`'s creation-key census (roster `:2929-2930`, enforcement
   `:3006-3012`), `0044:2954-2963`'s `_wdb_born_in_booking_act` call-count (do not touch the block's body — you only WRAP it), and `0040:7423-7430`'s `completing_recon`
   single-writer assertion (name that GUC nowhere). All three are `do` blocks inside 0044/0040 and run before 0226 exists; SYNTHESIS §7.2 already frames the first as "adjudicated,
   not merely compiled", and the measurement here is that nothing compiles it either. The suites that DO red on you are `operation-census.test.mjs` and `rig-isolation.test.mjs`
   (you add SQL functions) — run both, without the reset flags.
8. **A viewer can reach `/bank` and every read refuses** (`tree.ts:379` vs the bookkeeper floor on all six reads) — the redesigned surface must render one honest denial, not an
   error cascade.
9. **Merge collisions, by exact file**: `apps/web/package.json` + lockfile (with **#660**'s `recharts` and **#642**'s `@shadcn/react` — commit your own manifest change;
   **the integration worker regenerates the lockfile ONCE**, SYNTHESIS.md:373); `apps/web/components/bank/*` and `lib/bank/*` are yours alone this wave, but **#667** lands on this
   chassis next, so write it so `SettleLineForm` drops in unchanged and do not touch `settle_from_bank_line`'s contract; `e2e/serve-built.mjs`'s dispatch chain is edited by several
   lanes and your line's POSITION matters (risk item in the Playwright section); the eight shared registration files above are edited by nine other lanes —
   one line each at the sorted position, `rig-meta.mjs`'s `];` repair is the known hazard, and the `package.json` gate chain is **migration order, not alphabetical**.
10. **`bankAgent_v1` is dormant** (`0133:1058`, `enabled=false`, zero operator firms) — any evidence claimed "for Clara" must come from the chat lane (`clara_wake_interactive`,
    `0130:89`) or it is not evidence.
11. **Two cash expressions, one product, no ruling** — see the binding section's unratified item. It cannot block you (#660 recuts nothing), but if your report does not raise it,
    nobody will.
12. **Known Windows-only reds you must NOT "fix"**: #707 (x56-rest-c shells out to grep), #693 (EICAR fixture quarantined by Defender), no `pg_dump` on PATH,
    `thread-live-clarify.test.tsx`'s whole-suite load flake (re-run it alone and report both), `rig-isolation.test.mjs` T10b after a Workflow World bootstrap (#866). `next build`
    may panic `0xc0000142` under ten-lane contention — retry once (#869). `npx playwright test` alone serves a STALE build (#865) — always go through `pnpm --filter @clara/web e2e`.

## 6. Effort and rig

**Effort: L** (DECISIONS §7; SYNTHESIS §7.3, `SYNTHESIS.md:701`). L because there is **no frozen ceremony and no runtime module**: one additive migration (two read recuts with a
duplicated twin, one new read wrapper, one core recut, one DROP+CREATE with a thirteen-site loop, one twice-anchored CoR), a new DB battery with its own cohort gate, a genuine
rebuild of the Matching tab with the full 320px / 200% / reduced-motion / focus pass, and a new Playwright walk with a new mock. The three XL triggers SYNTHESIS names are **closed
by ruling, not left open**: D14 forbids a stored bank Work object, D14 descopes B3's write path, and Q3/J2 forbids a scoring lane.

**Rig** (RIG.md:26): worktree `C:\Users\zhant\Desktop\clara-wt\657`, branch `impl/657-bank-existing-booking`, PG **55707** / db **clara_657**. Node 22 first, on every call:
`export PATH="/c/Users/zhant/AppData/Local/pnpm:$PATH"`. DB env:
`export PGHOST=127.0.0.1 PGPORT=55707 PGUSER=postgres PGDATABASE=clara_657 CLARA_ALLOW_DESTRUCTIVE=1 CLARA_RIG_DB=1`. **Never** set `CLARA_RIG_ALLOW_RESET=1` or
`CLARA_RIG_ALLOW_ROLE_SWEEP=1`; never run a second from-scratch chain on this cluster (0154 pins the cluster-wide `clara%` role count). No `psql` on Windows — use `node -e` with
`pg`. Playwright triple as above.

**Before the final report, run**: `pnpm typecheck` and `pnpm lint` from the worktree root (both green); the **whole `apps/web` unit suite** once (`node scripts/run-tests.mjs` from
`apps/web`, ~5 min) and report its counts; `packages/db/tests/operation-census.test.mjs` and `rig-isolation.test.mjs` **without the reset flags** (this slice adds SQL functions);
your battery with the **40** `--import ./tests/*-preintegration-gate.mjs` flags copied verbatim from `packages/db/package.json`, **plus a focused run of your own battery WITHOUT
its gate, which must FAIL loudly below 0226**; `node scripts/check-frozen-workflows.mjs` and `node packages/runtime/scripts/check-parts-parity.mjs` — expected **no-ops**, and run
anyway, because a green there **is** the evidence for this brief's "no successor" verdict (SYNTHESIS §7.2, `SYNTHESIS.md:686`); `node --test tests/g1-wake-bank-e2e.test.mjs` from
`packages/runtime` with the PG env; the v14 parity battery; and `pnpm --filter @clara/web e2e bank-match` with your triple.

**Copy the house shapes from**: `packages/db/migrations/0219_client_onboarding_facts.sql` (header, "this file recuts nothing" discipline, the ungranted-helper/granted-wrapper
idiom, tail), `0195_*.sql:388-409` (prestate sha pins, including the NON-REGRESSION form), `0129_f_a3_pr3_retirement_parity_doors.sql:1023-1106` (the DROP+CREATE pin and the
thirteen-site caller loop you are repeating), `0134_f_a3_pr3_c1bis_receipt_identity.sql:106` onward (the substring-anchored CoR on `_agent_bank_receipt`, and `0129:922-995` for the
pair of substitutions it builds on), `packages/db/tests/preview-invite-preintegration-gate.mjs` (gate module), `packages/db/tests/rig-meta.mjs:611-639` (cohort),
`packages/db/tests/x38-wave-c-b-match.test.mjs` + `x38-match-fixtures.mjs` (persona-driven battery idioms, the `snap()` counting helper, two-session races),
`apps/web/components/registers/registers-workbench.tsx:28-47` (URL-as-truth tabs), `apps/web/components/work/work-cancel-dialog.tsx:48-106` (the decision-key law — header `:48-52`,
`useDecisionDialog` `:53-70`, renewal `:64-66`, `useDecisionKey` `:92-106`), `apps/web/e2e/bank-close-registers-walk.spec.ts` +
`bank-close-registers-mock.mjs` (walk/mock pair and the `L7_RPC_VERBS` allow-list guard), and `docs/plan/active/refresh-wave-2026-09-15/brief-649.md` for what a reviewer demanded
last wave — **behavioural cells rather than `prosrc` assertions, re-measured rather than copied evidence, an explicit merge-order collision table, and every claim carrying the
command that produced it with its pass/fail counts.**

## Verifier findings not applied

**None. All four verifier findings (F1–F4) were opened at their evidence, confirmed against source, and applied.** No finding was refuted back.

- **F1 applied.** Confirmed: `create function clara._agent_get_bank_pack_core(...)` is at `packages/db/migrations/0121_f_a3_pr1b_agent_limb.sql:5697`; line 5685 falls inside the
  preceding H2-finding comment block (`:5682-5696`). Every `0121:5685` citation now reads `0121:5697`, with the comment block cited as the surrounding context where the brief
  refers to the H2 finding itself.
- **F2 applied.** Confirmed: the recreated 3-arg body derives the task at `0129:1048` (`v_task := nullif(split_part(coalesce(p_op_key,''), ':', 2), '')`) and compares at
  `0129:1052` (`split_part(r.op_key, ':', 2) = v_task`). The brief now names **both** sites, because §3 item 5 replaces the comparison and deletes the derivation — one citation
  could not carry that. The ceremony span is corrected to `0129:1023-1058` (`revoke` at `:1058`) with the create at `:1038`.
- **F3 applied, and extended with a measured hazard.** Confirmed: `SYNTHESIS.md:411-413` names five exclusive verbs for #657; `list_bank_statements` and `list_bank_accounts`
  appear in neither that list nor the shared table. The Playwright section now splits the seven verbs by authority (five SYNTHESIS-verified, two by inference from DECISIONS §3).
  While opening the evidence the reconciler measured a defect neither the draft nor the verifier had: `e2e/home-board-mock.mjs:107-108` already answers both extra verbs
  unconditionally via its `EMPTY_RPCS` array (`:139-142`) at `serve-built.mjs:720`, and the ownership census cannot see array-dispatched paths (`RPC_VERB_OPENER`,
  `e2e-fixture-ownership.test.ts:1077`). Both consequences — dispatch above `:720`, and never declare these two in `SHARED_RPC_VERBS` because the reverse check at `:1262-1265`
  would fail — are now in the brief.
- **F4 applied, both halves.** (a) Confirmed by measurement: `gl_balance_cents` returns **zero** matches in `DECISIONS.md` and `SYNTHESIS.md`; the only source is gap-657.md:212's
  Overlaps recommendation. "Ratified with #660" is removed. The non-goal is restated as #657's own discipline (it adds no cash reader; its AC3 proof reads
  `list_bank_statements`' existing `tie.gl_balance_cents`), and the cross-ticket question is recorded as **unratified**, adopted unilaterally, safe only because DECISIONS §2 row
  0232 gives #660 no recuts — with an instruction to put it to the owner in the report. (b) Confirmed: `DECISIONS.md:126-128` ratifies only *Settlement candidate row* and *Match
  basis* for #657; the four bank terms and the *Settlement allocation* extension are gap-657.md's own Docs proposal. The CONTEXT.md bullet is now split by authority and the other
  five are admitted explicitly under DECISIONS §3.1's closing sentence (`DECISIONS.md:135-136`).

**Reconciler corrections beyond the verifier's four** — every one re-measured at `abcc5030`, each an inexactness inherited from gap-657.md or introduced in the draft:

| Was | Is (measured) | Where |
|---|---|---|
| `0038:4084-4090` "stays the authority" for the tie identity | The residual/tie authority is the DEFERRED constraint trigger `clara._tf_bank_match_group_tie()` — `0038:3249`, live arm `:3314-3326` (`amount_beyond_tolerance`), wired on all three tables `:3330-3341`. `0038:4084-4090` is the line-member INSERT and its `already_matched` handler. | §2 AC7/AC11, §3 web item 4 |
| `tie.gl_balance_cents` at `0038:7936-7940` | `0038:7942-7947` (`tie` object opens `:7941`; `unmatched_cents` `:7948-7952`). `:7932-7940` is the header/lineage projection and stays correct where AC6 cites it. | binding non-goals, §1, §4 cell 1 |
| `_finish_op` payload `0038:4235-4240` | `0038:4233-4238` | §1, §3 item 4 |
| `_reserve_op` tuple `0038:3944-3950` | `0038:3949-3952` | §1, §3 web item 5 |
| lock-order block `0038:3991-4002` | `0038:3990-4002` | §1, §2 AC2 |
| eight-rung vector `0121:5880-5999`; ambiguity `:5906-5921`; delegation `:6011-6014` | `0121:5875-6002`; `:5907-5923`; `:6012-6015` | binding Q3, §1, §2 AC8 |
| `_agent_bank_receipt` "INSERT column list `0121:4980-4985`" | column list `0121:4979-4981`, VALUES `:4982-4985`, `on conflict (firm_id, op_key)` `:4990` — and 0129 replaced the VALUES tail wholesale (`0129:922-995`), so §3 item 5's CoR needs **two** anchors, not one | §1, §3 item 5 |
| append-only triggers `0121:4407-4409` | `0121:4407-4410` | §1, §3 item 5 |
| thirteen-core roster `0129:1064-1084`; loop `0129:1064-1106` | roster `0129:1067-1081`; loop `0129:1063-1106` | §3 item 5, §4 cell 8, Risk 6 |
| `wake_credentials.agent_task_id` writers "pinned at `0159:526`" | the exact two-minter closure is `0159:518-529` | §1, §4 `p657.m5` |
| `bankAgent_v1` "registered (`registry.ts:63`)" | imported `registry.ts:63`, **registered** `registry.ts:365` | §1 |
| `action-refusal.tsx:41-43` (no path) | `apps/web/components/bank/action-refusal.tsx:43` — and it is **inside** #657's own lane, not `components/clara/*` | binding ownership, §1, §3 web item 8, §4 |
| silent account derivation `matching-section.tsx:58-64` | `:55` (candidate read `:56-65`) | §1, §2 AC6, §3 web item 2 |
| `act()` reload `matching-section.tsx:95-113` | `:98-115`, N7 comment `:111-112`, reload `:113` | §1, §2 AC10, §3 web item 5 |
| candidate `<li>` + MoneyInput `matching-section.tsx:182-199` | `<li>` `:180-196`, span `:182`, MoneyInput `:183-195` | §1 |
| `useDecisionKey` "header `:48-51`, renewal `:62-68`" | header `:48-52`, `useDecisionDialog` `:53-70`, renewal `:64-66`, `useDecisionKey` `:92-106` | §1, §6 |
| URL-as-truth precedent `registers-workbench.tsx:30-46` | `:28-47` (TABS `:28`, `isTab` `:31-33`) | §1, §3 web item 1, §6 |
| `_wdb_born_in_booking_act` call-count `0044:2955-2965`; `completing_recon` `0040:7425-7428` | `0044:2954-2963`; `0040:7423-7430` | Risk 7 |
| open-excepted exclusion `0040:4117-4123`; line facts `:4105-4111` | `0040:4117-4122`; `:4105-4109` | §1, §2 AC1/AC12 |
| `bank_statement_lines` `0038:537-571` | `0038:537-572` | §2 AC5 |
| "the public 6-arg signature is untouched — three arity censuses" | after `0129:396` dropped the /7 rule arity, `match_bank_line` has exactly ONE live arity; `0040:6776-6781`'s "exactly TWO" is a 0040-time fact. **None of the four cited censuses can see 0226** — they are `do` blocks at their own chain position — which is why 0226 must write its own (DECISIONS §2.2) | §1, Risk 3, binding tail |
| "0044's creation-key census … reds" | it is a `do` block inside 0044 and runs before 0226 exists; it cannot fire on a function this file creates. The law is real and behaviourally proved by `x42.r7-af2-7` (`x42-r7-af2-offpath.test.mjs:242`); the instruction stands, the enforcement claim did not | §3 item 3, Risk 7 |
| `/bank` six-way sub-nav (tab ids unstated) | `TABS = ["accounts","statements","matching","exceptions","reconciliation","agency"]` (`bank-workbench.tsx:19`) — the sixth id is `agency` | §1, §3 web item 1 |
| `frozen-workflows.json:554-573` (no path) | repo root `frozen-workflows.json`; the four v14 bank files at `:554`, `:559`, `:564`, `:569` | binding frozen rule, §1 |
