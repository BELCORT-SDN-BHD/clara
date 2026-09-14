# `chatTurn_v19` — STANDARDS + FROZEN-LAW review

Target `impl/v19-chat-turn` @ `fbd77ea4`, base `integration/wave-2` (`3adc3043`). Read-only; worktree
left clean (`git status --porcelain` empty, HEAD unchanged). Rig `rigv19` 55455.

## Verdict: **MERGEABLE** — 0 BLOCKER, 2 SHOULD, 4 NOTE.

## SAFE, with evidence

- **Frozen law holds.** `check-frozen-workflows.mjs` → `OK — 272 frozen file(s) verified …
  (append-only vs origin/main); 50 "use workflow" module(s) all frozen+registered`;
  `--compare-base origin/main` → `OK — 264 existing entr(ies) retain the same hash and deployed
  flag; 8 addition(s)`. Both selftests and `check-worker-paths.mjs` exit 0.
  `git diff integration/wave-2...HEAD --stat -- packages/runtime/workflows frozen-workflows.json` =
  6 new `chatTurn.v19.*` + `registry.ts` (+35/−2) + manifest (+32/−0). No v1…v18, no `claraWork.*`,
  no `deployed:true` row touched.
- **Byte-diff v18→v19 (all six files, `diff -u`):** every hunk is a header restatement, the two new
  tools, `loadKnowledgeContextStepV19`, the `knowledge_receipt` declaration/promotion/dedupe arm,
  the `chatturn-v19` stamp, or a vNN rename. Nothing else. C-19 terminal set unchanged (correct:
  `start_periodic_adjustment_work`'s terminal card is v18's `work_accepted`).
- **Import closure (script, mirrors `allImportsOf`/`resolveRelImport`):** 38 files, **0 missing from
  the manifest**; the only non-`workflows/` members are `lib/knowledge.mjs` and
  `lib/periodic-adjustment-basis.ts`, both now frozen. No `node:` or `require(` in either (the one
  grep hit is the comment recording the removed `node:crypto`).
- **Real World turn:** `PGDATABASE=clara_rt_test RELAY_TEST_MODE=1 WORKFLOW_POSTGRES_URL=… node
  tests/chat-turn-v19-e2e.mjs` → `PASS (4 legs)` after `pnpm --filter @clara/runtime build` — Work
  posted in 5816 ms, unchanged `clara-work/v2` bundle, particulars absent from the run's prompt,
  record readable through the human door, both cards durable.
- **Registry:** exactly the five provenance edits; v1…v18 still exported;
  `check-workflow-bundle.mjs` → `OK … chatTurn pinned at v19 … 50 superseded body(ies) still ship`.
- **Parity:** `check-parts-parity.mjs` → `OK`, `emittable={… knowledge_receipt}`; new exemptions are
  3 specific fingerprints (2 byte-identical to v18's) + 1 re-fingerprint, each with a reason.
- **Tool-injection negative control (mine, measured):** hostile tool-shaped JSON in a record value,
  a memo-shaped string value, and on the pack envelope → roster stays 35 tools in all three; envelope
  fields are not rendered at all. Both new schemas reject unknown keys (`unrecognized_keys`);
  `source_kind` rejects `document_extraction`; the union rejects an unknown `purpose`.
- **Knowledge step:** `unavailable` renders `Client knowledge unavailable: <reason> / <code>` plus
  "This is a READ THAT DID NOT SUCCEED, not a client with nothing recorded"; empty-ok renders
  positively; 75 records → 60 shown + "TRUNCATED view"; longest line 349 chars (300-char value cap);
  `p_firm` passed; `knowledge_version` stringified.
- **Suites:** v19 units 28/28; runtime batch (registry-view, chatturn-v18, fs7-v17, p6-1-v16,
  knowledge-lib, periodic-adjustment-unit, built-bundle-gate) 96/96; **whole `apps/web` 3649 /
  3647 pass / 0 fail / 2 skip**; `pnpm typecheck` and `pnpm lint` exit 0.
- **Census waiver:** key and scope unchanged; only the `reason` string moved v18→v19; the rejected
  scoping alternative is argued in place, and the ruling is filed as **#810 (OPEN)**, not done.
- ARCHITECTURE §10 (line 591) records the frozen-closure hash-lock consequence — closing #631's SHOULD.

## SHOULD

1. **Untriaged scope.** `gh issue view 796` → `state OPEN, labels [needs-triage]`, yet v19 implements
   it: `periodic-adjustment-basis.ts` +93/−3 (new `advance_account_code`/`advance_cents`, three new
   local refusal arms, a changed derived-leg split) and one re-fingerprinted parity tuple. Tested
   (`v19.adjustment.rig` `payroll/advance` passes 0194's own asserts) and documented, but it is not in
   reports/643-final.md's "What chatTurn_v19 must wire". Owner should ratify and close #796 on merge.
   Behaviour note: `settled + advance >= amount_cents` now refuses locally, so a *fully settled*
   obligation is unexpressible — same outcome 0194 gives, moved earlier (#721 shape), but it is new.
2. **All 8 new manifest entries carry `"note": ""`.** Neighbours don't: `chatTurn.v18.ts`'s entry
   carries its provenance *and* `DEPLOY ORDER: migration 0178 must be live BEFORE …`. v19's owed
   direction (0192 + 0194 first) lives only in `registry.ts` and ARCHITECTURE — not in the file the
   `--lock-deployed` ceremony reads. Fill the notes before the ceremony.

## NOTE

1. `WORK_ACCEPTED_PURPOSES_V19` (`chatTurn.v19.parts.ts`) is exported and read by nothing; its
   docblock claims "so a census can assert the set". Once deploy-locked it can never be removed.
   (`ClaraPartV18Additions` is the same, so the shape has precedent — the unfulfilled claim does not.)
2. `chatTurn.v10.impl.ts:317` does `await import("node:crypto")` inside `mintHookTokenStep` and is now
   in v19's closure. Proven safe (v10…v18 deployed; this e2e ran), but `knowledge.mjs`'s new header
   states the rule as "NO `node:` IMPORT LIVES IN THIS FILE" without distinguishing a module-level
   static import (fatal, measured) from a dynamic one inside a `"use step"`. A later hand could read
   that as licence to "fix" a deployed body.
3. `WorkCards.tsx:175` renders `part.purpose` raw, so the new purposes surface as
   `periodic_stock_adjustment` / `payroll_obligation`; no `en.json` keys were added. No regression
   (`journal_entry` is raw today).
4. `remember_client_information`'s `value`/`applies_when` accept an open
   `z.record(z.string(), z.unknown())` with no size bound on the object branch (string branch capped
   at 4000). Top-level `.strict()` verified; the door owns the value shape.
