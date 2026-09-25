# Riders sweep wave · lane 05 · ticket #1093 — Depreciation-particulars proposal read: server-side filter, review-trail read, and completeness predicate cleanups

**Branch** `riders/wS-lane05` · **base** `7bc5a710f` (the wave's own integrated head; `git log --oneline
7bc5a710f..HEAD` before this ticket showed #1056, #1090 and #1092 already landed) · **status: DONE**
(all three acceptance criteria built; no migration, as the ticket predicted).

**Commits** (`git log --oneline 7bc5a710f..HEAD`, newest first, this ticket's three):

| commit | subject |
|---|---|
| `7c7e1f668` | `feat(web): #1093 the settled surface shows what Clara proposed beside a departed field` |
| `b020cfb34` | `feat(web): #1093 the read side of a settled particulars question's review` |
| `2197cf0ff` | `feat(web): #1093 the asset proposal read filters source_ref server-side` |

**Migration: none**, as the ticket itself predicted (`apps/web/lib/registers/fa-particulars-proposal.ts`
is a different file entirely from #1090's and #1092's `packages/runtime`/`packages/db` work, and
carries no database object). Nothing here touches `packages/db`, `packages/runtime` or any applied
migration. **No prestate pins** — there is nothing to pin.

---

## The ticket, as it stands today

`gh issue view 1093 --comments` — OPEN, one AI-triage Agent Brief in the body, **zero comments**
(cross-checked with `gh api repos/BELCORT-SDN-BHD/clara/issues/1093/comments`, which returns `[]`;
`gh issue view --comments` is known to print nothing at all on this host regardless — #1092's own
report already filed that quirk, RIG.md note owed). No 2026-09-20 owner ruling comment exists, so
the body is the whole contract. Source: `wave4-lane05-ticket933.md` follow-ups 3 and 4, and
`wave4-lane05-codereview-spec.json` finding SPEC-933-E; originating ticket #933 (DONE, riders wave 4).

**Verified still live on this branch before building:** read `apps/web/lib/registers/fa-particulars-
proposal.ts` and `apps/web/components/work/work-question-form.tsx` at the branch head before #1093's
own commits — the client-side scan (item 1), the missing kind check (item 2), the missing settled
review (item 3) and the successor contract's narrower `particulars_complete` restatement (item 4,
`docs/plan/active/riders-2026-09-20/reports/wave4-lane05-ticket933.md:244-247`) were all still
exactly as the ticket describes them. Nothing was already satisfied.

**Lane-note cross-check** (prompt's own "LANE NOTES FROM THE SCAN"): confirmed — #1093 is a
different file entirely from #1090's and #1092's `packages/runtime`/`packages/db` work and shares
no body with either.

---

## Seams I tested at (written before the first test, work order rule 4)

1. **`loadAssetParticularsProposal(session, {clientId, assetId})`** —
   `apps/web/lib/registers/fa-particulars-proposal.ts:158`. Observed through the OUTGOING PostgREST
   query string a mocked `fetch` captures (the file's own existing pattern) — the seam AC1 names
   ("uses a server-side `source_ref` filter").
2. **`proposalDepartures(fields, proposal, answer)`** — new, pure,
   `apps/web/lib/registers/fa-particulars-proposal.ts:295`. Observed through its return value alone.
3. **`AcceptedAnswer`'s rendered output**, inside `WorkQuestionForm` —
   `apps/web/components/work/work-question-form.tsx:848`. Observed through the harness-rendered DOM
   (`data-testid="work-question-proposed-<key>"`), the same harness and `data-testid` convention
   `work-question-proposal.test.tsx` already uses for `work-question-proposal` and
   `work-question-accepted-<key>`.
4. **The `claraWork_v6` successor contract's own text** — no code seam exists yet (the step is not
   built); the seam is the contract prose itself, corrected below.

No test at a seam the brief does not give me: I did not add a register-side (asset-page dialog /
Needs-you inline form) settled panel, because `WorkQuestionForm` is already, by its own header
(`work-question-form.tsx:3-7`), "rendered from the Work detail, from the Needs-you inbox and from a
Clara rail card… no per-surface variant" — it IS "whatever surface renders a settled fixed-asset
particulars question" the ticket's Key Interfaces line names, not a second one to build.

---

## AC1 — the proposal read uses a server-side `source_ref` filter (asset id and kind together), replacing the client-side scan

**Done.** `loadAssetParticularsProposal` now sends
`source_ref->>asset_id=eq.<assetId>` and `source_ref->>kind=eq.fixed_asset` as PostgREST filters
(`fa-particulars-proposal.ts:172-176`), and the JS loop that used to compare
`ref.asset_id !== assetId` against every one of the client's pending rows is gone — the loop that
remains only tries `readFaParticularsProposal` per already-matched row, as defence against a
matched-but-unreadable block (`fa-particulars-proposal.ts:186-191`).

**Evidence:**
- Test: `loadAssetParticularsProposal: filters source_ref->>asset_id and source_ref->>kind
  SERVER-SIDE (#1093 AC1)…` (`fa-particulars-proposal.test.ts:130-149`) — asserts the outgoing URL
  literally contains `source_ref-%3E%3Easset_id=eq.11111111-1111-4111-8111-111111111111` and
  `source_ref-%3E%3Ekind=eq.fixed_asset` (the `URLSearchParams`-encoded form of `source_ref->>
  asset_id`/`source_ref->>kind`; verified by hand with `node -e 'new URLSearchParams(...).toString()'`
  before writing the regex). RED before the change (the old query carried neither param), GREEN
  after. Full file: 17/17 pass.
- **The filter's own lawfulness is not re-proven here — it already was.** `packages/db/tests/
  fa-particulars-proposal.test.mjs`'s `p933.read.by_asset` cell (unchanged, not touched by this
  ticket) runs `select id from clara.agent_interruptions where status = 'pending' and
  source_ref->>'asset_id' = $1` as the human role and gets exactly the one row back — "a jsonb-path
  filter on source_ref is admitted to the human role", driven on a live database. This ticket adds
  the `kind` half of the same filter to that same admitted shape.
- **PostgREST syntax checked against current official docs (work order rule 3), not assumed.**
  Context7, `/websites/postgrest_en_v14`: `col->>key=eq.value` is documented, first-class filter
  syntax (`curl "http://localhost:3000/people?select=id,json_data->>blood_type&json_data->>
  blood_type=eq.A-"`). No quoting on the key in the query string, which is what `getRows`'s
  `ReadFilters` (`Record<string, string>` keys passed straight through) already assumes.

## AC2 (item 2, subsumed by AC1 as the ticket itself allows) — kind is filtered alongside asset id

**Done, as part of AC1's own change.** The ticket's own text says this is subsumed once the
server-side filter lands: "if item 1 above is done first, the server-side filter change subsumes
this fix (add the kind check to the filter's own query)". `source_ref->>kind=eq.fixed_asset` is
that filter (`fa-particulars-proposal.ts:176`), asserted by the same AC1 test's second regex match
(`fa-particulars-proposal.test.ts:145-147`).

## AC3 (item 3) — a settled fixed-asset particulars question's page or panel shows both the proposed values and the confirmed values when they differ

**Done.** New pure function `proposalDepartures(fields, proposal, answer)`
(`fa-particulars-proposal.ts:283-308`) compares a proposal against a settled answer FIELD BY FIELD,
reusing `proposalAnswerDraft`'s existing restatement of the proposal in the answer door's own wire
grammar (a `text` driver's `60` becomes the confirmed side's `"60"`) so the comparison is apples to
apples rather than comparing two different grammars. It returns only the fields that actually
departed, each holding what CLARA proposed (never the confirmed value, which is already rendered
beside it). Wired into `AcceptedAnswer` (`work-question-form.tsx:848-878`), the one settled-record
renderer `WorkQuestionForm` uses everywhere it is mounted.

**Evidence:**
- Read side, pure, 5 new tests in `fa-particulars-proposal.test.ts:262-323`:
  - `…a confirmed answer that matches the proposal field for field has no departures` — `{}`.
  - `…a field the person changed comes back holding what CLARA proposed…` — proposal 60 months / nil
    residual, confirmed 84 months / RM1,500.00 residual (the exact `p933.wire.answerable` db-battery
    fixture) → `{ useful_life_months: "60", residual_cents: 0 }`.
  - `…no proposal at all means no departures` — `{}`.
  - `…a field the proposal never grounded is never flagged…` — an unset `rate_bps` proposal beside a
    confirmed `reducing_balance` answer that DOES carry one: `rate_bps` absent from the departure
    set, `method` (which WAS grounded, to `straight_line`) present.
  - `…an answer that is not an object (or absent) reads as no departures — never a throw`.
- UI side, 3 new tests in `work-question-proposal.test.tsx:364-439`:
  - `p933.conversation.settled_departure` — a settled record confirmed 84 months / RM1,500.00
    residual against a 60-month / nil-residual proposal: `work-question-accepted-useful_life_months`
    renders "84" (the confirmed value, unchanged rendering), `work-question-proposed-
    useful_life_months` renders "60" (Clara's proposed value, the NEW annotation), and the untouched
    `start_date`/`method` fields carry NO `work-question-proposed-*` node at all.
  - `p933.conversation.settled_as_proposed` — confirmed exactly as proposed: no
    `work-question-proposed-*` node for any of the six declared fields.
  - `p933.conversation.settled_no_proposal` — a settled ticket-639 question with no proposal block
    at all (`source_ref` carries no `proposal` key): the accepted record still renders, and no
    departure annotation appears anywhere — today's #639-only behaviour, machinery-free.
- Full file: 9/9 pass. `work-question-form.test.tsx` (the sibling file covering every OTHER question
  kind through the same `AcceptedAnswer`): 27/27 pass, unchanged — `proposalDepartures` returns `{}`
  whenever `readFaParticularsProposal` returns `null`, which is every non-FA-particulars question.
- New message `WorkQuestion.proposedWas` (`apps/web/messages/en.json`, beside `answeredBy`):
  `"Clara proposed {value}"`.
- **Deliberately NOT built:** a second settled-review panel on the register side (asset-page dialog,
  Needs-you inline form). Reasoning is in "Seams I tested at" above — `WorkQuestionForm` already
  covers all three surfaces by its own design; those two register-side entrances are PRE-FILL-only
  forms over a question that is still PENDING, and once complete they simply close, handing off to
  the asset's own "particulars" tab (`fixed-asset-detail.tsx`), which shows the asset's CURRENT
  stored facts — a different read, of a different record, not "a settled question's page or panel".

## AC4 (item 4) — `particulars_complete` either matches the workflow's own existing predicate, or its documentation states why it is deliberately narrower

**Done, as a successor-contract correction — no code changes,** because the step this predicate
lives in (`loadFaProposalInputsStepV6`) does not exist yet (confirmed:
`packages/runtime/workflows/registry.ts` carries no `claraWork_v6` entry on this branch; the cut
phase that mints `chatTurn_v22`/`claraWork_v6` has not merged into this lane). Per work order rule 5,
everything a not-yet-built successor needs is delivered as prose here; nothing frozen exists to edit.

**The defect, read rather than assumed.** `#933`'s own successor contract
(`docs/plan/active/riders-2026-09-20/reports/wave4-lane05-ticket933.md:244-247`) specifies step (a)'s
SQL as:

```sql
select fa.asset_account_code, fa.acquired_date,
       (fa.depreciation_start_date is not null and fa.depreciation_method is not null)
         as particulars_complete
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid and fa.id = $2::uuid;
```

— two conditions only. The workflow's OWN EXISTING "should I ask?" predicate,
`loadPendingFixedAssetStepV4` (`packages/runtime/workflows/claraWork.v4.impl.ts:691-717`, live on
this branch, unchanged, unfrozen — `v4.impl.ts` itself is not in `frozen-workflows.json`), restates
`clara._fa_particulars_complete` (`packages/db/migrations/0041_wave_d_a_fa_register.sql:387-397`) in
full, six conditions:

```sql
not (fa.depreciation_start_date is not null
     and fa.depreciation_method is not null
     and (fa.depreciation_method = 'none'
          or (fa.depreciation_method = 'straight_line'
              and fa.useful_life_months is not null and fa.residual_cents is not null)
          or (fa.depreciation_method = 'reducing_balance'
              and fa.useful_life_months is not null and fa.residual_cents is not null
              and fa.depreciation_rate_bps is not null)))
```

The two-condition form is genuinely narrower: it would report `particulars_complete: true` for a
row with `depreciation_method = 'straight_line'` and a `depreciation_start_date` set but
`useful_life_months`/`residual_cents` still null — a row the estate's own `clara.
_fa_particulars_complete` (and `loadPendingFixedAssetStepV4`) correctly call INCOMPLETE. Since this
value decides whether `loadFaProposalInputsStepV6` even asks the dependent particulars question,
the narrower form would silently skip the question for a row that genuinely still needs it.

**The correction, for whoever builds `claraWork_v6`.** Spell step (a) using the SAME six-condition
predicate `loadPendingFixedAssetStepV4` already restates, not the two-condition shorthand:

```sql
select fa.asset_account_code, fa.acquired_date,
       (fa.depreciation_start_date is not null
        and fa.depreciation_method is not null
        and (fa.depreciation_method = 'none'
             or (fa.depreciation_method = 'straight_line'
                 and fa.useful_life_months is not null and fa.residual_cents is not null)
             or (fa.depreciation_method = 'reducing_balance'
                 and fa.useful_life_months is not null and fa.residual_cents is not null
                 and fa.depreciation_rate_bps is not null)))
         as particulars_complete
  from clara.fixed_assets fa
 where fa.client_id = $1::uuid and fa.id = $2::uuid;
```

This is not a narrowing decision anyone deliberately made — #933's own report never says why the
short form was chosen, and #933's OWN account of `loadPendingFixedAssetStepV4` in the very same
report (§ "THE COMPLETENESS PREDICATE IS `clara._fa_particulars_complete`'s, RESTATED") already
states the six-condition form is the right one. This correction brings `particulars_complete`'s own
successor-contract text into agreement with the OTHER predicate the same report already restates
correctly, elsewhere in itself.

---

## Docs

- `apps/web/messages/en.json`: one new key, `WorkQuestion.proposedWas`, placed beside `answeredBy`
  (the file's `WorkQuestion` section is grouped thematically rather than alphabetically; this sits
  with the other settled/accepted-answer strings). `check-message-keys.mjs` (part of `pnpm lint`)
  passes — no unused or missing key.
- `CONTEXT.md`: checked, not edited. The existing "Depreciation particulars proposal" entry
  (`CONTEXT.md:1046-1067`) describes the proposal itself; this ticket adds no new domain CONCEPT
  (server-side filtering is a transport detail, and "what was proposed vs. what was confirmed" is
  already covered by the entry's own "it is never applied on its own — a person confirms it or
  edits it" line) — no new vocabulary to record.
- No module `README.md` exists for `apps/web/lib/registers/` or `apps/web/components/work/`
  (checked: `find … -iname README*` returns nothing) — nothing to update there.
- This report's own "Successor contract" section below is the AC4 documentation deliverable itself.

---

## Successor contract — `claraWork_v6`'s `loadFaProposalInputsStepV6`, the `particulars_complete` correction

This SUPERSEDES #933's own step (a) SQL (`wave4-lane05-ticket933.md:239-247`) on this one point only;
everything else in that contract (imports, zod input, step (b), the mapping, refusal mapping, part
kind) is unchanged and not restated here. **Nothing frozen was edited; the step does not exist yet.**

**Corrected step (a) SQL** — see AC4 above for the corrected statement and the reasoning. Feed its
`particularsComplete` output into `FaProposalInputs.asset.particularsComplete` exactly as #933's own
contract already specifies; nothing else in the assembly changes.

**Everything else in #1093 stays inside `apps/web` and needs no successor-contract entry**: AC1–AC3
are a browser-side read and render over an ALREADY-DELIVERED `source_ref`/`answer` pair (#933's own
wire, unchanged), not a workflow-side concern — `claraWork_v6` (or any later successor) needs no
new tool, no new zod input, no new door call and no new prompt stanza for any of them.

---

## Gates, with counts

- **Test files touched**, full results:
  - `apps/web/lib/registers/fa-particulars-proposal.test.ts` — 17/17 pass (12 pre-existing + 5 new
    `proposalDepartures` cells; the one AC1 cell was rewritten in place, RED confirmed before the
    server-side-filter change, GREEN after).
  - `apps/web/components/work/work-question-proposal.test.tsx` — 9/9 pass (6 pre-existing + 3 new
    settled-review cells; the new cells RED before `AcceptedAnswer`'s wiring, GREEN after).
  - Regression check, same shared component (`AcceptedAnswer`) or same module, all pre-existing,
    untouched, run to confirm nothing broke: `work-question-form.test.tsx` 27/27,
    `components/firm/fixed-asset-proposal-prefill.test.tsx` 4/4,
    `components/firm/fixed-asset-incomplete-affordance.test.tsx` 3/3,
    `components/registers/fixed-asset-detail.test.tsx` 10/10.
- **`pnpm typecheck`** (from the worktree root): clean — `apps/web` and `packages/runtime` both
  "Done", no errors.
- **`pnpm lint`**, `CI=true GITHUB_ACTIONS=true`: clean end to end (exit 0), **with one environmental
  caveat, not a defect of this ticket**: `scripts/check-frozen-workflows.mjs` compares against
  `origin/main` by default, and `origin/main` in this SHARED repository moved 59 commits past this
  lane's own base (`7bc5a710f`) partway through this session — `061a6992b`, "Merge pull request
  #1140 from BELCORT-SDN-BHD/integration/riders-cut" — because another concurrent agent in this
  same orchestration merged the cut phase into the real `origin/main` while this ticket was in
  flight (git worktrees share one object store and remote-tracking refs; this is not this lane's own
  drift). Run bare (`node scripts/check-frozen-workflows.mjs`), it reports 28 "REMOVED-VS-BASE" /
  "REGISTRY-DOWNGRADE" violations, all of them `chatTurn_v22`/`claraWork_v6`/`statementFacts_v4`
  files that exist on the NEW `origin/main` but not on this lane's OWN base — none of them touched
  by this ticket (this ticket adds zero files under `packages/runtime/workflows`). Run with
  `FREEZE_BASE_REF=7bc5a710f` (the script's own documented override, matching this wave's own
  addendum: "Everywhere a rule above says `origin/main..HEAD`, read `<base>..HEAD`"), it reports
  clean: `freeze-lint: OK — 322 frozen file(s) verified…; 57 "use workflow" module(s) all
  frozen+registered; 3 retired entr(ies) recorded.` The full `pnpm lint` chain, re-run with that same
  override exported, exits 0 end to end. One real, self-inflicted catch along the way: two `#639`-
  style ticket references in the new UI test file tripped the raw-colour-value ESLint rule (#994's
  own documented false-positive shape — 3 hex-looking characters after `#`); reworded to "ticket-639"
  to match the file's own pre-existing convention two tests above, per the rule's own stated fix.
- **`apps/web` touched, whole unit suite once** (`node scripts/run-tests.mjs` from `apps/web`):
  5186 tests, **5184 pass, 0 fail**, 2 skipped (both pre-existing and unrelated — live Supabase auth
  env vars not configured on this rig; mocked coverage lives elsewhere, per the skip's own message).
- **`apps/web` touched, browser walks**, on this lane's own triple
  (`CLARA_E2E_APP_ORIGIN=https://127.0.0.1:3520 CLARA_E2E_NEXT_PORT=3521
  CLARA_E2E_RUNTIME_PORT=3522`, `clara_l03`):
  - `work-question-walk` — 14/14 pass (the broadest regression check: every question kind renders
    through the SAME `AcceptedAnswer` this ticket edited).
  - `fixed-asset-acquisition-walk` — 9/9 pass (exercises `useFaParticularsProposal` →
    `loadAssetParticularsProposal` through the register-side dialog).
  - `depreciation-walk` — 5/5 pass.
- **Not touched, so not gated**: `packages/db`, `packages/runtime` (no `.mjs`/`.ts` file under
  either changed — `check-parts-parity.mjs` and the db gate chain do not apply to this ticket).

---

## Follow-ups worth filing

1. **The successor-contract correction above (AC4) is prose, not a merged fact.** Whoever builds
   `claraWork_v6` must actually use the corrected SQL, not #933's original two-condition shorthand —
   nothing enforces that automatically until the step exists and its own tests pin the six-condition
   form.
2. **The full percent-encoded HTTP round trip is not measured against a REAL PostgREST server in
   this rig** — see "Anything unverified" below; this is a candidate for whoever eventually stands
   up a live-PostgREST leg of the db-live-gates chain, not a gap specific to this ticket.
3. `gh issue view --comments` returning silent empty output on this host (already flagged by
   #1092's own report, RIG.md note still owed) — reconfirmed here independently via
   `gh api repos/BELCORT-SDN-BHD/clara/issues/1093/comments`.

---

## Anything unverified

- **The full HTTP round trip of the percent-encoded jsonb-path filter key
  (`source_ref-%3E%3Easset_id`) against a REAL running PostgREST/Supabase gateway is not measured
  in this rig.** What IS measured: (a) the predicate itself is lawful SQL under the human role's own
  RLS, driven on a live database, by the PRE-EXISTING `p933.read.by_asset` db-battery cell (not
  touched by this ticket); (b) the web unit test proves `getRows`/`buildPathAndQuery` constructs and
  sends EXACTLY that query string; (c) PostgREST's own current documentation (queried live via
  Context7, `/websites/postgrest_en_v14`, work order rule 3) documents `col->>key=eq.value` as a
  first-class filter, and standard RFC 3986 percent-encoding of the `>` characters in a query-string
  KEY is unremarkable, ordinary HTTP that any WAI/Warp-based server (which PostgREST is) decodes
  before parsing — but no cell in this ticket sends a real HTTP request to a real PostgREST instance
  and reads back a real filtered row. This rig's e2e legs mock PostgREST-shaped responses
  (`e2e-mock`) rather than running a real PostgREST binary, so nothing available to this lane closes
  that last gap; it would need a live-PostgREST leg this rig does not currently offer.
- **Hosted behaviour** is inferred from this lane database (migrated from scratch to the sweep
  wave's frontier) and from reading `origin/main` at the moment this ticket built; it is not measured
  against a hosted database.

---

*Message mid-task, per SWEEP-WAVE RULE (f): none arrived during this ticket.*
