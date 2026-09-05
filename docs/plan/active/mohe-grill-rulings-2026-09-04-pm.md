# The 2026-09-04 repair-session rulings — consent at the firm level, attestations and maker-checker abolished, the session's lanes (裁-186…197)

> **The ELEVENTH ledger**, continuing [`mohe-grill-rulings-2026-09-04.md`](mohe-grill-rulings-2026-09-04.md)
> (裁-151…185) at that file's ceiling — it stood at 480 lines, and one ruling entry would have put the
> next writer against the 500-line PreToolUse hook. **The chain:** `-08-31` → `-09-01` → `-09-01-pm` →
> `-09-02` → `-09-02-pm` → `-09-03` → `-09-04` → **this file, the newest.**
>
> **How the session opened.** The owner opened the repair session at ≈09:00 MYT on 2026-09-04 with
> three sources and one instruction — 「我要在这个session 去修并处理这些bugs … 去吧」: **(1)** his own
> UIUX flaws file (`C:\Users\zhant\Desktop\MY OWN UIUX Flaws.txt`, a workstation file, its items
> carried into the register this session builds); **(2)** GitHub issue **#541**, the authenticated
> production e2e audit of 2026-09-04 (36 defects `CB-AE2E-001…036`, NO-GO for public beta, evidence
> commit `3aeef952`); **(3)** the shared artifact "Clara Beta Handover", which is a verbatim render of
> [`beta-handover-2026-09-04.md`](beta-handover-2026-09-04.md) and its parts 2 and 3 — read through a
> browser tab and confirmed as such at ≈09:10, so the repo copy is the source. The five rulings below
> were grilled through `AskUserQuestion`, one briefing per question in plain language, the
> recommendation first and the cost stated, before any build lane opened.
>
> **Two went AGAINST the recommendation** — 186 and 187's RBAC matrix — each with its dissent filed
> once here and not relitigated. **ADR-0078** minutes 186 and 187 because both contradict standing
> ADR text outright and permanently (裁-140's own test for minting a new ADR).

---

### 裁-186 — client AI consent is a FIRM-level declaration made once at the DPA stage; every client of the firm is consented automatically (owner, 2026-09-04 ≈09:15 MYT, `AskUserQuestion` option (b) of 3, AGAINST the recommendation)

**Owner's words, verbatim (the flaws file):** 「(UIUX 全部集中在DPA那个阶段一次过处理, firm同意后, 所有client
在firm 的级数下全部认同).」 **His answer to the question:** (b).

**The briefing as put.** The coding lane refuses `no_consent` until a live `clara.client_egress_consents`
row exists for the client; the path to one is (1) upload the client's authorization letter, (2) classify it
as consent evidence (a web button exists), (3) `grant_client_egress` (**no web surface**), (4)
`activate_client_egress_purpose` per purpose (none either) — handover row **H-18**, 裁-182. MIA By-Law
R114.3(b) requires the CLIENT's written authorization before client data goes to an external party; the DPA
is the firm↔Clara contract and cannot stand in for it. **The options:** **(a) — recommended** — collect the
letter (or a "held, will upload" tick) inside the onboarding interview and grant + activate on commit: one
act per client, no dark door, no wall weakened, ≈2 lane-units; **(b)** a firm-level declaration at the DPA
stage that consents every client automatically — smoothest UX, but the per-client evidence rung of the egress
wall is relaxed, the exposure sits with the firm, and the lawyer pass will likely reopen it; **(c)** both,
not recommended. A concrete failure of (b) was stated: a client who never signed a letter has invoices
processed by the AI provider, complains, and the firm holds only its own tick-box declaration.

**Ruled: (b).** Executed as the sharpened variant of the owner's choice, so the audit trail survives:

1. The DPA page gains **one firm-level declaration** — the firm holds, or will hold before processing,
   each client's written authorization for AI processing — signed once with the DPA (a receipt row, its
   own version and hash, appended like the DPA's).
2. The database accepts that declaration as the **evidence** for `grant_client_egress`: a firm-level
   declaration row becomes an admissible evidence kind beside a verified per-client letter, and the
   onboarding commit's successor door **auto-mints the client's consent and activates every purpose**
   citing it. Existing consents and the per-purpose activation shape are untouched; the receipt names the
   evidence kind, so a per-client letter uploaded later is an **evidence upgrade**, never a second consent.
3. The compliance register shows every client's consent state and its evidence kind.

**Dissent, filed once.** The obligation is per client and written; a firm-level declaration is the
firm's representation, not the client's authorization, so the exposure moves to the firm and Clara now
processes on a representation it cannot verify. The declaration's wording joins the lawyer pass (裁-166),
and the lead recommends the per-client evidence rung be revisited before 上市.

**Amends:** digest laws 57 and 58 (the "specific authority" and "a grant alone does not authorize" texts —
purpose scoping SURVIVES, the per-client evidence rung is relaxed), **PRD §6 item 16(a)**, handover **H-18**'s fix shape and
裁-182's rider. **ADR-0078 decision 1.** No separate ruling file — this entry is the text of record.

### 裁-187 — every attestation CEREMONY and every maker-checker wall is ABOLISHED; basic RBAC is the only human gate; automatic receipts stay (owner, 2026-09-04 ≈09:18–09:22 MYT; permanent)

**Owner's words, verbatim**, answering the maker-checker question (which offered (a) keep the threshold
policy and disclose it — recommended, (b) a distinct approver for every manual journal):

> 我要废除所有attestation机制, 实际作用下发现没有用, 用UIUX最优的方案做, user 按什么就是什么, 不用做多余的东西and
> 废除所有marker checker 机制, 只有基本的RBAC的权限划分. 你觉得呢? 有ambigious or 不妥就 /grillme

**The lead's view, as given.** Agree on the ceremonies (the extra dialog, the typed declaration, the
tick, the second confirm — all friction) and on the walls (the RM100,000 distinct-approver threshold and
the B3 reopener≠closer wall only produce refusals in a small firm). Two things had to be settled before
it was buildable: **the RBAC matrix** (otherwise a bookkeeper drafts, approves, posts and closes alone
with the owner reading about it a week later — the failure example put), and **the automatic receipt**
(who clicked, when, and what every gate read at that moment — written by the door with zero user action,
because it is the only evidence in front of MIA, an auditor or LHDN later). Cost stated: an XL database
lane re-cutting a dozen live door bodies and dozens of test cells, plus an ADR.

**Sub-rulings, by `AskUserQuestion`:**

- **RBAC — option (b), AGAINST the recommendation (a):** **viewer** reads · **bookkeeper** uploads,
  drafts, matches, answers Clara, **and approves and posts ANY amount, own drafts included** ·
  **admin+** additionally begins, finalizes and abandons a close, approves the opening seed, and holds
  firm settings · **owner only:** members, legal signatures (DPA, terms, the 裁-186 declaration) and
  the operator-tier acts. The four-rank roster is `0002_foundation.sql:215` and `role_rank`
  (viewer 0 · bookkeeper 1 · admin 2 · owner 3) — nothing new is minted, floors move.
- **Receipts — option (a) after 「不是很清楚,解释下」 and a plain-language re-brief:** kept, fully automatic,
  zero ceremony — one row per governed click naming actor, time and the gate states it covered; visible
  only on the Activity timeline.

**Scope, by census on `main` at `877a4fd7` (what "attestation" and "maker-checker" mean in this codebase):**
`_approve_entry_core`'s `segregation_mode` / `self_approval_attestation` / `self_approved` rungs and every
`p_attestation` parameter on the drafting, allocation, settlement and bank-line cores (66 + 38 + 17 sites
across the migrations and their tests, `0015` → `0121`) · `firms.high_stakes_amount_cents`
(`0002_foundation.sql:204`) and `set_firm_high_stakes_threshold` with the Admin "Change threshold" control ·
`finalize_close(p_self_attestation)` (`0128`), `close_attestations` and `attest_close_exception` (the
drawer-2 per-item attestation, E-R2), `reopen_fiscal_year(p_attestation)` and B3's reopener≠closer wall ·
the adoption attestation (ADR-0070 §11) · the onboarding commit's attestation and the opening-seed
approval's attestation dialog · the 37 `attest`-keyed strings in `apps/web/messages/en.json` — 14 of them
the OUT-of-scope SST future-method surface (`ClientClose.futureAttestation.*`,
`FirmAdminCompliance.compliance.futureMethodStatuses.*`), leaving 23 in scope, plus 11 strings that
mention attestation only in their value.
**Flagged as OUT of scope by the lead's reading, for the owner to pull in if he disagrees:**
`sst_future_attestations` / `record_future_attestation` — a captured SST fact about a future method, not
a maker-checker ceremony.

**Executed as:** **(1)** ADR-0078 (per 裁-140 — 187 contradicts ADR-0003 law 4, ADR-0065 law 25 / E-R2,
ADR-0070 law 69, ADR-0071 law 71's reservation, PRD §2 "Segregation of duties" and §6 item 9, and
ARCHITECTURE §3.4 outright and permanently); **(2)** the frontend removes every attestation ceremony as
the UIUX lanes reach each surface — the click is the act, the dialog shows only a door refusal if one
comes back; **(3)** the wall-removal database lane (裁-188) replaces each wall with the automatic
receipt: `p_attestation` parameters become optional-and-ignored where the signature can stay, the
segregation and high-stakes rungs are removed, `finalize_close` records the gate states itself, the
threshold verb and its control retire, and every cell that pinned a wall is re-cut to pin the receipt.

**Dissent, filed once.** Segregation of duties is the control every auditor expects; under (b) a
bookkeeper can post any amount alone, and the receipt makes that visible afterwards, never preventable.
Accepted by the owner as the beta's operating risk. **Amends:** digest laws 4, 25, 69, 71, 78's rider;
PRD §0's "concentrates at the statutory boundary" parenthetical, §2 "Segregation of duties", §6 item 9;
ARCHITECTURE §0's drawer-2 exception sentence and §3.4. **ADR-0078 decision 2.** No separate ruling file.

### 裁-188 — the wall-removal database lane runs THIS session, after the P0 block (owner, ≈09:22, option (a) of 3, 「照建议」)

The UIUX lanes are not blocked on it: they hide the ceremonies now, the walls come down in their own
lane — one migration set, one fresh-context opus review, CI on the throwaway rig — ≈2–3 lane-units.
Options declined: (b) do it first (the UIUX fixes would wait), (c) rule now and leave the database to the
next session (a hidden ceremony over a standing wall shows refusals). No separate ruling file.

### 裁-189 — the production deploy ceremonies (the runtime image v75 and the web Worker) are run by the lead as the owner's delegate, receipted (owner, ≈09:22, option (a) of 3)

Both are outward-facing acts, so they were asked before any lane opened. Each runs from merged `main`
through its own runbook (the runtime recipe pattern
`docs/ops/runtime-deploy-2026-09-03-v71-chatturn-v17-c5.md`; the Worker through `wrangler versions` — there
is no repoint rollback since 裁-156, a broken Worker is fixed forward by re-promoting a walked version),
with a positive read that the running release carries the merged commit (law 46). No separate ruling
file.

### 裁-190 — native lanes only for this session (owner, ≈09:22, option (a) of 2)

Sonnet-5 xhigh for bounded, mechanical, objectively testable work; opus-5 xhigh where judgement,
security or ambiguity dominate, and for every review; Fable orchestrates. The Codex build lane stays
suspended in the spirit of 裁-133 — it was offered now that beta is live (裁-133's own time box) and
declined on the ground of three capacity deaths in ninety minutes on 2026-09-02. The owner may resume it
at any turn. No separate ruling file.

### 裁-191 — two arguable document kinds are CODEABLE: a Notice of Assessment and a hire-purchase / finance-lease contract create liabilities the close gate must see (owner, 2026-09-04 ≈12:30 MYT, `AskUserQuestion` option (a) of 3, 「照建議」)

**Context.** PR #551 (the DB lane for the close gates) ships `clara.document_kind_codeability`, a 20-row TABLE
— data, not code — deciding which filed document kinds the `uncoded_documents` close gate and the coding lane
treat as "must be journalised" (H-12 / H-53 / H-55: the gate used to count a filed bank statement as uncoded,
a false FAIL on every close). The safe direction, stated by the file for NULL and unnamed kinds and applied by the
fresh-context review to the named arguable ones: a false FAIL is visible and cheap, a false PASS closes a year
over an unposted liability, so an arguable kind is seeded codeable. The review found two rows seeded the other
way: `tax_correspondence` (a Notice of Assessment creates a bookable
liability) and `agreement_contract` (a hire-purchase or finance-lease contract creates a liability and an asset
at inception — MPERS s.20; an ordinary Malaysian SME shape). **Briefed in plain language** with the failure
example (an NoA filed, never journalised, the gate reads green, the year closes with the tax liability off the
books) and the cost stated (LHDN acknowledgement letters and supply contracts show in the uncoded list until a
human dismisses them — which no longer blocks a one-click close under 裁-187).
**Options as put:** (a) both codeable — recommended; (b) keep both not codeable; (c) tax correspondence only.
**Ruled (a).** The table WILL read 12 codeable / 8 not once #551's fold re-cuts the two seed rows (at the
ruling its head `f530e133` still seeded both `false`). Because it is data, any later row flips without a migration.
**Amends** nothing — a seed value under the spirit of digest law 16 (facts live in effective-dated tables,
never in prose). No separate ruling file — this entry is the text of record.

### 裁-192 — the browser smoke becomes a REQUIRED per-PR CI gate (owner, 2026-09-04 ≈12:40 MYT, `AskUserQuestion` option (a) of 3 after one 「不懂，再解釋」 re-brief; AMENDS 裁-86)

**Context.** Issue #541's CB-AE2E-036: the Playwright suite (twelve `.spec.ts` files under `apps/web/e2e`
at the ruling; two of them re-run by the live-stack configs) runs only when a lane invokes it, so a PR that never walks a browser can break a page while every CI check
stays green. 裁-86 (2026-08-31) made that walk a per-train ACCEPTANCE instrument — deliberately not a gate.
**Briefed in plain language:** a gate is forced by the machine, an acceptance instrument depends on a lane
remembering; the failure example (a backend field rename, typecheck and lint green, the login page broken).
**Options as put:** (a) one required `web-e2e-smoke` job, ≈10 minutes, on the built app with the mocked stack,
an explicit smoke spec list, unexpected console or network errors red it, `retries: 0` — recommended;
(b) keep 裁-86 as is; (c) non-required first, flipped to required once the flake rate is measured.
Costs stated: ≈10 minutes more per code PR, more hosted CI minutes.
**Ruled (a).** The per-train acceptance walk STAYS beside it as the lane's own instrument; the gate is the
floor, not the ceiling. **Two known flakes are fixed at their cause BEFORE the gate is made required** — a
required gate with a known flake blocks every PR — both in `apps/web/e2e/checkout-gate-walk.spec.ts`, each
seen once in roughly six runs by two lanes on 2026-09-04 with no related diff: **(i)** the axe
colour-contrast arm — the `scan()` helper (`:105-108`) fires right after a visibility assertion, so it can
sample a transitioning button; the reporting call site was the "REFUSAL POLARITY" test (`:230`) and once the
DPA-refusal test; **(ii)** the navigation race in `reachDpaStep` (`:113-140`) ahead of the fail-closed
client-IP test (`:293`). Two reviewers read that helper's waits differently, so the fixing lane MEASURES
before it edits; line numbers here are of `main` at `a2d098f2`.
**Amends** 裁-86 and digest law 85's browser-leg clause (gate AND acceptance, where it read acceptance only);
a digest row and an "amended by" line on ADR-0077 under 裁-140, no new ADR. No separate ruling file.

### 裁-193 — the chart of accounts may be applied only AFTER `commit_client_onboarding` (owner, 2026-09-04 ≈16:45 MYT, `AskUserQuestion` option (b) of 2, AGAINST the recommendation (a))

**Context.** 裁-23 Q5 said the chart of accounts is applied "after the client is created", and the two
readings differ by one door: after the onboarding interview MINTS the client, or after
`commit_client_onboarding` closes the plan. **Ruled: after commit.**

**Consequences, as stated at the ruling.** #551's `dba6` is re-cut to committed-only, plus a
`seed_decision_plan_state` key carrying the card's copy; #546's settled receipt already hosts the apply
control post-commit, so no new surface is owed. Handover row **H-29** closes as "the card says
decided-applies-after-commit". **Dissent: none filed** — a taste call, no accounting risk either way.

**MECHANISM (the lead's call, not the owner's, under house law PRD §6 "enforced in the DB, not the UI").**
review-551 MEASURED that `apply_coa_template` (`0156:726-910`) never consults the onboarding plan, so
"the door refuses on an open plan" was a GAP, not a fact. DB-A therefore adds the refusal INSIDE the door
— a CREATE OR REPLACE on a granted writer, so it takes a prestate pin and a D1 quiesce window — and makes
`dba6` two CTEs: a committed-only `dec`, and a separate open-plan lookup feeding only
`seed_decision_plan_state`. #551's D1 list grows by `apply_coa_template`. **Amends** nothing in the digest;
it settles 裁-23 Q5's ambiguity rather than reversing it. No separate ruling file — this entry is the text
of record.

### 裁-194 — the 裁-149 clause-2 PREMISE CORRECTION is ACCEPTED; the leader stays byte-untouched (owner, 2026-09-05 ≈02:50 MYT, `AskUserQuestion` option (a) of 2; recommendation followed)

**Context.** 裁-149 clause 2 kept the leader's dedicated session **crash-loud** on the stated premise that
it carries no `'error'` listener, so an idle-client error becomes an `uncaughtException`, the process dies
and a standby takes over. A later read found the premise wrong **when it was ruled**: the leader session
has always had an error listener feeding a reconnect loop — `packages/runtime/scripts/relay.mjs`
(`:139-153`) and `packages/runtime/lib/leader.mjs` (`:177-188`), each capturing the error into `connErr`
and re-throwing it at the top of the poll loop to reconnect with backoff. The leader was never crash-loud,
and **failover holds anyway**: the session-level advisory lock is released when the session drops, so a
standby acquires it whether the process dies or the client reconnects.

**Ruled (a): the correction is ACCEPTED and the leader is byte-untouched.** The behaviour 裁-149 wanted is
the behaviour that already ships; only the reasoning was wrong. The record of the corrected contract is
owed to `docs/ARCHITECTURE.md` §4.3 by the runtime-ops lane that builds 裁-149's clause 1 — **§4.3 does not
exist yet on `main` at `6bad969b`, where §4 stops at §4.2** — and the rulings register's **row 90** carries
a one-line erratum written at this clock-out. **DISCHARGED:** #558 merged as `2060c762` and wrote §4.3,
"What a background client error does to the process, per connection (裁-149)", carrying this corrected
reading — its leader row records the dedicated session as "record → rethrow into the caller's own
reconnect loop". Clause 1 (the general pool logs, counts and raises a health
flag) is untouched and still owed. **Amends** 裁-149's clause-2 REASONING only, never its outcome. No
separate ruling file.

### 裁-195 — REQUEUE-ONCE: a human's real ANSWER to a coder-opened `sweep_refusal` question un-parks the registry and re-mints the draft (owner, 2026-09-05 ≈02:50 MYT, option (a) of 3; recommendation followed)

**Ruled (a).** An ANSWER is the human act that un-parks a twice-failed autodraft registry and re-mints the
draft, once. **A DISMISSAL does not re-mint** — closing a question without answering it is not the human
act. **The lane, as scoped at the ruling:** copy `readmit_autodraft_after_withdrawal` (`0117:173-345`),
reserving the op key AFTER the delegation; eligibility is `origin='sweep_refusal'` **and**
`scope_kind='document'` **and** a parked registry **and** a terminal task; the op key is
`'q-requeue:'||event`; the runtime arm sits beside `admitWithdrawalEvent`; four cells, including one
proving a `'manual'`-origin question must NOT re-mint. ≈0.5 lane-unit. **Amends** nothing — it names a new
human act inside an existing wall. No separate ruling file.

### 裁-196 — four readiness and grant rulings, taken together; the dead-lane `/ready` failure goes AGAINST the recommendation (owner, 2026-09-05 ≈02:50 MYT, multi-select, ALL FOUR taken)

- **(a)** production **REFUSES to boot** on a DSN carrying `sslmode=no-verify` — it warned before.
- **(b)** **a dead NON-runtime DB lane FAILS `/ready`** — **AGAINST the lead's beta recommendation.**
  **Dissent, filed once:** a 503 on a lane whose ceremony has not run would take chat down for a lane
  nobody uses yet.
- **(c)** the sales-lane switch keeps `p_reason`.
- **(d)** `clara.sst_threshold_schedule` gains a firm-user read — a grant, or a definer read — so the Tax
  tab's classification control can offer the statutory thresholds.

**IMPLEMENTATION READING (the lead's, recorded to keep (b) safe).** Only a **CONFIGURED** lane — one whose
DSN is present — that is unreachable fails readiness. An UNCONFIGURED lazy lane stays `skipped` and never
fails; `pending` (unmeasured) never fails; a `stalled` probe loop never fails, because an instrument fault
is not a lane fault. **Lanes:** (a)+(b) are one runtime lane (the L9 follow-up, ≈0.5 unit); (d) is the next
DB lane (DB-D). No separate ruling file.

### 裁-197 — three product tickets ENTER THE QUEUE after the nine (owner, 2026-09-05 ≈02:50 MYT, multi-select, ALL THREE taken)

- **(i)** provisional streaming text in the rail (≈0.7 unit) — a grey provisional stream replaced by the
  DB-persisted message. Not a durable artifact, so hard constraint 2 holds.
- **(ii)** real readers for the nine ids-only part kinds (≈1 unit): `je_review`, `doc_review`, `diff`,
  `open_question`, `bank_recon_receipt`, `fixed_asset`, `depreciation_run_receipt`,
  `adjustment_run_receipt`, `staff_advance`.
- **(iii)** chatTurn tools and cards for the five gaps (≈1.5 units): send a document into intake, start an
  onboarding interview, add a fixed asset / set a depreciation method, recurring adjustments, and start a
  period close.

**Order among the three: (iii) → (ii) → (i)** unless the owner says otherwise — he listed (iii) first.
They queue AFTER the nine lanes already ordered. No separate ruling file.

### 裁-198 — the DB ceremony for `0165`…`0176` opens as soon as the chain lands and the hand sweep on the final `main` is green — tonight (owner, 2026-09-05 ≈17:55 MYT, `AskUserQuestion` option (a) of 3; recommendation followed)

**Context.** The repair session put eleven migrations on `main` (`0165`…`0175`) with `0176` riding
#556, and **six bodies owe a D1 write-quiesce window** — `clara.set_document_kind` (`0169`),
`clara._gate_outstanding_items` (`0172`), `clara.apply_coa_template` (`0173`),
`clara._tf_chat_session_update()` and `clara._tf_counterparty_update_0011()` (`0174`), and
`clara._persist_statement_core_v2` (`0175`). Nothing is deployed, and the ordering is not optional:
`0174` adds `clara.chat_sessions.archived_at` and `apps/web` already ships readers for it, so the
Worker cannot be promoted first.

**Ruled (a): tonight, on two preconditions, in ONE window.** The ceremony opens as soon as **(i)** the
merge chain has landed and **(ii)** a hand-dispatched sweep on the FINAL `main` comes back green on all
**13** jobs — read from `gh run view --json jobs`, never from a PR's colours. The shape:

1. **Backup first**, verified, before any DDL.
2. **ONE write-quiesce window with the runtime STOPPED** — not six narrow ones. The six bodies go in
   together; stopping the runtime is what makes `0175`'s "quiesce the `statement_facts` lane"
   requirement unconditional rather than a lane-by-lane judgement.
3. **Per-step rollback**, recorded step by step, so a failure at step N does not require reasoning
   about steps 1…N-1 after the fact.

**Then, and only then:** runtime v75 (gated by 裁-199), then the web Worker. **Amends** nothing — it
schedules the ceremony 裁-189 already assigned to the lead as the owner's delegate. No separate ruling
file — this entry is the text of record.

### 裁-199 — the H-04 classify gate's floor for runtime v75 is NON-REGRESSION on the real corpus, not an absolute number (owner, 2026-09-05 ≈17:58 MYT, option (a) of 3, after one 大白话 re-brief; recommendation followed)

**The re-brief, because the first framing was wrong in the room.** The classifier decides a document's
**KIND** — invoice, receipt, bank statement, tax correspondence — **not which client it belongs to**.
Client attribution is a separate structural wall (PRD §6 invariant 2(a)); a classifier miss files a
document under the wrong KIND, which surfaces as a wrong close-gate population or a document that never
reaches the coding lane, **never as a cross-client leak**.

**The problem this closes.** `packages/runtime/scripts/measure-classify-recall.mjs` reports
`recall_at_gate` as a percentage and prints it, and **nothing in the repo said what percentage passes**.
The script's `CONFIDENCE_GATE` of `0.8` is the per-row confidence bar `clara.classify_document` itself
applies — the script says so at its own line 63 — **not a verdict on the run**. #558's commit put the
floor with the owner and the deploy runsheet treated the run as pass/fail, so the two disagreed until
this ruling.

**Ruled (a): NON-REGRESSION on the real corpus.** Runtime v75 ships when both hold:

1. **Per-KIND recall with the new prompt is ≥ the live prompt's**, kind by kind. Not an aggregate — an
   aggregate can rise while bank statements collapse, which is the exact H-04 failure the 裁-184 walk
   found.
2. **ZERO new "confident and wrong" cases** — a row the new prompt predicts at confidence ≥ 0.8 that
   the live prompt did not get wrong at that confidence. **ONE such case blocks the image.** A
   confident wrong answer is worse than a refusal, because the gate lets it through unexamined.

**No absolute number is set, and that is deliberate:** there is no baseline yet, and a number invented
before a measurement is a number nobody can defend. **The first run of the harness against the real
corpus MINTS the baseline**; an absolute floor becomes settable once it exists, and the owner sets it
then. **Amends** nothing — it fills the gap #558 left open. No separate ruling file.

### 裁-200 — the owner's own `AGENTS.md` edit becomes repo law: ask the owner first **using /grillwithdocs** (owner, 2026-09-05 ≈18:15 MYT, `AskUserQuestion` option (a) of 3, 「并进 #561」; recommendation followed)

**Context.** The main checkout carried an **uncommitted** edit the owner had made by hand to
`AGENTS.md`'s working protocol: the sentence that had read "**Ask the owner first** before deleting or
overwriting a file you did not create" now reads "**Ask the owner first** using /grillwithdocs before
deleting or overwriting a file you did not create". It had sat in the working tree since the session
opened, outside every lane's worktree, so no PR carried it and every agent read the old sentence.

**Ruled (a): fold it into the repo through #561** rather than open a PR of its own — the docs PR was
already in flight and the edit is one line. The sentence is now **law**: the ask is not a free-form
question, it goes through `/grillwithdocs`, which puts the relevant documents in front of the owner
with the question instead of asking him to recall them.

**The local checkout was then restored to `main`'s identical text and fast-forwarded.** This matters
for a reason that is not obvious: **the codebase graph's project id is keyed by the checkout PATH**, so
leaving the main checkout permanently dirty — or re-cloning it elsewhere — would strand the index the
whole harness greps against. The restore is byte-identical to what #561 merged, so nothing was lost by
discarding the working-tree copy.

**Amends** `AGENTS.md`'s working protocol, and nothing else — no digest law, no ADR, no product
invariant. It changes the FORM of an ask that constraint 14 and the working protocol already required,
never its trigger. No separate ruling file — this entry is the text of record.

### 裁-201 — deploy v75 with `classify_document`'s auto-accept gate UNCHANGED at 0.8 (owner, 2026-09-05 ≈22:20 MYT, `AskUserQuestion` option (b) of 3, **AGAINST the lead's recommendation**; dissent recorded, executed)

**Filed 2026-09-06 at the disposition truing, because this ledger had no 裁-201 section.** The ruling
was recorded only in the ceremony as-run
([`runtime-deploy-2026-09-05-v75-and-db-0165-0176.md`](../../ops/runtime-deploy-2026-09-05-v75-and-db-0165-0176.md),
§ at line 289) and in the session roster
([`repair-session-2026-09-04-roster.md`](../completed/repair-session-2026-09-04-roster.md), line 151),
so the ledger jumped 200 → 202 — the same silent numbering gap 裁-110 was reserved to close. **The
roster's line is the fullest text of record and is quoted verbatim below; it governs on any
divergence with this section's framing.**

> **裁-201** (owner, 2026-09-05 ≈22:20 MYT, AskUserQuestion (b) of 3, after a 大白话 re-brief that the 0.8 gate is the DB's lock and the confidence number is the LLM's own self-report): deploy runtime v75 tonight with the auto-accept gate UNCHANGED at 0.8; the 裁-199 recall run proceeds on the four human-labelled documents (3 bank_statement + 1 invoice), denominator recorded first; a confident-and-wrong case still blocks the image. **AGAINST the lead's recommendation** (tighten to 0.95 until 20 human-labelled documents form a baseline, because #558's prompt instructs the model to self-report ≥0.85 — a self-graded score behind the DB's only lock). DISSENT recorded; executed. Mitigation kept: the as-run states "calibration unproven"; the baseline re-run is a Backlog row.

**Amends** nothing. It sets the release condition for one image; the gate value itself is
`clara.classify_document`'s and moving it needs a DB lane. The calibration remains **unproven** by
the as-run's own words, and the baseline re-run carries as a Backlog row.

### 裁-202 — the per-item disposition of the three opening reports: twenty decisions, ALL per recommendation; D-8 = 甲, D-10 deferred (owner, 2026-09-06 ≈02:20 MYT, 「全部按推荐，D-8 选甲，D-10 先延后」; recommendation followed)

**Context.** The session opened on three documents and never went back to count them. They are ① the
owner's own UIUX flaws file (36 items after splitting its compound lines), ② GitHub issue **#541**,
the authenticated production e2e audit (**CB-AE2E-001…036**), and ③ the beta handover's own rows —
**H-01…H-56** from the walk and the carried registry **C-01…C-88**. Four read-only opus lanes
dispositioned every row **on `main` at `fc39c361`, 2026-09-06**, each verdict citing a line actually
opened rather than a PR title. The evidence records are
[`report-disposition-2026-09-06-r1-owner-flaws.md`](../completed/report-disposition-2026-09-06-r1-owner-flaws.md)
· [`-r2-issue-541.md`](../completed/report-disposition-2026-09-06-r2-issue-541.md)
· [`-r3-handover-h.md`](../completed/report-disposition-2026-09-06-r3-handover-h.md)
· [`-r4-handover-c.md`](../completed/report-disposition-2026-09-06-r4-handover-c.md), and the sheet
the owner ruled from is
[`report-disposition-2026-09-06-decisions.md`](../completed/report-disposition-2026-09-06-decisions.md),
all filed byte-verbatim between md5 markers.

**The totals, which are the reason the sitting was worth holding.** Of the **128 walk-class rows**
(the owner's 36, #541's 36, the handover's 56): **66 are FIXED and serving** since the 2026-09-05
ceremony and **27 are PARTIAL**. Of the **88 C rows**: **3 closed**, **9 partial**, **59 carry**,
**1 obsolete by ruling**, and **3 premises were already FALSE when the handover was written**.

**The question.** Twenty decisions, each put with a recommendation and a cost. What closes, what the
queue order is, what a defect's restated form is where its prescription was disproved, and which
items are the owner's own to act on.

**Ruled — all twenty per recommendation, with D-8 taking option 甲 and D-10 deferred.**

- **D-1** — the **66 FIXED rows CLOSE**. Five carry "field re-verification owed" into D-20:
  **H-02 · H-03 · H-05 · H-06 · CB-AE2E-004** — closed on CODE AND SHIPPING, never on a field re-proof.
- **D-2** — the **classify/OCR ordering race is Q-00, ahead of everything.** The same lane fixes
  #558's two harness-in-image defects: the Dockerfile's missing `COPY workflows/`, and the recall
  script's bare `pg.Client` that never `SET ROLE`s.
- **D-3** — **Q-01 (H-21, the interview captures projection) and Q-02 (裁-186's consent declaration)
  are ONE lane in ONE D1 window**: both re-cut `commit_client_onboarding`.
- **D-4** — **Q-03 (裁-188's wall removal) moves to directly after Q-00**, and
  `firms.high_stakes_amount_cents` rides that migration — **deleted, or demoted to an advisory
  number, never a new door.** The fact that forces it: the DB's high-stakes wall at
  `packages/db/migrations/0037_wave_c_a_subledger.sql:1992` **outlives the control #550 removed**, so
  an above-threshold approval refuses today with no surface on which to change the threshold.
- **D-5** — **#541's exit-pack items JOURNAL-01 and CONSENT-01 are REWRITTEN** to 裁-187's and
  裁-186's shapes before they can be graded. As written they are ungradeable: one demands a different
  checker, which 裁-187 abolished; the other demands a per-client evidence chain, which 裁-186 replaced.
- **D-6** — the **Terms sitting (Q-09 / CB-AE2E-001) is held THIS WEEK**, on its two questions: must
  checkout require BOTH receipts, and may a Terms body carrying 27 lawyer markers be seeded. **The
  DPA v2 draft goes to the lawyer NOW** (H-36). **The placeholder / `[verify]`-token DEPLOY GATE cell
  (≈0.2) is built now, not held for the bytes** — the gate can land before the text it guards.
- **D-7** — **five owner acts TODAY**: H-37 the Stripe checkout page copy · H-39 the duplicate webhook
  endpoint · H-40 the two Supabase settings (`jwt_exp`, HIBP) · H-45 the Resend cap read back into the
  checklist · H-46 the call on whether S21's Gmail code certifies 裁-146 point 3.
- **D-8** — **"GI clock" = 甲**: an **FY-end countdown strip, no backend**, riding Q-02b (≈0.3).
  **乙** — a statutory calendar needing seeds, a grant and the due-date oracle `0139` deliberately did
  not ship — **becomes a pre-上市 row**. **丙** (an SST threshold clock) is not now.
- **D-9** — **Q-10 / Q-11 / Q-12 stay after Q-00…Q-03.**
- **D-10** — **chat export files: DEFERRED.** No lane. #549's honest copy — which says plainly that
  this build has no way to request a sandbox export — stands as the product's answer.
- **D-11** — **onboarding full-screen stays OPT-IN.** The reason recorded in the source at
  `apps/web/components/firm/client-workspace-overview.tsx:77-79` stands: a forced redirect makes the
  client's other eight tabs unreachable for the whole of onboarding.
- **D-12** — **no new UI dependency**: no TanStack, no motion library.
- **D-13** — **CSP enforcement by HASHES**, before the real-money switch. A new row, not C-07's
  remainder-by-default: `unsafe-inline` would surrender half the value.
- **D-14** — **the restore drill (C-14) runs FIRST, then the PITR decision (C-56).** Deciding whether
  to buy point-in-time recovery before proving the existing backup restores is buying blind.
- **D-15** — **Q-06 publishes ONE management template.** Statutory waits for the lawyer's wording.
- **D-16** — **ONE close/bank handbook** (a docs row), folding **H-10 · H-13 · H-14 · H-54**, each of
  which today prescribes writing into a runbook that does not exist.
- **D-17** — **Q-02b, the "small faces" web lane, runs after Q-03**: the DPA signed-state hydrate
  (CB-AE2E-007, over `get_own_dpa_signature`) · the OTP resend (CB-AE2E-006) · `/activity` rewired to
  `clara.list_firm_timeline` (CB-AE2E-018) · the client AI-state readout over `client_egress_state` ·
  the payer-identifier UI (H-09) · the sales-lane panel over the `0176` wrapper, with **F-02**
  (H-19 / CB-AE2E-012) · the two now-false `en.json` strings and the `ClaraThreadMenu` archive control
  that `0174` made buildable · and the FY-end strip from D-8.
- **D-18** — **the two ORPHANED ROWS settle BY HAND at the next ceremony**, not by a lane.
- **D-19** — **"card component and 其他东西" CLOSES UNNAMED.** Five lanes rewrote card surfaces this
  session, so any disposition would be a guess about the referent. **It re-opens the moment the owner
  names the card and the screen.**
- **D-20** — **ONE field re-verification walk after Q-00**: a real Maybank/Alliance statement carried
  through to reconciliation · a clean client finalized entirely through the UI with **no DB bridge**
  (CB-AE2E-004) · one sales invoice re-run to see whether H-17's `tokens 0` residual survives v10.

**THE RULED QUEUE ORDER — this is the operative line.**

> **Q-00 → Q-03 → Q-01+Q-02 → Q-02b → Q-04 → Q-05 → Q-06 → Q-07 → Q-08 → Q-09 → Q-10 → Q-11 → Q-12**

**What changes.** `PROGRESS.md`'s Backlog carries the order above and the new named rows (D-6's deploy
gate cell, D-13's CSP hashes, D-14's drill-then-PITR, D-16's handbook, D-20's walk); its `## Next`
stops saying the owner has yet to pick, because he has. **Amends** no standing law and mints no ADR:
every decision is a queue or scope call inside rulings already made — 186, 187, 188, 192, 195, 196,
197 — except D-5, which corrects an AUDIT's acceptance clauses to match rulings that post-date it.

---

**What follows in this session, so the next reader can find it:** the unified defect register built from
the three sources (every item anchored to code on `main` by a mapping workflow before any lane opened),
the P0 block first, then the owner's UIUX list and the walk's P1 rows in parallel lanes, the wall-removal
lane (裁-188), and the two deploy ceremonies (裁-189). `PROGRESS.md` carries the lanes as they open and
close.
