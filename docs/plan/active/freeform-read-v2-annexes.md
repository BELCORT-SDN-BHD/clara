# F-A6 v2 annexes — surface, battery, decisions, predictions, owner questions, risks

> Companion to `freeform-read-v2-design.md` (**DESIGN v2**, gate-folded 2026-08-23 — record:
> `freeform-read-v2-gate-record.md`) and `freeform-read-v2-survey.md` (**SURVEY v2**, the estate at
> the bytes). **Where this file and the design disagree, the design is right and this file is the
> bug.** Where this file and the **migration's printed line** disagree, the printed line is right —
> the standing caveat v1's A.2 minted for exactly this class of drift.

---

## Annex A · The surface

### A.1 · What is added, removed and re-cut — the whole diff against v1

| # | object | action | note |
|---|---|---|---|
| 1 | `clara.wake_freeform_read_cross_client(text,text,uuid,text,int,uuid[])` | **ADD** | SECURITY INVOKER; granted to `clara_freeform_ro` and nothing else |
| 2 | `clara._freeform_arm_cross_client(text,text,uuid,text,uuid[])` | **ADD** | DEFINER, `clara_fn_owner`-owned, search_path pinned (T18-clean); validates and freezes the named list; refuses a second arm (`double_arm`) |
| 3 | `clara._freeform_scope_clients() returns uuid[]` | **ADD or REPLACE v1's scalar** | §6 request A. STABLE, no arguments — the per-statement-constant property is load-bearing |
| 4 | `clara._freeform_core(text,int)` | **ADD, or EXTRACT from v1's verb** | §6 request B. **No scope argument** — that was v1's GB-2 defect, and its absence is what makes sharing safe |
| 5 | `clara.freeform_read_log.verb` CHECK | **EXTEND** | `+ 'wake_freeform_read_cross_client'`; the existing value byte-identical |
| 6 | `clara.freeform_read_log.scope` CHECK | **EXTEND** | `+ 'cross_client'`; the existing two byte-identical |
| 7 | `clara.freeform_read_log.client_scope_set uuid[]` | **ADD** | NOT NULL iff `scope='cross_client'`; `cardinality >= 2`; canonical (deduped, sorted) |
| 8 | `p_<t>_freeform` on the 35 v1 relations | **UNCHANGED if request A is taken; otherwise RE-CUT, all 35** | the whole cost of declining A |
| 9 | `p_document_extractions_freeform` (arm **S-2e**) | **ADD** | one-hop EXISTS to `document_filings` |
| 10 | `p_document_regions_freeform` (arm **S-2r**) | **ADD** | two-hop EXISTS (regions → extractions → filings) |
| 11 | `p_documents_freeform` | **RE-CUT** onto S-2e's shape comparing `documents.id` | Y5 (gate-fold corrected) — `documents.client_id` was DROPPED entirely at `0007:1102-1106`; v1's S-1 arm on this table cannot be created as documented (`42703`), and this is the only rule that can scope a `client_id`-less table |
| 12 | `wake_fn_allowlist` rows | **ADD TWO** | `('interactive_client','wake_freeform_read_cross_client')` and `('interactive','wake_freeform_read_cross_client')` — A.2 |
| 13 | `SELECT` grants to `clara_freeform_ro` | **ADD TWO relations** | `document_extractions`, `document_regions`; the printed audit line moves 35 → 37 |
| 14 | `CLR10 cross_client_unavailable` + its message + its battery cell | **RETIRE, all three together** | design §7 — **a CoR to an already-merged live body (`wake_freeform_read` or `_freeform_core`), not additive DDL; D1-gated regardless of request B (design §6, gate-fold corrected)** |

### A.2 · The allowlist — four rows, and why HOME gets one

| wake kind | verb | admitted? |
|---|---|---|
| `interactive` | `wake_freeform_read` | v1 |
| `interactive_client` | `wake_freeform_read` | v1 |
| `interactive_client` | `wake_freeform_read_cross_client` | **v2** — the named widening TA-P9 A(2) rules |
| `interactive` | `wake_freeform_read_cross_client` | **v2** — a voluntary **NARROWING**: HOME already reads every client of the firm, so naming a subset can only reduce what is read |
| `autodraft` · `proactive` · any unattended kind | either verb | **never** — `CLR03`, and the closed-world cell forbids the row |

**The HOME row earns its place twice.** It is safe (strictly narrower than what HOME already does —
**without exception, since the 2026-08-23 gate fold removed rung 2's status conjunct: a named read
can no longer refuse a client HOME would have shown, design §3.1**) and it is *useful*: a HOME read
that names its clients produces a receipt with an **exact**
`client_scope_set`, which is the only thing that lets F-A5b export the resulting chart to a
recipient who does not cover the whole firm (design §6). Without it, every HOME-derived sandbox view
is `firm_closure`.

**The closed-world cell asserts FOUR rows in both directions** — a fifth row fails, and a missing
fourth fails too (F5-D30's rule: a roster that can only find extras cannot find omissions).

### A.3 · Vocabulary — the tokens v2 adds

| token | tier | raised when |
|---|---|---|
| `cross_client_singleton` | A (`CLR10`) | `cardinality(p_clients) < 2`; the message names `wake_freeform_read` |
| `cross_client_unknown_client` | A (`CLR11`) | an element is not a client of `wake_firm()`, **any status** — gate-fold corrected, M9 (design §3.1) |
| `cross_client_too_wide` | A (`CLR10`) | above the cardinality cap — **default 25**, a firm-configurable ceiling below the roster size, chosen so the policy predicate stays a small constant array (Q-3) |
| `cross_client_pin_excluded` | A (`CLR10`) | an `interactive_client` credential whose pin is absent from `p_clients` |
| `double_arm` / `double_settle` | A (`CLR10`) | **inherited unchanged** from v1's R-L16 structure; the cross-client arm counts as *the* arm |

**Retired:** `cross_client_unavailable`.

---

## Annex B · The battery

**Standing rules.** A forced cell asserts its precondition or exits via a NAMED, COUNTED
`skipHere`/`t.skip` — never `noteLane`+return, never a `.catch` swallowing a premise, never an OR
between two walls. Fixtures THROW on construction failure. **Differential cells over
self-referential ones.** A wall's proof is a cell that makes the wall REFUSE.

### B.1 · The verb's rungs (§3.1)

| cell | forces |
|---|---|
| B1.1 | `p_clients` of one → `cross_client_singleton`, **and the message names `wake_freeform_read`** (the naming is the deliverable, as it was in v1) |
| B1.2 | an element from another firm → `cross_client_unknown_client`; the twin with all-firm elements succeeds |
| B1.3 | **(gate-fold corrected, M9)** an **archived** client named alongside an active one → **succeeds**, exactly like the all-active twin — rung 2 carries no status conjunct (design §3.1); the ORIGINAL cell ("a removed/inactive client refuses") named `clients.status` values (`removed`/`inactive`) that `clara.clients`' CHECK has never admitted at any point in the migration lineage (only `active`/`archived`/`onboarding`) and could not have been built |
| B1.4 | above the cap → `cross_client_too_wide`; at the cap → succeeds |
| B1.5 | `interactive_client` pinned to A with `p_clients={B,C}` → `cross_client_pin_excluded`; `{A,B}` → succeeds |
| B1.6 | HOME (`interactive`) with `{B,C}` → succeeds and the pin rule does **not** fire (C-3's asymmetry, forced so it cannot be "tidied away") |
| B1.7 | duplicates and unsorted input drawn from **already-distinct** members (e.g. `{B,A,B}`, cardinality ≥2 after dedupe) produce the **same** canonical `client_scope_set` and the **same** `op_key` |
| B1.8 | an unattended kind (`autodraft`, `proactive`) → `CLR03`; the allowlist has no row (both directions) |
| B1.9 | **(new, gate-fold, M11)** `p_clients` is **NULL** → `cross_client_singleton`, naming `wake_freeform_read` — not a silent pass through rung 1 |
| B1.10 | **(new, gate-fold, M8)** an **all-duplicate** array (e.g. `{A,A}`) → `cross_client_singleton`, naming `wake_freeform_read` — normalisation collapses it to cardinality 1 BEFORE rung 1 runs, so this is the ladder's own named refusal, never the receipt's bare `cardinality >= 2` CHECK (a raw `23514` with no `CLR*` token) |

### B.2 · The scope compilation (§3.3)

| cell | forces |
|---|---|
| B2.1 | HOME: `_freeform_scope_clients()` is **NULL** and a read sees every client of the firm — a POSITIVE read of a second client's rows, never an empty-table inference |
| B2.2 | client-pinned: returns `ARRAY[pin]`; a sibling client's rows are **not** visible (positive read of sibling fixtures returning zero) |
| B2.3 | cross-client: returns the frozen list; a client **outside** the list is not visible |
| B2.4 | armed with an **empty** array → **zero rows everywhere** (`= any('{}')` is FALSE) |
| B2.5 | the payload cannot re-arm: a second arm of either kind → `double_arm`, transaction aborts |
| B2.6 | `EXPLAIN` shows the compiler evaluated **once per statement**, not per row, over `journal_lines` (Q-1) |
| B2.7 | `clients` (S-1c) compares `id`: under a cross-client pin `{A,B}` exactly two client rows are visible — the differential twin of v1's "would return every client in the firm" |

### B.3 · S-2′ — the document arms (§3.4), the newest wall and the least exercised

| cell | forces |
|---|---|
| B3.1 | document D filed to A: A's pinned session reads D's regions; **B's reads zero** (positive read of B-side fixtures) |
| B3.2 | **the refile sequence** — file D to A, refile A→B through the real audited door, then: **A reads zero**, B reads them. The `retired_at is null` conjunct, forced as a sequence rather than a state |
| B3.3 | **multi-filing** (Y4) — D actively filed to A and B: visible under both pins, and under a cross-client `{A}` pin. A cell in the other direction too, so a future "tightening" cannot silently break `0038:1931-1942` / `0098:729-739` |
| B3.4 | **unfiled** D: invisible under every client pin and every cross-client list; **visible in HOME**. This is the deliberate divergence from `get_document_extract` (Y6, C-4) and it must be a cell, not a comment |
| B3.5 | `documents` and its extractions agree **after a refile**: B sees both or neither, A sees neither. Proves the re-cut (C-8) actually closes the incoherence a `client_id`-scoped v1 arm would have produced **had it been buildable** (Y5, gate-fold corrected — the column does not exist, so this cell tests v2's own S-2e-shaped arm, not a live v1 defect), forced in both directions |
| B3.6 | both `engine_kind`s scope identically (or, under the fail-closed default, `ocr` is invisible and `structured_parse` is visible — **whichever the owner rules at Q3, one arm of this cell is the differential twin**) |
| B3.7 | the two-hop arm does not degrade to a seq scan at ≥100k regions (Q-2) — **measured, and the number recorded**, never asserted. **(gate-fold corrected, M13):** the ≥100k rows are reached via a NAMED bulk fixture — a `generate_series`-based bulk-insert helper, owned by PR-1, extending `packages/db/tests/rig-docs-fixtures.mjs`'s existing single-row `seedRegion` — invoked by a dedicated scale-measurement pass separate from the ordinary pristine-rig estate suite (which seeds zero `document_regions` rows and would otherwise let this item close vacuously) |
| B3.8 | **(new, gate-fold, M3)** a client with an explicit **non-MYR** invoice (its `invoice.currency` sibling region ≠ `'MYR'`) named alongside an MYR client in a cross-client comparison → both clients' `monetary_cents` are returned, and the response's `engine_kind`/`field_path` columns let a reader distinguish them by joining to the `invoice.currency` sibling row — it must NOT silently fold into a comparison total undistinguished from the MYR figure (design §3.4's payload-semantics hazard) |

### B.4 · The receipt (§3.5)

| cell | forces |
|---|---|
| B4.1 | a cross-client read writes `scope='cross_client'`, `client_scope='NULL'`, `client_scope_set` = the canonical list, `verb` = the sibling |
| B4.2 | the **extend-only regressions**: a v1 `client` read and a v1 `firm` read still write and still pass their CHECKs, byte-for-byte as before |
| B4.3 | the prestate probe **aborts loudly** if `'client'`, `'firm'` or `'wake_freeform_read'` is absent from the predecessor CHECK before the swap |
| B4.4 | `scope='cross_client'` with `client_scope_set` NULL → CHECK violation; `scope='client'` with a set → CHECK violation |
| B4.5 | `client_scope_set` cardinality 1 → CHECK violation (the receipt cannot record a "cross-client" read of one client even if a future verb tried) |
| B4.6 | **completeness**: the set recorded equals the set armed equals the set the policies used — three reads, one value (design §3.7's attack 6, and F-A5b's dependency) |

### B.5 · The forgery structure, re-proven on the new surface

| cell | forces |
|---|---|
| B5.1 | a payload calling `_freeform_core` directly **cannot commit** — `double_settle`, transaction aborts, no rows returned |
| B5.2 | a payload calling `_freeform_arm_cross_client` aborts (`double_arm`) |
| B5.3 | an **unarmed** direct call to `_freeform_core` returns **zero rows** from every enumerated relation, including the two new ones |
| B5.4 | a read with no settled receipt cannot COMMIT (v1's third R-L16 cell, re-run with the sibling verb) |
| B5.5 | **cross-firm**, through the two-hop join: a firm-A session with a crafted `p_clients` containing a firm-B client id → `cross_client_unknown_client`, and a positive read of firm-B document fixtures returns zero |
| B5.6 | **(new, gate-fold blocker fold, B4)** a lawfully-armed `{A,B}` session's own payload directly `set_config`s the txn-local GUC `_freeform_scope_clients()` reads, attempting to widen it to `{A,B,C}` before its SELECT → the policies still see only `{A,B}` (a positive read of C's fixtures returns zero) and `freeform_read_log.client_scope_set` still records `{A,B}` — the forged GUC value is inert because the scope is read from the VERIFIED RECEIPT ROW `_freeform_admitted()` matches (design §3.1), not from the GUC's value directly |

---

## Annex C · Decisions

| # | decision | ground |
|---|---|---|
| **C-1** | **One sibling verb, one shared core with NO scope argument** | Y7; v1's GB-2 defect was the argument, not the sharing; TA-P11 A forbids two drifting ladders |
| **C-2** | `p_clients` is caller-supplied; the **authority** is not | TA-P9 A(2) needs a name; D-8 needs the authority to be a grant-and-allowlist fact |
| **C-3** | **The pinned client must be in the list** (client-pinned sessions only) | the named action is *"compare A with B"*, not *"read C from A's chair"*; HOME has no pin, so the rule does not apply there |
| **C-4** | **The `unassigned` disjunct is DROPPED** — a divergence from `get_document_extract` | Y6: the typed door is bounded by `p_document`; a free SELECT is not |
| **C-5** | **Multi-filing is admitted** | Y4: three estate walls exist because it is real; each filing party is a legitimate reader |
| **C-6** | `client_scope_set` is an **array with write-time validation**, not a child table | C3 stays unchanged (v1's GM-6 correction); the child table is the additive upgrade if F-A5b later needs referential enforcement |
| **C-7** | **Both `engine_kind`s admitted** — wider than the contract clause, named as such | the scoping mechanism is identical; a `structured_parse`-only line is unreproducible by a reader. **Owner question 3**; fail-closed default is `structured_parse` alone |
| **C-8** | **`documents` is re-cut onto the filings join** | Y5 (gate-fold corrected) — `documents.client_id` was DROPPED at `0007:1102-1106`, not merely frozen; a join through `document_filings` is the only way to scope a table with no `client_id` column at all |
| **C-9** | **No human confirmation gate** | TA-P9 A(2): *answered, not refused*. A dialog is a refusal with extra steps; `p_task` + law 69 already bind the act to a standing director |
| **C-10** | **Naming lives above the DB too** — a separate tool, a turn card, a detective count | a receipt row is not a name anybody sees |
| **C-11** | **v1's refusal token, message and cell are retired together** | a refusal whose action is now available is a lie the next reader will believe |
| **C-12** | **Two requests on v1's shape** (set-shaped compiler; extracted core), routed to the lead via the conductor | cheap before v1 builds, expensive after — 35 policy re-cuts, or a body move that turns PR-1 into a D1 candidate |
| **C-13** | **(new, gate-fold, M9)** Rung 2 carries no client-status conjunct — a named cross-client read admits an archived client exactly like an active one | v1's own arms carry no status conjunct either, so refusing archived clients from the named door would be narrower than HOME in the one case a bookkeeper is most likely to want, inverting A.2's incentive; removing the conjunct makes "strictly narrower than HOME" hold without exception |
| **C-14** | **(new, gate-fold blocker fold, B4)** The cross-client scope is bound to the SAME verified receipt row `_freeform_admitted()` already authenticates — never to a second, independently payload-writable GUC | a design that trusted a GUC's array VALUE directly had no mechanism, only "there is no other writer," which is an absence, not a proof; the estate's own hash/liveness idiom (`0011_daily_loop.sql:3243-3247`, `wake_context()`) is the pattern this reuses |

---

## Annex D · Predictions

**Q-1** the set compiler is a per-statement constant · **Q-2** the two-hop regions EXISTS stays
indexed at scale, measured on a rig seeded to ≥100k regions by a **NAMED bulk fixture** owned by
PR-1 (gate-fold corrected, M13 — see B3.7) — **if not, the cost is priced at PR-1, not absorbed** ·
**Q-3** `= any(uuid[])`
in a `USING` clause does not defeat index use on `client_id` · **Q-4** the CHECK swaps validate
without a long ACCESS EXCLUSIVE hold · **Q-5** a direct core call cannot commit · **Q-6** the two
jsonb columns (`envelope`, `locator`) carry nothing client-identifying that survives the scoping —
**and if they do, the exclusion list grows, never the scope**.

**Every one is a prediction until the rig prints it.** None is banked as a green, and each is named
in the acceptance record with the number it printed.

---

## Annex E · Owner questions — five, each with recommendation, default and cost

**Q1 — the pin-inclusion rule (C-3).** From a session pinned to client A, must a cross-client read
include A? *Recommendation:* **yes** — the named action is a comparison *from* A, and a session
whose receipts show reads of clients it is not pinned to produces an audit trail nobody can explain
a year later. *Fail-closed default:* the recommendation (`cross_client_pin_excluded`). *Cost:* a
bookkeeper sitting in A's chat who wants only B-vs-C must switch to HOME first — one extra step, and
the HOME allowlist row (A.2) makes it a real path, not a dead end.

**Q2 — the cardinality cap (A.3).** *Recommendation:* **25**, firm-configurable, refusing above it.
*Ground:* it keeps the policy predicate a small constant array (Q-3) and makes "compare everything"
a deliberate act. *Fail-closed default:* 25. *Cost:* a firm with 40 clients cannot ask one question
across all of them from a named read; HOME (firm-wide) answers that question instead — which is
what HOME is for.

**Q3 — does the reopened document surface include OCR, or only XLSX/DOCX? (C-7, R-L18's other
half.)** The contract clause names structured-parse content (`wave-f-contract.md:263-265`); v1's
exclusion covered `ocr` as well. *Recommendation:* **both** — the client-scoping join is identical
for either, and a client's own OCR text is exactly as legitimate as its own spreadsheet values;
drawing the line at `engine_kind` would be a rule no reader could reproduce. *Fail-closed default:*
`structured_parse` only, with `ocr` staying on the exclusion list and its ground restated.
*Cost of the default:* `read_document` → `get_document_extract` remains the only door to OCR text,
so "what did that receipt say?" stays a typed-read question and cannot be joined against the books
in one query.

**Q4 — should a cross-client read be visible to anyone besides the asker?** The design shows it in
the asking turn and counts it in a detective control (§3.6). *Recommendation:* **that, and no
more** — no notification, no approval. *Fail-closed default:* the recommendation. *The alternative,
priced:* a daily digest to the firm admin listing cross-client reads. Cheap to add later, and it is
a policy question rather than a mechanism one, so it does not block PR-1. *Note:* the owner rules
toward maximum autonomy; this question exists because "named" is a promise to a human, and the
design should not decide alone how loudly it is kept.

**Q5 — the 2026-08-23 confirmation (survey U4).** The lane order records the owner's confirmation
that v1 waits for v2; **the repo does not** — `PROGRESS.md:124/129`, the digest and ADR-0074 still
carry owner item 1 as an open visibility item at c8e9b65. *Recommendation:* **write it down** in the
same pass that lands this design — one line in `PROGRESS.md`'s F-A6 rows and a dated note under
`freeform-read-gate-record.md` §6 item 1. *Cost of not doing it:* the next reader finds a design
built on a confirmation the system of record does not contain, which is the exact failure mode
constraint 8 exists to prevent.

---

## Annex F · Risks, non-goals, acceptance

### F.1 · Risks

| # | risk | early warning |
|---|---|---|
| **R-1** | **v1 ships before the two §6 requests are heard**, and v2 pays 35 policy re-cuts plus a body extraction | the requests go to the lead **with this design**, not at v2's PR-1. The conductor's shared-surface ledger is the mechanism |
| **R-2** | **silent widening** — a client-pinned session quietly using the cross-client verb for everything, hollowing out TA-P9 A(1) | §3.6's detective count. The anomaly is "cross-client reads outnumber pinned reads in one session"; PR-4 publishes it and PR-3 shows it |
| **R-3** | the **two-hop policy** is a performance wall at scale (Q-2) — a security-shaped bug that presents as a timeout | measured at PR-1 against a **NAMED bulk fixture** (≥100k regions, `rig-docs-fixtures.mjs`'s bulk-insert helper — gate-fold corrected, M13, see B3.7), and the number is recorded in the acceptance record whether or not it is good |
| **R-4** | **(gate-fold corrected, M5)** v1 ships `documents` scoped by a column (`client_id`) that does not exist — v1's PR-1, as currently documented, cannot be created (`42703`), not merely "leaks" | survey U3 routes it to the lead **today**, before v1's PR-1 is authored, re-aimed to "cannot apply" rather than "leaks" |
| **R-5** | **F-A5b builds its coverage derivation against `client_scope_set` and this lane changes its shape** | the array-vs-child-table decision (C-6) is recorded, and the upgrade path is additive so a later change does not strand F-A5b |
| **R-6** | **the lane is never scheduled** — the standing risk of every severed item | registered at `PROGRESS.md:129`; this design's landing is the second registration, and F-A5b now depends on it, which is a third |
| **R-7** | v1's law-28 pass finds something that reshapes the ladder, and this design's §3.2 is written against the pre-finding shape | v1's pass is outstanding (U6); v2's PR-0 re-reads its findings before authoring, and says so in the change log |
| **R-8** | **(new, gate-fold, M7)** a hostile third-party document's OCR text or JSON envelope functions as an injection payload against the model's own newly-granted cross-client naming authority | §3.7 item 7 names the vector; PRD §6 invariant 5 is the standing law; PR-2's runtime tool wrapper is the named owner of applying it to this tool's results |
| **R-9** | **(new, gate-fold, M12)** `CLR10`'s retirement is a CoR to an already-merged live body (`wake_freeform_read` or `_freeform_core`), not additive DDL — a D1 write-quiesce window is needed for PR-1 regardless of request B's outcome | design §6's revised cost accounting; missing this before PR-1 is scheduled understates the ceremony window it needs |

### F.2 · Non-goals

A cross-**firm** read, in any form · a per-asker RBAC tier or a per-firm signature gate · an
unattended cross-client read (no `autodraft`/`proactive` row, ever) · the wiki relations,
`domain_events`, the metric catalog, the audit spine, the authority spine, the runtime's own state
and `firm_memberships` — v1's exclusion table stands unchanged with its ground per line · a human
confirmation gate · a restricted DSL or an NL-to-SQL rewriter (ADR-0071, already ruled, not
re-litigated) · any widening of `clara_agent_ro`.

### F.3 · Acceptance — done means the loop is walkable (TA-P14 A)

1. On **RPR** (the synthetic sandbox firm), from a session pinned to client A: a **cross-client
   comparison naming A and B** is answered, returns rows of both, and writes one receipt with
   `scope='cross_client'` and both ids in `client_scope_set`.
2. The same session naming **B and C** (excluding the pin) is **refused** `cross_client_pin_excluded`
   — and the same request **from HOME** succeeds.
3. A **client-pinned** read still sees only its own client (v1's property, re-proven, positively).
4. **The document arms, as a sequence:** file a document to A, read its regions from A, refile A→B
   through the real audited door, then read from A (**zero**) and from B (rows). An **unfiled**
   document's regions are invisible from every pin and visible in HOME.
5. The **printed audit line** reads 37 relations and its function count, and the closed-world
   allowlist cell reads four rows in both directions.
6. `cross_client_unavailable` **no longer exists** anywhere — token, message and cell.
7. **The law-28 pass has run and its findings are folded.** An acceptance item, not a review
   preference.
8. The full estate suite is green on a pristine rig, tails unfiltered, **every skip named and
   counted**, with Q-2's measured number recorded whatever it is — **measured against the NAMED
   ≥100k-region bulk fixture (B3.7, gate-fold corrected, M13), run as a dedicated scale pass, not
   inferred from the pristine rig's ordinary (zero-region) seed.**
