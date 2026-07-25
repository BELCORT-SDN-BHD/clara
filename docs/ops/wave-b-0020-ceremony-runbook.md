# Migration 0020 ceremony runbook — typed egress consent (OWNER-`!`-GATED)

**One ceremony, one owner confirmation.** Nothing below runs until the owner explicitly
confirms in-session. Every precondition and probe is listed so that confirmation is
informed.

> **Authority:** `docs/plan/wave-b-migration-0020-design.md` v1.6 §10.3 (amendments A1–A8,
> ratchet R1–R5) · **Artifacts:** `packages/db/deploy/wave-b-0020-a7-probe.sql` (read-only),
> `packages/db/deploy/wave-b-0020-a7-preflight.sql` (audited correction) ·
> **Precedent:** `docs/ops/wave-b-0019-ceremony-runbook.md` (ADR-039), the WB-R18 ceremony.

## What 0020 changes, in one paragraph

Egress consent stops being one purpose-blind row and becomes a **typed** relation plus a
separate owner **activation** — a grant alone does not authorize. The runtime reaches both
only through two `SECURITY DEFINER` verbs: `prepare_egress_dispatch` (plan time) and
`consume_egress_dispatch` (the dispatch linearization point, six arguments since A1 — it
compares *every* dispatch field before consuming, so the binding is structural rather than
audit-only). A uniquely filed `document.classified` event now resolves its client and mints
a deterministic `sources/<document_id>` wiki page; that namespace becomes **reserved**, gets
its **own** page budget (`max_source_pages_per_client = 50000`), and its bytes become a pure
function of the document uuid — no caller note, no filename. **Model synthesis stays DARK**:
zero typed consents and zero activations means every verdict is `unknown` and every
counterparty event still records `held_consent` with the unchanged reason token and op key.

---

## 0. Preconditions — verify ALL before asking for the gate

- [ ] `main` carries the 0020 merge with green CI.
- [ ] **No live-gate journey is open.** WB-R24 version pinning is BINDING — no Gate
      O/K/W2/L/R2/F window may straddle this deploy. If a gate is mid-flight, **0020 waits**.
- [ ] Rig evidence from the merge commit on hand: DB battery green at 20 migrations, runtime
      battery green, the **19 → 20 upgrade fixture green with `CLARA_RIG_ALLOW_RESET=1`**
      (four cells, isolated DB — a skip there is a misleading green and says so on stdout),
      `pnpm typecheck` clean, freeze-lint OK, leak-scan OK, the wiki dynamic-SQL gate
      fail-closed at zero waivers.
- [ ] Canary `daba7f2e` untouched (due 2026-08-02 — **never answer it**).
- [ ] Backups green as of today.
- [ ] Supavisor headroom unchanged — 0020 adds **no** new loop or session; the wiki consumer's
      subscription set widens inside the existing `wiki_projection` consumer.

## 1. Backup first (fresh, verified)

One-off backup run: `fly machine start d895470c6024e8 -a clara-backup` — **never** a plain
`fly deploy` on the backup app. Confirm the run's zero-501 log and the object count against
yesterday's.

## 2. Strict write quiescence

Stop the runtime world so no consumer holds a session; the dashboard serves PostgREST reads
only. Confirm **zero** non-idle `clara_runtime` sessions and zero advisory locks before
proceeding. This is what makes the preflight's `firm_event_seq` advance safe — §10.3 step 1
requires it, because each correction envelope is an append.

## 3. Deploy the runtime image — FIRST

**Runtime-image-first, not DB-first.** The contract's §10.3 states DB-first as the default
and then rules the exception itself: *"DB-first is not acceptable with an image that
predates A5"*, because such an image treats `source_cap_exceeded` and
`reserved_slug_namespace` as unrecognised typed refusals and **blocks the firm cursor**.
The live image (`clara-runtime` release v26) predates A5, so image-first is the only safe
order here.

Image-first is safe in the other direction because the surface guards are **per-event and
per-lane, not cached at startup** (`wiki-projection.mjs:321`): running the new image against
the 19 database, `to_regprocedure` sees the 0020 functions absent, the synthesis lane records
`held_consent` exactly as today and the resolver lane stays `skipped_unresolved_client`;
every other lane runs fully. The moment step 6 applies, the guards go true on the next event
— **no restart, no second deploy**.

From the **repo root**: `fly deploy -c packages/runtime/fly.toml`. Confirm `/ready` 200.

## 4. PROVE exclusive new-binary leadership

Confirm the new release tag holds `WIKI_PROJECTION`, one instance, the expected loop count,
and `/ready` true with **zero warnings**. This is the cutover point — do not proceed on a
stale leader.

## 5. The A7/A8 canonicalization preflight — LOOK, CORRECT, CONFIRM

The 0019 ceremony backfilled ~30 `sources/*` pages with the pre-A7 verb, whose title and
body carried the document's `original_filename`, and which wrote those same bytes into the
**append-only** event log. 0020's bridge aborts on them, on direction 4 and then direction 5.

**(i) LOOK — the read-only probe.** Writes nothing; safe at any time.
```
psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-probe.sql
```
Run it as the **migration/owner role**. It refuses to report under a role RLS could filter
(ratchet R5-C: as `clara_authenticated` every count reads zero, which is byte-identical to a
clean database). It returns a vertical `ord | metric | n | status | remedy` table:

| metric | expected NOW | expected AFTER (ii) |
|---|---|---|
| `source_pages_total` | ~30 | unchanged |
| `d1_sources_page_without_ingest_log` | **0** | 0 |
| `d2_ingest_page_outside_namespace` | **0** | 0 |
| `d3_sources_page_with_model_publication` | **0** | 0 |
| `d4_bytes_non_canonical` | > 0 | **0** |
| `d5_spine_non_canonical` | > 0 | **0** |
| `needs_canonicalization (d4 ∪ d5)` | > 0 | **0** |
| `a8r1_versions_without_publication_event` | 0 (advisory, never blocking) | 0 |

**MEASURED ON LIVE, 2026-07-25**, read-only inside `begin read only`, 104 ms, as `postgres`
(which carries `rolbypassrls`, so the role gate passes): `source_pages_total = 30`,
`wiki_pages_total = 30`, `source_page_versions_total = 30`, **`d1 = d2 = d3 = 0`**,
`d4 = d5 = needs_canonicalization = 30`, `a8r1 = 0`. So the ceremony has **no investigation
stop ahead of it** — all thirty pages are the expected pre-A7 backfill, and the preflight is
the whole remediation. Re-run (i) in the window anyway; this reading is a forecast, not a
substitute.

**STOP if D1, D2 or D3 is non-zero.** They are facts about how a page was *created*, and
`wiki_log` is append-only: **no script can repair them**, and the preflight will not clear
them. Investigate — whose page, which caller, when — and get an owner ruling before going
further. (Reproduced on the rig: with only a D1 violation, the pre-R5 probe reported
`needs_canonicalization = 0`, `<none>` — clean — and the apply then aborted on direction 1.)

**(ii) CORRECT — the audited preflight.** One `do` block = one transaction; safe to re-run.
```
psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-a7-preflight.sql
```
It re-derives each page's title and every version's content / hash / storage key / size from
the document uuid alone, appends **one `wiki.page_canonicalized` correction envelope per
version** carrying the preimage, writes an `audit_log` row per page, then **re-asserts bridge
directions 4 and 5 itself** — returning without error is a proof, not a hope. It prints a
`NOTICE` naming the counts. **Do NOT run the two bare `update` statements from contract
v1.4:** they correct the rows only, leave the append-only spine stale, and 0020 now *refuses*
that state (ratchet R4 F1).

**(iii) CONFIRM — re-run (i).** Every `d1`…`d5` count must read **0** with no offender rows.
Only then proceed.

The object-storage blob at each page's old `content_sha256` is orphaned and no blob is
written at the new key — nothing reads it (every read surface serves
`wiki_page_versions.content` from the database). Named here rather than discovered later.

## 6. Apply migration 0020 (live: 19 → 20 applied)

The §8 tail runs **in-transaction**; any failure aborts the whole migration. Then
`NOTIFY pgrst, 'reload schema'`.

## 7. Post-DB verify

Run under a `clara_runtime`-role probe unless stated otherwise (contract §10.3 step 3):

- `prepare_egress_dispatch` returns `{"verdict":"unknown","authorization_id":null}` for
  **every** client including RPR (whose legacy row is live), byte-identical across them.
- `resolve_document_client` returns the three discriminated shapes on known fixtures, and the
  identical `unresolved` payload for a foreign-firm probe.
- The three new relations are **empty**.
- The invoice-facts lane is still authorized for RPR.
- **No table grant** to `clara_runtime` on any consent relation.
- `clara.wiki_budgets` is a **five**-row set — the four WB-R8 values unchanged plus
  `max_source_pages_per_client = 50000`.
- Re-run step 5(i): all five directions **0**. The apply aborts on any of them, so a green
  apply has already proven this — read it as a receipt.
- `select name from clara.event_types where name like 'wiki.%' order by name` returns
  **exactly four**: `wiki.page_canonicalized`, `wiki.page_published`, `wiki.page_retired`,
  `wiki.source_ingested`.
- A `clara_runtime` `publish_wiki_page_version` with slug `sources/<any uuid>` refuses
  `CLR32` / `reserved_slug_namespace` and writes nothing.
- A `clara_runtime` `record_wiki_source_ingest` with a **non-null** `p_note` on a real filed
  verified document refuses `CLR10` / `source_note_not_permitted`; the same call with a
  **null** note is unchanged.
- `run_client_lint` on the busiest client returns promptly and opens **no** `orphan_page`
  finding against any `sources/%` page. Expect the first post-deploy pass to *supersede* the
  accumulated source-page findings — that pass is proportional to how many there were; every
  pass after it is not.

## 8. Verify DARK, then unquiesce

Every counterparty event still records `held_consent` with the **unchanged** reason token
`wiki synthesis consent unknown` and the unchanged `wikihold:<client>:<seq>` op key; **zero**
`synthesize` calls; **zero** model-lane publications. Then restart the world and confirm
`/ready` true with zero warnings, the wiki page count unchanged, and the firm cursor moving.

## 9. Aftermath

Append the ADR (live posture, counts, what each probe returned). Refresh
`project-clara-rebuild-state` memory. Only then is a live-gate window allowed to open again.

## Rollback posture — read before you need it

**There is no down-migration.** The forward artifacts are the recovery path:

- **Before step 6** — nothing to roll back. The preflight is idempotent and its corrections
  are *appends*; a database that ran it and never applied 0020 is a valid 19 database whose
  source corpus is canonical. That is a strictly better state, not a broken one.
- **At step 6** — the migration is one transaction. A failed apply rolls back whole; the
  database is still at 19 and the abort message names the offending direction and the
  remediation. Fix and re-apply.
- **After step 6** — roll back the **image**, not the schema. The per-event surface guards
  mean an older image degrades lane-locally (synthesis holds, resolver skips) rather than
  dead-lettering — with the caveat from step 3: an image that predates A5 does **not**
  enumerate the two new terminal tokens and will block the firm cursor if either fires. Roll
  back only to an A5-aware image.
- **Data** — the preimage of every canonicalized page is preserved in its
  `wiki.page_canonicalized` envelope's `payload.preimage` and on `clara.documents`. Nothing
  the ceremony does destroys a provenance record.
