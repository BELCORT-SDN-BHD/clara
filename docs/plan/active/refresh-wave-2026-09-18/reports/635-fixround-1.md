# #635 — fix round 1

**Branch** `impl/635-firm-commercial-settings` · **worktree** `C:\Users\zhant\Desktop\clara-wt\635` · rig PG 55701 / `clara_635`.
Reviews answered: spec `accept` (1 finding), standards `accept` (1), adversarial `fix_then_accept` (10).
**Twelve findings, eleven applied red-first, one deliberately left, none needing ratification.**

```
a9d2d964 fix(db): #635 0233's name-resolution census read the wrong body
6053b9db fix(web): #635 a usage answer carries its month, an unreadable read is not an empty one, and an absent plan is not a failure
436adaae fix(web): #635 the accept control is gated on the caller's own acceptance, not the firm's
34b9a32f test(web): #635 the bookkeeper walk leg asserted the wrong legal face
3ebfadca docs: #635 CONTEXT terms and the three module READMEs for the firm commercial slice
7451ad33 feat(web): #635 /settings/firm reads the firm's legal, commercial and usage state
3e4cece3 feat(db,web): #635 migration 0233, the four-name rig-meta cohort, and the en.json replacement
57a13686 test(db): #635 red-first battery for the firm legal/commercial/usage reads
```
Base for this round: `34b9a32f` (the head the three reviews read).

## Finding → what I did → evidence

### A1 · major · the accept control was unreachable in the one state it exists for — APPLIED

`legal-standing-card.tsx:127` gated the control on `!doc.firmAccepted`, but `standing_live`
(0195:896-906) needs ONE active owner holding BOTH current acceptances. Two owners holding the two
halves reads `firm_accepted: true` on both kinds with `standing_live: false` — the warning renders
and no control does. The branch's own battery asserts that state
(`p635.db.legal_standing_two_people`).

Applied as the reviewer proposed, with one addition of my own: `!standing.standingLive`, so a LIVE
standing still offers nothing (the brief's §3 wording is "when `standing_live=false` … iff
`can_accept_for_firm` — the trigger", and without that clause an owner who had accepted nothing
would be offered a control on a firm that needs no repair). The gate is now
`canAcceptForFirm && !standingLive && status === "published" && myAcceptedVersion !== version`.

Red first: `p635.web.legal_split_acceptance` (a split state offers exactly ONE control, for the kind
this owner has not accepted) failed against the previous component, and
`p635.web.legal_live_offers_nothing_even_to_an_owner_who_never_accepted` pins the other direction.
`components/firm-admin/legal-standing-card.test.tsx`: 3 fail / 12 before, 12 pass / 12 after.

### A2 · major · a new window stamped on the previous month's rows — APPLIED

`readUsage` never reset the view and `AiUsageCard` took `period` and `view` as independent props, so
for one round trip the table showed last month's rows under this month's window, the Download button
stayed live, and `buildUsageCsv` stamped the NEW window on the OLD rows — the provenance header
stating a window its rows did not come from, which is the one thing that header exists to prevent.

Applied as the reviewer's STRONGER option, not the one-liner: the answer now carries its month
(`FirmUsageAnswer = FirmUsageTable & { month }`), the panel stamps it, and the card renders the
loading face while `view.data.month !== period.month`. `setUsage(LOADING)` alone would have flashed
a skeleton on every window focus, because the focus/visibility refresh re-issues the same month.

Red first: `p635.web.usage_period_change` at the PANEL seam (where the defect arises — an August
read held open while September's answer is on screen) failed, then passed; plus
`p635.web.usage_answer_for_another_month` at the card seam.

### A3 · major · §C's name-resolution census read the wrong body — APPLIED

T.3's `users_visible` guard tested `v_code`, last assigned inside T.1's loop over the three new
doors, whose final iteration is `get_firm_ai_usage`. It passed unconditionally, and the migration's
closing notice claimed "names resolved inside the definer body" on the strength of it.

Red first, MEASURED on the rig: `pg_get_functiondef` of the standing door with
`join clara.users u` spliced to `join clara.users_visible u`, installed inside a transaction, then
the migration's §C block (extracted verbatim from the file) run against it —
`C. the SAME tail, against the mutant: PASSED (no exception)`, with the rollback verified
(`D. after rollback: 'users_visible' in the standing door's CODE -> false`). After the fix the same
probe reports `C. … RAISED -> #635 tail: the standing door resolves a name through
clara.users_visible`, and `A. tail as it stands, against the live catalog: PASSED`.

One correction to the reviewer's fix: its alternative — "test `v_src` directly, since `users_visible`
never appears in a comment in that body" — is **wrong and would red a correct door**. The body
names `clara.users_visible` in the comment that explains why it does not use it (0233's `fa` lateral).
The guard therefore re-derives the COMMENT-STRIPPED source, exactly as T.1 does.

**The rig was put back and the edited file re-applied by the real runner**, so the fix is not merely
argued: the pre-image of `get_llm_usage_summary` was restored from `0110:706-754` and verified to
hash to 0233's own measured pin (`51621dea…`) with its ACL unchanged, the three new doors were
dropped, the ledger row removed, and `pnpm db:migrate` then applied 0233 from a genuine pre-0233
state — `#635 prestate: clean`, `#635 tail: OK`, `1 new migration applied · 220 total`.

### A4 · minor · a failed read painted as an empty period — APPLIED

`decodeFirmUsageRows` returned `[]` for any non-array payload and `loadFirmAiUsage` never threw, so
a refusal-shaped body rendered "No model calls in this period." — the generic successful Empty AC3
forbids — while the two sibling reads throw. Applied in full, including the second half the reviewer
asked for: `decodeFirmUsageRows` now returns `{ rows, dropped } | null`, `loadFirmAiUsage` throws on
`null`, the card carries a coverage line (`usageDropped`) and withholds the named zero when rows were
dropped, and `buildUsageCsv` writes the count into the provenance header.

Red first: `p635.reads.usage_not_a_table` and the extended `p635.reads.usage_drops_unreadable`
failed, then passed; `p635.web.usage_dropped_rows`, `p635.web.usage_dropped_rows_reach_the_csv`
(asserted on the real Blob's bytes) and `p635.csv.dropped_rows` are new.

### A5 · minor · the weakest possible focus assertion — APPLIED

`expect(focusTag).not.toBe("BODY")` passed if focus landed anywhere. Replaced with a comparison
against the trigger handle itself:
`await trigger.evaluate((el) => el === document.activeElement)`.

Evidence, per leg: `pnpm --filter @clara/web e2e firm-commercial-walk` -> `8 passed (27.9s)`,
with `ok 8 [chromium] > e2e/firm-commercial-walk.spec.ts:422:1 > 320px and 200% zoom carry no
horizontal page scroll, and focus returns to the trigger after the dialog (2.5s)`. The dialog is
UNMOUNTED on close (`acceptingKind === null`), so this was not a foregone conclusion; it is now
measured rather than assumed. Whole-suite evidence: `pnpm --filter @clara/web e2e firm-commercial-walk firm-navigation-walk shell-migration-walk` (triple 3300/3301/3302) → **49 passed (1.2m) · 0 failed**, exit 0 — the same 49 the pre-fix round produced: `firm-commercial-walk`'s 8 tests / ten legs (the focus-return leg among them, now comparing `document.activeElement` to the trigger handle), plus `firm-navigation-walk` and `shell-migration-walk`'s 41, including axe-zero at `/settings/firm` for owner AND bookkeeper with both legacy sentences and the `<h1>` "Firm settings" pin

### A6 · minor · an absent current plan rendered as a transport failure — APPLIED

`uq_billing_plans_current` (0163:207) permits ZERO current rows; the door then returns a plan whose
every column is NULL and the decoder dropped the WHOLE payload — taking the payment line, the
invoice explanation, the four capacity numbers and the identity card's "In Clara since" with it.
Applied on the WEB side only (the reviewer's first option): `plan` is nullable, the card reads "No
plan is current for this firm", and a HALF-readable plan still drops the payload. The door is not
touched, so no second migration edit and no second rig cycle.

Red first: `p635.reads.commercial_no_current_plan` failed, then passed; `p635.reads.commercial_half_a_plan`
and `p635.web.commercial_no_current_plan` pin the two sides.

### A7 · note · the three non-regression pins couple 0233 to later recutters — APPLIED (report)

No code change was requested and none is right: fail-closed is the intent. Recorded in
`635-final.md` under follow-ups so a future ticket that recuts
`get_current_legal_documents()`, `accept_legal_document(text,integer,text,text)` or
`_accounting_work_egress_live(uuid,uuid)` below 0233 re-measures 0233's four constants in the same
commit. Re-verified for THIS wave: no file 0225-0232 recuts any of the three.

### A8 · note · a tautological cell cited as AC3 evidence — APPLIED (report)

`p635.db.commercial_invoices_constant` asserts two literals the door writes inline, so it can only
fail if somebody edits the door. The cell stays — it is a legitimate regression pin — but the AC3
row in `635-final.md` now cites the SURFACE cells
(`commercial-state-card.test.tsx`'s explanation-and-support-route cell and walk leg (1)) and
describes the database cell as the constant's pin.

### A9 · note · a double-negative money string — APPLIED

`formatMoneyCents(-50, "USD")` read `-USD -0.50`, and `-19900` read `MYR -199.00`: two shapes for
one idea on a money surface. Fixed as proposed. The function had no cell of its own — both callers
only ever hand it non-negative values — so `lib/firm/commercial-format.test.ts` is new (4 cells,
added to `apps/web/test/manifest.txt`). Red first: `p635.format.money_negative_sub_unit` failed with
`actual: '-USD -0.50'`, then passed.

### spec F1 + standards F1 · the named owner hint — APPLIED (one fix answers both)

The hint took `documents.find(d => d.acceptedByName !== null)` — array order, which is kind order —
and said that person "accepted the previous ones", which is false whenever the kind it named is
still validly accepted (standards F1) ; and the cell that exercised the named branch fed it a name
on an UNaccepted document, a shape `0233:267-272` cannot emit because `firm_accepted` and
`accepted_by_name` come from one lateral (spec F1). Both reviewers also noted the assertion was a
substring both hint variants match, so it proved neither.

I kept the named variant — the brief requires it ("with the owner's name where their rank may see
it", §3) — and made it TRUE: it names the most recent acceptance on record, compared as instants
rather than strings, and the copy now says exactly that
(`legalNotLiveOwnerNamed`: "…The most recent acceptance on record was made by {name}."). The
existing cell now uses the realistic shape and asserts the WHOLE sentence; two new cells pin the
choice between two acceptors and the masked fallback.

**Bookkeeping, both corrections recorded rather than rewritten into history**: this one-line spec
change landed inside commit `6053b9db`, whose message names A2/A4/A6/A9 and not A5; and that same
message quotes "238 pass" for the `components/firm-admin` + `lib/firm` subset, which is wrong — the
measured count is **235 tests · 235 pass · 0 fail** (re-run after everything landed). The figure in
the table below is the measured one.

## Deliberately left

- **A10 · note · `get_firm_ai_usage` carries neither `stable` nor `plan_cache_mode`.** Left, on a
  measurement. On `clara_635` today: `get_firm_ai_usage` is `provolatile = v`, `proconfig =
  {search_path=clara, pg_temp}`; the base door it delegates to,
  `get_llm_usage_summary`, is `v` with the same config; the two firm-bound reads are `s` with
  `plan_cache_mode=force_custom_plan`. Adding `stable` would be a declaration the body does not
  honour — PostgreSQL does not check it, and the callee is `volatile` — so the planner would be told
  something false. `force_custom_plan` addresses a firm-bound read whose parameterisation a generic
  plan could freeze; this wrapper takes only `p_period` and binds the firm through
  `clara.jwt_firm()` inside the query, re-evaluated per call. And the brief demanded the pin on "the
  two new firm-bound reads", which §C's T.2 encodes exactly. The reviewer itself rates it a note,
  calls it "within the letter of the brief", and records that the wrapper MATCHES 0110's posture
  rather than regressing it. Applying it would also cost a second migration edit and a second
  rollback/re-apply cycle on the rig. **If the orchestrator wants one posture across the three new
  doors, that is a brief change and I will take it as a ruling.**

## Ratification requested

None. No fix in this round contradicts the brief. A1's added `!standingLive` clause and A6's
nullable plan are both narrower readings of what §3 already says; A4's coverage line is the
`unpriced_calls` idiom applied to a second published tripwire.

## Re-run evidence (all local; hosted evidence pending)

| Command | Result |
|---|---|
| `pnpm typecheck` (worktree root) | **green** — `packages/runtime` Done, `apps/web` Done |
| `pnpm lint` (worktree root) | **green** — eslint + token-contrast + test-manifest + message-keys + ui-add guard, all PASS, through `@clara/reporting-render` |
| `pnpm db:migrate` after the rig rollback | `#635 prestate: clean` · `#635 tail: OK` · **1 new migration applied · 220 total** |
| `packages/db`: `node --test --test-concurrency=1 tests/firm-commercial-settings.test.mjs tests/operation-census.test.mjs tests/rig-isolation.test.mjs tests/f-a9-usage-reshape.test.mjs tests/f-a9-pr-1b.test.mjs tests/checkout-gate-c3.test.mjs` | **162 tests · 161 pass · 0 fail · 1 skipped** (62s). The skip is `rig-isolation` T19, the `CLARA_RIG_ALLOW_RESET`-gated destructive cell this rig must never enable |
| `packages/db`: the §C tail probe (extracted verbatim from the edited file, run against the live catalog and against a rolled-back mutant) | `A. PASSED` · `C. RAISED …users_visible` · `D. rollback clean` |
| `apps/web`: `node --import ./test/bootstrap.mjs --import tsx --test components/firm-admin/*.test.tsx lib/firm/*.test.ts` | **235 tests · 235 pass · 0 fail** |
| `apps/web`: `node scripts/run-tests.mjs` (whole manifest) | **4216 tests · 4214 pass · 0 fail · 2 skipped · 135 suites · 91s.** The two skips are `tests/live-provider-auth.test.ts`'s env-gated cells, re-identified by running that file alone (2 tests · 0 pass · 0 fail · 2 skipped). `thread-live-clarify.test.tsx`'s known whole-suite load flake did not arise |
| e2e (triple `3300/3301/3302`) | `pnpm --filter @clara/web e2e firm-commercial-walk firm-navigation-walk shell-migration-walk` (triple 3300/3301/3302) → **49 passed (1.2m) · 0 failed**, exit 0 — the same 49 the pre-fix round produced: `firm-commercial-walk`'s 8 tests / ten legs (the focus-return leg among them, now comparing `document.activeElement` to the trigger handle), plus `firm-navigation-walk` and `shell-migration-walk`'s 41, including axe-zero at `/settings/firm` for owner AND bookkeeper with both legacy sentences and the `<h1>` "Firm settings" pin |

## Files changed this round

`apps/web/components/firm-admin/legal-standing-card.tsx` (+ its cells) ·
`components/firm-admin/ai-usage-card.tsx` (+ cells) ·
`components/firm-admin/commercial-state-card.tsx` (+ cells) ·
`components/firm-admin/firm-settings-panel.tsx` (+ cells) ·
`components/firm-admin/firm-settings-a11y.test.tsx` ·
`lib/firm/commercial-reads.ts` (+ cells) · `lib/firm/commercial-format.ts` ·
**new** `lib/firm/commercial-format.test.ts` · `lib/firm/usage-csv.ts` (+ cells) ·
`messages/en.json` (one copy change, two new keys) · `test/manifest.txt` (one line) ·
`e2e/firm-commercial-walk.spec.ts` (the focus assertion) ·
`packages/db/migrations/0233_firm_commercial_settings.sql` (the T.3 guard) ·
`packages/db/README.md` · `apps/web/README.md`.

No new route, no `ui:add`, no runtime change, no successor, no frozen byte, no shared-file
widening beyond the two `en.json` keys and the one `manifest.txt` line.
