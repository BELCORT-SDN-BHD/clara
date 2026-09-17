# Wave 2026-09-15 — follow-up issues to file

Compiled from `reports/WAVE-DIGEST.md` §3 (cross-cutting + ticket-specific tables), merged where
several rows are the same underlying defect, plus the four items DECISIONS §3.1 and the #649
round-2 re-check named as follow-ups but that the digest did not carry as its own row. Order below
is `gh issue create` order. Every issue gets `needs-triage` plus exactly one of
`ready-for-agent`/`ready-for-human` (the digest's own suggestion, kept unless a merge changed the
shape of the work). None are `idea` — these are all engineering follow-ups, not product ideas.

Nothing below duplicates an issue that already exists: `#676` (posted-effect integration for
document corrections), `#658`/`#663` (automatic Knowledge/Work re-assessment), `#636` (batch
aggregate progress), `#640` (accepted-plan lifecycle, already merged), `#707`/`#693` (pre-existing
Windows reds), and `#624` (document classify surface) are all referenced by name inside the source
reports as the tracked home for that adjacent work, and are excluded here.

---

### Activity-kind ladder misfiles events under "documents"

labels: needs-triage, ready-for-human

**Context.** `clara.list_activity` / `get_activity_event`'s kind ladder files membership, invite,
asset-acquisition, counterparty-identity and client-home-facet events under the `documents` rung
instead of their own kind. DECISIONS D13 ruled this out of scope for wave 2026-09-15 and commits
the orchestrator to opening this issue; six tickets (#625, #633, #639, #646, #647, #650)
independently hit and named the same residual rather than each patching a shared ladder function
mid-wave.

**What is wrong.** The ladder's `CASE`/lookup only recognizes a `documents` bucket for several event
kinds that are not document events at all, so the firm activity feed mis-labels them.

**Done when.** Each named kind (membership, invite, asset-acquisition, counterparty-identity,
client-home-facet) files under its own kind in both `list_activity` and `get_activity_event`, with a
migration and a regression cell per kind, and none of the six citing tickets' own activity-feed
cells regress.

**Evidence.** DECISIONS.md §0 D13; WAVE-DIGEST.md §3 cross-cutting row 1 and the six tickets' own
final reports for exact call sites.

---

### Lane mocks read POST bodies without the shared cache, so a shared verb loses data

labels: needs-triage, ready-for-agent

**Context.** Several `*-mock.mjs` files read a POST body with their own local reader before
checking whether the verb is theirs. Once a second lane legitimately shares that verb, the first
lane's reader has already drained the stream and the second lane gets nothing. Found and fixed
independently by #633, #647 and #653; #653's own fix-round instance crossed into the
**already-merged #640**, breaking `plans-mock.mjs`'s handling of `pause_accounting_plan` (both
mocks were repointed to the shared `readCachedJson` and #640's `plans-walk` re-run green, 9/9).

**What is wrong.** No structural guard stops a new mock file from defining its own body reader
instead of the shared cached one.

**Done when.** A census cell in `e2e-fixture-ownership.test.ts` (or a sibling file) asserts no
`*-mock.mjs` defines its own request-body reader; all existing mocks route through the shared
`readCachedJson`.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting rows 2 and 10; #633/#647/#653 final and fix-round
reports.

---

### `e2e-fixture-ownership.test.ts`'s verb-ownership census is blind to non-standard dispatch spellings

labels: needs-triage, ready-for-agent

**Context.** The census (`RPC_VERB_OPENER`/N5) reads a fixed set of dispatch shapes. A mock that
spells its switch variable differently (not `verb`) is invisible to it, so a real undeclared shared
claim passes silently. Found by #646's fix round while closing a blocker on the same census.

**What is wrong.** The census's pattern-match is too narrow to catch every dispatch spelling in use
across twelve lanes' mocks.

**Done when.** The census recognizes at least the dispatch spellings measured across this wave's
mocks, with a regression fixture using a non-standard spelling proving the blind spot is closed.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 3; `646-fixround-1.md` finding F1.

---

### Playwright walks flake under twelve-lane host contention

labels: needs-triage, ready-for-human

**Context.** Sign-in navigation and whole-file runs intermittently exceed default 30s budgets purely
from host load (up to ~100 concurrent node processes across sibling lanes), producing reds with no
code cause. Named independently by #633, #638, #650 and #653.

**What is wrong.** No documented or enforced isolation between concurrent Playwright lanes on one
host, so timing-sensitive assertions read as flakes rather than defects.

**Done when.** Either a `cellBudgetMs`-style parameterised budget for `signInTo` and similar helpers
ships, or RIG.md documents a "one browser lane at a time" rule and CI/local tooling enforces it.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 4.

---

### `npx playwright test` silently serves a stale build instead of building from HEAD

labels: needs-triage, ready-for-agent

**Context.** `playwright.config.ts`'s `webServer` just runs `next start` against whatever `.next/`
already contains; only `pnpm --filter @clara/web e2e -- <spec>` (`node e2e/run.mjs`) builds first.
Two round-1 reviewers and the #648 worker's own first attempt were all silently testing a
19-minute-stale build, producing a meaningless failure on a control that only existed in source.

**What is wrong.** There is no guard or prominent warning distinguishing the two invocation paths,
so a reasonable command produces a plausible-looking but invalid result.

**Done when.** Either `npx playwright test` refuses to run against a stale `BUILD_ID`, or RIG.md and
the Playwright config's own comments make the distinction impossible to miss.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 5; `648-fixround-1.md`'s "Playwright — and the
reason neither reviewer could finish it" section.

---

### `rig-isolation.test.mjs`'s T10b cell reds after the Workflow/WDK world is bootstrapped

labels: needs-triage, ready-for-agent

**Context.** `graphile_worker`'s functions become PUBLIC-executable once the world schema exists, so
`clara_agent_ro`/wake roles "reach outside" and T10b fails — rig state, not a migration defect, but
no lane can currently tell the two apart automatically. CI keeps world and rig databases separate; a
local rig cannot. Hit by #633, #652 and #653.

**What is wrong.** A local rig that has ever bootstrapped the Workflow world cannot distinguish
"T10b reds because of world contamination" from "T10b reds because of a real regression."

**Done when.** T10b either detects world-schema presence and skips itself with a named reason, or a
documented recipe isolates a rig cleanly.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 6.

---

### `0154_binding_proposal_pr_1`'s role census is a cluster-global literal

labels: needs-triage, ready-for-agent

**Context.** Postgres roles survive `drop database`, so a from-scratch re-apply into a fresh
database on a cluster that already ran the chain reds ("the clara role count moved from 14 to 18").
Hit independently by #646, #653 and #654, once costing a full chain restart.

**What is wrong.** The census's `= 14` literal assumes a virgin cluster, which is not the state of a
reused rig cluster.

**Done when.** Either the census scopes to roles minted by that migration's own frontier, or RIG.md
documents that a from-scratch re-apply needs a fresh cluster (or the four post-0154 roles dropped
first).

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 7.

---

### `_subledger_on_approve` caller-census pin is stale everywhere it's copied

labels: needs-triage, ready-for-agent

**Context.** Multiple migrations assert the historical caller count of four when the measured live
count is six (`finalize_close`, `reopen_fiscal_year` added by 0056). Both #638 and #639 pin the
roster independently at six in their own new migrations (0221, 0216) rather than fixing the shared
stale text, per DECISIONS §1.3's no-shared-recut rule.

**What is wrong.** A pin copied across migrations drifts from reality and each new migration has to
re-derive the correct number rather than reading it from one place.

**Done when.** One migration re-derives and re-states the six-name pin once so later migrations can
reference it instead of copying stale text; both 0216 and 0221's own pins are reconciled at
integration per WAVE-DIGEST §5's merge-order hazard note.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 8 and §5 integration hazard row 1.

---

### `next build` intermittently panics under heavy host contention on Windows

labels: needs-triage, ready-for-human

**Context.** A Windows process-creation failure (`0xc0000142`, PostCSS loader) occurs under memory
pressure with twelve lanes live; a retry clears it. Hit by #646.

**What is wrong.** No documented workaround exists, so each occurrence looks like a fresh mystery
rather than a known class.

**Done when.** RIG.md or CONTRIBUTING carries a documented workaround/retry note, or CI capacity is
adjusted to avoid the contention class.

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 9.

---

### Verify `plans-mock.mjs`'s shared-verb repoint after merge (touches already-merged #640)

labels: needs-triage, ready-for-agent

**Context.** #653 shared `pause_accounting_plan` with #640's `plans-mock.mjs` without body-caching,
which broke #640's own mock; both were repointed to a shared `readCachedJson` inside #653's branch.
This edits a file outside #653's declared scope and touches an already-merged, shipped ticket.

**What is wrong.** A shared-verb fix for two tickets landed entirely inside #653's diff instead of
being split across both, so the merge needs an explicit check that both mocks still agree and that
#640's own walk is unaffected.

**Done when.** After the wave merges, `plans-mock.mjs` uses the shared `readCachedJson` for both
tickets' verbs, and #640's `plans-walk` re-runs green (it was 9/9 when #653's fix worker last
confirmed it).

**Evidence.** WAVE-DIGEST.md §3 cross-cutting row 10 (#653); WAVE-DIGEST.md §5 integration hazard
row 4 (`plans-mock.mjs` broken by a new shared-verb claimant).

---

### Signed-out invite preview has no route

labels: needs-triage, ready-for-human

**Context.** #625's `clara.preview_invite` is `clara_authenticated`-only and the estate declares no
`anon` role, so showing invite content before sign-in needs a server route holding a service key —
deliberately out of scope for #625 itself.

**What is wrong.** An invitee who has not yet signed in cannot see which firm or role they are being
invited to before starting the sign-in flow.

**Done when.** A server route (holding a service key, never exposing it to the browser) renders the
same firm/role/masked-email preview `preview_invite` returns post-sign-in.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 1 (#625); `625-final.md` D1 residual.

---

### Give invite preview/roster a fifth effective status for a since-demoted/removed issuer

labels: needs-triage, ready-for-human

**Context.** An invite from an issuer who has since been demoted or removed still previews and
lists as `pending`, because the outcome set is fixed at four per DECISIONS §2 #625 and
`brief-625.md`'s "invent no collapsing scheme." Ratified as shipped (DECISIONS §3.0 R1, §3.1): the
four-outcome set stays for this wave, the divergence is pinned by a cell
(`p625.preview.issuer_rank`), and a real fix is explicitly deferred here.

**What is wrong.** The preview and the admin roster can disagree about whether an invite is
meaningfully still open, because neither considers the issuer's current standing.

**Done when.** A product decision on the fifth status is made and both `preview_invite` and the
admin roster's read agree on it, closing the gap the pinned cell currently just documents.

**Evidence.** DECISIONS.md §3.0 R1, §3.1 row 2 (#625); WAVE-DIGEST.md §1 row 2 and §3 row 2.

---

### Stale client-register fixture count in `firm-navigation-walk.spec.ts`

labels: needs-triage, ready-for-agent

**Context.** `firm-navigation-walk.spec.ts:370` asserts 4 rows against a shared fixture array that
now holds 7 rows. Pre-existing, unowned by #625's diff, found while #625 worked nearby.

**What is wrong.** The assertion is stale and will read as a false failure (or false pass, if it
never runs) whenever the shared fixture changes.

**Done when.** The assertion reads the fixture's own length rather than a hard-coded number, or is
updated to match.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 3 (#625).

---

### A mail-transport base-URL seam for invite walks

labels: needs-triage, ready-for-agent

**Context.** Today's invite walks cannot prove invite → pending-row without making a real outbound
courier call, because there is no seam to intercept the mail transport's base URL in a test.

**What is wrong.** A meaningful class of invite-flow assertions is unreachable without hitting a
real mail provider.

**Done when.** A seam (env var or DI point) lets a walk substitute a local base URL and assert on
what would have been sent.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 4 (#625).

---

### Poll-bound test-budget cells can assert a vacuous bound

labels: needs-triage, ready-for-agent

**Context.** `useSettlePoll` waits 1.5s before its first tick while the harness's `settle()` is a 0ms
hop, so a "stays inside its tick ceiling" cell can pass while asserting zero ticks ran. Found by
#633; likely not unique to this file.

**What is wrong.** A cell can report green while its intended assertion (that ticking actually
happened and stayed bounded) never exercised the ticking path at all.

**Done when.** A repo-wide census flags any poll-bound budget cell whose harness settle time is
faster than the poll's own first-tick delay, and the #633-found instance is fixed.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 5 (#633).

---

### `document_filings` has no list-form read for a set of documents

labels: needs-triage, ready-for-agent

**Context.** Today costs one filings read per client plus one `documents?id=in.(…)` call; a single
door would beat both at scale. Found by #633 while building the document intake surface.

**What is wrong.** Reading filing state for a set of documents requires N+1-shaped calls instead of
one batched read.

**Done when.** A new read door accepts a set of document ids and returns filing state for all of
them in one call, with the two call sites it would replace migrated.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 6 (#633).

---

### Need a Tier-A-complete autodraft fixture

labels: needs-triage, ready-for-human

**Context.** Today's fixture only proves `admit_autodraft_task` is reached and skipped
(`tier_a_fails`, `direction_unresolved`, `vendor_unresolved`, `no_consent`); proving an admitted
coding task needs counterparty resolution, a resolved direction and coding consent — the autodraft
lane's own fixture, out of #633's scope.

**What is wrong.** No fixture exists that drives a genuinely admitted (not just reached-and-skipped)
autodraft coding task, so that path is unproven.

**Done when.** A fixture with resolved counterparty/direction/consent proves `admit_autodraft_task`
succeeding, not just being reached.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 7 (#633).

---

### `document-admin.tsx`'s classify Select still offers a kind the door always refuses

labels: needs-triage, ready-for-agent

**Context.** The classify `Select` still offers `consent_evidence`, a kind `set_document_kind`
always refuses. Out of #633's scope (owned by #624/#646's detail surface).

**What is wrong.** A user can select an option that is guaranteed to be refused by the door,
producing an avoidable refusal round-trip.

**Done when.** `consent_evidence` is removed from the classify Select's option list, or paired with
inline messaging explaining why it will refuse.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 8 (#633).

---

### No Playwright coverage for the `?tab=staffAdvances` view

labels: needs-triage, ready-for-agent

**Context.** Deliberately split out of #638's brief; zero browser coverage exists today for this
view.

**What is wrong.** A shipped, reachable view has no browser-level regression protection.

**Done when.** A walk exercises the `?tab=staffAdvances` view's core states.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 9 (#638).

---

### Label a staff-expense claim on the Work LIST, not only the detail

labels: needs-triage, ready-for-agent

**Context.** `clara.list_accounting_work` prints "Journal entry" for a claim today; the claim label
only resolves via `get_work_claim_origin` on the detail view. Needs a `claim_id`/`claimant_label`
projection or a batched origin read on the list.

**What is wrong.** A bookkeeper scanning the Work list cannot tell a staff-expense claim apart from
an ordinary journal entry without opening each row.

**Done when.** The Work list surfaces the claim label using a batched read, without an N+1 call per
row.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 10 (#638).

---

### Multi-advance allocation inside one staff-expense claim

labels: needs-triage, ready-for-human

**Context.** Today: one advance per claim, no silent FIFO — a deliberate scope cut in #638's brief.

**What is wrong.** A claim that should net against more than one open advance cannot today; the
scope cut needs a product decision on the allocation rule before it can be built.

**Done when.** A product decision on the allocation rule (explicit choice vs. some ordering) is made
and implemented.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 11 (#638).

---

### Fixed-asset CLR40 refusal handling needs cleanup

labels: needs-triage, ready-for-human

**Context.** Two related CLR40 defects surfaced by #639. (a) CLR40 is outside
`claraWork.v1.errors.ts`'s CLR default list, so it always settles Work
`failed`/`internal`/non-recoverable even though the belt gives a human remedy ("reverse and re-book
at the corrected cost"). (b) The belt evaluates enrolment at `approved_at` while the birth trigger
joins only `fp.active`, so an entry approved in the same transaction that retires a profile is
refused CLR40 by the birth side only — a pre-existing disagreement between the two guards.

**What is wrong.** A recoverable, human-actionable condition surfaces as an unrecoverable internal
failure, and the belt and birth trigger read different temporal signals for the same edge case.

**Done when.** CLR40 is added to `claraWork_v4`'s error classification with the human remedy
surfaced (a cell proves the Work settles as a refusal, not a failure); separately, a
product/engineering decision picks one behaviour for the same-transaction retirement race, and both
guards agree on it with a regression cell.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 12 and 13 (#639).

---

### A firm/class-level default depreciation policy

labels: needs-triage, ready-for-human

**Context.** Would make the "particulars absent" branch rarer in fixed-asset acquisition; none
exists today. #654 owns firm defaults generally, so this is a natural extension of that catalogue.

**What is wrong.** Every fixed-asset acquisition without explicit depreciation particulars parks a
question, even when a firm or asset-class default would answer it.

**Done when.** A product decision on scope (firm-level, class-level, or both) is made and the
catalogue/eligibility wall #654 built is extended to carry it.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 14 (#639).

---

### No opening-seed fixture for the fixed-asset K-family "scheduled_run" exclusion arm

labels: needs-triage, ready-for-agent

**Context.** Remains belt-only evidence (0041 arm 1's CLR38 guard); building a fixture that proves
it from an opening-seed context is its own lane of work, out of #639's scope.

**What is wrong.** A real guard's opening-seed exclusion path has never been exercised by a fixture.

**Done when.** A fixture drives the scheduled_run exclusion arm from an opening-seed context and
asserts CLR38.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 15 (#639).

---

### A document correction leaves affected Work questions answerable at their stale version

labels: needs-triage, ready-for-human

**Context.** `answer_work_question` compares only `question_version`+`basis_digest`, never
`knowledge_version`; needs a runtime re-ask once #654's `claraWork_v4`
`observedRevisions({knowledge_version})` lands. Found by #646.

**What is wrong.** A source document correction (#646) can silently outdate a pending Work question
that nothing forces to be re-asked.

**Done when.** Once `observedRevisions({knowledge_version})` ships (#654's successor contract), a
changed source forces the affected question to a new version rather than staying answerable at the
old one.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 16 (#646); `646-final.md` residual.

---

### C88.16 has no identified resolution

labels: needs-triage, ready-for-human

**Context.** No matching commit, migration, or report anchor was found for C88.16 during #646's
work; two clue-only candidates exist (`0191:1197`, ARCHITECTURE §7). Needs discovery work before
anyone can say whether it is done, in progress, or not started.

**What is wrong.** A named historical row has no evidence trail connecting it to any shipped work.

**Done when.** Discovery work either identifies the shipping commit/migration and closes this as
resolved, or confirms it is genuinely unbuilt and re-files it as a real ticket.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 17 (#646).

---

### Give the vendor-binding ambiguity (C08.3) a resolution face against current identity

labels: needs-triage, ready-for-human

**Context.** Today only resolvable via the firm-admin `/settings/vendor-bindings` ceremony, which is
not where the ambiguity is seen; a client-scoped face over `get_counterparty_identity`'s conflicts
would close the loop. Found by #647.

**What is wrong.** Resolving a vendor-binding ambiguity requires navigating away from the surface
where the ambiguity is actually noticed.

**Done when.** A client-scoped resolution face exists over `get_counterparty_identity`'s conflicts.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 18 (#647).

---

### Consume the four counterparty-identity domain events

labels: needs-triage, ready-for-human

**Context.** `counterparty.renamed`/`.alias_added`/`.alias_retired`/`.identifiers_set` are routed
`context_update` with no consumer today, per D11's deliberate scope cut (write tooling deferred to a
v20 contract).

**What is wrong.** Four real domain events are emitted into a channel nothing reads.

**Done when.** A product decision on the first consumer (chat surfacing, activity feed, or an
automation) is made and implemented.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 19 (#647); DECISIONS.md D11.

---

### `merge_counterparties` technical debt: repoint residue writers and document its lock order

labels: needs-triage, ready-for-agent

**Context.** Two declared-residue writers, `merge_counterparties` and `tick_seeding_proposal`, still
insert aliases directly and land `recorded_via='legacy_unknown'` instead of going through #647's
provenance-tracked path. Separately, `merge_counterparties`' lock order is a 0149 splice #647 could
not recut this wave; a future writer taking the counterparty-then-alias order would reopen a
deadlock class #647's own fix-round avoided by dropping an FK (`647-fixround-1.md`).

**What is wrong.** Two writers bypass the new provenance discipline, and the function's lock
ordering is tribal knowledge rather than documented invariant.

**Done when.** Both writers are repointed through the provenance-tracked alias path, and the lock
order is documented in `packages/db/README.md` (or the function's own header) so a future writer
does not reopen the deadlock.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 20–21 (#647); DECISIONS §3.1 row 6 (#647).

---

### A cell for the three counterparty-door dialogs' shared draft rule

labels: needs-triage, ready-for-agent

**Context.** "Survive a refusal, discard on success, re-seed only where fields are current values"
is the shared rule across #647's three counterparty dialogs — only the identifier dialog's half is
celled today.

**What is wrong.** A cross-dialog behavioural contract exists but is only partially tested, so a
future edit to one dialog could silently break the shared rule.

**Done when.** All three dialogs have a cell proving the same shared draft-survival rule.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 22 (#647).

---

### Firm setup applicability predicates

labels: needs-triage, ready-for-agent

**Context.** `mpers_eligibility` (Sdn Bhd only) and `tin` (turnover-gated) are asked unconditionally
in #648's firm-setup checklist because `clara.firm_setup_keys` has no predicate column.

**What is wrong.** Every firm is asked questions that only apply to some of them, because the
catalogue cannot express conditional applicability.

**Done when.** An `applies_when` expression column (or a second derivation door) lets the catalogue
skip inapplicable items based on earlier answers.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 23 (#648).

---

### Optional education content for firm setup (A5)

labels: needs-triage, ready-for-human

**Context.** AC2's "optional education can be skipped" has a mechanism (`item_kind='education'`)
and zero seeded rows. Needs owner-authored content, not code.

**What is wrong.** A shipped mechanism has nothing in it.

**Done when.** The owner authors and seeds education content for at least the highest-value catalogue
items.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 24 (#648).

---

### Firm registration identity has no canonical home

labels: needs-triage, ready-for-human

**Context.** D10 parked legal name / SSM / TIN / address / MIA as plan items, not knowledge records.
Once #647/#654 settle the identity boundary, a decision is owed on whether these become knowledge
keys or columns on `clara.firms`.

**What is wrong.** Firm identity facts sit in a provisional location (onboarding plan items) with no
committed long-term home.

**Done when.** A product/architecture decision picks the canonical home and a migration plan for the
existing plan-item data is written.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 25 (#648); DECISIONS.md D10.

---

### Harden `uq_onboarding_plans_one_open_firm`'s predicate

labels: needs-triage, ready-for-agent

**Context.** Currently `state='open'`; a structural `(firm_id) where scope_kind='firm'` predicate
would make the related single-row read (`claim_paid_firm`'s bare `select … into`) structurally
single-row rather than correct only by argument discipline.

**What is wrong.** The invariant "a firm holds exactly one firm plan for life" is enforced by
convention (the sole writer's discipline), not by the index predicate itself.

**Done when.** The predicate is widened to make the invariant structural, with a migration and a
regression cell.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 26 (#648).

---

### 0218 firm-setup migration polish (three items deferred while byte-frozen this round)

labels: needs-triage, ready-for-agent

**Context.** #648's fix round found three small SQL-side defects in migration 0218 but left all
three unpatched because the migration was deliberately kept byte-unchanged that round (each has a
documented reason it is unreachable today, and editing would have cost a rollback/re-apply cycle
across two rigs for no correctness gain this wave): (1) a no-op firm-setup reconciliation still
rotates the CAS token even when nothing changed — unreachable today since the seed control only
renders pre-seed and now carries a per-attempt op key; (2) `get_firm_setup` paints progress for a
plan that does not exist — harmless today since both web consumers null-check `plan_id` first; (3) a
withdrawn firm default stays in `confirmed_facts` because the fact projection filters only on
`superseded_at is null` — the web-side dead end is already closed via a `knowledge_record_id`
carve-out, but the SQL-side intent statement is still owed.

**What is wrong.** Three small correctness gaps sit in a shipped migration, each currently masked by
a web-side guard or an unreachable UI path.

**Done when.** Each of the three is fixed in a follow-up migration with its own regression cell,
independent of any web-side workaround.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 27–29 (#648); `648-fixround-1.md` N2/N3/N4.

---

### `StateBanner` silently drops `data-testid`

labels: needs-triage, ready-for-agent

**Context.** Its prop list is closed and the component spreads nothing, but TypeScript skips
excess-property checks on hyphenated JSX attributes, so `work-question-form.tsx` passes four
`data-testid` values that never render. Found by #648.

**What is wrong.** Test selectors that look like they should work silently do nothing, which is only
discoverable by manual inspection.

**Done when.** `StateBanner` either accepts and forwards `data-testid`, or a lint rule catches
hyphenated props passed to a component that does not declare them.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 30 (#648).

---

### UI-21's full-screen onboarding altitude leg has no runnable home

labels: needs-triage, ready-for-human

**Context.** `interview-walk.spec.ts` only runs under the docker-based live-stack runner, which no
lane in this wave had locally; #649's fix round left the assertion unauthored rather than write one
nothing could execute. Ratified as a named residual (DECISIONS §3.1 row 8, WAVE-DIGEST §1).

**What is wrong.** A real acceptance criterion (the full-screen onboarding altitude behaviour) has
no runnable proof anywhere in CI or locally.

**Done when.** Either a docker-free path is built for this class of assertion, or a mock lane is
given ownership of the rail and the full-screen thread so the leg can run without the live-stack
runner.

**Evidence.** DECISIONS.md §3.1 row 8 (#649); WAVE-DIGEST.md §1 row 8, §3 ticket-specific row 31.

---

### Financial-year-end DAY is not represented in Knowledge

labels: needs-triage, ready-for-human

**Context.** The fy-end day lands only on `clara.clients` (via `set_client_fy_end`, per DECISIONS
D7); a `financial_year_end_day` key + map row through 0220 would close the gap. #654 owns
`knowledge_keys`, so this is naturally its lane.

**What is wrong.** A canonical client fact exists on the client row but not in the Knowledge system
that surfaces other client facts.

**Done when.** A `financial_year_end_day` knowledge key and map row exist and are populated
consistently with `clara.clients`.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 32 (#649).

---

### Client-creation entrances bypass the name-collision candidate check

labels: needs-triage, ready-for-agent

**Context.** Two related gaps found by #649: (1) ⌘K is a second client-creation entrance that never
runs the identity-candidate read `begin_client_onboarding`'s own flow uses, so it can create a
same-named client without ever seeing the ambiguity prompt; (2) the ≥2 identity-collision wall lives
only at the candidates READ, not at the birth door itself, so `begin_client_onboarding` still
succeeds at any arity if a caller skips the read. Both need either an arity-1 acknowledgement face
inside the palette, or a new birth verb that enforces the wall structurally.

**What is wrong.** The name-collision protection is advisory (a read a caller can skip) rather than
enforced at the one place that actually creates a client.

**Done when.** A single fix — most likely a new birth verb that itself enforces the ≥2 wall — closes
both the ⌘K bypass and the direct-API bypass at once.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 33–34 (#649).

---

### `InterviewRunCard` is still pre-`Field`

labels: needs-triage, ready-for-human

**Context.** Owner is #633; #649's AC6 re-composition stopped at its own surfaces and deliberately
did not touch `InterviewRunCard.tsx` per DECISIONS §1.7's ownership table.

**What is wrong.** One onboarding surface has not been migrated to the shared `Field` component
family the rest of the checklist/interview surfaces now use.

**Done when.** `InterviewRunCard` is recomposed onto `Field`/`FieldGroup` consistent with its
siblings.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 35 (#649); DECISIONS.md §1 rule 7.

---

### COA-before-cancelled-onboarding affected-row count is hosted work

labels: needs-triage, ready-for-human

**Context.** Must precede any repair migration for clients whose chart of accounts was seeded before
an onboarding that was later cancelled. #649's own local evidence cannot measure hosted row counts.

**What is wrong.** A potential repair migration cannot be scoped or sized without a hosted count that
has not yet been taken.

**Done when.** A hosted read establishes the affected-row count, informing whether a repair
migration is even needed.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 36 (#649).

---

### Scope the client-work-pack e2e mock by `p_client`

labels: needs-triage, ready-for-agent

**Context.** `home-board-mock.mjs` answers `get_client_work_pack` for every client id today
regardless of which client is asked for — a declared debt in #650's ownership census.

**What is wrong.** The mock cannot distinguish between clients, so a test asserting on one client's
pack cannot be sure it isn't reading another's fixture data by coincidence.

**Done when.** The mock keys its response on `p_client` and a cell proves two different clients get
different pack contents.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 37 (#650).

---

### `needs-you-counts.tsx` and `use-review-queue.ts` small polish (two items)

labels: needs-triage, ready-for-agent

**Context.** Two small #650-adjacent defects in the needs-you/review-queue surface: (1)
`needs-you-counts.tsx:7-10`'s comment says "EIGHT counts" while nine chips render, since
`work_questions` was added by migration 0180 and the comment was never updated; (2)
`lib/firm/use-review-queue.ts:166` drops the review-queue envelope's `watermark` field entirely,
though `lib/firm/needs-you.ts:242` still carries it.

**What is wrong.** A stale comment risks misleading a future reader, and a dropped envelope field is
either dead weight upstream or a missing surface downstream.

**Done when.** The comment is corrected, and a decision is made to either surface the watermark for
the review queue or delete it from `needs-you.ts` — whichever is correct is implemented.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 38, 40 (#650).

---

### Client Documents workbench still stays "running" until reload

labels: needs-triage, ready-for-human

**Context.** #650's own ticket named this as a pre-existing defect the new work-facet tiles must not
inherit (and they don't), but the workbench itself was out of scope and needs its own ticket.

**What is wrong.** The Documents workbench's own status indicator does not refresh live and requires
a manual reload to reflect completed processing.

**Done when.** The workbench's status indicator refreshes on the same cadence/triggers #650's new
facets use, without a manual reload.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 39 (#650).

---

### Give `clara.list_accounting_work` a receipt-dated window

labels: needs-triage, ready-for-human

**Context.** The client home can count what posted in a period but can only link to what *started*
in it; needs an optional `p_receipt_since`/`p_receipt_until` pair or a sibling door — a 0189 recut,
its own ticket per DECISIONS §1.3's no-shared-recut rule this wave.

**What is wrong.** A user viewing "what posted this period" cannot click through to a list actually
filtered by posting date, only by start date.

**Done when.** A new parameter pair or sibling door lets callers filter by receipt date, and the
client-home surface uses it where it currently approximates with start date.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 41 (#650).

---

### `clara._assert_journal_basis`'s `nonzero_total` arm is structurally unreachable

labels: needs-triage, ready-for-agent

**Context.** The per-line `exactly_one_side` arm always fires first, so no caller can ever drive the
debit total to zero (`0178:785-787`). Found independently from both the accrual (#652) and
prepayment (#653) sides while each wired refusal logic through this shared function.

**What is wrong.** Dead code in a shared invariant function makes the function's own stated
contract misleading — a reader might assume `nonzero_total` is reachable defence-in-depth when it
is not.

**Done when.** Either the arm ordering is fixed so `nonzero_total` is genuinely reachable, or it is
removed/commented as intentionally unreachable with the reason stated.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 42 (#652, #653).

---

### Three withdrawn accrual selection rules need a run-time reader

labels: needs-triage, ready-for-human

**Context.** `stated_period_amount`, `source_document_amount`, `prior_period_amount` need a
per-occurrence basis reader that `clara._plan_occurrence_basis` (owned by #653) doesn't provide
today. #652 shipped only the one honoured rule, `stated_amount`.

**What is wrong.** Three of four documented accrual selection methods have no implementation path.

**Done when.** `_plan_occurrence_basis` (or a sibling) provides the reader these three rules need,
and #652's method enum is no longer narrowed to one rule.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 43 (#652).

---

### Plan lane's own door still accepts a plan whose schedule reaches no due date

labels: needs-triage, ready-for-human

**Context.** #652 added its own entrance-level refusal (CLR10 `accrual_schedule_yields_no_occurrence`,
ratified DECISIONS §3.1) for a schedule whose day rule can never reach a due date inside its term.
The underlying `clara.create_accounting_plan` (owned by #653's recuts) does not share that refusal,
so a caller that bypasses #652's door can still create such a plan.

**What is wrong.** The same defect class (a schedule recorded but structurally unable to ever
perform) is guarded at one entrance and not at the shared door underneath it.

**Done when.** `create_accounting_plan` (or `_assert_plan_schedule`) shares the
`accrual_schedule_yields_no_occurrence` refusal so every caller, not just #652's door, is protected.

**Evidence.** DECISIONS.md §3.1 row 12 (#652); WAVE-DIGEST.md §3 ticket-specific row 44 (#652, #653).

---

### Scheduled-adjustment overlap detection is advisory-only and one-sided

labels: needs-triage, ready-for-human

**Context.** The legacy 0045 belt and 0140 §A2's extension can still overlap an accrual (#652) or a
prepayment (#653) with no refusal — only an advisory warning, and only checked from one direction.

**What is wrong.** Two schedules that genuinely conflict in period coverage can both be created with
only a warning, not a refusal, and the warning itself may not fire depending on creation order.

**Done when.** A product decision on whether overlap should ever be a hard refusal is made, and the
check (if kept advisory) is made two-sided.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 45 (#652, #653).

---

### Prepayment term lifecycle: typed terms, supersession notice, and a stale README line

labels: needs-triage, ready-for-human

**Context.** Three related gaps from #653's final report. (1) `prepayment_schedule_v1` only reads
the term from a `document_service_periods` row, so a memo-only recognition with no source document
can never be amortised; a typed term would need a second correction discipline, possibly adapted
from #646's document-correction pattern. (2) A read listing schedules whose
`document_service_periods` row is no longer live would make "a corrected term needs a new schedule"
visible instead of tribal knowledge. (3) `packages/runtime/README.md`'s "five standalone e2es"
sentence is stale (pre-existing drift, unrelated to #653's own new e2e file, found while #653
updated the README).

**What is wrong.** A legitimate prepayment with no supporting document has no path to amortisation;
a schedule can silently keep running against a superseded term with no surface telling anyone; and
a README sentence undercounts the standalone e2e files that actually exist.

**Done when.** (1) A product/architecture decision on the typed-term mechanism is made and a
schedule can be created from a human-stated term. (2) A read (or a flag on the existing schedule
detail read) surfaces when a schedule's term row is no longer live. (3) The README sentence is
corrected to the true current count.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific rows 46, 47 and 48 (#653).

---

### A positive prepayment-eligibility roster for the prepaid leg

labels: needs-triage, ready-for-human

**Context.** #653's fix-round wall is negative-only (closes receivable-control/bank/inactive/
role-reserved cases); it doesn't stop a plain unclassified asset account being amortised as a
prepayment. Needs a chart-level "this account holds prepayments" classification touching every lane
that reads the chart.

**What is wrong.** The system can be told to amortise an account that was never actually classified
as holding prepayments, simply because it isn't on the negative exclusion list.

**Done when.** A chart-level classification exists and the prepaid-leg wall checks it positively,
not just the negative exclusion list.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 49 (#653).

---

### Record the promoter's role at the instant of a firm-knowledge governed act

labels: needs-triage, ready-for-human

**Context.** `clara.firm_memberships` has no history and `clara.audit_log` has no role column, so
"who could do this then" is unanswerable after a role change. A membership-revision relation
(naturally #625's lane) or a role column on the audit row would close it. #654's own promotion
record emits the current role, labelled as current, not the role at the time of the act.

**What is wrong.** A governed act's authority cannot be reconstructed after the actor's role
changes, which matters for any later dispute or audit.

**Done when.** Either membership history or an audit role column exists, and #654's promotion record
can cite the role that actually authorised the act rather than the role read at query time.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 50 (#654); `654-final.md` follow-ups.

---

### `clara.knowledge_keys.scope_default` is now provably dead

labels: needs-triage, ready-for-agent

**Context.** Append-only table means rows can never be re-defaulted, so `scope_default` cannot do
anything after its initial write. Three repo-wide writes, zero reads, per #654's final report.

**What is wrong.** A column exists that cannot influence any behaviour, which risks a future reader
assuming it does.

**Done when.** A later migration drops or comments the column so it is not mistaken for a live wall.

**Evidence.** WAVE-DIGEST.md §3 ticket-specific row 51 (#654).

---

### `clara.approve_wrong_client_correction` takes a client row before the advisory rung

labels: needs-triage, ready-for-agent

**Context.** The #649 round-2 re-check measured that `clara.approve_wrong_client_correction` takes a
`clara.clients` row before taking the advisory rung, the opposite of the rung-first order the same
re-check ratified as correct for #649's own settle door (DECISIONS §3.1's final row: "rung → client
row → plan" sits above every neighbour per 0037 §K). The re-check names this explicitly as a
**pre-existing violation, not #649's to fix** — a follow-up.

**What is wrong.** One door in the same family takes locks in the opposite order from its siblings,
which is exactly the shape of bug that produces a rare, hard-to-reproduce deadlock under concurrent
corrections.

**Done when.** `approve_wrong_client_correction` is re-ordered to rung-first, matching #649's
settle-door convention, with a regression cell proving the new order under concurrency.

**Evidence.** DECISIONS.md §3.1 final row (#649 round 2); `reports/649-recheck-2.json`.

---

### #653's chat entrance stops at a grant wall — `create_prepayment_schedule` has no `clara_runtime` twin

labels: needs-triage, ready-for-agent

**Context.** The wave 2026-09-15 successor cut (`reports/successors-final.md` §3) did NOT cut
`start_prepayment_schedule_work` into `chatTurn_v20` nor `read_prepayment_source` into
`claraWork_v4`, and the reason is measured on the merged chain: `clara.create_prepayment_schedule`
is granted to `clara_authenticated` alone and is `_human_ctx`-fronted at the bookkeeper rank
(`0223:1674`, `:1044`); 0223 defines no `_for` twin; `get_prepayment_schedule` /
`list_prepayment_schedules` / `list_prepayment_attention` are `clara_authenticated`-only
(`0223:1675-1677`). The runtime pool runs as `clara_runtime`, so the tool cannot call the door.
Both stanzas stay written in `packages/runtime/lib/prepayment-schedule-basis.ts`, which stays outside
every frozen closure until its door exists. `docs/PRD.md:69` lists 预付款摊销 under the chat entrance
as current behaviour; it is not, until this lands.

**What is wanted.** A migration that adds an actor-explicit OBO twin
`clara.create_prepayment_schedule_for(...)` on the `admit_periodic_adjustment_work` /
`capture_knowledge_for` shape (live-authority recheck of the initiator, `clara_runtime` grant,
same `_reserve_op` key space as the human door so a chat configuration and a human replay converge),
plus `clara_runtime` grants on the three reads (or runtime-only `_for` reads). Then the next chat
successor (`chatTurn_v21`) imports the carrier module and registers the tool; `claraWork_v5`
adds `read_prepayment_source`.

**Done when.** The twin door and grants are live on a from-scratch chain with a cell proving a
`clara_runtime` session configures a schedule OBO a bookkeeper and is refused OBO a viewer; the
tool ships in the next successor with a real-World e2e leg; the module joins the frozen closure.

**Evidence.** `reports/successors-final.md` §3; `reports/653-final.md` "Successor contracts";
DECISIONS.md §3.3 item 5.

---

**Total: 55 issues** (10 cross-cutting + 45 ticket-specific), against 61 rows in WAVE-DIGEST §3
(10 cross-cutting + 51 ticket-specific) plus one follow-up from DECISIONS §3.1 that the digest did
not carry as its own row. The count moves from 61+1=62 candidate rows to 54 through six merges of
duplicate/related rows, each declared inside the merged issue's own Evidence line: the fixed-asset
CLR40 pair (#639, 2→1), the `merge_counterparties` pair (#647, 2→1), the 0218 firm-setup polish trio
(#648, 3→1), the client-creation name-collision pair (#649, 2→1), the prepayment term-lifecycle trio
(#653, 3→1), and the needs-you/review-queue pair (#650, 2→1) — the last of these bundles two small,
independently-fixable polish items under one title as an editorial judgment call, not because they
are the same underlying defect; split it back into two issues if that reads as overreach. One issue
(`approve_wrong_client_correction`'s lock order) is new, sourced from DECISIONS §3.1's final row
rather than from WAVE-DIGEST §3. No cross-cutting row was merged. This lands inside the "roughly
40-55" target; no further merging was attempted, since combining any of the remaining rows would
start joining genuinely unrelated fixes under one title, making the issue harder for an agent or
human to pick up and close.
