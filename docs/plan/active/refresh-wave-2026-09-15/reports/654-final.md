# #654 — firm-wide knowledge defaults with preserved client exceptions

**Branch** `impl/654-firm-defaults` · **worktree** `C:\Users\zhant\Desktop\clara-wt\654` · rig PG `127.0.0.1:55512` / `clara_654` (194 migrations after 0205). All evidence LOCAL; **hosted evidence pending** (no hosted lane exists for this slice).

```
4b69d2b2 test(web,db): the four census suites the new settings section reds, and one lint fix
4f0d7bb1 feat(web,db): the browser walk, three new mock verbs, and the two defects it caught
8bd80bc2 feat(web): /settings/knowledge, the promote dialog and the firm-vs-exception pair
91f40dae feat(db): 0205 — firm-default eligibility catalog, cross-client evidence wall, two firm reads
099acda4 test(db): red battery for the firm-default eligibility and evidence walls
```

## Acceptance criteria

| Row | State | Evidence |
|---|---|---|
| **AC1** | done | Eligibility wall `clara._tf_knowledge_firm_eligibility` + `clara.knowledge_key_firm_eligibility` (0205 §A/§B) → `p654.eligibility.refuses_client_key`, `.admits_seeded`, `.admits_by_kind` (all 13 keys probed one by one). Evidence wall `_tf_knowledge_firm_evidence` → `p654.evidence.refuses_filed_document` (N=1 and N=2), `.admits_unfiled_firm_document`. Exceptions survive → `p654.exception.survives_promotion`. Promotion act records promoter/authored reason/applicability/window → `p654.authority.floor`. |
| **AC2** | partial (built) | Sentence 1 verify-only (0192). Firm-vs-exception pair built: `clara.get_knowledge_applicability` + `knowledge-exception.tsx` → `ke.01`–`ke.04`, walk "the client that already had its own value keeps it". "Where it applies in a subsequent Work" = **successor contract**, not claimed on this branch. |
| **AC3** | partial, by blueprint | Clauses 1–2 **not built** (`docs/PRD.md:123` defers to #658/#663). Human-review affordance shipped instead: `exceptions` + `live_work` per rule, and the register STATES it re-runs nothing (`kf.07`, walk leg 1). Clause 3 → `p654.census.not_a_posting_grant`. |
| **AC4** | done | Floors `p654.authority.floor`; revoked membership on all three lanes `p654.authority.revoked_membership` (first db cells for `answerer_not_active` and for `capture_knowledge_for` at all); cross-client evidence `p654.evidence.*`; independent overrides `p654.exception.independent_overrides`; negative census `p654.census.not_a_posting_grant`. |
| **AC5** | done | `e2e/knowledge-firm-walk.spec.ts`, 11 walks: empty face, denied-below-floor, dialog (required authored reason, server MYT default, exceptions statement), register with authority + both exception holders, the pair, the recipient client, verbatim CLR10 with draft intact, cancel/Escape with focus return + preserved draft, stable URL/Back/reload, 320px, 200% zoom; every face axe-checked (wcag2a/2aa/21a/21aa). |
| **AC6** | done at DB+web | Real Postgres, real least-privileged roles, current migrations. **No Workflow clause**: this slice ships no runtime module and no belt, so there is no World e2e leg to run — stated, not skipped. |
| CB-AE2E-007 | firm half done | The promotion now has its caller (`promoteKnowledgeToFirm`); client half verify-only (#644). |
| H-21 | named residual | `claraWork.v3.impl.ts:474` still records `observedRevisions({basis_digest:null})`; carried by the successor contract. |
| H-52 | done | Applicability on the promotion act (`p654.authority.floor`) and its display (`KnowledgeApplicability` on the firm register). |
| C-41 / C-52 / C48.5 / C83.24 | not this ticket | One composed control shipped (Promote beside Correct/Withdraw), not one button per function. `/settings/knowledge` carries no setup pointer beyond the section itself. |
| C79.3 | firm-setting half done | `/settings/knowledge`; re-evaluation half out of scope (PRD:123). |
| C79.6 | verify-only, cell added | `p654.trust.no_laundering` (inferred and extracted both refused as firm policy, as owner). |

## Tests and commands

- `packages/db/tests/knowledge-firm-defaults.test.mjs` (15 cells, new) + `knowledge-firm-fixtures.mjs` + `knowledge-firm-defaults-preintegration-gate.mjs` (appended to `packages/db/package.json`'s chain → 29 gates). Run from `packages/db` with the exact 29 `--import` flags: **15 pass / 0 fail / 0 skipped**. With `knowledge-records` + `knowledge-onboarding-promotion`: **55/55**. With `operation-census` + `rig-isolation` (no reset flags): **86 tests, 85 pass, 0 fail, 1 skipped** (the destructive T19 cell, by design).
- RED FIRST, measured: before 0205 existed, the focused run was **15 fail / 0 pass**, each "the 0205 firm-default cohort is required for a focused run". The evidence hole was reproduced through the real doors first: a document with **two** live client filings was pinned by a firm-scope `capture_knowledge`, and client B's runtime pack came back carrying client A's document id and basis text verbatim.
- Web unit (new, all in `test/manifest.txt`): `knowledge-firm-panel.test.tsx` 8/8 (four faces, authority, revoked promoter, exceptions, live Work, MYT dates), `knowledge-promote-dialog.test.tsx` 9/9 (floors, ineligible key, already-defaulted, required authored reason, door args, verbatim refusal, preserved draft), `knowledge-exception.test.tsx` 5/5 (pair ≠ conflict, per-applicability, unreadable firm rule).
- **Whole `apps/web` suite** (`node scripts/run-tests.mjs`): **3741 tests, 3739 pass, 0 fail, 2 skipped**, 186 s. The 2 skips are the live-provider auth cells (absent `CLARA_LIVE_SUPABASE_AUTH_*`). `thread-live-clarify.test.tsx` passed inside the whole run **and** in isolation (2/2) — no flake this time.
- Playwright on **3340/3341/3342**: `pnpm --filter @clara/web e2e knowledge` → **24 passed, 0 failed** (11 new + #644's 13, unchanged).
- `pnpm typecheck` **exit 0**; `pnpm lint` **exit 0** (all four workspaces). `node scripts/check-frozen-workflows.mjs` → "OK — 281 frozen file(s)". `node packages/runtime/scripts/check-parts-parity.mjs` → OK (run though not applicable). Known Windows reds #707/#693 untouched.

## Two shipped cells changed deliberately (D8 is a real behaviour change)

`kn.19` demonstrated the per-applicability shadow on `sst_regime`, now un-promotable; its subject is the shadow, so it demonstrates on `coa_seed_decision`. `kp.08` promoted a firm plan answering `currency` + `fye` and expected two; `fye` → `financial_year_end_month` is now WITHHELD by name with the wall's reason in its detail, which makes kp.08 the promotion lane's own D8 proof.

## Docs

`packages/db/README.md` — new "Knowledge scope, firm defaults and exceptions". `packages/db/tests/README.md` — the battery + its gate. `apps/web/README.md` — application map row for `/settings/knowledge`. `CONTEXT.md` — exactly two terms (*Knowledge promotion*, *Client knowledge exception*).

**Blueprint drift.** The ticket's AC3 clauses 1–2 ask for automatic re-evaluation of affected work; `docs/PRD.md:123` defers that to #658/#663 with human review as the accepted interim. Not built; the affordance is. Second: `docs/PRD.md:122` says #654's remainder is 「界面或对话入口」 — the interface half is delivered, the chat half is a successor contract only. Neither blueprint edited.

## Successor contract — `claraWork_v4` (written, NOT cut)

**(a) Knowledge-context step.** New non-frozen module `packages/runtime/lib/knowledge-conflicts.mjs` (never an edit to the frozen `knowledge.mjs`). Export `readWorkKnowledge(sql, {clientId, purpose, firmId})` with `readKnowledgePack`'s envelope verbatim (`{status:"ok"|"unavailable", reason?, records:[]}`, never null, never throws; a governed refusal is carried verbatim). Door call, argument order exact: `select clara.get_knowledge_pack(p_client => $1, p_purpose => $2, p_firm => $3)` as `clara_runtime`. Feed the pack's `knowledge_version` into the EXISTING trace call at `claraWork.v3.impl.ts:465-474`: `observed: observedRevisions({ knowledge_version, basis_digest: null })` — `knowledge_version` is already in the closed vocabulary (`lib/work-trace.mjs:283-286`), so no trace change is needed. No new tool, no `WORK_ACCEPTED_PURPOSES` widening.

**(b) Scoped conflict question.** Tool `ask_knowledge_conflict`, no `execute` (the call IS the act, `ask_question`'s shape). `.strict()` zod input:

```ts
z.object({
  knowledge_key: z.string().trim().min(1).max(200),
  rows: z.array(z.object({
    record_id: z.string().uuid(),
    scope_kind: z.enum(["client", "firm"]),
    applies_when: z.string().trim().min(1).max(400),
    value: z.string().trim().min(1).max(400),
  })).min(2).max(4),
  why_it_blocks: z.string().trim().min(1).max(600),
}).strict()
```

Door: `clara.open_work_question(p_task => $1, p_hook_token => $2, p_question => $3::jsonb, p_fields => $4::jsonb, p_reason => $5, p_source_ref => null)` — `clara_runtime` + hook token (`0180:578-686`). The question names both rows, both scopes and both applicability statements and **picks no winner**; `p_fields` offers one choice per row plus "neither — I will correct the record". Refusal map: CLR10 `invalid_hook_token` → retry with a fresh token; CLR13 `hook_token_bound` → replay, return the existing question; CLR10 `invalid_question_fields` → terminal author error; CLR11 → the Work vanished, terminal. Part kind: the existing `work_question` (`claraWork.v3.impl.ts:546`) — no new part kind, so parts-parity is unmoved. **Expiry:** `0198:143-147` removed `work_id is not null` from `clara.expire_due_interruptions`, so this question sweeps to `expired` on the chat-clarification clock while the CONFLICT outlives it; the successor must re-open rather than treat expiry as resolution, and the C13 register is where the conflict stays visible meanwhile.

## Assumptions and deviations

1. **`require-firm-scope.ts` untouched.** The brief asked for `/settings/knowledge` in `SCOPE_ENTRANCES`; measured, that registry holds layouts and route handlers, and all five sibling settings pages are in none of the three tables because `app/(firm)/layout.tsx` covers them ("ancestor-covered"). Adding a row would make the page a second entrance and red the census both ways. `tests/firm-scope-surfaces.test.ts` + `firm-scope-fourth-entrance.test.ts` + `parity-holes.test.ts` = 63/63 with no edit.
2. **`authoritative: true` on the pack's firm row is not assertable.** `clara._knowledge_row_json` emits `authoritative` on UNIONed legacy rows only (`_knowledge_legacy_rows`); adding it to a governed row is a 0192 recut the brief forbids. `p654.pack.second_client` asserts what is true (the firm row reaches client B, `scope_kind:'firm'`, exact value) **and** asserts the field's absence, so a future recut is visible.
3. **"Promoter's role at the time" is not reconstructible.** `clara.firm_memberships` carries no history (7 columns, no history table — measured). The read emits `authority.required_role` (the floor `_knowledge_floor(key,'firm')` verified at the act, the durable half) plus `promoter_role_now` / `promoter_active`, both labelled as current, and the register says out loud when a promoter is no longer active.
4. **0205 was re-cut once on the rig** (objects dropped, ledger row removed, re-applied) to add `client_record_count`. It is unmerged, so this is the ordinary loop, not an edit to a merged migration. Prestate and tail green on the re-apply.
5. **One `unscopeable` declaration added** to `e2e-fixture-ownership.test.ts`: `list_firm_knowledge()` takes no arguments, so the request carries no subject (`list_coa_templates()`'s shape). Census 15/15.
6. **Catalog ownership honoured**: no knowledge key minted, no `knowledge_plan_item_map` row, `kp.01`'s ten-entry `deepEqual` untouched.

## Two defects the browser found that the unit harness could not

1. The promote dialog blanked its subtree on `applicability.loading`, so a refusal unmounted the open dialog and destroyed the typed reason — the identical defect `knowledge-detail.tsx` records. Fixed to `loading && data === null`.
2. `exception_count` is 0 by construction at promote time; the dialog's "who keeps their own value?" line never appeared. 0205 now returns a second number, `client_record_count`, proved to diverge in `p654.applicability.read_agrees` (0 exceptions, 1 record on the narrow-applicability case).

## Follow-ups worth filing

- **Record the promoter's role at the instant of a governed act.** `clara.firm_memberships` has no history and `clara.audit_log` has no role column, so "who could do this then" is unanswerable after a role change. A membership-revision relation (#625's lane) or a role column on the audit row would close it; #654 emits the required floor plus the current role and labels both.
- **`clara.knowledge_keys.scope_default` is now provably dead.** 0205 deliberately did not make it load-bearing (the table is append-only on UPDATE, so its rows can never be re-defaulted). Three repo-wide writes, zero reads. A later migration should drop or comment it so a reader does not take it for the wall.
- **Firm-scope correction/withdrawal has no dedicated surface yet.** `correct_knowledge` / `withdraw_knowledge` accept a firm record at the same floor, but `/settings/knowledge` renders no control for them; today a firm rule is corrected through the record detail route. Worth a small follow-up once #648 lands beside it.

## Unverified

- Hosted behaviour of any part of this slice — **hosted evidence pending**; no hosted rig exists for this lane.
- The claraWork_v4 stanza above is a CONTRACT, not code: nothing in it is executed on this branch, and `claraWork.v3.impl.ts:474` still records `basis_digest: null`.
- Playwright per-run honesty: the 24/24 figure is one run on this host; the first two runs of the new spec failed on my own fixture and assertion errors (recorded above), not on flake, and the final run was clean end to end.
