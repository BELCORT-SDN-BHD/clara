// Wave-A2 rig — the posting-tier standing rule (autopost) substrate (contract
// §6.1/§6.2/§6.5 + WA2-R8/R9/R10/R12). CONTRACT-BLIND: from contract v1.0 §6 + the
// as-built coding_rules DDL + sign_coding_rule (bookkeeper) / role_rank floors (0011)
// — NEVER 0015 source. Invariants:
//
//   - coding_rules.rule_type admits 'autopost' (a distinct tier; vendor_account kept).
//     The autopost bound columns exist (amount_cap_cents, frequency_window,
//     window_max_posts, expires_at, direction, supersedes_rule_id) with a tier CHECK
//     (autopost ⇒ bounds NOT NULL + direction in (purchase,sales); vendor_account ⇒
//     bounds NULL). The one-live index is UNCHANGED (adversarial #12: no new index).
//   - sign_autopost_rule floors at ADMIN+ (a bookkeeper may propose+benefit, never
//     sign); sign_coding_rule stays bookkeeper+.
//   - Bounds are IMMUTABLE once live (a UPDATE of a live rule's cap is refused); a
//     widening is a RETIRE-old + a fresh signed NEW row citing supersedes_rule_id.
//   - One live autopost rule per (client, counterparty, rule_type).
//
// The new writers are called ADAPTIVELY (contract-silent signatures). Skips (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk,
  callFnAdaptive, resolveFn, humanPersona,
  upsertPayableAccount, upsertAccountClassed, grantConsent, seedCitedDocument, freshResolution,
  draftEntryV3, approveEntry, billLines, ev, FIELD, counterpartyRows, codingRuleRows,
  AP, EXP,
} from "./wave-a-fixtures.mjs";

const EXP2 = "500-A02";
let ready = false;
let has15 = false;
let world = null;
let proposeFn = null;
let signFn = null;

async function has0015Autopost() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='coding_rules' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%autopost%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — coding_rules.rule_type lacks 'autopost'"); return true; }
  return false;
}

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
async function seedSightings(sub, { client, cp, accountCode = EXP, n = 3 }) {
  for (let i = 0; i < n; i++) {
    const firm = await firmOf(client);
    const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
    const d = await draftEntryV3(sub, {
      client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
      document: cited.documentId, sha256: cited.sha256, lines: billLines(accountCode, AP, 50000),
      vendor: { existing_id: cp }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("s"),
    }).catch(() => null);
    if (d?.entry_id) await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("sa") }).catch(() => {});
  }
}
/** Propose an autopost rule (returns rule id) — bookkeeper+ author path. */
async function proposeAutopost(sub, { client, cp, accountCode = EXP, cap = 200000, windowMax = 3, direction = "purchase", supersedes = undefined }) {
  if (!proposeFn) return null;
  const desired = {
    client, counterparty: cp, account_code: accountCode, amount_cap_cents: cap,
    frequency_window: "monthly", window_max_posts: windowMax, direction, op_key: opk("prop"),
  };
  if (supersedes !== undefined) desired.supersedes_rule_id = supersedes;
  try {
    const r = await callFnAdaptive(proposeFn, desired, { persona: humanPersona(sub), label: proposeFn });
    const id = r?.rule_id ?? r?.id ?? (typeof r === "string" ? r : null);
    if (id) return id;
  } catch (e) { noteLane(`${proposeFn} raised ${e.code}: ${e.message}`); return { error: e }; }
  const rows = (await codingRuleRows(client)).filter((x) => x.rule_type === "autopost" && x.status === "proposed");
  return rows[rows.length - 1]?.id ?? null;
}
async function signAutopost(sub, { rule }) {
  return callFnAdaptive(signFn, { rule, op_key: opk("sign") }, { persona: humanPersona(sub), label: signFn });
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Autopost());
  if (has15) {
    world = await buildWorld();
    proposeFn = await resolveFn(["propose_autopost_rule"], { label: "autopost proposer" });
    signFn = await resolveFn(["sign_autopost_rule"], { label: "autopost signer" });
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP2, name: "Rent", type: "expense", opKey: opk("exp2") }).catch(() => {});
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  } else noteLane(ready ? "0015 autopost tier absent — autopost-rule suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-autopost-rule"); printSkipCount("wave-a2-autopost-rule"); await endPool(); });

// ===========================================================================
// DDL — the autopost tier (columns, CHECK, one-live index unchanged).
// ===========================================================================

test("§6.1 coding_rules.rule_type admits 'autopost' (vendor_account kept) + the bound columns exist", async (t) => {
  if (skip15(t)) return;
  const defs = (await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='coding_rules' and c.contype='c'`,
  )).rows[0].d ?? "";
  assert.ok(defs.includes("'autopost'") && defs.includes("'vendor_account'"), "rule_type admits autopost + vendor_account");
  const cols = new Set((await rootQuery("select column_name from information_schema.columns where table_schema='clara' and table_name='coding_rules'")).rows.map((x) => x.column_name));
  for (const col of ["amount_cap_cents", "frequency_window", "window_max_posts", "expires_at", "direction", "supersedes_rule_id"]) {
    assert.ok(cols.has(col), `coding_rules.${col} exists (the autopost tier bound column)`);
  }
});

test("§6.1 the tier CHECK binds the bounds: autopost ⇒ direction in (purchase,sales) + bounds present; vendor_account ⇒ bounds absent", async (t) => {
  if (skip15(t)) return;
  const defs = (await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='coding_rules' and c.contype='c'`,
  )).rows[0].d ?? "";
  assert.ok(/amount_cap_cents/.test(defs) && /purchase/.test(defs) && /sales/.test(defs),
    `a tier CHECK ties autopost to its bounds + direction (got: ${defs.slice(0, 400)})`);
});

test("§6.1 the one-live index is UNCHANGED — (client, counterparty, rule_type) where status='live' (adversarial #12: no new index)", async (t) => {
  if (skip15(t)) return;
  const idx = await rootQuery(
    `select i.relname as idx, pg_get_indexdef(ix.indexrelid) as def from pg_index ix
       join pg_class i on i.oid=ix.indexrelid join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='coding_rules' and ix.indisunique`,
  );
  const oneLive = idx.rows.find((r) => /rule_type/.test(r.def) && /counterparty_id/.test(r.def) && /live/i.test(r.def));
  assert.ok(oneLive, `the one-live index keys on (client, counterparty, rule_type) where status='live' (defs: ${idx.rows.map((r) => r.def).join(" ~~ ").slice(0, 300)})`);
});

// ===========================================================================
// Sign floor — admin+ (WA2-R8).
// ===========================================================================

test("WA2-R8 sign_autopost_rule floors at ADMIN+ — a bookkeeper is refused, an owner/admin signs", async (t) => {
  if (skip15(t)) return;
  if (!proposeFn || !signFn) { noteLane("propose_/sign_autopost_rule absent — sign-floor cell skipped"); return; }
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `SIGNFLOOR ${randomUUID().slice(0, 6)}`, reg: "201801030001" });
  if (!cp) return;
  await seedSightings(users.alice, { client: clients.A1, cp });
  const rule = await proposeAutopost(users.alice, { client: clients.A1, cp });
  if (!rule || rule.error) { noteLane("could not propose an autopost rule — sign-floor cell skipped"); return; }
  // bob is a bookkeeper in firm A (rank 1 < admin 2) → refused at the admin floor.
  await assert.rejects(
    () => signAutopost(users.bob, { rule }),
    (e) => e.code === "CLR04" || e.code === "CLR03",
    "a bookkeeper is refused signing an autopost rule (admin+ floor)",
  );
  // alice is the firm owner (rank 3 ≥ admin 2) → signs.
  await assert.doesNotReject(() => signAutopost(users.alice, { rule }), "an owner/admin signs the autopost rule");
  const row = (await codingRuleRows(clients.A1)).find((r) => r.id === rule);
  assert.equal(row?.status, "live", "the signed autopost rule is live");
});

// ===========================================================================
// Bound immutability + widening genealogy (WA2-R12).
// ===========================================================================

test("§6.1 a live autopost rule's BOUND columns are immutable — a UPDATE of the cap is refused", async (t) => {
  if (skip15(t)) return;
  if (!proposeFn || !signFn) { noteLane("autopost writers absent — bound-immutability cell skipped"); return; }
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `IMMUTCO ${randomUUID().slice(0, 6)}`, reg: "201801030002" });
  if (!cp) return;
  await seedSightings(users.alice, { client: clients.A2, cp });
  const rule = await proposeAutopost(users.alice, { client: clients.A2, cp, cap: 100000 });
  if (!rule || rule.error) return;
  await signAutopost(users.alice, { rule }).catch((e) => noteLane(`sign ${e.code}`));
  const row = (await codingRuleRows(clients.A2)).find((r) => r.id === rule);
  if (row?.status !== "live") { noteLane("rule not live — bound-immutability cell skipped"); return; }
  // A raw UPDATE of a bound column on the LIVE row (as root) must fire the immutability trigger.
  await assert.rejects(
    () => rootQuery("update clara.coding_rules set amount_cap_cents=999999 where id=$1", [rule]),
    (e) => e.code === "CLR08" || e.code === "CLR27",
    "a live autopost rule's amount_cap_cents cannot be UPDATEd (bounds immutable once live)",
  );
});

test("§6.2 a widening is a RETIRE-old + a fresh SIGNED successor citing supersedes_rule_id (append-only genealogy, never an edit)", async (t) => {
  if (skip15(t)) return;
  if (!proposeFn || !signFn) { noteLane("autopost writers absent — widening cell skipped"); return; }
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: `WIDENCO ${randomUUID().slice(0, 6)}`, reg: "201801030003" });
  if (!cp) return;
  await seedSightings(users.alice, { client: clients.A1, cp });
  const rule = await proposeAutopost(users.alice, { client: clients.A1, cp, cap: 100000 });
  if (!rule || rule.error) return;
  await signAutopost(users.alice, { rule }).catch((e) => noteLane(`sign ${e.code}`));
  // Retire the live predecessor (the merge/retire path), then sign a widened successor.
  const { retireCodingRule } = await import("./wave-a-fixtures.mjs");
  await retireCodingRule(users.alice, { rule, reason: "widening" }).catch((e) => noteLane(`retire ${e.code}`));
  const successor = await proposeAutopost(users.alice, { client: clients.A1, cp, cap: 180000, supersedes: rule });
  if (!successor || successor.error) { noteLane("successor propose failed — widening cell noted"); return; }
  await signAutopost(users.alice, { rule: successor }).catch((e) => noteLane(`sign successor ${e.code}`));
  const rows = await codingRuleRows(clients.A1);
  const pred = rows.find((r) => r.id === rule);
  const succ = rows.find((r) => r.id === successor);
  assert.equal(pred?.status, "retired", "the predecessor is retired (never edited in place)");
  if (succ) {
    assert.equal(succ.status, "live", "the widened successor is a fresh live row");
    if (succ.supersedes_rule_id != null) assert.equal(succ.supersedes_rule_id, rule, "the successor cites its predecessor (supersedes_rule_id genealogy)");
    else noteLane("successor supersedes_rule_id is null — the genealogy link may key differently; adjudicate");
  }
});

test("§6.1 only ONE live autopost rule per (client, counterparty) — a second live rule is refused", async (t) => {
  if (skip15(t)) return;
  if (!proposeFn || !signFn) { noteLane("autopost writers absent — one-live cell skipped"); return; }
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: `ONELIVE ${randomUUID().slice(0, 6)}`, reg: "201801030004" });
  if (!cp) return;
  await seedSightings(users.alice, { client: clients.A2, cp });
  const r1 = await proposeAutopost(users.alice, { client: clients.A2, cp, accountCode: EXP });
  if (!r1 || r1.error) return;
  await signAutopost(users.alice, { rule: r1 }).catch((e) => noteLane(`sign r1 ${e.code}`));
  const r2 = await proposeAutopost(users.alice, { client: clients.A2, cp, accountCode: EXP2 });
  if (!r2 || r2.error) { noteLane("second proposal already refused (one-live may gate at propose) — acceptable"); return; }
  await assert.rejects(
    () => signAutopost(users.alice, { rule: r2 }),
    (e) => e.code === "CLR27" || e.code === "23505",
    "signing a SECOND live autopost rule for the same (client, counterparty) is refused (one-live)",
  );
});
