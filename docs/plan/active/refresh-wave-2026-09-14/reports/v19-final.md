# `chatTurn_v19` — the shared successor (#643 + #644) — FINAL REPORT

**Branch** `impl/v19-chat-turn` · worktree `C:\Users\zhant\Desktop\clara-wt\v19` · **clean**, never
pushed, no PR. Branched from `integration/wave-2` at `c32e5f73`; **merged the new tip `3adc3043`**
(merge `920095a7`). **HEAD `fbd77ea4`.** Mine, oldest first: `781e39eb` the closure · `8334e24e`
registry + parity + manifest + card · `66d0cf55` pinned-version cells + waiver review · `2af7ebbe`
web unit cells · `0e29c0d9` World e2e + the `node:crypto` finding · `93e09dfc` docs · `f5baa01d`
walk cell · `920095a7` merge · `50606ecf` bundle-gate pin · `fbd77ea4` waiver scoping answer.

## Per roster item

1. **`start_periodic_adjustment_work` — done.** Schema/builders are #643's non-frozen module by
   import (asserted identical, not a copy). Admits through the 9-arg
   `clara.admit_periodic_adjustment_work` with `clara_interpreted`, `[{kind:'chat_task',task_id,
   session_id}]` (session read off the task row), `stableOpKey(taskId,tool,input)`; result mapping is
   `runStartJournalWork`'s. **#721 shape**: a missing particular refuses locally, by field name,
   before admission. **#796 closed**: `advance_account_code` (a 0194 particular, emitted) **and**
   `advance_cents` (derivation input only — `settled_cents`'s own N3 rule), with local refusals
   mirroring 0194's `advance_leg`/`distinct`/`liability_leg`.
2. **`remember_client_information` — done.** Wraps `capture_knowledge_for` through
   `lib/knowledge.mjs` `captureKnowledgeFor`. The `source_kind` enum is the two a chat can honestly
   claim; the DOOR enforces registry, value shape and trust, and its refusal — code, reason and the
   rest of its `detail` — reaches the model verbatim (`knowledge.mjs` now carries the whole detail;
   additive). The receipt part names the record id and version.
3. **Knowledge context step — done.** `loadKnowledgeContextStepV19` beside v10's frozen step
   (widening that would edit a deployed body). `readKnowledgePack(sql,{clientId,purpose,firmId})`
   with the firm binding; `ok` renders bounded (60 records, 300 chars/value, truncation stated) with
   trust + source labels and legacy rows marked *in force*; `unavailable` renders "Client knowledge
   unavailable: <reason>" and says it is not "nothing recorded". `knowledge_version` rides back as
   TEXT for #631's trace.
4. **Parts — done.** `chatTurn.v19.parts.ts` in the declarer set; `knowledge_receipt` declared once;
   `work_accepted`'s purpose widened **by type reference**, not a second declaration. Exemptions:
   v19.ts's three AI-SDK protocol discriminants (two fingerprints byte-identical to v18's) + ONE
   re-fingerprint of #643's payroll spread. Web reader, catalog (31 kinds), `KnowledgeCards.tsx`,
   `en.json`, manifest entry.
5. **Registry/manifest — done.** Five provenance edits; v1..v18 still exported. `--update` (local)
   added 8 entries, additions-only vs `origin/main`, **not** deploy-locked. `freeze-lint-checks.mjs`
   needed no edit (its parser accepts v19); `check-workflow-bundle.mjs` is registry-derived and
   reports "chatTurn pinned at v19". **No literal chat bundle/prompt digest pin exists to extend** —
   the only v18 literal was that gate's version string, now v19 (`50606ecf`); the digest pins here
   are claraWork's.
6. **Census waiver — NOT retired; it cannot be.** Below.
7. **Docs — done.** ARCHITECTURE §4/§5/§7/§10/§11 (three rows), CONTEXT.md (+*Knowledge pack*), PRD
   (both behaviours). Hosted written as pending.

## Tests (local only; rig `rigv19` 127.0.0.1:55455/`clara_v19`, frontier 189)

- `node --test tests/chat-turn-v19-tools.test.mjs` (PG env) → **17/0/0**, incl. a rig arm handing the
  built `p_adjustment`/`p_basis` to `clara._assert_adjustment_basis` and
  `_assert_adjustment_relationships` themselves.
- `node --test tests/chat-turn-v19-knowledge-context.test.mjs` → **11/0/0**.
- Runtime batch (`chatturn-v18`, `fs7-v17-chatturn`, `p6-1-chatturn-v16`(+`-db`), `registry-view`,
  `work-bundle`, `knowledge-lib`, `periodic-adjustment-unit`, `l9-build-info`, `reconcile-fa-unit`,
  + the two above) → **172/170/2**; after the v19 pin fix **one red left**,
  `p6-1.db.freeform.read-id-high-sequence` (see below). That file alone on pristine `clara_rt_test`:
  **13/13**.
- `node tests/chat-turn-v19-e2e.mjs` (real World) → **PASS, 4 legs**, run twice (pre/post merge).
- `work-journal-e2e` · `work-cancel-e2e` · `periodic-adjustment-e2e` · `interview-e2e` → all **PASS**
  (interview red once as 4th engine in a batch; green alone).
- freeze-lint + both selftests · parts-parity · workflow-bundle · worker-paths → **exit 0** each
  (272 frozen files; 50 `use workflow` modules).
- db `operation-census.test.mjs` with the verbatim `$GATES` → **10/10/0** (pre-merge). Post-merge the
  gate is blocked (below); the census **script** `--strict` → **exit 0**, `called_ungranted` 2 before
  waivers / **0 after**, every other label 0.
- `knowledge-cards.test.tsx` + `catalog.test.tsx` → **44/44/0**.
- Whole `apps/web` suite post-merge → **3649 / 3646 pass / 1 fail / 2 skip** (197 s). The fail is
  `thread-live-clarify` "two clarify rounds" — a bounded-wait timeout, **2/2 alone**, already named
  as a load flake in HANDOFF.
- `CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3230 CLARA_E2E_NEXT_PORT=3231
  CLARA_E2E_RUNTIME_PORT=3232 pnpm --filter @clara/web e2e chat-parity` → **7 passed (44.3 s)**.
- `pnpm typecheck` · `pnpm lint` → **exit 0** · **exit 0** (wave-2 fixed leak-scan's false positive).

`CLARA_RIG_ALLOW_RESET`/`…_ROLE_SWEEP` never set; no rig reset; no other rig touched.

## The finding the World e2e caught

`lib/knowledge.mjs` imported `randomUUID` from `node:crypto`. v19 importing it puts it in a frozen
closure, which the WDK compiles into a VM with no `require`: **`nitro build` succeeded** and the
first real chat turn died `USER_ERROR / ReferenceError: require is not defined at lib/knowledge.mjs`
inside the workflow, before the tool ran. No unit cell could see it. Import removed; the fallback op
key is Web Crypto or a time+counter composite, and its docblock says neither is the idempotency story
(a durable caller supplies a deterministic key, as v19 does).

## The census waiver

Measured both ways pre-merge: present → 10/10; deleted → `opcen.1` reds naming
`clara.get_journal_entry … chatTurn.impl.ts:112 [alias:read]` — a **live** finding. The current
closure is clean (`chatTurn.v10.tools.ts:477`, carried by v11..v19, uses `get_journal_entry_for`; so
do claraWork v1/v2), so v19 was never what blocked it. **Scoping the census to enqueued bodies was
assessed and rejected**, reasoning written beside the waiver: (1) a superseded body is not dead code
— policy (c) keeps it exported and `check-workflow-bundle` asserts all 50 ship, so a parked
`chatTurn_v1` run executes that tool; (2) the exclusion cannot be narrowed to one site and would drop
every call site in every superseded body — the blanket exemption the fixture's header refuses; (3) it
would make packages/db's census depend on packages/runtime's registry, so a routine repoint silently
changes what it reports. **What it needs is a ruling that `chatTurn_v1` may stop being exported** (a
drain proof `rollback-preflight.mjs` can already produce).

## What #637's v18→v19 drill needs

Registry-derived **for claraWork only**. `deriveVersionPair` reads claraWork's pin,
`buildPreviousVersionImage` is called **without `className`**, and both admission legs are
claraWork-shaped. A chat drill needs a `className` threaded through `rewriteRegistryToPrevious` (its
five match shapes are already generic) and **different legs** — a turn parked on a `clarify` hook,
since chatTurn has no Work row to resume through. The v2→v3 claraWork re-run stays free.

## Unverified / named, not fixed

- **Post-merge `pnpm db:migrate` is blocked on my rig**: the merge changed the *unmerged* 0191, so
  `clara_v19` reports checksum drift and the census **gate test** cannot re-run; 0154's cluster-wide
  role pin forbids a second from-scratch chain on rigv19. 0191's diff moves no census input (its only
  grant/function-matching lines are two `raise notice` strings — checked).
- `p6-1.db.freeform.read-id-high-sequence` is **once-per-database by construction**: it inserts
  receipt id exactly 2^53+1 into the settle-once `clara.freeform_read_log` (delete refused CLR08), so
  a second run on one database always collides. Not v19's.
- **#643's face, named not fixed**: `apps/web/lib/work/periodic-adjustment.ts`'s `derivedLines`
  derives no advance leg while the form offers the control, so picking a staff-advance account there
  earns 0194's `advance_leg` at admission. In ARCHITECTURE §11 and the basis module's foot.
- All **hosted** evidence; the db estate suite and browser suite are the orchestrator's/CI's.
  #707/#693 appeared in nothing I ran.

## Follow-ups worth filing

1. **Retire `chatTurn_v1`'s export** behind a drain proof, so the `get_journal_entry` waiver can die.
2. **`p6-1.db.freeform.read-id-high-sequence` cannot run twice on one database** — it needs a per-run
   id above the poison floor rather than a fixed 2^53+1.
3. **The direct form's advance leg** — derive it plus an `advanceCents` control, or drop the
   `advanceAccountCode` control until the staff-advance register owns it.
