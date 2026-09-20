# Riders work order — common rules for every lane worker

You own ONE lane: a short list of tickets, one git worktree, one branch, one database. The
orchestrator integrates, reviews and releases; you build and prove. These rules EXTEND
`docs/plan/active/refresh-wave-2026-09-18/WORK-ORDER.md` (read it: rules 0 to 10 apply) and
`RIG.md` beside this file replaces that wave's rig table.

1. **First action, every start or restart:** `git status` and `git log --oneline origin/main..HEAD`
   in your worktree. Never redo landed commits; continue from them. Never spawn subagents. Never kill
   processes you did not start (in particular never kill every `node` process).
2. **The ticket is the contract.** `gh issue view <n> --comments`; the NEWEST "Agent Brief" (in the
   body or in a comment) wins, together with any owner ruling comment dated 2026-09-20. Work the
   tickets in the order your lane lists them. One ticket = its own commits, whose messages name it
   (`fix(web): #896 …`). Every commit message ends with
   `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never push, never open a PR, never
   comment on or close a GitHub issue.
3. **Verify the ticket is still live before building.** Wave 2026-09-18 and #1008 merged a lot. If a
   ticket is already satisfied on `main`, do not build: write the evidence in your report under
   "already satisfied". If it is partly satisfied, build only the rest and say so.
4. **`/implement` means `/tdd`, and `/tdd` means VERTICAL SLICES.** Read
   `.claude/skills/tdd/SKILL.md`, `tests.md` and `mocking.md` before your first test; they bind you.
   - The seams are the public interfaces the ticket's brief names (a door, a read, a component's
     rendered behaviour, a CLI's exit code). Write them down at the top of your report before you
     test. No test at a seam the brief does not give you.
   - **One slice at a time: one test → see it red for the right reason → the minimal code that turns
     it green → the next test, shaped by what the last cycle taught you.** Writing all the tests
     first and all the implementation after ("horizontal slicing") is the anti-pattern the skill
     names; a commit that adds a whole battery of red cells before any implementation is that
     anti-pattern. Commit per green slice or per small group of slices.
   - Test behaviour through the public interface, never an internal collaborator, a private
     function or a side channel. Expected values come from an independent source of truth (a
     worked example, the spec, a known-good literal), never from re-computing what the code
     computes. Mock only at system boundaries. Where this repo's own documented standard asks for a
     structural cell (a catalog census, a prestate pin, a tail assertion), that standard wins and
     you say so.
   - No speculative code for tests you have not written. Refactoring is not part of the loop; it
     belongs to the review stage.
   - A ticket whose whole deliverable is a test or a lint still needs the vacuity control: show the
     new cell FAILING against a deliberately broken subject once, then restore the subject byte for
     byte.
   - Run typechecking regularly and single test files regularly while you work; run the full
     suites once, at the end (rule 8).
5. **Scope discipline.** Do not widen a ticket. No migration in a wave-1 lane: if a ticket turns out
   to need one, stop that ticket, record why, and go on with the next. Never edit `docs/PRD.md`,
   `docs/ARCHITECTURE.md`, an applied migration, a frozen workflow body or any module in a frozen
   closure (`node scripts/check-frozen-workflows.mjs` must show no manifest diff). A change a frozen
   chat or Work tool would need is delivered as a "successor contract" section in your report.
6. **Standing owner rulings:** beta, nothing dark (a compliance gate prompts, never disables; access
   control is never loosened); Client KB, no manual pre-registration; shadcn upstream is the standard
   for UI primitives (`pnpm --filter @clara/web ui:add`, one component at a time); accounting
   treatments are checked against the standard and Clara asks for a professional judgement.
7. **Shared files** (`apps/web/messages/en.json`, `apps/web/test/manifest.txt`,
   `apps/web/e2e/serve-built.mjs`, `apps/web/e2e/e2e-fixture-ownership.test.ts`,
   `apps/web/lib/navigation/tree.ts`, `packages/db/tests/rig-meta.mjs`, `packages/db/package.json`,
   `.github/actions/db-live-gates/action.yml`, `CONTEXT.md`): nine other lanes edit them at the same
   time. Keep your hunk minimal, at the sorted position, and put logic in your own new modules.
8. **Gates before you report**, with counts: every test file you added or touched; `pnpm typecheck`;
   `pnpm lint`; if you touched `apps/web`, the WHOLE unit suite once (`node scripts/run-tests.mjs`
   from `apps/web`) and each browser walk you touched through `pnpm --filter @clara/web e2e <spec>`
   on YOUR Playwright triple; if you touched `packages/runtime`, the unit files you touched plus
   `node scripts/check-frozen-workflows.mjs` and `node packages/runtime/scripts/check-parts-parity.mjs`;
   if you touched `packages/db/tests`, the files you touched with the full gate chain, plus
   `operation-census.test.mjs` and `rig-isolation.test.mjs` (never with the reset flags). Known
   Windows-only reds (RIG.md) are reported as such, never "fixed".
9. **Docs in the same commits**: the module README your change affects and `CONTEXT.md` for new
   vocabulary (house "term / _Avoid_" shape).
10. **Report**: write `docs/plan/active/riders-2026-09-20/reports/wave<w>-lane<k>-final.md` in the
    MAIN checkout (`C:\Users\zhant\Desktop\clara-rebuild`, the one file outside your worktree you may
    write; do not commit it) and return the same text. Shape: branch and commits; then PER TICKET:
    done / partial / already satisfied / stopped, each acceptance criterion with its evidence (test
    name + result, file, command), what was deliberately left; then the gates with counts; docs
    updated; successor contracts; follow-ups worth filing; anything unverified.

## Addendum for wave 2 and later (2026-09-20)

These lines override the rules above where they differ.

- **Base.** Your lane branch is cut from the integrated head of the wave before, not from
  `origin/main`. Your prompt names that base commit. Everywhere a rule above says
  `origin/main..HEAD`, read `<base>..HEAD`. Reviews diff against the same base.
- **One implementer per ticket.** You are given ONE ticket. Tickets before yours in the lane have
  already landed commits on the branch and applied their migrations to the lane database: read
  `git log <base>..HEAD` and their reports (`reports/wave<w>-lane<k>-ticket<n>.md`) first.
- **Migrations (replaces the wave-1 half of rule 5).** A ticket that needs a schema or function
  change writes EXACTLY ONE new migration file at the number reserved for it in your prompt. House
  shape: header, prestate with `sha256(prosrc)` pins MEASURED on your lane database now (a ticket
  before yours may have recut the body: pin what is live), the change, tail assertions, a
  preintegration gate module with a stable stem, a rig-meta cohort, the gate-chain entry in
  migration order. Never edit an applied migration or another ticket's new migration. To re-apply
  your own unmerged migration after an edit, use the supported redo mode that #957 added
  (`packages/db/README.md`, "Redo (#957)": `CLARA_MIGRATION_REDO=<version>`, highest applied version
  only, destructive guard required) and record that you did.
- **Report (replaces the file name in rule 10).** One report per ticket:
  `reports/wave<w>-lane<k>-ticket<n>.md`, same shape, with the migration name and its prestate pins.
- **A frozen chat or Work tool** is never edited. Everything such a tool would need is a "successor
  contract" in your report (name, zod input, door call with argument order, refusal mapping, part
  kind, prompt stanza). The ONE shared cut `chatTurn_v22` / `claraWork_v6` happens at the end of
  wave 4.
