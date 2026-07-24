# Migration 0019 — the wiki authority boundary (WB-R21 · WB-R24(ii)) · design contract DRAFT v0.1

> **Status: DRAFT v0.1 — pending the cross-model design debate.** Authored by the
> orchestrator from the 0019 grounding dossier (workflow `wl5dup6jb`, key `result.d19`;
> every anchor re-verified against `0017_wave_b.sql`, `0007_document_pipeline.sql`,
> `0009_coding_floor.sql`, `packages/runtime/lib/wiki-projection.mjs`) plus rulings
> **WB-R21** + **WB-R24(ii)** (`ruling-batch-adr-037.md:57-77,129-131`). Next (ADR-037
> method): Codex `gpt-5.6-sol` xhigh adversarial design debate → orchestrator
> verification → v1.0 RATIFIED. The **orchestrator's pinned decisions D1–D8 are
> binding** for the draft; the debate may amend them and must settle §12. Discipline
> mirrors 0018: blind lanes → rig reconcile with orchestrator adjudication →
> cross-model ratchet → dual review → the two-sided (DB-then-image) ceremony. **No
> workflow-body changes; zero freeze-manifest implication** — the consumer loop is a
> `startWorld` runtime plugin (`startWorld.ts:218`), not a frozen WDK workflow, so no
> `_vN` bump and `check-frozen-workflows.mjs` does not apply.

## 0. Scope

The wiki authority boundary, per WB-R24(ii): **(a)** remove the R2-F2 EXISTS-veto so a
money correction/retirement proceeds atomically in the authority domain, and drive
stale-marking from the retirement EVENT; **(b)** the monotonic `projected_from_seq`
guard on the projection writer; **(c)** the zero-wiki-reads closed-set tail assertion
that supersedes 0017's narrower exclusion loop.

Concretely, one DB migration `0019` (0018 is the current highest on disk) delivering:
the veto removal + helper drop (§1), the citation/ref stale marker (§2), the
`mark_wiki_citations_stale` writer (§3), the lint finding class (§6), the read-surface
marking (§7), the monotonic guard (§5), and the clean-end-state tail (§9); PLUS a
consumer-library change (§4) that subscribes `document.filing_retired` and adds the
stale lane. **OUT of 0019:** consent/privacy (0020, WB-R23) · the commit-lane
review-attestation (WB-R22) · any new wiki *page* lifecycle state · treatment/
recurring-pattern synthesis · a general document→client runtime resolver (0020's
concern). The retirement EVENT is **not** added here — `document.filing_retired`
already exists and is registered (0007:2688), emitted by both authority fns since
0007/0009.

## 1. The veto as-built → removal (D4a)

**As-built.** `clara._assert_filing_wiki_unreferenced(p_firm,p_client,p_document)
returns void` — 0017:1808-1845, SECURITY DEFINER. It takes the client row FOR UPDATE
(the serialization lock shared with wiki publication), aggregates BLOCKERS from
`wiki_page_citations` on an active page's `current_version_id` where
`document_id=p_document` (1821-1828) UNION `wiki_page_refs` with `ref_kind='document'`
and `document_id=p_document` on active pages (1830-1836), and raises `CLR10` /
`{reason:'active_wiki_document_reference'}` if any blocker exists (1838-1844). It is
the **only** reader of wiki tables among authority fns and the **only** producer of
that reason string anywhere. Two call sites, inserted at 0017 deploy via a
`do $cor$` block (0017:1850-1897) that `pg_get_functiondef → replace → execute`s each
body (so a bare grep for `create function retire_document_filing` still finds only
0007):
- `retire_document_filing(uuid,text,uuid,text)` — `perform
  clara._assert_filing_wiki_unreferenced(f.firm_id,f.client_id,f.document_id);`
  after the CLR17 stale-revision check, before the retirement UPDATE (0017:1859-1861).
- `approve_wrong_client_correction(uuid,text,text,text)` — `perform
  clara._assert_filing_wiki_unreferenced(c.firm,x.from_client,x.document_id);`
  after the CLR19 source-filing check (0017:1881-1884).

**Target (D4a) — symmetric inverse of the 0017 insertion.** 0019 re-runs the same
`do $cor$` idiom in reverse: `pg_get_functiondef` each live body →
`replace(..., <the perform line + its comment>, '')` → `execute`, with a **drift-guard**
asserting (i) the `replace` changed the body (`v_next <> v_def`), and (ii) the
resulting normalized body no longer contains `_assert_filing_wiki_unreferenced`.
This is preferred over re-pasting verbatim 0007/0009 bodies (avoids any drift; 0018
did not touch either — grep clean — so the string-replace target is exact). Then
**`DROP FUNCTION clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid);`**

**Non-wiki blockers MUST survive** the patch (regression-critical): the CLR17
stale-revision guard (0007:1448), the journal-entry live-blocker (0007:1449-1456), and
the CLR19 source-filing guard (0009:2456) all stay — the §9 tail asserts their tokens
remain present in each patched body. The helper's client FOR UPDATE lock existed only
for the veto's read; removing it does not weaken the authority txn (retirement/
correction hold their own filing/entry locks). By design, publication and retirement
no longer synchronously serialize — they converge via stale-marking (§10 R2-F2c).

## 2. The stale marker — citation/ref columns (D1)

**No stale/invalidation concept exists today:** `wiki_pages.state ∈
('active','retired')` (0017:833), `wiki_page_versions.state` has no `'stale'`
(0017:867), and `wiki_page_citations` / `wiki_page_refs` have **no lifecycle column**
(0017:891-924, 926-965). D1 pins a **citation-level** marker and **NO new page
state**.

Both reference relations the veto scanned gain the same additive pair (a document is
referenced as a citation on a version OR as a page-level `ref_kind='document'` ref —
both must be markable):

- **`clara.wiki_page_citations`** and **`clara.wiki_page_refs`** each gain:
  - `stale_at timestamptz null`
  - `stale_reason text null check (stale_reason in ('source_filing_retired'))`
  - paired presence CHECK: `((stale_at is null) = (stale_reason is null))`
    (the 0018 `bound_scope` pattern, 0018:36-53).

Columns are additive and nullable → all existing rows are unmarked (`stale_at is
null`) and every existing read is byte-identical until a writer marks a row. History
is preserved: versions are immutable, the citation/ref row is **retained and
flagged**, never deleted. The `stale_reason` enum is single-valued now
(`'source_filing_retired'`); it is the extension seam for future reasons (e.g. a
future `'source_filing_corrected'`), mirroring 0018's single-valued
`bound_scope_kind`.

## 3. The writer — `mark_wiki_citations_stale` (D2)

**New:** `clara.mark_wiki_citations_stale(p_client uuid, p_document uuid, p_reason
text, p_op_key text) returns jsonb` — SECURITY DEFINER, `set
search_path=clara,pg_temp`, created under `set role clara_fn_owner`, `revoke all from
public`, **`grant execute to clara_runtime` ONLY** (never `clara_authenticated`,
`clara_agent_ro`, `clara_wake_*` — the runtime-only ACL matrix, mirroring
`set_wiki_synthesis_hold` at 0017:5128).

Behaviour:
- Validates `p_reason` against the same allowed set as the column CHECK (currently
  `'source_filing_retired'`), else a typed refusal.
- Marks **live** references of `p_document` for `p_client`: (i) `wiki_page_citations`
  rows whose `version_id` is the `current_version_id` of an **active** page of
  `(p_client, firm)` with `document_id=p_document` and `stale_at is null`; (ii)
  `wiki_page_refs` rows on an active page of `(p_client, firm)` with
  `ref_kind='document'`, `document_id=p_document`, `stale_at is null` — i.e. the exact
  blocker scope the veto scanned (0017:1821-1836), now flipped from a raise into a
  mark. Superseded-version and retired-page citations are **not** touched (they are
  immutable history, not live provenance).
- Sets `stale_at = now()`, `stale_reason = p_reason`.
- **Idempotent:** the `where stale_at is null` filter leaves already-stale rows
  untouched; a **zero-match call is a clean no-op** returning
  `{citations:0, refs:0, status:'noop'}` (the D3 lane and the D8 catch-up both depend
  on this — re-delivery and a re-run must never error or double-mark).
- **Audited:** writes `clara.wiki_log` (`action='mark_stale'` — the log action CHECK
  gains that value; see below) and appends the registered typed event
  `'wiki.citations_staled'` (client-scoped, decision `'ignore'` — added to the event
  taxonomy alongside 0017:5087-5089) with payload counts `{document_id, reason,
  citations_marked, refs_marked}`.
- Op-key discipline: `_reserve_op` / `_finish_op` over every argument (the standard
  dedupe), so a redelivered `document.filing_retired` at the same seq is a dedupe hit.

**Schema alters this writer requires** (no home today): `clara.wiki_log.action` CHECK
gains `'mark_stale'` (0017:972-973); the `'wiki.citations_staled'` event type is
registered (the G1 taxonomy pattern, 0017:5086+). The writer is added to the
granted-wiki-touch **whitelist** (§9).

## 4. The consumer lane — `document.filing_retired` → stale (D3)

**As-built.** The consumer is a `startWorld` runtime plugin
(`packages/runtime/lib/wiki-projection.mjs`; leader loop + ceremony verbs in
`wiki-projection-ops.mjs`); `WIKI_PROJECTION_EVENT_TYPES` (37-41) subscribes
`document.classified, entry.approved, counterparty.created/merged,
egress.consent_granted/revoked, seeding.proposal_decided`; all other types are
checkpoint-only advances. `planEvent` (315-338) dispatches by type to a
`{status, lane?, mutate?(client)}` plan; `runTargetEvent` (370-396) runs
`plan.mutate` then the checkpoint in one txn (a typed CLR terminal → checkpoint-only;
a conn error propagates; anything else dead-letters). `mapEventRow` (399-404) already
extracts `clientId` + `documentId` from every event row.

**Both keys the writer needs ride the event today** — no resolver required:
- `retire_document_filing` emits `document.filing_retired` with `client_id=f.client_id`,
  `document_id=f.document_id` (0007:1462).
- `approve_wrong_client_correction` (the LIVE 0009 definition) emits it with
  `client_id=x.from_client` (the SOURCE/citing client whose provenance goes stale),
  `document_id=x.document_id` (0009:2561).

**Target (D3).** Add `'document.filing_retired'` to `WIKI_PROJECTION_EVENT_TYPES`, and
a new `planEvent` case → `planFilingRetiredStale({ ev, clientId: ev.clientId,
documentId: ev.documentId })` returning:
```
{ status: 'citations_staled', lane: 'filing_retired',
  mutate: (c) => c.query('select clara.mark_wiki_citations_stale($1,$2,$3,$4)',
    [clientId, documentId, 'source_filing_retired',
     `wikistale:${clientId}:${ev.seq}`]) }
```
The op_key `wikistale:<client>:<seq>` is the pinned seq-embedded idiom (the same shape
as the existing `wikihold:<client>:<seq>`). A **defensive `to_regproc` surface gate**
on `clara.mark_wiki_citations_stale` (the `wiki-projection-ops.mjs:100-108` pattern
already used for `record_wiki_source_ingest`) makes the lane a checkpoint-only skip if
the writer is absent — harmless under a rollback, and belt for the deploy ordering.
Because the writer is idempotent + op-key-deduped, re-delivery and the leader's
at-least-once semantics never double-mark. **This is a consumer-lib change only — no
`_vN`, no freeze implication.**

## 5. The monotonic `projected_from_seq` guard (D5)

**The residual (v25-runtime-lanes-memo.md:118-120):** `projected_from_seq`
(`wiki_page_versions.projected_from_seq bigint`, 0017:871) is re-checked in-txn by the
app-side `currentProjectedSeq` (wiki-projection.mjs:159-166; model lane 242-247,
seeding lane 304-309, `already_projected` skips at 212/292) — but two writers inside
the same ms window can both observe the old value and both publish, producing a
duplicate version. D5 makes the in-txn recency check **structural** on the DB writer.

**Target.** An additive, NULL-safe monotonic guard inside
`_publish_wiki_page_version_core` (0017:1979-…), on the **supersede branch** only
(`v_prior is not null`, 0017:2080-2088), evaluated before the supersede UPDATE +
version insert: **if** `p_projected_from_seq is not null` **and** the prior published
version's `projected_from_seq is not null` **and** `p_projected_from_seq <=
prior.projected_from_seq` **then** the write is an older-seq no-op — it **converges**:
return the existing current-version reconstruction (the same jsonb shape a dedupe
returns) WITHOUT inserting a new version. The runtime maps this converge receipt to
`already_projected` → **checkpoint-only advance** (D5: "an older-seq write is a
checkpoint-only no-op; mirror the in-txn recency-check semantics, made structural").

Invariants the guard must preserve: **NULL-safe** — deterministic ingest passes
`projected_from_seq = null` (`record_wiki_source_ingest`, 0017:2269) and the new-page
branch (0017:2065-2069) has no prior, so both bypass the guard and publish;
**op_key dedupe unchanged** — `publish_wiki_page_version` still hashes
`projected_from_seq` into its reservation (0017:2205-2210), so a same-key redelivery is
a dedupe hit and the guard governs only a *different*-key stale-seq write;
**app-side `already_projected` still holds** — the consumer's pre-check
(wiki-projection.mjs:212/292) short-circuits before the DB write, the DB guard is the
race backstop, and `wave-b-wiki-projection-consumer.test.mjs:105` +
`:116-129` (rewind→redrive→`already_projected`, no dup version) must both still pass.

## 6. The lint finding — `stale_citation` (D6)

`clara.lint_findings.finding_kind` is a closed CHECK set (0017:1323-1325); 0019 ALTERs
it to add `'stale_citation'`. `clara.run_client_lint(p_client,p_op_key)`
(0017:4657-4915; granted `clara_runtime`, in the wiki-touch whitelist, skips
non-active clients) gains a finding class that surfaces the §2 marks: for each live
`stale_at is not null` citation/ref, append a `v_conditions` entry
`{finding_kind:'stale_citation', dedupe_key:'stalecite:'||<page_or_citation_key>,
severity:'warn', detail:{document_id, page_id, stale_reason, since}}`. It rides the
existing episode machinery unchanged — one-open-per `(client, dedupe_key)`
(`uq_lint_findings_one_open`, 0017:1358), open/recheck_opened/superseded convergence
(4816-4880), notify-once via `_record_notification_core` (4894-4903), no new
`event_kind` — and converges to superseded on a clean re-publish. This is the visible,
lint-surfaced half of WB-R21 ("visible, lint-surfaced, history preserved immutably").

## 7. Read-surface marking — inform-never-decide (D1 read surfaces)

Once §2 lands, `to_jsonb(c)` / `to_jsonb(r)` in the read surfaces carry `stale_at` +
`stale_reason` **for free**, so per-citation staleness is exposed with no fn change to
the citation/ref arrays. 0019 additionally exposes a **derived** page-level flag so a
reader can see staleness without scanning the array:

- **`get_wiki_page`** (0017:2374-2402) — gains `has_stale_citations` = EXISTS a live
  citation (current version) OR ref (active page) of this page with `stale_at is not
  null`; its `citations`/`refs` arrays already carry the per-row `stale_at`.
- **`list_wiki_pages`** (0017:2404-2430) and **the context-pack wiki block**
  (`get_context_pack`, in the wiki-touch whitelist) — each page gains the same derived
  `has_stale_citations`.

**Inform-never-decide (LAW).** The pack and reads **MARK, never drop**: a page with
stale citations is still served, still current, still usable — the mark is advisory
surfacing, never a gate. This is the read-side embodiment of ADR-004 "wiki informs,
never decides" and is what WB-R21 replaces the veto with. No page is retired or hidden
by staleness.

## 8. Gate-W2 disposition ends (D7)

WB-R21's interim disposition recorded the two veto call sites as a **closed set of
exactly two KNOWN DEVIATIONS** for the live Gate-W2 dependency audit
(ruling-batch-adr-037.md:75-77; `wave-b-contract.md:180-183`). **Post-0019 that
interim disposition ENDS:** the veto is gone, the helper is dropped, and the §9
clean-end-state tail proves ZERO wiki reads from authority fns. The contract records
that after 0019 deploys, the Gate-W2 dependency audit expects **ZERO exceptions** —
the two-known-deviations allowance is retired, not carried forward.

## 9. The 0019 in-transaction tail battery (the clean-end-state closed set)

0017 idioms plus the debate's clean-end-state assertions. **Structural / catalog:**
- `to_regproc('clara._assert_filing_wiki_unreferenced(uuid,uuid,uuid)') is null` —
  the helper is GONE (the DROP took).
- `retire_document_filing` + `approve_wrong_client_correction` bodies no longer
  contain `_assert_filing_wiki_unreferenced` (normalized-source scan).
- Their non-wiki blockers SURVIVE: each body still contains the CLR17, CLR19, and
  journal-entry-live-blocker tokens (§1).
- The stale marker exists on BOTH `wiki_page_citations` and `wiki_page_refs`:
  `stale_at` + `stale_reason` + the reason CHECK + the paired presence CHECK.
- `mark_wiki_citations_stale(uuid,uuid,text,text)` exists; SECURITY DEFINER;
  `search_path=clara,pg_temp`; arg names/owner as specified.
- `wiki_log.action` CHECK contains `'mark_stale'`; `lint_findings.finding_kind` CHECK
  contains `'stale_citation'`; the `'wiki.citations_staled'` event type is registered.
- `get_wiki_page` / `list_wiki_pages` bodies reference the derived
  `has_stale_citations`; `run_client_lint` body references the `stale_citation` class.
- The monotonic guard is present in `_publish_wiki_page_version_core` (its source
  contains the `projected_from_seq <= prior` comparison on the supersede branch).

**Grants / capability closed set:**
- `mark_wiki_citations_stale` is granted `clara_runtime` ONLY (runtime-only ACL
  assertion) and MUST NOT reach `clara_authenticated`, `clara_agent_ro`,
  `clara_wake_interactive`, `clara_wake_proactive`.
- `mark_wiki_citations_stale` is ADDED to the granted-wiki-touch whitelist (extends
  the 0017:6000-6004 set: `publish_wiki_page_version, record_wiki_source_ingest,
  retire_wiki_page, set_wiki_synthesis_hold, clear_wiki_synthesis_hold, get_wiki_page,
  list_wiki_pages, get_context_pack, run_client_lint` → **+ `mark_wiki_citations_stale`**).
- PUBLIC-execute sweep = 0 on the new fn.

**The CLEAN-END-STATE closed-set scan (D4b — supersedes 0017's exclusion loop).**
0017's exclusion loop (5945-5967) scanned a **fixed named list** of authority/K/S fns
for the seven-table wiki family and **OMITTED** `retire_document_filing` +
`approve_wrong_client_correction` (that omission is exactly why the veto could hide
there). 0019 replaces it with the **inverse closed-set scan**: scan **ALL** `clara`
SECURITY DEFINER fns for any word-bounded reference to the seven wiki relations
(`wiki_pages|wiki_page_versions|wiki_page_citations|wiki_page_refs|wiki_log|
wiki_budgets|wiki_synthesis_holds`) and FAIL if any fn outside the explicit whitelist
(the §9 whitelist set above — the read/lint/wiki-writer functions) references one.
This provably covers the two authority fns (now clean after §1) and any future
authority fn, without a hand-maintained named list.

**Supersession of the 0017 apply-time pins (explicit).** The 0017 veto-existence pins
(5595-5618) asserted the helper's source shape and that the perform call precedes the
retirement UPDATE in each body. Those ran **apply-time-once at 0017-apply** and pass
there because the rig replays `0001→…→0019` in order (the veto IS present when 0017
applies). **0019 MUST NOT re-run 5595-5618** — 0019's own tail is the clean-end-state
assertion above, which is the exact inverse. The contract states this supersession so
no lane re-imports the stale pins.

**Discipline.** Every functional tail probe runs inside a forced-rollback
subtransaction (never commit fixture audit/event/log rows into production). Fn bodies
created under `set role clara_fn_owner` / `reset role`. One transaction; any failure
aborts the apply.

## 10. The blind battery's charter (contract-only; SQL-unread)

**Veto-gone (the inversions — R2-F2 now proceeds + citations go stale):**
- The **R2-F2c laundering repro now PROCEEDS**: a publication RACING a retirement — the
  as-built asserted "never both-ok" synchronous serialization; post-0019 **both
  succeed** and the page ends **STALE** (citation marked, page still served), not
  "active citing a retired filing" — invariant flips to eventual stale-convergence.
- Retiring a filing that HAS a live citation now **succeeds**; the citation is marked
  stale (via the consumer lane / writer) and a `stale_citation` lint finding opens.
- A wrong-client correction MOVE under a live citation now **succeeds**; the SOURCE
  client's (`x.from_client`) citations/refs go stale.

**Writer (`mark_wiki_citations_stale`):**
- Idempotency: a second call for the same `(client, document)` is a no-op
  (`{citations:0,refs:0}`); already-stale rows are untouched (first call's `stale_at`
  preserved).
- Cross-firm/cross-client isolation: the writer marks ONLY the target `(firm, client,
  document)`'s live citations/refs; a same-document citation on another firm/client's
  page is untouched (extends `wb-x-crossfirm`).
- Zero-match: a document with no live citation returns the clean no-op receipt.
- Scope precision: only current-version-of-active-page citations and active-page
  `ref_kind='document'` refs are marked; superseded-version and retired-page rows stay
  unmarked (immutable history).

**Consumer lane (rig — event → stale):**
- `document.filing_retired` from `retire_document_filing` → the citing client's
  citations go stale end-to-end; the checkpoint advances.
- `document.filing_retired` from `approve_wrong_client_correction` → the SOURCE
  client's citations go stale (not the destination client's).
- Checkpoint / at-least-once semantics: re-delivery of the same event (same seq) is an
  op-key dedupe + writer no-op → no double-mark; a redrive after a rewound checkpoint
  re-marks nothing new.
- Defensive surface gate: with the writer absent (`to_regproc` null) the lane is a
  checkpoint-only skip, no dead-letter.

**Monotonic guard:**
- An older-seq supersede write is a no-op (converges to the existing reconstruction; no
  duplicate version row).
- Two-session, same-ms-window double-writer: exactly one publishes a new version; the
  stale-seq session converges → checkpoint-only.
- NULL-safe: deterministic ingest (`projected_from_seq` null) still publishes; the
  new-page branch still publishes.
- The op_key dedupe and the app-side `already_projected` skip are unchanged
  (`wave-b-wiki-projection-consumer.test.mjs:105,:116-129` still green).

**Lint finding:**
- A stale-marked citation surfaces a `stale_citation` finding (`dedupe_key
  stalecite:…`), one-open-per, notify-once; a clean re-publish converges it to
  superseded.

**Pack / read-surface marking (inform-never-decide):**
- `get_wiki_page` / `list_wiki_pages` / the context-pack wiki block expose
  `has_stale_citations = true` and per-citation `stale_at` after a mark — AND the page
  is **still served, still current** (marked, never dropped, never gated).

**Regression set — every existing veto-pinning cell enumerated as an ADJUDICATED
update** (from the dossier hazards; the blind battery treats these as required rewrites,
not incidental churn):
- `packages/db/tests/wave-b/wb-r2.test.mjs [R2-F2a]` (87-111) — **INVERT**: retire with
  a live citation now succeeds + citation stales + lint surfaces (was: refuses named,
  succeeds only after the page retires).
- `wb-r2.test.mjs [R2-F2b]` (113-133) — **INVERT**: a correction MOVE under a live
  citation now succeeds + source-client citations stale.
- `wb-r2.test.mjs [R2-F2c]` (135-186) — **FUNDAMENTALLY CHANGES**: from "never both-ok"
  synchronous serialization to eventual stale-convergence (both can succeed; page ends
  stale). These three cells name no helper — they assert *behaviour*
  (`assertRaisesOneOf`), so the rewrite is behavioural.
- `rig-docs-correction.test.mjs`, `rig-docs-retention.test.mjs`,
  `rig-docs-filings-provenance.test.mjs` — **VERIFY UNCHANGED**: the non-wiki CLR17 /
  CLR19 / journal-entry-live blockers survive the clean create-or-replace (§1).
- `wave-b-wiki-projection-consumer.test.mjs` (:105 `projected_from_seq`, :116-129
  `already_projected`) + `wave-b-wiki-projection-unit.test.mjs` — **EXTEND**: the new
  `document.filing_retired` subscription + stale lane + the monotonic guard.
- The 0017 apply-time veto-existence pins (5595-5618) — **NOT re-run** by 0019 (§9);
  the rig replays them at 0017-apply where the veto is present.

**Companion rosters (battery fixes, per the 0018 [AMB-0018-5] precedent):** the
closed-roster / grant-matrix cells (rig-isolation, `wb-g-opkeys`, `wb-g-tail`) gain
`mark_wiki_citations_stale` + its `clara_runtime`-only ACL + its wiki-touch-whitelist
membership.

## 11. Deployment (two-sided; the one-off catch-up; the WB-R24 pin) — D8

**Ordering: DB migration FIRST, THEN the runtime image** (D8). Rationale: `0019`
creates the writer and removes the veto; while the OLD image runs, a
`document.filing_retired` it does not yet subscribe to is checkpoint-skipped — a
harmless *transient un-marked window*, because the one-off catch-up (below) sweeps
exactly that window after the image ships. (This deliberately differs from the
dossier's runtime-first recommendation; the catch-up is what makes DB-first safe —
see §12 open item O-6, which the debate must confirm.)

Ceremony (owner-`!`-gated; the ADR-036 backup-first + quiesce discipline):
1. **Backup-first** → quiesce.
2. **Apply migration 0019** (the §9 tail runs in-txn; the apply aborts on any tail
   failure) → `NOTIFY pgrst, 'reload schema'`.
3. Post-DB verify probes: helper GONE; the two authority fns clean; a live citation
   can now be retired (bounded rig-style probe on a throwaway or a scoped fixture,
   forced-rollback); the writer + columns + CHECKs present.
4. **Deploy the runtime image** (`fly deploy` from repo root — the consumer-lib bump
   only: `document.filing_retired` subscription + stale lane; the loop is a
   `startWorld` plugin, **no `_vN`, zero freeze impact**). Confirm `/ready` 200 and the
   `WIKI_PROJECTION` lane acquires.
5. **The one-off CATCH-UP** (runs AFTER the image is up, so forward events are already
   subscribed): mark stale for **all already-retired filings with live citations** —
   i.e. every window retirement the old image skipped. Because pre-0019 the veto made
   "retired filing with a live citation" impossible, the historical set is empty and
   this sweeps **exactly the DB-first window**. Exact ceremony SQL (idempotent; the
   writer's zero-match/already-stale no-ops make re-runs safe):
   ```
   -- run under the ceremony/owner role (owner bypasses the clara_runtime EXECUTE grant)
   do $catchup$
   declare r record;
   begin
     for r in
       select distinct p.client_id, ref.document_id
       from clara.wiki_pages p
       join lateral (
         select c.document_id
           from clara.wiki_page_citations c
           where c.version_id = p.current_version_id
             and c.document_id is not null and c.stale_at is null
         union
         select rf.document_id
           from clara.wiki_page_refs rf
           where rf.page_id = p.id and rf.ref_kind = 'document'
             and rf.document_id is not null and rf.stale_at is null
       ) ref on true
       where p.state = 'active'
         -- the document has NO live filing to that client (retired/moved away)
         and not exists (
           select 1 from clara.document_filings df
           where df.document_id = ref.document_id
             and df.client_id = p.client_id and df.retired_at is null)
     loop
       perform clara.mark_wiki_citations_stale(
         r.client_id, r.document_id, 'source_filing_retired',
         'wikistale-catchup:' || r.client_id || ':' || r.document_id);
     end loop;
   end
   $catchup$;
   ```
   (The predicate is the veto's blocker query, INVERTED — the same shape §6's lint
   scan could reuse. §12 O-2 asks whether this becomes a named ceremony verb vs this
   inline block.)
6. Post-catch-up verify: the swept citations are stale + surface in lint + reads mark
   them; every existing green probe (replay byte-identical, reads served) stays green.
   Unquiesce → record the Gate-W2 / gate version pin (migration count + runtime image
   tag).

**WB-R24 version-pinning (binding).** The DB-then-image ceremony means the state is
transiently `(0019 DB + old image)` between steps 2 and 4. **No live-gate journey may
straddle the deploy** — the whole ceremony (steps 1-6) must land OUTSIDE any live-gate
window (Gate O/K/W2/L/R2/F). The contract states the constraint; the **orchestrator
owns scheduling**. If a gate window is open, 0019 waits.

## 12. Open items for the cross-model debate

- **O-1 (monotonic guard surface):** on a stale-seq supersede — the draft default is a
  **silent converge** (return the existing reconstruction, runtime maps to
  `already_projected`/checkpoint-only, mirroring the in-txn recency check). The
  alternative is a **typed terminal CLR** the runtime already maps to checkpoint-only.
  Both satisfy D5's "checkpoint-only no-op"; the debate picks the exact return/refusal
  shape and whether the converge receipt is distinguishable from a dedupe.
- **O-2 (catch-up mechanism):** inline ceremony `do` block (§11 default) vs a named
  one-off ceremony verb (the `wiki-projection-ops.mjs` backfill precedent — grant +
  tail + its own idempotency receipt). Verb = auditable/re-runnable; inline = zero
  new surface. Does the verb warrant its own `clara_runtime` grant + whitelist entry,
  or stay ceremony-role-only?
- **O-3 (lint scan depth):** the draft has `run_client_lint` surface the §2 **marks**
  (`stale_at is not null`). Should it ALSO independently run the inverted-blocker scan
  (a live citation whose document has no live filing) as belt-and-suspenders, catching
  any unmarked citation regardless of the event/consumer path? The catch-up (§11) makes
  this redundant for the deploy, but the dossier flagged the inverted scan as the
  robust safety net.
- **O-4 (marker grain — refs):** D1 marks BOTH citations and refs. Confirm refs need
  the marker independently (page-level, not versioned) vs. deriving ref staleness from
  the page's citation state. Draft marks both (the veto scanned both).
- **O-5 (writer scope — "live" definition):** confirm the writer marks only
  current-version-of-active-page citations (draft) vs. all non-superseded citations of
  the document; and whether a later re-publish that re-cites the same (now-retired)
  document should be prevented or itself immediately marked.
- **O-6 (deploy ordering):** D8 pins DB-first + catch-up; the dossier hazard argued
  runtime-image-first (subscribe before the veto drops, no window). The debate must
  confirm the catch-up fully closes the DB-first window (it sweeps every skipped
  window retirement) and that DB-first has no other exposure the runtime-first ordering
  would have avoided.
- **O-7 (stale_reason extensibility):** the enum is single-valued
  (`'source_filing_retired'`). Confirm no second reason is needed at 0019 (e.g. a
  distinct `'source_filing_corrected'` for the wrong-client-move path) — the draft uses
  one reason for both authority paths.
- **O-8 (event `wiki.citations_staled`):** emitted for audit (decision `'ignore'`).
  Confirm nothing subscribes to it — it must NOT enter `WIKI_PROJECTION_EVENT_TYPES`
  (that would loop the consumer onto its own writes).
