# Harness drift + unrecorded-deferral audit — 2026-08-23

**Scope note.** Read-only, against `origin/main` pinned at **`c40118876b26f3635cbb1b65c039f5bef0ce0c3c`**
(`docs: harness truing batch — ten items from the 2026-08-23 alignment scan (#291)`) — fetched fresh, not
the local checkout, because the local working tree is shared with other concurrent agent lanes and drifted
mid-session (confirmed: local `HEAD` moved between two `git status` calls with no `pull` issued by this
agent). Every citation below is `git show <SHA>:<path>` or `git grep <SHA>`, never a working-tree read.
PR #291's ten items were spot-checked, not assumed: four re-derived at the bytes (below) and confirmed
fixed; the rest are consistent with the current `PROGRESS.md` text read in full.

**One-paragraph verdict.** The owner's two-home claim **does not hold as a strict claim**: at least
**~18 real, unresolved forward-looking obligations exist with no `PROGRESS.md` row of any kind**, and a
further **~5 do have a `PROGRESS.md` row but outside the two named sections** (in `## Lanes`, `## Next`, or
`## Current posture`) — including `PROGRESS.md` **contradicting itself** on two separate questions (§A-iii,
§B). Separately, one substantial **code-vs-doc drift is live right now**: `docs/ops/ci-runner.md` was
updated today to document a same-day expansion from two to four CI runner instances, but `AGENTS.md` and
`PROGRESS.md` still say two — almost certainly a concurrent in-flight lane (`runner-expand` is on the
active agent roster) whose truing simply hasn't landed yet, not a stale oversight from an old PR. A second,
more interpretive finding: `AGENTS.md` hard constraint 12 reads as still-fully-enumerated after ADR-0075
said it should retire *as a named constraint* — flagged as DRIFTED with the caveat that the ADR's wording
supports two readings (see Ambiguities). Everything else checked — the byte-level claims re-derived from
PR #291, the harness-menu file inventory, the `docs/plan/index.md` ↔ `docs/plan/active/` coverage, the
memory-index file pointers, and the runtime/workflow-registry pointers — **held CONFIRMED**.

---

## Part A — the deferral census

**Method.** Swept PROGRESS.md, AGENTS.md, CLAUDE.md, the PRD, the rubric, ARCHITECTURE, the ADR digest +
log, all 76 `docs/adr/00*.md` files, `docs/plan/index.md`, all 65 `docs/plan/active/*.md` files, all 3
`docs/design/*.md`, all 19 `docs/ops/**/*.md`, both package READMEs, the codebase-graph manual, and all 4
`.claude/rules/*.md` for the full keyword list (deferred/DEFERRED/not reached/UNSCHEDULED/not
scheduled/follow-up/FOLLOW-UP/later/post-beta/v1.1/owner question/OQ-/open question/pending/TODO/to be
ruled/unowned/no owner/awaiting) — **1,024 raw hits**. Split into three file groups and read at the pinned
SHA with surrounding context by three independent lanes, plus a direct read of every one of PROGRESS.md's
own 24 hits by this agent. `CLAUDE.md`, `EVALUATION_RUBRIC.md`, `docs/design/DESIGN_SYSTEM.md`,
`docs/design/FRONTEND.md`, and three of the four `.claude/rules/*.md` files had **zero hits** (confirmed
by a second, independent grep). Every kept item below was checked against the same document's own later
sections/gate-record before being called "unresolved" — the large majority of the 1,024 raw hits were
resolved OQs (`RULED`, `folded via R-Lxx`), Postgres `DEFERRABLE`/`deferred constraint trigger` syntax, or
ordinary prose, and are not reproduced here.

### (i) Count of real obligations, by home

| Group (files) | Hits reviewed | Real obligations found | Already in Backlog/Known-issues | Lanes/Next/Current-posture only | No PROGRESS row at all |
|---|---:|---:|---:|---:|---:|
| A1 — track-a-sitting, close-key-1, f-a2, bank-agency `docs/plan/active/*` | 442 | 10 | 0 | 1 | 9 |
| A2 — remaining `docs/plan/active/*` + `docs/plan/index.md` | 403 | 7 | 0 | 2 | 5 |
| A3 — AGENTS.md, ADRs, `docs/ops/**`, `docs/design/*`, both package READMEs, `.claude/rules/*` | 158 | ~15 | 9 | 2 | 4 |
| PROGRESS.md itself (24 hits, read directly, not delegated) | 24 | 3 items in `## Next` §5 | 1 partial (FX-lite echoed in Backlog:310) | 2 (FX-lite, oracle-tier gaps + OD-3) | — |

Note: "FX-lite build timing" and "OD-3's bar figures" are **one underlying obligation** surfaced
independently by group A2 (`wave-f-contract.md`) and group A3 (three ADRs) and by this agent's own
PROGRESS.md read (`## Next` §5) — counted once in the list below, not three times. Net distinct real
obligations found: **~31**; net with no PROGRESS.md row at all: **18**; net Lanes/Next/Current-posture-only
(present, but not in either of the two claimed sections): **5**.

### (ii) The obligations with NO `PROGRESS.md` row at all — the answer to the owner's question

**From `docs/plan/active/` design sets (group A1):**
1. `bank-agency-gate-record.md:310-317` (dup. `bank-agency-annexes-3-build.md:290-296`) — escalated owner
   item: **the wake-execution mechanism (gate G1)** cross-item F-A3/F-A4/F-A5, unruled; "PR-2 does not open"
   while unruled.
2. `bank-agency-gate-record.md:318-321` (dup. `annexes-3-build.md:291,297`) — **OQ-8, the
   identifier-promotion target** (mint a relation vs. scope to client-payers only), unruled.
3. `bank-agency-gate-record.md:322-325` (dup. `annexes-3-build.md:291,298`) — **the R-F 1 boundary
   reading**: confirm drawer-1 P-3/F-T4 is an ownership split, not an absence, or drawer-2's gate can't be
   un-greened.
4. `close-key-1-design.md:403-418` (dup. `close-key-1-gate-record.md:329`) — **six carried, unruled owner
   questions** (the gate record's own words: *"six open questions are escalated with fail-closed defaults
   rather than decided unilaterally"*): OQ-1 clock cadence/first fire · OQ-2 `agent_prepared` vs
   `two_person` label priority · OQ-3 undated-document drawer · OQ-4 prepayment-term default on silence ·
   OQ-5 recutting `attest_close_exception`'s signature · OQ-6 a belt period falling due after a lawful
   close. F-A4's `PROGRESS.md:122` Lanes row names only OQ-7/8/9 as ruled — OQ-1..6 appear nowhere in
   PROGRESS.md.

**From `docs/plan/active/` design sets (group A2):**
5. `metering-annexes.md:31` (D12, TA-P13-OQ-2) — ship a monthly-usage dashboard **screen**? Explicitly
   "stays open" (`metering-design.md:457` confirms). Zero "TA-P13" hits anywhere in PROGRESS.md.
6. `metering-annexes.md:200` (TA-P13-OQ-4) — a cross-firm operator dashboard / any new DB role after
   `clara_price_approver` withdrawal. Explicitly "stays open".
7. `tax-computation-annexes.md:195-298` (Annex D, OQ-1..9) — F-T3's nine numbered owner questions (oracle
   bar, asset population, source access, refuse-vs-24% default, pack-vs-form, the Tier-1/ALL-IN contract
   collision, tax-agent signature, the annual Finance-Act truing duty, provision-posting); the doc's own
   words: *"None is a build choice the lane may make alone."* `PROGRESS.md:131`'s Lanes row names only
   OQ-1/7/8 — 6 of the 9 don't appear in PROGRESS.md at all, and none appear in Backlog/Known-issues.
8. `internet-lane-gate-record.md:410-416` — **OI-1**: who owes TA-P8's KB context-landing for web-found
   identifiers (F-A7 recommended, not ruled). F-A8's `PROGRESS.md:126` row names two different open
   obligations (cross-model pass, unnamed search vendor); OI-1 isn't one of them.
9. `internet-lane-gate-record.md:419-433` — **OI-2**: which item lands the clocked-wake **execution** path
   — today `held→cancelled` is the only legal transition, no execution route exists for anyone. "Not
   F-A8's to decide alone", undecided.
10. `filing-and-interview-gate-record.md:388-394` (§5 item 3) — the dual-attribution contract clause
    (`wave-f-contract.md:296`) severed to a later version; the doc's own words: "only the owner may sever"
    it. (§5 items 1-2 in the same doc ARE resolved per PROGRESS; item 3 is not.)

**From ADRs and `docs/ops/**` (group A3):**
11. `docs/adr/0074-annex-a-mechanisms.md:133` — the "Not reached" list names **F-A7b's FIRM-side setup
    interview** as unaddressed (distinct from F-A7b's client-onboarding scope, which IS tracked). The
    phrase appears nowhere else in the pinned tree.
12. `docs/ops/DR.md` (§7/§8 item 4, ~line 315) — the external `/ready` **uptime** check remains unwired (only
    the dead-man's-switch backup-freshness alarm shipped).
13. `docs/ops/DR-full-drill.md:211` — "a synthetic-canary seed in CI is a deferred follow-up" — CI's DR
    round-trip has no parked canary, so §4.9 only exercises the absent-on-both SKIP path.
14. `docs/ops/incident-2026-07-26-intake-storage.md:249-261` — three named follow-ups from a live incident
    that destroyed a client PDF: (a) a storage **write**-probe on `/ready` (the outage reported `ready:true`
    for ~12h on a read-only check), (b) a permanent CI battery over the storage-grant surface, (c)
    re-examine the custom-Postgres-role-in-Storage-JWT assumption vs. scoped S3 credentials. Grepped for
    implementation — none found.

### Items tracked, but only outside the two claimed sections (Lanes/Next/Current-posture)

15. `docs/plan/active/wave-f-contract.md:443-453` ("Deferred / not reached") + docs/adr/0071/`0072`/
    `0074-annex-a-mechanisms.md` (three successive ADRs) — **FX-lite build timing** and **OD-3's
    acceptance-bar figures for every slot but BEE**. `PROGRESS.md:180-183` (`## Next` §5) carries both —
    *"Still open: **FX-lite build timing** · the corpus's oracle-tier gaps ... · **OD-3's bar figures for
    every slot but BEE**"* — and Backlog:310 gives FX-lite one passing clause ("timing stays a sitting
    item"). Neither has a dedicated Backlog or Known-issues disposition row.
16. `docs/ops/DR-render.md:190` ("still unrun") — the end-to-end re-render round trip has never produced a
    sealed artifact. `PROGRESS.md`'s **Current posture** (not Backlog/Known-issues) carries it: *"The
    end-to-end re-render DR drill is still UNRUN ... TA-P14 now schedules it BEFORE N3's chart work."*
17. `docs/plan/active/bank-agency-annexes-3-build.md:256-258` — **OQ-5**, the 60-day stale-match waiver
    number, "standing, not escalated" but still owner-bound. `PROGRESS.md:121` (F-A3 **Lanes** row, not
    Backlog/Known-issues) carries it: *"the 60-day waiver, running at 60 until F-A3's battery gives the
    owner data."*

**A PROGRESS.md-internal instance of the same pattern** (found directly, not by the sub-lanes — see Part B
for the fuller writeup): `PROGRESS.md:178` (`## Next` §5) still reads *"the `AGENTS.md` home question for
invariant (a) — still OPEN, the owner's call"* with no strikethrough, while `PROGRESS.md:370-374` (`##
Known issues`) records the same question **DECIDED 2026-08-23** with a strikethrough. Same file, same
day, two sections disagree — the file that is supposed to be the single source of truth is not
internally consistent on this point as of the pinned SHA.

### (iii) Verdict on the two-home claim

**Does not hold as stated.** It holds well for the *common case* — the large majority of the 1,024 raw
hits are either already resolved (RULED/folded) or, when genuinely open, do funnel into Backlog or Known
issues (group A3's 9 confirmed-homed items, e.g. the tracing/DPA gate, Gate P/S, the `dr-verify` trio, the
`high_stakes_amount_cents` governed-verb gap, PITR). But the claim fails on two distinct, enumerable axes:
**(a)** a population of genuinely open owner-questions and follow-ups — mostly buried inside
`docs/plan/active/` gate-record/annex documents and `docs/ops/` incident/DR runbooks — that never got
promoted to `PROGRESS.md` at all (18 found, likely an undercount given the conservative filtering the
sub-lanes applied); **(b)** a smaller population that IS in `PROGRESS.md` but living in `## Lanes`, `##
Next`, or `## Current posture` rather than either of the two named sections, including one case where
`PROGRESS.md` disagrees with itself about which section is authoritative for the same fact.

---

## Part B — drift: doc claims the code contradicts

Twenty claims verified at the bytes (fewer than the twenty-five ceiling — depth over padding; every row
below is independently re-derived, none copied from PR #291's own text).

| # | Claim (file:line) | Verdict | Evidence (file:line) | Correction |
|---|---|---|---|---|
| 1 | AGENTS.md CI/CD: "two self-hosted WSL2 runner instances (`clara-wsl` + `clara-wsl-2`)" (`AGENTS.md:169-171`); PROGRESS.md posture: "self-hosted `clara-wsl` + `clara-wsl-2`" (`PROGRESS.md:106`) | **DRIFTED** | `docs/ops/ci-runner.md:12-24,104-142` — dated **2026-08-23** (today), documents `clara-wsl-3`/`clara-wsl-4` added same-day, all four registered+verified `online`, jobs now run "4-wide instead of queuing 2-at-a-time" | Update both files to name four runner instances and the 4-wide-per-PR capacity change. Likely an in-flight lane (`runner-expand` is on today's active-agent roster) whose truing simply hasn't landed on `AGENTS.md`/`PROGRESS.md` yet — not stale from an old PR. |
| 2 | AGENTS.md hard constraint 12 is still a fully enumerated, active numbered constraint in "the fifteen hard constraints" (`AGENTS.md:68-73`) | **DRIFTED** (interpretive — see Ambiguities) | `docs/adr/0075-test-data-authority-widened.md:6-7,79-84,126-131` — "Retires `AGENTS.md` hard constraint 12 **as a NAMED constraint**"; §5's own cost note: *"Retiring a named constraint removes a tripwire that a reader could see in AGENTS.md ... a future reader must reach the mechanism ... rather than meeting it in the constraint list"* | Either AGENTS.md should drop constraint 12 from its enumerated list (moving the generic wall to a pointer/footnote, matching the ADR's stated "cost"), or ADR-0075's wording needs an owner-side clarification that "retired as named" meant only the ROME-SECRETARY-specific wording, not the numbered slot. Recommend surfacing to the owner (see Ambiguities #1). |
| 3 | AGENTS.md hard constraint 13 rewrite matches ADR-0075 §5 | **CONFIRMED** | `AGENTS.md:74-79` vs. `docs/adr/0075...md:85-87` — wording matches ("BELCORT is the OPERATOR firm... resettable test fixture... never repurpose the synthetic sandbox") | none |
| 4 | AGENTS.md hard constraint 14 citation + framing matches ADR-0075 §5 | **CONFIRMED** | `AGENTS.md:80-86` cites ADR-0075, "expires at beta" stands, delegate/mechanisms-never-move language matches ADR-0075 §3-4 | none |
| 5 | PRD §6.2(a) carries the ARCHITECTURE §0.1 as-built caveat naming `assert_client_resolved`'s live predicate (PR #291 item 1) | **CONFIRMED** | `docs/product/PRD.md:157` and `docs/ARCHITECTURE.md:9,11` both carry the caveat; live body at `packages/db/migrations/0018_gate_k_domain.sql:57` (`create or replace function ... assert_client_resolved`) and `:62` (`r.method in ('human','rule') and r.confidence >= 0.95`) — byte-exact match | none |
| 6 | Digest law 79's claim that "0018 IS the live tip (only 0004 and 0018 define the function)" | **CONFIRMED** | `git grep -i "function clara.assert_client_resolved"` across `packages/db/migrations/` returns exactly two hits: `0004_governed_fns.sql:91` (`create function`, no OR REPLACE) and `0018_gate_k_domain.sql:57` (`create or replace function`) | none |
| 7 | `AGENTS.md` Run/verify: `pnpm lint` = "freeze-lint (workflows + evaluators) · leak-scan · wiki gates · binding post-control · harness-links · pinned-ids · dispatch-model-guard · eslint" (PR #291 item 5) | **CONFIRMED** | `package.json`'s `"lint"` script: `check-frozen-workflows.mjs && check-frozen-evaluators.mjs[+selftest] && check-leaks.mjs && check-wiki-dynamic-sql.mjs[+selftest] && check-binding-post-control.mjs[+selftest] && check-harness-links.mjs[+selftest] && pinned-ids-guard.selftest.mjs && dispatch-model-guard.selftest.mjs && eslint ...` — every named gate present | none |
| 8 | `packages/db/README.md`'s ledger: "97 migration files, `0001`-`0102`, frontier `0102`" (PR #291 item 4) | **CONFIRMED** | `git ls-tree -r` on `packages/db/migrations/` = exactly 97 `.sql` files; highest = `0102_f_a2_statement_activation.sql` | none |
| 9 | ARCHITECTURE §1: "zero `@supabase/*` packages exist anywhere in the repo"; JWT verified with `jose` at `packages/runtime/lib/authz.mjs:23` (PR #291 item 6) | **CONFIRMED** | `git grep` for @supabase/ across every `package.json` in the tree: zero hits. `authz.mjs:23`: `import { jwtVerify, createRemoteJWKSet, ... } from "jose"` — exact line match | none |
| 10 | Hard constraint 11: pinned-ids-guard is "a PreToolUse hook ... registered in `.claude/settings.json`" | **CONFIRMED** | `.claude/settings.json:3-12` — `"PreToolUse": [{ "matcher": "*", "hooks": [{ "command": "node", "args": [".../pinned-ids-guard.mjs"] }] }]` | none |
| 11 | AGENTS.md Run/verify's `dispatch-model-guard` gate is wired as a hook too (implied by the constraint-5 dispatch law + PROGRESS:94's "the dispatch-model-guard PreToolUse hook") | **CONFIRMED** | `.claude/settings.json:14-22` registers `dispatch-model-guard.mjs` under the same `PreToolUse` array | none |
| 12 | PROGRESS.md posture: runtime v66 "carrying `autoDraft_v8` + `chatTurn_v12` + `witnessFacts.v2` + `statementFacts_v2`" (`PROGRESS.md:96-98`) | **CONFIRMED** | `packages/runtime/workflows/registry.ts:46,57,69,70` — `chatTurn: chatTurn_v12`, `statementFacts: statementFacts_v2`, `witnessFacts: witnessFacts_v2`, `autoDraft: autoDraft_v8` | none |
| 13 | Every file/dir named in AGENTS.md's harness-menu table exists (18 paths checked) | **CONFIRMED** | `git cat-file -e` on all 18 paths (PRD, rubric, ARCHITECTURE, ADR README + log, PROGRESS, plan index + dir, design dir, codebase-memory-graph, ops/legal, DR.md, ci-runner.md, both package READMEs, docs/audit, 00-GATE-2-README, phase2-research, plan/research) — all present | none |
| 14 | `docs/plan/index.md` has a row for every file physically in `docs/plan/active/`, and no row for a nonexistent one | **CONFIRMED** | Diffed `git ls-tree -r docs/plan/active` (65 files) against every `.md` filename mentioned in the index's two active/ tables (67 refs) — zero files unreferenced; the two "extra" index refs (`0074-the-track-a-sitting.md`, REBUILD-PLAN.md) are cross-references to an ADR and an explicitly-marked-deleted file, not false active/ claims | none |
| 15 | `docs/plan/index.md`'s live/historical status column is consistent with `PROGRESS.md`'s Lanes `design` state for F-A2..F-A9, F-T3, Track B | **CONFIRMED (compatible, not identical, vocabularies)** | Every `docs/plan/active/*` doc for F-A2..F-A9/F-T3 is marked **live** in the index; the matching PROGRESS.md Lanes rows (`:120-131`) show `design` (open work), never `ceremonied`/`merged` — no doc is marked historical while its lane is still open, and vice versa | none — the two columns track different axes (document lifecycle vs. work-item state) by design; flag only if a future doc goes `historical` while its Lanes row stays open |
| 16 | Memory index MEMORY.md — every bullet points at an existing file | **CONFIRMED** | `ls` on the memory directory: 18 non-index files, all 18 referenced in MEMORY.md; zero orphan files, zero dangling links | none |
| 17 | Memory file `project-clara-rebuild-state.md:27-28`: "The permanent pins still hold ... ROME SECRETARY customers stay NAME-ONLY. These are now also hook-enforced in the repo (`scripts/hooks/pinned-ids-guard.mjs`)." | **DRIFTED** | `scripts/hooks/pinned-ids-guard.mjs` (per constraint 11 and its own selftest) enforces only the canary `daba7f2e`/witness `d023b48c` ids — it does not touch customer-enrichment at all; that wall is `0062`/`0063` (a DB constraint), not a hook. The memory file also re-enshrines the exact ROME-SECRETARY-named framing ADR-0075 §5 (2026-08-23, same day) said should retire from the constitutional layer. | Update the memory file: split the hook-enforced pins (canary/witness) from the DB-enforced generic name-only wall, and drop the client-specific naming per ADR-0075. |
| 18 | Memory file feedback-ceremony-run-grant.md (mtime 2026-08-22, pre-dates ADR-0075 by one day) describes the law-71 delegate grant | **STALE, not contradictory** | ADR-0075 §3 (2026-08-23) widens this exact grant to cover password-bearing acts and states "data is free" — the memory file's 2026-08-22 text is a strict subset of the current ruling, not in conflict with it | Fold ADR-0075's further widening into the memory file at next clock-out (its own index entry already tracks the 2026-08-22 grant; add the 2026-08-23 one). |
| 19 | Memory file `project-rebuild-ops-lessons.md:196,526` calls BEE CREATIVE SOLUTION documents/books "a real client" / "a REAL client" (incidents dated 2026-07-26 and 2026-08-16) | **STALE framing, not wrong at time of writing** | ADR-0075 §5 (2026-08-23) reclassifies every non-BELCORT entity, BEE included, as "a resettable test fixture" — a reader who takes these dated lessons' "REAL client" language at face value today, without checking the dates, would misclassify BEE under the current law | No action needed on the lessons themselves (accurate history); consider a one-line dated caveat if these are ever cited outside their own dated context. |
| 20 | `PROGRESS.md` is internally consistent about the status of the "`AGENTS.md` home for invariant (a)" question | **DRIFTED (self-contradiction)** | `PROGRESS.md:178` (`## Next` §5): *"the `AGENTS.md` home question for invariant (a) — still OPEN, the owner's call"* (no strikethrough) vs. `PROGRESS.md:370-374` (`## Known issues`): *"~~The `AGENTS.md` home for invariant (a) is FLAGGED...~~ — **DECIDED (b) 2026-08-23**"* | Strike through the `## Next` §5 clause to match the `## Known issues` resolution — same file, same day, one fact. |

---

## AMBIGUITIES FOR THE OWNER

1. **Does ADR-0075 mean constraint 12's numbered slot should disappear from `AGENTS.md`, or just its
   ROME-SECRETARY-specific wording?** Found: the ADR's own §5 body text ("Hard constraint 12 (ROME
   SECRETARY name-only) is RETIRED as a named constraint... the GENERIC wall stays as a **product
   mechanism**") and its "Cost the owner accepted" paragraph ("a future reader must reach the mechanism...
   rather than meeting it in the constraint list") both read as: the rule leaves `AGENTS.md`'s numbered
   list entirely. What's actually on `main` right now: constraint 12 still exists, still numbered, just
   reworded to the generic statement — i.e., PR #288 (the constraints 12-14 rewrite) chose the OTHER
   reading. Need: an owner ruling on which reading is correct, since both are defensible from the ADR text
   and the current `AGENTS.md` may or may not need a further edit.
2. **Is the four-runner CI expansion (`docs/ops/ci-runner.md`, dated 2026-08-23) a completed, ratified
   change, or mid-flight work by a concurrent lane that hasn't been reviewed/ratified yet?** Found: the
   runbook reads as fully executed and verified ("all four `online`"), but neither `AGENTS.md` nor
   `PROGRESS.md` mention it, and no ADR entry for it was found in the digest (laws 68-82) or the dated log.
   Need: confirmation this is intended as a standing change (in which case AGENTS.md/PROGRESS.md need
   truing) versus something still being evaluated.
3. **Is a "no PROGRESS row at all" obligation buried in a gate-record/annex file (Part A(ii), items 1-14)
   actually a gap, or is it intentional that PR-0-gate-stage owner questions stay local to their design
   set until the item reaches build?** Found: several already-gated-v2 design sets (F-A3, F-A4, F-A8, F-A9,
   F-T3) carry unruled owner questions that their own `PROGRESS.md` Lanes row does not enumerate — e.g.
   F-A4's row names OQ-7/8/9 as ruled but is silent on OQ-1..6, which the gate record itself calls
   "escalated ... rather than decided unilaterally." Need: a ruling on whether every OQ that survives to
   "GATED v2" needs its own promoted line in Backlog (so a Backlog-only reader doesn't miss it), or whether
   "read the gate record" is the intended and sufficient pointer.
4. **Are the three DR/incident follow-ups (Part A(ii) items 12-14: the `/ready` write-probe gap, the
   synthetic-canary-seed gap, the storage-role re-examination) still live, or were they superseded by later
   work this audit didn't find a citation for?** Found: no implementation and no Backlog/Known-issues row
   for any of the three; they may simply have been missed at the time, or may have been quietly absorbed
   into later hardening this sweep's keyword list didn't catch. Need: a quick owner/lane check before
   promoting them, in case they're already moot.
5. **Should the census in Part A(ii) be treated as exhaustive?** Found: the sub-lanes applied a
   conservative filter (only "confident" real obligations were kept, per instruction) — the true count of
   unrecorded obligations is very likely **≥18**, not exactly 18; a looser filter would surface more
   candidates from the ~970 hits judged SKIP, at the cost of more false positives. Need: no owner action,
   flagged so the count in the one-paragraph verdict isn't read as a precise final tally.
