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

## The Codex adversarial round — adjudication and outcome

Codex ran an adversarial pass over both instruments and returned 14 findings (3 BLOCKER, 9 MAJOR,
2 MINOR) plus a survived-attacks list. **The three BLOCKERs are technically true and aimed at the
wrong threat model**, and that adjudication is the substance of this round.

### The ruling: the guard is a mistake-net, not containment

The pinned-ids hook exists to catch the realistic failure — an agent or a human, moving fast,
reaching for one of these two ids in a write-shaped call without noticing which id it is. Against
that, a lexical check is the right instrument. It was never adversarial containment, and it is now
stated as such in three places: the guard header, ADR-0069 ruling 4, and AGENTS constraint 11.

An agent that deliberately obfuscates its own safety ids — assembling the id from fragments,
reading it from a file, computing it at runtime — defeats any lexical hook, and no amount of
pattern-hardening changes that. The ids' primary protection is, and always was, the process law
and the DB walls: maker/checker, audited-function-only writes, the structural read-only agent role.

Three structural facts set the ceiling, all confirmed against the official hooks reference rather
than assumed:

- **A PreToolUse hook that fails to LAUNCH fails OPEN.** Only exit 2 blocks; a bad path exits ~127
  and the tool call proceeds. The guard's own wiring is therefore part of its correctness — which
  is why the registration moved to exec form and why the self-test asserts it resolves on disk.
- **`disableAllHooks: true` in an untracked `settings.local.json` blanks every non-managed hook.**
  Unpreventable from inside the repo: the owner's local settings are the owner's, and a
  Write-block on that file would be circular. A **named residual**, not a defect to fix.
- **Hook entries merge across settings levels**, so a personal file cannot selectively remove this
  hook — only the blunt switch above reaches it.

### What was closed anyway (the cheap true gaps)

| # | Finding | Outcome |
|---|---|---|
| 4 | `DELETE/MERGE/UPSERT/EXECUTE/PUT/PATCH` passed as read-shaped | verb set widened; the asymmetric boundary is unchanged, so inflections still pass |
| 5 | shell-form `$CLAUDE_PROJECT_DIR` fails to expand under PowerShell → hook fails open | registration moved to **exec form** (`command` + `args`), removing the shell entirely |
| 7 | `git grep "approve.*<id>"` was blocked — a real audit workflow | read-tool allowlist, evaluated **per pipeline segment** so a read cannot prefix a smuggled write |
| 8 | `README.md/nope.md` and `README.md.backup` resolved green as `README.md` | citation stripping now accepts only an empty remainder or a real citation opener; verified old-vs-new on those exact inputs |
| 9 | `../../../<sibling>/AGENTS.md` resolved outside the repo | containment via realpath |
| 10 | unique basename treated as identity | fallback kept, every rebind announced (grouped into one warning) |
| 13 | reference-style links extracted as zero references | `[ref]: path` definitions extracted and validated |
| 3 | the hook can be disabled via `settings.local.json` | **named residual**, no code change — see above |
| 11, 12 | prefix exemptions and the narrow backtick heuristic | **ruled trade-offs**, documented in a new KNOWN LIMITATIONS block, with finding 12's evasion list recorded verbatim as known-unvalidated shapes |
| 6 | CI never exercised the registered hook | already closed earlier in this batch (the registration self-test layer) |

17 new self-test cells landed with the fixes (44 pinned-ids, 39 harness-links). Two **older** cells
turned out to pass for the wrong reason once the read allowlist existed — the glued-underscore
boundary cell was short-circuiting on the allowlist and would have stayed green if the boundary
regressed. It now uses a non-allowlisted command and pins its resolution shape.

### Attacks the scripts SURVIVED (Codex's own list — half the value of the round)

**Pinned-ids guard:** literal ids with `rpc`/`approve`/`answer`/`update`/`insert`/`curl`/`post`
blocked case-insensitively · full literal UUID prefixes blocked · uppercase ids blocked ·
`approve_entry` blocked despite the trailing underscore · same-call `ID=d023b48c; curl …$ID`
blocked · literal-id heredocs blocked · literal bare and deeply-nested MCP ids blocked ·
malformed stdin carrying id + keyword blocked · plain SELECT/grep/read-only-script shapes passed ·
`posting_date`, `approved`, `answering`, `updated` and `0019_insert_wiki_seed.sql` all avoided the
intended substring false positives.

**Harness lint:** literal broken backtick paths and ordinary `[x](path)` links detected · matched
triple-backtick and tilde fences suppressed contents and resumed after · ambiguous bare basenames
with multiple matches stayed unresolved · external URLs and pure anchors skipped · `STRICT=true`
caught a missing entry · an entry that is a directory throws rather than passing, so that failure
stays closed.

**Wiring/CI:** `.claude/settings.json` is valid JSON on the documented PreToolUse schema · matcher
`"*"` matches all tool events · exit 2 is the correct denial signal · all relevant files tracked
with LF endings · Linux CI installs Node 20.19.5 and invokes exact-case paths, with no separator,
shebang, executable-bit or Node-invocation failure found.

## A process lesson from this batch: `cmd || echo "(none)"` manufactures the absence trap

Worth carrying beyond this PR, because it is a mechanised version of a law this repo already
holds — *absence is not evidence, and a derived state is not evidence.*

Before deleting `_ASSEMBLY-HANDOFF.md` the assembly lane checked for referrers with:

```sh
git grep -n "_ASSEMBLY-HANDOFF" -- . ':!_ASSEMBLY-HANDOFF.md' || echo "(none)"
```

That pathspec is invalid — a leading `_` reads as pathspec magic — so git exited non-zero with
`fatal: Unimplemented pathspec magic '_'`, the `||` branch fired, and the output read
**`(none)`**. A tool ERROR was rendered as a clean negative result. The check was re-run
correctly and there genuinely were no referrers, so nothing was lost — but the instrument had
already reported success without having looked.

The general shape: **`cmd || echo "<reassuring text>"` cannot distinguish "ran and found
nothing" from "did not run".** grep-family tools exit 1 for *no matches* and ≥2 for *failure*,
and the `||` collapses both into the same branch. Every "I verified there were no X" built this
way is an unproven claim wearing a receipt.

What to do instead, in rough order of cost:

- Drop the `||` and read the real output — an empty result is already visible as empty.
- If a friendly message is wanted, branch on the exit code explicitly: `0` = found, `1` = none,
  anything else = the check FAILED and must not be reported as absence.
- For a load-bearing check, assert on the positive side instead — count what you *did* see.

This is the same failure the repo's ops lessons already record three times over (*measure with
the instrument production uses*; *read the caller before declaring a consumer orphaned*), and
the same class as the two safety instruments this PR found enforced nowhere. The pattern is
worth a standing note precisely because it is so cheap to type.

## Deliberately not done

`docs/plan/completed/` and `docs/plan/research/` bodies · ADR prose · migration and
`packages/db/deploy/` SQL comments · **`docs/audit/`**, whose `docs/PROJECTLOG.md:90`-style cites
are evidence about the **frozen prior repo** (ADR-033 there is a different decision than ADR-033
here — rewriting would falsify audit evidence) · the completed autopost-vendor-binding record,
where L5 routed a `:129` fix and flagged a pre-existing §6a mis-cite, both noted-not-touched ·
`README.md`'s stale inline status, replaced by a `PROGRESS.md` pointer rather than guessed.
