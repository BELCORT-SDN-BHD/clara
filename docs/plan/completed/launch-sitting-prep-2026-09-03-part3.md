*Part 3 of 3 of the launch-sitting PREP pack (2026-09-03) — the lead's as-run/prep record, filed VERBATIM at the final clock-out truing. Previous: `launch-sitting-prep-2026-09-03-part2.md` · Next: none (this is the last part).*
*The split is mechanical (line boundaries only, 470 lines per part, to stay under the repo's 500-line document ceiling): nothing inside a part was added, removed or re-ordered.*

   (digest row + `README-log.md` line + ledger entry).
4. **Where everything else lives, and that it is complete:** `PROGRESS.md`'s **Backlog** (the
   ordered pre-上市 roadmap first) and **Known issues** — every row with **owner · next step · ruling
   number**. Name the count of rows so the completeness claim is a measurement.
5. **What was torn down** — worktrees, rigs, the conductor, the monitors, the CI fleet — and the
   **short list of things only the owner can finish**: the elevated-shell worktree removal after a
   Claude Code restart, the vhdx compaction, and (if DECISION 2 deferred them) the two recut PRs.
6. **The one sentence that closes it:** *"No lane is running and none is queued. The next session
   starts when you ask, from `PROGRESS.md`."*

---

## 8 · Not found in the repo

1. **裁-148, 裁-149 and 裁-150.** Zero hits across `docs/`, `PROGRESS.md` and `AGENTS.md` at
   `5eab358d`. 裁-147 appears only as an *owed* row (`docs/plan/active/mohe-grill-rulings-2026-09-03.md:235`),
   **blocked because `docs/adr/README.md` is at exactly 500/500 lines and needs the split first.**
   The governing texts are the owner's ruling files in the session scratchpad
   (`ruling-147.md` … `ruling-150.md`); **truing-4 is the PR that lands them.** This record cites
   them from there and says so at every use.
2. **A launch-sitting document of any kind.** No agenda, no as-run template, no order. `git ls-files
   docs/plan | grep -i launch` returns nothing, and `docs/ops` has no launch file. The **only** order
   text for the sitting is FS-11's closing clause, orders `:487` — which is itself one of the four
   superseded texts (§5).
3. **The sixteen steps, enumerated.** "Sixteen happy-path steps" is a **count** used in four places;
   the two texts that spell the walk out — `frontend-sprint-handoff-2026-08-31.md:287-291` and 裁-83
   — name about **eleven** arrows (signup → checkout → firm born → members invited → client onboarded
   through the interview → documents posted unattended → bank matched in chat → FY opened → year-end
   closed with human keys → management-accounts PDF downloaded → FY2 opened). Individual steps are
   cited by number elsewhere (step 5 = the COA apply button, 裁-128; step 10 = the reopen drill;
   step 11 = the tie-out; step 15 = the byte-burn render), but **no single list of sixteen exists**.
4. **The raised Supabase auth rate-limit value.** Reported applied ≈17:00 on 2026-09-03 with **no
   number stated**, and the checklist records that explicitly: "the raised value was not stated, so
   this checklist records no number".
5. **A go/no-go standing law in the ADR digest.** Grepping `docs/adr/README.md` for
   *launch* / *beta live* / *go/no-go* returns the 裁-111 / 裁-133 time boxes, ADR-0077's beta-pivot
   laws 84-85, and 裁-146's law 87 — but **no law that defines the go/no-go ceremony itself**. The
   nearest thing to one is `frontend-sprint-handoff-2026-08-31.md` §9's definition of done.
6. **"The pending FS-10 notes"** — the document that both `wave-g-setup-checklist.md:52` and
   `:155-156` park the *Reset password* template box in **does not exist**. Act 5 is now its home,
   and the final truing must give it a permanent one in the as-run or the checklist.
7. **`clara.list_stripe_event_problems` has no operator screen** — stated as a gap by the PRD
   itself, and now **ruled post-beta by 裁-147**, which is why §6.2 is a manual select.
8. **A reconciled list of the locked worktree shells.** Three estate lists name four different ids
   (§7.2). The teardown census settles it; nothing in the repo does today.

---

## 9 · Risks to carry into the sitting

- **R1 — The Stripe collision is RULED, but four repo texts still disagree** (§5). None of them is a
  new decision; all four are truings the sitting's own PR must make. The risk is a walker following
  `wave-g-setup-checklist.md:190` and trying to walk a non-zero price that no current plan row
  offers.
- **R2 — A launch-blocking checklist carries stale migration numbers.** `security-pass-2026-09-02.md`
  items 4 and 5 cite **`0161`** for the auth-wall role's NOLOGIN tail and for the `acl-baseline.sql`
  run; C-3 **merged as `0163`** (it claimed `0161` first; Q-D6 has that number now), and
  `docs/ops/wave-g-setup-checklist.md:100-102` names `0163`. True the citations **before** the walk —
  a cutover line pointing at the wrong migration is exactly law 3's shape (spelling is not identity).
- **R3 — The repo contradicts itself on whether the beta terms are in force.** 裁-145
  (`docs/adr/README.md:499`) counts "Beta terms" among the four live signup-gate items;
  `docs/ops/legal/clara-beta-terms.md:840` says **"NOT SEEDED. NOT IN FORCE."**, and the `kind`
  discriminator that makes a second document kind storable is an **unmerged backlog rider**. Settle
  it with G8's `select` on the document store, not a reading.
- **R4 — "Sixteen steps" is unfalsifiable as written** (§8 item 3). IT-2 demands every acceptance
  cell carry an exact assertion; enumerate the sixteen before the walk, or the walk grades itself.
- **R5 — Three Mail facts are REPORTED, not measured**, and one of them (the rate limit) has no
  number anywhere (裁-112). All three are read back at the walk, by Management API. **And the ≈16:55
  delivery proof is the Invite-user arm, not the signup arm** — the gate is still open (G1).
- **R6 — DF-5 exposure across the whole walk.** The corpus is a happy path; most refusal walls will
  count zero. Every one of them is recorded **UNPROVEN IN THE FIELD** with which it was — never
  silently credited.
- **R7 — The first hour has no automated alarm.** The external `/ready` uptime check is unwired; the
  problem-events queue can be **empty while refusals happened** (§6.2's trap); and `beltErrors` does
  not show the reconciler's re-firing dropped call. Three blind spots at once — read all four
  instruments in §6, not one.
- **R8 — The backup's restorability is the one DR claim that is easy to fake.** "The dump completed"
  is not "the dump restores", and `DR.md:194-201` says the default-profile selftest is not the
  evidence. G3's pre-reset restore is the only thing standing between a reset and an unrecoverable
  estate; the monthly-light cadence against an **R2 bundle** is **~43 days overdue** (G9).
- **R9 — Arming spends a CI cycle.** Under strict up-to-date, arming a docs-only PR while a code PR's
  run is in flight merges in two minutes and restarts that code PR's 20-minute run. Arm docs PRs only
  right **after** a code merge (orders §C, CONDUCTOR law second sentence).
- **R10 — The sweep must be re-dispatched by hand** after any merge touching a closed drill or the
  pipeline, and its verdict read from `gh run view`'s job list, never a PR's colours.
- **R11 — Precondition P1 is MET; the stale claim was `PROGRESS.md`'s, not the tree's.** #517 merged
  as **`aa789d65` at 17:02:02 MYT on 2026-09-03**, `0164` is on `main`, FS-4 is CLOSED. The residual
  risk is the opposite of the one this record used to carry: **`PROGRESS.md`'s banner still says
  DRAFT**, and anything reading it — a person or a later lane — will believe FS-10 is blocked. It is
  trued by truing-4; until that merges, cite the tree.
- **R12 — The digest is full.** `docs/adr/README.md` is at exactly **500/500 lines**, so **no ruling
  from this sitting can be recorded until the split lands**
  (`docs/plan/active/mohe-grill-rulings-2026-09-03.md:235`). DECISION 1 and DECISION 2 both queue
  behind it. Sequence the final truing so the split goes first.
- **R13 — The repo is PUBLIC** (裁-135). Every as-run, ledger line and PROGRESS edit written at this
  sitting is world-readable at the moment it merges. Hashes and redactions only — and that now
  includes the healthchecks ping URL (§1 G9).
