# Owner batch — additions 2026-08-30/31

## Additions 2026-08-30/31, unruled unless marked

72. **P4-4 · existing-account invitees** (rev-p4-4 FIND-1, 2026-08-30 17:45 MYT). Supabase `generateLink({type:"invite"})`
    rejects an email that already belongs to a confirmed user; with `uq_membership_active_user` (one active
    membership per user, globally) every move-between-firms invite hit that branch AFTER minting the row → 502,
    plaintext unrecoverable, address blocked 7 days behind CLR10. FOLDED fail-closed: refuse BEFORE the door at
    409 `recipient_has_account`, nothing minted. **Decision for the owner:** (a) keep 409 for beta — an existing
    Clara account cannot be invited into a second firm until it is removed from the first AND a magiclink accept
    arm ships (design change, P4-D or later); (b) commission the magiclink arm now. Recommendation: (a) — beta
    firms are the operator + test fixtures; nobody moves between firms before Wave G.
73. **P4-4 · enumeration sentence** (rev-p4-4 OQ). The 409 necessarily tells an admin+ that the address has a
    Clara account. FOLDED as a fixed Clara-owned sentence ("This address already has a Clara account — ask them
    to sign in with it."), never the provider's text; bounded to admin+, audited. INFORM unless the owner wants
    the refusal made indistinguishable from a send (which would burn nothing but would lie to the admin).
75. **Invite mail carries BOTH bearer factors** (Codex P4-4 H1). `/invite/<token_hash>?ct=<plaintext>` sits in
    the Resend request body (dashboard + Logs API, 30-day retention) and in ingress logs on open. This is
    P4-1's accepted two-token contract (item on the INFORM list). RULED for beta: record the residual in the
    README; Wave-G checklist: Resend key `sending_access` + domain-restricted + message storage OFF + team log
    access restricted. **Decision:** commission the redesign (one Supabase factor + non-secret invite id
    consumed by a governed DB door; bearer out of the request target) as a P4-D item? Recommendation: yes,
    P4-D, after beta launch — not a beta blocker with the Resend hardening above.
76. **Backlog (no ruling): `clara.firm_egress_dispatch_authorizations` is owned by `postgres`** (0123, pre-existing
    on main; rev-g1-producers R4) — the only clara TABLE not owned by `clara_fn_owner`. Same class as #449's
    r1 CRITICAL, one migration earlier. Goes into PROGRESS Known issues → a small owner-repoint migration.
77. **Backlog: `bank_agent_due_claims` retention belt** before F-A3 enables the source (rev-g1-producers R2).

78. **INFORM (P4-4 round 3, folded fail-closed):** non-ASCII invite addresses are REFUSED (`unsupported_address`,
    nothing minted) — JS/Postgres/GoTrue disagree on non-ASCII case folding and a canonical form that differs
    between scanner, door and provider IS the dead-invite bug. Narrow product limitation, recorded.
79. **Wave-G checklist (P4-4 round 3):** `CLARA_PUBLIC_ORIGINS` is a REQUIRED deployment setting for apps/web behind
    a proxy (the emailed invite link's origin is taken from this allowlist, never from `X-Forwarded-Host`); unset
    = fail-closed (the courier refuses its own same-origin POSTs). Sits beside the Resend controls.

80. **Fix-queue (P4-2 round 3, conductor's call):** three spine suites exceed the advisory 500-line hook
    (firm-scope-surfaces.test.ts 611 · require-firm-scope.test.ts 604 · firm-scope-db-pins.test.ts 565) —
    lift the "LOW-5 SQL lexer" block into tests/sql-oracle.test.ts as a pure move AFTER the P4 stack merges
    (moving cells now would force P4-4/P4-5 to rebase again). Test-only PR, single review.
81. **Lane-brief lesson (P4-2 r3):** `gh pr edit --body` spliced with `String.replace(str, str)` corrupts the body
    when the section text contains `` $` `` (a replacement pattern) — splice by index, assert one section survives.

82. **CI fix-queue (found 2026-08-30 22:55 MYT):** the push-context gitleaks scan (`.github/actions/lint-suite`, `--log-opts
    "--diff-merges=first-parent --all"`) walks the self-hosted runners' persistent clones, which accumulate
    refs/remotes/pull/<N>/merge from every PR run and never prune them — so a secret-shaped string rewritten OUT of a
    branch stays visible to main's scan via a stale PR merge ref (measured: runners 2+3 held pull/453/merge →
    93577efb after the P4-5 rewrite). Tonight's remedy: prune refs/remotes/pull/* on all four runners (an ops act,
    working trees untouched). Durable fix (its own CI PR, full ladder): scope the push scan to
    `--branches --tags --remotes=origin` (or prune pull refs in `fetch-base-main`), keeping the coverage the comment
    at lint-suite:142-149 argues for. Lesson: "unreachable from any branch" ≠ "unreachable from the runner".

83. **DB fix-queue (P6-1 Codex r2):** `wake_freeform_read` (0131) emits `read_id` as a JSON NUMBER; pg-types
    `JSON.parse`s JSONB, so ids > 2^53 lose precision before the runtime sees them (the v16 card guard then OMITS the
    card — fail-closed, never wrong). Recut the body to emit `v_read_id::text` (+ `apps/web/lib/reports/types.ts`
    `id: string`) in the next DB pass (batch with 裁-71⑨). Not a beta blocker (sequence values are tiny).

84. **Estate convention to rule (raised by the P6-2 native review, 2026-08-30 23:50):** op_key minting in apps/web is
    FRESH-PER-CALL in ~117 door wrappers (test-pinned, e.g. `lib/bank/doors.test.ts:47`), while P4-5 (#453) and now
    P6-2's three card acts (#459 r2, under the delegation, following the P4-5 precedent) use DETERMINISTIC actor-scoped
    keys so a lost response replays the same receipt instead of minting a second governed act. Two conventions now
    coexist. Question: adopt deterministic caller-owned keys estate-wide (a sweep train + `_reserve_op` dedupe
    semantics unchanged — same args replay, different args CLR10), or keep fresh-per-call as the default and reserve
    deterministic keys for surfaces with a retry path? Recommendation: deterministic estate-wide, post-beta sweep;
    until then each surface documents which it uses and why. INFORM-level; not a beta blocker.
    **The real axis (native reviewer, measured at the door bodies):** `_reserve_op` replays the stored result on a
    matching request hash, and only SOME doors hash the actor (`acknowledge_sweep_run` yes; `settle_close_proposal`,
    `resolve_firm_question`, `dismiss_firm_question` no) — a deterministic key without an actor component on a
    non-actor-hashing door is a SILENT cross-actor replay. Rule to make: every deterministic key carries the actor id
    from a positive caller read, and the sweep should make every governed door hash the actor server-side
    (`_reserve_op`'s contract), so the client key cannot be the only wall. Also `reports/api.ts:71`'s
    `opKey(prefix,id)` is deterministic and NOT actor-scoped — audit those doors first.

85. **Wave-G checklist (P4-3 review):** the Supabase project's Auth → Redirect URLs allowlist must contain exactly
    `<origin>/signup` (no wildcard — a wildcard turns any future caller-controlled redirect into a token-delivery
    vector); and email confirmation must be ON (PRD §8) — it is also what makes `/signup` non-enumerating for an
    existing address. Add to `docs/ops/wave-g-setup-checklist.md` at clock-out.
    **Plus (Codex P4-3 N1):** the Supabase "Confirm signup" email template must use the token-hash form
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (NOT the default `ConfirmationURL`, whose
    fragment-carried session the server never sees and which mail scanners can consume), /auth/confirm in the
    Redirect URLs allowlist, autoconfirm DISABLED. Owner act at Wave-G setup; the app carries the explicit-click
    confirmation page (P4-3 round 3).

86. **🟠 INFORM on 裁-61 (the /ready hard-fail) — its blast radius, measured by the #460 review:** the runtime runs on
    ONE always-on non-HA Fly machine (`fly.toml:33-42`, "Do NOT scale > 1"). With the storage write a hard readiness
    gate, ~60 s of storage outage takes that single machine out of rotation — i.e. **storage 挂了 = 整个 Clara 挂了**
    (chat, turns, SSE, interviews, reports — not just uploads) until storage recovers, burning the 99.5% runtime SLO.
    The ruling stands as executed (dissent recorded); what lands with #460: DR.md + fly.toml state the radius plainly,
    and a documented BREAK-GLASS (`CLARA_STORAGE_PROBE_CACHE_MS` very high → the gate cannot re-fire; or a redeploy) so
    an operator can demote the gate during a vendor incident without code. **Owner question for the next sitting:** keep
    "storage down = whole service down" (honest: uploads failing while chat says healthy is the 07-26 shape), or run TWO
    machines (HA) so the gate degrades instead of blacking out — a fly.toml + cost decision. Recommendation: keep for
    beta, revisit HA with real traffic.
87. **Host lesson (rev-ready-460):** 7 pnpm store slots were EMPTY (zod, undici, eventsource-parser, @workflow/serde,
    @vercel/oidc, @standard-schema/spec, json-schema) — `pnpm install --frozen-lockfile` reported "up to date" because
    the store INDEX believed they existed; ~712 runtime tests silently were not running on this host (typecheck 59
    errors). The reviewer repaired by extracting each pinned tarball from the npm cache (additive). Clock-out: a full
    `pnpm install --force` with ZERO lanes building, then `pnpm -r typecheck` as the positive control.

## Clock-out notes (memory / docs)
- Memory lesson-noon-sitting-0830.md item 12: add the MECHANISM — the lane's 'endor…' came from the NON-E
  spelling `' \t\n\r\f\v'` (eleven literal chars incl. the letter v), not from a missing escape; `E'\v'` = 11,
  recognised-but-undocumented (control: `E'\q'`=113). Rule: a dispute about an escape is settled by `psql -f`
  on a hexdumped file, with an unknown-escape control beside it.
- New lesson: a fold that edits spliced text re-runs the APPLY before the battery (twice in one PR: `$p3$`,
  `$p4$`); guard = every `$pN$` pin asserted `= 1` against `v_def`.

74. **`.claude/rules/runtime-workflows.md` step 3 — CLOSED:** folded into #454; no separate docs PR remains.

88. **A real cross-package parts gate (field-level).** `apps/web/lib/parts/types.ts` is a HAND TRANSCRIPTION of
    packages/runtime/workflows/chatTurn.v16.parts.ts — not an import; the catalog's `AllCovered`/`NoExtra` guards
    tie the union only to apps/web's own catalog, and #454's CI parity check is KINDS-level (it cannot see a moved
    field). Today's match is a point-in-time fact (the declarer blob moved once during review, comment-only). Ask:
    an apps/web test that reads the runtime declarer off disk and asserts the four RHS bodies match (the reviewer's
    transcribe-check.mjs shape, wired into `pnpm test`). Until then the obligation sits on #454's final-rebase gate.
89. **Lesson (2026-08-31, rev-p6-2):** a red mutant proves the cell catches THAT mutant, never that the mechanism is
    sound — when a cell walks a LIST, the mutant must land OUTSIDE the list (the F6 "walker" was a five-file allowlist
    whose `>= 5` floor was tuned to exactly what it caught; the reviewer's stale-citation mutant sat inside the five).
91. **INFORM — G1 PR-2a (#456) drain-window residual.** The 3-argument `_settle_wake_task` door stays executable by
    `clara_runtime` while the FROZEN `bankAgent.v1` runs drain (constraint 9 forbids breaking them); its compat body feeds
    the task's CURRENT run/status to the CAS, so during the window a STALE run can settle a task that was rebound to a
    newer run (Codex r2 HIGH-3, measured by G3). Round 3 pins it as a NAMED residual cell, refuses re-settling a settled
    task, and audits compat settles (`settled_via='compat_3arg'`) so the forward D1 (revoke the short door after the
    runtime's five-argument terminal/reconciler versions land — PR-2b/runtime follow-ups) fires on evidence. Blast radius:
    a wake task's settlement attributed to the wrong run in the audit trail during the window — no book entry moves.
91b. **OPEN — awaits ruling. 裁 needed — the compat-door drain horizon (#456 forward D1):** the 3-arg `_settle_wake_task` door is audited
    (`settled_via='compat_3arg'`) and refuses terminal replay, but the FORWARD D1 that revokes it needs a defined
    horizon. Lane recommendation (endorse?): the documented maximum v1 run-and-retry lifetime after the LAST v1 start,
    then repeated ZERO `compat_3arg` audit counts through that entire horizon before the revoke migration ships.
92. **INFORM — close credentials outlived their task (pre-existing, found by Codex r2 on #456):** `_close_wake_ctx` (0138)
    never checked task status, so a close-agent credential minted while running stayed usable for WRITES after the task
    was cancelled/settled. Round 3 recuts `_close_wake_ctx` with a task-liveness gate (D1 inventory 17 → 18).
93. **FOREIGN CHANGE I could not resolve (clock-out item 3):** the main checkout started this session with an UNCOMMITTED
    `M .claude/skills/orchestrator-fable/SKILL.md`; at 02:50 MYT two reviewers independently observed it GONE — `git status`
    clean, no stash, no commit touching the file since 7ea479ad (08-25), HEAD still 10f29373. Something ran a checkout/
    reset against the main working tree. Suspects: a Codex build lane running without a sandbox whose `git reset --hard`
    hit the wrong cwd (the preamble forbids touching the main checkout; the LANE-BRIEF "confirm cwd" lesson exists for
    this), or the owner. The lost edit's CONTENT is unknown to me (never read it). Ask the owner: did you make/discard
    that SKILL.md edit? If not, recover it from the editor's local history; and the lane driver gains a hard guard
    (refuse to run if `git -C <main> status --porcelain` changes during a lane — a post-lane tripwire).
94. **OPEN — awaits ruling. 裁 needed — the bank-agent belt cadence (G1 PR-2b, #449):** the lane built a ONE-HOUR leader-tick cadence for
    `bank.agent_due` (env-tunable) and asks for confirmation. Recommendation: keep 1 h for beta (the belt is idempotent
    per `due_key`; a shorter cadence only burns leader ticks), and keep BOTH wake sources DISABLED until (a) the
    `bank_agent_due_claims` retention belt exists (no prune path today — one row per client/account/due_key forever)
    and (b) the runtime follow-ups from PR-2a land (exact task-minter repoint first). Merge order: #456 → #449.
95. **DISPOSITION RECORDED — COA PR-c (#463, draft, stacked on #462):** my work order asked the lane to make
    `clientOnboarding_v4` CALL `clara.apply_coa_template` automatically and RED-before by deleting the call. The lane
    REFUSED on repo authority (裁-23 Q5: applying a template is a separate HUMAN click; Annex E: no agent bulk-apply path;
    the door requires `_human_ctx` and the workflow holds only runtime/wake credentials) and kept the deferred
    human-checklist consumer. The lane was RIGHT and the WO was wrong — a WO is checked against the rulings before
    dispatch (law: the orchestrator's order does not outrank a recorded 裁). Disposition: PR-c stays as built (v4 records
    the `coa_seed_decision` as a checklist item; the human applies from the onboarding checklist / PR-d editor). No new
    ruling needed. PR-c reviews after PR-b merges.
98. **Follow-up (P4 fix queue, non-gating) — #451's barrier allowlist keys on FILENAME, not bytes:** the native round-7
    reviewer edited an ALLOWLISTED migration (0146) to append a real `EXECUTE format` view rebuild and the suite stayed
    green (a new unreviewed file reds correctly). Reaching it needs a process violation (merged migrations are immutable,
    constraint 10) — LOW. Fix in a follow-up commit: store sha256 beside each reason and assert it. Measured hashes:
    0146 `561ede4d64af78cbc150894b8ca6014f7b1514d45fa5d313ef6681012d2398a6` · 0147 `28cfc3f7d83e28818e455c96849efe61ab...`
    (see the reviewer's report for the full four). Precedent: a migration FILE's sha is already runtime-load-bearing.
97. **OPEN — awaits ruling. 裁 needed — section-only MSIC families in COA templates (#462 N3):** PR-a's editor permits a template family keyed
    by `msic_sections` alone, but Annex E rejected building the section→client mapping — so PR-b's plan treats a
    section-only family as "keyed" with NO predicate that can exclude any client: it would be planted universally, even
    for clients with no MSIC (absence-as-success). Interim (built now): fail closed — section-only non-core families are
    refused/dropped with a named reason. Ask: (a) accept the fail-closed refusal permanently (firm templates must key
    optional families by DIVISION), or (b) approve a DB-owned section→division mapping (a new reference table, seeded,
    owner-maintained) so section-keyed families resolve. Recommendation: (a) for beta — divisions are what the client
    intake already captures; a section mapping is new scope.
96. **OPEN — awaits ruling. 裁 needed — a supersession pointer in a FROZEN completed doc:** `docs/plan/completed/slice4-durable-runtime-contract.md`
    §4.5-4.7 still says "/ready FAILS only on: DB unreachable · world dead · control listener dead · taxonomy HALT" —
    now false after 裁-61 (the storage write joined the hard gates). Every CODE site citing §4.7 carries the amendment
    note, but the contract itself has no forward pointer, so a reader landing there first is misled. Ask: may a one-line
    "SUPERSEDED in part by 裁-61 (2026-08-30): the storage write probe joined the hard gates — see packages/runtime/README"
    be added to that completed doc (a docs-only PR), or does its frozen status win and the pointer live only in the README?
90. **CLOSED — capacity note absorbed into the LANE-BRIEF class. Codex capacity (2026-08-31 ~01:20 MYT):** `gpt-5.6-sol` returned "Selected model is at capacity" on 3 of 6
    launches (both build and read-only) — retried; if it persists, native fresh-context lanes substitute the REVIEW leg
    (existing ruling) and build lanes queue rather than switch model (constraint 5 pins `gpt-5.6-sol`).
