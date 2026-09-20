// #979 [0251] — THE DEPRECIATION AUTHORITY READ TELLS "NEVER HAD ONE" APART FROM "HAD ONE, AND
// IT WAS RETIRED", AND SURFACES THE RETIREMENT'S OWN FACTS.
//
//   p979.none      AC1 — a client with no depreciation authority at all still returns a null
//                  authority. Regression pin: unaffected by this file, asserted anyway because
//                  the ticket names it as its own criterion.
//   p979.retired   AC2 — a client whose ONLY authority is retired: the read returns THAT
//                  authority, with its status, reason, retiring author, timestamp and window
//                  floor — never the bare null a never-proposed client returns.
//   p979.recent    the fallback picks the client's MOST RECENT retired authority when more than
//                  one exists, never an older one.
//   p979.preferred AC3/AC5 — a live authority is still preferred over an older retired one, the
//                  preference is untouched, and the object it returns carries NONE of the three
//                  fields this file adds (they are appended only on the retired arm).
//
// EVERY ASSERTION UNDER TEST RUNS THROUGH A PERSONA (getAuthority / proposeAuthority /
// signAuthority / retireAuthorityVerb, each `humanQuery` at its own floor). `rootQuery` appears
// only as a READBACK, cast to plain text/epoch so a comparison never depends on how the pg
// driver happens to parse a `date`/`timestamptz` column in the runner's own timezone (the exact
// trap apps/web/lib/business-date.ts's header names).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate979, faWorld, freshFaClient, proposeAuthority, signAuthority, retireAuthorityVerb,
  getAuthority, rootQuery, x41EnsureReady, skip41, endPool, printLaneNotes, printSkipCount,
} from "./fa-authority-retired-read-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("fa-authority-retired-read");
  printSkipCount("fa-authority-retired-read");
  await endPool();
});

/** Rig readiness first (the x41 world), then 0251's own frontier. */
const shut = async (t) => (skip41(t, live, "the #979 authority-retired-read battery") ? true : await gate979(t));

/** The retirement's OWN facts, read straight off the table and cast so nothing here depends on
 *  the pg driver's own date/timestamptz parsing (see this file's header). */
async function retiredTruth(id) {
  const r = await rootQuery(
    `select retired_reason, retired_by, authority_from::text as authority_from,
            extract(epoch from retired_at) as retired_epoch
       from clara.fa_depreciation_authorities where id = $1`,
    [id]);
  return r.rows[0];
}

test("p979.none a client with no depreciation authority at all still returns a null authority", async (t) => {
  if (await shut(t)) return;
  const client = await freshFaClient("p979none");
  const read = await getAuthority(w.users.alice, client);
  assert.equal(read.authority, null, "no authority has ever been proposed for this client");
});

test("p979.retired a client whose ONLY authority is retired: the read returns THAT authority, with its status, reason, retiring author, timestamp and window floor — never the bare null a never-proposed client returns", async (t) => {
  if (await shut(t)) return;
  const client = await freshFaClient("p979retired");
  const proposed = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  const id = proposed.authority_id ?? proposed.id;
  await signAuthority(w.users.hana, { client, authority: id });
  await retireAuthorityVerb(w.users.hana, { client, authority: id, reason: "p979 cadence review" });

  const read = await getAuthority(w.users.alice, client);
  assert.ok(read.authority, "AC2: a retired-only client gets the authority back, never null");
  assert.equal(read.authority.id, id);
  assert.equal(read.authority.status, "retired");
  assert.equal(read.authority.cadence, "monthly");

  const truth = await retiredTruth(id);
  assert.equal(read.authority.retired_reason, "p979 cadence review", "the retirement's own reason");
  assert.equal(read.authority.retired_reason, truth.retired_reason);
  assert.equal(read.authority.retired_by, truth.retired_by, "the EXISTING retiring-author field, now populated");
  assert.ok(read.authority.retired_by, "…and it is not null");
  assert.equal(
    Math.round(new Date(read.authority.retired_at).getTime() / 1000),
    Math.round(Number(truth.retired_epoch)),
    "the retirement's own timestamp, to the second",
  );
  assert.equal(read.authority.authority_from, truth.authority_from, "the authority's frozen window floor");
});

test("p979.recent a client with TWO retired authorities: the read returns the MOST RECENT one, never an older one", async (t) => {
  if (await shut(t)) return;
  const client = await freshFaClient("p979recent");

  const first = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  const firstId = first.authority_id ?? first.id;
  await signAuthority(w.users.hana, { client, authority: firstId });
  await retireAuthorityVerb(w.users.hana, { client, authority: firstId, reason: "p979 first retirement" });

  const second = await proposeAuthority(w.users.bob, { client, cadence: "annual" });
  const secondId = second.authority_id ?? second.id;
  await signAuthority(w.users.hana, { client, authority: secondId });
  await retireAuthorityVerb(w.users.hana, { client, authority: secondId, reason: "p979 second retirement" });

  const read = await getAuthority(w.users.alice, client);
  assert.equal(read.authority.id, secondId, "the MOST RECENT retirement, not the first");
  assert.equal(read.authority.cadence, "annual");
  assert.equal(read.authority.retired_reason, "p979 second retirement");
});

test("p979.preferred a live authority is still preferred over an older retired one, and its object carries NONE of the three retired-only fields", async (t) => {
  if (await shut(t)) return;
  const client = await freshFaClient("p979preferred");

  const old = await proposeAuthority(w.users.bob, { client, cadence: "monthly" });
  const oldId = old.authority_id ?? old.id;
  await signAuthority(w.users.hana, { client, authority: oldId });
  await retireAuthorityVerb(w.users.hana, { client, authority: oldId, reason: "p979 cadence change" });

  const fresh = await proposeAuthority(w.users.bob, { client, cadence: "annual" });
  const freshId = fresh.authority_id ?? fresh.id;
  await signAuthority(w.users.hana, { client, authority: freshId });

  const read = await getAuthority(w.users.alice, client);
  assert.equal(read.authority.id, freshId, "AC3: the LIVE authority, not the older retired one");
  assert.equal(read.authority.status, "live");
  assert.equal("retired_reason" in read.authority, false, "AC3/AC5: a live authority's object carries none of the retired-only fields");
  assert.equal("retired_at" in read.authority, false);
  assert.equal("authority_from" in read.authority, false);
});
