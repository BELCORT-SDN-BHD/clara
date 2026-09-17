# Wave 2026-09-15 — the successor cut's SECOND fix round (`successors-review-2.json` R1, R2)

Branch `integration/wave-2026-09-15`, worktree `C:\Users\zhant\Desktop\clara-wt\int`, on top of the
integration-fix-round-1 tip **`4db773c4`** (the work order's `12cdc528` is the successor-cut commit
itself — the branch has moved three commits past it: the `origin/main` merge + renumber, the re-base
fix round, the cut's first fix round, and integration fix round 1). This round is **`c681b58e`** — **one
commit, three files, +166 / −23.** Nothing pushed, no PR, no ticket worktree touched, **no migration written or edited**,
`docs/PRD.md` and `docs/ARCHITECTURE.md` untouched. `--lock-deployed` has still NOT run, which is
what keeps a frozen-but-not-deploy-locked body re-cuttable.

**Headline.** R1 was a real behaviour red and is closed at the precedence the DATABASE holds, not
the one the module reasoned about: `clara.get_knowledge_pack` appends the LEGACY `clara.client_facts`
rows after the governed ones, both `scope_kind:'client'`, and 0192 says in its own body that the
legacy row is "the value the ESTATE acts on". The fold now prefers it. R2 was a false provenance
sentence in three frozen-manifest notes; it is corrected as **prose only** — no file's bytes and no
`sha256` moved, including the one `deployed: true` entry involved.

**Everything below is LOCAL. Hosted evidence: none, anywhere in this wave.**

---

## 1 · R1 — the legacy `client_facts` row is the one in force, and the fold now says so

### 1.1 · The finding, and what it decides

`knownFactsFromPack` (`packages/runtime/workflows/interview.v4.known.ts`) chose the FIRST row under a
key and then stopped as soon as that row was `scope_kind:'client'`. F5 made client-over-firm explicit
but left the precedence that actually decides two of the six mapped keys. The winner under a key is
**the value that SKIPS a question**, so this was the interview recording — and the commit ceremony
later reading — a fact the rest of the estate does not act on.

### 1.2 · Measured, in this order

**STRUCTURE — the pack is built in two steps and the second one is the governing one.**

| measurement | where |
|---|---|
| the governed rows are aggregated `jsonb_agg(j order by knowledge_key)` — by key alone, no tie-break | `packages/db/migrations/0192_client_knowledge_records.sql:1502` |
| the legacy rows are CONCATENATED afterwards: `v_rows := v_rows \|\| clara._knowledge_legacy_rows(v_firm, p_client)` | `0192:1524` |
| every legacy row carries `'authoritative', true` | `0192:1072` (the builder `clara._knowledge_legacy_rows`) |
| and the comment two lines above it states what the flag MEANS: this file "adds a register BESIDE clara.client_facts and does not dual-write, so for every one of the five carried keys the value the ESTATE acts on is still the legacy one" | `0192:1069-1071` |
| the four readers that act on it | `get_context_pack` 0055:765 · `_close_gate_closing_stock` 0056:1283 · `_tf_counterparty_name_only_guard` 0062:226 · `_bank_registry_ledger_state` 0121:4797 (0192's header decision 1 names them) |
| a governed record of the same key NEVER shadows the legacy one — asserted key by key, by the estate's own battery | `packages/db/tests/knowledge-legacy-readers-converge.test.mjs`, cell `c784.04` captures EXACTLY this pack (a legacy `entity_type` + a governed `entity_type`) and asserts nothing moves |
| the governed rows carry no `authoritative` key at all (`clara._knowledge_row_json` emits `editable`/`correctable`, never `authoritative`) | 0192, `_knowledge_row_json` |

**THE OVERLAP, on the live 0224 chain** (`rigint3` `127.0.0.1:55621` / `clara_int3`, 219 migrations,
`0224_preview_invite`):

```
knowledge_keys     accounting_basis, banking_arrangement, coa_seed_decision, customer_identity_policy,
                   default_currency, entity_type, financial_year_end_month, mpers_eligibility, msic,
                   reporting_framework, sst_regime, trade_nature, turnover_band          (13)
client_fact_keys   banking_arrangement, customer_identity_policy, entity_type, msic, trade_nature  (5)
OVERLAP            all five — 0192 carries the legacy catalog into knowledge_keys BY VALUE
```

Two of those five are in `KNOWN_FACT_KEYS`: **`entity_type` and `msic`**. The other three
(`trade_nature`, `banking_arrangement`, `customer_identity_policy`) are exactly the three the module
header already enumerated as "no segment at all" — so the legacy set was in view when these two were
not.

**THE LIVE DRIVE — the real door, the real pack, the real fold.** A throwaway world on the same
0224 chain: one legacy fact through `clara.record_client_fact` (`entity_type = "llp"`), one governed
record of the same key through `clara.capture_knowledge` (`entity_type = "sdn_bhd"`), then
`clara.get_knowledge_pack` read as `clara_runtime` with `p_firm` — the same call
`loadKnownFactsStep` makes:

```
THE PACK, IN THE ORDER THE DATABASE RETURNED IT:
  [0] entity_type = "sdn_bhd"  source_kind=user_statement       scope=client  authoritative=undefined  knowledge_version="1"   record_id=e9ddbd29-…
  [1] entity_type = "llp"      source_kind=legacy_client_fact   scope=client  authoritative=true       knowledge_version=null  record_id=31fa34ae-…
pack.knowledge_version = "1"
```

The row that does NOT govern arrives first, and both are `scope_kind:'client'` — so the
client-over-firm rule could never separate them. Wall 1 cannot catch it either: `"sdn_bhd"` and
`"llp"` are both canonical `ENTITY_TYPES_V2` members, so the segment validator accepts either.

### 1.3 · RED FIRST

New cell in `packages/runtime/tests/client-onboarding-v5.test.mjs`, beside F5's four-pack cell and in
its shape — *"the LEGACY client_facts row is the one in force — it outranks a GOVERNED record of the
same key"*. Against the pre-change fold:

```
AssertionError [ERR_ASSERTION]: the authoritative legacy row governs, although the governed row arrived first
  expected: 'legacy-entity_type'
  actual:   'governed-row'
  at tests/client-onboarding-v5.test.mjs:283
# tests 22 # pass 21 # fail 1
```

It is one cell and not five because the finding is one rule: the cell drives the pack's own order
(governed → legacy), the reverse order, a legacy row against a FIRM row, the answer the interview
would actually record (`"llp"`, through `knownAnswer` and the segment's own validator), and two
controls — a governed-only pack still folds to the governed client row, and `default_currency` (not a
carried fact key) is untouched by any of it.

### 1.4 · The fix

`knownFactsFromPack`, one comparison above the two that were already there:

```ts
const inForce = r.authoritative === true || fact.sourceKind === "legacy_client_fact";
if (chosen === null)                        { chosen = fact; chosenInForce = inForce; }
else if (!chosenInForce && inForce)         { chosen = fact; chosenInForce = true; }
else if (!chosenInForce && chosen.scopeKind !== "client" && fact.scopeKind === "client") { chosen = fact; }
if (chosenInForce) break;   // final: 0192's live-row index admits at most one legacy row per key
```

Three things about it, each measured rather than preferred:

* **BOTH SPELLINGS.** The pack states the fact twice — the `authoritative` flag and the
  `legacy_client_fact` source kind — and the sibling module in this same closure keys on both
  (`packages/runtime/lib/knowledge-conflicts.mjs:76` marks
  `source_kind === 'legacy_client_fact' || authoritative === true` as "in force" in the Work lane's
  knowledge block). Two lanes of one cut may not disagree about which recorded fact governs, so they
  now read the same predicate.
* **THE CLIENT ROW IS NO LONGER FINAL.** The old early `break` on a client row is exactly what made
  the defect unreachable by the later rule; the break is now on `chosenInForce` alone, because the
  row that outranks a client row arrives after every governed row by construction.
* **`KNOWN_FACT_KEYS` IS UNCHANGED.** The review offered dropping `entity_type` and `msic` as the
  alternative; §4 says why that was refused.

**The docblock now states the measurement rather than the wish** — the two-step build, both migration
line numbers, the legacy flag's meaning in 0192's own words, the four readers, and the overlap as
measured on 0224 — and the module header's wall 3 gains the one sentence it was missing: two of the
six mapped keys also ride the legacy register.

### 1.5 · One consequence I found with it, and closed in the same commit

A legacy row carries `knowledge_version: null` (0192: a legacy client_fact "has no knowledge revision
to stamp"), so `str(null)` → `""` and the run's transcript read *"…, version , trust asserted)"*. That
wart pre-dates this round — a client whose only row for a key is the legacy one already folded to it —
but the fix makes the legacy row the winner for the two keys most likely to be in that register, so it
would now be the ordinary case. `knownEcho` names the register instead:

```
entity type llp — taken from the client's recorded knowledge (record 31fa34ae-…,
no knowledge revision — the legacy client-fact register, trust asserted)
```

Pinned in the same cell, with a control that a governed row still prints `version 12`. Nothing else
pins that string (`grep "taken from the client"` → one hit, the definition).

### 1.6 · What did NOT change

No migration. No door. No grant. `FA`-style field arrays, `KNOWN_FACT_KEYS`, `KnownFact`'s exported
shape, `knownProvenanceItem`'s answer shape, `segmentAsking`, `priorFromPlanItems` — all untouched.
A pack with no legacy row folds exactly as it did before the change, and the cell asserts that.

---

## 2 · R2 — three manifest notes claimed a consumer that cannot exist

### 2.1 · The claim, and the measurement that refutes it

Two of F3's eighteen notes said the browser imports the frozen module:

* `packages/runtime/lib/accrual-basis.ts` — *"(the web form imports the same module and is NOT frozen
  — only this closure membership locks it)"*
* `packages/runtime/lib/fixed-asset-acquisition.ts` — *"(the web question form imports the same module
  …)"*

and both were copied from `packages/runtime/lib/periodic-adjustment-basis.ts`'s existing #643 note,
which carries the same sentence. **`apps/web` cannot import `@clara/runtime` at all:**

| measurement | result |
|---|---|
| `node -e` over `apps/web/package.json` dependencies + devDependencies for `@clara/*` | **`{"deps":[],"dev":[]}`** — no workspace dependency of any kind |
| `grep -rE "^\s*(import\|export)[^\n]*from ['\"][^'\"]*(@clara/runtime\|packages/runtime)" apps/web --include=*.ts --include=*.tsx` | **zero hits** (and zero `require(…)` hits) — every `packages/runtime` string under `apps/web` is prose in a comment |
| the app says so itself | `apps/web/lib/checkout/stripe-session.test.ts:444-446`: *"`apps/web` cannot import `@clara/runtime` (it is not a dependency; this app builds for Workers off its own set)"* |

So the note pointed at a consumer that does not exist **and away from the real ones**: `apps/web`
keeps hand-maintained MIRRORS that nothing in the freeze closure locks.

| frozen module | the real web-side mirror | what pins it |
|---|---|---|
| `lib/fixed-asset-acquisition.ts` | `apps/web/lib/registers/fa-refusal-field.ts` — its own header says *"WHY A SECOND COPY OF THE MAP … this is a deliberate MIRROR rather than an import"* | `fa-refusal-field.test.ts`, to the DOOR's axis vocabulary (transcribed there from `0041:2970-3033` + `0216 §D`) — **not** to the runtime file |
| `lib/accrual-basis.ts` | `apps/web/lib/accruals/api.ts` — `ACCRUAL_METHODS` / `ACCRUAL_FREQUENCIES` / `ACCRUAL_DAY_RULES` / `ACCRUAL_TIMEZONE` / `ACCRUAL_DAY_OF_MONTH_MAX`, consumed by `apps/web/lib/work/accrual-draft.ts:117` | **nothing.** `grep ACCRUAL_METHODS` finds the two independent declarations and one runtime-side cell (`accrual-basis-unit.test.mjs:83`); no test compares them |
| `lib/periodic-adjustment-basis.ts` (#643) | `apps/web/lib/work/periodic-adjustment.ts` — *"every rule here is a MIRROR of one the database enforces"* | its own cell, against the same database rules |

The DEPLOY ORDER half of both new notes is correct and was re-verified: `clara.create_accrual_adjustment_for`
is defined in 0222 and `clara.complete_fixed_asset_particulars_for` in 0216, and those are the only
definitions of either name under `packages/db/migrations`.

### 2.2 · The correction, and why it is not an edit to a deployed body

All three clauses now say what is true and what the next hand needs: apps/web does not import it and
cannot, the mirror is named by path, and **this hash lock does not cover the mirror, so a change here
needs the mirror moved in the same commit**. #643's entry additionally carries a dated line saying the
earlier sentence was wrong and that only the prose moved.

`packages/runtime/lib/periodic-adjustment-basis.ts` is `deployed: true`. **Its file was not opened.**
What changed is the manifest's prose field, and the tool treats that field as data it carries rather
than derives:

* `scripts/check-frozen-workflows.mjs:264` — `--update` writes `note: prev.note ?? ""` and preserves
  `deployed: true` ("PRESERVED, never granted").
* the append-only-vs-base comparison (`:416-438`) compares **removal, the deploy-lock flag and the
  hash**. It never reads `note`.
* measured, not argued: `--compare-base origin/main` → **"278 existing entr(ies) retain the same hash
  and deployed flag; 18 addition(s); 3 recorded retirement(s)"**, and the three files' `sha256` values
  are byte-identical before and after (`f06a8214…`, `9846bdbd…`, `9670d5b9…`).

The notes were written by hand and `--update` re-run **twice to a measured no-op** (`diff -q` on the
file before and after the second and third `--update`: identical), so the committed manifest is exactly
what the tool produces.

---

## 3 · Every command, with its result

Node 22.23.2. Every static gate and battery below was run **after** the final source edit; the two
World legs ran against the image built from that same tree.

### 3.1 · Static gates — all exit 0

| gate | evidence |
|---|---|
| `node scripts/check-frozen-workflows.mjs` | `296 frozen file(s) verified … (append-only vs origin/main); 53 "use workflow" module(s) all frozen+registered; 3 retired entr(ies) recorded` |
| `… --compare-base origin/main` | `278 existing entr(ies) retain the same hash and deployed flag; 18 addition(s); 3 recorded retirement(s)` |
| `node scripts/check-frozen-workflows.mjs --update` ×2 after the hand-written notes | **measured no-op** both times (`diff -q` identical); manifest diff is exactly **4 lines: three notes + one sha** (`interview.v4.known.ts` `64f803de…` → `bb904dda…`) |
| `node packages/runtime/scripts/check-parts-parity.mjs` | OK — reader ⊇ emittable; emittable set unchanged; **no new kind**; `work_result` still `claraWork.v4.impl.ts:558` |
| `pnpm --filter @clara/runtime build` | exit 0 — nitro, **230 steps, 53 workflows**; the `@ai-sdk/*` source-map ERROR lines are the pre-existing noise the cut's report named |
| `node scripts/check-workflow-bundle.mjs` | OK — `12 pinned class(es) … 53 superseded body(ies) still ship for parked runs, chatTurn pinned at v20 with its step directive, engine stamp and freeform_result emitter (40 checks)` |
| `node scripts/check-worker-paths.mjs` | OK — 2 spawn sites through `resolveLibWorker`; built bundle verified against the deployed layout |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 — the whole chain (freeze-lint + selftests, `check-dead-citations`, the 13 sibling checkers, the 43-case root guard battery, every workspace's own lint) |

### 3.2 · Unit batteries

| run | result |
|---|---|
| `node --test --test-concurrency=1 tests/{chat-turn-v20-tools,clara-work-v4,client-onboarding-v5,fixed-asset-acquisition-unit}.test.mjs` | **72 pass / 0 fail / 0 skipped** (71 before this round + R1's cell) |
| neighbours: `coa-interview-v4`, `wave-b-interview-park-ordering`, `chatturn-v18`, `p6-1-parts-parity` (concurrency 1 — the documented cross-file flake) | **54 pass / 0 fail** |

### 3.3 · The touched World legs

Both on **`rigfix` `127.0.0.1:55622`**, each from a database **restored out of the pristine
post-bootstrap master** (`create database clara_wave_b_ci template clara_master`; 0 connections to the
template; chain re-verified at 219 migrations / `0224_preview_invite`, world schemas 2, firms 2). The
touched closure is `clientOnboarding_v5`, so these are its two registered legs; `chatTurn_v20` and
`claraWork_v4` are byte-untouched by this round and their legs were not re-run.

| leg | result |
|---|---|
| `node tests/interview-e2e.mjs` | **INTERVIEW E2E: ALL PASS**, exit 0 — `PASS (a)` client cancel; `PASS (a-firm)` pre-firm cancel + the F1 foreign-cancel 404; `PASS (positive): full 16-segment drive → interview_complete, 17 items, no dupes, revision advanced`; `PASS (p649.interview.sst_park_closed)` |
| `node tests/interview-kill-resume-e2e.mjs` | **INTERVIEW KILL-RESUME E2E: PASS**, exit 0 — *SIGKILL mid-park → same-index re-park, byte-identical checkpoints, exactly-once drive to complete* (F2's 16/17 literals still hold on a real engine across a hard kill) |

**What these legs prove, and what they do not.** They prove the fix regressed nothing in a real
engine's drive of the touched body. They do **not** exercise the new precedence: the rig carries zero
`clara.knowledge_records` and no `clara.client_facts` for the e2e's own client, so `knownFactsFromPack`
folds to `{}` there — the same gap the first fix round recorded for F5 and F7. The closest thing to a
World proof of R1 is §1.2's live drive: the real door, the real `get_knowledge_pack` body on the real
0224 chain, and the real fold, in one process.

---

## 4 · What was NOT applied, and what is owed

1. **The review's alternative for R1 — dropping `entity_type` and `msic` from `KNOWN_FACT_KEYS` — was
   refused.** It removes the feature for the two keys a Malaysian firm is MOST likely to have already
   recorded (they are two of the five that predate the knowledge register entirely), and it leaves the
   two lanes of this cut still disagreeing about which row governs. The precedence fix makes the
   interview agree with `knowledge-conflicts.mjs`, with `get_context_pack` and with `c784`'s asserted
   invariant, and costs one comparison.
2. **Nothing in R1 or R2 required editing a deployed body or a migration on `origin/main`, and nothing
   of that kind was done.** R1 is a frozen-but-not-deploy-locked body (`interview.v4.known.ts`), which
   is why it is still a `--update` away. R2's one `deployed: true` entry is `periodic-adjustment-basis.ts`
   and **its file was not touched** — only the manifest's prose field, which the tool preserves and the
   base comparison never reads (§2.2, with the compare-base line that measures it).
3. **The accrual mirror is unpinned, and this round did not pin it.** `apps/web/lib/accruals/api.ts`
   restates `lib/accrual-basis.ts`'s vocabulary and no test compares the two. Writing that cell means a
   web-side test importing a runtime module, which is the very thing `apps/web` cannot do, so the honest
   options are a generated file or a db-side cell asserting both against 0222's CHECK. **Recorded as a
   follow-up, not attempted here** — the note now at least tells the next hand the mirror exists.
4. **The three other carried legacy keys stay out.** `trade_nature`, `banking_arrangement` and
   `customer_identity_policy` have no interview segment; nothing about them changed.
5. **Still open from the first round, unchanged:** #649's write-back of a corrected known fact;
   #639's particulars question has no positive World leg; F6's wrapped-open branches are unreached by
   any World leg; `lib/capability-registry.mjs:30`'s stale "claraWork_v3" comment (deployed, named not
   edited).

---

## 5 · Unverified / recorded honestly

* **Everything hosted.** No hosted run exists for any part of this wave and none was attempted.
* **`--lock-deployed` has not run.** The eighteen entries are hash-locked against `origin/main` and not
  deploy-locked, which is the correct state before the image is live.
* **The full runtime unit suite (`pnpm test`, ~2 618 cells) was not re-run this round.** Four batteries
  plus four neighbours were. The suite's seven documented non-cut reds (`pg_dump ENOENT` ×4, #693's
  EICAR, two shared-database contamination cells) are unchanged by anything here — nothing in this
  round touches a registry, a pin, or a second body.
* **`apps/web` was not re-run and not touched** (`git diff --name-only` under `apps/web`: empty).
* **Rig hygiene.** §1.2's live probe **wrote** a throwaway world into `clara_int3` on `rigint3` (one
  firm, four users, two clients, one `client_fact`, one `knowledge_record`) — that database already
  carries 783 firms from the re-base's estate-suite run and is a disposable rig, but the first fix
  round recorded `clara_int3` as read-only and this round changes that. On `rigfix`, `clara_wave_b_ci`
  was dropped and re-created from `clara_master` twice; `clara_master` and `clara_rt_test` were not
  written to. `CLARA_RIG_ALLOW_RESET` and `CLARA_RIG_ALLOW_ROLE_SWEEP` were never set, and **no second
  from-scratch chain was applied on any cluster**. `rigfix` (55622) and `rigint3` (55621) remain on
  `WAVE-DIGEST` §5's rig-cleanup census.
* **`e2e-run/`** was already untracked in the worktree when this round started (an earlier round's
  browser-sweep scratch) and is **not** in this commit.
