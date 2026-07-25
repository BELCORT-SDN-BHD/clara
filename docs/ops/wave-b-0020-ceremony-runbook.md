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

The world is briefly live here against the **19** database. That is safe and deliberate: it is
the state production is already in, and every 0020 dependency in the new image sits behind an
exact-signature guard that reads false at 19.

## 4b. RE-QUIESCE — and this one is not optional

**Stop the machine again before step 5.** Confirm zero non-idle `clara_runtime` sessions.

`planDeterministicIngest` (`packages/runtime/lib/wiki-projection.mjs`) calls
`clara.record_wiki_source_ingest` on the `entry.approved` lane with **no surface guard** — it is
19-era behaviour and is meant to be ungated. So a single `entry.approved` carrying a source
document, arriving between the preflight (step 5) and the apply (step 6), would mint a **fresh**
`sources/` page through the **pre-A7** verb: filename in the title, caller note in the body.
Direction 4 then aborts the apply on a page that did not exist when you ran the probe.

That failure is safe — the migration rolls back whole — but it is confusing at 2am and entirely
avoidable. The preflight takes ~31 ms and the apply ~304 ms on a 30-page corpus, so the quiesced
window is seconds. Do not trade a real race for them.

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

**Apply it through the migration runner, never with `psql -f` on the migration file:**

```
node packages/db/scripts/migrate.mjs          # or: pnpm --filter @clara/db migrate
```

This is not a style preference. `0020_typed_consent.sql` contains **no transaction control of
its own** — the `begin` / `commit` / `rollback` come from `packages/db/scripts/migrate.mjs`
(lines 149-157), which also records the row in `clara.schema_migrations` and verifies the
checksum. Run the file through `psql -f` instead and psql wraps each top-level statement in its
*own* implicit transaction: a failure two-thirds of the way through leaves production
**half-migrated**, with no `schema_migrations` row saying so, and the entire rollback posture
below — which rests on "the migration is one transaction" — silently stops being true. (Verified:
the file has no `begin`/`commit`, and no `CREATE INDEX CONCURRENTLY` or other statement that
would refuse to run inside a transaction, so the runner's wrapper is both necessary and
sufficient.)

The §8 tail runs inside that same transaction, so a tail failure aborts the whole migration.

Then reload PostgREST **and verify it took**:

```
psql -c "notify pgrst, 'reload schema'"
```

A missed reload is invisible from the database side — the catalog is correct and every probe in
step 7 passes — while the dashboard keeps 404-ing the new RPCs as PGRST202, which reads exactly
like a failed migration. Confirm by calling one new verb through PostgREST (or by watching the
PostgREST log for the reload) before you believe step 7's green.

## 7. Post-DB verify

**Run the file, then the runtime-lane checks by hand.**

```
psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0020-postverify.sql
```

Ten probes, read-only, raising on the first failed invariant: at 20 with 0019 intact · the
three typed relations exist **and** are empty (the existence check first, so emptiness cannot
pass vacuously on a half-applied migration) · no application-role table grant on any consent
relation · all nine 0020 verbs present **at their exact signatures**, including A1's six-argument
`consume_egress_dispatch` · `wiki_budgets` is the five-row set with the four WB-R8 **values**
unchanged · exactly four `wiki.*` event types with the correction type client-scoped/`ignore` in
the ACTIVE taxonomy · **all five bridge directions read zero on the committed catalog** · the
**DARK receipt** — `prepare_egress_dispatch` returns byte-identical
`{"verdict":"unknown","authorization_id":null}` for every active client, *including any holding a
live legacy purpose-blind consent*, which is the case a bleed would expose · that probe **minted
nothing** · the legacy relation is intact with no new table grant.

Prose is not enough here and 0019 is why: it shipped an executable post-verify file, and the
value was not that it caught something — it caught nothing — but that "10/10 green" meant
something a human did not hand-assemble at 2am. Verified on a rig seeded to mirror live (30
source pages, one client, one live legacy consent): **10/10**, inside `begin read only`. Proven
non-vacuous by injection — a retuned budget, one non-canonical page, a table grant to
`clara_runtime`, and a fifth `wiki.*` type each failed their probe.

The remaining checks need a runtime lane or a wake credential and are **not** in the file (a
probe that cannot be executed as written is a probe that gets skipped):

**These are REFUSAL probes only. Do not run a probe that writes.** An earlier draft of this
list told the operator to call a null-note `record_wiki_source_ingest` "to verify the canonical
title", which **publishes a real page**: measured on the rig, +1 `wiki_pages`, +1
`wiki_page_versions`, +2 `domain_events`. `domain_events` is append-only, so that is a
production write you cannot take back, performed as a *verification*, on a database whose page
count the next step then asserts. The canonical-bytes property is proven by the upgrade fixture
and re-proven by probe 7 of the file; it does not need a live write. The two refusals below are
safe precisely because they refuse before writing.

- A `clara_runtime` `publish_wiki_page_version` with slug `sources/<any uuid>` refuses
  `CLR32` / `reserved_slug_namespace` and writes nothing.
- A `clara_runtime` `record_wiki_source_ingest` with a **non-null** `p_note` on a real filed
  verified document refuses `CLR10` / `source_note_not_permitted` and writes nothing. *(Do not
  then "check the null-note case is unchanged" — that call is the one that writes.)*
- `resolve_document_client` returns the three discriminated shapes on known fixtures, and the
  identical `unresolved` payload for a foreign-firm probe. Read-only.
- `run_client_lint` on the busiest client returns promptly and opens **no** `orphan_page`
  finding against any `sources/%` page. Expect the first post-deploy pass to *supersede* the
  accumulated source-page findings — that pass is proportional to how many there were; every
  pass after it is not. (This one does write lint rows; it is a normal scheduled operation, not
  a synthetic probe, so it is in scope.)

**Measured on a rig seeded to mirror live** (30 source pages, one client, one live legacy
consent, all 30 needing canonicalization): probe **~30 ms** · preflight **31 ms**, correcting 30
pages / 30 titles / 30 version rows and appending 30 correction envelopes · apply **304 ms** ·
post-verify **10/10**. The quiesced window is seconds, not minutes.

## 8. Restart the world, verify DARK, then unquiesce

Start the machine (it has been stopped since 4b) and confirm `WIKI_PROJECTION acquired`,
`/ready` true with zero warnings, and the firm cursor moving.

**Do NOT expect the wiki page count to hold.** An earlier draft listed "the wiki page count
unchanged" as a success criterion; it is false by construction and contradicts the contract's
own §10.1(1), which lists deterministic publication as **deliberate change #1**. A rising
`sources/*` count after step 8 is the feature working. What must hold is that every new page is
canonical (`Source: <document_id>` / `Source document: <document_id>`) and charged to
`max_source_pages_per_client`, not to the 40-page synthesized cap.

Then the DARK receipt from the runtime side: every counterparty event still records
`held_consent` with the **unchanged** reason token `wiki synthesis consent unknown` and the
unchanged `wikihold:<client>:<seq>` op key; **zero** `synthesize` calls; **zero** model-lane
publications. (The DB-side half is probe 8 of step 7, which already proved every client returns
byte-identical `unknown` — *including* RPR, which holds a live legacy purpose-blind consent and
is therefore the case a bleed would expose.)

**Be honest about what that observation can and cannot prove.** `clara.wiki_synthesis_holds` is
**empty** on this database, which is positive evidence that no counterparty synthesis event has
*ever* reached that lane in production. So "zero synthesize calls, zero model publications" will
be true after the apply whether the lane is correctly dark or completely broken — the
observation cannot distinguish them, and recording it as "DARK verified live" would overstate
it. What is actually verified is the DB-side gate (probe 8, a real discrimination against a real
legacy consent) plus the rig's consumer battery. Treat step 8's runtime half as *no contrary
evidence*, not as proof, and say so in the ADR.

**One behaviour change to expect and not be alarmed by:** deterministic ingest is now live on
`document.classified`, so a uniquely filed classified document mints a `sources/<document_id>`
page where it previously recorded `skipped_unresolved_client`. That is WB-R23(3), ruled — the
point of the resolver, not a side effect. New source pages are charged to
`max_source_pages_per_client` (50,000), not to the 40-page synthesized cap.

## 9. Aftermath

Append the ADR (live posture, counts, what each probe returned). Refresh
`project-clara-rebuild-state` memory. Only then is a live-gate window allowed to open again.

## Rollback posture — read before you need it

**There is no down-migration.** The forward artifacts are the recovery path:

- **Abort at step 3 or 4 (the image is bad).** The database is untouched at 19. Redeploy the
  previous release, start it, confirm `WIKI_PROJECTION acquired`, and stand down — you are
  exactly where you started. This is the cheapest abort and it is why the image goes first.
- **Abort at step 5 (the probe stops you, or the preflight raises).** The database is at 19.
  The preflight is **one transaction**: it either completed or changed nothing, so there is no
  partial state to reason about. If D1/D2/D3 are non-zero, **stand down and investigate** — do
  not proceed. To restore service: start the machine, confirm leadership, done. A database that
  ran the preflight and never applied 0020 is a **valid 19 database whose source corpus is
  canonical** — strictly better than before, and safe to leave indefinitely, including
  overnight and including with the runtime back up. Re-running the preflight later is a no-op.
- **Abort at step 6 (the apply fails).** It rolls back whole *provided you used the runner* —
  see the warning in step 6, which is the single most important line in this document. The
  database is still at 19; the abort message names the offending direction and the remediation.
  Restore service by starting the machine. Then fix the cause and re-run from step 4b.
- **After step 6, the schema does not roll back — and neither does the image.** Be plain about
  this: **there is no A5-aware prior release.** Every deployable earlier image, v26 included,
  predates A5 and therefore does not enumerate `source_cap_exceeded` or
  `reserved_slug_namespace` in the wiki consumer's closed terminal table; if either fires it is
  an unrecognised typed refusal and the **firm cursor blocks**. So "roll the image back" is not
  a recovery path here — it is a second incident. The forward path is the only path: fix, build,
  deploy. If you must buy time, **stop the machine** (the books and the dashboard's PostgREST
  reads are unaffected; only projection stops) rather than start an old one.
- **Data** — the preimage of every canonicalized page is preserved in its
  `wiki.page_canonicalized` envelope's `payload.preimage` and on `clara.documents`. Nothing
  the ceremony does destroys a provenance record. The orphaned object-storage blob at each
  page's old `content_sha256` is unreferenced, not lost.
