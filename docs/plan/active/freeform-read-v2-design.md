# F-A6 v2 — the cross-client named read: DESIGN v1

> **Design doc of record for Wave-F Track-A lane F-A6 v2 "cross-client named read"** — the limb
> severed out of F-A6 v1 by the gate-2 width ruling and registered as its own lane by **R-L17,
> 2026-08-22** (`freeform-read-gate-record.md:210-224, 267-277`; `PROGRESS.md:129`), carrying
> **R-L18's** XLSX/DOCX deferral with it (`:301-307`).
>
> **Companions.** `freeform-read-v2-survey.md` — the estate at the bytes, findings **Y1-Y9**,
> censuses, predictions **Q-1..Q-6**, and the **UNVERIFIED register U1-U6**. `freeform-read-v2-
> annexes.md` — **A** surface · **B** battery · **C** decisions · **D** predictions · **E** owner
> questions · **F** risks, non-goals, acceptance. **Where a companion and this file disagree, this
> file is the design of record and the companion is the bug**; where this file and a migration's
> printed line disagree, the printed line is right.
>
> **Binds under:** **TA-P9 A** (the read boundary — specifically **A(2)**: *a cross-client read from
> inside a client session is a NAMED, receipted action, answered rather than refused*), **TA-P4 A**
> (read and receipt in one transaction; no receipt, no read), **TA-P10 C′** (a free-query aggregate
> is narrative), **TA-P1 C** + its rider (new authority ships as a wake SIBLING verb, never a live-
> body rewrite), **TA-P14 A**. Digest laws **2, 3, 22, 27, 28, 31, 34, 36, 68, 71-76, 78-82**.
> Every build PR takes the uniform ADR-061 ladder; **§3.2, §3.3, §3.4 and §3.5 are judgement logic
> end to end** (review law 1), and **law 28's cross-model adversarial pass on the injection surface
> is a NAMED pre-merge obligation the contract itself imposes** — §3.7 carries v2's brief, and it is
> additional to v1's still-outstanding pass (survey U6).
>
> **THIS DESIGN IS WRITTEN AGAINST A THING THAT DOES NOT EXIST YET.** F-A6 v1's PR-1 is unauthored
> (survey U1) and F-A2's `interactive_client` limb is unmerged (U2). §6 therefore turns two of v2's
> requirements into **explicit, cheap requests on v1's shape** — cheap now, expensive after v1
> merges — and prices the "v1 shipped without them" branch honestly.

---

## 1 · The ruled shape (fixed, not designable)

1. **A cross-client read is ANSWERED, not refused** (TA-P9 A(2)). v1's `CLR10
   cross_client_unavailable` is a placeholder; this lane retires it, and retiring it is part of the
   deliverable — a token that can no longer fire is dead code that lies.
2. **Cross-client is a GRANT-AND-ALLOWLIST fact, never a scope argument the model can set** (D-8,
   re-grounded by v1's GB-2). The *client list* is named by the caller; the *authority to read
   across clients at all* is not.
3. **Never cross-firm.** PRD invariant (c) is untouched in every arm; `firm_id = clara.wake_firm()`
   remains the outermost conjunct of every policy.
4. **Read and receipt in ONE transaction; no receipt, no read** (TA-P4 A) — v2 inherits the
   `_freeform_admitted()` RLS conjunct unchanged, which is what makes the property structural.
5. **The forgery wall is one-arm/one-settle, not an ungranted writer** (R-L16, `gate-record:278-293`).
   v2 extends that structure; it does not re-litigate it.
6. **New authority is a SIBLING verb** (TA-P1's rider). No live human body is CoR'd.
7. **The enumerated surface is law-34 governed** — 35 relations printed as an audit line; **v2's two
   additions ARE the review event law 34 describes**, and they arrive with the arm that makes them
   safe or not at all.
8. **A free-query aggregate stays NARRATIVE** (TA-P10 C′): a cross-client comparison may be said,
   charted, exported under the watermark and cited as a reasoning input — never an authoritative
   number in a durable artifact.

---

## 2 · The findings that bind this design

**Y1** both `wake_credentials` CHECKs are closed worlds and `interactive_client ⇒ client_id not
null` is durable · **Y2** the allowlist is a two-column PK; a row is the whole mechanism ·
**Y3** the document chain is three hops, indexed at each · **Y4** a document may be **legitimately**
filed to more than one client (three walls in the estate say so) · **Y5** `documents.client_id` is
**frozen at ingest** (`0003:402-406`) and the refile path cannot move it — a v1 scoping defect this
survey found · **Y6** the typed door admits the **unassigned** document, and a free SELECT must not
· **Y7** one-arm/one-settle is what makes a shared core safe **if it has no scope argument** ·
**Y8** the policy cost lives in the pin compiler's return type · **Y9** three receipt columns move,
extend-only after D34.

---

## 3 · The design

### 3.1 The verb — one sibling, one named list, no scope argument anywhere

```
clara.wake_freeform_read_cross_client(
    p_sql text, p_purpose text, p_task uuid, p_op_key text, p_row_cap int,
    p_clients uuid[])  returns jsonb
  SECURITY INVOKER; granted to clara_freeform_ro and nothing else; its own allowlist rows.
  Holds the same four-tier ladder as wake_freeform_read, arms with the NAMED list, opens the
  cursor, settles. There is no p_scope, here or anywhere below it.
```

**`p_clients` is the named action, and it is the only new argument in the item.** TA-P9 A(2) calls
for a *named* action; a name the caller cannot supply is not a name. What the caller **cannot**
supply is the authority: the verb exists, is granted and is allowlisted, or the call refuses `CLR03`
before `p_clients` is read.

**The validation is complete, at arm time, and every arm fails closed:**

| rung | refusal | why |
|---|---|---|
| `cardinality(p_clients) < 2` | `CLR10 cross_client_singleton` — **naming `wake_freeform_read`** | a one-client "cross-client" read is a client read wearing a wider verb; the refusal points at the right door |
| any element not a live client of `clara.wake_firm()` | `CLR11 cross_client_unknown_client` | never "found in another firm and refused" — it is not visible |
| `cardinality` above the cap (Annex A.3) | `CLR10 cross_client_too_wide` | a bounded array keeps the policy predicate a constant |
| the credential is `interactive_client` and its pin is **not** in the list | `CLR10 cross_client_pin_excluded` | §3.3 |
| duplicates / ordering | normalised (dedupe + sort) before arming | the receipt is canonical, so the `op_key` derivation is stable and two identical requests are one act |

**The list is validated, then FROZEN into the arm state.** After `_freeform_arm_cross_client`
returns, nothing in the transaction can change what the policies see — the payload cannot re-arm
(`double_arm`, Y7) and there is no other writer of the state.

### 3.2 One body, one core, and why a shared core is safe HERE and was not in v1

v1 removed the shared core because it had a **`p_scope text` argument** and, under one of three
contradictory readings, was granted — *"the model could have called the core directly with
`p_scope => 'cross_client'`"* (GB-2). **The defect was the argument, not the sharing** (Y7).

v2's core has no argument that decides anything:

```
clara._freeform_core(p_sql text, p_row_cap int) returns jsonb
  SECURITY INVOKER, granted to clara_freeform_ro (forced — an INVOKER caller cannot reach an
  ungranted callee, R-L16). Reads the SCOPE from the arm state, which it cannot set.
  Opens the cursor, walks the fetch loop under the plpgsql clock check, settles.
```

- **The model can call it directly. It gains nothing.** Un-armed, `_freeform_admitted()` is false and
  every enumerated relation returns **zero rows** — the read is empty, whatever the statement.
  Armed (inside a lawful transaction), the nested call settles the one receipt this transaction
  armed, and the outer settle then raises `double_settle`, aborting the transaction the payload's
  own read would have committed in. **Exactly v1's R-L16 structure, unchanged, re-proven on the new
  surface** (B.5).
- **The alternative — duplicating the body across two verbs — is refused.** Two ladders drift, and
  TA-P11 A's test names that directly: *two mutually-unaware authority paths to the same fact are
  two architectures*. The two verbs differ in **arming** and in nothing else.

**If v1 has already shipped its ladder inline in `wake_freeform_read`** (its D-19 removed the core
as an object), v2's PR-1 **extracts** it into `_freeform_core` and leaves `wake_freeform_read` a thin
delegate with an unchanged signature — the estate's own idiom for this exact case (`0069:340`,
`0071:450-460`). That is an extraction, not a re-authoring, and it is the second §6 request.

### 3.3 The scope compilation — one shape for all three scopes

```sql
clara._freeform_scope_clients() returns uuid[]   -- STABLE, no arguments, definer
--   HOME  (interactive, no pin)        -> NULL          (firm-wide)
--   client (interactive_client)        -> ARRAY[pin]
--   cross  (armed by the sibling verb) -> the frozen, normalised named list
```

and every policy arm becomes one predicate:

```sql
(clara._freeform_scope_clients() is null
 or client_id = any(clara._freeform_scope_clients()))
```

**Three properties, each load-bearing:**

- **NULL means firm-wide, and only NULL does.** `x = any(null::uuid[])` is NULL, not true — so the
  `is null` disjunct is not decoration, it is the firm-wide arm. Writing it as `= any()` alone would
  make HOME read **nothing**; writing it without the `is null` guard and defaulting the array to
  `'{}'` would make HOME read nothing too. Both are fail-closed failures, which is the right
  direction — but the correct behaviour is the one the ladder intends, and B.2 forces both.
- **The empty set reads nothing.** `x = any('{}'::uuid[])` is FALSE. An armed-but-empty scope is
  structurally blind, so a bug in the list derivation cannot open a door.
- **It stays a per-statement constant.** No arguments + STABLE = evaluated once per statement, the
  property v1's Annex B relies on and P-6/Q-1 measure. The array return does not change that.

**`clients` keeps its own arm (S-1c), comparing `id`** — it has no `client_id` column, and v1's
finding stands verbatim: written as S-1 it would be scoped by a column that does not exist, or
"fixed" by dropping the conjunct and returning every client in the firm.

**The pin-inclusion rule (§3.1's fourth rung).** From an `interactive_client` session pinned to A,
`p_clients` must contain A. *Ground:* the named action TA-P9 A(2) describes is *"compare A with B"*,
not *"read C from A's chair"* — and a session whose receipts show reads of clients it is not pinned
to is an audit trail nobody can explain later. HOME has no pin, so the rule does not apply there;
that asymmetry is deliberate and is C-3.

### 3.4 S-2′ — the EXISTS join, and the three decisions inside it

Two new arms admit `document_extractions` and `document_regions` (R-L18's deferral, the contract's
`:263-265` clause):

```sql
-- S-2e  document_extractions (one hop)
using (firm_id = clara.wake_firm()
       and (clara._freeform_scope_clients() is null
            or exists (select 1 from clara.document_filings f
                        where f.document_id = document_extractions.document_id
                          and f.firm_id     = document_extractions.firm_id
                          and f.retired_at is null
                          and f.client_id = any(clara._freeform_scope_clients())))
       and clara._freeform_admitted())

-- S-2r  document_regions (two hops; regions carries neither client_id NOR document_id)
using (firm_id = clara.wake_firm()
       and (clara._freeform_scope_clients() is null
            or exists (select 1 from clara.document_extractions e
                         join clara.document_filings f
                           on f.document_id = e.document_id and f.firm_id = e.firm_id
                        where e.id      = document_regions.extraction_id
                          and e.firm_id = document_regions.firm_id
                          and f.retired_at is null
                          and f.client_id = any(clara._freeform_scope_clients())))
       and clara._freeform_admitted())
```

**Decision 1 — `retired_at is null` is the whole correction story.** The refile path retires the
source filing and inserts the destination one (`0009:2521-2530`). Without the filter, client A keeps
reading a document that is now client B's: **precisely the leak R-L18 named**. B.3 forces it as a
*sequence*, not a state — file to A, refile to B, then read from both pins.

**Decision 2 — the `unassigned` disjunct is DROPPED, diverging from the typed door.**
`get_document_extract` admits an unfiled document to any pin (`0011:3263-3269`, Y6). That is
defensible for a door that takes one named `p_document`; it is not for a free SELECT, where the same
disjunct makes the firm's whole unfiled intake pile readable in bulk from inside any client-pinned
session. **Under v2, an unfiled document's extraction is visible in HOME and nowhere else.**
Recorded because "the typed door does X" is the reviewer's first objection, and the answer is *the
typed door is bounded by an argument this surface does not have.*

**Decision 3 — multi-filing is ADMITTED, deliberately.** A document actively filed to A and B is
readable under either pin (Y4: three estate walls exist because it is real). Not a leak — each is a
filing party. B.3 forces it in both directions so a future "tightening" cannot quietly break the
three walls that depend on it.

**Both `engine_kind`s are admitted, and that is wider than the contract clause.** `:263-265` speaks
of XLSX/DOCX (`structured_parse`); the exclusion covered `ocr` too. Admitting only
`structured_parse` would draw a line no reader can reproduce — the scoping mechanism is identical for
both, and a client's own OCR text is exactly as legitimate as its own spreadsheet values. **Named as
a widening, priced, and put to the owner as question 3**; the fail-closed default is
`structured_parse` alone.

**`documents` moves onto the same join (Y5) — a v1 defect this lane must not build on top of.**
`documents.client_id` is frozen at ingest (`0003:402-406`) and the correction path cannot move it,
so v1's S-1 arm on `documents` leaves client A reading a document reattributed to B, and B unable to
see its own. Re-cut to S-2e's shape comparing `documents.id`, the whole document band is scoped by
**one** rule — filings — and the incoherence of "B can read the extraction but not the document row"
never arises. **The v1 half of this is routed to the lead, not folded here** (survey U3, §6).

**`document_filings` itself is unchanged**: it carries a real `client_id` and stays on S-1.

### 3.5 The receipt — two CHECK extensions and one new column, extend-only

| column | v1 | v2 |
|---|---|---|
| `verb` | `check (verb in ('wake_freeform_read'))` | **+ `'wake_freeform_read_cross_client'`**, the other value byte-identical |
| `scope` | `check (scope in ('client','firm'))` | **+ `'cross_client'`**, the other two byte-identical |
| `client_scope uuid` | NULL iff `scope <> 'client'` | **unchanged** — never re-purposed to hold "the first of the set" |
| `client_scope_set uuid[]` | — | **NEW.** NOT NULL iff `scope='cross_client'`, NULL otherwise; `cardinality >= 2`; the canonical (deduped, sorted) list |

**Extend-only, the D34 way:** drop + add, the surviving values byte-identical, and a **prestate probe
that aborts loudly if the predecessor's value is absent** — because a CHECK swap that silently
re-cuts an enumeration is how a wall quietly narrows. `clara.freeform_read_log` is a **shared
surface**: the `conductor` lane is notified before authoring, with the merge order.

**`client_scope_set` is an array, not a child table.** A child table would give a real composite FK
into `clients(id, firm_id)` and a cleaner join for F-A5b's coverage check — but it moves census C3,
which v1's GM-6 fold deliberately left unchanged, for a receipt field the arm already validates
element-by-element at write time (§3.1). **Recorded as the considered alternative** (C-6); if
F-A5b's coverage derivation later needs referential enforcement rather than write-time validation,
the child table is the upgrade and it is additive.

### 3.6 What "named" must mean above the DB (TA-P9 A(2))

A receipt row is not a name a person ever sees. Three things carry the naming upward, and none is
optional:

1. **The tool is separate in the model's surface**, with its own description and its own
   `p_clients`. A model that wants a cross-client read must choose a different tool, not pass a flag.
2. **The chat turn shows it.** The turn that issues a cross-client read renders a card naming the
   clients compared. TA-P9 A(2)'s "named" is a property of what the human sees, not only of the log.
3. **The detective control.** PR-4 publishes, beside v1's *count of `scope='firm'` reads from
   client-bound sessions (expected zero)*, the **count of cross-client reads per session and per
   client**. A client-pinned session whose cross-client reads outnumber its pinned reads is the
   silent-widening anomaly, and the control is how it is seen rather than assumed.

**No human gate.** TA-P9 A(2) says *answered, not refused*; a confirmation dialog is a refusal with
extra steps. The `p_task` binding (TA-P4) already ties the read to a real chat turn with a real
director, and law 69 re-validates that director's standing at every call.

### 3.7 Law 28's pass — v2's brief, additional to v1's

v1's own pass is still outstanding (survey U6) and this one does not replace it. **v2's brief is the
surface v2 adds.** Given a hostile SQL string and a hostile `p_clients`, can it:

1. **Widen the armed scope** — re-arm, arm twice, or reach `_freeform_arm_cross_client` before the
   verb does?
2. **Read a client not in the list** — through a join, a function, a `documents`/extraction path, or
   a policy arm whose predicate differs from the others?
3. **Reach `document_regions` for a document filed to nobody, or filed elsewhere** — the S-2′ arms
   are the newest wall and the least exercised.
4. **Cross firms** — the outermost conjunct, attacked directly and through the two-hop join.
5. **Escape through the shared core** — call `_freeform_core` directly and commit anything.
6. **Forge or suppress the receipt's `client_scope_set`** so the log understates what was read
   (which would also mislead F-A5b's export coverage check — §6).

Findings fold into v2 of this document. The pass runs on a lane independent of the author's.

---

## 4 · Censuses, walls and gates that move

**The allowlist closed-world cell: two rows → four**, asserted in both directions (§A.1). **A.1's
relation count: 35 → 37**, and the printed audit line is the truth, not the annex — **this lane is
the law-34 review event those two additions require**. **A.2's function count moves** by the sibling
verb, the cross-client arm, and (if extracted here) the shared core; the printed line governs.
**C3 is UNCHANGED and deliberately so** (C-6), preserving v1's GM-6 correction. **C10 and C11 are
re-run**, not re-cut. **The `documents` arm changes shape** (§3.4) — a v1 relation whose policy this
lane replaces, so it is listed in PR-1's inventory rather than discovered in review.

---

## 5 · Judgement logic (review law 1)

**§3.1**'s five rungs, **§3.3**'s scope compilation, **§3.4**'s three arms and **§3.5**'s CHECK
extensions all decide *whether a read is allowed and what it may see* — judgement logic end to end,
each taking an independent review pass. Three-valued where the ladder is (`pass` / `fail` /
`not_evaluable`, law 68); fail-closed on the missing, the malformed and the unknown; **a rung's own
evaluation may never raise out of the ladder**, and Tier C converts on `(sqlstate, reason)` PAIRS
only — no wildcards (v1's D6 lesson: a wildcard classifier swallows the one wall that mattered).

**Law 28's pass (§3.7) is separate and mandatory.**

---

## 6 · Dependencies, and two cheap requests on v1's shape

**Hard prerequisites:** **F-A2 PR-1 merged** (`interactive_client`, both CHECKs and both mint gates —
Y1/U2) · **F-A6 v1 PR-1..PR-4 merged** (everything this lane extends — U1).

**Two requests on v1, cheap now and expensive after v1 merges.** Both are recommendations to the
lead, routed with the `conductor`'s shared-surface ledger; neither is a unilateral change to v1's
design:

| # | request | cost if v1 declines |
|---|---|---|
| **A** | **v1 PR-1 ships `_freeform_scope_clients() returns uuid[]`** (NULL = firm-wide) and the uniform `= any()` arm, instead of the scalar `_freeform_scope_client()` | **v2 re-cuts all 35 policies** to change one predicate — 35 more ACCESS EXCLUSIVE `CREATE POLICY` locks, 35 more chances for one arm to differ from the others, and the difference between arms is exactly the class §3.7's attack 2 hunts |
| **B** | **v1 PR-1 puts the ladder + cursor loop in `_freeform_core(p_sql, p_row_cap)`** — **no scope argument** — with `wake_freeform_read` a thin delegate | v2 **extracts** it (`0069:340` / `0071:450-460` idiom) inside its own PR-1, which is a body move on a merged live function and therefore a D1 write-quiesce candidate that v2 would otherwise not need |

**Consumed BY:** **F-A5b (sandbox export)**. Its client-set derivation gets an **exact** set from a
`scope='cross_client'` receipt and only a **firm-closure** set from a HOME read
(`sandbox-export-design.md` §3.2) — so **this verb is what makes a tight cross-client sandbox export
possible at all**. Two obligations follow, and they are this lane's: `client_scope_set` must be
complete (never a subset of what was read — §3.7's attack 6), and the receipt must be readable by
F-A5b's derivation.

**No D1 write-quiesce window if request B is taken.** v2 CoRs no live body: it adds a verb, adds an
arm function, adds two policies, replaces one policy (`documents`) and swaps two CHECKs. The cost is
brief ACCESS EXCLUSIVE locks under `lock_timeout` with bounded retry (v1's P-15). **If request B is
declined, the extraction makes PR-1 a D1 candidate** and the inventory says so.

**The revised train:** PR-0 (this design + the law-28 pass) → **PR-1** (DB: the sibling verb, the
cross-client arm, the two CHECK extensions + `client_scope_set`, the S-2′ arms, the `documents`
re-cut, two allowlist rows, the printed audit line at 37/N) → **PR-2** (runtime: the second tool, the
turn card, the session reset unchanged) → **PR-3** (the human surface — the cross-client column in
`list_freeform_reads`, the detective counts) → **PR-4** (acceptance).

---

## 7 · Non-goals, and the one thing this lane retires

**Not built here:** a **cross-FIRM** read, in any form (invariant (c)) · a per-asker RBAC tier or a
per-firm signature gate (TA-P9 A(6)/(4), unchanged) · an unattended cross-client read — **no
`autodraft` or `proactive` allowlist row, ever** · the wiki relations, `domain_events`, the metric
catalog, the audit spine, the authority spine or the runtime's own state (v1's exclusion table
stands unchanged, with its ground per line) · a human confirmation gate (§3.6) · any widening of
`clara_agent_ro`'s grants.

**Retired by this lane:** v1's `CLR10 cross_client_unavailable` token, its model-facing message, and
the battery cell that forced the message to name the deferred action. **All three go together, in
PR-1**, and the change list says so — a refusal token whose action is now available is a lie the
next reader will believe.
