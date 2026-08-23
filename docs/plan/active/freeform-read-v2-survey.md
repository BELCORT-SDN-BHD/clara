# F-A6 v2 — cross-client named read: the estate as found (SURVEY v2)

> **Survey of record for Wave-F Track-A lane F-A6 v2 "cross-client named read"** — the limb severed
> out of F-A6 v1 by the gate-2 width ruling and **registered as its own lane by orchestrator ruling
> R-L17 (2026-08-22)**: `freeform-read-gate-record.md:210-224, 267-277`; `PROGRESS.md:129`.
> **v2, 2026-08-23 — PR-0 gate folded (record: `freeform-read-v2-gate-record.md`): Y5 and Y6's
> citations are trued below (both pointed at superseded bodies); U3 is re-aimed to what the citation
> fix actually implies for v1.**
> Companions: `freeform-read-v2-design.md` (the design of record) ·
> `freeform-read-v2-annexes.md` (**A** surface · **B** battery · **C** decisions · **D** predictions
> · **E** owner questions · **F** risks, non-goals, acceptance) · `freeform-read-v2-gate-record.md`
> (the PR-0 gate record).
>
> **What this lane owns, in the severance's own words** (`freeform-read-gate-record.md:216-218`,
> `:250`): the **cross-client sibling verb**, `p_scope`, the **third allowlist row**, the
> `cross_client` scope value and its cells — plus, by **R-L18** (`:303-307`), **S-2's EXISTS-join
> arm** for `document_extractions` / `document_regions`, the XLSX/DOCX structured-parse content the
> live contract says *"becomes reachable by AI-assisted read here"* (`wave-f-contract.md:263-265`)
> and v1 does not reach. **A cross-client read is a NAMED, receipted action — answered, not
> refused** (TA-P9 A(2)); v1's `CLR10 cross_client_unavailable` is the placeholder this lane
> retires.
>
> **Method.** Every finding was re-derived from migration and test text at `origin/main` c8e9b65
> and carries the line the instrument printed. Claims that cannot be settled from bytes are marked
> **UNVERIFIED** in §5 and never appear inline as assertions. **No rig replay was run** — this lane
> CoRs no live body, and the objects it extends (`clara.freeform_read_log`'s hardened columns, the
> `_freeform_*` function family, the 35 policies) **do not exist yet**: they are F-A6 v1's PR-1.
> §5 is therefore the most important section in this file.

---

## 1 · The two things this lane must deliver, and the fact that binds both

**Delivery 1 — the sibling verb.** TA-P9 A(1) scopes a client-bound session's free read to that
client server-side; A(2) says a cross-client read from inside such a session is *"a NAMED, receipted
action, answered rather than refused"*. v1 refuses it and names the deferred action
(`freeform-read-design.md:41-42, 121-126, 371`). **R-L17 accepted that as SEQUENCING, not as a
narrowing** — the verb cannot function until F-A2's `interactive_client` limb merges — and item 1
stayed on the owner's list as a visibility item (`gate-record:267-277`). **The lane order records
the owner's 2026-08-23 confirmation that v1 waits for v2; that confirmation is not yet written into
the repo (U4).**

**Delivery 2 — S-2's EXISTS join.** `document_extractions` / `document_regions` are excluded from
v1 because they carry no `client_id`, *"so under a client pin they would leak sibling clients' OCR
text"* and structured-parse (XLSX/DOCX) content (`freeform-read-design.md:240-249`;
`freeform-read-annexes-1-mechanics.md`, A.1's exclusion table). R-L18 accepted the exclusion and
required the deferral be **shown, not inferred** — a dated `[TA-2026-08-22]` note under the
contract's clause. **v2's shape was named but not designed: "the EXISTS join to `document_filings`."**
This survey establishes what that join must actually be, and finds three decisions inside it that
the one-line description hides (**Y3, Y4, Y5**).

**The fact that binds both:** the scope of a free read is compiled **from the credential, never from
a tool argument** (`freeform-read-design.md:234-236`) — *"which is the whole of TA-P9 A(1)"*. A
cross-client read must therefore be a **grant-and-allowlist fact**, not an argument the model can
set (D-8, `freeform-read-annexes-2-record.md:202`) — while simultaneously carrying a **named client
list**, which *is* an argument. §Y7 is where that tension resolves.

---

## 2 · Findings — the estate at the bytes

### Y1 · `interactive_client` is unmintable today; both CHECKs are closed worlds

`0011:618-628` — one ALTER doing four things:

```
add constraint ck_wake_credentials_kind_0011   check (wake_kind in ('interactive','proactive','autodraft'))   -- :623-624
add constraint ck_wake_credentials_client_0011 check (
  (wake_kind='autodraft' and client_id is not null)
  or (wake_kind in ('interactive','proactive') and client_id is null))                                        -- :625-627
```

Both are **enumerations**, so both must be EXTENDED for `interactive_client` to exist — F-A2's D34
does exactly that: the kind CHECK gains the name, the client CHECK gains a **third disjunct**
`or (wake_kind='interactive_client' and client_id is not null)` with the three existing disjuncts
byte-identical, and `mint_wake_credential`'s **second, earlier** kind gate at `0011:1163-1165` is
extended too (`f-a2-annexes-2-mechanics.md:340-354, 440-442`).

**Consequence for this lane:** `interactive_client` ⇒ `client_id is not null` is a **durable CHECK**,
which is why v1 could declare its `scope_unpinned` assert unreachable (D-23). v2 inherits that
guarantee and must not weaken it: the cross-client verb does **not** need an unpinned
`interactive_client` credential, and asking for one would reopen the C-3 hazard F-A2 closed.

### Y2 · `wake_fn_allowlist` is a two-column PK — a new row is the whole mechanism

`0002:247-251`: `(wake_kind text, function_name text)`, primary key both. Adding a verb to a kind is
one row; `clara.assert_wake_allowed(kind, name)` is the only reader. **This is why "cross-client is
a grant-and-allowlist fact" is buildable at all** — and why v1's closed-world cell asserts the row
count **in both directions** (`freeform-read-design.md:374-376`: *"a closed-world cell asserting the
count in both directions … v2 EXTENDS the roster with its sibling's row rather than re-cutting it"*).

### Y3 · The document chain has THREE hops and no client column until the third

Verified at the bytes:

| relation | client column? | the link out | index available |
|---|---|---|---|
| `clara.document_regions` (`0007:203-220`) | **none** | `extraction_id` → extractions | `ix_document_regions_extraction (extraction_id, field_path)` (`:221`) |
| `clara.document_extractions` (`0007:183-199`) | **none** | `document_id` (+`firm_id`, composite FK) | `unique (document_id, engine_id, version_n)` (`:196`) — a usable `document_id` prefix |
| `clara.document_filings` (`0007:63-92`) | **`client_id not null`** | `document_id` | `uq_document_filing_active (document_id, client_id) where retired_at is null` (`:93-94`) · `ix_document_filings_document (document_id, filed_at desc)` (`:97`) |

So the regions arm is a **two-hop** EXISTS (regions → extractions → filings) and the extractions arm
a **one-hop**. Both hops land on an index. `document_regions.text_content`, `monetary_raw` and
`monetary_cents` are the payload the scoping protects; `engine_kind` is closed to
`('ocr','structured_parse')` (`0007:188`), the second value being the XLSX/DOCX content the contract
names.

### Y4 · A document may be LEGITIMATELY filed to MORE THAN ONE client — this is not a leak

`uq_document_filing_active` is keyed on the **pair** `(document_id, client_id)`, so two active
filings of one document to two clients are admissible — and the estate says so in three places, in
its own words:

- `0020:614` — *"must keep working for a document legitimately filed to more than one client. The
  uniqueness …"*
- `0038:1931-1942` — *"THE CLIENT, THROUGH THE FILINGS. Exactly one active filing, or nothing to
  answer"*, raising *"document % is filed to % clients; a statement filed to more than one client
  has no single answerable client"*
- `0098:729-739` — the same wall, re-cut in F-A1.

**So the EXISTS join admits a multi-filed document under every pin it is filed to, and that is
correct** — each of those clients is a filing party. R-L18's leak is the *other-client* and
*unfiled* document, not the multi-filed one. A design that "fixed" multi-filing would break the
three walls above, which exist precisely because it is real.

### Y5 · `retired_at` is the whole of the correction story, and `documents.client_id` does not exist — a gate-fold correction, both to the mechanism AND the failure mode

**Gate-fold correction (2026-08-23).** This finding originally cited `documents.client_id` as
"frozen at ingest" by the identity trigger at `0003:402-406`. That trigger body is superseded: the
column itself was DROPPED, in full, at `0007_document_pipeline.sql:1102-1106` (`drop index
clara.ix_documents_client_recent; alter table clara.documents drop constraint
documents_client_id_fkey; alter table clara.documents drop column client_id;`), and the identity
trigger was recut in the SAME migration (`:923-933`) to an identity conjunct of only `id`/`sha256`/
`firm_id` — client_id is gone from the trigger too. `0040_wave_c_c_tieout.sql:168-174` carries a
live tripwire (probe 9b) that raises if the column ever reappears. No later migration re-adds it.

The refile path (`0009:2521-2530`) **retires** the source filing (`set retired_at=now(), retired_by,
retirement_reason, correction_id`) and inserts the destination filing. It does **not** touch
`clara.documents` — and it could not, even if it tried: the column that "would need moving" has not
existed since `0007`. `file_document` (`0009:2336-2340`) writes only `document_filings`; the column
was backfilled INTO filings once, at `0007:825-826` (*"from clara.documents d where d.client_id is
not null"*), then dropped from `documents` ~280 lines later in the same file (`:1105-1106`) — reading
only the backfill and stopping there, without reading to the drop, is exactly how the original
mis-citation happened.

**This is a finding about v1, not only about v2 — and what it says about v1 changed.** v1's A.1 puts
`documents` in band "documents as filed" under **arm S-1**, which scopes by
`client_id = _freeform_scope_client()`. Since `documents.client_id` does not exist at the live
schema at all, `create policy … using (client_id = …)` on `clara.documents` fails DDL outright —
`42703`, undefined column. **So v1's PR-1, as currently documented, cannot apply — not "ships a
leak."** The leak narrative this finding originally told (A still sees a reattributed document, B
cannot see its own) requires a column that was never there to leak through. Confirming the actual
live policy: `clara.documents`' real, currently-live RLS (`0003_books_core.sql:511-515`) is
firm-scoped only (`using (firm_id = clara.jwt_firm())`) — client attribution for document reads has
lived on `clara.document_filings.client_id` since `0007`, not on `documents` at all.

**Two prior instances of this exact mistake are already on record in this repo** — direct evidence
of institutional memory the survey should have consulted: `0055_client_facts_trio.sql:546-548`
("the CLIENT relation is read from FILINGS, not from documents: 0007:1105 DROPPED
documents.client_id (this door's first cut read the dropped column from 0003's file text — the x55
battery caught it; file text is not the live schema...)") and
`0091_f_a1_identity_helper.sql:86-88` ("`documents.client_id` existed at 0003:67 and is GONE at the
frontier — Slice-5 moved client attribution onto clara.document_filings.").

**The design's §3.4 re-cuts `documents` onto the filings join regardless** — a join through
`document_filings` is the only way to scope a table with no `client_id` column at all, so the fix is
unchanged even though the premise was wrong. **What v1 needs to know today (§5 U3) is re-aimed: not
"your S-1 arm on `documents` leaks," but "your S-1 arm on `documents`, as currently documented,
cannot be created."**

### Y6 · The typed door admits the UNASSIGNED document — a divergence v2 must decide, not inherit

**Gate-fold correction (2026-08-23):** `clara.get_document_extract` was recut with `create or
replace` twice past `0011` — once at `0054_region_ordinal.sql:203`, and again at the current LIVE
body, `0090_f_a1_walls.sql:1558-1684` (closed by `alter function … owner to clara_fn_owner` at
`:1684`; no later recut exists). The `unassigned` disjunct's TEXT is byte-identical across all three
generations — only its absolute line number moved, from `0011:3263-3269` to the live
`0090:1587-1593`, as the surrounding function grew (0054 added region-ordinal machinery, 0090 added
the M14 witness-kind envelope exclusion and the M7 `extracted_at` read-seam widening). The live body
computes `not exists(... f.document_id=d.id and f.retired_at is null) as unassigned` (`0090:1587`)
and then admits `d.unassigned or exists(... f.client_id=p_client and f.retired_at is null)`
(`0090:1591-1593`) — same shape, live location.

So the typed door lets **any** client pin read an **unfiled** document's extract. That is defensible
there: the door takes `p_document` — one named document, one row — and the caller must already know
the id. **A free SELECT has no such bound**: the same disjunct in an RLS policy makes the firm's
entire unfiled intake pile readable from inside any client-pinned session, in bulk, by one
`select text_content from clara.document_regions`. The design refuses the disjunct and records the
divergence rather than inheriting it silently (§3.4, C-4).

### Y7 · The one-arm/one-settle structure is what lets a sibling verb exist at all

v1's GB-1 fold (R-L16, `gate-record:278-293`) established the shape this lane must extend:
`wake_freeform_read` is **SECURITY INVOKER** (the SQL must run as the caller), so its DEFINER
writers `_freeform_arm` / `_freeform_settle` are **necessarily granted** — and the forgery is closed
structurally instead: `_freeform_settle` **takes no read id**, and a **second** arm or settle in one
transaction RAISES (`CLR10 double_arm` / `double_settle`), which aborts the transaction the forged
receipt would have committed in (`freeform-read-design.md:129-146`).

**That structure is what makes a shared core safe for v2.** v1 removed the core because it had a
`p_scope text` argument and was (in one of three contradictory places) granted — *"under the granted
reading the model could have called the core directly with `p_scope => 'cross_client'`"*
(`freeform-read-annexes-1-mechanics.md`, A.2's D-21 note). The defect was **the argument**, not the
sharing. A core with **no scope argument**, reading the scope from the arm state, cannot be told a
scope by anyone — and any attempt to re-arm dies on `double_arm`. §3.2 of the design builds on that.

### Y8 · The policy arm is where the cost lives — 35 relations, one predicate shape

v1's arms (`freeform-read-annexes-1-mechanics.md`, Annex B) are four shapes over 35 relations:
S-1 (`client_id = _freeform_scope_client()`), S-1c (`clients`, comparing `id`), S-3 (global
reference), S-4 (identity). **Every one of them embeds the scalar pin.** Admitting a *set* means
touching all 35 — unless the pin compiler returns a set from the start.

`_freeform_scope_client()` is STABLE with no arguments, *"so it is a per-statement constant
expression, not a per-row call"* (Annex B's own note, and v1's P-6 measures it). **A `uuid[]`-valued
sibling has the same property**, and `client_id = any(<constant array>)` stays a per-statement
constant on the right-hand side. So the set-shaped compiler costs nothing that the scalar does not —
**if v1 builds it that way.** It has not built anything yet (U1).

**And the empty case is naturally fail-closed:** `x = any('{}'::uuid[])` is FALSE, so an armed-but-
empty scope reads nothing. `x = any(null::uuid[])` is NULL, so the arm must be written
`(<set> is null or client_id = any(<set>))` with NULL meaning firm-wide — exactly the shape v1
already uses for its scalar.

### Y9 · Three receipt columns move, and all three are extend-only after D34

v1's Annex C gives `clara.freeform_read_log`:
`verb text not null check (verb in ('wake_freeform_read'))` — annotated *"v2 EXTENDS (D34 idiom)"* —
and `scope text not null check (scope in ('client','firm'))` — annotated *"v2 adds 'cross_client'"* —
plus `client_scope uuid` (*"NULL iff scope <> 'client'; never false-by-inference"*).

The base table today is `0002:308-315`: six columns, **every one nullable except `at`**, no client
column of any kind, no verb, no scope. So v2's "CHECK extensions" are extensions of columns that do
not exist yet, on a table F-A6 v1 hardens. **The extend-only discipline is the D34 precedent**: drop
+ add with the existing values byte-identical, a prestate probe that aborts loudly if the
predecessor's value is absent (`gate-record:332`: *"are extend-only after D34 — F-A6 adds no wake
kind; v2 extends, never re-cuts"*).

---

## 3 · Censuses this lane moves

| census | v1 | after v2 | note |
|---|---|---|---|
| the allowlist closed-world cell | **two rows** exactly, both directions (`freeform-read-design.md:374-376`) | **four** (§3.3) | the count is asserted from the catalog, never from an annex |
| A.1 relation count | **35**, printed as an audit line (law 34) | **37** (+ `document_extractions`, `document_regions`) | *"addition is a review event by law 34's own terms"* — this lane IS that review event |
| A.2 function count | **SEVEN** (D-21) | **eight or nine** (§3.2: the sibling verb + the set compiler; the shared core if v1 did not build one) | the migration's printed line is the truth; the annex is the bug if they differ |
| C3 (the table census) | **UNCHANGED** — v1 creates no table (GM-6) | **UNCHANGED**, and deliberately (C-6 keeps the named client list an array, not a child table) | preserving GM-6's correction |
| the arm-shape count | four (S-1, S-1c, S-3, S-4) | **six** (+ S-2e, S-2r) — or five if `documents` folds onto S-2e (§3.4) | |

---

## 4 · Predictions

| # | prediction | how it is settled |
|---|---|---|
| **Q-1** | `_freeform_scope_clients()` (STABLE, no args) is evaluated **once per statement**, not per row, with a `uuid[]` return | `EXPLAIN (ANALYZE)` on the pinned image over `journal_lines`; v1's P-6 with an array return |
| **Q-2** | The two-hop regions EXISTS uses `ix_document_regions_extraction`'s PK side and `uq_document_filing_active`, and does **not** degrade to a seq scan over `document_filings` per region row | measured on a rig seeded to **≥100k `document_regions` rows via a NAMED bulk fixture** — a `generate_series`-based bulk-insert helper, owned by PR-1, added to `packages/db/tests/rig-docs-fixtures.mjs` alongside its existing single-row `seedRegion` and invoked by a dedicated scale-measurement pass, distinct from the ordinary pristine-rig estate suite (which seeds zero `document_regions` rows by design and would otherwise close this acceptance item vacuously); **if it degrades, the cost is real and priced, not absorbed** |
| **Q-3** | `= any(<uuid[]>)` inside an RLS `USING` clause does not defeat index use on `client_id` for the S-1 relations | measured; the fallback is `IN`-list expansion or a `VALUES` join, both worse |
| **Q-4** | The `scope`/`verb` CHECK swaps validate on a populated `freeform_read_log` without a long ACCESS EXCLUSIVE hold | `lock_timeout` + bounded retry, v1's P-15 shape |
| **Q-5** | A payload calling the shared core directly cannot commit — it aborts on `double_settle` | forced cell (B.5); this is v1's R-L16 structure re-proven on the new surface |
| **Q-6** | `document_extractions.envelope` and `document_regions.locator` (both jsonb) carry no client-identifying content that survives the scoping | inspected on real fixtures at PR-1; if they do, the exclusion list grows, never the scope |

---

## 5 · The UNVERIFIED register

**U1 · Nothing this lane extends exists yet.** F-A6 v1's PR-1 has not been authored, let alone
merged: the two roles, the 35 policies, the `_freeform_*` family and the hardened
`freeform_read_log` are all design text. **Every "v2 extends X" in this set is conditional on X
being built as v1's design describes it.** The design's §6 turns two of those conditions into
explicit requests on v1's shape, precisely because a request is cheap before v1 builds and expensive
after.

**U2 · F-A2's `interactive_client` limb is designed (v6, D34) but not merged.** `0011:623-627` is
still the closed world of Y1 at c8e9b65. The sibling verb's `interactive_client` allowlist row and
every client-pinned cell depend on it.

**U3 · `documents`' scoping defect (Y5) is a v1 finding this survey produced, not a v1 decision —
re-aimed by the 2026-08-23 gate fold.** It is UNVERIFIED whether F-A6 v1 intends `documents` to be
scoped by `documents.client_id`; A.1's band assignment (S-1) says so, but no F-A6 document discusses
that the column does not exist at the live schema (Y5). **The routed fact changed with Y5's
citation fix:** it is not "v1's `documents` arm leaks after a filing correction" — it is "v1's
`documents` arm, scoped by `client_id = _freeform_scope_client()` as currently documented, cannot be
created at all (`42703`, undefined column)." **Routed to the lead as a cross-item item, not folded
unilaterally** — it is v1's design, not this lane's.

**U4 · The owner's 2026-08-23 confirmation** that v1 waits for v2 is recorded in this lane's work
order and is **not present** in `PROGRESS.md:124/129`, `docs/adr/README.md` or ADR-0074 at c8e9b65,
where owner item 1 still reads as open visibility. **Flagged as a docs-truing item.** This design
proceeds on R-L17's ruling of record, which stands regardless.

**U5 · No rig replay.** No live body is CoR'd. The three walls quoted in Y4 (`0038:1931-1942`,
`0098:729-739`) were read as migration text; the **live** bodies must be re-derived by
`pg_get_functiondef` at the frontier before any cell depends on their exact refusal shape — bodies
are spliced across generations and the text in one file is not the live body.

**U6 · The law-28 cross-model pass on v1's injection surface is still outstanding**
(`freeform-read-gate-record.md:17`). v2 widens that surface (a second verb, a named client list, two
new relations carrying document bodies) — **v2's own pass is additional, not a substitute**, and the
design's §3.7 states its brief.

**U7 · A NIT found in passing, folded here rather than left to a builder.** The F-A6 v1 set cites
the contract's XLSX/DOCX clause as `wave-f-contract.md:257-259` (`freeform-read-design.md:245-246`,
`freeform-read-annexes-1-mechanics.md`'s exclusion table, `freeform-read-gate-record.md:296-297`).
**At c8e9b65 the clause is at `:263-265`** and `:257-259` lands inside the receipt-fields bullet;
the R-L18 deferral note the gate required is at `:267-273`. The F-A5 set drifts the same way — its
gate record cites *"render re-queue including drift consent"* at `wave-f-contract.md:214`, which is
now `:220`. **Both are almost certainly the 2026-08-23 split pass moving lines under stable cites**
(`PROGRESS.md:455-465`), not an authoring error — and both are cheap now and expensive inside a
build window. **This set uses `:263-265`.** Routed as a nit to the lead with U3.
