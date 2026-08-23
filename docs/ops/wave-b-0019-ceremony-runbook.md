# Migration 0019 ceremony runbook — the wiki authority boundary (OWNER-`!`-GATED)

**One ceremony, one owner confirmation.** Nothing below runs until the owner explicitly
confirms in-session. Every precondition and probe is listed so that confirmation is
informed.

**This ceremony is RUNTIME-IMAGE-FIRST — the first two-sided one.** That ordering is not a
preference; it is ratified in `docs/plan/completed/wave-b-migration-0019-design.md` §11 (binding
amendment 2, after the cross-model debate rejected DB-first). Read §11 before running this.

> **Authority:** contract §11 · **Merged build:** PR #83, `main` at `f6aa5f9` ·
> **Probes:** `packages/db/deploy/wave-b-0019-postverify.sql` ·
> **Precedent:** `docs/ops/wave-b-ceremony-runbook.md` (WB-R18), ADR-036 / ADR-038.

## What 0019 changes, in one paragraph

The authority domain stops **vetoing** a document retirement or wrong-client correction
that a live wiki page cites. Instead the wiki **marks its own sources stale**, driven from
the `document.filing_retired` event. The client-row lock the veto held was the
publication/retirement **serializer** — it stays. `_assert_filing_wiki_unreferenced` is
dropped. The runtime gains the stale lane, a `CLR32/stale_projected_from_seq` status
mapping, and a two-part ceremony catch-up. **No workflow body changes → no `_vN`, zero
freeze-manifest impact** (the consumer is a `startWorld` plugin, not a frozen WDK
workflow).

---

## 0. Preconditions — verify ALL before asking for the gate

- [ ] `main` is at the PR-#83 merge (`f6aa5f9` or later) with green CI.
- [ ] **No live-gate journey is open.** WB-R24 version pinning is BINDING: the state is
      transiently `(old DB + new image)` between steps 3 and 5, so no Gate O/K/W2/L/R2/F
      window may straddle this deploy. If a gate is mid-flight, **0019 waits**.
- [ ] Rig evidence from the merge commit is on hand: DB **895/895**, runtime **580/580**,
      migration applies clean including its in-transaction tail, `pnpm lint` green with the
      wiki dynamic-SQL gate fail-closed at **zero waivers**.
- [ ] Canary `daba7f2e` untouched (due 2026-08-02 — **never answer it**).
- [ ] Backups green as of today.
- [ ] Supavisor headroom unchanged — 0019 adds **no** new loop or session; the subscription
      set widens from 7 to 8 event types inside the existing `wiki_projection` consumer.

## 1. Backup first (fresh, verified)

One-off backup run: `fly machine start d895470c6024e8 -a clara-backup`
— **never** a plain `fly deploy` on the backup app. Confirm the run's zero-501 log and the
object count against yesterday's.

## 2. Strict write quiescence

**A precondition, not a nicety** — it is what makes windows A and B empty (§11). Stop the
runtime world so no consumer holds a session; the dashboard serves PostgREST reads only.
Confirm zero non-idle `clara_runtime` sessions before proceeding.

## 3. Deploy the runtime image — FIRST

From the **repo root**: `fly deploy -c packages/runtime/fly.toml`.

Consumer-library changes only: the `document.filing_retired` subscription, the stale lane,
the `stale_projected_from_seq` → `already_projected` mapping, the configuration-refusal
class, and the catch-up verbs. Confirm `/ready` 200.

## 4. PROVE exclusive new-binary leadership — the actual cutover point

**"The image is up" is NOT the cutover.** An old instance can still hold the
`WIKI_PROJECTION` advisory lock and keep skipping `document.filing_retired`. Only
**exclusive acquisition by the new binary** ends that window.

- [ ] Drain / stop the old instance.
- [ ] Confirm the **new image/tag** logged `WIKI_PROJECTION acquired`.
- [ ] Confirm **no** old instance holds the advisory lock.
- [ ] **Record the instance id and image tag in the ceremony log.**

> **Window A — new image, 0019 not yet applied. EXPOSURE: NONE.**
> The writer does not exist, so the lane's per-event `to_regprocedure` gate makes every
> `document.filing_retired` a checkpoint-only skip. The veto is still present, so a
> retirement with a live wiki source still refuses — there is nothing to mark. A retirement
> without one commits and is correctly skipped. A later publication against a retired
> filing still fails the CLR02 active-filing floor. The loop was designed for exactly this
> shape: healthy and silent against a DB whose surface does not yet exist.

## 5. Apply migration 0019 (live: 18 → 19 applied)

From `packages/db` with the LIVE env — **DSN from the environment, never in argv**, piped
through the committed CA-pinned bridge (`docs/ops/dsn-bridge.md`), never `sslmode=no-verify`:

```
pnpm migrate            # expect exactly: applied 0019_wiki_boundary · 19 total
```

The migration is ONE transaction carrying its own in-txn tail battery. **Any failure aborts
atomically → stop, diagnose on the rig, never hand-patch live.**

Then: `NOTIFY pgrst, 'reload schema';`

> **Window B — the apply itself. EXPOSURE: NONE under quiescence.**
> The writer and the veto removal become visible **atomically together**; no authority
> write can occur in between.
>
> **If the migration FAILS:** the new image stays harmless behind its per-event surface
> gate and the old veto remains intact. That is the failure boundary DB-first does not
> have, and the reason for this ordering.

## 6. Post-DB verify — run the probe file

```
psql -v ON_ERROR_STOP=1 -f packages/db/deploy/wave-b-0019-postverify.sql
```

Ten read-only probes, raising on the first failure (see the file for the reasoning behind
each): 0019 applied · veto helper **gone** and both authority bodies wiki-clean **while
still holding the client-row serializer** · stale columns, paired CHECKs and all six
indexes · the writer present with a runtime-**only** ACL · **no** `wiki.citations_staled`
event type · the `stale_citation` lint class · `clara_runtime` still has **no** SELECT on
`document_filings` · the §1b isolation floor live on the publication core · the §9 closed
set holding on the live catalog · all three `wiki_pages` lockers taking the client row
first.

> Why a separate file when 0019 carries a tail: **the 0016 lesson** — an in-txn tail proves
> *the apply*, not *the live catalog*. Both are needed.

Also confirm via **real PostgREST** (not plain psql — function-scoped `proconfig` isolation
is only honoured through PostgREST): a governed wiki read still serves.

## 7. The named catch-up — reconciliation, not the safety mechanism

Two halves, because `clara_runtime` has **no SELECT on `document_filings`** (the same gap
that makes the runtime document→client resolver return null). No grant is added.

**(i) Ceremony-role scan (read-only, owner connection):**
```
node packages/runtime/scripts/relay.mjs wiki-stale-scan > pairs.json
```
Produces the candidate `(client_id, document_id)` pairs — the veto's blocker query,
**inverted**. Record the pair list as ceremony evidence.

**(ii) Runtime-role marking, with a MANDATORY ceremony run key:**
```
node packages/runtime/scripts/relay.mjs wiki-stale-catchup --run-key <k> --pairs pairs.json
```
Returns `{examined, marked, noop, skipped, run_key}`.

> **The run key is mandatory and must be NEW per repair run.** Op key is
> `wikistale-catchup:<run_key>:<client>:<document>`. A fixed per-pair key is **not
> rerunnable** — `_reserve_op` replays the original receipt forever, so a later run would
> return stale receipts and never examine fresh rows. Same run retried ⇒ same key (a true
> idempotent retry); a new repair run ⇒ a new key.

> **Expected at THIS ceremony: ZERO pairs.** Pre-0019 the veto made "active page citing a
> retired filing" unreachable, and the runtime-first ordering opens no window. **A
> non-empty result is a finding to adjudicate BEFORE unquiescing — not a routine sweep.**

## 8. Post-catch-up verify, then unquiesce

- [ ] Any swept sources are stale, surface in lint, and are marked in reads.
- [ ] Every existing green probe stays green: replay byte-identical · reads served · pack
      shape · rule sightings unchanged.
- [ ] `/ready` 200 with no new warnings. (`held_outbox` entries with
      `condition='notification'` are the by-design wake ledger, **not** a regression.)
- [ ] **Unquiesce.**
- [ ] Record the gate version pin: **migration count + runtime image tag**.

## 9. Aftermath

- [ ] Add the ceremony ADR under `docs/adr/` with the as-run evidence.
- [ ] Refresh memory `project-clara-rebuild-state` (live posture: migrations + image tag).
- [ ] **Gate W2 is now unblocked** — 0019 removes the two known `[R2-F2]` deviations, so the
      live authority-boundary dependency audit can run.
- [ ] 0020 re-grounds its symbol-only anchors against the now-deployed 0019.

## Rollback posture — read before you need it

There is **no DB rollback step** and that is deliberate: migrations are forward-only. The
recoverable failure points are, in order of likelihood:

| Failure | Posture |
|---|---|
| Migration aborts (step 5) | Atomic — nothing applied. The new image is harmless behind its per-event surface gate; the old veto is intact. Diagnose on the rig. |
| Image deploy fails (step 3) | Nothing has changed in the DB. Redeploy or stay on the old image. |
| Old instance won't release the lock (step 4) | **Do not proceed to step 5.** The DB-first exposure window is exactly what this step exists to prevent. |
| Catch-up returns non-empty (step 7) | Adjudicate before unquiescing. A non-zero result means an anomaly predating this ceremony. |
| Defect found after unquiesce | Forward-fix as `0021`. Never hand-patch a live catalog, and never edit a deployed migration file — its checksum is locked. |
