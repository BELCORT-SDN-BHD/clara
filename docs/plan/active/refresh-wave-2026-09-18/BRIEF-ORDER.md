# Brief-writing order — wave 2026-09-18 (one brief per ticket, from DECISIONS + the gap map)

You are writing the implementation brief `docs/plan/active/refresh-wave-2026-09-18/brief-<n>.md` for ONE ticket.
The brief is the single document an implementer reads first; it must be complete, exact and buildable under
`WORK-ORDER.md` and `RIG.md` without asking anyone anything. READ-ONLY on every tracked file except the one brief
you write. Never touch `C:\Users\zhant\Desktop\clara-wt\*`. Do not spawn subagents or forks. Maximum effort.

## 1. Read, in this order

1. `DECISIONS.md` in this folder — §0 (the owner-facing rulings), §1 (frozen-body plan), §2 (YOUR migration number,
   file stem, objects, recuts), §3 (shared-surface ownership and the CONTEXT terms your ticket writes), §4 (evidence
   law), §5 (riders / non-goals), §6 (overrides), §7 (effort). **Binding.** Where your gap map's recommendation
   differs from DECISIONS, DECISIONS wins and the brief says "orchestrator ruling — supersedes gap-<n> Q<k>".
2. `SYNTHESIS.md` in this folder — the cross-ticket verification (what was re-verified, shared files, overlaps,
   disagreements). Use its path:line facts; where it and DECISIONS disagree, DECISIONS §6 rules.
3. `gap-<n>.md` — your ticket's reconciled census. Every AC row, every historical row, every test cell, every risk
   and every "unverified" item must reappear in the brief with a disposition.
4. `WORK-ORDER.md`, `RIG.md` (the rig row for your ticket: worktree, branch, PG port, db, Playwright triple),
   `GAP-ORDER.md` §2 (house facts).
5. The ticket (`gh issue view <n> --comments`) and the appendix C / D rows for its journeys and components
   (scratchpad `spec/appendix-C-journeys.md`, `appendix-D-components.md`).
6. `../refresh-wave-2026-09-15/brief-649.md` and `brief-640.md`/`brief-643.md` under `../refresh-wave-2026-09-14/`
   as the SHAPE, and the sibling deliveries the gap map names (`git show --stat <sha>`) for the house idioms the
   implementer must copy (migration header, prestate pins, tail assertions, gate module, rig-meta cohort, db battery
   personas, runtime World leg, web unit files, e2e mock + walk + fixture-ownership rows).

## 2. Write `brief-<n>.md` in exactly this shape

```
# Brief: #<n> — <one-line title in the ticket's own words>

## Orchestrator decisions (binding)
- Migration `NNNN` only, ONE file `packages/db/migrations/NNNN_<stem>.sql` (or "NO migration" for #642): objects,
  doors with full signatures + floors + grants, recuts with creation/splice history and "pins MEASURED on your rig",
  tail assertions, gate module name, rig-meta cohort.
- The frozen-body rule for this ticket: what ships now, what is a successor contract (name the body), the NEW
  non-frozen modules this ticket writes and that will freeze at the cut.
- Every DECISIONS §0 ruling that touches this ticket, restated in one line each with its D-number.
- Ownership (§3): files this ticket OWNS, files it may touch with ONE hunk, files it must NOT open, the CONTEXT terms
  it writes, the boundaries with the other nine tickets and the open follow-ups (by number).
- Non-goals stated in code comments and the report.
- Playwright port triple and rig row (verbatim from RIG.md).

## 1. Current state
DB / Runtime / Web / Tests — the gap map's census, condensed, every claim with path:line.

## 2. Gaps / rows
A table: every AC and every historical obligation id → to build / partial (named residual) / verify-only /
descoped (authority) — with the evidence pointer the implementer must produce.

## 3. Slice (one branch)
Migration (object by object, in the order the file is written: header → prestate pins → objects → grants → events →
tail → gate module → cohort) · Runtime (new modules, route edits, the exact successor contract stanza) · Web (routes,
components, states: loading / successful-empty / no-results / partial-stale / invalid-saving / denied / failed /
cancelled-recovery; 320px; 200% zoom; keyboard + focus return; SR names; reduced motion; stable URL/Back; drafts;
which shadcn primitives, installed how) · Docs (CONTEXT terms, READMEs, never PRD/ARCHITECTURE).

## 4. TDD seams (red first)
Numbered cells `p<n>.<area>.<name>` with the red-first reason each; the runtime World leg and its exact command;
web unit files (each → manifest.txt); the Playwright walk + mock + every RPC verb the mock answers; the census
suites that will red and how the branch registers to keep them green.

## 5. Risks
Merge collisions (exact files, whose hunk wins), blast radius of every recut, census suites, host-contention notes.

## 6. Effort and rig
Effort letter with reason; rig row; the exact commands to run before the final report (typecheck, lint, whole
apps/web suite, operation-census + rig-isolation when SQL functions are added, parts-parity + frozen check when a
frozen-reachable module is touched, the db battery with the 40 gate flags, the World legs).

## Verifier findings not applied
Filled by the reconciler.
```

Rules for the text: exact signatures, exact refusal tokens (`CLRxx` + `detail.reason`), exact file paths, exact
argument orders; "measured on your rig" wherever a pin or a live body is involved; every "do not" carries its reason
(a census cell, a ruling, a lock order). Length is not a virtue — completeness is; brief-649.md is ~130 lines and
that is the right order of magnitude. Return the JSON summary the schema asks for.
