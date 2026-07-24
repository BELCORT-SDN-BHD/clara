# Migration 0019 — the wiki authority boundary (WB-R21 · WB-R24(ii)) · design contract RATIFIED v1.0

> **Status: RATIFIED v1.0 — build-ready.** Ratification followed the ADR-037 method:
> orchestrator draft v0.1 from the 0019 grounding dossier (workflow `wl5dup6jb`, key
> `result.d19`) → a Codex `gpt-5.6-sol` xhigh **adversarial design debate**, which
> returned REJECT-as-build-ready with **8 BINDING AMENDMENTS** and per-section verdicts
> → **orchestrator adjudication** (all 8 accepted; every debate line-citation
> independently re-verified against the source — corrections recorded in the changelog).
> Scope is fixed by rulings **WB-R21** + **WB-R24(ii)**
> (`docs/plan/research/wave-b/ruling-batch-adr-037.md:57-77,129-131`) and is neither
> widened nor narrowed here.
>
> This contract states **WHAT must hold and HOW it is verified**, precisely enough for a
> **blind SQL-build lane** and a **blind test lane** to work from it independently. It
> contains no implementation SQL. Downstream discipline mirrors 0018: blind lanes → rig
> reconcile with orchestrator adjudication → cross-model ratchet → dual review → the
> owner-gated ceremony (§11). **No workflow-body changes; zero freeze-manifest
> implication** — the consumer loop is a `startWorld` runtime plugin
> (`packages/runtime/plugins/startWorld.ts:218`), not a frozen WDK workflow, so no `_vN`
> bump and `check-frozen-workflows.mjs` does not apply.

## 0. Scope

The wiki authority boundary, per WB-R24(ii): **(a)** remove the R2-F2 EXISTS-veto so a
money correction/retirement proceeds atomically in the authority domain, and drive
stale-marking from the retirement EVENT; **(b)** the monotonic `projected_from_seq`
guard on the projection writer; **(c)** the zero-wiki-reads closed-set tail assertion
that supersedes 0017's narrower exclusion loop.

Concretely, one DB migration `0019` (0018 is the current highest on disk) delivering:
the veto removal **with the non-wiki client-row serializer preserved** (§1), the
citation/ref stale marker **plus its supporting indexes** (§2), the
`mark_wiki_citations_stale` writer (§3), the lint finding class **with the inverted
scan** (§6), the read-surface marking (§7), the monotonic guard **as a typed terminal
refusal** (§5), and the clean-end-state tail (§9); PLUS consumer-library changes (§4) —
the `document.filing_retired` subscription, the stale lane, the new terminal-status
mapping, and the named ceremony catch-up verb (§11).

**OUT of 0019:** consent/privacy (0020, WB-R23) · the commit-lane review-attestation
(WB-R22) · any new wiki *page* lifecycle state · treatment/recurring-pattern synthesis ·
a general document→client runtime resolver (0020's concern) · **any widening of the
`clara_runtime` table read surface** (notably `document_filings`, which `clara_runtime`
cannot read today — 0007:2740-2741; see §11).

**Not added, and deliberately so:** the retirement EVENT — `document.filing_retired`
already exists and is registered (**0007:2685**), emitted by both authority fns since
0007/0009. And **no new event type at all**: `wiki.citations_staled` is DROPPED from
0019 (§3, amendment 4).

## 1. The veto as-built → removal, with the serializer preserved (D4a · amendment 1)

**As-built.** `clara._assert_filing_wiki_unreferenced(p_firm,p_client,p_document)
returns void` — 0017:1808-1845, SECURITY DEFINER. Its own header comment
(**0017:1805-1807**) states the design intent explicitly: *"Filing retirement/move and
wiki publication serialize on the same client row."* The body does two separable things:

1. **Serializes** — `perform 1 from clara.clients c where c.id=p_client and
   c.firm_id=p_firm for update;` with a `not found` → **CLR11** raise (0017:1813-1817).
   This is the SAME row lock `_publish_wiki_page_version_core` takes at
   **0017:2049-2053** (also CLR11 on not-found). It is the publication/retirement
   serializer.
2. **Vetoes** — aggregates BLOCKERS from `wiki_page_citations` on an active page's
   `current_version_id` (0017:1821-1828) UNION `wiki_page_refs` with
   `ref_kind='document'` on active pages (0017:1830-1836), and raises **CLR10** /
   `{reason:'active_wiki_document_reference'}` if any exists (0017:1838-1844). It is the
   **only** reader of wiki tables among authority fns and the **only** producer of that
   reason string anywhere.

Two call sites, inserted at 0017-apply via a `do $cor$` block (0017:1850-1897) that
`pg_get_functiondef → replace → execute`s each body (so a bare grep for
`create function retire_document_filing` still finds only 0007):
- `retire_document_filing(uuid,text,uuid,text)` — `perform
  clara._assert_filing_wiki_unreferenced(f.firm_id,f.client_id,f.document_id);`
  after the CLR17 stale-revision check, before the retirement UPDATE (0017:1859-1861).
- `approve_wrong_client_correction(uuid,text,text,text)` — `perform
  clara._assert_filing_wiki_unreferenced(c.firm,x.from_client,x.document_id);`
  after the CLR19 source-filing check (0017:1881-1884).

**Target (D4a, amended) — symmetric inverse of the 0017 insertion, minus the veto,
plus the lock.** 0019 re-runs the same `do $cor$` idiom in reverse:
`pg_get_functiondef` each live body → `replace(<the perform line + its comment>,
<a plain client-row lock>)` → `execute`. The replacement is **NOT an empty string**:

> Each patched body must retain, at **exactly the position the `perform` call
> occupied**, a plain non-wiki client-row lock with the same shape and the same
> not-found refusal the helper had: lock `clara.clients` on `(id, firm_id)` `for update`
> for the filing's client/firm, raising **CLR11** when not found.

Then **`DROP FUNCTION clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid);`**

**Drift-guard on the patch** (apply aborts otherwise): (i) the `replace` changed the body
(`v_next <> v_def`); (ii) the resulting normalized body no longer contains
`_assert_filing_wiki_unreferenced`; (iii) the resulting normalized body DOES contain the
client-row `for update` token and its CLR11 raise; (iv) that lock still **precedes** the
`update clara.document_filings set retired_at` token — the 0017 pins' own ordering idiom
(0017:1864-1871, 1886-1894), preserved for the lock rather than the veto.

**Why the position matters (lock ordering — no new deadlock class).** Keeping the lock
where the `perform` was preserves the as-built acquisition order exactly:
- publication: `clients` FOR UPDATE (0017:2049-2050) → `wiki_pages` FOR UPDATE (2054-2056);
- retirement: `document_filings` FOR UPDATE (0007:1445) → CLR17 checks (0007:1447-1448) →
  **`clients` FOR UPDATE** → the retirement UPDATE (0007:1457-1458);
- correction: `filing_corrections` FOR UPDATE (0009:2440) → `document_filings` FOR UPDATE
  (0009:2452-2453) → CLR19 source-filing check (0009:2456) → **`clients` FOR UPDATE** →
  the entry locks (0009:2457-2458).

Publication never locks `document_filings` — its active-filing floor is an unlocked read
(0017:2115-2121, 2157-2163) — so the two orders share no cycle. This is the identical
lock graph 0017 shipped; 0019 changes nothing about it.

**Non-wiki blockers MUST survive** the patch (regression-critical), and each belongs to
ONE body — the tail asserts them per-function, never both-in-both (§9):
- `retire_document_filing`: the CLR17 already-retired guard (0007:1447), the CLR17
  stale-revision guard (0007:1448), and the journal-entry live-blocker (0007:1449-1456).
- `approve_wrong_client_correction`: the CLR19 source-filing guard (0009:2456) — and the
  other CLR19 guards around it (maker/checker 0009:2443-2447, books-version 0009:2449-2450,
  item-state 0009:2459-2462, closed-period 0009:2463-2466) are untouched.

**What changes semantically.** Publication and retirement still **serialize** on the
client row; what disappears is the *veto*. Once serialized, retirement proceeds
unconditionally in the authority domain and the wiki converges by stale-marking
(§10 R2-F2c).

## 2. The stale marker — citation/ref columns + indexes (D1 · amendment 6)

**No stale/invalidation concept exists today:** `wiki_pages.state ∈
('active','retired')` (0017:833), `wiki_page_versions.state` has no `'stale'`
(0017:867-868), and `wiki_page_citations` / `wiki_page_refs` have **no lifecycle
column** (0017:891-924, 926-965). D1 pins a **citation/ref-level** marker and **NO new
page state**.

Both reference relations the veto scanned gain the same additive pair (a document is
referenced as a citation on a version OR as a page-level `ref_kind='document'` ref —
both must be markable):

- **`clara.wiki_page_citations`** and **`clara.wiki_page_refs`** each gain:
  - `stale_at timestamptz null`
  - `stale_reason text null check (stale_reason in ('source_filing_retired'))`
  - paired presence CHECK: `((stale_at is null) = (stale_reason is null))`
    — the 0018 `bound_scope` additive-pair pattern (**0018:36-44**).

Columns are additive and nullable → all existing rows are unmarked (`stale_at is null`)
and every existing read is byte-identical until a writer marks a row. The
`stale_reason` enum is single-valued now (`'source_filing_retired'`); it is the
extension seam for future reasons, mirroring 0018's single-valued `bound_scope_kind`.

**History claim — CORRECTED (amendment / debate O-4).** The two relations have
*different* lifecycles and the contract must not conflate them:
- **Citations are versioned and immutable.** They hang off `version_id`
  (0017:2128-2131); superseded versions keep theirs untouched forever. A stale mark on
  a citation of a **current** version is a flag on live provenance; the row is retained,
  never deleted.
- **Refs are PAGE-LEVEL MUTABLE rows.** `_publish_wiki_page_version_core` does
  `delete from clara.wiki_page_refs where page_id=v_page;` on every republish
  (**0017:2134**) and re-inserts them (0017:2164-2166). A ref's stale mark therefore
  **does not survive a republish** — and must not be claimed as immutable history. This
  is correct and intended: a republish re-validates every document ref against the
  active-filing floor (0017:2157-2163, CLR02), so a re-created ref is provably live.

**Indexes (new — the tables ship with NONE).** 0017 creates no index on either relation
beyond the PK; the composite FKs do not index the referencing side. 0019 MUST add index
coverage for the three new predicate shapes, and the §9 tail carries EXPLAIN-backed
proof (see §9 "Plan coverage"):
1. **Writer + catch-up scan** — `wiki_page_citations` by `(document_id, version_id)`
   restricted to live rows, and `wiki_page_refs` by `(document_id, page_id)` for
   `ref_kind='document'`.
2. **Lint scan** — the stale-marked lookup on each relation (a partial index on
   `stale_at is not null` is the cheap shape) and the page-join key
   (`wiki_page_citations(version_id)`, `wiki_page_refs(page_id)`).
3. **Read predicates** — the `has_stale_sources` EXISTS in `get_wiki_page` /
   `list_wiki_pages` / the pack (§7) reuses (2).

The exact index definitions are the builder's; the **required coverage** above is the
contract. The inverted-lint side needs nothing new: `uq_document_filing_active` on
`clara.document_filings(document_id, client_id) where retired_at is null`
(**0007:93-94**) already serves the `NOT EXISTS` probe.

## 3. The writer — `mark_wiki_citations_stale` (D2 · amendments 4, 5)

**New:** `clara.mark_wiki_citations_stale(p_client uuid, p_document uuid, p_reason
text, p_op_key text) returns jsonb` — SECURITY DEFINER, `set
search_path=clara,pg_temp`, created under `set role clara_fn_owner`, `revoke all from
public`, **`grant execute to clara_runtime` ONLY** (never `clara_authenticated`,
`clara_agent_ro`, `clara_wake_*` — the runtime-only ACL matrix, mirroring
`set_wiki_synthesis_hold` in the 0017:5125-5135 grant block).

**Scope of the mark — live sources only.** `p_document`'s references for `p_client`
(firm resolved from the client, as every wiki writer does — 0017:2199-2200):
- (i) `wiki_page_citations` rows whose `version_id` is the `current_version_id` of an
  **active** page of `(p_client, firm)`, with `document_id=p_document` and
  `stale_at is null`;
- (ii) `wiki_page_refs` rows on an **active** page of `(p_client, firm)` with
  `ref_kind='document'`, `document_id=p_document` and `stale_at is null`.

That is the exact blocker scope the veto scanned (0017:1821-1836), flipped from a raise
into a mark. **Superseded-version citations and retired-page rows are NEVER touched.**
A later publication that re-cites the now-retired document cannot happen: the CLR02
active-filing floor already refuses it for both citations (0017:2115-2121) and refs
(0017:2157-2163) — 0019 adds no new prevention there (debate O-5).

Sets `stale_at = now()`, `stale_reason = p_reason`. Validates `p_reason` against the same
allowed set as the column CHECK (currently `'source_filing_retired'`) — else a typed
refusal.

**Receipt (closed shape).**
`{document_id, reason, citations_marked, refs_marked, status}` with
`status ∈ {'marked','noop'}`; `status='noop'` **iff** `citations_marked + refs_marked = 0`.

**Idempotency — three DISTINCT cases, all pinned (amendment 5).** The draft conflated
these; they are separate mechanisms with separate observable results:

| Case | Mechanism | Result |
|---|---|---|
| **(a) Same op key, same args** (event redelivery at the same seq) | `_reserve_op` returns the stored result (0004:43-60) | The **original receipt, byte-identical** — including its original non-zero counts. No re-scan, no new audit/log row. |
| **(b) DIFFERENT op key, rows already marked** (a repair run, a later sweep) | fresh reservation → the `stale_at is null` filter matches nothing | A clean zero-match receipt `{citations_marked:0, refs_marked:0, status:'noop'}`. First call's `stale_at` preserved. |
| **(c) Same op key, CHANGED args** | `_reserve_op` hash mismatch (0004:56-58) | **CLR10 refusal** `'op_key reused with different args'`. |

Case (a) vs (b) is why the catch-up op key must carry a ceremony **run key** (§11): a
fixed `wikistale-catchup:<client>:<document>` key would replay case (a) forever, so a
later repair run would never examine fresh rows.

**Audit — positive changes only; NO domain event.**
- `clara.wiki_log` gains `action='mark_stale'` (the CHECK at 0017:972-973 is ALTERed to
  add it), written **only when `status='marked'`**, with `page_id` set where the mark is
  page-attributable and `detail` carrying `{document_id, reason, citations_marked,
  refs_marked}`.
- `clara._audit(...)` likewise **only when `status='marked'`**.
  (Precedent for conditional audit + conditional wiki_log: `run_client_lint`
  0017:4882-4892.)
- The op receipt is always written (`_reserve_op` / `_finish_op`, 0004:43-68).
- **NO event is appended, and NO event type is registered by 0019.**

**Why `wiki.citations_staled` is DROPPED (amendment 4 — this reverses draft v0.1).**
A client-scoped wiki event increments the firm event head and would hand a
**projection-derived** event an indirect veto surface over authority:
- `assert_books_current` refuses (CLR12) on any newer event matching the client
  (0007:2665-2681; the client predicate at 0007:2676);
- `approve_wrong_client_correction` compares the firm-wide max event sequence against
  the plan's `books_version` and refuses CLR19 when it moved (**0009:2449-2450**).

A wiki stale-mark could therefore invalidate an in-flight correction plan — precisely
the ordering inversion WB-R21 exists to abolish. Auditing runs through `audit_log`,
`wiki_log(action='mark_stale')` and the op receipt only. The **retirement event is
already the replay source**; nothing is lost.

**Schema alters this writer requires:** `clara.wiki_log.action` CHECK gains
`'mark_stale'` (0017:972-973). Nothing else. The writer joins the wiki-touch whitelist
(§9).

## 4. The consumer lane — `document.filing_retired` → stale (D3)

**As-built.** The consumer is a `startWorld` runtime plugin
(`packages/runtime/lib/wiki-projection.mjs`; leader loop + ceremony verbs in
`wiki-projection-ops.mjs`, started at `packages/runtime/plugins/startWorld.ts:218`).
`WIKI_PROJECTION_EVENT_TYPES` (wiki-projection.mjs:37-42) subscribes
`document.classified, entry.approved, counterparty.created/merged,
egress.consent_granted/revoked, seeding.proposal_decided`; every other type is a
checkpoint-only advance (:418-419, coalesced at :431-432). `planEvent` (:315-338)
dispatches by type to a `{status, lane?, mutate?(client)}` plan; `runTargetEvent`
(:370-396) runs `plan.mutate` then the checkpoint in ONE txn — a typed CLR terminal →
`checkpointOnly` with a mapped status (:387-391); a conn error propagates (:386);
anything else dead-letters (:393). `mapEventRow` (:399-404) already extracts `clientId`
+ `documentId` from every event row.

**Both keys the writer needs ride the event today** — no resolver required:
- `retire_document_filing` emits `document.filing_retired` with `client_id=f.client_id`,
  `document_id=f.document_id` (**0007:1462**).
- `approve_wrong_client_correction` emits it with `client_id=x.from_client` (the SOURCE /
  citing client whose provenance goes stale) and `document_id=x.document_id`
  (**0009:2561-2563**); its payload also carries `correction_id`, which is why one
  `stale_reason` covers both authority paths (debate O-7): the marker describes what
  invalidated the provenance, not which verb caused it.

**Target (D3).** Add `'document.filing_retired'` to `WIKI_PROJECTION_EVENT_TYPES`, and a
new `planEvent` case → `planFilingRetiredStale({ ev, clientId: ev.clientId, documentId:
ev.documentId })` returning `{ status: 'citations_staled', lane: 'filing_retired',
mutate: (c) => <call mark_wiki_citations_stale(clientId, documentId,
'source_filing_retired', 'wikistale:' + clientId + ':' + ev.seq)> }`.
The op key `wikistale:<client>:<seq>` is the pinned seq-embedded idiom (same shape as
the existing `wikihold:<client>:<seq>`, wiki-projection.mjs:219/263).

Required lane behaviours:
- **Null-key terminal.** A `document.filing_retired` with a null `clientId` or null
  `documentId` is a **checkpoint-only skip** (`skip('skipped_kind')`, the
  wiki-projection.mjs:55 idiom) — never a dead-letter, never a call with nulls.
- **Per-event surface gate.** A `to_regprocedure` check on
  `clara.mark_wiki_citations_stale` (the `wikiColdStartReady` pattern at
  wiki-projection-ops.mjs:100-108, evaluated **per event** here) makes the lane a
  checkpoint-only skip when the writer is absent. This is the load-bearing safety of the
  runtime-first ceremony (§11) and it must be covered by an explicit missing-surface test.
- **At-least-once safety.** Idempotency case (a) + the `stale_at is null` filter mean
  re-delivery and a rewound-checkpoint redrive never double-mark.
- **No self-subscription.** With `wiki.citations_staled` dropped there is nothing to
  loop on; the lane's own effects emit no event at all.

**Also in the consumer library — the terminal-status mapping (§5).** `terminalStatusFor`
(wiki-projection.mjs:70-81) must map `CLR32` reason `stale_projected_from_seq` →
`'already_projected'`. Without it the reason falls through the CLR32 branch
(wiki-projection.mjs:72-76) to `'skipped_bad_state'`, which misreports a benign
convergence as a malformed write.

**This is a consumer-lib change only — no `_vN`, no freeze implication.**

## 5. The monotonic `projected_from_seq` guard — a TYPED TERMINAL refusal (D5 · amendment 3)

**The residual (`v25-runtime-lanes-memo.md:118-120`):** `projected_from_seq`
(`wiki_page_versions.projected_from_seq bigint`, 0017:871) is re-checked in-txn by the
app-side `currentProjectedSeq` (wiki-projection.mjs:158-165; model lane :241-248, seeding
lane :303-310; the pre-plan `already_projected` skips at :211-212 and :291-292) — but two
writers inside the same window can both observe the old value and both publish, producing
a duplicate version. D5 makes the in-txn recency check **structural** on the DB writer.

**Target.** An additive, NULL-safe monotonic guard inside
`_publish_wiki_page_version_core` (0017:1979-2185), on the **supersede branch** only
(`v_prior is not null`, 0017:2080-2087), evaluated **before** the supersede UPDATE and
the version insert (0017:2090-2095): **if** `p_projected_from_seq is not null` **and** the
prior published version's `projected_from_seq is not null` **and** `p_projected_from_seq
<= prior.projected_from_seq` **then**

> **raise `CLR32` with `detail = {"reason":"stale_projected_from_seq"}`.**

**Why a refusal and not a silent converge (this reverses draft v0.1's O-1 default).**
A silent core return is *incomplete in both directions*:
- Both publishing mutators **discard the DB receipt** (wiki-projection.mjs:241-248,
  303-310 — `await c.query(...)` with no result handling), so a converge receipt is
  invisible to the runtime and the event is reported with the plan's declared status
  `'projected'` (`runTargetEvent` returns `plan.status`, :384).
- The wrapper would still run its side effects after the core returns:
  `_audit` (**0017:2216-2219**), `_append_event('wiki.page_published', …)`
  (0017:2222-2224) and `_finish_op` (0017:2225). A "no-op" would therefore emit a
  publication event and complete an op receipt for a publication that never happened.

A typed refusal rolls **all** of that back inside the caller's effect txn, and is
distinguishable from a dedupe hit (which returns before the core is called,
0017:2205-2211).

**Runtime mapping (required, §4).** `CLR32/stale_projected_from_seq` →
`'already_projected'` → `checkpointOnly` (wiki-projection.mjs:387-391). Unknown CLR32
reasons currently map to `'skipped_bad_state'` (:72-76), so the mapping is not optional.

**Invariants the guard must preserve:**
- **NULL-safe.** Deterministic ingest passes `p_projected_from_seq = null`
  (`record_wiki_source_ingest`, 0017:2264-2269) and the new-page branch (0017:2057-2069)
  has no prior — both bypass the guard and publish.
- **op_key dedupe unchanged.** `publish_wiki_page_version` still hashes
  `projected_from_seq` into its reservation (0017:2205-2211), so a same-key redelivery is
  a dedupe hit and the guard governs only a *different*-key stale-seq write.
- **App-side `already_projected` still holds.** The pre-plan skip
  (wiki-projection.mjs:211-212, 291-292) short-circuits before the DB write; the DB guard
  is the race backstop. `wave-b-wiki-projection-consumer.test.mjs:105` and `:116-129`
  (rewind → redrive → `already_projected`, no duplicate version) must both still pass.

**Required functional rollback tail probe (amendment 3).** In a forced-rollback
subtransaction: publish v1 at seq N, then attempt a supersede at seq ≤ N with a fresh op
key. Assert the raise is `CLR32/stale_projected_from_seq` **and** that afterwards there
is:
- **no** new `wiki_page_versions` row (and the prior version is still `'published'`, not
  `'superseded'`);
- **no** `audit_log` row for `publish_wiki_page_version` with that op key;
- **no** `wiki_log` row (`publish` or `supersede`) for that attempt;
- **no** `domain_events` row of type `wiki.page_published` for that attempt;
- **no `op_receipts` row at all** for that op key — note this is *stronger* than "no
  completed receipt": `_reserve_op` inserts the reservation before the core runs
  (0004:48-52), so the raise rolls the reservation back too.

## 6. The lint finding — `stale_citation` (D6 · amendment 6)

`clara.lint_findings.finding_kind` is a closed CHECK set (0017:1323-1325); 0019 ALTERs it
to add `'stale_citation'`. `clara.run_client_lint(p_client,p_op_key)` (0017:4657-4915;
granted `clara_runtime` at 0017:5133, in the wiki-touch whitelist, and skipping non-active
clients at 0017:4671-4675) gains one finding class.

**Grain: ONE finding per `(page_id, document_id)`** — not per citation row. A page citing
the same document from several citation rows, or from both a citation and a ref, produces
exactly one finding. `dedupe_key = 'stalecite:' || page_id || ':' || document_id`, which
rides `uq_lint_findings_one_open (client_id, dedupe_key) where state='open'`
(0017:1358-1359) unchanged.

**The condition is a UNION of TWO scans** (this is the belt-and-suspenders the draft left
open as O-3, now BINDING):
1. **Marked** — an active page of the client whose current-version citations or
   page-level `ref_kind='document'` refs carry `stale_at is not null`.
2. **Inverted / unmarked** — an active page of the client whose current-version citations
   or page-level document refs are `stale_at is null` **and** whose `document_id` has **no
   active filing to that client** (`not exists` against
   `clara.document_filings … retired_at is null` — the same probe `run_client_lint`
   already performs for `opening_doc_unfiled` at 0017:4804-4807, indexed by
   `uq_document_filing_active`, 0007:93-94).

Scan (2) is not redundant with the writer. `processFirm` **advances the checkpoint past a
dead-lettered event once attempts are exhausted** (wiki-projection.mjs:422-426), so a
writer failure can exhaust into dead-letter-plus-checkpoint and the stale citation would
otherwise be permanently invisible. Scan (2) is the only surface that sees it.

**Finding shape (exact):**
```
finding_kind : 'stale_citation'
dedupe_key   : 'stalecite:<page_id>:<document_id>'
severity     : 'warn'
page_id      : <page_id>            -- TOP-LEVEL, not only in detail
detail       : { page_id, document_id, stale_reason, since, marker_missing }
```
`marker_missing` is `true` when the pair was found only by scan (2) — that is the visible
signal of a writer/consumer failure, distinct from normal stale convergence. `since` is
the earliest `stale_at` of the grouped rows, and is null when `marker_missing` is true.

**`page_id` must be set at the TOP LEVEL of the condition object.** The episode insert
reads `nullif(j->>'page_id','')::uuid` from the condition, not from `detail`
(**0017:4836-4842**) — a detail-only `page_id` would leave the finding's FK column null.

Everything else rides the existing episode machinery **unchanged**: one-open-per
`(client, dedupe_key)`, open / `recheck_opened` / `superseded` convergence
(0017:4816-4880), notify-once via `_record_notification_core` (0017:4894-4903), no new
`event_kind`. A clean re-publish (which deletes and re-creates refs, 0017:2134, and cites
only actively-filed documents) drops the condition and converges the finding to
`superseded` (0017:4863-4880). This is the visible, lint-surfaced half of WB-R21.

**Failure posture (builder note).** `run_client_lint`'s whole body sits inside
`begin … exception when others then return {status:'failed', …}` (0017:4666, 4911-4913):
a raise inside the new class does NOT abort the lint run, it degrades the receipt to
`status='failed'`. The battery must therefore assert on the returned receipt and on the
findings table, never on an exception.

## 7. Read-surface marking — inform-never-decide (D1 read surfaces · amendment 6)

**Correction to draft v0.1: the fields do NOT all arrive "for free."**

- **`get_wiki_page`** (0017:2374-2402) returns `to_jsonb(c)` for citations and
  `to_jsonb(r)` for refs (0017:2392-2398) — these DO pick up `stale_at` / `stale_reason`
  additively with no fn change.
- **`list_wiki_pages`** (0017:2404-2430) **enumerates** page fields explicitly
  (0017:2420-2425) and carries no citation array at all.
- **The context-pack wiki block** inside `get_context_pack` **enumerates citation fields
  explicitly** — `source_kind, document_id, entry_id, counterparty_id, detail`
  (**0017:5053-5063**) — and carries **no refs array**. `stale_at`/`stale_reason` will
  **not** appear there unless added by name.

0019 therefore makes three explicit changes:

1. **`get_wiki_page`** gains a derived page-level `has_stale_sources` boolean.
2. **`list_wiki_pages`** gains `has_stale_sources` in its enumerated per-page object.
3. **The pack's wiki block** adds `stale_at` and `stale_reason` to the enumerated
   citation object, and `has_stale_sources` to the enumerated page object.

**Name: `has_stale_sources`, not `has_stale_citations`** (amendment 6) — the flag
aggregates citations AND page-level document refs, and "sources" is the vocabulary the
rest of the wiki surface already uses (`record_wiki_source_ingest`,
`wiki.source_ingested`). The pack shows no refs array, so there the flag is the *only*
signal that a page's document ref went stale — a reason to keep it, not to rename it.

**Definition (identical in all three):** EXISTS a live citation of the page's current
version, OR a live `ref_kind='document'` ref on the page, with `stale_at is not null`.

**Inform-never-decide (LAW) — no filtering, no reordering, no gating.** The pack and
reads **MARK, never drop**: a page with stale sources is still served, still current,
still usable. Specifically, 0019 must not touch the pack's `candidates` set
(0017:5043-5045), its `priority`/`row_number` ordering (0017:5039-5052), or its
`ord <= page_cap and running_bytes <= byte_cap` admission (0017:5065). Note
`content_bytes` derives from `wv.content` alone (0017:5038), so adding fields to the
enumerated citation object cannot shift the byte cap — and the battery asserts page
selection, order and content are byte-identical to the pre-0019 pack for an unmarked
client. This is the read-side embodiment of ADR-004 "wiki informs, never decides" and is
what WB-R21 replaces the veto with. No page is retired or hidden by staleness.

## 8. Gate-W2 disposition ends (D7)

WB-R21's interim disposition recorded the two veto call sites as a **closed set of
exactly two KNOWN DEVIATIONS** for the live Gate-W2 dependency audit
(`ruling-batch-adr-037.md:75-77`; `wave-b-contract.md:180-183`). **Post-0019 that interim
disposition ENDS:** the veto is gone, the helper is dropped, and the §9 clean-end-state
tail proves ZERO wiki reads from authority fns. The contract records that after 0019
deploys, the Gate-W2 dependency audit expects **ZERO exceptions** — the
two-known-deviations allowance is retired, not carried forward.

## 9. The 0019 in-transaction tail battery (the clean-end-state closed set · amendment 7)

0017 idioms plus the debate's clean-end-state assertions.

**Structural / catalog.**
- **`to_regprocedure('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') is null`**
  — the helper is GONE. **Use `to_regprocedure`, not `to_regproc`** (amendment 7):
  `to_regproc` takes a bare name and errors or misresolves on an argument list; the
  repo's own signature-absence precedent is `to_regprocedure` (**0011:4132-4136**).
  (`to_regproc` remains correct for the runtime's bare-name surface gate,
  wiki-projection-ops.mjs:102 — that call is not changed.)
- `retire_document_filing` + `approve_wrong_client_correction` bodies no longer contain
  `_assert_filing_wiki_unreferenced` (normalized-source scan).
- **Per-function** non-wiki guard survival (NOT every token in every body):
  - `retire_document_filing` retains its CLR17 tokens and the journal-entry live-blocker
    token;
  - `approve_wrong_client_correction` retains its CLR19 source-filing token.
- **Both** bodies contain a `clara.clients … for update` token with its CLR11 raise, and
  that token precedes `update clara.document_filings set retired_at` (§1).
- The stale marker exists on BOTH `wiki_page_citations` and `wiki_page_refs`: `stale_at`
  + `stale_reason` + the reason CHECK + the paired presence CHECK.
- `mark_wiki_citations_stale(uuid,uuid,text,text)` exists; SECURITY DEFINER;
  `search_path=clara,pg_temp`; arg names / owner as specified.
- `wiki_log.action` CHECK contains `'mark_stale'`; `lint_findings.finding_kind` CHECK
  contains `'stale_citation'`.
- **NO event type named `wiki.citations_staled` exists** (the negative assertion of
  amendment 4).
- `get_wiki_page` / `list_wiki_pages` / `get_context_pack` bodies reference
  `has_stale_sources`; the pack body additionally references `stale_at` in its citation
  enumeration; `run_client_lint` body references the `stale_citation` class **and** the
  inverted `document_filings` probe.
- The monotonic guard is present in `_publish_wiki_page_version_core` (its source
  contains the `projected_from_seq` comparison on the supersede branch and the
  `stale_projected_from_seq` reason literal).
- Every new index from §2 exists.

**Grants / capability closed set.**
- `mark_wiki_citations_stale` is granted `clara_runtime` ONLY, and MUST NOT reach
  `clara_authenticated`, `clara_agent_ro`, `clara_wake_interactive`,
  `clara_wake_proactive`.
- PUBLIC-execute sweep = 0 on the new fn.
- **No new table grant to any role** — in particular `clara_runtime` still has NO SELECT
  on `clara.document_filings` (0007:2740-2741). Assert this negatively; a silent widening
  here is 0020's decision, not 0019's.

**The CLEAN-END-STATE closed-set scan (D4b — supersedes 0017's exclusion loop).**
0017's exclusion loop (0017:5945-5967) scanned a **fixed named list** of authority/K/S fns
for the seven-table wiki family and **OMITTED** `retire_document_filing` +
`approve_wrong_client_correction` — that omission is exactly why the veto could hide
there. 0019 replaces it with an **inverse closed-set scan**: scan **ALL** `clara`
SECURITY DEFINER fns and FAIL if any fn outside an explicit whitelist either

- **(a) names a relation** — a word-bounded reference to one of the seven wiki relations
  (`wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|
  wiki_budgets|wiki_synthesis_holds`, the 0017:5961-5963 expression), **or**
- **(b) carries a CALL EDGE** — a reference to any function *in* the wiki-touch set.

**Whitelist by EXACT `regprocedure` identity, not by `proname`** (amendment 7). 0017's
whitelist is a `proname not in (…)` list (0017:6000-6004), so a future overload of a
whitelisted name is silently covered. The 0019 set, by signature:

```
clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)
clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)
clara.record_wiki_source_ingest(uuid,uuid,text,text)
clara.retire_wiki_page(uuid,text,text)
clara.set_wiki_synthesis_hold(uuid,text,text)
clara.clear_wiki_synthesis_hold(uuid,text)
clara.get_wiki_page(uuid,text)
clara.list_wiki_pages(uuid)
clara.get_context_pack(uuid,text)
clara.run_client_lint(uuid,text)
clara.run_lint_all(text)
clara.mark_wiki_citations_stale(uuid,uuid,text,text)
```

Two entries are new relative to 0017:6000-6004 and both are required:
- **`_publish_wiki_page_version_core`** — ungranted, so 0017's *granted*-function scan
  never saw it, but it directly reads `wiki_budgets` (**0017:2016-2019**) and writes
  every wiki relation. The inverse scan covers all definers, so it must be whitelisted.
- **`run_lint_all`** — its own body touches no wiki relation, but it CALLS
  `run_client_lint` (**0017:4930**), so the call-edge scan catches it. (`wb-helpers.mjs`'s
  `WB_WIKI_WHITELIST` already lists it; 0017's DB-side list did not. The two are now
  consistent.)

The only other in-body call edges into the set are the two core calls at 0017:2212 and
0017:2264, both from whitelisted wrappers — verified, so the scan does not false-fail at
apply.

**Honest characterisation (amendment 7 — state this in the migration comment).** This is
a **closed STATIC defence, not a proof.** Its known limits:
- **False-pass.** Dynamic SQL can construct a relation name without a word-bounded
  literal. The original defect is itself the wrapper shape: the authority bodies named
  only `_assert_filing_wiki_unreferenced` while the helper held the reads (0017:1824,
  1860) — which is exactly why (b) exists, but (b) is still a source-token scan, because
  plpgsql bodies create no catalog dependencies for their callees, so there is no
  `pg_depend` edge to walk.
- **False-fail.** A raw `prosrc` regex also sees comments and string literals
  (0017:5961-5963), so a non-wiki function that merely *mentions* `wiki_pages` in an
  error message or comment will trip it.

**Paired repository lint (required, ships with 0019).** A repo-side check forbidding
dynamic wiki SQL — any `execute`/`format`/string-concatenated statement naming a wiki
relation — outside the whitelisted set. This is the half of the defence the DB tail
structurally cannot provide.

**Supersession of the 0017 apply-time pins (explicit).** The 0017 veto-existence pins
(**0017:5595-5605** for the helper's source shape and **0017:5606-5618** for the call
ordering in each body) ran **apply-time-once at 0017-apply** and pass there because the
rig replays `0001 → … → 0019` in order (the veto IS present when 0017 applies). **0019
MUST NOT re-run them** — 0019's own tail is the clean-end-state assertion above, the exact
inverse. The contract states this supersession so no lane re-imports the stale pins.

**Plan coverage (EXPLAIN-backed, amendment 6).** For each of the three §2 predicate
shapes, the tail runs an `explain (format json)` on the canonical statement against a
seeded fixture and FAILS if the plan contains a sequential scan of `wiki_page_citations`
or `wiki_page_refs`. Seed enough rows that the planner cannot legitimately prefer a seq
scan, or force `enable_seqscan=off` scoped to the probe and assert the intended index is
*usable* — the builder picks one and the battery pins which.

**Functional rollback probes (required, in-txn).** Beyond the catalog assertions, the
tail runs, each inside a forced-rollback subtransaction:
- the §5 monotonic-guard probe in full (all six negative assertions);
- a mark → re-mark-with-fresh-key probe proving idempotency case (b) returns
  `{0,0,'noop'}` and does not write a second `wiki_log`/`audit_log` row;
- a retire-with-live-citation probe proving the retirement now succeeds and emits
  `document.filing_retired`.

**Discipline.** Every functional tail probe runs inside a forced-rollback subtransaction
(never commit fixture audit/event/log rows into production). Fn bodies created under
`set role clara_fn_owner` / `reset role`. One transaction; any failure aborts the apply.

## 10. The blind battery's charter (contract-only; SQL-unread)

**Veto-gone (the inversions — R2-F2 now proceeds + sources go stale):**
- Retiring a filing that HAS a live citation now **succeeds**; the citation is marked
  stale (via the consumer lane / writer) and a `stale_citation` lint finding opens.
- A wrong-client correction MOVE under a live citation now **succeeds**; the SOURCE
  client's (`x.from_client`) citations/refs go stale — not the destination's.
- **R2-F2c is REWRITTEN, and the invariant it preserves is "NO UNMARKED INVALID END
  STATE" — NOT "both always succeed"** (amendment 1). The as-built cell asserts
  `!(pub.ok && ret.ok)` (`wb-r2.test.mjs:179-180`). Post-0019, BOTH lock orderings must
  be asserted, and they differ:

  | Interleaving | Outcome | Why |
  |---|---|---|
  | **Publication acquires the client row first** (the as-built cell's shape, `wb-r2.test.mjs:151-170`) | Publication COMMITS; retirement then acquires the lock and ALSO succeeds; the page ends **STALE** | Retirement blocks on the §1 client-row lock until the publication commits, so its event is emitted after the citation is visible and the consumer marks it |
  | **Retirement acquires the client row first** | Retirement succeeds; the publication then **FAILS CLR02** | The publication's active-filing floor (0017:2115-2121 / 2157-2163) sees the retired filing |

  Both-ok is therefore reachable **only** in the publication-first ordering, and only
  with the mark following. The cell must assert the disjunction, and in the both-ok case
  additionally assert the citation is `stale_at is not null` after the consumer runs.
  **Removing the client-row lock breaks this**: the publication could validate the live
  filing, stay uncommitted while the retirement commits and the consumer marks zero, then
  commit an unmarked citation. A cell that pins that hazard (lock present ⇒ unreachable)
  is required.

**Writer (`mark_wiki_citations_stale`):**
- **Idempotency, three cells** — (a) same op key, same args → the ORIGINAL receipt
  byte-identical (non-zero counts replayed); (b) fresh op key over already-marked rows →
  `{citations_marked:0, refs_marked:0, status:'noop'}` and the first call's `stale_at`
  preserved; (c) same op key, changed args → CLR10.
- **Audit posture** — a `status='noop'` call writes NO `wiki_log` and NO `audit_log` row;
  a `status='marked'` call writes exactly one of each.
- **No event** — a mark appends nothing to `domain_events`; the firm event head is
  unchanged across the call. (This is the amendment-4 assertion and it is load-bearing:
  it is what keeps `assert_books_current` and the correction books-version check out of
  the projection's reach.)
- **Cross-firm / cross-client isolation** — marks ONLY the target `(firm, client,
  document)`'s live sources; a same-document citation on another firm's or client's page
  is untouched (extends `wb-x-crossfirm`).
- **Scope precision** — only current-version-of-active-page citations and active-page
  `ref_kind='document'` refs are marked; superseded-version and retired-page rows stay
  unmarked.
- **Reason validation** — an unrecognised `p_reason` is a typed refusal.
- **ACL** — `clara_runtime` executes; `clara_authenticated`, `clara_agent_ro` and both
  wake roles are refused at the role level.

**Consumer lane (rig — event → stale):**
- `document.filing_retired` from `retire_document_filing` → the citing client's sources
  go stale end-to-end; the checkpoint advances.
- `document.filing_retired` from `approve_wrong_client_correction` → the SOURCE client's
  sources go stale (not the destination client's).
- Re-delivery of the same event (same seq) → op-key dedupe, no double-mark; a redrive
  after a rewound checkpoint marks nothing new.
- **Missing surface** — with the writer absent (`to_regprocedure` null) the lane is a
  checkpoint-only skip, no dead-letter. Explicit cell.
- **Null keys** — a `document.filing_retired` with a null client or document is a
  checkpoint-only skip.
- **Dead-letter recovery** — a writer failure that exhausts `MAX_ATTEMPTS` dead-letters
  AND advances the checkpoint (wiki-projection.mjs:422-426); the citation stays unmarked;
  **the inverted lint scan then surfaces it with `marker_missing:true`**. This pair of
  cells is the only proof that the §6 union is not decorative.

**Monotonic guard:**
- An older-seq supersede write raises `CLR32/stale_projected_from_seq`; the runtime maps
  it to `already_projected` and checkpoints only.
- The full six-part rollback assertion of §5 (no version, no audit, no wiki_log, no
  event, no op receipt, prior version still `published`).
- Two-session, same-window double-writer: exactly one publishes a new version; the
  stale-seq session refuses → checkpoint-only.
- NULL-safe: deterministic ingest (`projected_from_seq` null) still publishes; the
  new-page branch still publishes.
- The op_key dedupe and the app-side `already_projected` skip are unchanged
  (`wave-b-wiki-projection-consumer.test.mjs:105`, `:116-129` still green).

**Lint finding:**
- A stale-marked source surfaces exactly ONE `stale_citation` finding per
  `(page_id, document_id)` even with several marked citation rows and a marked ref;
  `dedupe_key = stalecite:<page>:<doc>`; `page_id` is populated on the ROW, not only in
  `detail`; notify-once; a clean re-publish converges it to `superseded`.
- The inverted scan opens a finding with `marker_missing:true` for an unmarked live
  source whose document has no active filing.
- Exact finding shape pinned (kind, dedupe_key, severity, page_id, detail keys).

**Pack / read-surface marking (inform-never-decide):**
- `get_wiki_page` exposes per-citation and per-ref `stale_at`/`stale_reason` plus
  `has_stale_sources`; `list_wiki_pages` exposes `has_stale_sources`; the pack's wiki
  block exposes per-citation `stale_at`/`stale_reason` plus `has_stale_sources`.
- The page is **still served, still current** — marked, never dropped, never gated.
- For an UNMARKED client the pack is **byte-identical** to the pre-0019 pack in page
  selection, page order, page count and content (the amendment-6 "no filtering,
  reordering or gating" assertion).

**Regression set — every existing veto-pinning cell, enumerated as an ADJUDICATED
update** (the blind battery treats these as required rewrites, not incidental churn):
- `packages/db/tests/wave-b/wb-r2.test.mjs [R2-F2a]` (**:87-111**) — **INVERT**: retire
  with a live citation now succeeds + source stales + lint surfaces (was: refuses named,
  succeeds only after the page retires).
- `wb-r2.test.mjs [R2-F2b]` (**:113-133**) — **INVERT**: a correction MOVE under a live
  citation now succeeds + source-client sources stale.
- `wb-r2.test.mjs [R2-F2c]` (**:135-186**) — **REWRITE** per the two-ordering table
  above. These three cells name no helper — they assert *behaviour*
  (`assertRaisesOneOf`), so the rewrite is behavioural.
- `rig-docs-correction.test.mjs`, `rig-docs-retention.test.mjs`,
  `rig-docs-filings-provenance.test.mjs` — **VERIFY UNCHANGED**: the non-wiki CLR17 /
  CLR19 / journal-entry-live blockers survive the patch (§1).
- `wave-b-wiki-projection-consumer.test.mjs` (`:105`, `:116-129`) +
  `wave-b-wiki-projection-unit.test.mjs` — **EXTEND**: the new `document.filing_retired`
  subscription, the stale lane, the terminal-status mapping, and the monotonic guard.
- The 0017 apply-time veto-existence pins (0017:5595-5618) — **NOT re-run** by 0019 (§9).

**Roster / structural cells that MUST be updated BEFORE any SQL lane starts
(amendment 8 — these are not optional companions, they are gating):**
- **`wb-helpers.mjs` → `WB_AUTHORITY_FNS` (:178-193)** — currently **omits BOTH
  `retire_document_filing` and `approve_wrong_client_correction`**, the very functions
  whose wiki-freedom 0019 exists to prove. Both must be added, and `wb-w-pack.test.mjs`
  (which consumes the list against `WIKI_TABLE_RE`, `wb-w-pack.test.mjs:18,28-30`) then
  becomes a real W2 proof rather than a list that excludes the defect.
- **`wb-helpers.mjs` → `WB_WIKI_WHITELIST` (:195-202)** — add
  `mark_wiki_citations_stale` and `_publish_wiki_page_version_core`.
- **`wb-helpers.mjs` → `WB_FN_FAMILY_RE` (:156-168)** — does **not** match `mark_wiki`;
  without that alternative the new writer escapes the live-catalog inventory sweep
  (`wbFnInventory`, :171-176) entirely.
- **`wb-helpers.mjs` → `WB_ACL` (:109-153)** — add `mark_wiki_citations_stale:
  ["runtime"]`.
- **`wb-helpers.mjs` → `WB_EVENT_TYPES` (:89-107)** — **unchanged**, and a cell must
  assert it stays unchanged (the negative proof of amendment 4).
- **`packages/db/tests/rig-meta.mjs` → `WAVE_B_RUNTIME_FNS` (:97-103)** — add
  `mark_wiki_citations_stale` so the rig-isolation grant matrix covers it.
- **`wb-g-opkeys` / `wb-g-tail`** — the writer's op-key discipline and its
  wiki-touch-whitelist membership.
- **`wb-w-wiki` / `wb-w-pack` / `wb-l-lint`** — exact read shapes and exact finding
  shapes, not merely "a field is present".
- **`wave-b-autodraft-v3.test.mjs:150` and `wave-b-chatturn-v7.test.mjs:173`** — the W2
  "write params are byte-identical with/without a wiki block" probes must be extended
  with a pack fixture carrying **stale metadata** (`stale_at`, `stale_reason`,
  `has_stale_sources`), proving the write params still do not move. Staleness is new
  pack surface; unproven, it is new W2 exposure.
- **`has0019()` / `fail0019(live)` in `wb-helpers.mjs`** — the battery gate, mirroring
  `has0017`/`fail0017` (:214-232) and `has0018`/`fail0018` (:241-270) exactly: **FAIL
  loudly, never skip**, against an 18-migration DB. Without it a new cell can silently
  pass against 0018 and the blind lane proves nothing.

## 11. Deployment — RUNTIME-IMAGE-FIRST (amendment 2)

**Ordering: the runtime image FIRST, then the DB migration.** This REVERSES draft v0.1's
D8 (DB-first + catch-up), per the debate's O-6 rejection. The catch-up remains, but as
**reconciliation** — it is no longer the mechanism that makes the ordering safe.

### Why DB-first was rejected

1. **DB commit → old image still leading.** The veto is gone but the old image does not
   subscribe to `document.filing_retired`; it skips the event
   (wiki-projection.mjs:418-419) and later coalesces the checkpoint past it (:431-432).
   The citation stays unmarked.
2. **"Image is up" is not the cutover point.** An old instance can still hold the
   `WIKI_PROJECTION` advisory lock (wiki-projection-ops.mjs:125) and keep skipping after
   the new image is deployed. Only **exclusive acquisition by the new binary** ends the
   window.
3. **Image deployment fails after DB apply** → the system sits indefinitely in
   veto-free/old-consumer state and the catch-up never runs. Quiescence bounds the
   exposure but does not make the ordering failure-safe.
4. **The catch-up is a current-state scan, not a window proof.** A publication can
   validate the active filing, stay uncommitted while the retirement commits and both the
   consumer and the sweep see zero citations, then commit an unmarked citation; and
   retire-then-refile before the sweep makes the `NOT EXISTS` predicate false. The draft's
   "sweeps exactly the DB-first window" claim is **false** without both strict quiescence
   and the §1 client-row lock.

### The ratified ordering, with exposure windows

Owner-`!`-gated throughout; the ADR-036 backup-first + quiesce discipline applies.

1. **Backup-first**, then **strict write quiescence** (no authority writes for the
   duration — this is a precondition, not a nicety: it is what makes windows A and B
   empty).
2. **Deploy the runtime image** (`fly deploy` from repo root — consumer-lib changes only:
   the `document.filing_retired` subscription + stale lane + the
   `stale_projected_from_seq` status mapping + the catch-up verb; the loop is a
   `startWorld` plugin, **no `_vN`, zero freeze impact**). Confirm `/ready` 200.
3. **DRAIN the old instance and PROVE exclusive new-binary leadership.** Not "the image
   is up" — the ceremony must show the **new image/tag** logged
   `WIKI_PROJECTION acquired` (wiki-projection-ops.mjs:141) and that no old instance
   holds the advisory lock. Record the instance id / tag in the ceremony log.
   > **Window A (new image, 0019 not applied) — EXPOSURE: NONE.** The writer is absent,
   > so the lane's per-event `to_regprocedure` gate makes every `document.filing_retired`
   > a checkpoint-only skip. But the veto is still present, so a retirement with a live
   > wiki source still REFUSES — there is nothing to mark. A retirement without one
   > commits and is correctly skipped. A later publication against a retired filing fails
   > the existing CLR02 active-filing floor. The loop's design already assumes this shape
   > (`wikiColdStartReady`, wiki-projection-ops.mjs:91-109: the image must stay healthy
   > and SILENT against a DB whose surface does not yet exist).
4. **Apply migration 0019** (the §9 tail runs in-txn; the apply aborts on any tail
   failure) → `NOTIFY pgrst, 'reload schema'`.
   > **Window B (the apply itself) — EXPOSURE: NONE under quiescence.** The writer and
   > the veto removal become visible **atomically together**; no authority write can
   > occur in between.
   > **If the migration FAILS:** the new image remains harmless behind its per-event
   > surface gate and the old veto remains intact. This is the failure boundary DB-first
   > does not have.
5. **Post-DB verify probes:** helper GONE (`to_regprocedure` null); both authority fns
   clean AND still holding a client-row lock; a live citation can now be retired (bounded
   forced-rollback probe); the writer, columns, CHECKs, indexes and lint class present;
   no `wiki.citations_staled` event type; `clara_runtime` still has no `document_filings`
   SELECT.
6. **The named CATCH-UP** — reconciliation for any pre-existing anomaly, run once here
   and re-runnable thereafter.

   **Mechanism (O-2, amended):** a **named ceremony verb in
   `packages/runtime/lib/wiki-projection-ops.mjs`**, alongside `backfillWikiSources`
   (:33-55) and `repairWikiOrphans` (:57-70), exposed through `scripts/relay.mjs`. **NOT
   a new DB verb, NOT a new grant.**

   **Two halves, because of a privilege boundary the debate did not address.**
   `clara_runtime` has **no SELECT on `clara.document_filings`** (0007:2740-2741 grants it
   to `clara_authenticated`/`clara_agent_ro` only — the same gap that makes
   `resolveDocumentClientDefault` return null, wiki-projection.mjs:97-101). The inverted
   scan therefore **cannot** run on the runtime connection. So, exactly mirroring
   `backfillWikiSources`'s established contract ("`sources` = `{clientId, documentId}[]`
   the ceremony supplies (no runtime document→client link)", wiki-projection-ops.mjs:33-36):
   - **(i) The SCAN is a ceremony-role SQL step** (owner connection, read-only), producing
     the candidate `(client_id, document_id)` pairs: for each **active** page, each
     current-version citation and each active-page `ref_kind='document'` ref with a
     non-null `document_id` and `stale_at is null`, where the document has **no active
     filing to that page's client** (`not exists` against `document_filings … retired_at
     is null`). This is the veto's blocker query, INVERTED — the same predicate §6's
     scan (2) uses. The ceremony records the pair list as evidence.
   - **(ii) The VERB takes those pairs plus a ceremony `run_key`**, calls
     `mark_wiki_citations_stale` per pair on the runtime connection (the grant it already
     has), treats a typed CLR as a per-pair skip (the `backfillWikiSources` idiom,
     wiki-projection-ops.mjs:47-52), and returns an **aggregate receipt**
     `{examined, marked, noop, skipped, run_key}`.

   **Op key: `wikistale-catchup:<run_key>:<client>:<document>`.** The run key is
   mandatory. A fixed per-pair key is **not rerunnable**: `_reserve_op` replays the
   original receipt forever for that key (0004:43-60), so a later repair run would return
   stale receipts and never examine fresh rows. Same run retried ⇒ same run key (a true
   idempotent retry); a new repair run ⇒ a new run key.

   **Expected result at THIS ceremony: zero pairs.** Pre-0019 the veto made "active page
   citing a retired filing" unreachable, and the runtime-first ordering opens no window.
   A non-empty result is a finding to adjudicate before unquiescing, not a routine sweep.
7. **Post-catch-up verify:** any swept sources are stale, surface in lint and are marked
   in reads; every existing green probe (replay byte-identical, reads served, pack shape,
   sightings unchanged) stays green. **Unquiesce.** Record the Gate-W2 / gate version pin
   (migration count + runtime image tag).

**WB-R24 version-pinning (binding).** The state is transiently `(old DB + new image)`
between steps 2 and 4. **No live-gate journey may straddle the deploy** — the whole
ceremony (steps 1-7) must land OUTSIDE any live-gate window (Gate O/K/W2/L/R2/F). The
contract states the constraint; the **orchestrator owns scheduling**. If a gate window is
open, 0019 waits.

## 12. Settled items (O-1 … O-8 — all resolved; nothing open)

| # | Question | Ruling | Lands in |
|---|---|---|---|
| **O-1** | Monotonic-guard surface | **Typed terminal `CLR32` / `stale_projected_from_seq`**, mapped by the runtime to `already_projected` + checkpoint-only. A silent converge is rejected: the mutators discard the receipt and the wrapper would still audit and emit `wiki.page_published`. | §5, §4 |
| **O-2** | Catch-up mechanism | **Named ceremony verb** in `wiki-projection-ops.mjs` — not a DB verb, not a new grant. Aggregate receipt; ceremony `run_key` in the op key; the scan half runs on the ceremony/owner connection because `clara_runtime` cannot read `document_filings`. | §11 |
| **O-3** | Lint scan depth | **ADD the inverted scan.** `run_client_lint` unions marked sources AND unmarked live sources with no active client filing; without it a dead-lettered-plus-checkpointed writer failure is invisible. | §6 |
| **O-4** | Marker grain (refs) | **Mark refs independently** — the veto scanned the two relations separately and a page can hold a document ref with no equivalent citation. **But refs are page-level MUTABLE rows, deleted and recreated on every republish (0017:2134) — not immutable history.** | §2 |
| **O-5** | Writer "live" scope | **Current-version citations and active-page refs only.** Superseded rows are never mutated. Re-citing a retired document is already refused CLR02 (0017:2115-2121, 2157-2163) — no new prevention needed. **But the non-wiki client-row lock must be retained** or the mark can race a validated-but-uncommitted publication. | §3, §1 |
| **O-6** | Deploy ordering | **DB-first REJECTED; runtime-image-first ratified**, with proven exclusive new-binary lock acquisition as the cutover point and the catch-up demoted to reconciliation. | §11 |
| **O-7** | `stale_reason` extensibility | **One reason.** The correction path emits the same retirement event for the source client and document (0009:2561-2563) and keeps `correction_id` in the payload. The marker describes what invalidated the provenance, not which verb caused it. | §2, §3 |
| **O-8** | The `wiki.citations_staled` event | **The event is DROPPED entirely** — not merely kept out of the subscription set. A client-scoped wiki event increments the event head and would reach `assert_books_current` (0007:2665-2681) and the correction books-version check (0009:2449-2450), handing a projection-derived event an indirect veto over authority. | §3, §9 |

## Changelog v0.1 → v1.0

Every amendment below was ACCEPTED by the orchestrator after the Codex `gpt-5.6-sol`
xhigh design debate. Each debate line-citation was independently opened and verified;
corrections are recorded here.

**Binding amendments applied**

1. **Client-row `FOR UPDATE` preserved in both retirement paths** — §1 rewritten. The
   `perform clara._assert_filing_wiki_unreferenced(...)` line is replaced by a plain
   `clara.clients … for update` + CLR11, at the same position (preserving the as-built
   lock order); the drift-guard now asserts the lock's presence and ordering, not the
   veto's. §9 asserts it in both bodies. §10's R2-F2c rewritten for **both** lock
   orderings, with the preserved invariant restated as **"no unmarked invalid end
   state"**, not "both always succeed". Added a lock-graph note showing no new deadlock
   class (publication never locks `document_filings` — its floor is an unlocked read).
2. **Deployment is RUNTIME-IMAGE-FIRST** — §11 rewritten end to end: quiesce → deploy
   image → drain + **prove exclusive new-binary `WIKI_PROJECTION` acquisition** → apply
   0019 → verify → named catch-up → verify → unquiesce. Both orderings' exposure windows
   documented, including the migration-failure boundary. D8 (DB-first) is explicitly
   reversed and the four DB-first exposures recorded as the rationale.
3. **Monotonic guard is a TYPED TERMINAL refusal** — §5 rewritten: `CLR32` /
   `stale_projected_from_seq` replaces the silent converge, with the runtime mapping to
   `already_projected` added to §4 (unknown CLR32 reasons currently fall to
   `skipped_bad_state`). Added the six-part functional rollback probe, strengthened to
   include **no `op_receipts` row at all** (the reservation itself rolls back).
4. **`wiki.citations_staled` DROPPED from 0019** — §3's event bullet deleted; the event
   registration removed from §3's "schema alters"; §9 gains the negative assertion that
   the type does not exist; §10 gains a "firm event head unchanged" cell and a
   `WB_EVENT_TYPES`-unchanged cell. Rationale (freshness/veto reach) recorded with
   anchors.
5. **Writer idempotency pinned as three distinct cases** — §3 gains the (a)/(b)/(c)
   table; audit and `wiki_log` are now explicitly **positive-change-only**; the receipt
   shape is closed (`status ∈ {'marked','noop'}`). The catch-up op key gains a mandatory
   ceremony **run key** (§11), with the `_reserve_op` replay-forever rationale.
6. **Stale visibility made robust** — §6: one finding per `(page_id, document_id)` with
   an explicit dedupe key, the UNION of marked + inverted scans (O-3 now binding),
   `marker_missing` in detail, and **top-level `page_id`** so the episode insert
   populates the FK. §7: the pack's citation enumeration and `list_wiki_pages` need the
   fields added **by name**; flag renamed **`has_stale_sources`**; "no filtering,
   reordering or gating" pinned with the exact pack anchors. §2: index coverage required
   for writer/lint/read predicates; §9 adds EXPLAIN-backed plan checks.
7. **§9 tail repaired** — `to_regprocedure` replaces `to_regproc('name(args)')`;
   whitelist by **exact `regprocedure` identity**, adding `_publish_wiki_page_version_core`
   and `run_lint_all`; the scan now covers relation tokens **and call edges**; non-wiki
   guard assertions are **per-function** (CLR17 + live-entry for retirement, CLR19 for
   correction); a paired repository lint forbids dynamic wiki SQL outside the set; the
   defence is described honestly as a closed **static** defence with its false-pass and
   false-fail limits stated.
8. **Regression roster expanded and made GATING** — §10 now names, as pre-SQL-lane work:
   `WB_AUTHORITY_FNS` (which omits both retirement fns), `WB_WIKI_WHITELIST`,
   `WB_FN_FAMILY_RE` (no `mark_wiki` alternative), `WB_ACL`, `WB_EVENT_TYPES`
   (unchanged, asserted), `rig-meta.mjs`'s `WAVE_B_RUNTIME_FNS`, `wb-w-pack` /
   `wb-w-wiki` / `wb-l-lint` exact shapes, the two W2 runtime cells with stale metadata,
   both concurrency interleavings, dead-letter + inverted-lint recovery, and
   **`has0019`/`fail0019`** as the battery gate.

**Per-section verdicts also applied**

- **§0** — scope note now records the preserved lock, the indexes, the runtime status
  mapping, the ceremony verb, the dropped event, and the explicit no-runtime-read-widening
  boundary.
- **§2** — the "refs are immutable history" claim is **corrected**: refs are page-level
  mutable rows deleted and recreated on republish (0017:2134). Citations remain versioned
  and immutable; the two lifecycles are now stated separately.
- **§3** — writer scope restated as current-version citations and active-page refs only,
  with the CLR02 re-citation floor cited rather than a new prevention invented.
- **§4** — null-key terminal handling, the per-event surface gate (vs the cold-start
  gate), and the required missing-surface / dead-letter test coverage added.
- **§7** — the "for free" claim corrected as above.
- **§8** — unchanged (debate AGREE).
- **§12** — converted from open questions to the settled O-1…O-8 ruling table.

**Debate citations corrected during verification**

- **§0 (draft v0.1) cited `document.filing_retired` as registered at `0007:2688`.**
  Wrong — 2688 is `document.correction_applied`. The correct anchor is **0007:2685**.
- **The debate's "context pack ... refs are included too" (O-6/§7 note)** — verified
  false for the pack: the pack's wiki block enumerates citations only and carries **no
  refs array** (0017:5053-5063). `has_stale_sources` is still the right name (refs are
  covered by `get_wiki_page`/`list_wiki_pages`, and in the pack the flag is the only ref
  signal), but v1.0 states the pack's actual shape rather than the debate's.
- **The debate's §7 anchor `0017:2392`** is the `jsonb_build_object` opening line; the
  actual `to_jsonb(c)` / `to_jsonb(r)` calls are at **0017:2395** and **0017:2397**. Cited
  as 2392-2398.
- **The debate's §9 anchor `0017:2016`** — verified as a `wiki_budgets` read inside
  `_publish_wiki_page_version_core`; correct, cited as 0017:2016-2019.
- **The debate's O-5 anchors `0017:2113` / `0017:2155`** are the block-opening lines; the
  CLR02 raises are at **0017:2119-2120** and **0017:2161-2162**. Cited as ranges
  2115-2121 / 2157-2163.
- **The debate's O-1 anchor `0004_governed_fns.sql:43`** is the comment header above
  `_reserve_op`; the function body begins at 0004:46. Cited as 0004:43-60.
- **`wb-helpers.mjs:178`** is the comment above `WB_AUTHORITY_FNS`; the array is
  **:180-193**. Cited as :178-193.
- **`startWorld.ts:218`** verified, but the path is
  **`packages/runtime/plugins/startWorld.ts`**, not `packages/runtime/src/`.
- **The draft's `0018:36-53`** for the `bound_scope` pattern — the additive-pair + paired
  CHECK is **0018:36-44** (the partial unique index follows at 46-48).
- All other debate anchors (0017:1805, 1821, 1824, 1860, 2134, 2216, 4836, 5053, 5961;
  0007:1462, 2670; 0009:2449, 2561; 0011:4132; rig-meta.mjs:97;
  `wave-b-autodraft-v3.test.mjs:150`; `wave-b-chatturn-v7.test.mjs:173`;
  `wb-r2.test.mjs:87`; `wiki-projection.mjs:70,241,303,418,422,431`;
  `wiki-projection-ops.mjs:31,91`) were opened and **verified correct**.

**Findings added beyond the amendments (orchestrator verification)**

- **The catch-up's privilege boundary.** `clara_runtime` has no SELECT on
  `document_filings` (0007:2740-2741), so the amendment-2 ceremony verb cannot run the
  inverted scan on the runtime connection. §11 splits it into a ceremony-role scan plus a
  runtime-role marking verb — the exact `backfillWikiSources` contract
  (wiki-projection-ops.mjs:33-36). Resolved within scope; **no grant is added**.
- **`run_lint_all` must join the wiki whitelist** under the new call-edge scan (it calls
  `run_client_lint`, 0017:4930) although its own body touches no wiki relation. This also
  reconciles the DB-side list (0017:6000-6004) with `wb-helpers.mjs`'s
  `WB_WIKI_WHITELIST`, which already included it.
- **Call edges must be a source-token scan.** plpgsql bodies create no `pg_depend` edges
  for their callees, so there is no catalog graph to walk; §9 states this rather than
  implying a stronger mechanism. The only in-body edges into the wiki set today are
  0017:2212, 0017:2264 and 0017:4930 — all from whitelisted callers, verified, so the
  scan does not false-fail at apply.
- **`run_client_lint` swallows raises** into `{status:'failed'}` (0017:4666, 4911-4913);
  the battery must assert on the receipt and the findings table, never on an exception.
- **The tables ship with zero indexes** beyond their PKs (verified against every
  `create index` in 0017), which is why §2's index requirement is new work rather than
  tuning. The inverted-lint side needs none: `uq_document_filing_active` (0007:93-94)
  already covers it.

**Not applied / out of scope (unchanged from the ruling)**

Consent and the typed-purpose surface (0020, WB-R23) · the commit-lane review attestation
(WB-R22) · wiki page lifecycle states · treatment / recurring-pattern synthesis · a
general document→client runtime resolver. No SQL implementation appears in this contract.
