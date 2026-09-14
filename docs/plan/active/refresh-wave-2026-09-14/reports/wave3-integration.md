# Wave-3 integration — #631 + `chatTurn_v19`

Branch `integration/wave-3` @ **38859f36**, worktree `C:\Users\zhant\Desktop\clara-wt\integration3`,
base `integration/wave-2` (d4755724). Clean; nothing pushed, no PR, no other worktree touched.
Rig **rigw3** `:55458` — `clara_w3` (chain 0001…0195, **190 migrations**, seeded, 190s) + `clara_rt_test`
(template copy + bootstrap).

## THE BLOCKER, first, because it decides whether wave 3 ships

**Once 0195 is live, a Work parked on `claraWork_v1`/`_v2` can never post.** Not rollback (#631
recorded that); a **forward** cutover. #637's drill, re-run at v2→v3, found it.

Mechanism: the Work lane's `prepare_work_egress_dispatch` / `consume_egress_dispatch` exist **only** in
`claraWork.v3.impl.ts:280,291` (repo-wide grep, one non-test site), and 0195's recut
`_record_journal_entry_core` refuses CLR13 `egress_not_authorized` without a **consumed** authorization on
`(work, run)` — itself pinned green by `w631.write.refused` (`work-journal-post.test.mjs`, 32/32 here).

Measured: W1 admitted by build A on `claraWork_v2`, resumed **into its own body** inside build B (run name
invariant — policy (c) holds at the image layer), refused at the write: task `failed`/`error_code=internal`,
Work `error={code:"no_effect",reason:"no_receipt"}`, **0** `operation_receipts`, **0** trace rows for its run;
v3's runs wrote 4 trace rows each and minted the only consent + the only dispatch authorization. Control: the
same drill at v1→v2 on a 0194 chain is ALL PASS (wave-2 CI, #637 closure). The only variable is 0195.

Two secondary facts: the refusal surfaces as **`internal`** (v1/v2 error rosters lack the
`(CLR13, egress_not_authorized)` pair — #631 added it to v3's only); and `rollback-preflight` answers
**ALLOWED**, because it measures which bodies an *image* carries and the refusal is the *database*'s.

**I did not weaken the drill and left it RED.** Making it green would encode "a parked predecessor run is
expected to be refused" as law, which no owner has ruled. `ARCHITECTURE` §10 carries the measurement and three
options: **(1)** drain the Work lane before applying 0195 (stronger than #815's "ship 0195 with the v3 image");
**(2)** a later migration grandfathering pre-v3 bundles; **(3)** accept the loss and give those runs an honest
refusal face via a **new** post-v2 roster. Until then `db-live-gates`' two-build step reds — the right signal.

## Merges and conflicts (file → what was kept)

**`1cee8670` ← `impl/631-work-egress-trace` (a1c07360).** `registry.ts`, `frozen-workflows.json` (273),
`parts-parity-exemptions.mjs`, `action.yml`, `en.json`, `manifest.txt`, `package.json` gates auto-merged.
Resolved: `buildInfoRoutes.ts` + `l9-build-info.test.mjs` → #637's `bodies`/`pins` **and** #631's v3 bundle,
pinned first · `startWorld.ts` → v3 banner **then** #637's moved-provenance comment (now "three banners") ·
`rig-meta.mjs` ×3 → both cohorts, both human-fn spreads, both `cohortFailures` calls · `en.json`,
`work-detail.tsx` imports, ARCHITECTURE §11 → union. **Two silent half-merges caught by hand:** auto-merge
gave `claraWork: claraWork_v3` but left `workflowBodies` without `"claraWork_v3"` and `workflowPins` at
`"claraWork_v2"` (#631's base predates #637's exports) — all five canonical edits now present, which is what
let the drill's rewrite apply. `action.yml` → work-egress moved **before** the two builds.

**`7f154b2f` ← `impl/v19-chat-turn` (fbd77ea4).** `registry.ts` pins → **both** (`chatTurn_v19` +
`claraWork_v3`) · `frozen-workflows.json` → both additive pairs, **281** entries, sorted · ARCHITECTURE §4 →
#623 + #631 + v19 paragraphs, "claraWork v2"→v3 · §11 Agent row → union. `action.yml` → chat-turn-v19 moved
before the two builds. Final leg order: existing → **work-egress** → **chat-turn-v19** → two-build →
plan-occurrence → **world-guard LAST**.

**`3cc046f8` ← `integration/wave-2` (03018948), the boot-race fix.** Four legs conflicted identically: kept
wave-2's line-buffered `ingest`/`serving`/stdout capture **and** #631's v3 banner target.

## Integration commits

| sha | what | cells / evidence |
|---|---|---|
| `3cd935bb` | (a) SHOULD-2 notes on all 17 new manifest entries (v19: 0192+0194 first; v3: 0195 first, ship together, #815) — `--update` carries `prev.note`, checker OK · (b) NOTE-2 `knowledge.mjs` header: module-level static `node:` import fatal vs `await import()` in a `"use step"` (`chatTurn.v10.impl.ts:317`), and "NON-FROZEN" corrected · (c) NOTE-3 `WorkCards.tsx` → `purposeLabel` + 3 keys · (d) NOTE-1 census · (e) Diagnostics into the Activity tab | `work-cards.test.tsx` "labels EVERY purpose 0194 admits" 12/12 · `p6-1-parts-parity.test.mjs` 22/22 (+ the census + its literal roster, which was **red at the tip**: neither branch ran this file, so `knowledge_receipt` and the `chatTurn.v19.*`/`claraWork.v3.impl.ts` sites were missing) · `work-detail.test.tsx` 42/42, the new 3-arm cell **red first** (with the mount left above, it fails *and* takes #624's two Sources cells with it) · 4 walk cells open the tab via one helper |
| `ca460e4b` | `chatturn-v18.test.mjs` pin cell follows claraWork to v3 | 16/16 |
| `9a333c19` | 0195's `record_work_execution_trace` joins the S5.25 arm-(D) roster, **pinned with its reason** (an INSTANT default, `least(now(), …)`, never a date); the other seven 0195 bodies probed and measured OUT | x42b2 ×9 **17/0/1** · x42b0 + firm-scope-db-pins + rig-isolation **28/0/1** |
| `c02302fc` | drill: bundle ids + parking shape derived (5 surviving literals); failing image's log now printed; ARCHITECTURE §10 blocker | see above |
| `38859f36` | `journal-work-mock.mjs` answers #640's `get_work_plan_origin` (SQL NULL — a hand-composed Work has no plan), declared in `SHARED_RPC_VERBS` | `e2e-fixture-ownership` 15/15; walk 18/1 → **19/19** |

## The drill

`[tb-e2e] drill pair derived from registry.ts: claraWork_v2 (build A) -> claraWork_v3 (build B)`; A 50 bodies,
B 51; `rewriteRegistryToPrevious` applied all five steps (registry shape canonical). **FAIL** at W1's resume —
the blocker above. #637's "re-run with no edit" claim was false twice over: three `"clara-work/v1"` + two
`"clara-work/v2"` literals, and an "asymmetric pair" that was a v1-vs-v2 fact (v1 bare clarify /
`answer_interruption`; v2+ typed question / `answer_work_question`) sold as a property of cutovers.

## Counts (all LOCAL; hosted evidence pending)

**db, rigw3/`clara_w3`, verbatim 27 gate flags:** egress+journal+adjustment 6 files **133/0/0** ·
census+checkout-gate-c3+visibility **87/0/0** (`operation-census` **10/10**, waiver kept — #810) · clock
censuses as above · `rig-isolation` 20 pass + T19 skipped (no reset flag).
**runtime:** v19+v3 units (`work-trace-redaction`, `work-journal-db`, `chat-turn-v19-tools`,
`-knowledge-context`) **72/0/0** · `work-bundle`+`chatturn-v18`+`knowledge-lib`+`periodic-adjustment-unit`+
`built-bundle-gate` **68/0/0** · `ready`+`rollback-preflight`+`registry-view`+`l9-build-info`+`work-errors`(×2)+
`control-work-*`+`reconcile-work-unit` **137: 118 pass / 0 fail / 19 skip** · `p6-1-parts-parity` **22/22** ·
world guard **4/4** (last on `clara_rt_test`).
**World e2es:** work-egress **PASS (3 legs)** · chat-turn-v19 **PASS (4 legs)** · work-journal · work-cancel ·
periodic-adjustment · work-question · plan-occurrence — all **PASS**. Two-build: **FAIL**.
**Gates:** freeze-lint **OK (281 files, 51 modules)**, `--compare-base origin/main` **OK (264 unchanged, 17
additions)**, both selftests OK · parts-parity OK · workflow-bundle OK (chatTurn v19, 51 superseded ship) ·
worker-paths OK (built layout).
**web:** whole suite **3674 / 3672 pass / 0 fail / 2 skip** (206s; the 2 are env-gated `live-provider-auth`) ·
walks `journal-work` **19/19**, `chat-parity` **7/7** (3250/3251/3252) · `pnpm typecheck` **0** · `pnpm lint` **0**.
0194's core body re-hashed post-merge = `eca58b99…d4ade` = 0195's pin, untouched; `git ls-files --eol` → no CRLF.

## Unverified

Everything hosted. The whole db estate suite and the browser suite (CI's). The v2→v3 drill's blocker is
measured but **unruled** — no owner decision, and `#815` as filed does not yet carry the drain requirement.
`#796` ratification (v19 SHOULD-1) is recorded in ARCHITECTURE §4, not obtained.
