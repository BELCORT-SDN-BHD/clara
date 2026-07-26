// Wave-B rig — migration 0020 §A7/§A8: THE 19 -> 20 UPGRADE FIXTURE.
//
// Everything else in the 0020 batteries runs against a database where 0020 is ALREADY applied,
// so it can only prove what the verb does from now on. This file proves what the MIGRATION does
// to a corpus that already exists — the half ratchet R3 found unproven, and the half that
// decides whether the live deploy is safe.
//
// WHAT IT DRIVES, end to end:
//   1. migrate 0001–0019 only, and build TWO deterministic source pages the pre-A7 way: (a) one
//      published through a non-null p_note (the M1 channel), (b) one whose document's
//      original_filename is prose (the M2 channel A6 missed).
//      Both look identical to A6's bridge: wiki_log action='ingest', synthesis='deterministic',
//      no action='publish' row. Both would have taken the cap + orphan exemptions.
//   2. the shipped READ-ONLY probe reports BOTH halves: bytes AND a stale spine.
//   3. apply 0020 -> it must ABORT on direction 4, naming both pages and the shipped preflight.
//   4. run the shipped AUDITED preflight -> apply 0020 again -> it must SUCCEED.
//   5. REBUILD A SHADOW INDEX FROM EVENTS ALONE and compare EVERY logical field against the
//      live tables. This is the W4/P17 invariant, driven across a correction.
//   6. the preimage is preserved (not erased) in the correction envelope; the preflight is
//      idempotent: a second run appends nothing and changes nothing.
//   7. the pre-0020 noted op key still REPLAYS its receipt, a FRESH noted call is refused, and
//      no prose survives anywhere in the namespace.
//
// The SECOND test is the cell that would have caught ratchet R4 F1: on its OWN corpus it runs
// A7's ORIGINAL two-`update` remediation verbatim, shows the rows go canonical while the
// append-only spine stays stale, shows the event-only rebuild then DISAGREES with the live rows
// by restoring the caller prose, and proves the apply REFUSES that state on direction 5 (before
// amendment A8 it succeeded). The THIRD is the negative control: a clean pre-0020 corpus
// upgrades untouched, with no remediation and no correction envelope.
//
// This is the ONLY 0020 test that RESETS the database (drops schema clara), so it is GATED
// behind CLARA_RIG_ALLOW_RESET=1 and MUST run ALONE — node --test runs files CONCURRENTLY
// against one shared DB, and a mid-run schema drop would nuke the other suites. It SKIPS in a
// normal run — LOUDLY, on stdout, so a skip is never mistaken for a pass (ratchet R4 F2).
// CI runs it FOR REAL in its own throwaway database ("Wave-B 0020 A7/A8 upgrade drill" in
// .github/workflows/ci.yml), beside the C9 / document-pipeline / coding-floor drills.
// Locally: PGDATABASE=clara_wb20_upgrade CLARA_RIG_ALLOW_RESET=1 CLARA_ALLOW_DESTRUCTIVE=1
//   CLARA_RIG_DB=1 node --test tests/wave-b/wb-0020-upgrade.test.mjs

import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, roleQuery, ROLES, opk, endPool, printLaneNotes, noteLane,
  buildWorld, createClient, recordWikiIngest, seedVerifiedDocument, fileTo,
  eventsOf,
} from "./wb-0020-helpers.mjs";
// The shared apparatus — split out when this file passed the repo's 500-line ceiling.
import {
  UPGRADE_DIR, NOTE_PROSE, NAME_PROSE, exportPre0020, deploySql, probe, runPreflight,
  A7_ROWS_ONLY_REMEDIATION, skipUnlessReset, buildPre0020Corpus,
  rebuildIndexFromEvents, assertRebuildMatchesLive, injectDirections123,
  assertAppliedThrough0020, assertRolledBackBefore0020,
} from "./wb-0020-upgrade-helpers.mjs";

after(async () => { printLaneNotes("wb-0020-upgrade"); await endPool(); });

// ===========================================================================
// The drill.
// ===========================================================================

test("[0020 A7/A8 upgrade]: both prose channels ABORT the apply; the audited preflight corrects the rows AND the spine; the index rebuilds CANONICAL from events alone", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../../scripts/reset.mjs");
  const { migrate } = await import("../../scripts/migrate.mjs");
  const { seed } = await import("../../scripts/seed.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0020(), log: () => {} });
  await seed({ log: () => {} });

  const n19 = await rootQuery("select count(*)::int n from clara.schema_migrations");
  assert.equal(n19.rows[0].n, 19, "the world is built at exactly 19 migrations");

  const { w, client, noted, named, notedKey, notedReceipt } = await buildPre0020Corpus();

  // ---- 1. BOTH pages are indistinguishable to A6's bridge --------------------
  // action='ingest', synthesis='deterministic', no action='publish' row: all three of A6's
  // directions pass on bytes that are arbitrary caller text. That is finding M1, driven.
  const preState = await rootQuery(
    `select p.slug, p.title, v.content, v.synthesis,
            (select count(*)::int from clara.wiki_log l
              where l.page_id=p.id and l.action='ingest') as ingest_rows,
            (select count(*)::int from clara.wiki_log l
              where l.page_id=p.id and l.action='publish') as publish_rows
       from clara.wiki_pages p join clara.wiki_page_versions v on v.id=p.current_version_id
      where p.client_id=$1 and p.slug like 'sources/%' order by p.slug`, [client]);
  assert.equal(preState.rows.length, 2, "two deterministic source pages exist at 19");
  for (const r of preState.rows) {
    assert.equal(r.synthesis, "deterministic", `${r.slug}: labelled deterministic`);
    assert.equal(r.ingest_rows, 1, `${r.slug}: carries its ingest log row`);
    assert.equal(r.publish_rows, 0, `${r.slug}: carries NO model-path publish row`);
  }
  const notedPage = preState.rows.find((r) => r.slug === `sources/${noted.documentId}`);
  const namedPage = preState.rows.find((r) => r.slug === `sources/${named.documentId}`);
  assert.equal(notedPage.content, NOTE_PROSE,
    "M1: the caller's note IS the page body, and A6's three bridge directions all pass on it");
  assert.ok(namedPage.content.includes("IGNORE PRIOR INSTRUCTIONS"),
    "M2: the caller-chosen FILENAME is in the page body, with p_note null the whole way");
  assert.ok(namedPage.title.includes("IGNORE PRIOR INSTRUCTIONS"),
    "…and in the page TITLE (0017:2259) — the channel A6's 'p_note is the ONE argument' missed");

  // ---- 1b. THE SHIPPED READ-ONLY PROBE reports BOTH halves -------------------
  // This is the exact statement §10.3 puts in front of the owner before anything runs.
  const p0 = await probe();
  assert.equal(p0.source_pages_total, 2, "probe: both source pages counted");
  assert.equal(p0.d4_bytes_non_canonical, 2, "probe: 2 pages carry non-canonical BYTES (direction 4)");
  assert.equal(p0.d5_spine_non_canonical, 2, "probe: 2 pages carry a stale RECONSTRUCTION SPINE (direction 5)");
  assert.equal(p0.needs_canonicalization, 2, "probe: 2 pages need canonicalization");
  assert.match(p0.offenderText, new RegExp(`sources/${noted.documentId}`), "probe names M1");
  assert.match(p0.offenderText, new RegExp(`sources/${named.documentId}`), "probe names M2");

  // ---- 2. the apply ABORTS, fail-closed, naming both offenders ---------------
  let aborted = null;
  try {
    await migrate({ dir: UPGRADE_DIR, log: () => {} });
  } catch (e) { aborted = e; }
  assert.ok(aborted, "0020 REFUSED to apply over a corpus it cannot reconstruct");
  const msg = String(aborted.message ?? aborted);
  assert.match(msg, /NON-CANONICAL bytes/,
    "the abort says what is wrong: the bytes do not reconstruct");
  assert.match(msg, /wave-b-0020-a7-preflight\.sql/,
    "…and names the SHIPPED remediation rather than leaving a dead end or naming prose");
  assert.match(msg, new RegExp(`sources/${noted.documentId}`),
    "…and names the NOTED page (M1)");
  assert.match(msg, new RegExp(`sources/${named.documentId}`),
    "…and names the PROSE-FILENAME page (M2) — one predicate, both channels");
  await assertRolledBackBefore0020("the migration rolled back whole");

  // ---- 3. the SHIPPED AUDITED PREFLIGHT, run verbatim ------------------------
  await runPreflight();
  const p2 = await probe();
  assert.equal(p2.d4_bytes_non_canonical, 0, "preflight: bytes canonical");
  assert.equal(p2.d5_spine_non_canonical, 0, "preflight: the reconstruction spine is canonical too");
  assert.equal(p2.needs_canonicalization, 0, "preflight: nothing left to canonicalize");
  assert.equal(p2.offenderText, "<none>", "…and the probe says so in words");

  const envelopes = await eventsOf(w.firms.A, "wiki.page_canonicalized");
  assert.equal(envelopes.length, 2, "one correction envelope per affected VERSION (two pages, one version each)");

  // ---- 4. the apply now SUCCEEDS ---------------------------------------------
  await migrate({ dir: UPGRADE_DIR, log: () => {} });
  await assertAppliedThrough0020("0020 applies once BOTH the corpus and its spine reconstruct");

  // ---- 4b. THE SHIPPED POST-VERIFY FILE, run verbatim on the upgraded database.
  // This is the artifact the owner runs at step 7 of the ceremony. Running it here is the
  // only thing that keeps it honest: it raises on the first failed invariant, so a green
  // run IS the assertion. Ten probes, including the DARK receipt and all five bridge
  // directions re-read from OUTSIDE the migration's transaction (the 0016 lesson — an
  // in-txn tail proves the apply, not the committed catalog).
  await rootQuery(deploySql("wave-b-0020-postverify.sql"));
  noteLane("wb-0020-upgrade", "the shipped 0020 post-verify file passes on the upgraded corpus");

  // ---- 5. NO prose survives anywhere in the namespace's BYTES ----------------
  const post = await rootQuery(
    `select p.slug, p.title, v.content from clara.wiki_pages p
      join clara.wiki_page_versions v on v.page_id=p.id
     where p.slug like 'sources/%' order by p.slug`);
  for (const r of post.rows) {
    const docId = r.slug.slice("sources/".length);
    assert.equal(r.title, `Source: ${docId}`, `${r.slug}: canonical title`);
    assert.equal(r.content, `Source document: ${docId}`, `${r.slug}: canonical body`);
  }
  const leak = await rootQuery(
    `select count(*)::int n from clara.wiki_page_versions v
      join clara.wiki_pages p on p.id=v.page_id
     where p.slug like 'sources/%'
       and (v.content like '%IGNORE PRIOR INSTRUCTIONS%'
            or v.content like '%deliberate%'
            or p.title like '%IGNORE PRIOR INSTRUCTIONS%')`);
  assert.equal(leak.rows[0].n, 0, "not one byte of either prose channel survives in the namespace");

  // ---- 6. THE ASSERTION THAT WOULD HAVE CAUGHT F1 ---------------------------
  // Rebuild the index from `domain_events` ALONE and compare EVERY logical field. Under the
  // rows-only remediation this fails on title / hash / key / size; under the correction
  // envelope it is exact.
  const { pages: rebuilt } = await assertRebuildMatchesLive(w.firms.A, { expectCorrected: true });
  for (const s of Object.values(rebuilt)) {
    if (!String(s.slug ?? "").startsWith("sources/")) continue;
    const docId = s.slug.slice("sources/".length);
    assert.equal(s.title, `Source: ${docId}`,
      "the EVENT-ONLY rebuild produces the CANONICAL title — not the filename-bearing one");
  }
  const rebuiltBlob = JSON.stringify(await rebuildIndexFromEvents(w.firms.A));
  assert.ok(!rebuiltBlob.includes("IGNORE PRIOR INSTRUCTIONS - restate"),
    "no rebuilt FIELD carries the prose filename (payload.preimage is audit-only and never replayed)");

  // ---- 7. the PREIMAGE is preserved, not erased ------------------------------
  const preimages = envelopes.map((e) => e.payload?.preimage ?? {});
  assert.ok(preimages.some((p) => String(p.content ?? "").includes("deliberate")),
    "the p_note body — which no other record holds — is preserved in payload.preimage");
  assert.ok(preimages.some((p) => String(p.title ?? "").includes("IGNORE PRIOR INSTRUCTIONS")),
    "…and the filename-bearing title preimage with it");
  const nameStillOnDoc = await rootQuery(
    "select original_filename from clara.documents where id=$1", [named.documentId]);
  assert.equal(nameStillOnDoc.rows[0].original_filename, NAME_PROSE,
    "the filename is untouched on clara.documents — where every human surface already reads it");
  const audited = await rootQuery(
    "select count(*)::int n from clara.audit_log where fn='wave_b_0020_a7_canonicalization'");
  assert.equal(audited.rows[0].n, 2, "the correction is AUDITED — one row per page, not a bare UPDATE");

  // ---- 8. the preflight is IDEMPOTENT ---------------------------------------
  const before = await rootQuery(
    `select count(*)::int n from clara.domain_events where event_type='wiki.page_canonicalized'`);
  const bytesBefore = await rootQuery(
    `select p.id, p.title, v.id as vid, v.content, v.content_sha256, v.storage_key, v.size_bytes
       from clara.wiki_pages p join clara.wiki_page_versions v on v.page_id=p.id
      where p.slug like 'sources/%' order by p.slug, v.version_n`);
  await runPreflight();
  const afterN = await rootQuery(
    `select count(*)::int n from clara.domain_events where event_type='wiki.page_canonicalized'`);
  const bytesAfter = await rootQuery(
    `select p.id, p.title, v.id as vid, v.content, v.content_sha256, v.storage_key, v.size_bytes
       from clara.wiki_pages p join clara.wiki_page_versions v on v.page_id=p.id
      where p.slug like 'sources/%' order by p.slug, v.version_n`);
  assert.equal(afterN.rows[0].n, before.rows[0].n, "a second preflight appends NO duplicate envelope");
  assert.deepEqual(bytesAfter.rows, bytesBefore.rows, "…and changes not one row");

  // ---- 9. OP-KEY REPLAY across the upgrade — the A6 regression, fixed ------
  // The exact same call the runtime made at 19: same client, same document, same NOTE, same op
  // key. Under A6's ordering (floor ahead of _reserve_op) this raised CLR10 and a legitimate
  // delayed retry lost its receipt. Under A7 the reservation comes first, so it REPLAYS.
  const replayed = await recordWikiIngest({
    client, document: noted.documentId, note: NOTE_PROSE, opKey: notedKey,
  });
  assert.deepEqual(replayed, notedReceipt,
    "a delayed EXACT retry of the pre-0020 noted call REPLAYS its stored receipt byte-identically");
  const versionsAfterReplay = await rootQuery(
    "select count(*)::int n from clara.wiki_page_versions where page_id=$1",
    [notedReceipt.page_id]);
  assert.equal(versionsAfterReplay.rows[0].n, 1, "…and wrote no second version");

  // ---- 10. …while a FRESH noted call is refused, typed ----------------------
  let refused = null;
  try {
    await recordWikiIngest({
      client, document: noted.documentId, note: NOTE_PROSE, opKey: opk("a7fresh"),
    });
  } catch (e) { refused = e; }
  assert.ok(refused, "a FRESH noted call is refused after 0020");
  assert.equal(refused.code, "CLR10", "…with the typed code");
  assert.match(String(refused.detail ?? ""), /source_note_not_permitted/,
    "…and its own reason discriminant — replay is honoured, new prose is not");

  noteLane("[A7/A8] the 19->20 fixture drives BOTH content channels A6 left open (p_note and"
    + " original_filename), proves the apply is fail-closed on a corpus that cannot be"
    + " reconstructed, proves the shipped audited preflight corrects the rows AND the append-only"
    + " reconstruction spine and is idempotent, preserves the preimage the bare UPDATE would have"
    + " destroyed, rebuilds the index from events ALONE and compares every logical field, and"
    + " proves the op-key replay A6's ordering broke");
});

test("[0020 A8 · ratchet R4 F1]: A7's ROWS-ONLY remediation is REFUSED — canonical rows over a stale reconstruction spine cannot apply", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../../scripts/reset.mjs");
  const { migrate } = await import("../../scripts/migrate.mjs");
  const { seed } = await import("../../scripts/seed.mjs");

  // THE CELL THAT WOULD HAVE CAUGHT F1. A7 shipped its remediation as two bare `update`s over
  // wiki_pages / wiki_page_versions. They are right about the ROWS. `domain_events` is
  // append-only (0005:288-291) and its wiki.page_published / wiki.source_ingested envelopes
  // still carry the filename-bearing title, hash, key and size — so a projection REBUILT FROM
  // EVENTS (the W4/P17 invariant, and what a DR restore of the index does) would restore the
  // caller prose. Before amendment A8 the apply SUCCEEDED in exactly this state.
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0020(), log: () => {} });
  await seed({ log: () => {} });
  const { w, client, noted, named } = await buildPre0020Corpus();

  // the rows-only remediation, verbatim as A7 shipped it
  for (const sql of A7_ROWS_ONLY_REMEDIATION) await rootQuery(sql);

  const p1 = await probe();
  assert.equal(p1.d4_bytes_non_canonical, 0, "rows-only: the BYTES are now canonical (direction 4 would pass)");
  assert.equal(p1.d5_spine_non_canonical, 2, "rows-only: the SPINE is still stale — the F1 defect, MEASURED");
  assert.equal(p1.needs_canonicalization, 2, "…so both pages still need the audited preflight");

  // the stale envelopes are really there, carrying the real prose
  const stale = await rootQuery(
    `select e.payload->>'title' as title from clara.domain_events e
      where e.event_type='wiki.page_published' and e.payload->>'slug' like 'sources/%'`);
  assert.ok(stale.rows.some((r) => String(r.title).includes("IGNORE PRIOR INSTRUCTIONS")),
    "the append-only log still holds the prose title — this is what a rebuild would restore");

  // and the event-only rebuild proves the consequence, not merely the shape: the index a
  // restore would produce disagrees with the live rows on exactly the corrected fields.
  const { pages: badRebuild } = await rebuildIndexFromEvents(w.firms.A);
  const liveTitle = (await rootQuery(
    "select title from clara.wiki_pages where slug=$1", [`sources/${named.documentId}`])).rows[0].title;
  const pageId = (await rootQuery(
    "select id from clara.wiki_pages where slug=$1", [`sources/${named.documentId}`])).rows[0].id;
  assert.equal(liveTitle, `Source: ${named.documentId}`, "the LIVE row is canonical after the UPDATE");
  assert.notEqual(badRebuild[pageId].title, liveTitle,
    "…and the EVENT-ONLY rebuild disagrees with it — the divergence F1 named, driven");
  assert.ok(String(badRebuild[pageId].title).includes("IGNORE PRIOR INSTRUCTIONS"),
    "…by restoring the caller-chosen filename into the rebuilt page title");

  let aborted = null;
  try {
    await migrate({ dir: UPGRADE_DIR, log: () => {} });
  } catch (e) { aborted = e; }
  assert.ok(aborted, "[A8] 0020 REFUSED a rows-only remediation — the F1 regression is fail-closed");
  const msg = String(aborted.message ?? aborted);
  assert.match(msg, /0020 A8/, "…with the A8 direction-5 abort, not direction 4's");
  assert.match(msg, /reconstruction event/,
    "…which names the append-only spine as the thing that is stale");
  assert.match(msg, /wave-b-0020-a7-preflight\.sql/, "…and names the audited preflight");
  await assertRolledBackBefore0020("the apply rolled back whole");

  // the preflight recovers this state too — it corrects the SPINE even when the rows are
  // already canonical, because its predicate is "not canonical in the rows OR in the spine".
  await runPreflight();
  const p2 = await probe();
  assert.equal(p2.needs_canonicalization, 0, "the preflight repairs a rows-only remediation");
  await migrate({ dir: UPGRADE_DIR, log: () => {} });
  await assertAppliedThrough0020("…and the apply then succeeds");
  await assertRebuildMatchesLive(w.firms.A, { expectCorrected: true });

  // NAMED HONESTLY, because the owner may already have run A7's `update` before reading A8:
  // the bare UPDATE has ALREADY destroyed the p_note body, so the envelope the preflight can
  // still append records the post-UPDATE bytes. The spine is repaired; the note preimage is
  // not recoverable from here. This is the cost of the rows-only path and the reason the
  // shipped preflight — not the `update` — is the remediation §10.3 names.
  const envs = await eventsOf(w.firms.A, "wiki.page_canonicalized");
  assert.equal(envs.length, 2, "one envelope per version, appended over the rows-only state");
  assert.ok(!envs.some((e) => String(e.payload?.preimage?.content ?? "").includes("deliberate")),
    "the p_note body is NOT in the preimage here — the bare UPDATE already destroyed it");
  assert.equal((await rootQuery(
    "select original_filename from clara.documents where id=$1", [named.documentId])).rows[0].original_filename,
    NAME_PROSE, "the FILENAME preimage survives regardless — it never left clara.documents");
  assert.ok(client && noted, "fixture handles used");

  noteLane("[A8/R4-F1] a rows-only remediation leaves the append-only reconstruction spine"
    + " stale; the event-only rebuild then disagrees with the live rows and restores the"
    + " caller prose. Direction 5 refuses that state fail-closed, and the shipped preflight"
    + " recovers it — but the p_note preimage the bare UPDATE destroyed is gone for good");
});

test("[0020 A7/A8 upgrade]: a CLEAN pre-0020 corpus (canonical bytes, null notes, plain filenames) applies with no remediation at all", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../../scripts/reset.mjs");
  const { migrate } = await import("../../scripts/migrate.mjs");
  const { seed } = await import("../../scripts/seed.mjs");

  // The negative control the abort needs: A7 must not be a blanket "all pre-0020 corpora are
  // bad". A source page whose document had NO filename already reconstructs at 19 — the
  // canonical form is exactly 0017's own null-filename branch — so it upgrades untouched,
  // in its ROWS and in its SPINE.
  await reset({ log: () => {} });
  await migrate({ dir: exportPre0020(), log: () => {} });
  await seed({ log: () => {} });

  const w = await buildWorld();
  const client = await createClient(w.users.alice, { name: `wb20upc_${opk("x")}`, opKey: opk("cli") });
  const d = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice", filename: null });
  await fileTo(w.users.alice, { document: d.documentId, client });
  const receipt = await recordWikiIngest({ client, document: d.documentId });
  assert.ok(receipt?.page_id, "a filename-less document ingests at 19");

  const before = await rootQuery(
    `select p.title, v.content from clara.wiki_pages p
      join clara.wiki_page_versions v on v.id=p.current_version_id where p.id=$1`,
    [receipt.page_id]);
  assert.equal(before.rows[0].content, `Source document: ${d.documentId}`,
    "0017's null-filename branch already wrote the canonical body — A7 does not move the form,"
    + " it removes the branch that made it caller-dependent");

  // the probe agrees, in BOTH halves, before anything is applied
  const p0 = await probe();
  assert.equal(p0.needs_canonicalization, 0, "probe: a clean corpus needs nothing");
  assert.equal(p0.d5_spine_non_canonical, 0, "probe: …including its reconstruction spine");

  // and the AUDITED preflight is a no-op on it — it must never touch a canonical page
  await runPreflight();
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.domain_events where event_type='wiki.page_canonicalized'")).rows[0].n,
    0, "the preflight appended NO envelope against a clean corpus (row-scoped, not blanket)");

  await migrate({ dir: UPGRADE_DIR, log: () => {} });
  await assertAppliedThrough0020("0020 applies clean over the canonical corpus — no remediation needed");

  const after = await rootQuery(
    `select p.title, v.content from clara.wiki_pages p
      join clara.wiki_page_versions v on v.id=p.current_version_id where p.id=$1`,
    [receipt.page_id]);
  assert.deepEqual(after.rows[0], before.rows[0], "…and the page's bytes were not touched");

  // the event-only rebuild is exact WITHOUT any correction in play — the other half of the
  // control: A8's rebuild rule does not depend on a correction existing.
  const { pages, versions } = await rebuildIndexFromEvents(w.firms.A);
  const s = pages[receipt.page_id];
  assert.ok(s, "the clean page reconstructs from events alone");
  assert.equal(s.title, `Source: ${d.documentId}`, "…with the canonical title, uncorrected");
  const liveV = (await rootQuery(
    "select to_jsonb(v) as r from clara.wiki_page_versions v where v.page_id=$1", [receipt.page_id]))
    .rows.map((x) => x.r);
  for (const v of liveV) {
    const shv = versions[receipt.page_id]?.[v.id];
    assert.ok(shv, "…and every version with it");
    assert.equal(shv.corrected, false, "…never through a correction envelope");
    assert.equal(shv.content_sha256, v.content_sha256, "hash matches the live row");
    assert.equal(shv.storage_key, v.storage_key, "storage key matches the live row");
    assert.equal(shv.size_bytes, Number(v.size_bytes), "size matches the live row");
  }
});

// ===========================================================================
// [RATCHET R5] THE PROBE ITSELF — the artifact whose output decides whether a human runs the
// remediation. Empirical R5 drove it on a rig and found three gaps, all of the class this
// ratchet keeps finding: THE DOCUMENT CLAIMED A PROPERTY THE CODE DID NOT HAVE.
//   (C) a SILENT FALSE-CLEAN — under an RLS-filtered role every count read zero, which is
//       byte-identical to a clean database, in the one artifact a human trusts to say
//       "nothing to do";
//   (A) the header promised "will 0020 abort and on how many pages" while computing only
//       directions 4 and 5 — a direction-1 violation read CLEAN and the apply then failed;
//   (B) §11's A8-R1 ruling said "the probe reports the population so a gap is visible rather
//       than silent" — and the shipped file did not report it.
// This cell pins BEHAVIOUR, not the claim, and each half is proven non-vacuous: the violator
// is injected, the probe names it, the migration then fails on exactly that direction.
// ===========================================================================
test("[0020 · ratchet R5]: the PROBE refuses an RLS-blinded read, reports ALL FIVE bridge directions, and makes the A8-R1 completeness gap visible", async (t) => {
  if (skipUnlessReset(t)) return;
  const { reset } = await import("../../scripts/reset.mjs");
  const { migrate } = await import("../../scripts/migrate.mjs");
  const { seed } = await import("../../scripts/seed.mjs");

  await reset({ log: () => {} });
  await migrate({ dir: exportPre0020(), log: () => {} });
  await seed({ log: () => {} });

  const w = await buildWorld();
  const client = await createClient(w.users.alice, { name: `wb20r5_${opk("x")}`, opKey: opk("cli") });
  const d = await seedVerifiedDocument({ firm: w.firms.A, kind: "invoice", filename: null });
  await fileTo(w.users.alice, { document: d.documentId, client });
  const clean = await recordWikiIngest({ client, document: d.documentId });
  assert.ok(clean?.page_id, "a canonical source page exists — D4/D5 are 0 from here on");

  // ---- (C) the false-clean. The OLD file reported zeros under clara_authenticated and
  // exited 0; the shipped one refuses. Root and clara_fn_owner must still report. --------
  const blinded = await roleQuery(ROLES.authenticated, deploySql("wave-b-0020-a7-probe.sql"))
    .then(() => null, (e) => e);
  assert.ok(blinded, "the probe REFUSES to report under an RLS-filtered role");
  assert.match(blinded.message, /row-level security FILTERS/,
    "…naming RLS as the reason, not a count");
  assert.match(blinded.message, /indistinguishable from a clean database/,
    "…and naming the consequence it is preventing");
  for (const rel of ["wiki_pages", "wiki_page_versions", "wiki_log", "domain_events"]) {
    assert.match(blinded.message, new RegExp(`clara\\.${rel}`), `…listing clara.${rel}`);
  }
  const asOwner = await roleQuery(ROLES.fnOwner, deploySql("wave-b-0020-a7-probe.sql"));
  assert.ok(Array.isArray(asOwner) ? asOwner.at(-1).rows.length : asOwner.rows.length,
    "clara_fn_owner reads through an unconditional policy under FORCE RLS and is NOT refused"
    + " — the gate must not lock out a role that can see every row");

  // ---- (A) directions 1, 2 and 3 — the three the shipped file did not compute. Each is a
  // fact about how a page was CREATED; wiki_log is append-only, so NO script can repair
  // them, which is why the probe's remedy column says INVESTIGATE. -----------------------
  const d1Slug = await injectDirections123();

  const p = await probe();
  assert.equal(p.d1_sources_page_without_ingest_log, 1, "direction 1 is REPORTED");
  assert.equal(p.d2_ingest_page_outside_namespace, 1, "direction 2 is REPORTED");
  assert.equal(p.d3_sources_page_with_model_publication, 1, "direction 3 is REPORTED");
  assert.equal(p.needs_canonicalization, 0,
    "…while d4 ∪ d5 is ZERO — this is EXACTLY the state the old probe called clean, and"
    + " §10.3's 'if needs_canonicalization is 0, skip to step 2' would have walked into the abort");
  for (const k of ["d1_sources_page_without_ingest_log", "d2_ingest_page_outside_namespace",
                   "d3_sources_page_with_model_publication"]) {
    assert.equal(p.status[k], "BLOCKS THE APPLY", `${k} is flagged as blocking, not context`);
  }
  assert.match(p.offenderText, new RegExp(d1Slug), "the D1 offender is NAMED, not just counted");
  assert.match(p.offenderText, /r5-outside-ns/, "…and the D2 offender");

  // the preflight is NOT the remedy for these, and must not pretend to be: it runs clean and
  // leaves all three standing.
  await runPreflight();
  const pAfter = await probe();
  assert.equal(pAfter.d1_sources_page_without_ingest_log, 1,
    "the preflight does NOT clear direction 1 — the probe's remedy column says INVESTIGATE"
    + " precisely because wiki_log is append-only and no script can undo a creation fact");

  // and the apply fails on EXACTLY the direction the probe named.
  const err = await migrate({ dir: UPGRADE_DIR, log: () => {} }).then(() => null, (e) => e);
  assert.ok(err, "0020 ABORTS — the probe's prediction, confirmed by the migration itself");
  assert.match(err.message, /no deterministic-ingest log row/,
    "…on direction 1, the one the old probe could not see");
  await assertRolledBackBefore0020("…and rolled back");

  // ---- (B) the A8-R1 completeness population, which §11 CLAIMED the probe reported. ----
  // The D1 page's version carries no publication envelope at all: direction 5 cannot see it
  // (its scope is "what the log SAYS must be canonical"), so the probe surfaces it as
  // ADVISORY — visible, and explicitly not a blocker.
  assert.ok(pAfter.a8r1_versions_without_publication_event >= 1,
    "a version with no wiki.page_published envelope is REPORTED");
  assert.equal(pAfter.status.a8r1_versions_without_publication_event, "VISIBLE (advisory)",
    "…as advisory — it must never be presented as blocking, because fabricating a synthetic"
    + " publication envelope for a version that never had one would invent history");
  assert.match(pAfter.offenderText, /version_n=/,
    "…naming the slug AND the version, so the gap can actually be investigated");
  noteLane("wb-0020-upgrade", "[R5] probe gaps A, B and C pinned to behaviour on the shipped file");
});
