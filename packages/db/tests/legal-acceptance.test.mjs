// #621 — VERSIONED LEGAL CONTENT, VERSIONED ACCEPTANCE, AND THE PLACEHOLDER THAT MUST NOT BE
// SIGNED (parent spec #612 Implementation Decisions §8; journeys A1/A2).
//
// The one claim this battery exists to prove: **ONLY PUBLISHED BYTES CAN BE ACCEPTED, AND TERMS
// AND THE DPA ARE TWO SEPARATE ACCEPTANCES**. Everything else here — the publish door's authority,
// the replay shapes, the checkout pins, the deprecated wrappers — hangs off that.
//
// CONTRACT-BLIND against 0185's own contract, frontier-gated on the `legal_acceptance$` stem.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND: every refusal cell re-reads clara.legal_acceptances and
// asserts the row count is unmoved, because an acceptance written by a call that then raised is
// exactly the failure this file is for.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, LEGAL_REASON, PG, ROLES,
  acceptBoth, acceptLegal, assertPair, assertRaises, claimPaidFirm, clearOperator, currentLegal,
  detailOf, endPool, ensureOperatorOwner, ensurePriceMap, gateLegal, getPool, humanQuery,
  insertRegistration, insertUser, openIntent, opk, ordinaryFirm, originDigest, payFor, publishLegal,
  rootIntent, rootQuery, roleQuery, sha256Bytes, sha256Hex, bodyText, intentRow, userEmail,
} from "./legal-acceptance-fixtures.mjs";

const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded) until backend `pid` is observably WAITING on a lock held by `blockerPid`, and
 *  return the wait_event that proves WHICH lock. The house idiom (p4t2-approval.test.mjs,
 *  work-cancel.test.mjs), copied locally rather than cross-imported from another area's helper —
 *  db-tests.md: "never a sleep, which proves nothing about whether the block actually happened". */
async function waitBlockedByOrThrow(pid, blockerPid, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      `select wait_event_type as wet, wait_event as we, pg_blocking_pids(pid) as blockers
         from pg_stat_activity where pid = $1`, [pid]);
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) {
      return row.we;
    }
    await sleep(25);
  }
  throw new Error(
    `waitBlockedByOrThrow: backend ${pid} never observably blocked on ${blockerPid} within ${timeoutMs}ms`);
}

/** Advisory-lock census for one backend, split by granted/ungranted — the interleave premise,
 *  pinned from pg_locks rather than inferred from a body. */
async function advisoryLocks(pid) {
  const r = await rootQuery(
    `select count(*) filter (where granted)::int as held,
            count(*) filter (where not granted)::int as waiting
       from pg_locks where pid = $1 and locktype = 'advisory'`, [pid]);
  return r.rows[0];
}
const PLACEHOLDER_BODY =
  "This is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch.";

let operator = null;
let applicant = null;

before(async () => {
  operator = await ensureOperatorOwner();
  applicant = await insertUser("w621", "applicant");
});
after(async () => {
  await clearOperator();
  await endPool();
});

function cell(name, fn) {
  test(name, async (t) => {
    if (await gateLegal(t)) return;
    await fn(t);
  });
}

const acceptanceCount = async () =>
  Number((await rootQuery("select count(*)::int as n from clara.legal_acceptances")).rows[0].n);

/** Publish one fresh document of `kind` and return {version, body, sha}. */
async function fresh(kind, tag) {
  const body = bodyText(`${tag}-${kind}`);
  const r = await publishLegal(operator.owner, { kind, body, opKey: opk(`w621-${tag}`) });
  return { ...r, body, sha: sha256Hex(body) };
}

/** A DRAFT document of `kind` — the state the publish door never produces, inserted as root
 *  exactly the way the 0158 placeholder was carried over. */
async function draft(kind, tag) {
  const body = bodyText(`${tag}-draft-${kind}`);
  const next = await rootQuery(
    "select coalesce(max(version),0)+1 as v from clara.legal_documents where kind=$1", [kind]);
  await rootQuery(
    `insert into clara.legal_documents(kind,version,status,title,body,body_sha256,source_path,effective_from)
     values ($1,$2,'draft',$3,$4,encode(sha256(convert_to($4,'UTF8')),'hex'),$5,now())`,
    [kind, next.rows[0].v, `#621 draft ${tag}`, body, `docs/ops/legal/${tag}.md`]);
  return { version: next.rows[0].v, body, sha: sha256Hex(body) };
}

// ------------------------------------------------------------------------------------------
// A · SHAPE. The two relations carry 0158's confinement and its two structural laws.
// ------------------------------------------------------------------------------------------
cell("la.1 the cohort is owner-confined with forced RLS and ZERO application-role grants", async () => {
  const rows = await rootQuery(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
            (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
            (select count(*)::int from information_schema.role_table_grants g
              where g.table_schema='clara' and g.table_name=c.relname and g.grantee<>'clara_fn_owner') as grants
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname in ('legal_documents','legal_acceptances')
      order by c.relname`);
  assert.equal(rows.rowCount, 2, "la.1 both relations exist");
  for (const row of rows.rows) {
    assert.deepEqual(
      { rls: row.relrowsecurity, force: row.relforcerowsecurity, owner: row.owner,
        policies: row.policies, grants: row.grants },
      { rls: true, force: true, owner: "clara_fn_owner", policies: 1, grants: 0 }, row.relname);
  }
  // Not even SELECT reaches the tables from an application role: every read is a definer door.
  await assertRaises(PG.insufficientPrivilege,
    () => roleQuery(ROLES.authenticated, "select 1 from clara.legal_documents limit 1"),
    "la.1 direct table read");
});

cell("la.2 a document's text is immutable and its status moves only draft->published->superseded", async () => {
  const d = await fresh("terms", "immutable");
  await assertPair(CLR.immutable, LEGAL_REASON.immutable,
    () => rootQuery("update clara.legal_documents set body=$3, body_sha256=encode(sha256(convert_to($3,'UTF8')),'hex') where kind=$1 and version=$2",
      ["terms", d.version, "rewritten"]),
    "la.2 a published body rewrite");
  await assertPair(CLR.badRequest, LEGAL_REASON.transition,
    () => rootQuery("update clara.legal_documents set status='draft' where kind=$1 and version=$2",
      ["terms", d.version]),
    "la.2 published->draft");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.legal_documents where kind=$1 and version=$2", ["terms", d.version]),
    "la.2 a document delete");
  // The DB derives the digest: a hand-written hash cannot land at all.
  await assertRaises(PG.checkViolation,
    () => rootQuery(
      `insert into clara.legal_documents(kind,version,status,title,body,body_sha256,source_path,effective_from)
       values ('terms',9999,'draft','x','real body','${"0".repeat(64)}','docs/x.md',now())`),
    "la.2 a mismatched body digest");
  // …and a draft's own words are frozen too: a person may already have been SHOWN them.
  const dr = await draft("terms", "frozen");
  await assertPair(CLR.immutable, LEGAL_REASON.immutable,
    () => rootQuery("update clara.legal_documents set title='edited' where kind='terms' and version=$1",
      [dr.version]),
    "la.2 a draft edit");
});

cell("la.3 at most ONE published document per kind, and acceptance evidence is append-only", async () => {
  const d = await fresh("dpa", "onecurrent");
  await assertRaises(PG.uniqueViolation,
    () => rootQuery(
      `insert into clara.legal_documents(kind,version,status,title,body,body_sha256,source_path,effective_from,published_at)
       values ('dpa',9998,'published','second','second current body',
               encode(sha256(convert_to('second current body','UTF8')),'hex'),'docs/x.md',now(),now())`),
    "la.3 a second published dpa");

  const who = await insertUser("w621", "appendonly");
  const accepted = await acceptLegal(who, { kind: "dpa", version: d.version, sha: d.sha });
  await assertRaises(CLR.immutable,
    () => rootQuery("update clara.legal_acceptances set accepted_at=now() where id=$1", [accepted.acceptance_id]),
    "la.3 an acceptance update");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.legal_acceptances where id=$1", [accepted.acceptance_id]),
    "la.3 an acceptance delete");
  await assertRaises(PG.uniqueViolation,
    () => rootQuery(
      `insert into clara.legal_acceptances(user_id,kind,version,body_sha256,op_key)
       values ($1,'dpa',$2,$3,$4)`, [who, d.version, d.sha, opk("dup")]),
    "la.3 a duplicate user/kind/version acceptance");
  // The composite FK binds the BYTES, not merely the version spelling.
  const other = await insertUser("w621", "bytes");
  await assertRaises(PG.foreignKeyViolation,
    () => rootQuery(
      `insert into clara.legal_acceptances(user_id,kind,version,body_sha256,op_key)
       values ($1,'dpa',$2,$3,$4)`,
      [other, d.version, sha256Hex("not the published body"), opk("fk")]),
    "la.3 an acceptance against other bytes");
});

// ------------------------------------------------------------------------------------------
// B · THE PUBLISH DOOR — the configurable-content half of #612 §8.
// ------------------------------------------------------------------------------------------
cell("la.4 the operator firm's OWNER publishes; the version increments per kind and supersedes", async () => {
  const first = await fresh("terms", "pub1");
  const second = await fresh("terms", "pub2");
  assert.equal(second.version, first.version + 1, "la.4 the version increments by one");
  assert.equal(second.superseded_version, first.version, "la.4 the answer names what it superseded");
  assert.equal(second.status, "published");
  const states = await rootQuery(
    "select version,status from clara.legal_documents where kind='terms' and version=any($1::int[]) order by version",
    [[first.version, second.version]]);
  assert.deepEqual(states.rows.map((r) => r.status), ["superseded", "published"],
    "la.4 the predecessor is superseded, not rewritten");
  // A DPA publish does not disturb Terms: the kinds are independent ladders.
  const dpa = await fresh("dpa", "pub3");
  const stillCurrent = await rootQuery(
    "select version from clara.legal_documents where kind='terms' and status='published'");
  assert.equal(stillCurrent.rows[0].version, second.version, "la.4 publishing a DPA left Terms alone");
  assert.ok(dpa.version >= 1);
});

cell("la.5 the publish door admits ONLY an owner of the operator firm", async () => {
  const outsider = await insertUser("w621", "outsider");
  await ordinaryFirm(outsider, "owner");
  await assertPair(CLR.authz, LEGAL_REASON.notOperatorFirm,
    () => publishLegal(outsider, { kind: "terms", body: bodyText("outsider") }),
    "la.5 an owner of an ORDINARY firm");

  const bookkeeper = await insertUser("w621", "bookkeeper");
  await rootQuery("insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operator.firm, bookkeeper]);
  const err = await assertRaises(CLR.authz,
    () => publishLegal(bookkeeper, { kind: "terms", body: bodyText("bookkeeper") }),
    "la.5 a bookkeeper of the operator firm");
  assert.match(err.message, /insufficient role/, "la.5 the rank wall answered");

  await assertRaises(CLR.authz,
    () => roleQuery(ROLES.authenticated,
      "select clara.publish_legal_document('terms','t','b','docs/x.md',null,'k')"),
    "la.5 no actor at all");
});

cell("la.6 the publish door's own refusals: identical_body, empty_body, invalid_kind, op_key", async () => {
  const d = await fresh("dpa", "refusals");
  await assertPair(CLR.lastOwner, LEGAL_REASON.identicalBody,
    () => publishLegal(operator.owner, { kind: "dpa", body: d.body }),
    "la.6 republishing the identical text");
  await assertPair(CLR.badRequest, LEGAL_REASON.emptyBody,
    () => publishLegal(operator.owner, { kind: "dpa", body: "   " }),
    "la.6 a blank body");
  await assertPair(CLR.badRequest, LEGAL_REASON.invalidKind,
    () => publishLegal(operator.owner, { kind: "privacy", body: bodyText("kind") }),
    "la.6 an unknown kind");
  await assertPair(CLR.badRequest, LEGAL_REASON.invalidOpKey,
    () => publishLegal(operator.owner, { kind: "dpa", body: bodyText("opkey"), opKey: "  " }),
    "la.6 a blank op key");

  // op_key REPLAY: the same key and the same text replay the ORIGINAL receipt, and no second
  // version is allocated.
  const body = bodyText("replay");
  const key = opk("w621-pub-replay");
  const once = await publishLegal(operator.owner, { kind: "dpa", body, opKey: key });
  const twice = await publishLegal(operator.owner, { kind: "dpa", body, opKey: key });
  assert.deepEqual(twice, once, "la.6 a replayed publish returns the original receipt byte-identically");
  const versions = await rootQuery(
    "select count(*)::int as n from clara.legal_documents where kind='dpa' and body_sha256=$1",
    [sha256Hex(body)]);
  assert.equal(versions.rows[0].n, 1, "la.6 the replay allocated no second version");
  await assertPair(CLR.badRequest, LEGAL_REASON.opKeyConflict,
    () => publishLegal(operator.owner, { kind: "dpa", body: bodyText("other"), opKey: key }),
    "la.6 the same op key for a different text");
});

// ------------------------------------------------------------------------------------------
// C · THE ACCEPTANCE DOOR. The claim this file exists for is la.7.
// ------------------------------------------------------------------------------------------
cell("la.7 a DRAFT cannot be accepted -- placeholder text is presentable, never signable", async () => {
  // The estate's own placeholder, carried over by 0185's backfill, is the real instance of this.
  const placeholder = await rootQuery(
    "select kind,version,status,legacy_version,body from clara.legal_documents where body_sha256=$1",
    [sha256Hex(PLACEHOLDER_BODY)]);
  assert.equal(placeholder.rowCount, 1, "la.7 the 0158 placeholder carried over exactly once");
  assert.equal(placeholder.rows[0].status, "draft", "la.7 the placeholder is a DRAFT");
  assert.equal(placeholder.rows[0].legacy_version, "clara-beta-2026-08-a",
    "la.7 its 0158 spelling is preserved");

  // A kind with NOTHING published: the answer is not_published, whatever version is named.
  const kind = "terms";
  await rootQuery("update clara.legal_documents set status='superseded' where kind=$1 and status='published'",
    [kind]);
  const dr = await draft(kind, "unsignable");
  const before = await acceptanceCount();
  await assertPair(CLR.lastOwner, LEGAL_REASON.notPublished,
    () => acceptLegal(applicant, { kind, version: dr.version, sha: dr.sha }),
    "la.7 accepting a draft with nothing published");
  assert.equal(await acceptanceCount(), before, "la.7 the refusal left no acceptance behind");

  // …and with something else published, naming the draft is a STALE version, never a success.
  const published = await fresh(kind, "unsignable2");
  await assertPair(CLR.lastOwner, LEGAL_REASON.staleVersion,
    () => acceptLegal(applicant, { kind, version: dr.version, sha: dr.sha }),
    "la.7 accepting a draft beside a published document");
  assert.equal(await acceptanceCount(), before, "la.7 the second refusal left no acceptance behind");
  assert.ok(published.version > dr.version - 1);
});

cell("la.8 publish -> accept -> replay: the original accepted_at is never moved by a retry", async () => {
  const who = await insertUser("w621", "replay");
  const d = await fresh("dpa", "accept");
  const key = opk("w621-acc");
  const first = await acceptLegal(who, { kind: "dpa", version: d.version, sha: d.sha, opKey: key });
  assert.equal(first.status, "accepted");
  assert.equal(first.kind, "dpa");
  assert.equal(first.version, d.version);
  assert.equal(first.body_sha256, d.sha);

  const sameKey = await acceptLegal(who, { kind: "dpa", version: d.version, sha: d.sha, opKey: key });
  assert.equal(sameKey.status, "already_accepted", "la.8 a lost response replays by op_key");
  assert.deepEqual(sameKey.accepted_at, first.accepted_at, "la.8 the op_key replay keeps the instant");
  assert.equal(sameKey.acceptance_id, first.acceptance_id);

  const otherKey = await acceptLegal(who, { kind: "dpa", version: d.version, sha: d.sha });
  assert.equal(otherKey.status, "already_accepted", "la.8 a second tab replays on the natural key");
  assert.deepEqual(otherKey.accepted_at, first.accepted_at, "la.8 the natural replay keeps the instant");

  const rows = await rootQuery(
    "select count(*)::int as n from clara.legal_acceptances where user_id=$1 and kind='dpa'", [who]);
  assert.equal(rows.rows[0].n, 1, "la.8 three calls, ONE acceptance");
});

cell("la.9 stale_version, hash_mismatch, op_key_conflict, invalid_kind and the actor walls", async () => {
  const who = await insertUser("w621", "walls");
  const old = await fresh("dpa", "old");
  const now = await fresh("dpa", "now");
  const before = await acceptanceCount();

  await assertPair(CLR.lastOwner, LEGAL_REASON.staleVersion,
    () => acceptLegal(who, { kind: "dpa", version: old.version, sha: old.sha }),
    "la.9 the superseded version");
  await assertPair(CLR.badRequest, LEGAL_REASON.hashMismatch,
    () => acceptLegal(who, { kind: "dpa", version: now.version, sha: sha256Hex("other bytes") }),
    "la.9 a digest of other bytes");
  await assertPair(CLR.badRequest, LEGAL_REASON.invalidKind,
    () => acceptLegal(who, { kind: "privacy", version: 1, sha: now.sha }),
    "la.9 an unknown kind");
  await assertPair(CLR.badRequest, LEGAL_REASON.invalidOpKey,
    () => acceptLegal(who, { kind: "dpa", version: now.version, sha: now.sha, opKey: " " }),
    "la.9 a blank op key");
  assert.equal(await acceptanceCount(), before, "la.9 four refusals left nothing behind");

  const key = opk("w621-conflict");
  const terms = await fresh("terms", "conflict");
  await acceptLegal(who, { kind: "dpa", version: now.version, sha: now.sha, opKey: key });
  await assertPair(CLR.badRequest, LEGAL_REASON.opKeyConflict,
    () => acceptLegal(who, { kind: "terms", version: terms.version, sha: terms.sha, opKey: key }),
    "la.9 one op key, two documents");

  // A legal acceptance is a HUMAN act.
  await assertPair(CLR.authz, LEGAL_REASON.agentActor,
    () => acceptLegal(AGENT_USER_ID, { kind: "dpa", version: now.version, sha: now.sha }),
    "la.9 the agent identity");
  await assertPair(CLR.authz, LEGAL_REASON.unknownActor,
    () => acceptLegal(randomUUID(), { kind: "dpa", version: now.version, sha: now.sha }),
    "la.9 an unknown actor");
  await assertPair(CLR.authz, LEGAL_REASON.noActor,
    () => roleQuery(ROLES.authenticated,
      `select clara.accept_legal_document('dpa',${now.version},'${now.sha}','k')`),
    "la.9 no actor at all");
});

cell("la.10 Terms and the DPA are DISTINCT: accepting one accepts nothing of the other", async () => {
  const who = await insertUser("w621", "distinct");
  const terms = await fresh("terms", "distinct");
  const dpa = await fresh("dpa", "distinct");
  await acceptLegal(who, { kind: "terms", version: terms.version, sha: terms.sha });
  const seen = await currentLegal(who);
  assert.ok(seen.get("terms").accepted_at instanceof Date, "la.10 Terms is accepted");
  assert.equal(seen.get("dpa").accepted_at, null, "la.10 the DPA is NOT accepted by it");
  assert.equal(seen.get("dpa").accepted_version, null, "la.10 and no DPA version is recorded");
  // The bytes of one kind cannot stand in for the other's, even at the same version number.
  await assertPair(CLR.badRequest, LEGAL_REASON.hashMismatch,
    () => acceptLegal(who, { kind: "dpa", version: dpa.version, sha: terms.sha }),
    "la.10 the Terms digest against the DPA");
});

// ------------------------------------------------------------------------------------------
// D · THE READ. "Not final" must be renderable without being acceptable.
// ------------------------------------------------------------------------------------------
cell("la.11 the read shows a draft AS a draft, and the caller's own acceptance beside it", async () => {
  const who = await insertUser("w621", "read");
  await rootQuery("update clara.legal_documents set status='superseded' where kind='terms' and status='published'");
  const dr = await draft("terms", "read");
  const dpa = await fresh("dpa", "read");

  let seen = await currentLegal(who);
  assert.equal(seen.get("terms").status, "draft", "la.11 a kind with nothing published falls back to its newest draft");
  assert.equal(seen.get("terms").version, dr.version);
  assert.equal(seen.get("terms").body, dr.body, "la.11 the text is renderable");
  assert.equal(seen.get("terms").published_at, null, "la.11 a draft has no publication instant");
  assert.equal(seen.get("terms").accepted_at, null);
  assert.equal(seen.get("dpa").status, "published");

  await acceptLegal(who, { kind: "dpa", version: dpa.version, sha: dpa.sha });
  const newer = await fresh("dpa", "read2");
  seen = await currentLegal(who);
  assert.equal(seen.get("dpa").version, newer.version, "la.11 the read follows the published version");
  assert.equal(seen.get("dpa").accepted_at, null, "la.11 the NEW version is unaccepted");
  assert.equal(seen.get("dpa").accepted_version, dpa.version,
    "la.11 …while the caller's latest accepted version is still reported");

  // Another person's acceptance is never visible here.
  const stranger = await insertUser("w621", "stranger");
  const theirs = await currentLegal(stranger);
  assert.equal(theirs.get("dpa").accepted_version, null, "la.11 the read is caller-scoped");
  await assertPair(CLR.authz, LEGAL_REASON.noActor,
    () => roleQuery(ROLES.authenticated, "select * from clara.get_current_legal_documents()"),
    "la.11 no actor at all");
});

// ------------------------------------------------------------------------------------------
// E · THE MONEY SURFACE. Both kinds gate the checkout; both pins gate the claim.
// ------------------------------------------------------------------------------------------
cell("la.12 open_checkout_intent refuses legal_not_accepted NAMING the missing kinds, then pins both", async () => {
  const who = await insertUser("w621", "checkout");
  const email = await userEmail(who);
  const registration = await insertRegistration(who, "checkout");
  const terms = await fresh("terms", "checkout");
  const dpa = await fresh("dpa", "checkout");

  const both = await assertPair(CLR.lastOwner, LEGAL_REASON.legalNotAccepted,
    () => openIntent(who, email, registration.id), "la.12 neither kind accepted");
  assert.deepEqual(both.detail.missing.slice().sort(), ["dpa", "terms"],
    "la.12 a fresh applicant is missing BOTH kinds by name");

  await acceptLegal(who, { kind: "terms", version: terms.version, sha: terms.sha });
  const one = await assertPair(CLR.lastOwner, LEGAL_REASON.legalNotAccepted,
    () => openIntent(who, email, registration.id), "la.12 only Terms accepted");
  assert.deepEqual(one.detail.missing, ["dpa"], "la.12 …and the refusal names only what is missing");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.checkout_intents where registration_id=$1",
    [registration.id])).rows[0].n, 0, "la.12 a refused open created no intent");

  await acceptLegal(who, { kind: "dpa", version: dpa.version, sha: dpa.sha });
  const intent = await openIntent(who, email, registration.id);
  const row = await intentRow(intent.intent_id);
  assert.equal(row.dpa_version, dpa.version, "la.12 the intent pins the DPA version it opened under");
  assert.equal(row.terms_version, terms.version, "la.12 …and the Terms version beside it");
  assert.deepEqual([row.dpa_kind, row.terms_kind], ["dpa", "terms"],
    "la.12 the generated kind columns make both pins real foreign keys");

  // A NEW published version does not retro-move the pin, and does not un-open the flow.
  const newer = await fresh("dpa", "checkout2");
  const after = await intentRow(intent.intent_id);
  assert.equal(after.dpa_version, dpa.version, "la.12 the mid-flow intent keeps its pin");
  assert.ok(newer.version > dpa.version);
});

cell("la.13 claim_paid_firm re-checks the PINNED versions, and a pre-0185 NULL terms pin passes", async () => {
  // (a) terms pinned, terms not accepted -> refused by name.
  const a = await insertUser("w621", "claimA");
  const emailA = await userEmail(a);
  const regA = await insertRegistration(a, "claimA");
  const docs = await acceptBoth(operator.owner, a, { tag: "claimA" });
  // A REAL later Terms version the applicant never accepted -- the FK would refuse a made-up
  // number, which is itself the pin's proof that it names an actual document.
  const newerTerms = await fresh("terms", "claimA2");
  const intentA = await rootIntent({
    registration: regA.id, applicant: a,
    dpaVersion: docs.dpa.version, termsVersion: newerTerms.version,
  });
  await payFor({ registration: regA.id, applicant: a, intent: intentA });
  const missing = await assertPair(CLR.lastOwner, LEGAL_REASON.legalNotAccepted,
    () => claimPaidFirm(a, emailA, regA.id), "la.13 an unaccepted pinned Terms version");
  assert.deepEqual(missing.detail.missing, ["terms"], "la.13 the refusal names the pinned kind");
  assert.equal((await rootQuery(
    "select firm_id from clara.firm_registration_requests where id=$1", [regA.id])).rows[0].firm_id,
    null, "la.13 the refused claim created no firm");

  // (b) a LEGACY intent — opened before 0185, so terms_version is NULL — still claims.
  const b = await insertUser("w621", "claimB");
  const emailB = await userEmail(b);
  const regB = await insertRegistration(b, "claimB");
  const dpa = await rootQuery(
    "select version,body_sha256 from clara.legal_documents where kind='dpa' and status='published'");
  await acceptLegal(b, { kind: "dpa", version: dpa.rows[0].version, sha: dpa.rows[0].body_sha256 });
  const intentB = await rootIntent({
    registration: regB.id, applicant: b, dpaVersion: dpa.rows[0].version, termsVersion: null,
  });
  await payFor({ registration: regB.id, applicant: b, intent: intentB });
  const claimed = await claimPaidFirm(b, emailB, regB.id);
  assert.ok(claimed.firm_id, "la.13 a pre-0185 applicant is not stranded by the new Terms gate");
  const consumed = await rootQuery(
    `select p.consumed_dpa_signature as acceptance, a.kind, a.version
       from clara.firm_registration_payments p
       join clara.legal_acceptances a on a.id=p.consumed_dpa_signature
      where p.registration_id=$1`, [regB.id]);
  assert.equal(consumed.rows[0].kind, "dpa",
    "la.13 the consumed evidence is the DPA acceptance, in its new home");
  assert.equal(consumed.rows[0].version, dpa.rows[0].version);

  // (c) the DPA pin is checked too: an intent pinned to a version the applicant never accepted.
  const c = await insertUser("w621", "claimC");
  const emailC = await userEmail(c);
  const regC = await insertRegistration(c, "claimC");
  const intentC = await rootIntent({
    registration: regC.id, applicant: c, dpaVersion: dpa.rows[0].version, termsVersion: null,
  });
  await payFor({ registration: regC.id, applicant: c, intent: intentC });
  const missingDpa = await assertPair(CLR.lastOwner, LEGAL_REASON.legalNotAccepted,
    () => claimPaidFirm(c, emailC, regC.id), "la.13 an unaccepted pinned DPA version");
  assert.deepEqual(missingDpa.detail.missing, ["dpa"]);
});

// ------------------------------------------------------------------------------------------
// F · THE BACKFILL AND THE DEPRECATED WRAPPERS.
// ------------------------------------------------------------------------------------------
cell("la.14 every pre-0185 DPA signature reads as a dpa acceptance, keeping its own id", async () => {
  const appliedAt = (await rootQuery(
    "select applied_at from clara.schema_migrations where version ~ $1", ["legal_acceptance$"])).rows[0].applied_at;
  // SCOPED TO THE ROWS THE BACKFILL OWNED. clara.dpa_signatures is still writable by a superuser
  // and checkout-gate-c1 legitimately inserts into it AFTER 0185 to prove that table's own laws;
  // those rows are not the backfill's and must not be asserted against it.
  const orphans = await rootQuery(
    `select count(*)::int as n from clara.dpa_signatures s
      where s.signed_at <= $1
        and not exists (select 1 from clara.legal_acceptances a
                         where a.id=s.id and a.kind='dpa' and a.user_id=s.user_id
                           and a.body_sha256=encode(s.body_sha256,'hex')
                           and a.accepted_at=s.signed_at)`, [appliedAt]);
  assert.equal(orphans.rows[0].n, 0,
    "la.14 every signature the backfill owned has its twin acceptance, id and instant included");
  const documents = await rootQuery(
    `select count(*)::int as n from clara.dpa_documents d
      where not exists (select 1 from clara.legal_documents l
                         where l.kind='dpa' and l.legacy_version=d.version
                           and l.body_sha256=encode(d.body_sha256,'hex'))`);
  assert.equal(documents.rows[0].n, 0, "la.14 every 0158 document carried over BY ITS BYTES");
});

cell("la.15 the deprecated DPA wrappers still work, and refuse the placeholder they used to sign", async () => {
  const who = await insertUser("w621", "wrapper");
  const d = await fresh("dpa", "wrapper");

  const current = await humanQuery(who, "select * from clara.get_current_dpa_document()");
  assert.equal(current.rowCount, 1, "la.15 the deprecated read returns the published DPA");
  assert.equal(current.rows[0].version, String(d.version));
  assert.equal(current.rows[0].body, d.body);
  assert.equal(current.rows[0].body_sha256.toString("hex"), d.sha);

  const signed = await humanQuery(who,
    "select clara.sign_dpa(p_version=>$1,p_body_sha256=>$2,p_op_key=>$3) as r",
    [String(d.version), sha256Bytes(d.body), opk("w621-sign")]);
  assert.ok(signed.rows[0].r.signature_id, "la.15 sign_dpa keeps 0163's wire shape");
  assert.ok(signed.rows[0].r.signed_at);
  const replayed = await humanQuery(who,
    "select clara.sign_dpa(p_version=>$1,p_body_sha256=>$2,p_op_key=>$3) as r",
    [String(d.version), sha256Bytes(d.body), opk("w621-sign2")]);
  assert.equal(replayed.rows[0].r.replay, true, "la.15 …including its replay marker");
  assert.equal(replayed.rows[0].r.signature_id, signed.rows[0].r.signature_id);

  const mine = await humanQuery(who, "select * from clara.get_own_dpa_signature()");
  assert.equal(mine.rowCount, 1, "la.15 the deprecated evidence read follows the acceptance");
  assert.equal(mine.rows[0].dpa_version, String(d.version));
  assert.equal(mine.rows[0].is_current, true);

  // THE RED-ON-OLD PROOF. Before 0185 this exact call SUCCEEDED against the seeded placeholder.
  const err = await assertRaises(CLR.lastOwner,
    () => humanQuery(who, "select clara.sign_dpa($1,$2,$3)",
      ["clara-beta-2026-08-a", sha256Bytes(PLACEHOLDER_BODY), opk("w621-placeholder")]),
    "la.15 signing the 0158 placeholder");
  assert.ok([LEGAL_REASON.notPublished, LEGAL_REASON.staleVersion].includes(detailOf(err)?.reason),
    `la.15 the placeholder refusal is typed (got ${err.detail})`);
  // …and an unrecognised spelling is typed too, rather than a bare miss.
  await assertPair(CLR.badRequest, LEGAL_REASON.unknownVersion,
    () => humanQuery(who, "select clara.sign_dpa($1,$2,$3)",
      [`no-such-${randomUUID()}`, sha256Bytes(d.body), opk("w621-unknown")]),
    "la.15 an unknown DPA spelling");
});

// ------------------------------------------------------------------------------------------
// G · THE TWO RACES THE FIRST CUT LEFT OPEN (#621 review), AND THE PLAN PINS.
// ------------------------------------------------------------------------------------------
cell("la.16 SEC-1: a publish landing mid-checkout BLOCKS on open_checkout_intent's own locks, and the intent is pinned to the version the applicant actually accepted", async () => {
  // THE BUG THIS CELL EXISTS FOR: the first cut computed the missing kinds, then re-read each
  // kind's published version in SEPARATE statements. Under READ COMMITTED a publish committing
  // between them is invisible to the check and visible to the pin, so the door opens on v1 and
  // pins v2 — and after payment claim_paid_firm refuses legal_not_accepted on a PAID registration.
  //
  // WHY THIS CELL ASSERTS wait_event='advisory' AND NOT MERELY "it blocked". Against the PRE-FIX
  // bodies this same scene still blocks — on a `transactionid` ShareLock, because the intent
  // INSERT takes FK KEY SHARE locks on the two legal_documents rows and the supersede UPDATE moves
  // `status`, a key column of uq_legal_documents_published. That lock is taken by the LAST
  // statement of the door, after the reads it would have to protect, and the reuse path never
  // takes it at all. So "some lock, somewhere" is exactly the assertion that would have passed on
  // the broken body; the advisory key is the one that names the wall.
  const who = await insertUser("w621", "sec1");
  const email = await userEmail(who);
  const registration = await insertRegistration(who, "sec1");
  const docs = await acceptBoth(operator.owner, who, { tag: "sec1" });
  await ensurePriceMap();
  const nextBody = bodyText("sec1-terms-v2");

  const a = await getPool().connect();
  const b = await getPool().connect();
  let waitEvent = null;
  let locksA = null;
  let locksB = null;
  let published = null;
  let intentId = null;
  try {
    // A — the applicant, HELD INSIDE THE DOOR: open_checkout_intent has returned but its
    // transaction (and therefore its two `xact` advisory locks) is still open.
    await a.query("set role clara_authenticated");
    await a.query("begin");
    await a.query("select set_config('request.jwt.claims',$1,true)",
      [JSON.stringify({ sub: who, role: "authenticated", email })]);
    const opened = await a.query(
      "select clara.open_checkout_intent(p_registration=>$1,p_origin_digest=>$2,p_op_key=>$3) as result",
      [registration.id, originDigest("w621-sec1"), opk("w621-sec1-open")]);
    intentId = opened.rows[0].result.intent_id;
    const pidA = (await a.query("select pg_backend_pid() as pid")).rows[0].pid;

    // B — the operator publishes a NEW Terms version, fired while A is still uncommitted. This is
    // the exact interleaving the first cut lost: it must WAIT, not slip between check and pin.
    await b.query("set role clara_authenticated");
    await b.query("select set_config('request.jwt.claims',$1,false)",
      [JSON.stringify({ sub: operator.owner, role: "authenticated" })]);
    const pidB = (await b.query("select pg_backend_pid() as pid")).rows[0].pid;
    const bPromise = b.query(
      "select clara.publish_legal_document($1,$2,$3,$4,$5,$6) as result",
      ["terms", "#621 sec1 v2", nextBody, "docs/ops/legal/terms.md", null, opk("w621-sec1-pub")])
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    waitEvent = await waitBlockedByOrThrow(pidB, pidA);
    locksA = await advisoryLocks(pidA);
    locksB = await advisoryLocks(pidB);

    await a.query("commit");
    published = await bPromise;
  } finally {
    for (const c of [a, b]) {
      await c.query("rollback").catch(() => {});
      await c.query("reset role").catch(() => {});
      await c.query("reset all").catch(() => {});
      c.release();
    }
  }

  // (1) THE PREMISE, PINNED: B was blocked BY A, on an ADVISORY lock — the publish door's own
  //     per-kind key — while A held its (terms, dpa, origin) keys granted.
  assert.equal(waitEvent, "advisory",
    "la.16 the publish must wait on an ADVISORY lock, not merely on 'some lock somewhere'");
  assert.ok(locksA.held >= 2,
    `la.16 the applicant inside the door must HOLD both per-kind keys (held=${locksA.held})`);
  assert.deepEqual({ held: locksB.held, waiting: locksB.waiting }, { held: 0, waiting: 1 },
    "la.16 the publish must hold nothing and be waiting on exactly one key");

  // (2) THE CONSEQUENCE: the publish succeeded only AFTER the commit, and the intent is pinned to
  //     the version the applicant accepted — never the one that landed while they were inside.
  assert.equal(published.ok, true, `la.16 the publish must complete once A commits (${published.e?.message})`);
  const newer = published.r.rows[0].result;
  assert.equal(newer.version, docs.terms.version + 1, "la.16 …allocating the next Terms version");
  const row = await intentRow(intentId);
  assert.equal(row.terms_version, docs.terms.version,
    "la.16 the pin is the ACCEPTED version, not the one published mid-door");
  assert.equal(row.dpa_version, docs.dpa.version);
  const accepted = await rootQuery(
    "select count(*)::int as n from clara.legal_acceptances where user_id=$1 and kind='terms' and version=$2",
    [who, row.terms_version]);
  assert.equal(accepted.rows[0].n, 1, "la.16 …and an acceptance of the PINNED version exists");

  // (3) THE OTHER INTERLEAVING, driven to completion. The publish that had to WAIT is visible to
  //     the very next open: the SAME applicant, on the SAME still-open registration, is now
  //     refused by name — and that refusal does not disturb the intent already pinned at v1.
  //     (One open registration per applicant is 0145's own law — uq_firm_registration_requests_
  //     open_applicant — so the second observation must be this registration, not another.)
  const refused = await assertPair(CLR.lastOwner, LEGAL_REASON.legalNotAccepted,
    () => openIntent(who, email, registration.id), "la.16 re-opening under the newly published Terms");
  assert.deepEqual(refused.detail.missing, ["terms"],
    "la.16 the publish that had to wait is visible to the very next open");
  const unmoved = await intentRow(intentId);
  assert.equal(unmoved.terms_version, docs.terms.version,
    "la.16 …and the refused re-open left the already-pinned intent exactly where it was");

  // …and once the applicant accepts the version that landed, the door opens again — proving the
  // refusal above is the version gate, not a wedged registration.
  await acceptLegal(who, { kind: "terms", version: newer.version, sha: sha256Hex(nextBody) });
  const reopened = await openIntent(who, email, registration.id);
  assert.equal(reopened.intent_id, intentId, "la.16 the unstamped intent is reused, not duplicated");
});

cell("la.17 SEC-2: reusing a pre-0185 intent STAMPS its missing terms pin, and that pin is one-way", async () => {
  const who = await insertUser("w621", "sec2");
  const email = await userEmail(who);
  const registration = await insertRegistration(who, "sec2");
  const docs = await acceptBoth(operator.owner, who, { tag: "sec2" });

  // THE PRE-0185 SHAPE, insertable only as root: unstamped, current plan, NO terms pin. This is
  // exactly the row open_checkout_intent's reuse arm matches, and the row §D used to claim would
  // "close by itself".
  const legacy = await rootIntent({
    registration: registration.id, applicant: who, dpaVersion: docs.dpa.version, termsVersion: null,
  });
  assert.equal((await intentRow(legacy)).terms_version, null, "la.17 the legacy intent starts unpinned");

  const opened = await openIntent(who, email, registration.id);
  assert.equal(opened.intent_id, legacy, "la.17 the unstamped legacy intent is REUSED, not replaced");
  const after = await intentRow(legacy);
  assert.equal(after.terms_version, docs.terms.version,
    "la.17 …and the reuse pinned the Terms version this call just verified the caller accepted");
  assert.equal(after.dpa_version, docs.dpa.version, "la.17 the DPA pin is untouched");
  assert.equal(after.session_id, null, "la.17 the intent is still unstamped — only the pin moved");
  assert.equal((await rootQuery(
    "select count(*)::int as n from clara.checkout_intents where registration_id=$1",
    [registration.id])).rows[0].n, 1, "la.17 no second intent was opened");

  // A second open reuses the same row and moves nothing.
  const again = await openIntent(who, email, registration.id);
  assert.equal(again.intent_id, legacy);
  assert.equal((await intentRow(legacy)).terms_version, docs.terms.version,
    "la.17 the pin is written once and then left alone");

  // THE PIN IS ONE-WAY, AND NOTHING ELSE RIDES ALONG. The session-stamp trigger admits exactly
  // NULL -> value on an unstamped row: a rewrite of an existing pin, and a pin write that also
  // moves another column, are both 0158's refusal.
  await assertRaises(CLR.badRequest,
    () => rootQuery("update clara.checkout_intents set terms_version=$2 where id=$1",
      [legacy, docs.terms.version]),
    "la.17 rewriting a pin that already exists");
  // A SECOND applicant, because 0145 admits one open registration per applicant
  // (uq_firm_registration_requests_open_applicant).
  const someoneElse = await insertUser("w621", "sec2b");
  const other = await insertRegistration(someoneElse, "sec2b");
  const bare = await rootIntent({
    registration: other.id, applicant: someoneElse, dpaVersion: docs.dpa.version, termsVersion: null,
  });
  await assertRaises(CLR.badRequest,
    () => rootQuery(
      "update clara.checkout_intents set terms_version=$2, price_local_key=$3 where id=$1",
      [bare, docs.terms.version, "not-the-plan"]),
    "la.17 a pin write that also moves another column");
  assert.equal((await intentRow(bare)).terms_version, null, "la.17 …and that refusal left the row alone");
});

cell("la.18 H-1: the three #621 doors pin plan_cache_mode=force_custom_plan; the two recut 0163 doors deliberately do not", async () => {
  const cfg = async (sig) => (await rootQuery(
    "select coalesce(p.proconfig,'{}'::text[]) as cfg from pg_proc p where p.oid = to_regprocedure($1)",
    [sig])).rows[0]?.cfg ?? null;

  // 0183's house rule (0183:1186-1201): a plpgsql door whose ONE cached statement binds a
  // per-tenant/per-user/per-kind value is re-planned per call, or plpgsql serves it from a generic
  // plan from the sixth call of a pooled connection (0183 measured 18-46 ms -> 13.5-16.4 s).
  // Asserted from the CATALOG because a door re-shipped without the clause answers correctly and
  // slowly — the failure mode a correctness test cannot see.
  for (const sig of [
    "clara.accept_legal_document(text,integer,text,text)",
    "clara.publish_legal_document(text,text,text,text,timestamptz,text)",
    "clara.get_current_legal_documents()",
  ]) {
    const c = await cfg(sig);
    assert.ok(c, `la.18 ${sig} must resolve`);
    assert.ok(c.includes("plan_cache_mode=force_custom_plan"),
      `la.18 ${sig} must pin plan_cache_mode=force_custom_plan (got ${JSON.stringify(c)})`);
    assert.ok(c.includes("search_path=clara, pg_temp"),
      `la.18 ${sig} must still pin its search_path — the clause sits BESIDE it, never in place of it`);
  }

  // …and the two §G recuts keep 0163's own proconfig exactly: 0163 shipped them without the
  // clause and neither 0183 nor 0184 re-pinned them, so #621 does not change how they are planned.
  for (const sig of [
    "clara.open_checkout_intent(uuid,bytea,text)",
    "clara.claim_paid_firm(uuid,text)",
  ]) {
    const c = await cfg(sig);
    assert.ok(c, `la.18 ${sig} must resolve`);
    assert.deepEqual(c, ["search_path=clara, pg_temp"],
      `la.18 ${sig} must carry 0163's proconfig unchanged (got ${JSON.stringify(c)})`);
  }
});
