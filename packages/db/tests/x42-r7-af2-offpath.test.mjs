// 0042 Wave D-b — the AF-2 CAUSAL-CLASSIFIER battery, ROUND 7, PART 2:
// THE QUESTIONS THE FIX DID NOT ASK ITSELF (WDB-R4).
//
// Part 1 (x42-r7-af2-classifier.test.mjs) walks the corridor the fix was built
// for. These cells deliberately leave it, on the three axes the round-7 lens
// names: OTHER CLOCKS (what if the two stamps are adversarial rather than merely
// unreliable), OTHER DOORS (what if a group's record mentions an entry it did
// NOT create), and OTHER GRAINS (what if the record is absent entirely, as it is
// for a hand-forged group — and what stops the record itself being rewritten).
//
// Each forge below is a superuser write that no audited verb can reach, and each
// says why it is here. The x37/x40 forge precedent.
//
// Serial discipline: the package runs `node --test --test-concurrency=1`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { opk, endPool, printLaneNotes, printSkipCount, noteLane, getPool } from "./a21-helpers.mjs";
// [SPLIT D-b3, PR construction] FIVE DEAD IMPORTS REMOVED AT SOURCE — `ROLES` above and
// `freshBankAccount`, `nextPeriod`, `enterStatement`, `firmOf` below. Each was named here and
// referenced nowhere in the file (measured: exactly one occurrence apiece, the import itself).
// The wave never ran `pnpm lint`, so they were invisible until this file reached a shipping
// tree; `eslint no-unused-vars` fails the repo Lint gate on all five. This is PR #182's R2
// ruling applied verbatim: a FORK's prologue stays byte-identical under a scoped override
// because the prologue is the fork idiom's cost, but a WAVE-AUTHORED whole file is fixed at
// source. No cell reads any of the five, and the file's 5/0 is re-proven after the edit.
import {
  af2SubstrateReady, skipAf2, caught, BANKCOA, REVN, AR1,
  af2World, freshAf2Client,
  bankLine, plainAt, stampedItem, birthCounterparty,
  settleFromBankLine, matchBankLine, unmatchBankMatch,
  matchRow, matchIdOf, rootQuery, uniq,
} from "./x42-af2-world.mjs";
import { glTotal } from "./x42-af2-rebook-kit.mjs";
import { blockDetail } from "./x42-af2-rebook3-kit.mjs";

let live = false;
let world = null;

before(async () => {
  live = await af2SubstrateReady();
  if (!live) {
    noteLane("0037/0038/0040 bank substrate absent — the x42 AF-2 ROUND-7 off-path battery is dormant");
    return;
  }
  world = await af2World();
});

after(async () => {
  printLaneNotes("x42-r7-af2-offpath");
  printSkipCount("x42-r7-af2-offpath");
  await endPool();
});

const blockOf = async (line) =>
  (await rootQuery("select clara._wdb_line_booking_block($1, null, null) as b", [line])).rows[0].b;
const bornOf = async (match, entry) =>
  (await rootQuery("select clara._wdb_born_in_booking_act($1,$2) as b", [match, entry])).rows[0].b;

/** Run several superuser statements in ONE transaction. The bank belts are
 *  DEFERRED constraint triggers, so a group forged statement-by-statement (each
 *  its own transaction under the pool's autocommit) would be judged half-built
 *  and fail on its own tie. */
async function inOneRootTxn(fn) {
  const c = await getPool().connect();
  try {
    await c.query("begin");
    const out = await fn((sql, params) => c.query(sql, params));
    await c.query("commit");
    return out;
  } catch (err) {
    await c.query("rollback").catch(() => {});
    throw err;
  } finally {
    await c.query("rollback").catch(() => {});
    c.release();
  }
}

// ===========================================================================
// x42.r7-af2-5 — OTHER GRAINS: A GROUP THAT RECORDED NOTHING.
//
// Every group a shipped verb writes carries a clara.bank_match_audit row from
// the same transaction. A group with NO record at all is reachable only by
// forging one — and that is exactly the shape a pre-0042 row, an imported row or
// a red-team fn-owner INSERT would take against the new law.
//
// THE RULED BEHAVIOUR IS "NOT BLOCKING", and it is a ruling rather than an
// accident: silence is not evidence. A verdict manufactured out of a missing
// record would fall on the 14g/15f protected case — the human who matched the
// wrong pre-existing entry — and its remedy would be "reverse a genuine
// outstanding item". What makes that safe for money is NOT this cell: it is
// S4.6C(late), which re-measures at BUILD time that the set of bodies able to
// put an entry into a bank match is closed and that every one of them records
// what it created. This cell holds the corridor open; that census holds the
// money.
// ===========================================================================
test("x42.r7-af2-5 a forged group with NO creation record manufactures no orphan, and its line stays bookable", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const firm = world.firms.A;
  const client = await freshAf2Client("r7c5");
  const bl = await bankLine(alice, { client, amountCents: 42_000, description: "r7 forged-group line" });
  const bankAccount = bl.bankAccount;
  const entry = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: bl.period.mid,
    memo: "r7: an entry the forged group held", checker: bob,
  });

  // THE FORGE: a RELEASED group, written exactly as clara.match_bank_line would
  // have written it and then released, minus the audit row no hand-write can
  // produce (clara.bank_match_audit is append-only, so the row cannot be deleted
  // after the fact either — the only way to reach "no record" is never to write
  // one). Status 'unmatched' from birth is the released shape; the members carry
  // the cascaded group_status the FK would have carried them to.
  const forged = await inOneRootTxn(async (q) => {
    // ck_bank_matches_unmatched demands the whole release triple, so the forge
    // supplies it: the shape under test is "no creation record", not "a malformed
    // group" — a group that could not exist would prove nothing about the law.
    const g = (await q(
      `insert into clara.bank_matches(firm_id, client_id, bank_account_id, status, origin,
           created_by, unmatched_by, unmatched_at, unmatched_reason)
       values ($1,$2,$3,'unmatched','human',$4,$4, now(), 'r7 forge: a released group that recorded nothing')
       returning id`,
      [firm, client, bankAccount, alice])).rows[0].id;
    await q(
      `insert into clara.bank_match_line_members(firm_id, client_id, match_id, line_id, amount_cents, group_status)
       values ($1,$2,$3,$4,$5,'unmatched')`, [firm, client, g, bl.line.id, 42_000]);
    await q(
      `insert into clara.bank_match_entry_members(firm_id, client_id, match_id, entry_id, matched_cents, group_status, posting_date_exception)
       values ($1,$2,$3,$4,$5,'unmatched',false)`, [firm, client, g, entry, 42_000]);
    return g;
  });

  assert.equal(Number((await rootQuery(
    "select count(*)::int as n from clara.bank_match_audit where match_id=$1", [forged])).rows[0].n), 0,
    "mandatory setup: the forged group recorded NOTHING");
  assert.equal((await rootQuery(
    "select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry])).rows[0].row.flags?.bank_match ?? null,
    null, "…and its entry carries no birth stamp either");
  assert.equal(await bornOf(forged, entry), false, "…so the act is not credited with creating it");

  assert.equal(await blockOf(bl.line.id), null,
    "silence is not evidence: an unrecorded group manufactures no standing booking");

  // ...AND THE LINE IS GENUINELY BOOKABLE, which is the half that matters to a
  // human: a false verdict here would wall the line in behind "reverse it".
  const own = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: bl.period.mid,
    memo: "r7: the booking the forged group must not block", checker: bob,
  });
  const g = await matchBankLine(alice, {
    client, lines: [bl.line.id], entries: [{ entry_id: own, matched_cents: 42_000 }], opKey: opk("r7c5-m"),
  });
  assert.equal((await matchRow(matchIdOf(g))).status, "live", "the line books normally");
});

// ===========================================================================
// x42.r7-af2-6 — OTHER CLOCKS, ADVERSARIALLY. The clock was not merely
// unreliable across transactions; it can be moved. An NTP step backwards, a
// restored dump, or a future refactor that writes the group in a later
// transaction than the entry all produce a group stamped AFTER the settlement it
// created. Under `je.created_at >= bm.created_at` that settlement reads as
// pre-existing and the second booking of the line is ADMITTED — a doubled bank
// movement. The verdict must not move when the stamps do, in EITHER direction.
// ===========================================================================
test("x42.r7-af2-6 the verdict is identical when the two created_at stamps are forged in either direction", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const client = await freshAf2Client("r7c6");
  const bl = await bankLine(alice, { client, amountCents: 42_000, description: "r7 clock-skew deposit" });
  const cp = await birthCounterparty(alice, { client, name: `R7 C6 ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(alice, {
    client, domain: "ar", cp, cpKind: "customer", cents: 42_000, control: AR1,
    postingDate: bl.period.mid, checker: bob,
  });
  const s = await settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: 42_000 }],
    memo: "r7: the settled deposit", postingDate: bl.period.mid, opKey: opk("r7c6-s"),
  });
  const g = matchIdOf(s);
  await unmatchBankMatch(bob, { client, match: g, reason: "r7: released", opKey: opk("r7c6-u") });

  // THE FORGE: the group is back-stepped an hour AFTER the entry it built, the
  // shape a backwards clock step produces. Nothing else about the group moves.
  await rootQuery("update clara.bank_matches set created_at = created_at + interval '1 hour' where id=$1", [g]);
  const st = (await rootQuery(
    `select (select e.created_at from clara.journal_entries e where e.id=$1) as entry_at,
            (select bm.created_at from clara.bank_matches bm where bm.id=$2) as match_at`,
    [s.entry_id, g])).rows[0];
  assert.ok(st.entry_at < st.match_at,
    "mandatory setup: the settlement now looks OLDER than the group that built it");

  const d = await blockOf(bl.line.id);
  assert.equal(d?.blocking, true,
    "the settlement is still the line's own booking — the record does not move when the clock does");
  assert.equal(d.bookings[0].entry_id, s.entry_id, "…named");
  assert.equal(d.bookings[0].caused_by, "born_in_the_booking_act", "…and labelled the same way");

  const other = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: bl.period.mid,
    memo: "r7: the second booking a skewed clock would have admitted", checker: bob,
  });
  const before = await glTotal(client, BANKCOA);
  const err = await caught(() => matchBankLine(alice, {
    client, lines: [bl.line.id], entries: [{ entry_id: other, matched_cents: 42_000 }],
    opKey: opk("r7c6-m"),
  }));
  assert.ok(err, "…so the double is still refused");
  blockDetail(err, "x42.r7-af2-6");
  assert.equal(await glTotal(client, BANKCOA), before, "THE MONEY: the refused match moved nothing");

  // ...AND THE MIRROR, on its own client so the line's bank account is the one
  // every hand-draft in this suite books to. A genuinely pre-existing entry stays
  // non-blocking however far BACK the group's stamp is pushed — the direction the
  // old law read as "the entry did not exist yet".
  const c2 = await freshAf2Client("r7c6m");
  const bl2 = await bankLine(alice, { client: c2, amountCents: 27_000, description: "r7 clock-skew mirror" });
  const pre = await plainAt(alice, {
    client: c2, debit: BANKCOA, credit: REVN, cents: 27_000, postingDate: bl2.period.mid,
    memo: "r7: a genuine pre-existing entry", checker: bob,
  });
  const g2 = matchIdOf(await matchBankLine(alice, {
    client: c2, lines: [bl2.line.id], entries: [{ entry_id: pre, matched_cents: 27_000 }], opKey: opk("r7c6-m2"),
  }));
  await unmatchBankMatch(bob, { client: c2, match: g2, reason: "r7: wrong line", opKey: opk("r7c6-u2") });
  await rootQuery("update clara.bank_matches set created_at = created_at - interval '1 day' where id=$1", [g2]);
  assert.equal(await blockOf(bl2.line.id), null,
    "a pre-existing entry stays pre-existing however far the group's stamp is pushed back");
});

// ===========================================================================
// x42.r7-af2-7 — OTHER DOORS: A RECORD THAT MENTIONS AN ENTRY IT DID NOT CREATE.
//
// clara.bank_match_audit's 'match' payload carries `entries` — the PRE-EXISTING
// entries the human matched. Reading the whole payload for the entry id would
// have turned every ordinary match into a causation verdict and re-opened the
// walled corridor from the other side, with a remedy telling a human to reverse
// the invoice they matched. Only the three CREATION keys are read, and this cell
// proves the distinction on a payload that demonstrably names the entry.
// ===========================================================================
test("x42.r7-af2-7 an audit payload that NAMES a pre-existing entry does not make the act its creator", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const client = await freshAf2Client("r7c7");
  const bl = await bankLine(alice, { client, amountCents: 42_000, description: "r7 payload-keys line" });
  const pre = await plainAt(alice, {
    client, debit: BANKCOA, credit: REVN, cents: 42_000, postingDate: bl.period.mid,
    memo: "r7: a genuine pre-existing entry", checker: bob,
  });
  const g = matchIdOf(await matchBankLine(alice, {
    client, lines: [bl.line.id], entries: [{ entry_id: pre, matched_cents: 42_000 }], opKey: opk("r7c7-m"),
  }));

  const payloads = (await rootQuery(
    "select action, payload from clara.bank_match_audit where match_id=$1 order by id", [g])).rows;
  assert.ok(payloads.length > 0, "mandatory setup: the match recorded itself");
  assert.ok(JSON.stringify(payloads).includes(pre),
    "mandatory setup: the record DOES name the entry — under `entries`, the pre-existing key");
  assert.equal(await bornOf(g, pre), false,
    "…and naming is not creating: only settlement_entry_id / charge_entry_id / adjustment_entry_ids count");

  await unmatchBankMatch(bob, { client, match: g, reason: "r7: corrected", opKey: opk("r7c7-u") });
  assert.equal(await blockOf(bl.line.id), null,
    "so the corrected match leaves the line free — the 14g corridor stays open");
});

// ===========================================================================
// x42.r7-af2-8 — THE EVIDENCE ITSELF. The whole reason a record beats a
// timestamp is that nothing can rewrite it. If clara.bank_match_audit were
// mutable, a doubled bank movement could be made invisible by editing one jsonb
// key — a worse defect than the one round 7 fixed, because it would be silent.
// Asserted against the strongest role in the database.
// ===========================================================================
test("x42.r7-af2-8 the booking act's record cannot be rewritten, erased or truncated — even by the superuser", async (t) => {
  if (skipAf2(t, live)) return;
  const alice = world.users.alice, bob = world.users.bob;
  const client = await freshAf2Client("r7c8");
  const bl = await bankLine(alice, { client, amountCents: 42_000, description: "r7 evidence line" });
  const cp = await birthCounterparty(alice, { client, name: `R7 C8 ${uniq()}`, kind: "customer" });
  const inv = await stampedItem(alice, {
    client, domain: "ar", cp, cpKind: "customer", cents: 42_000, control: AR1,
    postingDate: bl.period.mid, checker: bob,
  });
  const s = await settleFromBankLine(alice, {
    client, line: bl.line.id, counterparty: cp,
    allocations: [{ item_id: inv.item, amount_cents: 42_000 }],
    memo: "r7: the evidence settlement", postingDate: bl.period.mid, opKey: opk("r7c8-s"),
  });
  const g = matchIdOf(s);
  const row = (await rootQuery(
    "select id from clara.bank_match_audit where match_id=$1 and action='settle'", [g])).rows[0];
  assert.ok(row, "mandatory setup: the settle recorded the entry it built");

  const upd = await caught(() => rootQuery(
    "update clara.bank_match_audit set payload = payload - 'settlement_entry_id' where id=$1", [row.id]));
  assert.ok(upd, "the record cannot be edited to un-name what the act created");
  const del = await caught(() => rootQuery("delete from clara.bank_match_audit where id=$1", [row.id]));
  assert.ok(del, "…nor deleted");
  const trunc = await caught(() => rootQuery("truncate clara.bank_match_audit"));
  assert.ok(trunc, "…nor truncated away wholesale");

  // ...and the two guards that say so are still ENABLED, which is the property
  // S4.6C re-measures at build time.
  const trg = (await rootQuery(
    `select tgname, tgenabled::text as en from pg_trigger
      where tgrelid='clara.bank_match_audit'::regclass and not tgisinternal order by tgname`)).rows;
  assert.deepEqual(trg.map((x) => x.tgname).sort(),
    ["t_bank_match_audit_append_only", "t_bank_match_audit_no_truncate"],
    "both guards are present");
  assert.ok(trg.every((x) => x.en !== "D"), "…and neither is disabled");

  // The law still holds on this group after all three attempts.
  await unmatchBankMatch(bob, { client, match: g, reason: "r7: released", opKey: opk("r7c8-u") });
  const d = await blockOf(bl.line.id);
  assert.equal(d?.blocking, true, "the record survived, so the standing booking is still seen");
  assert.equal(d.bookings[0].entry_id, s.entry_id, "…and still names the settlement");
});
