# #647 — counterparty identity provenance, correction history and a routed identity surface · final report

**Branch** `impl/647-counterparty-identity` · **worktree** `C:\Users\zhant\Desktop\clara-wt\647` · rig PG17 `127.0.0.1:55506` / `clara_647` (frontier **0200**, 194 applied; the cluster was recreated and the whole chain re-applied from a TRUE prestate in review round 1, because 0200 changed) · Playwright `3280/3281/3282`. All evidence below is **local**; **hosted evidence pending**.

```
bda62a1d docs(db): #647 — 0200's tail says what the two deeper source FKs now are
850f2b65 fix(db,web,runtime): #647 review round 1 — the identity lane's lock order, the pin trio, and the closed kind vocabulary
e7b905e4 test(web,docs): #647 — the browser lane, the identity vocabulary, and the three defects running it found
63cb3ce8 feat(runtime): #647 — the counterparty-identity successor-contract carrier, non-frozen and unit-tested standalone
046e58d1 test(web): #647 — the identity surface's faces, C77.6's typed-action cells, H-20's face, H-34 re-measured, the leaf
410628e5 feat(web): #647 — the routed counterparty-identity detail, one Identity section on Knowledge, the two homeless doors
225e6562 feat(db): #647 0200 — provenance, one append-only correction history, four events and three human reads
1f686612 test(db): #647 red — the counterparty-identity battery, its fixtures and its preintegration gate
```

## What the cut left, and what I kept

`git stash list` empty; the five older commits above were already on the branch. Uncommitted/untracked at the cut: the browser lane (`e2e/counterparty-identity-mock.mjs`, `e2e/counterparty-identity-walk.spec.ts`), one-line registrations in `e2e/serve-built.mjs` and `e2e/e2e-fixture-ownership.test.ts`, and the `apps/web/README.md` Client row. **Kept all of it, discarded nothing** — but it had never run green, and running it found three real defects (below).

## Per acceptance criterion / historical row

| Row | State | Evidence |
|---|---|---|
| **AC1** ids reused; alias origin/source/actor; agent writes never labelled human | **done** | 0200 §1–2 (`recorded_via` NOT NULL default `legacy_unknown`, four values, honesty trigger), §7.1–7.3 (three writer recuts, pins **measured** on this rig); `p647.provenance.human`, `.no_lie`, `.source_pins`, `.overload.one`. **Review round 1 (647-A3):** the source pin TRIO now has to hang together — the extraction and region pins ride triple-key FKs (`uq_document_extractions_id_firm_document`, `uq_document_regions_id_firm_extraction`) and the door raises typed `CLR10 source_extraction_not_of_document` / `source_region_not_of_extraction`, so this client's document can no longer carry a sibling client's extraction. **Named residue:** `merge_counterparties` (a 0149 splice) and `tick_seeding_proposal` are not recut and take the default; their *history* is covered by three lane-agnostic revision triggers |
| **AC2** rename keeps identity; merge lineage; recorded + canonical | **done** (DB half verify-only) | `aging.ts` / `counterparty.ts` carry `recorded_counterparty_id` + `resolution` at last; `aging-register.tsx` badges only `unresolved`; walk cell "merge lineage … BOTH sides" |
| **AC3** no general unmerge; bounded discovery | **done** | `clara.list_counterparty_merge_corrections` (0200 §8.4); `p647.merge.representable`; the surface states there is no un-merge anywhere |
| **AC4** roles distinct, cross-client ambiguous, no netting/authority | **done** | `p647.ac4.same_tin`, `.no_netting`, `.kinds`; **stated** on the surface (`identity.neverGrants`, both conflict sentences) + walk cell "the CONFLICT face …" |
| **AC5** source/history/conflict + one versioned correction path | **done** | `clara.counterparty_identity_revisions` — append-only, forced RLS, 17 columns, SELECT to `clara_authenticated` and zero app-role DML (measured on the rig); `p647.revisions.append_only`, `.race`, `.lock_order`, `p647.identifiers.history`. **Review round 1 (647-A1):** the revision append no longer takes ANY lock on `clara.counterparties` — neither its own `for update` nor an implicit `FOR KEY SHARE` through a foreign key — because both inverted `clara.rename_counterparty`'s lock order and deadlocked two shipped human doors (measured 6/10 and 7/10 rounds 40P01; now 0/10). The number is chosen against `uq_cir_counterparty_revision` with a bounded retry, and tenant congruence is asserted lock-free in the one writer. Work re-evaluation parked by `docs/PRD.md:123` (#658/#663) |
| **AC6** every state, 320px, 200% zoom, keyboard/focus, SR names, reduced motion, stable URL/Back, drafts | **done** | `e2e/counterparty-identity-walk.spec.ts` **17/17**, axe clean on every face; exact dates asserted ("… on 2 May 2026", "1 Feb 2026"). **Review round 1 (SPEC-2):** the two states AC6 names that no cell reached — `loading` and `partial/stale` — now have their own jsdom cells in `client-identity-section.test.tsx` (every read held, then released; one read 500 while the other two answer) |
| **AC7** production reads under real least-privileged roles | **done locally** | the behaviour under test runs through `humanQuery` least-privileged personas; `rootQuery` appears only for catalog censuses, direct-DML refusal probes (no app role holds DML on these tables at all) and fixture setup. `p647.reads.shape` (FUNCTIONS, `search_path` + `plan_cache_mode` pinned, no new masked view), `.denied`, `p647.machine_lane`. **This journey invokes no Workflow** — every door `_human_ctx`-fronted, no machine-role EXECUTE, gap-647 slice (F) struck — so no World leg and no `db-live-gates` row is owed |
| **CB-AE2E-005** | **verify-only, done** | `operation-census.mjs --strict` exit 0 on the 0200 chain (`frontier_mismatch: 0`) |
| **H-09** payer identifier unenterable | **done** | `setCounterpartyIdentifiers` + `SetCounterpartyIdentifiersDialog` + walk cell |
| **H-17** | **verify-only** | `p647.h17.kind_blind_prechecks` |
| **H-20** `add_client_identifier` had no face | **done** | `ClientIdentitySection` reads `clara.client_identifiers` DIRECTLY under RLS; `client-identity-section.test.tsx` (9) + walk cell incl. the CLR10 duplicate. **Review round 1 (647-A2):** the Add-identifier dialog's `kind` is a closed `NativeSelect` over the column's own three-value CHECK (`ssm`/`tin`/`bank_account`), not free text, and no copy names `sst` — a kind the CHECK refuses and the door would surface as a bare 23514 |
| **H-34** REDESIGN | **done, re-measured** | every count is derived from a read that RAN — aggregated in SQL on the list (`clara.list_counterparty_identity` computes alias/live/revision/merge/unsourced counts), counted over the collections `get_counterparty_identity` actually returned on the detail (it returns both unbounded); three distinct empty sentences (successful empty / filtered-to-nothing / failed read) |
| **C-17 / C-22** | **verify-only** | no firm-wide identifier unique; `p647.machine_lane` proves no `wake_fn_allowlist` row |
| **C-41** | **done** | ONE Identity section carrying both halves, one routed detail; no control per function |
| **C-63** | **out of scope** | #625 owns the admission surface (DECISIONS §2) |
| **Two stale comments** | **done** | both 0140-era blocks deleted; the alias-kind gate header no longer calls 0176 unnumbered (re-measured: 0176 is a row in `clara.schema_migrations`) |
| **C08.3** | **partial** | ambiguity is stated against CURRENT identity and never resolved; the resolution ACT stays on `/settings/vendor-bindings`, which the brief forbade recutting. Follow-up filed |
| **C13.3 / C33.5 / C55.24 / C83.2** | **done as one slice** | write-side provenance + a projection carrying it + the revision timeline; binding tables not retired |
| **C55.19 / C83.21** | **done** | `p647.ac4.no_netting` |
| **C79.4 / C79.5** | **done** | provenance + `counterparty.alias_retired`; consumer parked (PRD:123) |
| **C86.1** | **done** | merge lineage rendered from both sides, plus AC3's representability read |
| **Activity kind ladder** | **out of scope** | DECISIONS D13; residual recorded |

## Tests added, and the three defects running them found

| File | What it proves |
|---|---|
| `packages/db/tests/counterparty-identity.test.mjs` (+ `-fixtures.mjs`, `-preintegration-gate.mjs`) | 19 cells; the behaviour under test through `humanQuery` personas, `rootQuery` only for catalog censuses, direct-DML refusal probes and fixtures |
| `packages/runtime/tests/counterparty-identity-unit.test.mjs` | 5 cells over the contract carrier |
| `counterparty-identity-panel.test.tsx` (5) · `client-identity-section.test.tsx` (9) · `counterparty-identity-correct.test.tsx` (6) · updates to `tree.test.ts`, `aging.test.ts`, `counterparty.test.ts`, `counterparty-doors.test.ts`, `counterparty-hygiene-kinds.test.tsx` | the four `recorded_via` lanes as real strings, the conflict / inaccessible-source / empty faces, H-20's three cells, H-34's two, AC3's discovery, C77.6's typed-action pairs, and the leaf + breadcrumb |
| `e2e/counterparty-identity-walk.spec.ts` + `counterparty-identity-mock.mjs` | 17 browser cells over the whole journey |

1. **The mock drained every `/rest/v1/rpc/*` body before the verb switch.** `list_client_knowledge` — a verb this lane does not own — reached its own handler with an exhausted stream; that request never answered, and after a few Knowledge page loads Chromium's per-origin connection budget was gone and the next navigation hung. Measured: cell 4 stalled in `page.goto` for **2.6 min**, then passed in **8.9 s** once each body is read inside its own verb match (`serve-built.mjs`'s hook comment states the rule; `knowledge-mock.mjs` is the shape).
2. **A cancelled correction left its draft behind.** `SetCounterpartyIdentifiersDialog` seeded its fields once at mount, so a TIN abandoned by Escape was silently re-offered next open — and the door REPLACES the pair, so it would have gone in beside a registration the human did mean to change. `ArApCounterpartyDoorDialog` gained one optional `onOpened` (no existing caller passes it); new cell in `counterparty-identity-correct.test.tsx`.
3. **The reverse nav gate red on the new page.** `lib/command/routes.test.ts` reported `/clients/[clientId]/knowledge/parties/[counterpartyId]` as an orphan: it is reached from an href BUILDER (`counterpartyIdentityHref`), not a literal link, so it needs a `REGISTRY_BUILT` row — not a ⌘K Go row, because a palette destination cannot name *which* counterparty.

Also corrected in the untracked walk: three count assertions did not match the fixture, and two matched two elements each under strict mode.

## Commands and counts (all local)

| Command | Result |
|---|---|
| `node --test --test-concurrency=1 $GATES tests/counterparty-identity.test.mjs` (the 29 `--import` gates from `packages/db/package.json`) | **19 / 19 pass / 0 fail / 0 skip** (review round 1, on the re-applied chain) |
| same gates × neighbours `counterparty-merge-pr-1`, `counterparty-alias-kind`, `wave-a-aliases`, `wave-a2-counterparty-kind`, `s6-counterparty`, `p4t2-counterparty-aliases`, `debt-human-read-surfaces`, `knowledge-records`, `knowledge-onboarding-promotion` | **131 / 131 pass / 0 fail**; review round 1 re-ran the same set WITH the identity battery: **150 / 150 pass / 0 fail** |
| `tests/operation-census.test.mjs` + `tests/rig-isolation.test.mjs` (**no** reset flags) | **31 / 30 pass / 0 fail / 1 skip** (T19 destructive, correctly skipped) — unchanged in review round 1 |
| `node packages/db/scripts/operation-census.mjs --strict` | **exit 0** — `called_missing 0`, `called_ungranted 2→0 after waivers`, `frontier_mismatch 0`, `named_arg_mismatch 0`, `public_execute 0`, `unattributed 0`, `granted_uncalled 172` (informational). **No waiver moved** |
| `node --test tests/counterparty-identity-unit.test.mjs` (packages/runtime) | **5 / 5 pass** |
| `node scripts/check-frozen-workflows.mjs` | **OK — 281 frozen files, 51 `"use workflow"` modules**, exit 0 |
| `node packages/runtime/scripts/check-parts-parity.mjs` | **OK — reader ⊇ emittable**, exit 0 |
| `node scripts/run-tests.mjs` (whole `apps/web`), run alone | **3745 tests / 3742 pass / 1 fail / 2 skipped**, exit 1. **Review round 1, run alone: 3748 / 3746 pass / 0 fail / 2 skipped, exit 0** (+3 cells; the load flake did not recur). The one fail is `lib/clara/use-clara-thread-stop.test.ts` — **25/25 in isolation**, untouched by this slice. An earlier run under load gave 3744/3739/3/2: one REAL red (`lib/command/routes.test.ts`'s REVERSE GATE, fixed, now **15/15**) and two more load flakes (`thread-live-clarify.test.tsx` **2/2**, `onboarding-checklist.test.tsx` **14/14** in isolation) |
| `pnpm --filter @clara/web e2e counterparty-identity` on 3280/3281/3282 | **17 passed (4.0 m), exit 0** — run alone. **Review round 1: 17 passed (59.8 s), exit 0**, run alone, after the Kind control became a select the walk now drives with `selectOption`. Earlier runs under load: 15/2 then 16/1, both failures the sign-in redirect outrunning its budget; see "unverified" |
| `pnpm typecheck` / `pnpm lint` (worktree root) | **exit 0 / exit 0** (re-run after the dialog change; and again in review round 1 — lint reports 369 manifest files and 2966 static keys all resolving) |
| `node scripts/check-frozen-workflows.mjs` / `node packages/runtime/scripts/check-parts-parity.mjs` (review round 1, after the carrier changed) | **exit 0 / exit 0** — 281 frozen files, 51 `"use workflow"` modules; reader ⊇ emittable |

## Successor contract — `record_counterparty_alias` (nothing ships in this image)

Carrier `packages/runtime/lib/counterparty-identity.ts`, non-frozen today, unit-tested standalone.

- **Tool name** `RECORD_COUNTERPARTY_ALIAS_TOOL = "record_counterparty_alias"`.
- **Input**, `.strict()`: `{ counterparty_id: uuid, alias: string.trim().min(1).max(200), origin: enum("extracted","agent_proposed"), basis: string.trim().min(1).max(1000), source_document_id?: uuid, source_extraction_id?: uuid, source_region_id?: uuid, source_field_path?: string.trim().max(300) }`.
- **Pre-flight** `localAliasRefusal(input)` — mirrors 0200's CHECKs: `source_incomplete`, `source_not_extracted`, `alias_unusable`. **Op key** `stableOpKey(ctx.taskId, RECORD_COUNTERPARTY_ALIAS_TOOL, input)`.
- **Door call** — NOT `clara.add_counterparty_alias` (human-lane, `_human_ctx`-fronted, `clara_authenticated`-only, refuses `agent_proposed`; 0200's tail asserts no machine role and no PUBLIC holds EXECUTE). An OBO twin `clara.add_counterparty_alias_for(p_client, p_actor, p_counterparty, p_alias, p_origin, p_op_key, p_basis, p_source_document, p_source_extraction, p_source_region, p_source_field_path)` in the `capture_knowledge_for` shape must ship first; its trailing nine arguments are exactly `aliasDoorArgs(input, { clientId, opKey })`. `recorded_via='agent'` is stamped **inside** the door and never supplied by the caller.
- **Refusal map** `ALIAS_REFUSAL_MESSAGES[refusalKey(code, reason)]` — `CLR23:target_retired`, `CLR23:alias_collision`, `CLR23:source_not_this_client`, `CLR10:source_incomplete`, `CLR10:source_not_extracted`, `CLR04:`. Unmapped pairs fall through **verbatim**.
- **Part kind** on success: a plain text part naming the alias, the party and `recorded_via: 'agent'` — NOT `knowledge_receipt` (no `knowledge_records` row, no record id). **No** `WORK_ACCEPTED_PURPOSES` widening, **no** `claraWork` change, **no** `wake_fn_allowlist` row (C-22: keyed by bare name, so a row would widen wake reach over the human door too).

## Docs updated

`CONTEXT.md` — **Counterparty identity / Counterparty alias / Identity correction / Merge lineage**, plus one amended paragraph under **Client knowledge** ("identity is *shown* in the knowledge area but is not a governed knowledge record"). `apps/web/README.md` — the Client row names the identity route. `packages/db/tests/README.md` — a new "Preintegration gates" section. `packages/runtime/README.md` — "#647 — `lib/counterparty-identity.ts`, a contract carrier that ships no tool". `packages/db/README.md` untouched: no census waiver moved. **Blueprint drift: none.** `docs/PRD.md` / `docs/ARCHITECTURE.md` not edited.

## Assumptions

1. **C08.3 read conservatively** — the identity detail states ambiguity against current identity; no new binding-resolution surface was built, because the brief forbids recutting the binding lane.
2. **`packages/db/tests/README.md` has no per-battery inventory** (38 lines, no battery named), so I documented the gate *convention* and named this battery as its example rather than starting a list of ~200.
3. **`ArApCounterpartyDoorDialog` gained one optional prop.** No existing caller passes it; all five sibling dialogs are unchanged in behaviour.
4. **Four of the five `knowledge-shared.tsx` exports the brief said to “call verbatim” are NOT called** (review round 1, SPEC-3): only `KnowledgeSourceBlock` is. `knowledgeValueText` and `appliesWhenText` read a knowledge record's value/applicability, and `KnowledgeKindBadge` / `KnowledgeTrustBadge` render `ClientKnowledge.kind.*` (assertion/extracted_fact/preference/policy) and `ClientKnowledge.trust.*` (asserted/extracted/imported_unverified/inferred) — vocabularies the identity domain does not have (kind is vendor/customer; migration 0200 gives an alias no trust concept at all). Calling them as directed would mis-render or require inventing data the schema does not carry.
5. **The revision relation's counterparty key is a writer check, not a foreign key** (review round 1, 647-A1). `fk_cir_counterparty` was dropped because an FK check takes `FOR KEY SHARE` on the counterparty row, which inverts the lock order of every alias writer against `rename_counterparty` and `merge_counterparties`. Tenant congruence is asserted lock-free inside `clara._append_counterparty_identity_revision`, which is ungranted and the only body that may insert into the relation at all. The alias key stays a real FK (its KEY SHARE is always a self-lock).
6. **The client-identifier copy lives under `ArApCounterparty.clientIdentifiers`** (review round 1, STANDARDS/SPEC-1). The first cut minted a third top-level `ClientIdentifiers` namespace, which the brief and DECISIONS forbid on this shared file.

## Follow-ups worth filing

1. **Give the vendor-binding ambiguity a resolution face against current identity (C08.3).** `_resolve_counterparty` keeps a `registration_conflict` pending as a HARD `vendor_ambiguous` reason, and #647 now renders the identity a human would decide against — but the only place to settle one is the firm-admin `/settings/vendor-bindings` ceremony, which is not where the ambiguity is seen. A client-scoped selection face over `get_counterparty_identity`'s conflicts would close the loop without making a binding a prerequisite.
2. **Consume the four identity events.** `counterparty.renamed / .alias_added / .alias_retired / .identifiers_set` ship routed `context_update` with no consumer by ruling (`docs/PRD.md:123` parks re-evaluation on #658/#663); `wiki-projection.mjs:111-112` still subscribes to `created`/`merged` only.
3. **Repoint the two declared-residue alias writers.** `merge_counterparties` (a `pg_get_functiondef` splice) and `tick_seeding_proposal` still insert aliases directly and land `recorded_via='legacy_unknown'`. 0200 covers their history with triggers; their rows still carry no lane.
4. **`clara.merge_counterparties` still takes the counterparty-then-alias lock order.** It is a 0149 splice this ticket may not recut, and after the round-1 fix nothing in the identity lane takes the opposite order, so no cycle exists today. A future writer that locks a counterparty and then writes an alias would reopen the class; the rule belongs in the counterparty lane's README when someone owns it.
5. **A cell for the three door dialogs' shared draft rule.** Round 1 made `AddCounterpartyAliasDialog` discard its draft on success (it re-offered an alias the door would refuse `CLR23 alias_collision`); the rule — survive a refusal, discard on success, re-seed only where the fields are current values — is written in all three headers but only the identifier dialog's half is celled.
6. **A lane-mock lint for the body-drain hazard.** `e2e-fixture-ownership.test.ts` measures which *subjects* a mock answers for; it cannot see that a mock consumed a request body before deciding. That defect cost this lane two full walk runs; a static check ("no `await readJson` before the verb switch") would catch the next one.

## Unverified, and why

- **Everything hosted.** Nothing here has run anywhere but this machine — **hosted evidence pending**.
- **No World e2e leg, deliberately.** Every identity door is `_human_ctx`-fronted and granted to `clara_authenticated` alone, and gap-647's slice (F) — the one arm that would have recut the `clara_runtime`-only `get_knowledge_pack` — is struck by the brief. There is no durable-execution claim to make or to miss.
- **Host contention is real and I have not separated it from the code.** The walk's first cell failed once with the sign-in redirect not completing inside 60 s *while `pnpm lint` ran*; alone that cell takes 8–20 s and the file is 17/17. THREE `apps/web` cells failed under a whole-suite run and every one passes in isolation: `components/clara/thread-live-clarify.test.tsx` **2/2** (the known flake, WORK-ORDER rule 9), `components/clara/onboarding-checklist.test.tsx` **14/14** and `lib/clara/use-clara-thread-stop.test.ts` **25/25** (the same signature, neither previously named). All three re-runs are reported and none was "fixed".
- **Known Windows-only reds #707 and #693 were not touched.**
