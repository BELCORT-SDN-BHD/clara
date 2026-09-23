// #1002 — THE SECOND-PASS MEMBERSHIP EDITOR'S OWN READ.
// Migration: 0276_cash_account_set_membership_read.sql (stem `cash_account_set_membership_read$`).
//
// THE OWNER'S RULING (2026-09-20, the newest Agent Brief on the ticket) IS THE CONTRACT: build
// the second-pass editor now. `clara.get_client_cash_account_set_members` is the read half of
// that editor -- the CURRENT PUBLISHED version's membership, each member carrying its RECORDED
// `member_reason`, including a member with NO bank-registry candidacy at all (declared_cash /
// declared_petty_cash) and an INACTIVE member. `clara.propose_client_cash_accounts` (0232) is a
// deliberate complement, not a substitute: it flags `already_member` for bank-registry
// candidates only, so it alone cannot tell a second-pass editor what reason a declared member
// actually carries, or that a non-bank-registry member exists at all.
//
// THIS BATTERY DOES NOT RE-PROVE 0232'S OWN DOORS. `propose`/`publish`/`pack`'s own behaviour
// (versioning, refusals, envelope shape) is `client-financial-pack.test.mjs`'s battery; this
// file drives ONLY the new read, through `publish` as its arrangement (the ONE way a row enters
// either relation, 0232's own header) and never by hand-inserting a members row.
//
// WHAT THIS FILE DELIBERATELY DOES NOT TEST. The "insufficient role" / "no authenticated actor"
// / "no active membership" branches of this read's inline floor are copied verbatim from
// `propose_client_cash_accounts`'s own body, which `client-financial-pack.test.mjs` does not
// exercise either -- every real firm membership ranks at least `viewer` (the CHECK constraint on
// `firm_memberships.role` admits no lower rung), so those branches are unreachable through any
// door this estate ships and this battery does not invent new coverage a sibling battery treats
// as out of reach.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { insertUser, seedAdmission, createFirm, endPool, assertRaises, opk } from "./rig-fixtures.mjs";
import {
  CHART, financialClient, deactivate, publish, members, reasonOf, currentMembers, rootQuery,
} from "./client-financial-pack-fixtures.mjs";

const CLR10 = "CLR10";
const STEM = "cash_account_set_membership_read$";
const P1002 = "p1002";

let _ready = null;
async function laneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

let executed = 0;
const EXPECTED_CELLS = 6;

before(async () => {
  // A FOCUSED run against a rig that is supposed to carry 0276 fails LOUDLY rather than quietly
  // skipping every cell -- the same posture `firm-document-limits-writer.test.mjs`'s own `before`
  // hook takes for 0270.
  if (!(await laneReady()) && process.env.CLARA_ALLOW_MISSING_CASH_ACCOUNT_SET_MEMBERSHIP_READ !== "1") {
    throw new Error(
      "#1002: no migration matching /" + STEM + "/ is applied to this database, and "
      + "CLARA_ALLOW_MISSING_CASH_ACCOUNT_SET_MEMBERSHIP_READ is not set. Apply "
      + "0276_cash_account_set_membership_read.sql, or preload "
      + "tests/cash-account-set-membership-read-preintegration-gate.mjs if a lane-less database "
      + "is expected here.",
    );
  }
});
after(async () => {
  if (await laneReady()) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function gate(t) {
  if (_ready) return false;
  console.warn("SKIP cash-account-set-membership-read: 0276 is not applied (explicit pre-integration run).");
  t.skip("#1002 cash-account-set membership read absent -- explicit pre-integration run");
  return true;
}

/** A fresh firm, an owner (who both publishes and reads, since this battery's floor is viewer
 *  and the write it arranges through needs admin -- an owner clears both), and a client carrying
 *  the shared #660 chart: two bank-registry accounts (CHART.bank, CHART.bank2), one that is NOT
 *  (CHART.petty), and three more ordinary accounts. */
async function scene(tag) {
  const owner = await insertUser(P1002, tag);
  const token = await seedAdmission(`${P1002}-${tag}`);
  const name = `P1002 ${tag} ${randomUUID().slice(0, 8)}`;
  const firm = await createFirm(owner, { name, token, opKey: opk(`firm_${tag}`) });
  const { client, accounts } = await financialClient(owner, tag);
  return { owner, firm, client, accounts };
}

// ===========================================================================
// CELL 1 — no published set: an EMPTY envelope, never a fabricated version.
// ===========================================================================
test("#1002 cell 1 · a client with no published cash-account-set returns an empty envelope", async (t) => {
  if (gate(t)) return;
  const { owner, client } = await scene("no_set");

  const r = await currentMembers(owner, client);

  assert.equal(r.published_version_id, null, "published_version_id");
  assert.equal(r.revision, null, "revision");
  assert.equal(r.effective_from, null, "effective_from");
  assert.equal(r.member_count, null, "member_count");
  assert.deepEqual(r.members, [], "members");
  executed++;
});

// ===========================================================================
// CELL 2 — a published version's membership: every reason, an inactive member, and a member
// with NO bank-registry candidacy at all. This is the AC the ticket names first: "pre-checks
// every current member, including one with no bank-registry candidacy, each carrying its
// recorded reason."
// ===========================================================================
test("#1002 cell 2 · every recorded reason travels, including a non-bank-registry member and an inactive one", async (t) => {
  if (gate(t)) return;
  const { owner, client, accounts } = await scene("membership");

  // CHART.petty carries NO is_bank_account marker (financialClient only marks .bank/.bank2) --
  // exactly the "no bank-registry candidacy" case the ticket names. CHART.ar is deactivated
  // BEFORE publish, so the fixture proves the read (not the write) carries the flag.
  await deactivate(client, CHART.ar);

  const receipt = await publish(owner, client, members(accounts,
    [CHART.bank, "bank_registry"],
    [CHART.petty, "declared_petty_cash"],
    [CHART.ar, "declared_cash"],
  ), { opKey: opk("p1002-pub") });

  const r = await currentMembers(owner, client);

  assert.equal(r.published_version_id, receipt.cash_account_set_version_id, "published_version_id");
  assert.equal(r.revision, 1, "revision");
  assert.equal(r.effective_from, receipt.effective_from, "effective_from (the door's own stamp)");
  assert.equal(r.member_count, 3, "member_count");
  assert.equal(r.members.length, 3, "members.length");

  const byCode = Object.fromEntries(r.members.map((m) => [m.account_code, m]));
  assert.equal(byCode[CHART.bank].member_reason, "bank_registry");
  assert.equal(byCode[CHART.bank].is_active, true);
  assert.equal(byCode[CHART.bank].account_id, accounts[CHART.bank]);

  assert.equal(byCode[CHART.petty].member_reason, "declared_petty_cash",
    "a declared_petty_cash member on a non-bank account travels its OWN reason");
  assert.equal(byCode[CHART.petty].is_active, true);

  assert.equal(byCode[CHART.ar].member_reason, "declared_cash",
    "the read never rewrites a declared reason to bank_registry");
  assert.equal(byCode[CHART.ar].is_active, false,
    "an inactive member is still enumerated -- this relation family filters no account out");

  // Ordinal order is the publish order: bank(0), petty(1), ar(2).
  assert.deepEqual(r.members.map((m) => m.account_code), [CHART.bank, CHART.petty, CHART.ar]);
  executed++;
});

// ===========================================================================
// CELL 3 — after a SECOND publish (supersede), the read shows ONLY the current version's
// membership -- never the superseded one's. This is the data the diff view (added/removed/
// unchanged) is built from, so "current" must mean the LIVE version, not the first one.
// ===========================================================================
test("#1002 cell 3 · after a second publish, the read shows only the CURRENT version, never the superseded one", async (t) => {
  if (gate(t)) return;
  const { owner, client, accounts } = await scene("supersede");

  await publish(owner, client, members(accounts,
    [CHART.bank, "bank_registry"],
    [CHART.petty, "declared_petty_cash"],
  ), { opKey: opk("p1002-pub-v1") });

  // Strictly after v1's effective_from (today, MYT) -- far enough in the future that this cell
  // never races the book day rolling over.
  const v2 = await publish(owner, client, members(accounts,
    [CHART.bank, "bank_registry"],
    [CHART.retained, "declared_cash"],
  ), { effectiveFrom: "2099-01-01", opKey: opk("p1002-pub-v2") });

  const r = await currentMembers(owner, client);

  assert.equal(r.published_version_id, v2.cash_account_set_version_id);
  assert.equal(r.revision, 2);
  assert.equal(r.effective_from, "2099-01-01");
  assert.deepEqual(r.members.map((m) => m.account_code).sort(), [CHART.bank, CHART.retained].sort(),
    "petty (v1-only) must not appear; retained (v2-only) must");
  executed++;
});

// ===========================================================================
// CELL 4 — NO ORACLE. A cross-firm client id and an invented client id are indistinguishable:
// both read as "no published version". Mirrors p660.pack.no_oracle for this new read.
// ===========================================================================
test("#1002 cell 4 · a cross-firm client id and an invented one are indistinguishable, both empty", async (t) => {
  if (gate(t)) return;
  const { owner, client, accounts } = await scene("oracle_owner");
  await publish(owner, client, members(accounts, [CHART.bank, "bank_registry"]),
    { opKey: opk("p1002-pub") });

  const { owner: otherOwner } = await scene("oracle_other");

  const theirs = await currentMembers(otherOwner, client);
  const invented = await currentMembers(otherOwner, randomUUID());

  assert.deepEqual(theirs, invented, "a real, unrelated client and an invented id must read alike");
  assert.equal(theirs.published_version_id, null, "a cross-firm read must not see the version id");
  assert.deepEqual(theirs.members, []);
  executed++;
});

// ===========================================================================
// CELL 5 — p_client null is refused the door's own named CLR10, not a generic failure.
// ===========================================================================
test("#1002 cell 5 · a null client is refused invalid_client", async (t) => {
  if (gate(t)) return;
  const { owner } = await scene("null_client");
  const err = await assertRaises(CLR10, () => currentMembers(owner, null),
    "get_client_cash_account_set_members(null)");
  assert.equal(reasonOf(err), "invalid_client");
  executed++;
});

// ===========================================================================
// CELL 6 — NO AGENT TWIN. clara_runtime, clara_agent_ro and every clara_wake_* role hold NO
// EXECUTE; PUBLIC holds none; clara_authenticated does. Mirrors p660.pack.no_agent_reach for
// this one new door.
// ===========================================================================
test("#1002 cell 6 · no model lane reaches the new door; clara_authenticated alone does", async (t) => {
  if (gate(t)) return;
  const door = "clara.get_client_cash_account_set_members(uuid)";
  const roles = await rootQuery(
    "select rolname from pg_roles where rolname in ('clara_runtime','clara_agent_ro') "
    + "or rolname like 'clara\\_wake\\_%' order by 1");
  assert.ok(roles.rows.length >= 3, "the model-lane roles this cell is about are absent from the cluster");

  for (const { rolname } of roles.rows) {
    const r = await rootQuery(
      "select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [rolname, door]);
    assert.equal(r.rows[0].ok, false, `${rolname} holds EXECUTE on ${door}`);
  }
  const pub = await rootQuery(
    "select has_function_privilege('public', $1::regprocedure, 'execute') as ok", [door]);
  assert.equal(pub.rows[0].ok, false, "PUBLIC holds EXECUTE");
  const auth = await rootQuery(
    "select has_function_privilege('clara_authenticated', $1::regprocedure, 'execute') as ok", [door]);
  assert.equal(auth.rows[0].ok, true, "clara_authenticated cannot execute the door");
  executed++;
});
