# Wave 2026-09-18 — digest for the orchestrator

Compiled from `DECISIONS.md` (§0, §6, §6.1, §6.2) and, for each of #635 #636 #642 #651 #655 #656
#657 #658 #659 #660: `reports/<n>-final.md`, `reports/<n>-fixround-1.md` (including its "Fix round 2"
sections), `reports/<n>-review-{spec,standards,adversarial}.json`, `reports/<n>-recheck-1.json`, and
(655, 660 only) `reports/<n>-recheck-2.json`. Read-only compilation; no ruling is made here beyond
reporting what `DECISIONS.md` has already ruled. Every claim below carries its source. "Ruled, see
§6.2" means the item was raised as a ratification request in a fix round or recheck and has since
been resolved by `DECISIONS.md` §6.2 (§6.2.0's plain-language rulings R-A…R-E, or the §6.2.1
"Ratified as shipped" table).

---

## 1 · Ratification items

Every formal "Ratification requested" item raised across the ten tickets' fix rounds and rechecks.
**All nineteen are ruled** — `DECISIONS.md` §6.2 was written specifically to close this wave's
post-review ratification requests, and no item surveyed below is still open. #635 raised none.

| Ticket | Item requested | Ruling | Source |
|---|---|---|---|
| #636 | Terminal rule narrowed to "no live children **and** no pending members" (brief said only "no live children") | **Ruled** — §6.2.1 #636 row: ratified as shipped; the re-key-by-a-different-bookkeeper half is filed as a follow-up (R-B) | 636-fixround-1.md "Ratification requested" #1; DECISIONS §6.2.0 R-B, §6.2.1 |
| #636 | Envelope gains two keys not in the brief's fixed shape: `cancel_blocked`, `pending_members` | **Ruled** — same §6.2.1 row, ratified; neither is a total or percentage | 636-fixround-1.md #2; DECISIONS §6.2.1 |
| #636 | The unbuilt half of ADV-636-03 — should a *different* bookkeeper be allowed to re-issue a stop after the original canceller loses authority? | **Ruled — not this wave.** §6.2.0 R-B: a second stop under a different key is refused; re-key-after-departure is its own follow-up ticket | 636-fixround-1.md #3; DECISIONS §6.2.0 R-B |
| #636 | The Chinese string — should the `en` locale literally say 正在停止, as the brief's Chinese planning shorthand reads? | **Ruled — no.** §6.2.0 R-C: English-only ("Stopping"); the Chinese was the planning document's own shorthand | 636-fixround-1.md #4; DECISIONS §6.2.0 R-C, §6.2.1 |
| #642 | The intent key's address gains the conversation's `transcriptPosition`, a field the brief's literal list (`{threadId, altitude, draft, attachments}`) does not name | **Ruled — ratified** (stated directly in the fix-round report itself) | 642-fixround-1.md "Ratification requested" #1; DECISIONS §6.2.1 |
| #642 | Three landed cells' fixtures re-encoded off 404 to whichever status the web proxy actually answers (two → 502 `runtime_unreachable`, one unit-level cell → 500) | **Ruled — ratified**; fix round 2 corrected the report's own "all three → 502" overstatement to name the 500/502 split correctly | 642-fixround-1.md #2 and its Fix round 2 section; DECISIONS §6.2.1, §6.2.2 |
| #651 | 0227 recuts **two** bodies outside the brief's roster — `clara.retire_depreciation_authority` and a second splice of `clara._tf_fa_authority_transition` — both repairs of damage 0227 would otherwise cause | **Ruled — ratified**; §2 row 0227's recut list is amended to name both | 651-fixround-1.md "Ratification requested" #1; DECISIONS §6.2.1 |
| #651 | Should the resolution ladder (`authority_ref`) be narrowed to prove *instruction*, not merely *provenance* — a cross-lane change touching the plan lane's identical existence test too? | **Ruled — not narrowed this wave**; comment softened, residual named, filed as a cross-lane follow-up ("what counts as a person's instruction" for FA + plan lanes) | 651-fixround-1.md #2; DECISIONS §6.2.1 |
| #655 | 0225 recuts **three** governed bodies (`_record_journal_entry_core`, `_subledger_classify_entry`, `_tf_subledger_item_belt`), not the ONE the brief and D11 bound it to | **Ruled — ratified.** D11 rewritten: "recut the posting core once, narrowly, plus the two subledger arms that make a trade-invoice item lawful"; nobody else in the wave touches that family | 655-fixround-1.md "Ratification requested" F1; 655-recheck-1.json (this was recheck-1's *single blocking item*, `needs_second_round`, before the ruling landed); DECISIONS §6.2.1 |
| #655 | The counterparty-terms due-date fallback anchors on `posting_date`, not `document_date` — brief-compliant as written but arguably wrong accounting | **Ruled — overruled.** §6.2.0 R-A: anchor on the **document** date; implemented in fix round 2 (`0911f7b8`), re-verified by recheck-2 | 655-fixround-1.md #2 (ADV-655-2); 655-recheck-1.json; DECISIONS §6.2.0 R-A, §6.2.1 |
| #656 | `prior_gl.business_operation` — D13.3 says raise to `supported`; the registry's own 240-row honesty law refuses that while `typed_facts` stays unsupported | **Ruled — hold.** §6.2.1 amends D13: stays `stored_only`, the truth lives in `limits`, a follow-up (F6) asks whether the four-level vocabulary needs a fifth case | 656-fixround-1.md "Ratification requested" (A4/spec-S2); DECISIONS §6.2.1; corrected into 656-fixround-1.md's own Fix round 2 |
| #656 | Should the tail's byte-identity digest (or the heading softening) be taken into 0228 before it is applied anywhere real? | **Ruled — no**, implicitly, by the same §6.2.1 row: "0228 is not edited after application (checksum ledger)" | 656-fixround-1.md (A9); DECISIONS §6.2.1 |
| #657 | D15's renewal rule gains a second clause: the op key also renews when a selected entry's own match-history moves (a match landing or being undone), beyond the brief's literal enumeration | **Ruled — ratified.** D15 amended to "one decision one key: a hash of {client, sorted line ids, sorted entry ids, cents, ack flag, each selected entry's match-history generation}" | 657-fixround-1.md "Ratification requested"; its own Fix round 2 states "D15 amendment ratified — DECISIONS §6.2.1"; DECISIONS §6.2.1 |
| #658 | Should `clara.retrieve_knowledge` be taught to signal a **core-only** failure independently (a new `begin…exception` arm, a `core_readable` envelope field), rather than remaining atomic? | **Ruled — no, not this wave.** §6.2.0 R-D: the door stays atomic; any read failure stops the run; layered per-tier isolation is deferred until a real layered-failure case exists; D16's wording tightened accordingly | 658-fixround-1.md "Ratification requested"; DECISIONS §6.2.0 R-D, §6.2.1 |
| #659 | Publish `work_id` on `list_review_queue`'s `work_question_rows` so a parked question can deep-link to its Work (the real fix for A1) | **Ruled — not this wave.** §6.2.0 R-E: `list_review_queue` is not recut this wave (no `work_id` on the row); named as a residual and filed as a follow-up | 659-fixround-1.md "Ratification requested"; DECISIONS §6.2.0 R-E, §6.2.1 |
| #660 | New coverage token `cash_set_published_after_books_start` (brief names only `cash_set_version_changed_in_series`) | **Ruled — ratified** | 660-fixround-1.md "Ratification requested" #1; DECISIONS §6.2.1 |
| #660 | `comparison` gains `available` + `reason` keys beyond the brief's `{value_cents, delta_cents, delta_pct, sign_change, period}` shape | **Ruled — ratified**; #669 inherits them | 660-fixround-1.md #2; DECISIONS §6.2.1 |
| #660 | The pack gains two top-level keys, `unmarked_closing_entries_series` + `series_coverage_reason`, beyond the brief's period-scoped disclosure | **Ruled — ratified** | 660-fixround-1.md #3; DECISIONS §6.2.1 |
| #660 | The `apps/web` lockfile moves on this branch alone (dropping `cn`), ahead of the integrator's single planned `pnpm install --lockfile-only` | **Ruled — ratified** | 660-fixround-1.md #4; DECISIONS §6.2.1 |

**Note on token spelling (#660):** `DECISIONS.md` §6.2.2 itself writes `cash_set_version_race`; the
shipped and ratified token is `cash_set_version_raced` (fix round 1's A9). Fix round 2 kept the
shipped spelling rather than mint a near-duplicate token, and §6.2.2's own text confirms the
`…_race` spelling was the orchestrator's transcription, not a second token. Resolved — see
`660-fixround-1.md`'s Fix round 2 §NF-1 and `660-recheck-2.json`.

---

## 2 · Blueprint drift

Every `docs/PRD.md` / `docs/ARCHITECTURE.md` line a report cites, deduplicated across tickets, with
the measured true state. Nothing here was edited; per `DECISIONS.md` §4, this is evidence for
#683's blueprint sync. `DECISIONS.md` §4 itself pre-lists most of these line numbers from the gap
maps; rows marked **†** are additional citations the *implementation* reports surfaced beyond that
list.

### PRD.md

| Line | Ticket(s) | Blueprint claims | Measured true state | Source |
|---|---|---|---|---|
| :27 † | #659 | (mis-cited as :31 in the brief and first-cut report) "Firm workspace…可跨获准客户查询或发起一批工作" reads as delivered | The per-client, firm-altitude aggregate (`get_firm_portfolio_pack`) did not exist before 0231; querying was true, organising a batch was not | 659-final.md; 659-review-spec.json F3 (citation correction) |
| :59 | #660 | Client Home financial summary = four summaries + three charts | After this ticket it is **two and two**: cash + profit (income/expense as sub-figures) and two charts (cash trend, profit composition); AR/AP is #669's | 660-final.md |
| :65, :79 | #655 | (grouped citation, no further detail given in the report beyond naming these lines alongside ARCHITECTURE:529) | Recorded but not separately argued; grouped with the "line items planned" ARCHITECTURE:529 drift below | 655-final.md |
| :108 | #656 | 客户建立与期初导入 listed under 当前版本已交付 | The 导入 (import) half was unreachable from a browser before this merge; the producer had no caller. This merge makes it reachable; the PRD line needs a qualifier, not deletion | 656-final.md |
| :109 | #651 | 固定资产与调整 listed under 当前版本已交付 | The classification axis and the locked-period wall were both gaps inside "delivered" fixed-asset handling before 0227 | 651-final.md |
| :109 | #657 | 银行对账 listed under 当前版本已交付 | This ticket refines that line (matching bank evidence to an *already-approved* booking is a new capability inside it) | 657-final.md |
| :120 | #636 | (implicitly, no durable batch construct) | A durable batch parent, its six doors and its surface now exist; this line goes stale on merge | 636-final.md |
| :121 | #642 | 对话车道在连接失联后的完整恢复 parked, citing closed #764 | AC5 builds part of that gap (revocation delivered as a typed `revoked` event on both the mid-stream and attach-time paths; full reconnect semantics remain #764/#915's) | 642-final.md |
| :123 | #658 | Defers automatic re-evaluation of affected Work to "#658 and #663" | This slice ships the **detector** only (reads, versions, drift, replan trigger); PRD:123 is half satisfied — the correction/re-evaluation engine is still #663's | 658-final.md |
| :126 | #635 | Shared-AI-usage clause has no described surface | `/settings/firm`'s model-usage card is now a real surface; PRD text still reads as though it is not | 635-final.md |

### ARCHITECTURE.md

| Line(s) | Ticket(s) | Blueprint claims | Measured true state | Source |
|---|---|---|---|---|
| §10 (absent) † | #635 | `0195:21` and `0186:7` both cite an ARCHITECTURE §10 | No such section exists; the content those citations mean lives in §5.E (`:358-372`) | 635-final.md |
| §7's accepted-but-unimplemented table † | #635 | (no commercial row) | The plan/payment/invoice posture this ticket implements has no blueprint entry to move from "accepted, unimplemented" to "implemented" | 635-final.md |
| :134-135 | #636, #659 | "可查询获准客户并组织批量工作" (can query permitted clients and organise batch work) | Querying is true; **organising batch work at firm altitude still does not exist** after either ticket — #636's batch lives at client/Documents altitude and the firm leaf mounts it read-only; #659's board renders no batch-organising affordance | 636-final.md; 659-final.md |
| :182-183, :293 | #642, #651, #658 | Pins `chatTurn → chatTurn_v19`, `claraWork → claraWork_v3` | Live pins are `chatTurn_v20` / `claraWork_v4` (`registry.ts:173,270`) even before this wave's own v21/v5 cut; `workflowBodies` holds **53** frozen bodies where ARCHITECTURE:182 says 51 | 642-final.md; 651-final.md; 658-final.md |
| :207-211 | #656 | Calls `opening-tb-cells.mjs` the real producer of `opening_tb.line`, marked *[已实现, hosted evidence pending]* | Nothing called it before this merge — the producer had no caller. This merge makes the sentence true | 656-final.md |
| :232-235 | #655 | Marks *[已实现]* that confirming an invoice writes its GL and open item inside one transaction | Before 0225 the Work lane could not confirm an invoice at all — `0204:550-570` refused every control leg; that atomicity existed only on the legacy coding lane | 655-final.md |
| :287 + §7's metric-pack row | #660 | "报表 metric pack 与 chart／表格读同一定义" | The cash/profit half is discharged here through `clara.get_client_financial_pack` — **not** the 0058 metric lane; AR/AP half is #669's | 660-final.md |
| :297-299 | #658 | States the pack-shaped-read ownership rule naming only `get_knowledge_pack` | This slice complies, but the drift is the *opposite* one: `retrieve_knowledge` is equally pack-shaped and had to assert its own grant absence by hand; a Wayfinder pass should widen the rule from the function to the shape | 658-final.md (follow-up #1) |
| :372 † | #635 | "No export route, by absence" stated about `work_execution_traces` only | This ticket's client-side usage CSV export makes the sentence ambiguous — a reader could take it as covering every export | 635-final.md |
| :373-386 | #658 | Makes writer-side trace bounds binding on `claraWork_v4` | v4 shipped without them; the code now exists (`lib/work-trace-bounds.mjs`) but binds only from **v5** (rider #847, part of this wave's successor cut) | 658-final.md |
| :435-445 | #658 | Makes a schema-covering bundle digest binding on v4 | `claraWork.v4.bundle.ts:53` still hashes `tools:{id,names}`; owed on v5 (this wave's successor cut) | 658-final.md |
| :509-512 | #657 | (bank matching context) | Unaffected by this slice — noted, not drifted | 657-final.md |
| :524 | #657 | (capability registry) | Bank is still **not** in the capability registry after this slice | 657-final.md |
| :529(-530) | #655 | Line items "planned" | Recorded, grouped with PRD:65/:79 above; #655's `lines` are journal-basis lines, never extracted invoice line items (#782 boundary) | 655-final.md |
| :535 | #656 | One §7 row carries two subjects under one `<!-- #764 -->` tag | Contradicts §5.A's separate `<!-- #821 -->` block at `:276-283`; needs a doc-sync ticket to confirm with the owner which tag is authoritative | 656-final.md |

**Non-blueprint drift also reported, for completeness:** #651 measured that the frozen module comment
in `fa.keys` ("exactly the nine `_fa_validate_particulars` accepts") is now stale — `FA_PARTICULARS_KEYS`
is a strict *subset* of the database's admitted key set after 0227's classification axis landed. This
is a frozen-module doc comment, not a PRD/ARCHITECTURE line, so it is filed under §3 rather than here
(651-final.md, Blueprint drift #4).

---

## 3 · Follow-ups worth filing as GitHub issues

Union across all ten tickets' final reports and fix rounds, deduplicated. `needs-triage` on every row
unless noted. Labels follow the house five (`needs-triage`, `needs-info`, `ready-for-agent`,
`ready-for-human`, `wontfix`).

### Cross-cutting

| Title | Body | Sources | Labels |
|---|---|---|---|
| `use-clara-thread-stop.test.ts` is a genuine, non-deterministic whole-suite flake in #630's lane | Independently reproduced by *eight* of the ten tickets this wave, none of which touch the file (`git diff origin/main..HEAD` empty for it on every branch). It fails intermittently even in **isolation** — #657's recheck measured 1 failure in 4 isolated re-runs; #659's standards review measured 2 of 5; #660's recheck-1 measured 1 of 3 — so it is not purely a whole-suite-load artifact. #642's own fix round partially diagnosed the mechanism (a reattach timer leaking between test cells) while fixing an unrelated defect in the same file. It deserves an owner and a real diagnosis rather than being re-discovered and re-disclosed by every future ticket that happens to run the whole suite. | #636 (636-fixround-1.md "two things the whole-suite run found"), #642 (642-final.md follow-up #3, 642-recheck-1.json), #651 (651-final.md "Tests and commands"), #655 (655-fixround-1.md), #656 (656-fixround-1.md), #657 (657-fixround-1.md Fix round 2, 657-recheck-1.json), #659 (659-review-standards.json S1, 659-final.md follow-up #8), #660 (660-fixround-1.md Fix round 2 NF-2, 660-recheck-1.json NF-2) | ready-for-agent |
| `packages/db/scripts/migrate.mjs` has no supported way to re-apply ("redo") one edited, unmerged migration | A fix round on an unmerged migration has to hand-apply the delta body-by-body under `set role clara_fn_owner` and repair the `schema_migrations` checksum by hand, every time, because the runner refuses on checksum drift and this wave's rig cannot run a from-scratch chain (0154's cluster-wide `clara%` role census pins 14 but every long-lived rig now holds 18). #651, #655, #656, #657 and #660 all independently built the same manual procedure this wave; #657 names it explicitly as a follow-up. A `--redo <version>` mode gated behind the destructive-reset flag would turn a careful, error-prone manual recipe into a measured operation. | #657 (657-fixround-1.md follow-up #2), #651 (651-fixround-1.md, ADV-651-3's disposition), #655 (655-fixround-1.md Fix round 2 "how the migration was re-applied"), #656 (656-fixround-1.md A9), #660 (660-fixround-1.md Fix round 2 "the route taken") | ready-for-agent |
| Two cash expressions coexist unruled: `list_bank_statements`'s `tie.gl_balance_cents` vs. `get_client_financial_pack`'s governed "book cash" | #657 reads bank-account cash through the existing GL-cash reader; #660 ships an independent, *governed* cash-account-set definition for the client dashboard. Neither recuts the other, and no ruling says which is authoritative when the two disagree, or whether they are even meant to describe the same number. `DECISIONS.md` and `SYNTHESIS.md` never mention `gl_balance_cents`; the only source is an unratified gap-map recommendation. Both authors flagged it and moved on rather than build a second cash expression themselves. | #657 (657-final.md open question #5, 657-fixround-1.md "deliberately left" A8), #660 (660-final.md follow-ups, implicit via its own governed cash-account-set) | ready-for-human |
| `scripts/wiki-lint-checks.mjs`'s `maskComments` desynchronises after an unbalanced quote/dollar token, so later comments in the same file are scanned as SQL | Measured on `0226_bank_match_evidence.sql`: adding the words `pg_get_functiondef` inside a *comment* at line 203 made `check-wiki-dynamic-sql.mjs` fail-closed and misclassify an assertion-only tail block as a change-of-record patch with an unresolved EXECUTE target. The risk cuts both ways — a comment could equally supply a token that makes a real dynamic-SQL patch look benign. Worth a selftest case with an apostrophe inside a comment. | #657 (657-fixround-1.md follow-up #1) | ready-for-agent |

### Ticket-specific

| Title | Body | Sources | Labels |
|---|---|---|---|
| `clara.firm_document_limits` has no human writer | The four numbers `/settings/firm` renders are read-only; an editor needs a governed write door, a receipt and an audit row. Decide at the same time whether the operator console or the firm owner is the writer. | #635 (635-final.md follow-up #1) | ready-for-human |
| Supavisor / pool headroom is not a settings figure (C81.5) | Pool capacity is a load-run measurement against a real stack, not a card computation; needs a separate ops ticket at release time. `firm_limits.max_concurrent_runs` is the other per-firm cap and is deliberately not rendered on `/settings/firm`. | #635 (635-final.md follow-up #2) | ready-for-human |
| Audit out-of-repo callers of `clara.get_llm_usage_summary` before the recut reaches hosted | Measured: zero callers in `apps/web` + `packages/runtime`. The hosted estate could in principle hold one; an under-ranked caller now moves from a successful read (own firm) or CLR11 (another firm) to CLR04. Ask the owner rather than defer the recut. | #635 (635-final.md follow-up #3) | ready-for-human |
| 0233 hard-pins three unrelated bodies (`get_current_legal_documents`, `accept_legal_document`, `_accounting_work_egress_live`) — a cross-ticket coupling to record | Fail-closed is intentional and correct; any later ticket that legitimately recuts one of the three at a migration number below 0233 must re-measure 0233's constants in the same commit, or 0233 refuses to apply with a message that blames drift rather than naming the recutting file. Verified clean for this wave's own 0225-0232. | #635 (635-final.md follow-up #4; adversarial A7) | ready-for-agent |
| Move the document daily-ingest ceiling window from UTC to `Asia/Kuala_Lumpur` | `_reserve_document_ingest` truncates a UTC day, so a firm's daily ceiling resets at 08:00 MYT while every other calendar boundary in the estate is MYT. A pinned cell (`p636.batch.capacity_window_utc`) will red the moment this moves, rather than silently shifting every firm's ceiling by eight hours. | #636 (636-final.md follow-up #1) | ready-for-agent |
| A file refused by the daily ingest ceiling before its intake exists can never become a durable batch member | A member's identity is its intake; a document turned away before that has no durable record anywhere. Worth a relation or a widened `document_intakes` arm. | #636 (636-final.md follow-up #2) | ready-for-human |
| The intake recovery belt opening spool sidecars on every sweep causes Windows-only `EPERM` intake failures under load | Load-dependent (2 of 100 in one run, 0 of 100 in another). A read that copies rather than holds a handle, or a belt that skips sidecars younger than its own age guard, removes a whole class of Windows-only intake failures. | #636 (636-final.md follow-up #3) | ready-for-agent |
| `sweep_intake_batch_cancellations` has no cadence of its own | It rides the leader's nudge-driven sweep, so a batch cancelled on an idle estate waits for the next nudge. A due-probe (the `close_prep_due` shape) would make the latency a stated property. | #636 (636-final.md follow-up #4) | ready-for-agent |
| The CI World leg for intake batches runs third on a database two earlier legs already loaded, and none of them drains its queue | Re-running produced 1.27M log lines of `document-processing concurrency limit reached` before passing — it *did* pass, but the noise would bury a real failure. Needs a drain between legs, or a separate database for the third. | #636 (636-final.md follow-up #5) | ready-for-agent |
| Allow a different bookkeeper to re-issue a stop after the original canceller loses authority mid-batch | Ruled out of this wave (§6.2.0 R-B); the smallest version is: permit a fresh op key when the stored canceller is no longer active. | #636 (636-fixround-1.md, ratification item #3) | ready-for-human |
| The pinned `shadcn` CLI adds a bogus `cn` production dependency on every resolved item | This repo imports `cn` from `@/lib/utils`; the `ui:add` guard should strip or refuse the bogus dependency rather than leaving each caller to hand-revert `package.json` and the lockfile. (Independently hit again by #660 — see the cross-cutting item's sibling below.) | #642 (642-final.md follow-up #1) | ready-for-agent |
| Finish AC2's shadcn native-chat component migration (`attachment`, `message-scroller`) | Both items overwrite the owner-ruled `components/ui/button.tsx`; needs `button.tsx` reviewed or the item taken without it, `message-scroller` costed for the Workers bundle with `@shadcn/react`, and each installed file re-based onto `--focus-ring-alpha`. | #642 (642-final.md follow-up #2, AC2 named residual) | ready-for-human |
| `use-clara-thread-stop.test.ts` leaks a reattach timer between cells | A preceding cell aborts by task id and still does not contain it. A per-cell drain (or an injected `sleepImpl`) would stop a count-based absence cell inheriting another cell's stream. (Feeds the cross-cutting flake item above.) | #642 (642-final.md follow-up #3) | ready-for-agent |
| A `queued` admission event on the chat stream | Needs a `chatTurn` cut emitting an admission event — the one live tool-state case this ticket deliberately did not build. | #642 (642-final.md follow-up #4, AC4 named residual) | ready-for-human |
| `x41.s4` reds on the persistent depreciation rig from a dated, pre-existing defect, not #651's | The offending register rows are thirty minutes *older* than 0227's `applied_at`; attributable to `x41.b3`'s `reverse_entry` fixture re-firing the acquisition belt. The client count keeps drifting on a shared rig (5→6→7 across three measurements) — the mechanism and timestamps are stable, the count is not. | #651 (651-final.md follow-up #1; adversarial ADV-651-9; spec SPEC-651-N2) | ready-for-agent |
| Fold `preview_depreciation_run`'s duplicated aggregation into `_fa_run_period_core` | Bound two ways today (0227's tail T.13, `p651.preview.matches_run`) but it is duplication with a maintenance cost; the fold deserves its own ticket and review. | #651 (651-final.md follow-up #2) | ready-for-agent |
| A blocked depreciation queue has no Needs-you row | An outstanding draft blocks a client's whole depreciation lane and nothing surfaces it at firm altitude; the wave forbids a new review-queue row kind this wave, so this needs a decision, not a patch. | #651 (651-final.md follow-up #3) | ready-for-human |
| Decide whether a locked period's depreciation charge is ever *moved* into the next open period, or only ever charged as arrears (D9) | Not built this wave (AC2's accepted-treatment clause, descoped). Owner question, unresolved. | #651 (651-final.md follow-up #4, D9) | ready-for-human |
| Fold `complete_fixed_asset_particulars` and `_fa_complete_particulars_core`'s duplicated wall | Both bodies keep their own copy of the same completion wall; fold once the validator-key-set question is settled. | #651 (651-final.md follow-up #5) | ready-for-agent |
| Rule what counts as a "person's instruction" across the FA and plan lanes (`authority_ref` proves provenance, not authorship, in both lanes) | `sign_depreciation_authority` and `create_accounting_plan` resolve `authority_ref` by mere existence in the firm/client, reading neither `kind`, `status` nor author — a machine-born task nobody typed satisfies either door. Narrowing one lane alone gives the firm two meanings for one word; this is a cross-lane ruling, not two lane-local patches. | #651 (651-final.md follow-up #6; adversarial ADV-651-2; ratified as deferred, DECISIONS §6.2.1) | ready-for-human |
| `completeFixedAssetParticulars` and `disposeFixedAsset` still mint their own operation key | #651's "one decision, one key" fix threaded a caller-supplied key through four FA doors (propose/sign/retire/revise) and deliberately stopped there; these two pre-existing doors (#639's shape) were out of scope. Same defect class D15 rules for the bank lane. | #651 (651-final.md follow-up #7; adversarial ADV-651-8) | ready-for-agent |
| `clara.get_depreciation_authority` never surfaces a retired authority's reason, author or window | After a withdrawal the read answers `authority: null`, the same as a client that never had one; the retirement record is only in the audit trail. Worth a decision once #651's history surfaces have a reader. | #651 (651-final.md follow-up #8) | ready-for-human |
| Drive AC4's park (`ask_question`) arm and a commit-window cancel on the trade-invoice lane | The shared World harness (`work-journal-serve.mjs`) carries only `post`/`narrate` scripted models; widening it needs an owner since it is shared across lanes. The machinery is lane-agnostic and proven green elsewhere; it is simply not exercised for a trade invoice. | #655 (655-final.md follow-up #1) | ready-for-agent |
| `lib/wire.ts` discards every refusal detail key but `reason` | Three doors now want structured detail (`party_ambiguous`'s candidate list, the claim lane's `constraint` folding, source-conflict ids). One typed `detail` passthrough would retire three per-route unfoldings, including the one #655 added. | #655 (655-final.md follow-up #2) | ready-for-agent |
| A same-document-number duplicate probe for trade invoices, with an owner | The estate accepts the same supplier bill number twice under two intent keys and doubles the payable (measured: `p655.duplicate.same_reference_is_NOT_probed`). The usual shape is warn-not-refuse (`reference` is nullable; suppliers legitimately reuse numbers) — needs a surface owner, likely #662's open-item list. | #655 (655-final.md follow-up #3; adversarial ADV-655-6, deliberately left) | ready-for-human |
| Resolve a trade-invoice counterparty by TIN, or stop advertising the field | `tin` is accepted by the tool schema and echoed in `party_unresolved`'s detail but is not a resolver key (only id → registration number → name/alias resolve). A Malaysian e-invoice whose only identifier is a TIN leaves as `party_unresolved`. Needs a ruling on precedence (registration vs. TIN) and whether a cross-client identifier may resolve inside one client's books. | #655 (655-final.md follow-up #4; adversarial ADV-655-8) | ready-for-human |
| #665's cutover must retire the legacy coding lane's posting-date due-date anchor | After R-A, the Work lane and the legacy upload lane are *known* to disagree on one fact — the counterparty-terms due date (document-date anchor vs. posting-date anchor). `p655.due.anchor_document_date` pins both numbers by name so the divergence cannot ship silently; #665's cutover must retire the legacy anchor. | #655 (655-final.md follow-up #5, fix round 2) | ready-for-human |
| Build a browser entrance to `POST /api/seeding/prepare` (prior-GL seeding) | `seeding-parse.mjs` drives `clara.create_seeding_batch` off a filed prior GL today and nothing in `apps/web` calls it — the capability is real and unreachable. Nobody owns it (measured in the gap pass). | #656 (656-final.md F1) | ready-for-human |
| Decide what a Work-shaped opening record is, or rule that there is none | The opening lane writes `op_receipts` (0002), never `operation_receipts`; `accounting_work.purpose` is a closed three-value list. Widening it is a governance change, not an implementation one. | #656 (656-final.md F2, residual R1) | ready-for-human |
| Cut `read_opening_source` into a future `chatTurn_vN` | The contract is written (656-final.md's successor-contract section); the follow-up starts from text rather than from scratch. | #656 (656-final.md F3) | ready-for-agent |
| Make a re-read opening document re-parsable | Re-parsing a re-read document is a dead end today (a genuine second OCR pass refuses CLR10 `source_reread_since_parse` with no way forward). Either the op key must carry the extraction, or a door must re-point existing targets. | #656 (656-final.md F4, residual R4) | ready-for-agent |
| Give the closed-fiscal-year refusal on an opening draft the opening basis's own words | Today the refusal names the fiscal year and the journal entry id, not "this opening basis is dated into a closed year" — correct but not opening-lane-specific language. | #656 (656-final.md F5, residual R2) | ready-for-agent |
| Reconcile the capability registry's four levels with "read deterministically into human-ticked proposals" | `prior_gl` fits neither `supported` nor `stored_only` cleanly; this vocabulary gap is what held the business_operation ratification at `stored_only`. | #656 (656-final.md F6; ratified as a follow-up, DECISIONS §6.2.1) | ready-for-human |
| Install Combobox/Popover without clobbering the owner-ruled Button | `ui:add` refuses the whole payload when any file is protected, and `popover` also fails in the shadcn CLI itself on `base-nova` + `"registries": {}`. Blocks every lane wanting a searchable high-cardinality picker. | #657 (657-final.md follow-up #1) | ready-for-agent |
| Per-line region citations on bank statement lines ("which page of the PDF") | 0038's lane contract states verbatim that per-line region citations are not carried and the relation has no column for one; needs an ingest-side change. | #657 (657-final.md follow-up #2; AC5/AC6 named residual) | ready-for-human |
| Widen `docs/ARCHITECTURE.md:297-299`'s pack-shaped-read ownership rule from the function to the shape | The #783 ruling is written about `get_knowledge_pack` specifically; `retrieve_knowledge` is equally pack-shaped and had to re-derive the same grant-absence proof by hand. A Wayfinder pass should generalise it. | #658 (658-final.md follow-up #1) | ready-for-human |
| Surface `get_context_pack`'s `last_projected_seq` / `has_stale_sources` somewhere | Computed inside the wiki block but reach no read and no surface today; AC3's projection-lag half has no face. Belongs with #663's engine, not a recut this brief permits. | #658 (658-final.md follow-up #2) | ready-for-human |
| Represent two independent knowledge *sources* disagreeing, not just two records | `_knowledge_source_pins` pins one document/extraction/region per record, so "conflicting independent sources" today only ever means two records, never two sources of one record. Worth a shape decision before #665 measures accuracy against it. | #658 (658-final.md follow-up #3) | ready-for-human |
| The read-set key grammar (`record_work_knowledge_read`) is stricter than the catalog's own CHECK | All 13+5 live keys conform today, but a future migration minting e.g. `Sst_Regime` would make every read touching that client retrievable and unrecordable. Worth stating once as the estate's key law. | #658 (658-final.md follow-up #5; adversarial A8) | ready-for-agent |
| A `#NNN` ticket reference inside a linted string literal is banned by the raw-hex-colour rule, and nobody knows it | `NO_RAW_COLOR_VALUES` matches `#` + three hex digits, so `"#658"` in a linted literal is an error while the same text in a comment is fine. One sentence in the rule's own error message would save the next round-trip. | #658 (658-final.md follow-up #6) | ready-for-agent |
| Firm Home renders the client register twice (the new portfolio table and the older `clientsLine`/`clientsEmpty` tally) | Two renderings of one population — a shape the product removed once already elsewhere. Needs a decision on which one goes. | #659 (659-final.md follow-up #1) | ready-for-human |
| Mount `get_compliance_watch_disposition`'s read on `/settings/compliance` too | The door is live and browser-reachable; `components/firm-admin/compliance-register-panel.tsx` (#635's estate) was not touched by #659. | #659 (659-final.md follow-up #2) | ready-for-agent |
| `/clients/:id/tax` receipt has no browser leg | Proven by a web unit cell only; that route's e2e fixtures belong to #627's `tax-boundary-mock.mjs`, which this lane must not edit unilaterally. | #659 (659-final.md follow-up #4) | ready-for-human |
| Delete `lib/firm/timeline.ts` and `clara.list_firm_timeline` deliberately, once a lane owns the decision | D18.f's swap to `clara.list_activity` left both with zero production consumers (only their own test file and two prose mentions remain). Deleting a live granted door is a product decision, not a defect fix. | #659 (659-final.md follow-up #6; adversarial A11) | ready-for-human |
| `ui:add` cannot invoke the shadcn CLI on Windows at all | `apps/web/scripts/ui-add.mjs:196` spawns the extensionless `node_modules/.bin/shadcn` without `shell:true`; Windows needs the `.CMD`. Exits 1 with no output — the guard's whole purpose (be the one path to `shadcn add`) is unreachable on this host until fixed. | #660 (660-final.md follow-up #1) | ready-for-agent |
| Discharge the pre-0120 `closing_transfer` unmarked-history backfill | `0016:211-219` raised a notification per affected firm/client that no migration ever discharged; 0232 *discloses* the gap (`coverage='partial'`) but repairs none. Needs an audited lane (approved entries admit only the reversal pair) and the hosted count read first. | #660 (660-final.md follow-up #2) | ready-for-human |
| Cut the deferred chat tool `read_client_financial_pack` | `{client_id, as_of, period}` over `clara.get_client_financial_pack`, refusals CLR04/CLR11/CLR10 `cash_set_unpublished`, reusing an existing typed read part. No cut owed this wave; the door is ready. | #660 (660-final.md follow-up #3) | ready-for-agent |
| Render `cash.composition` somewhere — nothing consumes it yet | The door emits it (brief's own envelope contract), the parser hydrates it, no face reads it. #669's tiles and #670's account-filtered ledger are its natural consumers. | #660 (660-final.md follow-up #4; adversarial A3, A7) | ready-for-human |
| A cash-account-set membership editor beyond the first publish | The publish dialog handles a first version well; changing membership means re-picking every member because the door supersedes rather than diffs. A pre-checked, dated second-pass editor is the natural next step. | #660 (660-final.md follow-up #5) | ready-for-human |
| Decide whether `clara.create_account_set_v1` (the 0058 writer) should retire | Recorded zero-caller retirement candidate; 0232 deliberately does not ride it. | #660 (660-final.md follow-up #6) | ready-for-human |

---

## 4 · Successor contracts

Verbatim stanzas as authored in the final reports. The integration worker cuts `chatTurn_v21` and
`claraWork_v5` once each, after all ten merges (DECISIONS §1.1). #636, #656 and #660 ship
**contract-only** text — nothing registered, nothing cut.

### #655 — `chatTurn_v21` · `start_trade_invoice_work`

> **Body** `chatTurn_v21`, engine stamp `llm-openai:<modelId>:chatturn-v21`. **Tool name** `start_trade_invoice_work`.
> **Input schema** `.strict()`, living in the NEW non-frozen `packages/runtime/lib/trade-invoice-basis.ts` (importing it puts the module in the v21 closure, which is intended): `kind: z.enum(["sales_invoice","supplier_bill"])`, `counterparty: { id?: uuid } | { name, registration_no?, tin? }`, `document_date: z.string().date()`, `due_date` the same and nullable, `due_date_source: z.enum(["stated","counterparty_terms","absent"])` (the tool may only ever claim `stated` or `absent`; the database answers `counterparty_terms` and counts the party's agreed days from the DOCUMENT date — DECISIONS §6.2.0 R-A), `reference: z.string().min(1).max(64).nullable()`, `currency: z.literal("MYR")`, `total_cents: z.number().int().positive()`, `tax_facts: z.record(z.string(), z.unknown()).nullable()` (opaque, carried and echoed, validated against nothing — **note the two-argument `z.record`: zod 4.4.3 requires the key schema, and the brief's stanza wrote zod-3 arity**), `posting_date`, `memo`, `lines` (the journal basis), `document_id: uuid.nullable()`, `basis_origin: z.enum(["user_direct","clara_interpreted"])`.
> **Door call**, argument order FIXED here: `select clara.admit_trade_invoice_work($1 client, $2 author, $3 intent_key, $4 kind, $5 particulars::jsonb, $6 basis::jsonb, $7 basis_origin, $8 source_refs::jsonb, $9 model)`. The door is granted to `clara_runtime` — the #915 lesson: a `clara_authenticated`-only door makes the tool a guaranteed grant refusal.
> **Op key** deterministic (task + tool + canonical input), so a replayed step re-reserves rather than admitting a second Work. The answer's `invoice_id` / `kind` / `counterparty_id` / `due_date` ALWAYS describe one row, including under a race: fix round 1 added the post-rung re-read that raises `intent_payload_conflict` instead of folding a raced loser's party onto the winner's invoice (ADV-655-1).
> **Refusal map to message** (EIGHTEEN tokens after fix round 1): the FOURTEEN DECISIONS.md:50 fixes — `party_ambiguous` (carry the candidate list verbatim, ask the person to pick) · `party_unresolved` · `credit_shape_not_admitted` · `invalid_total` ("the stated total does not match the control leg's signed amount") · `unbalanced_basis` · `control_leg_missing` · `wrong_control_domain` · `invalid_due_date` · `source_already_posted` · `client_inactive` · `insufficient_role` · `invalid_intent_key` · `intent_payload_conflict` · `period_locked` — **plus a measured FIFTEENTH, `invalid_kind`** ("a trade invoice is either a sales invoice or a supplier bill"), raised so a `kind` that is neither admitted value and is not credit-shaped leaves as a typed CLR10 rather than a bare 23514 out of the column CHECK, which is `0194:1078-1081`'s own rule — **and, after review finding F2, a SIXTEENTH, SEVENTEENTH and EIGHTEENTH: `invalid_particulars`, `invalid_currency`, `invalid_tax_facts`.** The door raised `invalid_kind` for all four failures while the map renders one sentence per token, so three of the four were told a sentence about document types that was false. One reason names one thing. The ladder binds, the number describes. The door also restates the core's `actor_not_active` and `client_not_found` in its authority preamble.
> **Part kind** the existing `work_accepted` — **no `WORK_ACCEPTED_PURPOSES` widening**, because a trade invoice is a `journal_entry`-purpose Work exactly as #638's claim is; parts-parity is green at this commit.
> **Prompt stanza** must say "I have QUEUED it": the tool ADMITS and posts nothing. The entry is written moments later by a `claraWork` run under a wake credential minted OBO the same human, with the database rechecking role, period, chart and cents at commit.
> **Nothing** is added to `claraWork_v4`, `autoDraft_v10` or `invoiceFacts_v1`, and no file inside the `chatTurn.v20.*` or `claraWork.v4.*` closure changes.
> **One honest limit**: `chatTurn_v19`'s complete tool roster and its prompt stanzas were never enumerated in this ticket's research, so this stanza names ONLY `start_trade_invoice_work` and assumes no other tool's shape. Enumerating the full v21 roster and reconciling the other lanes' stanzas is the integration worker's job at the cut.

*(Fix round 2 amended the door's own due-date derivation per R-A; the stanza's `due_date_source`
clause above already reflects the ratified reading. Source: 655-final.md, 655-fixround-1.md Fix round 2.)*

### #651 — `chatTurn_v21` · `run_depreciation_period_for_client`

> **Body**: `chatTurn_v21`. **Tool name**: `run_depreciation_period_for_client`.
> **Zod input** (`.strict()`): `{ client_id: z.string().uuid(), through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }`. **No period start/end — the period is the database's** (`0041:3457-3470` refuses any caller-named window that is not the cadence's). `through` bounds a catch-up and defaults to the current book day.
> **Carrier module**: `packages/runtime/lib/depreciation-run.ts` (NEW, non-frozen at authoring time, freezes on import).
> **Door call, exact argument order**: `select clara.run_depreciation_period_for($1::uuid, $2::date, $3::text, $4::uuid) as r` — `(p_client, p_through, p_op_key, p_obo)`, granted to `clara_runtime` **only**, with live-authority recheck of the named human (active member of the client's firm, bookkeeper floor, active client). **A NEW verb name is mandatory, not stylistic**: `rig-meta.mjs:691-693` is an executable census that fails the moment `run_depreciation_manual` reaches a machine role.
> **Refusal mapping**: CLR38 `authority_not_live` → "This client has no signed depreciation authority. An admin signs one before Clara can run depreciation." · CLR38 `period_draft_outstanding` → "A depreciation draft is already waiting for approval; approve or withdraw it first." · CLR38 `period_earlier_unmet` → name both dates · CLR38 `period_request_invalid` axis `not_ended` → "That period has not ended yet." · CLR38 `period_request_invalid` axis `period_closed` → name the fiscal year and the reopen path · CLR19 `write_into_closed_period` → name the fiscal year and the reopen path · CLR04 `obo_not_active` / `insufficient_role` → "You no longer hold the authority to run this."
> **Floor**: the door clears due periods from `authority_from` forward up to `p_through` and **carries no floor bypass**, so Clara cannot reach a pre-floor period; the sentence map points the person at the human door `run_depreciation_manual`.
> **Part kind**: reuse the existing `work_accepted`-adjacent receipt part shape. **No new part kind and NO `accounting_work.purpose` widening** — depreciation posts through `journal_entries` directly and never reaches the Work lane (`0195:1711` / live `0204:180` stay closed).
> **Prompt stanza**: "You execute an authority; you never sign one. The period is the database's, never yours. Say you have QUEUED/POSTED exactly what the receipt says, including how many assets were skipped and why."
> **Not folded here**: #933 rides `claraWork_v5`, a different closure — do not fold the two. #882(a)'s CLR40 stanza is **#658's worker's** to write (see #658's rider D, below — already written).

### #658 — `claraWork_v5` (step / tools / terminal / replan), capability registry v2, and its riders and chat-lane stanza

**(A) `claraWork_v5` — the new step, tools, terminal and replan trigger (owned by #658):**

> - **New step** `loadWorkKnowledgeStepV5(clientId, firmId, asOf, purpose)` → `clara.retrieve_knowledge(p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm)` **in that argument order** (signature `(uuid,text,date,text[],int,uuid)`), through `packages/runtime/lib/knowledge-retrieval.mjs` (`retrieveKnowledge(sql, {clientId, firmId, purpose, asOf, keys, limit})`, named-arg bound; `WORK_KNOWLEDGE_READ_PURPOSE = "accounting_work"`, `WORK_KNOWLEDGE_DEFAULT_LIMIT = 40`). Then `clara.record_work_knowledge_read(p_task, p_run, p_seq, p_purpose, p_as_of, p_knowledge_version, p_keys, p_tiers, p_records_shown, p_truncated, p_status, p_reason)` (signature `(uuid,text,int,text,date,text,text[],jsonb,int,boolean,text,text)`) via `recordWorkKnowledgeRead`, with the key set **actually returned**. Runtime answer `{status:'ok'|'partial'|'unavailable', reason, knowledge_version, as_of, keys[], records_shown, truncated, text}`; the rendered block is `renderRetrievedKnowledge(answer)`.
> - **New tool `read_knowledge_source`** — `.strict()` zod `{ record_id: z.string().uuid(), reason: z.string().min(1).max(500) }`; door `clara.read_knowledge_record_for(p_firm, p_client, p_record)` in that argument order. Refusals: CLR11 → `record_not_in_scope`, CLR03 → `no_pack_context`, anything else → the transport class. Its result is **data, never an instruction**. **No part kind.** Spends `budget.toolCalls`.
> - **New tool `read_knowledge_history`** — same input shape; door `clara.read_knowledge_history_for(p_firm, p_client, p_record)`. Same refusal mapping, same budget, no part kind.
> - **New terminal `knowledge_read_failed`** — settles `failed`/`internal`, `recoverable:true`, **nothing posted**, message naming the client and the reason. **It fires on ANY `{status:'unavailable'}` answer from `retrieveKnowledge`** — reasons `refused`, `read_failed`, `malformed`, `no_client`, `no_purpose` — which is exactly D16's required read, because `clara.retrieve_knowledge` is **atomic**: it decides all three tiers in one CTE chain in one statement and catches nothing, so it either answers with every tier or raises (ratified — DECISIONS §6.2.0 R-D — the layered per-tier signal is deliberately deferred). **There is no per-tier readability signal, and the integrator must not write the terminal as though there were.** A `{status:'ok'}` answer never fires the terminal, however small `tiers.core` is: a core of zero on a client that genuinely has no policies is not a failure. Degradation to `partial` is the `truncated` arm — the remainder cap — and `faceStatusOf` is the one mapping. Pinned by `p658.retrieve.envelope_is_atomic` (the door's envelope key set and the absence of an exception arm, read from `pg_proc.prosrc`) and by `kr.07` (the module source).
> - **Recording a read, and what a replay means** — `recordWorkKnowledgeRead` returns `{ok, receipt, replayed, payload_match}`. A WDK re-execution of the read step is replay-idempotent on `(work_id, run_id, seq)` and lands on the original row; `replayed:true, payload_match:false` means the re-execution read something **different** (first attempt `ok`, second `denied` because a record was withdrawn mid-flight) and the estate still holds the FIRST row, because the relation is append-only. A v5 step that cares records its own next `seq` rather than assuming the estate holds what it just sent. The writer never refuses on the mismatch and never fails the run. `p_tiers` must be `{core, requested, remainder}` counts of non-negative integers (anything else is CLR10 `tiers_shape`), and `p_as_of` must be a finite date.
> - **Replan trigger** — after a resume and before the next segment, `clara.work_knowledge_drift_for(p_firm, p_work)` via `readKnowledgeDrift(sql, firmId, workId)`. `relevant:true` spends **one existing** `budget.replans` and re-enters the segment with a stated note; `relevant:false` continues untouched; **`relevant:null` (`observed_from:'trace'`) is surfaced, never treated as `false`**. **Budgets do not move** (`claraWork.v4.bundle.ts:39-45`; replans stays 2). The drift scan applies the same per-applicability shadow the read applies (fix round 1, A2) — a firm default shadowed for a client can no longer be reported as that client's news, while a withdrawal (a revision at a higher version) still surfaces correctly.
> - **New capability ids** `accounting_work.retrieve_knowledge` and `accounting_work.inspect_knowledge_source`, both `modelBound: true`, from `lib/capability-registry-v2.mjs` (`CAPABILITY_REGISTRY_VERSION_V2 = "clara-capability-registry/v2"`) — never an edit to the frozen v1.
> - **Bundle `clara-work/v5`**, digest covering **each tool's JSON schema and its declared dependencies**, not `tools:{id,names}` (ARCHITECTURE:435-445). A cell must fail when a tool's schema changes and its name does not.
> - Registry: repoint `claraWork` to v5; **keep v1…v4 exported and in `workflowBodies`/`WORKFLOW_BODY_IDS`** or the stranded-body gate refuses World startup database-wide.

**(B) `chatTurn_v21` — conditional chat-lane stanza (the integrator may reduce this to contract-only and must say so):**

> A SIBLING step beside the frozen `loadContextStepV10`, which stays **byte-untouched** and keeps being called for the history read: `loadClientBasisStepV21(clientId, firmId, createdBy, asOf)` returning `{status, reason, text}` that **never collapses to null**, repointing the chat-turn knowledge preload from the recency dump to `clara.retrieve_knowledge(p_client, p_purpose, p_as_of, p_keys, p_limit, p_firm)` with `p_purpose='chat_turn'`, and surfacing a read failure as a **typed status** rather than `catch { contextPack = null }` (`chatTurn.v10.impl.ts:136`). **`clara.get_context_pack` is not recut and not repointed — not one byte.** The five frozen `knowledge.mjs` reasons map onto the four face words through `faceStatusOf`. Part kind: **none registered by me**; `knowledge_unavailable` only if the integrator accepts the finding that no existing part kind fits (measured: `knowledge_receipt` has no status field; `refusal` has no version/as-of/key-set/partial distinction). Engine stamp `llm-openai:<modelId>:chatturn-v21`.

**(C) Rider #847 — writer-side trace bounds (owned by #658's worker):**

> `packages/runtime/lib/work-trace-bounds.mjs` (a v5 sibling the v5 body imports; **`lib/work-trace.mjs` is never edited**) mirrors 0210's two door-side bounds on the writer side: `boundedRevisionNumber(v)` — `abs(v) < TRACE_NUMBER_MAX_ABS (1e12)` and `scale(v) <= TRACE_NUMBER_MAX_SCALE (6)`; `boundedRunId(v)` — `^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$` **or** no run of 13+ digits. Call them in `observedRevisions`' caller inside the v5 impl, before `traceSafely`. **The writer's clause stays NO TIGHTER than the door's** — a writer stricter than the door loses rows the database would have accepted, and `traceSafely` swallows the loss. Sources: the ticket, `ARCHITECTURE:373-386`, `0210:32-41`, `work-trace.mjs:293-303`.

**(D) Rider #882(a) — CLR40 classification (owned by #658's worker):**

> ONE row in `claraWork.v5.errors.ts`: `(CLR40, fa_cost_adjustment_deferred) → refusal`, carrying the door's own human remedy verbatim — "reverse the acquisition entry and re-book it at the corrected cost" (`0041:2727-2731`). The other two CLR40 reasons — `fa_k_gl_balance_on_enrolled` (`0041:2717`) and `fa_belt_unregistered_movement` (`0041:2733`) — are **not** added by this stanza; named here so the integrator does not widen it. A cell must prove such a Work settles as a **refusal**, not as the transport class. Keyed on `(code, reason)` like `claraWork.v1.errors.ts`; adjacency is the FA belt, **not** the CLR38 depreciation family.

*Source for all four #658 stanzas: 658-final.md "Successor contract"; the atomicity/no-core-signal
clause of (A) reflects the fix round 1 correction (removal of the dead `core_readable` contract) and
DECISIONS §6.2.0 R-D. Source: 658-fixround-1.md A1/F1/S1.*

### Contract-only (nothing registered, nothing cut this wave)

**#636 — `open_intake_batch`:**

> tool `open_intake_batch` · `.strict()` zod `{ label: string().min(1).max(120), origin: enum(["chat"]),
> session_id: string().uuid() }` · door `clara.open_intake_batch(p_actor, p_origin, p_label, p_session,
> p_op_key)` in that argument order · refusals CLR04 `insufficient_role` → "needs a bookkeeper",
> CLR18 `daily_limit` → the operator remedy verbatim, CLR10 `invalid_label` → field error ·
> part kind `intake_batch_accepted` carrying `{ batch_id, label, admitted, waiting }` and NOTHING
> derived · `WORK_ACCEPTED_PURPOSES` needs **no** widening (children are `journal_entry` Works).

The part kind is contract-only: nothing is registered, `lib/parts/*` and `PartRenderer.tsx` are
untouched, parts-parity is green. #642 and #664 own that entrance. (636-final.md)

**#656 — `read_opening_source`:**

> - **Class**: `chatTurn` → a future `chatTurn_vN`. **Not this wave's v21** — #656 appears in no row of DECISIONS §1.2.
> - **Tool** `read_opening_source`, `.strict()` zod input `{ client_id: uuid, seed_id: uuid }` — **no amounts, no account codes, no document id from the model**: the seed already binds its tie document, and letting a model name either would put a figure in the model's hands.
> - **Door call**: the tool calls the existing route core `parseOpeningTargets(client, { seedId, firmId, reassert })` on a `clara_runtime` connection, **in that argument order**. It must **not** call `clara.record_opening_targets_parsed` directly.
> - **Refusal mapping**: 404 → `not_found`; 409 `registry_not_open` → "this opening basis is not open"; 409 `refused` + the CLR31 reason **verbatim**; 409 `source_reread_since_parse` → "this document has been read again since the basis was parsed" (measured live on the real path in fix round 1, A5); 422 → the named unparseable reason **verbatim with its counts and failing region ids**, including the chart-gap reason and its `unmapped_accounts` array.
> - **Part kind**: reuse the existing typed receipt part; **no new wire kind.**
> - **Prompt stanza**: Clara may ask to read an opening source a human has already attached to an opening basis; she may never state an opening figure that did not come back from the door; she surfaces a refusal rather than a partial reading.

(656-final.md)

**#660 — `read_client_financial_pack` (follow-up text only, no stanza authored):**

> `{client_id, as_of, period:'mtd'|'month', month}` over `clara.get_client_financial_pack(p_client, p_as_of, p_month)`, refusals CLR04 / CLR11 / CLR10 `cash_set_unpublished`, reusing an existing typed read part. No cut this wave; the door is ready for it.

(660-final.md, follow-up #3)

### No successor contract this wave

#635 ("no cut needed" — three governed reads and one existing governed write; no Workflow, no
Work-lane tool), #642 ("NONE, positively" — live tool state is a web fold from the documented
`ai@7.0.77` chunk vocabulary, not a version cut), #657 ("none" — the pack rides through as
`Record<string, unknown>`, no frozen file touched), #659 ("none" — the three compliance doors refuse
an agent identity by construction, which is a thing the database forbids, not a deferred tool).

---

## 5 · Per-ticket evidence summary

Every AC's disposition (done / partial / verify-only / descoped), with residuals **named**, plus test
counts, typecheck/lint and hosted-evidence status, using each ticket's **final, post-fix-round,
post-recheck** state. **Typecheck and lint are green on every one of the ten branches on every
re-run reported** (fixround, review and recheck alike) — stated once here rather than repeated per row.
**Hosted evidence is pending on all ten tickets** — nothing in this wave has been released; every
number below is local.

### #635 — firm settings shows the firm's real legal, commercial and usage state

| AC / row | Disposition | Residual named |
|---|---|---|
| AC1 (rank-shaped routing) | verify-only (routing/roster) + done (commercial half) | none — `tree.ts`/`components/admin/*` untouched by design |
| AC2 (versioned attributable legal/plan/payment/invoice/usage) | done | — |
| AC3 (absence/failure/empty explained) | done † | — |
| AC4 (rank separation, immediate revocation) | done, both holes closed † | `firm_document_limits` has no human writer (follow-up) |
| AC5 (plan/history/usage/keyboard/redirects/Settings) | partial | redirects verify-only (closed by #614); rest done |
| AC6 (state ladder, 320px/200%/SR/URL/drafts) | done † | no draft exists on this page (stated, not omitted) |
| AC7 (production-facing, real roles) | done | no Workflow leg — this journey invokes none (stated as a finding) |
| CB-AE2E-012/H-18/H-19, C-01/C-56, F-02, C81.5 | descoped (authority) | — |
| C-02 | done (the surface) | — |
| C-09/C77.8 | verify-only | outside this boundary (owned by `stripeRoutes.ts`) |
| C55.21 | done (discovery = the recut) | — |
| C83.10 | verify-only (duplicate of C55.21) | — |
| C88.2 | verify-only ("do not drop here") | — |

**Tests/counts (post fix round 1, `a9d2d964`):** DB battery 24/24; combined with `operation-census` +
`rig-isolation` + `f-a9-usage-reshape` + `f-a9-pr-1b` + `checkout-gate-c3` → 162/161/1 skip (T19);
whole `apps/web` suite 4216/4214/0 fail/2 skip (recheck independently measured 4216/4213/1 fail — the
`use-clara-thread-stop.test.ts` flake, non-deterministic, pre-existing); e2e triple (firm-commercial +
firm-navigation + shell-migration) 49/49 both before and after the fix round. **Admin rank is not
walked in the browser** (named residual — `serve-built.mjs` has no rank-2 persona; proven at DB level
instead). Sources: 635-final.md, 635-fixround-1.md, 635-recheck-1.json.

### #636 — the durable intake batch

**10 done · 4 verify-only · 0 partial · 0 descoped** (the ticket's own tally, unchanged by the fix
round). AC1 done · AC2 done (fix round corrected a defect: "failed 35" was 31 members that had
actually posted, now excluded) · AC3 done (gained `.failed_excludes_settled`, `cancel_blocked`,
`pending_members`) · AC4 done (fix round closed a blocker: a batch stopped before admission used to
report cancelled and stop nothing) · AC5 done (batch-origin row now renders in any Work state, not
only posted) · AC6 done · AC7 done · UI-30/UI-31 verify-only, re-measured (the firm-leaf mount now
actually reaches Cancel — was inverted) · C51.1 done · C51.4 done (fix round closed a second blocker:
a canceller who loses authority mid-flight now surfaces `cancel_blocked` instead of silently never
finishing) · C51.7 verify-only, both findings carried (D4: not fixed, follow-up filed) · C77.1
verify-only · C83.X2 done (discovery).

**Tests/counts (post fix round 2, `879125fd`):** `intake-batch.test.mjs` 31/31; `intake-batch-unit`
13/13; `operation-census` 10/10; `rig-isolation` 19/1 fail(T10b, #866, post-World-bootstrap,
pre-existing)/1 skip; five web unit files 42/42; whole `apps/web` suite 4180/4178/0 fail/2 skip; World
leg (`intake-batch-e2e.mjs`, on a throwaway `clara_636_world` clone) ALL LEGS PASSED, N=100, facets
`{admitted 90, settled 90, waiting 4, unassigned 4, failed 7}` (was `failed 35` before the AC2 fix);
Playwright 13/13. Sources: 636-final.md, 636-fixround-1.md (incl. Fix round 2), 636-recheck-1.json.

### #642 — chat-stream admission, live tool state, transcript scroll and revocation

AC1 done · AC2 behaviour done, **component migration is the named residual** (D6 fallback: `message`/
`bubble`/`marker`/`avatar` install clean, `attachment`/`message-scroller` overwrite the protected
`button.tsx`) · AC3 done (fix round closed a blocker: the address needed the conversation's position,
or every repeated utterance — "yes", "ok" — collided forever with the first) · AC4 done, **`queued`
is the named residual** (no admission event this wave) · AC5 done (fix round closed the revoked-at-
attach hole: a 403/404 at reattach now delivers the same `revoked` event the mid-stream arm delivers,
instead of eight rounds of "Reconnecting…") · AC6/AC7 partial, owed cells built (320px/200%/axe; an
`aria-describedby` naming the reason as well as the hint, after fix round) · AC8 done locally, hosted
pending. Historical: UI-02 → residual (AC2); UI-32 built; C-45 corrected.

**Tests/counts (post fix round 2, `566665f0`):** whole `apps/web` suite 4210/4208/0 fail/2 skip (run
3 of 3 — runs 1-2 hit host-contention crashes in files #642 never touches, all pass in isolation);
`rig-runtime-lifecycle` 12/12; `chat-turn-replay-db` 2/2; `chat-turn-v20-e2e` PASS (4 legs);
Playwright `chat-parity` 11/11 (re-run twice after the fix round: 46.8s, 58.6s). **NO MIGRATION** at
any point — the door's idempotency arm already existed; `packages/db` diff is one test file only.
`use-clara-thread-stop.test.ts` cell 22 remains an unattributed, load-sensitive flake (26/26 in
isolation, three times). Sources: 642-final.md, 642-fixround-1.md (incl. Fix round 2),
642-recheck-1.json.

### #651 — fixed-asset classification, locked-period wall and depreciation authority window

AC1 done · AC2 done (accepted-treatment "move the period" clause descoped, D9) · AC3 verify-only + two
holes closed by the fix round (retiring a never-signed authority; the write-once floor/ref freeze) ·
AC4 done (shared-question half named residual) · AC5 done except (ii) descoped (D7/I1: no shared
scheduler) and (iv) contract-only (chat tool written, not cut) — fix round added §B.2 (write-once
wall) and §B.3 (retire door stamps the window floor) · AC6 done · AC7 done — **depreciation invokes
no Workflow** (stated as a finding, not a gap). C86.2 verify-only, re-derived. **M1 measured GREEN**
— the validator's key set widened with the frozen mirror unmoved, so `revise_fixed_asset_particulars`
keeps its 5-arg signature.

**Tests/counts (post fix round 1, `9d96ad45`):** `depreciation-history.test.mjs` 19/19; `operation-
census` 10/10; `rig-isolation` 20/1 skip; whole x41 family 105/103/1 fail (`x41.s4`, dated as
pre-existing and 30 minutes older than 0227's `applied_at`)/1 skip; runtime (`depreciation-run-unit` +
`reconcile-fa-unit` + `reconcile-fa`) 26/26; `apps/web` FA suite 77/77; whole `apps/web` suite
4168/4166/0 fail/2 skip (recheck; fix round's own first run hit an unrelated census pin, resolved);
Playwright `depreciation-walk` 4/4. **0227 has never applied end to end from a clean 0224 on any
cluster** (stated repeatedly as unverified — the integrator's from-scratch chain is this branch's real
gate; three ledger-checksum repairs were needed across the fix round). Sources: 651-final.md,
651-fixround-1.md, 651-recheck-1.json.

### #655 — trade invoices, the sixth posting-core copy, and the due-date basis

AC1 done · AC2 done · AC3 **partial (as briefed)** — direct UI + document-cited built; upload-lane
equivalence proven; **chat arm is contract-delivered, closes at the v21 cut** · AC4 **partial** —
duplicate/lost/restart closed to ONE receipt (fix round closed a race blocker: a raced pair under one
key used to answer the loser about the winner's invoice); **park half remains a residual** (shared
World harness has no `ask_question` scripted model) · AC5 done (fix round rendered the dead
`total` key and fixed a missing `domain.ap`/`domain.ar` message key that made C08.5's noun render as
its own raw key path) · AC6 done (fix round 2, R-A: terms anchor on document date) · AC7 **partial,
boundary stated** — the Work lane and the legacy coding lane are *known* to disagree on the
counterparty-terms due-date anchor after R-A, pinned by name · AC8-AC11 done · AC12 done (fix round
fixed a money-formatting defect: the Work page rendered raw sen, "106000", instead of "RM 1,060.00")
· AC13 done. C08.5 done — **the first cut's evidence was wrong** (corrected in fix round 1). C08.8
discovery done, recorded verbatim: the Work-lane and upload-lane posting paths do **not** reach the
same operation. CB-AE2E-013 verify-only.

**Ratified scope (DECISIONS §6.2.1):** 0225 recuts **three** bodies, not one —
`_record_journal_entry_core` (sixth copy), `_subledger_classify_entry` (new LADDER 3T),
`_tf_subledger_item_belt` (second lawful source). `_tf_subledger_entry_belt` is **not** recut — it is
a non-regression pin.

**Tests/counts (post fix round 2, `0911f7b8`):** DB battery 29/29 (0 fail); runtime unit 23/23; World
leg (`trade-invoice-e2e.mjs`) PASS, all 5 legs, leg 5 now reading the R-A due date; Playwright 12/12;
whole `apps/web` suite 4180/4178/0 fail/2 skip; `x37-wave-c-a-subledger` 39/39 and
`fixed-asset-acquisition` 21/21 (re-run green after the recut widening); `rig-isolation` 1 fail (T10b,
#866, pre-existing). **A same-document-number duplicate is NOT probed** (measured and named, not
silent — `p655.duplicate.same_reference_is_NOT_probed`). **A 0001→0225 from-scratch chain remains
unverified** (0154's role census forbids a second chain on this cluster; the edited file was proven to
re-apply end to end onto a rig re-based to frontier 219 instead). Sources: 655-final.md,
655-fixround-1.md (incl. Fix round 2), 655-recheck-1.json (`needs_second_round` before DECISIONS
§6.2.1 landed), 655-recheck-2.json (`accept`).

### #656 — opening basis with a document source, provenance, and the registry republication

AC1 done, narrowed (business_operation level held at `stored_only`, ratified) · AC2 done · AC3
verify-only, re-measured · AC4 **partial, corrected in the fix round** — the all-or-nothing refusal
used to be computed and discarded (a refused trial balance was indistinguishable from a document that
was never one); now the refusal rides the extraction envelope end to end · AC5 partial + 1 descoped
(authority) — provenance/totals/discrepancy done; **Work-and-receipt descoped** (residual R1, owner
question filed) · AC6 **done in the fix round** — the browser walk went from 1 passed/6 `test.fixme`
to 7/7 live after four real app/fixture defects and one spec defect were found and fixed · AC7 done,
the named hole closed (real Postgres, real roles, real writer end to end) · CB-AE2E-004 verify-only ·
C-25 verify-only, re-measured · C-30 done (the ticket's spine — the producer now has a caller) · C-39
partial, deliberately (document flow = this slice; "plus Clara" = the contract) · COA-before-cancelled
verify-only, no repair · C08.4 done · C08.7 verify-only + follow-up (registry names the ownerless
`/api/seeding/prepare` entrance) · C33.9 verify-only (discovery, not reproduced locally: 0 rows) ·
C88.1 verify-only.

**Tests/counts (post fix round, `0a86d5ab`):** DB battery (opening + registry) 31/31; runtime opening
+ egress batteries 84/84; World leg PASS, 7 stages; Playwright walk 7/7 (was 1/7 + 6 fixme); five web
batteries 32/32; `e2e-fixture-ownership` 18/18; whole `apps/web` suite 4168/4166/0 fail/2 skip
(recheck — one better than the fix round's own 1-fail count, the known `use-clara-thread-stop` flake
did not fire that run). **Named residuals:** R1 (Work/receipt descoped), R2 (period-wall message names
the fiscal year, not the opening basis), R3 (activity ladder silent about the opening lane, #861), R4
(a re-read document is a re-parsing dead end), R5 ("unmapped" is structurally unreachable on a
document-sourced basis — the coverage footer no longer prints a false zero for it, fix round A10), R6
(#854's two-session race unmeasured, no new exposure claimed), R7 (opening dialogs other than Create
keep pre-`Field` composition). Sources: 656-final.md, 656-fixround-1.md (incl. Fix round 2),
656-recheck-1.json.

### #657 — match bank evidence to an already-approved booking

AC1 done · AC2 verify-only, re-measured · AC3 done (the no-new-cash proof, exported for #666/#667) ·
AC4 done (fix round closed a blocker: `match → unmatch → resubmit-identical` used to silently replay
the dead match's receipt; the op key now folds each selected entry's match-history generation,
ratified as a D15 amendment) · AC5 partial — **region citation is a named residual** (0038's lane
contract states per-line PDF-region citations are not carried) · AC6 done, **page-level citation is
the same residual** · AC7 done (fix round closed a major spec-drift: `candidate_basis` used to
describe a strictly larger population than the offered candidates) · AC8 done · AC9 partial + named
residual (B3's write path descoped) · AC10 done · AC11 partial (one-cent difference as a difference;
no-duplicate-cash = AC3; keyboard/focus done) · AC12 done · AC13 partial — **two measured residuals**:
Table/Field/Alert used, **InputGroup is NOT used** (fix round corrected a false claim in the first
report) · AC14 done (fix round corrected the axe-scan count: 6 total, 2 inside leg 6, not "4") · AC15
partial (no World leg owed). H-12 verify-only · H-14 descoped (#675) · C-40 done (matching half) ·
C33.7 verify-only + 2 residuals · C33.8 done (the smaller half — intent-hash key; four key schemas
not unified).

**Tests/counts (post fix round 1, `43cba443`):** `bank-line-existing-booking.test.mjs` 11/11 (fix
round added `rematch-needs-a-new-key`); touched suites (`operation-census`+`rig-isolation`+`x38`+
`f-a3-pr3-chatturn-v14-bank-parity`+`f-a3-pr3-doors`) 89/88/1 skip (fix round closed a blocker here
too: a pre-existing, unrelated test file still called `_agent_verify_inputs_digest` with its
pre-0226 string-argument shape); runtime `g1-wake-bank-e2e` 1/1; whole `apps/web` suite
4160/4157/1 fail (`use-clara-thread-stop`, confirmed flaky in isolation too — 1 in 4 — not purely a
whole-suite artifact, corrected in Fix round 2)/2 skip; Playwright `bank-match` 6/6. **The thirteen
`_agent_*_core` bodies all carry NEW post-image shas** after this migration, now pinned and asserted
in the tail itself, not merely claimed in a comment (fix round closed a false-evidence-pointer
finding). Sources: 657-final.md, 657-fixround-1.md (incl. Fix round 2), 657-recheck-1.json.

### #658 — knowledge retrieval, the recorded read-set and the drift detector

AC1 **partial → DB done, Work-lane behaviour closes at the v5 cut** · AC2 **partial → relation +
drift done; replan closes at the cut** (fix round corrected the drift scan to apply the same
per-applicability shadow the read applies) · AC3 **partial** — status vocabulary and faces done; the
terminal is contract-only, and **the contract is now honest** after the fix round removed a dead
`core_readable`/`core_unreadable` branch the real door can never produce (ratified as deferred,
DECISIONS §6.2.0 R-D) · AC4 verify-only, re-measured · AC5 done · AC6 done on the surfaces owned · AC7
done. C-36 partial carry · C-84 verify-only, closed · C-87 verify-only, partly consumed (12 Mobbin
frames; motion/video remainder outstanding) · C34.3 done · C55.6 tax specifics descoped (authority,
PRD:125), general rule contract-only · C55.17 done · C83.14 duplicate, closes with C55.17.

**Tests/counts (post fix round 1, `141103cb`):** DB battery 28/28 (0 fail — fix round added 5 cells,
including a hardening wall on `tiers` and a `p_as_of` finiteness check); runtime (`knowledge-
retrieval`+`work-trace-bounds`+`knowledge-lib`+`clara-work-v4`) 69/69; World leg (`work-knowledge-
e2e.mjs`) exit 0, SIGKILL replay lands on its own id; whole `apps/web` suite 4171/4169/0 fail/2 skip;
new `lib/work/knowledge.test.ts` (the in-flight coalescer fixing a duplicate-read finding) 7/7;
Playwright `knowledge` triple 40/41 pre-recheck (one browser crash under host contention, unrelated
spec) → 41/41 on recheck's re-run. **Non-goals held and stated in code**: captures, corrects, promotes
nothing; mints no knowledge key or side table; widens no purpose or part-kind list. Sources:
658-final.md, 658-fixround-1.md, 658-recheck-1.json.

### #659 — firm home: portfolio, needs-you and compliance-watch disposition

AC1 done · AC2 done, **with ONE destination withdrawn** — the `work_question` deep link is
un-buildable today (the queue row publishes `agent_tasks.task_id`, never `accounting_work.work_id`;
ratified as not-this-wave, DECISIONS §6.2.0 R-E) and was withdrawn to its pre-#659 fall-through; the
`recent_success` drilldown now carries no dated window (fix round corrected a count-vs-list population
mismatch) · AC3 done · AC4 done · AC5 done · AC6 done (acts verify-only; the receipt now resolves the
actor to a name through the shared roster, not a raw uuid — fix round A7) · AC7 **partial** — two
clauses (invalid/saving, cancelled/recovery) have **no referent on a link-only surface** (reported, not
invented, D18.d); focus return was genuinely unmet before the fix round (the original assertion could
not fail — a hard-coded `.toContain("3")`) and is now built (`portfolio-focus-return.ts`) · AC8 done.
UI-04 done (status chip corrected to name `@/components/parts/PartBadge`, matching four sibling
Firm-altitude components, not `components/ui/badge.tsx`) · UI-05/UI-12/F-06 verify-only · UI-35/C88.10
done.

**Tests/counts (post fix round, `cc19cf18`):** DB battery 23/23 (17+6, gained
`p659.links.work_question_row_cannot_address_its_work` and a real call-count probe); `operation-
census`+`rig-isolation` 30/1 skip; whole `apps/web` suite 4204/4201/1 fail (`use-clara-thread-stop`,
confirmed non-deterministic — 2 of 5 isolated runs red, zero diff against `origin/main`)/2 skip;
Playwright `home-board` 15/15. **Named residuals:** `lib/firm/timeline.ts`/`clara.list_firm_timeline`
have no production consumer (not deleted, scope discipline); two clauses on the link-only surface have
no referent (D18.d); #903's `useReviewQueue` polish untouched. Sources: 659-final.md,
659-fixround-1.md, 659-recheck-1.json.

### #660 — client-home cash and profit dashboard

AC1-AC3 done · AC4 **done, corrected in the fix round** — it was **wrong for a complete historic
month** (the elapsed-day MTD cap was applied unconditionally, silently truncating a full prior month
whenever it was shorter than its predecessor; five of twelve month-pairs affected every year) and is
now two rules · AC5 **done, corrected in the fix round** — the drilldown was **dead against the real
door** (the door emitted `profit_composition` at top level; the parser read `profit.composition`) and
is now proven end to end against a real door payload, plus an account-level truncation disclosure
(`composition_total`/`composition_truncated`) that did not exist before · AC6 partial (**named
residual**: commit-event invalidation has no bus event to subscribe to; disclosed on the face) · AC7
done · AC8 done (this AC is database-only by measurement — 0232 writes no runtime module) · UI-23
verify-only + done for the money half (shared with #669; neither ticket may claim the row closed
alone).

**Two defects the fix round found in its own code, beyond the eight review findings it fixed:** a
fabricated `cash_set_version_changed_in_series` reason firing on a client whose set never changed
(only ever published once); `opening_carry_down_deferred` firing where the estate's own precedence
rule already resolves it. **A raced concurrent publish's loser used to surface a raw 23505**, then (fix
round 1) a well-formed but *wrong* typed refusal under a narrow EvalPlanQual race window (recheck-1's
own new finding, NF-1), **fixed for real in fix round 2**: the loser is now told `CLR11
cash_set_version_raced`, proven with a genuine two-real-session concurrency cell.

**Tests/counts (post fix round 2, `c14bd953`):** DB battery `client-financial-pack.test.mjs` 35/35
(0 fail); combined with `operation-census`+`rig-isolation` 66/65/1 skip; whole `apps/web` suite
(measured in recheck-1, not re-run in round 2) 4195/4192/1 fail (`use-clara-thread-stop`, confirmed
pre-existing and non-deterministic — fix round 1's own "fully green" claim was one lucky run, corrected
in round 2's NF-2)/2 skip; Playwright `home-board-walk` 21/21. **Named residual:** `cash.composition`
rides the wire and is hydrated but nothing renders it yet (#669/#670 are its natural consumers).
`ui:add` cannot invoke the shadcn CLI on Windows at all (follow-up filed; the guard's *decision* logic
was exercised directly instead). Sources: 660-final.md, 660-fixround-1.md (incl. Fix round 2),
660-recheck-1.json, 660-recheck-2.json.

---

## 6 · CONTEXT.md terms added per lane (for the integrator's union)

Ratified terms per `DECISIONS.md` §3.1, plus any further refinement each final report's own Docs
section records (a refinement lands in CONTEXT.md but was not separately named in §3.1's ratified
list). The integrator unions every addition at its sorted position; §3.1 already resolves the two
cross-lane special cases (#658 may extend the *existing* "Knowledge pack" entry's `_Avoid_` list; every
other addition is a refinement the integrator unions normally).

| Ticket | Ratified terms (DECISIONS §3.1) | Further refinements this wave |
|---|---|---|
| #635 | Firm legal standing; Billing plan (unpriced until `amounts_ruled`); Model usage summary (tokens/calls; USD is the provider's price, never book money) | none beyond the three |
| #636 | Intake batch; Batch member; Member dependency (`awaiting_fact`/`awaiting_attribution`/`awaiting_capacity`) | none beyond the three |
| #642 | Turn key (content-addressed intent identity); Conversation scope (firm/client band beside the composer); Tool outcome (the four live states + refused) | Turn key's definition extended in fix round 1 to add "where in the conversation the instruction was given" plus an `_Avoid_` clause naming the defect it closed |
| #651 | Depreciation change class; Depreciation authority window | Depreciation run preview — **a refinement, not a ratified term** (stated explicitly in the final report) |
| #655 | Trade invoice (unqualified "invoice" = a client's accounting document; the firm's own billing document does not exist); Due-date basis (stated / counterparty_terms / absent, and the boundary that `lines` are journal basis lines, never extracted invoice line items, #782) | Amends two **existing** entries: Open item (`:407`) and Control account (`:419`); fix round 2 states the R-A anchor inside the Due-date basis entry itself (document date in the definition, posting date named in its `_Avoid_`) |
| #656 | Opening basis; Opening source; Opening target; Provenance (document-sourced vs. keyed) | none beyond the four — explicitly "no fifth, no edit to #658's knowledge terms" |
| #657 | Settlement candidate row (derived, stores nothing, offers candidates and never chooses, self-clearing — the shape #938/#947/#949 inherit; #657 is the first instance, per DECISIONS §6.2.1's #657 ruling); Match basis (deterministic evidence, never a score) | +4 refinements; the existing Settlement allocation entry is extended (657-final.md Docs section) |
| #658 | Knowledge read status (ok/partial/unknown/denied — the four live values every face uses); Knowledge read-set | May additionally extend the **existing** Knowledge pack entry's `_Avoid_` list with two clauses — pre-approved in DECISIONS §3.1 so the ten-lane union does not read it as an unratified edit |
| #659 | Firm portfolio pack (counts, never money) | Three further terms landed in the same commit beyond the one §3.1 names: Portfolio coverage, Attention source freshness, Watch disposition (confirmed in 659-review-standards.json's `checks_confirmed_clean`) |
| #660 | Cash account set; Book cash (never a statement balance) | Three further terms beyond the two ratified: Period profit, Source watermark, Definition version (five total, append-only, per 660-final.md's Docs section) |

