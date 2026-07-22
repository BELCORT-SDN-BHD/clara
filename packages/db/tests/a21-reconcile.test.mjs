// Wave-A2.1 rig — reconcile_autopost_rules expiry/nudge proof (pin doc "Rig
// battery map" tail; contract §7 — the DB-side half of the PR #52 wiring: this
// test lands HERE, not in the runtime lane, per the PR #52 spec review).
// CONTRACT-BLIND: pins only — never 0016 source.
//
//   EXPIRY: a live rule past expires_at HARD-EXPIRES (status leaves 'live') and
//     raises a notification.
//   NUDGE: a live rule ¾ through its term with NO recent post stays LIVE but
//     raises a nudge notification; a fresh (young) idle rule raises NOTHING
//     (the nudge is term-gated, not unconditional).
//
// TEST-LANE CAUTION (the rig truncate-deadlock lesson, pinned): the PR #52 leader
// wiring adds a once-per-boot writer on coding_rules/notifications in any shared
// world-e2e DB — so this file NEVER TRUNCATEs either table; every assertion is
// row-scoped to the rules it raw-inserts. Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk, withSessionAuth,
  a21EnsureReady, skip16, metaProbe0016,
  roleCanExecute, ruleRowById, notificationsMatching, hasColumn,
  upsertPayableAccount, upsertAccountClassed, seedCitedDocument, freshResolution,
  draftEntryV3, approveEntry, billLines, ev, FIELD, counterpartyRows,
  AP, EXP,
} from "./a21-helpers.mjs";

let has16 = false;
let world = null;

function skipHere(t) { return skip16(t, has16, "0016 not applied — reconcile battery dormant"); }

async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("v"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("va") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
}

/** Raw-insert a LIVE purchase autopost rule with a controlled age/expiry (the
 *  proven wave-a2 raw-rule recipe — proposal writers refuse backdated terms, and
 *  age is exactly what the reconciler keys on). */
async function rawLiveRule({ client, cp, createdAgo, expiresIn }) {
  const firm = await firmOf(client);
  const cols = ["firm_id", "client_id", "rule_type", "counterparty_id", "account_code", "status", "pinned", "origin", "content_hash", "created_by", "amount_cap_cents", "frequency_window", "window_max_posts", "expires_at", "direction", "created_at"];
  const vals = [firm, client, "autopost", cp, EXP, "live", false, "authored", null, world.users.alice, 100000, "monthly", 3, null, "purchase", null];
  const params = [];
  const frags = cols.map((c, i) => {
    if (c === "content_hash") return `encode(sha256(convert_to('${randomUUID()}','UTF8')),'hex')`;
    if (c === "expires_at") return `now() + interval '${expiresIn}'`;
    if (c === "created_at") return `now() - interval '${createdAgo}'`;
    params.push(vals[i]);
    return `$${params.length}`;
  });
  const extra = [];
  if (await hasColumn("coding_rules", "signed_by")) { extra.push(["signed_by", `$${params.length + 1}`]); params.push(world.users.alice); }
  if (await hasColumn("coding_rules", "signed_at")) { extra.push(["signed_at", `now() - interval '${createdAgo}'`]); }
  const allCols = [...cols, ...extra.map(([c]) => c)].join(",");
  const allFrags = [...frags, ...extra.map(([, f]) => f)].join(",");
  const r = await rootQuery(`insert into clara.coding_rules(${allCols}) values(${allFrags}) returning id`, params);
  return r.rows[0].id;
}

/** Call reconcile_autopost_rules under the runtime lane (falling back to the
 *  login-direct shell if the grant posture mirrors execute_rule_post). */
async function callReconcile() {
  try {
    const r = await roleQuery(ROLES.runtime, "select clara.reconcile_autopost_rules() as r", []);
    return r.rows[0].r;
  } catch (e) {
    if (e.code !== "42501" && e.code !== "42883") throw e;
    if (e.code === "42883") {
      // A p_op_key arity variant — try named.
      const r = await roleQuery(ROLES.runtime, "select clara.reconcile_autopost_rules(p_op_key => $1) as r", [opk("rec")]).catch((e2) => { throw e2; });
      return r.rows[0].r;
    }
    noteLane("reconcile_autopost_rules is not runtime-granted — retrying login-direct (grant posture finding)");
    return withSessionAuth("clara_runtime_login", async (c) => {
      const r = await c.query("select clara.reconcile_autopost_rules() as r");
      return r.rows[0].r;
    });
  }
}

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
    }
  } else noteLane("0016 absent — a21-reconcile suite dormant");
});
after(async () => { printLaneNotes("a21-reconcile"); printSkipCount("a21-reconcile"); await endPool(); });

test("META a21-reconcile: migration 0016 present + reconcile_autopost_rules exists", async (t) => {
  await metaProbe0016(t, has16, { label: "reconcile", fns: ["reconcile_autopost_rules"] });
});

test("§7 grants: the reconciler is a runtime-side fn — the agent role and the human lane hold ZERO EXECUTE", async (t) => {
  if (skipHere(t)) return;
  assert.equal(await roleCanExecute("clara_agent_ro", "reconcile_autopost_rules"), false, "the agent role cannot run the reconciler (P6)");
  assert.equal(await roleCanExecute("clara_authenticated", "reconcile_autopost_rules"), false, "the human lane cannot run the reconciler (it is the runtime loop's)");
  const runtimeHas = await roleCanExecute("clara_runtime", "reconcile_autopost_rules");
  const loginHas = await roleCanExecute("clara_runtime_login", "reconcile_autopost_rules");
  assert.ok(runtimeHas || loginHas, "the runtime lane (group or login-direct) holds EXECUTE on the reconciler");
});

test("§7 EXPIRY: a live rule past expires_at HARD-EXPIRES on the daily reconcile + notifies", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `RECEXP ${randomUUID().slice(0, 6)}`, reg: "201801070001" });
  assert.ok(cp, "the expiry-cell vendor exists (mandatory setup)");
  // ADV-6 (round 1): rule lifetime is structurally <=12 months — the honest
  // expired shape is a full-term rule whose 12 months have lapsed.
  const rule = await rawLiveRule({ client: clients.A1, cp, createdAgo: "12 months", expiresIn: "-1 day" });
  assert.equal((await ruleRowById(rule))?.status, "live", "the fixture rule is live-but-expired (mandatory setup)");
  await callReconcile();
  const row = await ruleRowById(rule);
  assert.notEqual(row?.status, "live", `a rule past expires_at HARD-EXPIRES — it can never fire again (status=${row?.status})`);
  const notes = await notificationsMatching(rule);
  assert.ok(notes.length >= 1, "the hard-expiry raises a notification referencing the rule (the firm is told, not surprised)");
});

test("§7 NUDGE: a ¾-term live rule with NO recent post stays LIVE but raises a nudge notification", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `RECNUDGE ${randomUUID().slice(0, 6)}`, reg: "201801070002" });
  assert.ok(cp, "the nudge-cell vendor exists (mandatory setup)");
  // 10 months into a 12-month term (>¾), zero rule_post_runs.
  const rule = await rawLiveRule({ client: clients.A2, cp, createdAgo: "10 months", expiresIn: "2 months" });
  await callReconcile();
  const row = await ruleRowById(rule);
  assert.equal(row?.status, "live", "the nudge NEVER expires a still-valid rule (visibility, not enforcement)");
  const notes = await notificationsMatching(rule);
  assert.ok(notes.length >= 1, "the ¾-term idle rule raises a nudge notification referencing the rule");
});

test("§7 CONTROL: a young idle rule (far from term) raises NOTHING — the nudge is term-gated, not unconditional noise", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `RECFRESH ${randomUUID().slice(0, 6)}`, reg: "201801070003" });
  assert.ok(cp, "the control-cell vendor exists (mandatory setup)");
  const rule = await rawLiveRule({ client: clients.A1, cp, createdAgo: "1 month", expiresIn: "11 months" });
  await callReconcile();
  const row = await ruleRowById(rule);
  assert.equal(row?.status, "live", "the young rule stays live");
  const notes = await notificationsMatching(rule);
  assert.equal(notes.length, 0, "a 1-month-old idle rule raises NO notification (no alarm fatigue)");
});
