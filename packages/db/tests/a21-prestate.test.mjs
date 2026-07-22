// Wave-A2.1 rig — the 15-MIGRATION PRESTATE fixture (ADV-R2 new-1: THE test
// that would have caught the B4b blocker). Stages 0001..0015 into its OWN
// throwaway database via CLARA_MIGRATIONS_DIR, seeds the exact live-books
// states the 0016 repair blocks must survive — an auto-proposed customer/AR
// vendor_account rule WITH its open question, a live customer/AR rule, a
// CREATORLESS out-of-bounds autopost proposal, a colliding + a clean
// non-canonical alias — then applies the full migration set and asserts 0016
// APPLIES (no terminal-CHECK abort) and every repair + audit + collision
// surface landed. Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { rootQuery, endPool, noteLane, printLaneNotes, printSkipCount } from "./a21-helpers.mjs";

const DB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIG_DIR = join(DB_DIR, "migrations");
const DBNAME = `a21_prestate_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;

let c = null; // direct client to the prestate DB (superuser, rig idiom)
const ids = {};

function migrate(env) {
  execFileSync(process.execPath, [join(DB_DIR, "scripts", "migrate.mjs")], {
    cwd: DB_DIR, stdio: "pipe",
    env: { ...process.env, PGDATABASE: DBNAME, ...env },
  });
}

before(async () => {
  await rootQuery(`create database ${DBNAME}`);
  // Stage 0001..0015 (everything below 0016) into a scratch dir.
  const staged = mkdtempSync(join(tmpdir(), "a21-prestate-"));
  for (const f of readdirSync(MIG_DIR)) {
    if (/^\d{4}_.*\.sql$/.test(f) && f < "0016") copyFileSync(join(MIG_DIR, f), join(staged, f));
  }
  migrate({ CLARA_MIGRATIONS_DIR: staged });
  rmSync(staged, { recursive: true, force: true });
  c = new pg.Client({ database: DBNAME });
  await c.connect();

  // ---- the prestate offenders (all schema-valid AT 15) -----------------
  ids.firm = randomUUID(); ids.user = randomUUID();
  ids.clientA = randomUUID(); ids.clientB = randomUUID();
  ids.cust = randomUUID(); ids.ruleProposed = randomUUID();
  ids.ruleLive = randomUUID(); ids.ruleBounds = randomUUID(); ids.q = randomUUID();
  await c.query("insert into clara.firms(id,name) values($1,'prestate firm')", [ids.firm]);
  await c.query("insert into clara.users(id,display_name,email) values($1,'prestate user',$2)", [ids.user, `prestate-${ids.user}@invalid.example`]);
  await c.query("insert into clara.clients(id,firm_id,name) values($1,$2,'prestate client A'),($3,$2,'prestate client B')", [ids.clientA, ids.firm, ids.clientB]);
  await c.query(
    `insert into clara.coa_accounts(client_id,account_code,name,account_type,account_class)
     values($1,'300-A00','Trade Debtors','asset','receivable')`, [ids.clientA]);
  await c.query(
    "insert into clara.coa_accounts(client_id,account_code,name,account_type) values($1,'600-000','Purchases','expense')", [ids.clientA]);
  await c.query(
    `insert into clara.counterparties(id,firm_id,client_id,kind,name,name_normalized,created_by)
     values($1,$2,$3,'customer','Prestate Customer','prestatecustomer',$4)`,
    [ids.cust, ids.firm, ids.clientA, ids.user]);
  // (1) the auto-proposed customer/AR rule — CREATORLESS (new-2) — with its
  // normal open question (new-1: the exact state that aborted B4b).
  await c.query(
    `insert into clara.coding_rules(id,firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by)
     values($1,$2,$3,'vendor_account',$4,'300-A00','proposed',false,'proposed',encode(sha256(convert_to('prestate-1','UTF8')),'hex'),null)`,
    [ids.ruleProposed, ids.firm, ids.clientA, ids.cust]);
  let qOpener = ids.user;
  try {
    await c.query(
      `insert into clara.open_questions(id,firm_id,client_id,scope_kind,scope_id,counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
       values($1,$2,$3,'vendor',$4,$4,'rule_proposal','Use account 300-A00 for this vendor?','open','human',null,$5)`,
      [ids.q, ids.firm, ids.clientA, ids.cust, ids.ruleProposed]);
    qOpener = null;
  } catch {
    await c.query(
      `insert into clara.open_questions(id,firm_id,client_id,scope_kind,scope_id,counterparty_id,origin,question_text,status,opener_kind,opened_by,spawned_rule_id)
       values($1,$2,$3,'vendor',$4,$4,'rule_proposal','Use account 300-A00 for this vendor?','open','human',$6,$5)`,
      [ids.q, ids.firm, ids.clientA, ids.cust, ids.ruleProposed, ids.user]);
  }
  noteLane(`prestate question opened_by: ${qOpener === null ? "NULL (coalesce path proven)" : "user (schema demands an opener)"}`);
  // (2) a LIVE customer/AR rule (the retire path).
  await c.query(
    `insert into clara.coding_rules(id,firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by,signed_by,signed_at)
     values($1,$2,$3,'vendor_account',$4,'300-A00','live',false,'proposed',encode(sha256(convert_to('prestate-2','UTF8')),'hex'),$5,$5,now())`,
    [ids.ruleLive, ids.firm, ids.clientA, ids.cust, ids.user]);
  // (3) a CREATORLESS out-of-bounds autopost proposal (B4c + new-2).
  await c.query(
    `insert into clara.coding_rules(id,firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by,
        amount_cap_cents,frequency_window,window_max_posts,expires_at,direction)
     values($1,$2,$3,'autopost',$4,'600-000','proposed',false,'authored',encode(sha256(convert_to('prestate-3','UTF8')),'hex'),null,
        100000,'monthly',9,now()+interval '24 months','purchase')`,
    [ids.ruleBounds, ids.firm, ids.clientA, ids.cust]);
  // (4) aliases: a COLLIDING pair (A's display form vs B's live canonical) and
  // a CLEAN non-canonical (repairable in place).
  await c.query(
    `insert into clara.client_aliases(firm_id,client_id,alias_normalized,added_by)
     values($1,$2,'acme sdn bhd',$4),($1,$3,'acmesdnbhd',$4),($1,$2,'beta holdings bhd.',$4)`,
    [ids.firm, ids.clientA, ids.clientB, ids.user]);
  // (4b) ADV-R4#2: the gameable multi-owner shape — client A holds BOTH a
  // non-canonical display form AND its canonical form, while client B holds a
  // DUPLICATE live canonical row (the registry index is non-unique). A LIMIT-1
  // sample could land on A and bless the "benign" branch, leaving B's pointer
  // silently authoritative. Nobody-wins must retire all three.
  await c.query(
    `insert into clara.client_aliases(firm_id,client_id,alias_normalized,added_by)
     values($1,$2,'r52 shared co',$4),($1,$2,'r52sharedco',$4),($1,$3,'r52sharedco',$4)`,
    [ids.firm, ids.clientA, ids.clientB, ids.user]);

  // ---- apply the full set: 0016 MUST apply over this prestate ----------
  migrate({});
});
after(async () => {
  try { if (c) await c.end(); } catch { /* already closed */ }
  try { await rootQuery(`drop database if exists ${DBNAME} with (force)`); }
  catch { await rootQuery(`drop database if exists ${DBNAME}`).catch(() => {}); }
  printLaneNotes("a21-prestate"); printSkipCount("a21-prestate"); await endPool();
});

test("PRESTATE: migration 0016 APPLIES over the offending live-books state (the round-2 blocker regression)", async () => {
  const r = await c.query("select count(*)::int as n from clara.schema_migrations where version ~ '^0016_'");
  assert.equal(r.rows[0].n, 1, "0016 applied over the prestate (no terminal-CHECK abort)");
});

test("PRESTATE B4b: the customer/AR rules are declined/retired with VALID actors; the spawned question is dismissed with resolved_by", async () => {
  const agent = (await c.query("select clara.agent_user_id() as a")).rows[0].a;
  const p = (await c.query("select status, declined_by, decline_reason from clara.coding_rules where id=$1", [ids.ruleProposed])).rows[0];
  assert.equal(p.status, "declined", "the creatorless proposed rule is DECLINED");
  assert.equal(p.declined_by, agent, "the deterministic repair actor is the structural agent identity (created_by was NULL)");
  assert.match(p.decline_reason ?? "", /0016 A21 repair/, "the decline reason names the repair");
  const l = (await c.query("select status, retire_reason from clara.coding_rules where id=$1", [ids.ruleLive])).rows[0];
  assert.equal(l.status, "retired", "the live customer/AR rule is RETIRED");
  assert.match(l.retire_reason ?? "", /0016 A21 repair/, "the retire reason names the repair");
  const q = (await c.query("select status, resolved_by, resolved_at, resolution_text from clara.open_questions where id=$1", [ids.q])).rows[0];
  assert.equal(q.status, "dismissed", "the spawned question is DISMISSED");
  assert.ok(q.resolved_by, "resolved_by is set (ck_open_questions_terminal holds — the blocker fix)");
  assert.ok(q.resolved_at, "resolved_at is set");
  assert.match(q.resolution_text ?? "", /0016 A21 repair/, "the resolution text names the repair");
});

test("PRESTATE B4c: the creatorless out-of-bounds proposal is declined by the repair actor; the bounds CHECK landed", async () => {
  const agent = (await c.query("select clara.agent_user_id() as a")).rows[0].a;
  const b = (await c.query("select status, declined_by from clara.coding_rules where id=$1", [ids.ruleBounds])).rows[0];
  assert.equal(b.status, "declined", "the out-of-bounds proposal is DECLINED");
  assert.equal(b.declined_by, agent, "the creatorless decline rides the repair actor");
  const con = (await c.query("select count(*)::int as n from pg_constraint where conname='ck_coding_rules_autopost_bounds'")).rows[0];
  assert.equal(con.n, 1, "the structural bounds CHECK exists after the repair");
});

test("PRESTATE B4d: the collision is retired + SURFACED (no silent first-wins); the clean alias is repaired in place", async () => {
  const collided = (await c.query(
    "select retired_at is not null as retired from clara.client_aliases where firm_id=$1 and client_id=$2 and alias_normalized='acme sdn bhd'",
    [ids.firm, ids.clientA])).rows[0];
  assert.equal(collided.retired, true, "the colliding non-canonical form is retired");
  const aLive = (await c.query(
    "select count(*)::int as n from clara.client_aliases where firm_id=$1 and client_id=$2 and alias_normalized='acmesdnbhd' and retired_at is null",
    [ids.firm, ids.clientA])).rows[0];
  assert.equal(aLive.n, 0, "NO replacement was minted for client A — the canonical form is contested");
  // ADV-R3#3 (RATIFIED): NOBODY keeps the name — the canonical OWNER's live row
  // is retired too; ambiguity is surfaced for human re-recording, never
  // first-wins-resolved in favor of whoever already held the canonical form.
  const bLive = (await c.query(
    "select count(*)::int as n from clara.client_aliases where firm_id=$1 and client_id=$2 and alias_normalized='acmesdnbhd' and retired_at is null",
    [ids.firm, ids.clientB])).rows[0];
  assert.equal(bLive.n, 0, "client B's canonical owner row is retired too (nobody keeps the contested name)");
  const note = (await c.query(
    "select to_jsonb(n) as row from clara.notifications n where n.firm_id=$1 and to_jsonb(n)::text like '%a21_alias_collision%' limit 1",
    [ids.firm])).rows[0];
  assert.ok(note, "the collision raised a review-visible notification");
  const noteText = JSON.stringify(note.row);
  assert.ok(noteText.includes(ids.clientA) && noteText.includes(ids.clientB),
    "the notification lists EVERY affected client (both sides of the collision)");
  const clean = (await c.query(
    "select count(*)::int as n from clara.client_aliases where firm_id=$1 and client_id=$2 and alias_normalized='betaholdingsbhd' and retired_at is null",
    [ids.firm, ids.clientA])).rows[0];
  assert.equal(clean.n, 1, "the clean non-canonical alias is repaired to the canonical form in place");
});

test("PRESTATE R5-2 (R4 must-2): every live canonical OWNER is aggregated — the multi-owner shape retires ALL rows, nobody wins", async () => {
  const live = (await c.query(
    "select count(*)::int as n from clara.client_aliases where firm_id=$1 and alias_normalized in ('r52 shared co','r52sharedco') and retired_at is null",
    [ids.firm])).rows[0];
  assert.equal(live.n, 0, "all three rows (A's display form, A's canonical, B's duplicate canonical) are retired — no LIMIT-1 benign blessing");
  const note = (await c.query(
    "select to_jsonb(n) as row from clara.notifications n where n.firm_id=$1 and to_jsonb(n)::text like '%r52sharedco%' limit 1",
    [ids.firm])).rows[0];
  assert.ok(note, "the multi-owner collision raised its review-visible notification");
  const noteText = JSON.stringify(note.row);
  assert.ok(noteText.includes(ids.clientA) && noteText.includes(ids.clientB),
    "the notification lists BOTH owner clients");
});

test("PRESTATE: every repair wrote its audit row", async () => {
  const audits = (await c.query(
    "select count(*) filter (where to_jsonb(a)::text like '%a21_repair_vendor_account_rule%')::int as vr, count(*) filter (where to_jsonb(a)::text like '%a21_repair_autopost_bounds%')::int as ab, count(*) filter (where to_jsonb(a)::text like '%a21_repair_client_alias%')::int as al from clara.audit_log a",
  )).rows[0];
  assert.ok(audits.vr >= 2, `both vendor_account repairs audited (got ${audits.vr})`);
  assert.ok(audits.ab >= 1, `the bounds repair audited (got ${audits.ab})`);
  assert.ok(audits.al >= 2, `both alias groups audited (got ${audits.al})`);
});
