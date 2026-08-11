# PR body notes — the harness grand refactor (`refactor/harness-v2`)

Material for the PR body, from the assembly lane. The consumed extraction files (Part A, the
PART 2 open register; Part B, the REBUILD-PLAN posture handoff) are fully absorbed into
`PROGRESS.md` and `docs/plan/active/roadmap.md`, so `_ASSEMBLY-HANDOFF.md` is retired — git
history holds it if the raw extraction is ever wanted.

## Merges and conflicts

Six `--no-ff` merges: L1 ADR conversion → L2 tree migration → L3 AGENTS entry → L4 hooks/lint →
L5 PRD uplift, then `origin/main` (PR #231, lane γ, which merged mid-assembly and moved the base
from `099a5bf` to `9a0ba9b`). **Two conflicts.**

1. **`.gitignore`** — L3 added `!.claude/rules/`, L4 added `!.claude/hooks/` at the same position.
   Resolved as the union plus `!.claude/settings.json`. The `.claude/hooks/` negation was later
   dropped as dead: no such directory exists and the guard lives in `scripts/hooks/`.
2. **`wave-e-acceptance-matrix.md`** — γ amended it (241 lines) at the old flat path while L2 had
   moved it to `active/`. Resolved to **γ's content at the new path**, verified byte-identical to
   `origin/main`'s version apart from the path rewrites. γ's new `-part2.md` had no counterpart to
   rename against, so it landed at the old path and was moved by hand; likewise verified.

## Reference sweep

194 references rewritten across 142 files, from a rename map generated out of L2's own
`git diff -M` output so the map cannot drift from what actually moved.

**Held back deliberately:** the 130 frozen workflow bodies (the first pass produced 15 freeze-lint
violations — comment-only, but a frozen body is byte-stable or it is not frozen) and
`packages/db/deploy/*.sql` (already-executed ceremony material). **Reverted at review:** the sweep
inside `docs/adr/0*.md` — a closed decision record's old paths are history, which is the same
reasoning that exempts `docs/plan/completed/`. All 69 entry bodies now reconstruct byte-for-byte
from the six deleted source files.

**Pre-existing broken paths found and fixed:** `PRODUCT_DESIGN.md` pointed at
`docs/DESIGN_SYSTEM.md` / `docs/FRONTEND.md` when both live under `docs/design/`; `DR.md` named
nine files package-relative; the reporting design named `lib/reconciler.mjs` for
`packages/runtime/lib/reconciler.mjs`.

## `check-harness-links`: 458 → 0, STRICT true

Worth stating plainly in the PR body, because the headline number misleads: **only about 15% of
the baseline was stale cross-references.** Roughly 267 findings sat inside archive trees that are
exempt by ruling, and most of the rest was the backtick heuristic firing on prose.

Two judgement calls, both narrowing the **backtick heuristic only** — an explicit markdown link is
never excluded and must always resolve:

- **Four structural rules**: whitespace, template/glob metacharacters, npm specifiers, and
  slash-joined snake_case identifier sets (`fy_end_month/day`). The last rests on a property
  verified with `git ls-files`, not assumed: zero tracked paths have an underscore in any
  directory segment.
- **`HOP_CONTENT_EXEMPT_PREFIXES`** for `docs/plan/completed/`, `docs/plan/research/` and
  `docs/adr/0*` — append-only or frozen by standing law, so a stale cite inside one cannot be
  repaired without rewriting a historical record. Existence as a reference *target* is still
  validated, and `docs/adr/README.md` stays fully checked including its bidirectional index.

`rebuild-plan-history.md` is carved back OUT of that exemption (it was authored at this refactor),
and declares its own `harness-links: verbatim-below` boundary so its live archival header is
scanned while the document it reproduces is not.

**Genuinely dangling, recorded not fixed:** `RENUMBER.md`, `algebra.md`, `INTERFACE-PINS.md` —
authored in build worktrees, never committed. The laws they encode survive (the renumber
procedure is the digest's law 41 plus ADR-058's body), so they are allowlisted with that
provenance rather than pointed anywhere false.

## Recorded dissent — tracking `.claude/settings.json`

The orchestrator ruled that `.claude/settings.json` ships **tracked**, carrying only the
PreToolUse registration. That **overrides the L4 lane's own recommendation**, recorded here so
the alternative rides the PR rather than being buried.

**L4's position**, from its `pinned-ids-guard.mjs` header: the registration *"is still necessarily
local: merging a hooks.PreToolUse entry into settings.json is a per-checkout act, not something a
git commit alone can deliver, since settings.json itself stays untracked by design."* L4 read the
`.claude/*` ignore block as a deliberate line — *skills are the tracked, shared toolchain;
settings and permissions are not* — shipped the guard under `scripts/hooks/` (tracked either way),
documented the snippet, and left wiring to each checkout.

**The grounds that prevail:** (1) the official convention is the opposite split — `settings.json`
is project-shared and checked in, `settings.local.json` is personal and ignored; the blanket
`.claude/*` ignore predates there being any shared setting worth committing. (2) The owner's Q4
ruling requires the pins enforced **mechanically on every checkout**, and a manual per-checkout
step is captured-once-enforced-maybe.

**L4's own measurement is the argument against its conclusion:** it verified that *no checkout
anywhere* had the guard registered — not its worktree, not the main checkout's
`settings.local.json`, not `~/.claude/settings.json`, not any sibling worktree. Its factual claim
stands; only the conclusion is overturned.

## Two safety gaps this PR closes

Both are the same failure class — an instrument that exists, is documented, and is enforced
nowhere:

1. The pinned-ids guard was **registered nowhere** (above).
2. Its self-test ran in **no gate** — absent from `pnpm lint` and from `ci.yml`. Now in both, and
   extended with a third layer that parses the tracked `settings.json` and proves a PreToolUse
   command resolves to the guard on disk. Verified to fail against both a renamed target and a
   missing PreToolUse block before being accepted.

**Still open, for after merge:** the hook is *registered, not yet proven in situ*. CI cannot
exercise a PreToolUse hook — only a real Claude Code session can. The post-merge step is one
deliberately-blocked probe on the owner's machine.

## Deliberately not done

`docs/plan/completed/` and `docs/plan/research/` bodies · ADR prose · migration and
`packages/db/deploy/` SQL comments · **`docs/audit/`**, whose `docs/PROJECTLOG.md:90`-style cites
are evidence about the **frozen prior repo** (ADR-033 there is a different decision than ADR-033
here — rewriting would falsify audit evidence) · the completed autopost-vendor-binding record,
where L5 routed a `:129` fix and flagged a pre-existing §6a mis-cite, both noted-not-touched ·
`README.md`'s stale inline status, replaced by a `PROGRESS.md` pointer rather than guessed.
