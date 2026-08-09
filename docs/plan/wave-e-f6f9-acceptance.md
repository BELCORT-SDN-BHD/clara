# Wave E, first strike — the F6–F9 fix batch: AS-RUN ACCEPTANCE RECORD

> **AS-RUN ACCEPTANCE RECORD, 2026-08-08/09 — EVIDENCE GRADE, NOT A DESIGN DOC.**
> This is the **record of record** for the F6–F9 batch and the evidence ADR-066 closes on.
> It records what was actually SEEN — receipts, ids, counters, timestamps — **including what
> was NOT seen** (§6 is the honest boundary; F6 is PARTIALLY witnessed and says so).
> The mechanisms of record stay elsewhere and are cited, never restated: the contract is
> `docs/plan/wave-e-contract.md` **E-R1** (ADR-065, the first-strike ruling); the findings'
> origin is ADR-064 §3; X7's promise is `docs/plan/extraction-slice-contract.md` and its
> field story is `docs/plan/extraction-slice-x7-field-record.md`; the per-PR review records
> are the **Law-1 record comments** on PRs #216/#217/#218/#219/#220, which are the review
> records of record and are quoted here rather than re-derived.
> **Where this record and the contract disagree, the contract wins.** Nothing here is a ruling.

---

## 0. What shipped

| finding | task | PR | merge sha | merged (UTC) | migration | runtime |
|---|---|---|---|---|---|---|
| **F6** — the extraction-recovery door (merged with ADR-062's registered door, ONE item per E-R1) | #31 | **#219** | `96d5175` | 2026-08-08 21:18:06Z | `0051_extraction_recovery_door.sql` | intake half |
| **F7** — the boxed bill-to party beats the Attn person (X7) | #32 | **#216** | `3d3bad3` | 2026-08-08 22:00:23Z | `0052_customer_identity_facts.sql` | v10 adapter |
| **F8** — the unattended lane can honor CLR23's own remedy | #33 | **#217** | `5dc138e` | 2026-08-08 22:41:48Z | `0053_autodraft_readmit_after_withdrawal.sql` | `lib/autodraft.mjs` |
| **F9** — cite evidence regions by INDEX, not by transcribed UUID | #34 | **#218** | `f2424e8` | 2026-08-08 23:22:28Z | `0054_region_ordinal.sql` | `autoDraft_v7` + `chatTurn_v10` |
| **F7-fix** — the anchor sweep (the A1 live-gate finding) | #32 | **#220** | `4615372` | 2026-08-09 07:51:00Z | *(none — runtime only)* | v11 adapter |

Repo frontier after the batch: **53 migrations, `0001`–`0054`** (the sequence still skips
`0032`). The batch touched **no frozen workflow body**: `autoDraft_v7` and `chatTurn_v10` are
NEW closures; `autoDraft_v6` / `chatTurn_v9` joined the frozen bare-export list per the
Appendix-A policy and are byte-untouched.

---

## 1. The ceremony (2026-08-08 night → 2026-08-09 morning)

The ceremony ran the pre-flight → quiesce → apply → deploy → lock sequence as written in the
session's runbook (a scratchpad artifact, deliberately not carried into the repo — its
contents are restated below where they are load-bearing). Standing laws applied:
session-level `statement_timeout` inside the migration connection (Supavisor drops
PGOPTIONS) · **positive deploy reads only** · `--lock-deployed` closes the ceremony ·
**DB strictly before runtime** (F9's cells make new-runtime-on-old-DB a fail-closed drafting
stop; F7's CLR10 forfeit points the same way).

| step | what was SEEN |
|---|---|
| **D1 quiesce** | honored — the runtime machine stopped before the apply; `0051` finalize/reextraction, `0053` admit/`_approve_entry_core` and `0052` persist are writer bodies, so no in-flight writer body straddled a splice |
| **apply `0051`→`0054`** | **2026-08-08 23:24Z**, four new migrations, **all in-txn tails green** (`0051`'s nine notice sets · `0053`'s five-conjunct tail · `0054`'s idx notice); frontier read back = `0054_region_ordinal` |
| **deploy v59** | **2026-08-08 23:33Z** — image built after the F9 merge (23:22:28Z), the deploy law's positive read; the machine started explicitly |
| **deploy v60** | **2026-08-09 07:53Z** — the anchor-sweep fix (#220 merged 07:51:00Z); again a positive build-time read against the merge it must contain |
| **freeze manifest** | `node scripts/check-frozen-workflows.mjs --lock-deployed` stamped **exactly 12 entries** — `autoDraft.v7.{errors,impl,infra,prompt,tools,ts}` and `chatTurn.v10.{errors,impl,infra,prompt,tools,ts}` — each gaining `"deployed": true`, no sha changed. The manifest commit rides this close-out PR (main is PR-only). |
| **Supavisor** | **35/60**, runtime pool **11** — its post-restart baseline, unchanged by the batch's consumers |

**Ceremony finding (registered, not fixed here):** the positive deploy read had to be
assembled from the release build time plus a live behavioural probe, because **the runtime's
boot line does not name its own bundle version**. Naming it would make the deploy law's second
leg a one-line read. → PART 2.

---

## 2. The KONG CHENG replay (ROME SECRETARY `e054b797`, BELCORT — real books)

The A-leg exercises F7 → F8 → F9 → birth in one chain on the two documents ADR-064 §3 held.
Executed under ADR-060's data authority with every mechanism at full force.

### A1 — F7 / X7: the field failure, then the witness

**A1 as first run (2026-08-09, on v59 / normalization `v10`) FAILED.** Both documents
re-extracted cleanly (`version_n` 2, supersede + repoint correct) and
`invoice.contact_person = "Lim Xiao Shan"` was emitted correctly — but
`invoice.customer_name` came back **byte-identical to v1, still the person**. The live
receipts named the mechanism in counters: `split_line_scanned: 0`, **every refusal head at
zero**. The reader had not refused the company; **it had never generated it as a candidate.**

**Zero harm — the gate held.** The acceptance matrix's verify-before-approve rule
(`A WRONG name = STOP, file the finding, do not approve`) stopped the leg: the pair stayed
held, nothing was withdrawn, nothing was approved, no counterparty was born. That stop is
this batch's most valuable receipt.

The diagnosis, both hypotheses plus one neither review lane had reached, and the two repairs
are in `docs/plan/extraction-slice-x7-field-record.md` (the record of record for the reader).
Headline: party generation hung off a bill-to LABEL these invoices do not print, and Azure had
typed `VendorName` onto the top-left **LOGO** at **0.334in** from the buyer against the
buyer's own typed anchor at **0.736in** — so proximity could never have discriminated even
with generation fixed. PR #220 replaced the vendor PROXIMITY term with vendor **IDENTITY**
(`in_vendor_block`, `is_vendor_name`, both refuse-only) and added the label-gated anchor sweep.

**A1 re-run on v60 / `clara-invoice-norm:v11` — WITNESSED:**

- **Both** KONG CHENG documents read `invoice.customer_name = "KONG CHENG RESTAURANTS SDN BHD"`.
- Anchor sweep on the real geometry: **11 candidates generated → 1 survivor** — **6**
  gate-rejected, **4** rejected for no registered-entity suffix. Uniqueness-or-nothing held
  with room, on the documents, not on a fixture.
- The two new identity refusals counted **`in_vendor_block` = 0** and **`is_vendor_name` = 0**
  on this pair: they refused nothing here. Recorded as a *counter reading*, not as a claim that
  they work — see §6.
- `invoice.contact_person = "Lim Xiao Shan"` on both, from the same read.

### A2 — F8 arm: withdraw

Both held drafts (`53504c0e` row 1 · `7995b1a3` row 12, the pair PART 2 has carried since
ADR-064) were withdrawn with reason + revision token. Registry rows untouched — the
`autodraft_attempts` rows stayed `task_status='completed'`, which is exactly the wall F8 exists
to reopen.

### A3 — F8 re-admit: the door opens exactly once, and automation is refused

- **`re_admitted_after_withdrawal` fired EXACTLY ONCE**, origin **`one_click`**, on filing
  **`6a385fa3`** (the 2512 leg). A real queued `agent_task` was minted.
- **The sweep-decline receipt.** Across **2 proven ticks** after A2 created the withdrawn
  population, the estate sweep **declined both withdrawn filings** — `p_origin='one_click'`
  only, so a withdrawal is sticky against automation. This is the cell the pre-ceremony
  measurement could not have produced: *"pre-A2 zero measures nothing."*
- **The audit instrument itself was corrected during acceptance**: the outcome audit uses
  **exact equality** `result->>'outcome' = 're_admitted_after_withdrawal'`. A
  `like '%re_admitted%'` substring audit yields **5 pre-ceremony false positives** — *spelling
  is not identity*, applied to the measuring instrument rather than to the code.
- The 2506 leg did **not** re-admit; it refused at a different gate — §4.

### A4 — F9: cite by index, resolved by the server

The re-admitted filing drafted unattended under `autoDraft_v7`. The draft **cited extraction
`version_n` 3 with a server-resolved `region_id`** — the model's toolface carried
`region_idx`, `resolveEvidenceRegions` mapped it by the idx FIELD, and the resolved UUID
reached `_write_entry_evidence` (**byte-untouched**, the wall stays the hero) unchanged.
**Zero `open_questions` rows from system conditions**: staleness/transient classify as
system-transient and retry in-run under precedence-then-recency; they never become a
human-facing question. No CLR21 `evidence_invalid` occurred on this draft.

### A5 — birth + tie

- **`KONG CHENG RESTAURANTS SDN BHD` born ONCE**, counterparty **`256d6100`**, **NAME-ONLY**:
  `registration` NULL, `tin` NULL. The enrichment trap (F3) holds — **RS now carries 11
  customers and 0 registrations**, and none of them may ever be enriched.
- **Entry `f6da5aff` approved**: DR `300-000` / CR `500-000`, **60,000¢**.
- **Trial balance ties: 3,116,500 = 3,116,500, difference 0** (the §7-A close's
  3,056,500/3,056,500 plus this entry's 60,000¢, to the sen).
- CLR23 did **not** fire on the re-draft — the fingerprint was computed fresh against the
  post-birth landscape, so the withdrawn-redraft loop ran once and closed.

---

## 3. F6 — the extraction-recovery door: PARTIALLY witnessed

**What was witnessed.** The **reextraction branch ran 4× live** during the A-leg (the two v10
attempts and the two v11 attempts). Each produced a **new `invoice_facts` version row**
(`version_n+1`, queued → settled, authoritative repointed by the `0017` trigger) and
**terminal rows were never mutated** — the door mints forward, it does not rewrite history.

**What was NOT witnessed.** The **`failed_retry` admission branch** — §1's actual new
population, a lane whose newest task is terminally `failed` — is **UNWITNESSED live**. Its
witness is drill **C1**, which needs a purpose-built sandbox upload that fails first; that
upload was not made. C1 stays OPEN. §1 is green on the rig (x51 17/17; the plants-nothing
end-to-end seam cell), but a rig is not the field, which is this batch's own lesson.

**§2's live B1 read — the Gate-P finding, and it corrects the register.** The read was taken
before any write, per the matrix:

- The Gate-P waiting population is **SEVEN documents, not four**.
- **All seven** have a newest `ocr` task that is `failed` with ingest-lane `error_code`
  `bad_type`, and `document_kind` **NULL**.
- Therefore the door **refuses by design on BOTH halves**, one gate earlier than the register
  assumed: §1's door reads **task status on the FACTS lane** (the facts lane is empty →
  CLR16 no-completed-extraction; kind NULL → CLR16 kind-unset), and §2's `not_retryable`
  check refuses the re-upload path on the ingest lane's `bad_type` (a deterministic failure is
  not retryable — re-running it would burn vendor spend on a guaranteed failure).
- **The honest remedy, stated rather than discovered later:** an **owner re-export** (new
  bytes, ordinary pipeline) **or** the **Wave-F 401/403 retryable-auth-code split**, which
  would move a credential-outage failure out of the deterministic class.

**F6 therefore does NOT unblock Gate P** — E-R1's expectation that it would is corrected here
by measurement. Gate P stays operating runway.

---

## 4. The 2506 leg — the honest hold

`RSINV-2506/01` (RM2,800) did not re-admit. It refused **`sales_backlog_held`** at §7-A's
`0046` **watermark** — a **correct, pre-existing** refusal that has nothing to do with F8:
the filing predates the drafter's admission watermark, and 7A-R5's explicit backfill door is
the only lawful way in. Its **wrong-name draft was withdrawn** during A2 and was not
re-created.

**Open, and it is the owner's, not engineering's:** whether to open a backfill window for that
filing. Until then the leg sits held with a clean, named receipt and no draft.

---

## 5. Standing guards — read at start and at end

| guard | reading |
|---|---|
| B2 witness `d023b48c` (sandbox, the belt's first autonomous draft) | **still `draft`** at both reads — never approved |
| Canary `daba7f2e` | **untouched** — never answered, past due by design |
| RS registrations | **0 across all 11 customers** — the enrichment trap holds |
| Cross-firm isolation | zero cross-firm writes; the sandbox and BELCORT lanes stayed on their own credentials |
| Supavisor | 35/60, runtime pool 11 |

---

## 6. The honest boundary — what this record does NOT claim

1. **F6 is PARTIALLY witnessed.** The `failed_retry` branch has never run live (C1 open). The
   §2 re-upload branch has never run live either — the Gate-P population refuses before it,
   for measured reasons (§3).
2. **The two new F7 identity refusals counted ZERO on this pair.** `in_vendor_block` and
   `is_vendor_name` refused nothing live. They are proven on the battery and on the derivation
   corpus; they are **not** proven in the field. This record deliberately declines to call a
   zero-count wall a witnessed wall — *a wall that never refused anything is not a wall that
   held; it is a wall that was never asked.*
3. **X7's five recorded residuals stand**, in the module headers and in
   `extraction-slice-contract.md`: unmeasured thresholds (now partially measured — the real
   capture is in the repo as a fixture) · no-typed-no-read (FINCARE needs a different door) ·
   two-distinct-buyers withdraw · the fail-closed narrowings · **residual (5), suffixed
   relational phrases — OWNER-ACCEPTED 2026-08-09 ("可以, 我点头") and RE-CONFIRMED the same day
   on the WIDENED envelope** (the anchor sweep adds a second way in on label-less pages, so the
   residual is wider than the round-6 record stated; the owner re-nodded knowing that).
   Harm ceiling: a wrong DRAFT behind maker/checker — no unattended-post path reaches the field.
4. **FINCARE (`RSINV-2510/02`, RM2,500) is NOT fixed by F7** and was never expected to be:
   attribution anchors on the typed `CustomerName` region, and Azure typed none. Supplying a
   name there would be absence-as-evidence. It stays a human coding decision.
5. **The 2506 backfill window is undecided** (§4).
6. Every claim above is a read. Nothing is inferred from a derived state, and no absence is
   reported as a positive.

---

## 7. The review ladder — what it cost and what it bought

**~30 dual-lane engagements across 5 PRs** (native `claude-opus-5` + Codex `gpt-5.6-sol`,
every lane with an explicit model override, ADR-061 uniform intensity). Per-PR totals from the
Law-1 record comments, which are the review records of record:

| PR | rounds | the record's own closing |
|---|---|---|
| **#219** (F6) | 4 | native READY — *"the door has been through four rounds and I can no longer break it"*; Codex round-4 sole finding discharged by CI |
| **#216** (F7) | 6 | *"the batch's longest ladder — the one adversarial-input surface"*; three polarity inversions, the normalization law, claim→reserve→judge |
| **#217** (F8) | 2 + polish | all five conjuncts **reduction-proven independently on stripped copies**; each maps to a named failing cell |
| **#218** (F9) | 3 + 2 polish | both lanes independently **REPRODUCED the silent wrong-region binding pre-fix**, now pinned as permanent DB witness cells (x54.h/i) |
| **#220** (F7-fix) | 3 | closing the **nine-engagement F7 arc**; *"the reader that ships is not the one anybody designed in round one, and it is the only version that has met a real document and been shown to read it"* |

**Six stated justifications dissolved under measurement across the batch — two of them the
native reviewer's own.** Rejected predicates were retained **executable in CI**
(`x7-path-a-rejected.mjs`) so every rejection stays a re-runnable fact rather than a claim.

**THE STANDING LESSON, minted by A1 and carried on PR #220:**

> **A wall that never refused anything is not a wall that held — it is a wall that was never
> asked.**

Ninety-six synthetic cells were green while the product was broken on the only two documents
it existed to fix, because **the corpus was authored by the same reasoning that authored the
reader** — it could only confirm that reasoning. Six review rounds hardened the WALLS; none of
them asked whether GENERATION could reach the document.

---

## 8. Open remainders

`docs/PROJECTLOG.md` **PART 2** is the live register and owns all of them. In short: **C1's
`failed_retry` witness** (a purpose-built sandbox upload) · **the 2506 backfill decision**
(owner) · **Gate P's remedy** (owner re-export, or the Wave-F 401/403 auth-code split) ·
**FINCARE** (human coding decision) · the batch's registered design items (F8's single-use door
per withdrawal, its two 0034 inherits, the sweep-side landscape-refresh autonomy class; F9's
no-unpark path and the parked-residual acceptance; F6's envelope-engine-label snapshot, the
mint-time-only reclaim bound, and `internal`'s missing self-service door) · the runtime boot
line's missing bundle version · `RENUMBER.md`'s dangling path.

**The decision record is ADR-066.**
</content>
</invoke>
