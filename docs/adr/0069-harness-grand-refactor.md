### ADR-069 — the harness grand refactor: the repo becomes the system of record (2026-08-12)

**Decision.** The owner directed and grilled (ten structured rulings + five clarification
supplements + five doctrine increments, all in-session) a ground-up refactor of the harness
file system, executed by five parallel worker lanes and assembled as one atomic change. The
doctrine sources: the walkinglabs harness-engineering course (14 lectures, read in full), the
OpenAI *Harness engineering* article, the Anthropic effective-harnesses/context-engineering
docs, the Claude Code memory docs, and the Anthropic C5-generation context-engineering
article — each read verbatim and diffed against this repo before any ruling.

**The rulings (owner, 2026-08-12 sitting):**

1. **Repo wins (Q1).** `PROGRESS.md` (in-repo) is the sole state authority. Memory is demoted
   to a preferences-and-lessons cache. The former "on disagreement, memory wins" clause is
   ABOLISHED — it made a machine-local cache (never visible to subagents, other machines, or
   cloud runs) the authority over the one artifact everything can read.
2. **The docs-only review lane (Q2) — a narrow, fenced amendment to ADR-061.** A PR touching
   ZERO code paths (only `AGENTS.md` / `CLAUDE.md` / `PROGRESS.md` / `docs/**`) takes a
   single-lane review; everything else keeps the full uniform ladder. The fence is the CI
   path classifier, never the author's claim. ADR-061's judgement-logic law and the
   uniform-ladder posture for code are untouched. *(The assembly's conflict audit initially
   REVERTED this line because no decision record existed for it — the append-only culture
   correctly refusing an unrecorded amendment. This entry is that record.)* **The classifier
   matches the enumerated set literally; markdown outside it takes the full ladder —
   2026-08-12.**
3. **ADR conversion (Q3).** All 68 ADRs converted to per-decision files
   (`docs/adr/0001..0068-*.md`), each entry byte-preserved (mechanically verified: the six
   source files reconstruct byte-for-byte, twice, including from `origin/main`);
   `PROJECTLOG.md` + the five archive volumes deleted. `docs/adr/README.md` carries the
   status index (standing / superseded-by / discharged / narrative-note) and **THE STANDING
   LAWS DIGEST** (67 laws, **owner-signed 2026-08-12** — Tao ratified the set at this
   refactor). One interstitial non-ADR ruling batch (WB-R28..R30) preserved as `0042a-*`
   without claiming a number.
4. **Pins become mechanisms (Q4).** The canary (`daba7f2e`) and witness (`d023b48c`) ids are
   hard-blocked by a PreToolUse hook (`scripts/hooks/pinned-ids-guard.mjs`, 44-case selftest,
   wired into lint + CI), registered in a **tracked** `.claude/settings.json` (the official
   project-settings convention; personal settings stay in `settings.local.json`). The hooks
   lane's recorded dissent — keep registration per-checkout — was overruled on the owner's Q4
   grounds: a manual step is captured-once-enforced-maybe. The enrichment trap stays prose
   AND is registered as a Wave-F/G DB-guard candidate; the four-firms knowledge stays prose.
   **Scope, ruled at the Codex adversarial round:** the hook is a **mistake-net for verbatim-id
   write shapes**, not adversarial containment. The ids' primary protection remains the process
   law and the DB walls (maker/checker, audited-function-only writes, the read-only agent role);
   deliberate obfuscation — the id built from fragments, read from a file, computed at runtime —
   is **out of scope by design**, because no lexical hook can reach it. Two structural residuals
   are NAMED rather than closed: a PreToolUse hook that fails to LAUNCH fails **open** (only
   exit 2 blocks), which is why the registration is exec-form and the self-test asserts it
   resolves on disk; and `disableAllHooks: true` in an untracked `.claude/settings.local.json`
   blanks every non-managed hook, which cannot be prevented from inside the repo — the owner's
   local settings are the owner's, and a Write-block on that file would be circular.
5. **REBUILD-PLAN dissolved (Q5).** State → `PROGRESS.md`; forward roadmap/risks/Phase-5 plan
   → `docs/plan/active/roadmap.md`; the dated STATUS chronology →
   `docs/plan/completed/rebuild-plan-history.md` (verbatim); the `coding_kind` table →
   `docs/ARCHITECTURE.md`. `docs/plan/` reorganized into `active/` · `completed/` ·
   `research/` with `index.md` (live/historical/superseded per file).
6. **PRD (Q6-A′).** Moved to `docs/product/PRD.md` with a bounded uplift: reference truing ·
   a new §5a "The OS surface" product section · splice compression · §7 dedup to promise
   level. **The 16 LAW invariants verified byte-untouched except one citation path** (a
   word-level diff proved the only changed bytes). Paired with
   `docs/product/EVALUATION_RUBRIC.md` — the product-level acceptance constitution,
   ID-addressable for verifier agents.
7. **Design trio as skeletons (Q7-B, owner override of the recommendation).** PRODUCT_DESIGN
   (carrying DIRECTION.md's content as seed) · DESIGN_SYSTEM · FRONTEND — charters + pointers,
   real content lands at Wave G. DIRECTION.md deleted.
8. **AGENTS.md is the entry router (Q8)** — CLAUDE.md is one line (`@AGENTS.md`). Fifteen
   hard constraints above the menu; mechanically-enforced rules get one pointer line;
   DB/runtime long rules live in `.claude/rules/` with `paths:` frontmatter (load only when
   touching matching files); the codegraph manual lives in `docs/references/` (a tool manual
   in startup context is a named anti-pattern); clock-in/clock-out rituals codified; nested
   `packages/{db,runtime}/AGENTS.md` per the nearest-file convention.
9. **Two instruments now, two registered (Q9).** Built: `scripts/check-harness-links.mjs`
   (menu-driven transitive link validation, STRICT, in the lint family + CI — 458 findings at
   baseline, iterated to zero) and the PROGRESS.md lanes table (the scope surface).
   Registered to the beta boundary: `QUALITY_SCORE.md` and the monthly harness-simplification
   ablation (needs a replayable benchmark first), plus — from the C5-generation article — the
   doc-gardening recurring agent, a runtime system-prompt investment pass, and a
   tool/interface-design pass.
10. **Execution (Q10).** γ landed first; the refactor was built by five isolated-worktree
    lanes (the shared-tree lesson), assembled as one atomic branch, and takes the full
    dual-lane ladder itself (it touches scripts/CI/hooks — not docs-only; the Q2 lane never
    applies to its own founding PR). Acceptance: per-entry byte-diff · harness-links zero ·
    all gates green · a conflict audit · the Fresh-Session Test · `/doctor`.

**Near-misses this refactor surfaced (recorded so they stay surfaced):** several standing
laws (the three review/evidence laws, the positive-read deploy law, the enrichment trap, the
§1 narrowing) lived ONLY in the deleted open register and in no ADR — the digest is now their
home of record. Two authored instruments (the pinned-ids selftest, the hook registration)
were, at the moment their lanes reported done, enforced NOWHERE — both wired by the assembly;
the same class as the register's laws. The lint's own conflict-audit reverted ruling 2 before
this entry existed — evidence the append-only defense works, and that a ruling without a
record is operationally not a ruling.

**Why.** The course's single test — *captured once, enforced continuously* — found the old
harness failing in both directions: prose restating what Postgres already enforces (captured
twice, enforced once) and safety pins resting on an agent reading line 180 (captured once,
enforced never). The C5-generation guidance (80% of the system prompt deleted with no eval
loss; rules→judgement) endorses the same direction: few constraints, mechanically fenced,
everything else progressive disclosure.

**Supersessions.** CLAUDE.md's former content is redistributed, not lost: the routing table →
AGENTS.md's menu · the posture pin → PROGRESS.md · records-of-record → the indexes · the
working protocol + laws → AGENTS.md. The "memory wins" clause is superseded by ruling 1.
ADR-061 is amended ONLY per ruling 2. Every prior ADR stands; their file form changed, their
bytes did not.
