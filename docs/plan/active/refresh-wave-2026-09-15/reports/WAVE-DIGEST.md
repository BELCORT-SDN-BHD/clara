# Wave 2026-09-15 — digest for the orchestrator

Compiled from all twelve `*-final.md` reports and all fifteen `*-fixround-*.md` reports under
`docs/plan/active/refresh-wave-2026-09-15/reports/`, cross-checked against `DECISIONS.md` §0–§2.
Read-only compilation; no ruling is made here. "Unstated" means the source is silent, not that the
answer is no.

---

## 1 · Ratification items

Every place a worker declined, narrowed, or flagged a brief/DECISIONS-adjacent judgment call for the
orchestrator to rule on. Not decided here.

| Ticket | Item | What was shipped | What the brief/DECISIONS said | Worker's reason | Source |
|---|---|---|---|---|---|
| #625 | Declare the three member reads in `SHARED_RPC_VERBS` | Shipped an equivalent gate, `CORE_RELATION_HANDOVERS`, in `e2e-fixture-ownership.test.ts` instead | `brief-625.md:66` instructs declaring the three reads in `SHARED_RPC_VERBS` | That census only matches `/rest/v1/rpc/…` verbs and requires ≥2 claimants; the literal instruction is mechanically impossible. All three review lenses independently confirmed this | 625-final.md (Assumptions 0–1); 625-fixround-1.md finding F5 |
| #625 | Issuer-rank blind spot: an invite from a since-demoted/removed issuer still previews/lists as `pending` | Reviewer's stated minimum only — deleted the false claim, named the residual in three places, pinned the divergence with `p625.preview.issuer_rank` | Reviewer's fuller fix (option a) would add a fifth invite effective-status | DECISIONS §2 #625 and `brief-625.md` §Faces fix the outcome set at four ("invent no collapsing scheme"); a fifth status would put the preview and admin roster in disagreement | 625-fixround-1.md finding F1, "what I deliberately left" #1 |
| #639 | Should `complete_fixed_asset_particulars_for` fold `client_not_found`/`obo_not_active` into one code? | Kept the two-way distinction; only the false comment claiming otherwise was corrected | Reviewer (ADV 639-A4) suggested the stricter single-code reading | Door is `clara_runtime`-only with an explicit `p_obo`; 0195's ladder deliberately separates the failure classes; the browser-reachable door already answers CLR11 for both | 639-fixround-1.md ADV 639-A4, "what I deliberately left" #1 |
| #639 | Two shared-file edits beyond one-line registrations: `serve-built.mjs` gained a `viewer@` rank-0 persona branch (10 lines); `apps/web/test/domInspect.ts` gained `document.getElementById` | Shipped as-is | Wave rule 6 limits shared-file edits to one-line registrations | Needed to drive AC9's denied leg by role at all; twelve lanes edit `serve-built.mjs` this wave, so the orchestrator may prefer to carry this hunk itself at integration | 639-fixround-1.md "Ratification requested" |
| #646 | Should the "Accounting impact pending" Alert render only when a live `entry_evidence_links` claim exists? | Not applied — kept as two unconditional persistent rows | `brief-646.md:64` specifies "two persistent rows" shown separately; AC4's own wording says show both "separately" | Making one conditional changes what the brief specifies rather than refining it | 646-final.md Follow-ups #7; 646-fixround-1.md "Deliberately left" #1 |
| #647 | Revision relation's counterparty key: FK or lock-free writer check? | Shipped without the FK (`fk_cir_counterparty` dropped); tenant congruence enforced by a lock-free assertion inside the sole ungranted writer | An FK was the more obvious original shape | An FK's `FOR KEY SHARE` re-opens a measured deadlock between two shipped human doors (`rename_counterparty` vs. alias writers) | 647-final.md Assumption 5; 647-fixround-1.md "what I deliberately left" #3 |
| #647 | Four of five `knowledge-shared.tsx` exports the brief said to "call verbatim" (`knowledgeValueText`, `appliesWhenText`, `KnowledgeKindBadge`, `KnowledgeTrustBadge`) | Only `KnowledgeSourceBlock` is called; the other four are not | Brief said to call all five verbatim | Those vocabularies (kind, trust) don't exist in the identity domain — an alias has no "trust" concept in 0200; calling them would mis-render or invent data | 647-final.md Assumption 4 (SPEC-3 finding) |
| #649 | UI-21 full-screen onboarding altitude leg | Not authored, not re-measured; left as a named residual | Reviewer's option (b) asked for the arm to be added unexecuted, per the file's own convention | `interview-walk.spec.ts` has no fixture state an unauthored arm could rely on; needs a runner change (a fourth fixture), not just test code | 649-fixround-1.md finding F1, "what I deliberately left" #1 |
| #649 | 0204's `name_family_collision` detail: candidate rows or bare ids? | Shipped full candidate rows | Brief said "candidate ids in `detail`" | Ids alone leave the refused face printing uuids or forcing a second read of the fact it's reporting | 649-final.md Assumption 1; 649-fixround-1.md finding F3, "what I deliberately left" #2 |
| #650 | Should the `active` work-pack facet widen to include `stopping` Work? | Not applied; named residual only | `brief-650` line 8 and DECISIONS §2 #650 define active as "runnable/executing children" (queued/running only) | Matches the brief verbatim; widening it is a brief change | 650-final.md row "`stopping` Work carries no tile"; 650-fixround-1.md finding 650-N2 |
| #652 | Accrual authority window bracketed by the stated term (`effective_to` required; no open-ended authority) | Applied as a new refusal — a narrowing | Brief did not spell out this narrowing | The alternative is a ledger line that is false on every occurrence but one; "a schedule that outruns its stated term" has no honest reading | 652-fixround-1.md Assumption 7/A1, "ratification requested" |
| #652 | A schedule that reaches no accrual date inside its own window | Applied as a new refusal, CLR10 `accrual_schedule_yields_no_occurrence` — a further narrowing | Brief did not spell this out either | Same class as A2 (recorded-but-never-performed defect); blocks no reachable use case (measured) | 652-fixround-2.md finding NB1, "RATIFICATION REQUESTED" |
| #654 | Firm-scope evidence census (§0(8)/§E T.4): count only LIVE violating rows, report historical (superseded/withdrawn) ones via NOTICE only | Applied — changed from a strict all-history count to live-only + notice | No finding asked for this; it followed from adding the retraction hatch | Once a rule is withdrawn, filing its document is the correct remedy the refusal already points at; historical count still printed, nothing hidden | 654-fixround-1.md "One change I made that no finding asked for"; 654-fixround-2.md finding 654-RATIFY-1 ("No action needed from the fix worker") |

---

## 2 · Blueprint drift

Every sentence a report says contradicts `docs/PRD.md` or `docs/ARCHITECTURE.md`, with the report's own
pointer and the measured true state. (Several tickets label unrelated brief/gap-map discrepancies
"blueprint drift" too — those are folded into §5 instead, since they don't cite PRD/ARCHITECTURE.)

| Ticket | Blueprint pointer | What the blueprint claims | What is actually true | Source |
|---|---|---|---|---|
| #638 | `docs/PRD.md:114` | (implicitly) high-stakes gating is amount-based | `clara.is_high_stakes` is not amount-only (`0004:72-78`: opening balance, year end, tax-affecting too). The Work lane never calls it, so PRD:114 holds there — but `book_staff_advance_application`'s drafted branch (`0043:2666`) still carries the older forced checker | 638-final.md:114-116 |
| #639 | `docs/ARCHITECTURE.md` §3.5 / PRD "F3" | Fixed-asset materialisation is intrinsic because the hook runs at every approve path | False as written, and has been false since migration 0178; true again only because 0201 (this ticket) adds a second, lane-agnostic birth instrument. Two in-tree sentences (`0041:4528-4529`, `x41-wave-d-a-fa.test.mjs:186`) still assert the old claim — corrected by a new test (`p639.census.approve_paths`) rather than by editing the merged migration. Orchestrator decides the blueprint wording | 639-final.md:67 |
| #649 | `docs/ARCHITECTURE.md:171` | Workflow version pins are `chatTurn → chatTurn_v19`, `claraWork → claraWork_v3` only | Omits `clientOnboarding → clientOnboarding_v4` (current today), and will go stale the moment this wave's `clientOnboarding_v5` lands | 649-final.md:57 |
| #653 | `docs/PRD.md:69` | Accepts "an existing authorisation rule" (已有的授权规则) as plan authority | `accounting_plans.authority_kind`'s CHECK admits exactly one member, `explicit_instruction` (`0193:418`), and `create_accounting_plan` refuses `authority_rule` by name (`0193:1474-1480`). 0208 does not touch that CHECK | 653-final.md:142-144 |
| #653 | `docs/PRD.md:69` | Lists prepayment amortisation under "chat, document, or direct Accounting handling" as current behaviour | The chat half is only a `chatTurn_v20` successor contract in this delivery, not a shipped capability | 653-final.md:145-146 |
| #654 | `docs/PRD.md:123` | Defers automatic re-evaluation of affected Work to #658/#663, with human review as the accepted interim | Not built this wave; only the human-review affordance ships (which clients hold exceptions, which live Work cites the key) | 654-final.md:52 |
| #654 | `docs/PRD.md:122` | Says #654's remainder is "interface or chat entrance" (界面或对话入口) | The interface half (`/settings/knowledge`) is delivered; the chat-capture half is a `claraWork_v4` successor contract only, not shipped | 654-final.md:52 |

All other tickets (#625, #633, #646, #647, #648, #650, #652) explicitly report "no blueprint drift found" / "none" / "not blueprint" in their final reports.

---

## 3 · Follow-ups worth filing as GitHub issues

Union across all reports, deduplicated — the same issue named by several tickets is one row listing every
source. Excludes items that already point at an existing tracked ticket (#676, #658/#663, #636, #640,
#707/#693, etc.) rather than proposing new work. `needs-triage` on every row.

**Cross-cutting / shared infrastructure**

| Title | Body | Sources | Suggested labels |
|---|---|---|---|
| Activity-kind ladder misfiles events under "documents" | `list_activity`/`get_activity_event`'s kind ladder files membership, invite, asset-acquisition, counterparty-identity and client-home facet events under the `documents` rung instead of their own kind. DECISIONS D13 already rules this out of scope for the wave and commits the orchestrator to opening its own issue; six tickets independently hit and named it. | #625, #633, #639, #646, #647, #650 (DECISIONS D13) | needs-triage, ready-for-human |
| Lane mocks build a private request-body reader instead of the shared cached one | Several `*-mock.mjs` files read a POST body with their own local reader before checking whether the verb is theirs; once a second lane legitimately shares that verb, the first lane's reader has already drained the stream and the second lane gets nothing. Found and fixed three times independently. A cheap census cell could assert no `*-mock.mjs` defines its own body reader. | #633, #647, #653 | needs-triage, ready-for-agent |
| `e2e-fixture-ownership.test.ts`'s verb-ownership census is blind to non-standard verb-dispatch spellings | The census (`RPC_VERB_OPENER`/N5) reads a fixed set of dispatch shapes; a mock that spells its switch variable differently (e.g. not `verb`) is invisible to it, so real undeclared shared claims pass silently. | #646 | needs-triage, ready-for-agent |
| Playwright walks flake under twelve-lane host contention | Sign-in navigation and whole-file runs intermittently exceed default 30s budgets purely from host load (up to ~100 concurrent node processes across sibling lanes), producing reds with no code cause. Proposed: a `cellBudgetMs`-style parameterised budget for `signInTo`, a serialising lock, or a documented "one browser lane at a time" rule in RIG.md. | #633, #638, #650, #653 | needs-triage, ready-for-human |
| `npx playwright test` serves a stale build instead of building from HEAD | `playwright.config.ts`'s `webServer` just runs `next start` against whatever `.next/` already contains; only `pnpm --filter @clara/web e2e -- <spec>` (`node e2e/run.mjs`) builds first. Two round-1 reviewers and the worker's own first attempt were all silently testing an 19-minute-stale build. Needs a guard or a prominent doc callout. | #648 | needs-triage, ready-for-agent |
| `rig-isolation.test.mjs`'s T10b cell reads red after the Workflow/WDK world is bootstrapped on the same database | `graphile_worker`'s functions become PUBLIC-executable once the world schema exists, so `clara_agent_ro`/wake roles "reach outside" and T10b fails — rig state, not a migration defect, but no lane can currently tell the two apart automatically. CI keeps world and rig databases separate; a local rig cannot. | #633, #652, #653 | needs-triage, ready-for-agent |
| `0154_binding_proposal_pr_1`'s role census is a cluster-global literal (`= 14`) | Postgres roles survive `drop database`, so a from-scratch re-apply into a fresh database on a cluster that already ran the chain reds ("the clara role count moved from 14 to 18"). Hit independently three times, once costing a full chain restart. Scope the census to roles minted by that frontier, or document in RIG.md that a re-apply needs a fresh cluster (or the four post-0154 roles dropped first). | #646, #653, #654 | needs-triage, ready-for-agent |
| `_subledger_on_approve` caller-census pin is stale everywhere it's copied | Multiple migrations assert the historical caller count of four when the measured live count is six (`finalize_close`, `reopen_fiscal_year` added by 0056). One migration should re-derive and re-state the pin once so later migrations stop copying stale text. | #638, #639 | needs-triage, ready-for-agent |
| `next build` intermittently panics (`0xc0000142`, PostCSS loader) under heavy host contention | Windows process-creation failure under memory pressure with twelve lanes live; a retry clears it. Worth a documented workaround or CI capacity note. | #646 | needs-triage, ready-for-human |
| `plans-mock.mjs`'s shared-verb hazard crossed into an already-merged sibling lane (#640) | #653 sharing `pause_accounting_plan` without body-caching broke #640's own mock; both were repointed to the shared `readCachedJson`. Left as a note for the wave's integration pass since it touches a file outside #653's declared scope. | #653 | needs-triage, ready-for-agent |

**Ticket-specific**

| Title | Body | Sources | Suggested labels |
|---|---|---|---|
| Signed-out invite preview has no route | `preview_invite` is `clara_authenticated`-only and the estate declares no `anon` role, so showing invite content before sign-in needs a server route holding a service key. | #625 | needs-triage, ready-for-human |
| Give invite preview/roster a fifth effective status for a since-demoted/removed issuer | See ratification item above; filing this as the actual follow-up ticket once ratified. | #625 | needs-triage, ready-for-human |
| Stale client-register fixture count | `firm-navigation-walk.spec.ts:370` asserts 4 rows against a shared fixture array that now holds 7; pre-existing, unowned by #625's diff. | #625 | needs-triage, ready-for-agent |
| A mail-transport base-URL seam for invite walks | Would let a walk prove invite→pending-row without making a real outbound courier call. | #625 | needs-triage, ready-for-agent |
| Poll-bound test-budget cells can assert a vacuous bound | `useSettlePoll` waits 1.5s before its first tick while the harness's `settle()` is a 0ms hop, so a "stays inside its tick ceiling" cell can pass while asserting zero ticks ran. Likely not unique to this file; worth a repo census. | #633 | needs-triage, ready-for-agent |
| `document_filings` has no list-form read for a set of documents | Today costs one filings read per client plus one `documents?id=in.(…)`; a single door would beat both at scale. | #633 | needs-triage, ready-for-agent |
| Need a Tier-A-complete autodraft fixture | Today's fixture only proves `admit_autodraft_task` is reached and skipped (`tier_a_fails`, `direction_unresolved`, `vendor_unresolved`, `no_consent`); proving an admitted coding task needs counterparty resolution, a resolved direction and coding consent — the autodraft lane's own fixture. | #633 | needs-triage, ready-for-human |
| `document-admin.tsx`'s classify Select still offers `consent_evidence`, a kind the door always refuses | Out of #633's scope (owned by #624/#646's detail surface). | #633 | needs-triage, ready-for-agent |
| No Playwright coverage for the `?tab=staffAdvances` view | Deliberately split out of #638's brief; zero browser coverage exists today. | #638 | needs-triage, ready-for-agent |
| Label a staff-expense claim on the Work LIST, not only the detail | `clara.list_accounting_work` prints "Journal entry" for a claim today; needs a `claim_id`/`claimant_label` projection or a batched origin read. | #638 | needs-triage, ready-for-agent |
| Multi-advance allocation inside one staff-expense claim | Today: one advance per claim, no silent FIFO — a deliberate scope cut. | #638 | needs-triage, ready-for-human |
| `fa_cost_adjustment_deferred` should classify as a refusal, not an invariant | CLR40 is outside `claraWork.v1.errors.ts`'s CLR default list, so it always settles Work `failed`/`internal`/non-recoverable even though the belt gives a human remedy ("reverse and re-book at the corrected cost"). Fix is one row in the shared `claraWork_v4` errors file. | #639 | needs-triage, ready-for-agent |
| Belt and fixed-asset birth trigger disagree about a retired enrolment | Belt evaluates at `approved_at`; the birth trigger joins only `fp.active`. An entry approved in the same transaction that retires a profile is refused CLR40 by the birth side only. Pre-existing, needs a decision on which side moves. | #639 | needs-triage, ready-for-human |
| A firm/class-level default depreciation policy | Would make the "particulars absent" branch rarer; none exists today (#654 owns firm defaults). | #639 | needs-triage, ready-for-human |
| No opening-seed fixture for the fixed-asset K-family "scheduled_run" exclusion arm | Remains belt-only evidence (0041 arm 1's CLR38 guard); building one is a lane of its own. | #639 | needs-triage, ready-for-agent |
| A document correction leaves affected Work questions answerable at their stale version | `answer_work_question` compares only `question_version`+`basis_digest`, never `knowledge_version`; needs a runtime re-ask once #654's `observedRevisions({knowledge_version})` lands. | #646 | needs-triage, ready-for-human |
| C88.16 has no identified resolution | No matching commit, migration, or report anchor found; two clue-only candidates exist (`0191:1197`, ARCHITECTURE §7). Needs discovery work. | #646 | needs-triage, ready-for-human |
| Give the vendor-binding ambiguity (C08.3) a resolution face against current identity | Today only resolvable via the firm-admin `/settings/vendor-bindings` ceremony, which is not where the ambiguity is seen; a client-scoped face over `get_counterparty_identity`'s conflicts would close the loop. | #647 | needs-triage, ready-for-human |
| Consume the four counterparty-identity domain events | `counterparty.renamed`/`.alias_added`/`.alias_retired`/`.identifiers_set` are routed `context_update` with no consumer today. | #647 | needs-triage, ready-for-human |
| Repoint the two declared-residue alias writers | `merge_counterparties` and `tick_seeding_proposal` still insert aliases directly and land `recorded_via='legacy_unknown'`. | #647 | needs-triage, ready-for-agent |
| Document `clara.merge_counterparties`'s lock order for future writers | A 0149 splice this wave could not recut; a future writer taking the counterparty-then-alias order would reopen a deadlock class. | #647 | needs-triage, ready-for-agent |
| A cell for the three counterparty-door dialogs' shared draft rule | "Survive a refusal, discard on success, re-seed only where fields are current values" — only the identifier dialog's half is celled today. | #647 | needs-triage, ready-for-agent |
| Firm setup applicability predicates | `mpers_eligibility` (Sdn Bhd only) and `tin` (turnover-gated) are asked unconditionally because `clara.firm_setup_keys` has no predicate column. | #648 | needs-triage, ready-for-agent |
| Optional education content for firm setup (A5) | Mechanism exists (`item_kind='education'`), zero rows seeded; needs owner-authored content, not code. | #648 | needs-triage, ready-for-human |
| Firm registration identity has no canonical home | Decide, once #647/#654 settle the identity boundary, whether legal name/SSM/TIN/address/MIA become knowledge keys or columns on `clara.firms`. | #648 | needs-triage, ready-for-human |
| Harden `uq_onboarding_plans_one_open_firm`'s predicate | Currently `state='open'`; a structural `(firm_id) where scope_kind='firm'` predicate would make a related single-row read structural rather than by argument. | #648 | needs-triage, ready-for-agent |
| No-op firm-setup reconciliation still rotates the CAS token | Unreachable today (control only renders pre-seed and now carries a per-attempt op key) but should skip the bump when nothing changed. | #648 | needs-triage, ready-for-agent |
| `get_firm_setup` paints progress for a plan that doesn't exist | Harmless today (both consumers null-check `plan_id` first). | #648 | needs-triage, ready-for-agent |
| A withdrawn firm default stays in `confirmed_facts` | The fact projection filters only on `superseded_at is null`; SQL-side intent statement still owed (web side already closed). | #648 | needs-triage, ready-for-agent |
| `StateBanner` silently drops `data-testid` | Its prop list is closed and TypeScript skips excess-property checks on hyphenated JSX attributes; `work-question-form.tsx` passes four that never render. | #648 | needs-triage, ready-for-agent |
| UI-21's altitude leg has no runnable home on an implementation rig | `interview-walk.spec.ts` only runs under the docker-based live-stack runner; give it a docker-free path or move the assertions into a mock lane. | #649 | needs-triage, ready-for-human |
| Financial-year-end DAY is not represented in Knowledge | Lands only on `clara.clients`; a `financial_year_end_day` key + map row through 0205 would close it (#654 owns `knowledge_keys`). | #649 | needs-triage, ready-for-human |
| ⌘K is a second client-creation entrance that never runs the identity-candidate read | Closing it needs either an arity-1 acknowledgement face inside the palette or a new birth verb. | #649 | needs-triage, ready-for-human |
| The ≥2 identity-collision wall lives only at the candidates READ, not the birth door | `begin_client_onboarding` still succeeds at any arity; closing it needs a new birth verb. | #649 | needs-triage, ready-for-agent |
| `InterviewRunCard` is still pre-`Field` | Owner is #633; #649's AC6 re-composition stopped at its own surfaces. | #649 | needs-triage, ready-for-human |
| COA-before-cancelled-onboarding affected-row count is hosted work | Must precede any repair migration. | #649 | needs-triage, ready-for-human |
| Scope the client-work-pack e2e mock by `p_client` | `home-board-mock.mjs` answers `get_client_work_pack` for every client id today (declared debt in the ownership census). | #650 | needs-triage, ready-for-agent |
| `needs-you-counts.tsx:7-10`'s comment is stale | Says "EIGHT counts" while nine chips render (since `work_questions` was added by 0180). | #650 | needs-triage, ready-for-agent |
| Client Documents workbench still stays "running" until reload | #650's own ticket named this as a defect the new tiles must not inherit (and they don't); the workbench itself needs its own ticket. | #650 | needs-triage, ready-for-human |
| `lib/firm/use-review-queue.ts:166` drops the review-queue envelope's `watermark` | Either surface it for the queue or delete it from `lib/firm/needs-you.ts:242`. | #650 | needs-triage, ready-for-agent |
| Give `clara.list_accounting_work` a receipt-dated window | The client home can count what posted in a period but can only link to what *started* in it; needs an optional `p_receipt_since`/`p_receipt_until` pair or a sibling door — a 0189 recut, its own ticket. | #650 | needs-triage, ready-for-human |
| `clara._assert_journal_basis`'s `nonzero_total` arm is structurally unreachable | The per-line `exactly_one_side` arm always fires first, so no caller can ever drive the debit total to zero (`0178:785-787`). Found independently from both the accrual and prepayment sides. | #652, #653 | needs-triage, ready-for-agent |
| Three withdrawn accrual selection rules need a run-time reader | `stated_period_amount`, `source_document_amount`, `prior_period_amount` need a per-occurrence basis reader that `clara._plan_occurrence_basis` (owned by #653) doesn't provide today. | #652 | needs-triage, ready-for-human |
| Plan lane's own door still accepts a plan whose schedule reaches no due date | #652 added a yield-refusal at its own entrance; the underlying `clara.create_accounting_plan` (owned by #653) doesn't share it. | #652, #653 | needs-triage, ready-for-human |
| Scheduled-adjustment overlap detection is advisory-only and one-sided | The legacy 0045 belt and 0140 §A2's extension can still overlap an accrual or a prepayment with no refusal. | #652, #653 | needs-triage, ready-for-human |
| A human-stated typed term for a prepayment with no source document | `prepayment_schedule_v1` only reads the term from `document_service_periods` today, so a memo-only recognition can never be amortised; a typed term would need a second correction discipline (possibly #646's). | #653 | needs-triage, ready-for-human |
| Nothing tells a live prepayment schedule its term row was superseded | A read listing schedules whose `document_service_periods` row is no longer live would make "a corrected term needs a new schedule" visible instead of tribal knowledge. | #653 | needs-triage, ready-for-agent |
| `packages/runtime/README.md`'s "five standalone e2es" sentence is stale | Pre-existing drift, unrelated to this ticket's own new file (already documented at its own line). | #653 | needs-triage, ready-for-agent |
| A positive prepayment-eligibility roster for the prepaid leg | The fix-round wall is negative-only (closes receivable-control/bank/inactive/role-reserved cases); doesn't stop a plain unclassified asset being amortised. Needs a chart-level "this account holds prepayments" classification touching every lane that reads the chart. | #653 | needs-triage, ready-for-human |
| Record the promoter's role at the instant of a firm-knowledge governed act | `clara.firm_memberships` has no history and `clara.audit_log` has no role column, so "who could do this then" is unanswerable after a role change; a membership-revision relation (naturally #625's lane) or a role column on the audit row would close it. | #654 | needs-triage, ready-for-human |
| `clara.knowledge_keys.scope_default` is now provably dead | Append-only table means rows can never be re-defaulted; three repo-wide writes, zero reads. A later migration should drop or comment it. | #654 | needs-triage, ready-for-agent |

---

## 4 · Successor contracts

Index only — the cut worker reads the exact stanzas in each module's footer / the named report section.

| Ticket | Successor body | Tool / step name | Report & section | Grant / migration dependency |
|---|---|---|---|---|
| #638 | `chatTurn_v20` | `start_staff_expense_claim_work` | 638-final.md § "Successor contract — `start_staff_expense_claim_work` (for `chatTurn_v20`)" | No migration needed; the door already exists and is granted. Purpose stays `journal_entry` — no `WORK_ACCEPTED_PURPOSES` widening |
| #639 | `claraWork_v4` | `apply_fixed_asset_particulars` | 639-final.md § "Successor contract — `claraWork_v4`" | `clara_runtime`-only grant already in place (`0180:686`); no migration needed at the cut |
| #646 | none shipped (explicit negative) | — | 646-final.md § "Successor contract — NEGATIVE" | Depends on #654's `claraWork_v4` `observedRevisions({knowledge_version})` landing before any future consumer can use #646's `list_source_dependents` read |
| #647 | `chatTurn` tool — **not named in DECISIONS §1.1's chatTurn_v20 cut list** (see §5) | `record_counterparty_alias` | 647-final.md § "Successor contract — `record_counterparty_alias` (nothing ships in this image)" | Requires a NEW OBO door `clara.add_counterparty_alias_for` (the `capture_knowledge_for` shape) to ship FIRST — not yet migrated |
| #649 | `clientOnboarding_v5` | Workflow-level changes: `sst_no` `appliesTo` gating (H-52), new `fye_day` segment, known-facts pre-read step | 649-final.md § "Successor contract — `clientOnboarding_v5`" | Registry repoint only (`registry.ts:264`, `:908`); no door call, no migration; keep v1–v4 exported (stranded-body gate) |
| #652 | `chatTurn_v20` | `start_accrual_work` | 652-final.md § "Successor contract — `chatTurn_vN`'s `start_accrual_work`" | No migration; no `WORK_ACCEPTED_PURPOSES` widening (purpose stays `journal_entry` via `_plan_admit_occurrence`) |
| #652 | `claraWork_v4` — **not named in DECISIONS §1.1's claraWork_v4 list** (see §5) | `answer_accrual_term` (the term park, NOT built) | 652-final.md § "Successor contract — the claraWork park (NOT built)" | Uses existing `clara.open_work_question`/`answer_work_question` doors (0180), already granted to `clara_runtime`; no migration needed |
| #653 | `chatTurn_v20` | `start_prepayment_schedule_work` | 653-final.md § "1 · `chatTurn_v20` — `start_prepayment_schedule_work`" | No migration; no `WORK_ACCEPTED_PURPOSES` widening |
| #653 | `claraWork_v4` | the TERM PARK (roster addition `read_prepayment_source`) | 653-final.md § "2 · `claraWork_v4` — the TERM PARK (AC5 / C55.13)" | Needs the `claraWork_v4` tool roster to add `read_prepayment_source` (read-only) and change the frozen prompt's "no source document" sentence; the answer applies through the human door `clara.record_document_service_period`, not the run itself |
| #654 | `claraWork_v4` (part a generically named in DECISIONS; part b — **`ask_knowledge_conflict` not named**, see §5) | (a) knowledge-context step feeding `observedRevisions({knowledge_version})`; (b) tool `ask_knowledge_conflict` | 654-final.md § "Successor contract — `claraWork_v4` (written, NOT cut)" | (a) feeds the EXISTING trace call at `claraWork.v3.impl.ts:465-474`, no new grant. (b) uses `open_work_question`'s existing `clara_runtime` + hook-token grant (`0180:578-686`); expiry must re-open rather than resolve (0198 removed the `work_id is not null` predicate from `expire_due_interruptions`) |

Tickets #625, #633, #648, #650 explicitly ship **no** successor contract (none owed).

---

## 5 · Integration hazards named by the reports

| Hazard | Tickets | What to do at integration |
|---|---|---|
| `_subledger_on_approve` six-name caller census pinned independently in 0201 (#639) and 0206 (#638) | #638, #639 | Apply the merged 0001→0209 chain from scratch once before release. If 0206's byte-exact prestate check refuses (because a sibling migration merely names the hook inside some function body), re-measure and re-issue the roster string — never weaken the assertion. #638's own follow-up 0 spells out the exact recipe |
| Full-chain re-apply needs a cluster that has never run a clara migration | #646, #653, #654 (independently) | 0154's role census (`= 14`) is cluster-global and literal; use a genuinely fresh cluster, or drop the four post-0154 roles (`clara_stripe_webhook{,_login}`, `clara_auth_wall{,_login}`) first |
| `SHARED_RPC_VERBS` / `e2e-fixture-ownership.test.ts` census edits from nearly every lane | #625, #633, #646, #647, #649, #653 (and by DECISIONS rule 6, all twelve) | Expect merge conflicts on this file's declaration map. Re-run the census after merge — it has at least one known blind spot (non-standard verb-dispatch variable names, found by #646) and one confirmed wrong-instruction case (#649 proved `client_identity_candidates` must NOT be declared shared, contra a reviewer's ask) |
| `serve-built.mjs` (shared mock hub) edits beyond one-line registrations | #639 (`viewer@` rank-0 persona branch), #648 (default `get_firm_setup` response), #625 (a comment accidentally registered as a false census hit) | Re-verify `e2e-fixture-ownership.test.ts` and the full persona/handler set after merge; twelve lanes touch this file |
| `plans-mock.mjs` (owned by already-merged #640) broken by a new shared-verb claimant | #653 | Confirm both mocks still use the shared `readCachedJson` after merge; re-run `plans-walk` |
| `package.json`'s preintegration-gate import chain is ordered by migration number, not alphabetically | #625 (states the rule explicitly) | Confirm all twelve gates land in migration order after merge, not in branch-merge order |
| `.github/actions/db-live-gates/action.yml` gains a step from about half the tickets | #633, #638, #639, #649, #652, #653 | Verify step presence and YAML formatting (per-line `\` continuation — broken once by #653's own CI edit and repaired in its fix round) survive the merge |
| `tree.ts`/`routes.ts` `CLIENT_LEAVES` and ⌘K keyword rows — many lanes add nav rows | #650, #652, #653 (accruals, prepayments, assets, identity, knowledge, setup all add rows this wave) | #652 added a `resolveActive`-walking wall cell in `tree.test.ts` specifically to catch dead leaves (and used it to remove two of its own); re-run that wall after the full merge to catch any other lane's dead leaf |
| `rig-meta.mjs` cohort rows and `kp.01`'s ten-entry catalog `deepEqual` | all twelve (cohort rows); #648, #654 (kp.01 deliberately kept stable) | Confirm cohort rows for all twelve migrations are present after merge; confirm `kp.01`'s count is still exactly ten (#648 and #654 both deliberately minted no new knowledge keys to protect it) |
| Successor-contract stanzas not named in DECISIONS §1.1's own cut lists | #647 (`record_counterparty_alias`, chatTurn), #652 (`answer_accrual_term` term park, claraWork_v4), #654 (`ask_knowledge_conflict`, claraWork_v4) | DECISIONS §1.1 only names #638/#652/#653 for the chatTurn_v20 cut and "#639 particulars question; #653 term park" for claraWork_v4's ticket-specific parts. The cut worker should read each ticket's own report, not just DECISIONS' summary line, or these three stanzas will be missed |
| Host-contention flakes to expect once lanes run together | effectively all twelve | Sign-in/navigation timeouts in nearly every Playwright walk, plus known-flake unit files (`thread-live-clarify.test.tsx`, `use-clara-thread-stop.test.ts` cell 630, `onboarding-checklist.test.tsx`, `work-detail.test.tsx` "641 switching a tab…") are reproduced as flakes independent of the branch's own code by nearly every report. Don't treat a red in these specific files as a merge regression without an isolated re-run |
| Rigs/clusters left running for wave close | see table below | Drop or re-apply before use, per column |

**Rig/cluster cleanup census**

| Cluster / port | Ticket | State | Action needed |
|---|---|---|---|
| `rig625r` / 55601 | #625 | Already dropped by the worker itself | None |
| `rig633r` / 55602 | #633 | Up, untouched (no SQL changed) | Orchestrator's call to drop |
| `rig638r` / 55603 / `clara_638r` | #638 | Up, carries the edited 0206 | Orchestrator may reap |
| `rig639r` / 55604 | #639 | Up, untouched (worker rebuilt its own rig twice instead) | Orchestrator's call |
| `rig646r` / 55605 | #646 | Up, untouched | Orchestrator's call |
| `rig647r` / 55606 and `rig647z` / 55706 | #647 | Both up | Explicit ask: drop both at wave close |
| `rig648r` / 55607 / `clara_648r` | #648 | Up deliberately (kept for the wave) | Keep until wave close, then drop |
| `rig649r` / 55608 | #649 | Up | Orchestrator's call at close |
| `rig650r` / 55609 / `clara_650r` | #650 | Up | Reviewer's own instruction to drop, repeated by the worker |
| `rig652r` / 55610 / `clara_652r` | #652 | Up | Available to the orchestrator |
| `rig653r` / 55611 | #653 | Up, untouched | Orchestrator's call |
| `rig654r` / 55612 / `clara_654r` | #654 | Up but **STALE** — carries pre-fix-round-2 0205 | Must be re-applied before being read as current, or dropped |
| `clara_rt_test` template clones | #638, #649, #653 (World e2e legs) | Shared per-cluster template DB; #653's World e2e had to quiesce 73 unrelated queued Work items left by other lanes' db batteries before arming its own crash test | Consider resetting this shared template DB between wave-integration runs — it accumulates cross-lane state |

---

## 6 · Unverified / hosted-pending census

Every ticket's evidence is entirely local; **no hosted run exists anywhere in this wave.** Beyond that
blanket status, each final report names its own additional unverified points:

| Ticket | What the final report leaves unverified |
|---|---|
| #625 | Issuer-rank divergence is measured but not closed (no surface warns an admin). Supabase's exact `error.code` for a consumed vs. expired invite token was not re-measured (copy states the indistinguishability conservatively instead of asserting a code) |
| #633 | XHR upload byte-counts from a real network (only stubbed/Chromium-exercised today). `documents-viewer-walk`'s seven contention reds were not re-run in isolation |
| #638 | `/login` stall's root cause unidentified (ruled out ephemeral-port exhaustion; cause otherwise unknown). World e2e passed only on its third attempt (first two reds were rig/host symptoms). The `already_settled` settlement arm has no World e2e or Playwright leg (DB-door proof only). A fiscal year sealing between admission and posting can still leave an admitted-never-posted claim (deliberate, disclosed residual). #707/#693 untouched |
| #639 | Nothing hosted for any part of this journey; #631's provider eval is recorded void until #836. The `claraWork_v4` half of AC3 is a contract only — no run has ever opened the dependent particulars question. One whole-suite run was contaminated by cross-talk from worktree 654 (recorded, not attributable to this branch) |
| #646 | All hosted behaviour. The walk proves the journey against a mocked PostgREST only, never real Postgres acceptance (that is the DB battery's separate claim). C88.16's anchor remains undiscovered. `get_document_for_human_read_v2` was refused at the grant wall for the origin client, so that fold was not exercised from the human lane |
| #647 | Everything hosted. No World e2e leg exists at all, deliberately — every identity door is human-lane-only and gap-647's slice (F) was struck. Host contention was not cleanly separated from code in one walk-cell timing (a failure while `pnpm lint` ran concurrently). #707/#693 untouched |
| #648 | No hosted probe run. #654's two evidence walls are mapped in the UI but unexercised (0205 isn't on this rig; this surface can't even structurally trip the second wall). D13 activity-kind residual untouched. Foreign plan items from #625/#649 (`bookkeeper_email`, `first_client_onboarding`) are not rendered by `get_firm_setup` |
| #649 | Hosted frontier, real `name_family_*` ACLs, and the COA/cancelled-onboarding affected-row count all unmeasured. UI-21's keyboard/focus-return/320px/200% legs unverified (no runnable fixture on this rig) |
| #650 | No hosted lane exists for this slice at all. `responsive-shell-walk` never reached 24/24 in one run (host contention); every test passed in at least one of four solo runs and no failure touched an attention-band assertion. The recent-success `EXPLAIN` plan was measured against only 63 receipts, not production scale (a structural result, not a load measurement) |
| #652 | Hosted/real-environment evidence pending for AC7/C88.13 (trigger, one effect, retry, cancellation). `rig-isolation`'s T10b fails on this rig from WDK-world bootstrap contamination (rig state, not the migration — confirmed green on the reviewer's own from-scratch chain without the world). The db estate suite, runtime unit suite and whole browser suite were explicitly left to the orchestrator/CI |
| #653 | Hosted/real-environment evidence pending for every AC and historical row, including AC8/C88.13. T10b fails on this rig for the same WDK-world reason as #652. No single whole-file Playwright run was green at the pre-fix-round head (fix round 1 got one clean run). The a11y cells are a hand-written structural rule engine, not an actual axe/screen-reader run. The db estate suite, runtime unit suite and whole browser suite left to orchestrator/CI. The original RED run was measured by the pre-cut attempt, not re-measured this session (mechanism independently checkable, not re-run) |
| #654 | No hosted lane exists for this slice. The `claraWork_v4` stanza is a contract only — nothing in it executes on this branch, and `claraWork.v3.impl.ts:474` still records `basis_digest: null`. The Playwright 27/27 figure is one run on this host; the first two runs of the new spec had genuine (non-flake) cell defects, since fixed |

---

*Compiled read-only; no items above were ruled on. Sections 1, 2 and 5 in particular need an explicit
orchestrator decision or acknowledgement before or during integration.*
