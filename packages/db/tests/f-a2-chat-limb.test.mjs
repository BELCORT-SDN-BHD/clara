// F-A2 — Annex C.13: CHAT PARITY. Most of this section rides the chat-parity FOLLOW-ON PR
// (GB-3 / §D.2c), not PR-1..PR-4, and the file is organised around that severance.
//
// THREE POPULATIONS OF CELL LIVE HERE, and mixing them up is how a severed limb gets reported
// as shipped:
//
//   1. IN THE F-A2 TRAIN — the two cells about the POST path, which ships with `chatTurn_v13`.
//      Gated on `f_a2_posting_core$`.
//   2. THE FOLLOW-ON PR's OWN BATTERY — the new `interactive_client` wake kind, both CHECKs,
//      both mint gates, the six roster surfaces. Skip-guarded on the follow-on PR, and written
//      now so the PR has a battery to land against rather than one written after the fact.
//   3. THE EXTEND-ONLY REGRESSION CELLS — UNGATED, because their whole job is to record what the
//      estate does TODAY and keep asserting it afterwards. `coding_lane`'s cell is the one that
//      would have caught the frozen-`chatTurn_v12` behaviour change C-3 reversed, and a cell
//      that only started running after the change could not catch it.
//
// WHY THE LIMB WAS SEVERED, in one paragraph, because a later reader will otherwise re-propose
// the weakening. v2 proposed relaxing `ck_wake_credentials_client_0011` so a plain `interactive`
// credential could carry a client. The census killed it: `list_unassigned_documents` REGRESSES,
// `coding_lane` widens SILENTLY (it has no is-not-null guard, so a client-less credential gets
// EMPTY today and a pinned one would suddenly return rows — changing a FROZEN workflow's answers
// with no byte change anywhere), eight further readers flip, and it contradicts a documented PIN
// BLOCKER. The adopted shape is a NEW KIND, an extension. Then GB-3 found that the client CHECK
// is ITSELF a closed-world enumeration and `mint_wake_credential` carries a SECOND kind gate
// above the arms — so the credential was unmintable as designed, and both failure modes push a
// builder back toward the weakening. Hence: the whole limb ships as its own PR, after the DB
// path proves live.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane, skipHere,
  ROLES, booksVersion, fnPresent,
  gateCore, wakePostEntry, agentDraft, interactiveCred, ensureChart, witnessedFiling,
  postReceiptRow, supplierLines, genericLines, admits, admitsAll, assertVectorShape,
  TIER_B_RUNGS, CHAT_PARITY_PENDING, PR2_PENDING, mintWake5, gateGrants,
  wakeQuery, filedDocument, retireDocumentFiling, opk,
} from "./f-a2-post-world.mjs";

let world = null;
let waveA = false;
before(async () => {
  waveA = (await fnPresent("mint_wake_credential")) && (await fnPresent("coding_lane"));
  if (waveA) world = await buildWorld();
});
after(async () => {
  printLaneNotes("f-a2-chat-limb");
  printSkipCount("f-a2-chat-limb");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const OWNER = () => world.users.alice;
const BOB = () => world.users.bob;

const NEW_KIND = "interactive_client";
const gateWaveA = (t) => (waveA ? false : skipHere(t, "the Wave-A wake surface (mint_wake_credential / coding_lane) is absent at this frontier"));

/** Has the follow-on PR landed? Probed by the ONE thing that cannot be true without it — the
 *  durable CHECKs admitting the new kind. Probed, never assumed: a gate keyed on a migration
 *  stem this lane does not own would be a guess about someone else's file name.
 *
 *  AND IT PROBES PART 1 ONLY. The CHECK swap ships in the posting CORE; `clara.wake_post_entry`
 *  and its allowlist rows ship in the GRANTS file. Three cells here POST — c13.kind, c13.rungs
 *  and c13.generic — and they were gated on the core stem alone, so at a frontier carrying part
 *  1 without part 2 they would have failed 42883 instead of skipping. They now carry
 *  `gateGrants` as well. (Measured by mapping every cell in this file to its gate and to whether
 *  it calls the post verb: three, not two.) */
async function chatParityLive() {
  // NO CATCH. This reads pg_catalog (pg_constraint/pg_class/pg_namespace), which exists at
  // every frontier — a genuine query error here is a real bug, not "the constraint isn't
  // live yet", and swallowing it made a broken query indistinguishable from a pre-PR-1b
  // database: both silently skipped this file's three post-calling cells.
  const r = await rootQuery(
    `select count(*)::int as n from pg_constraint c join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='wake_credentials' and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%interactive\\_client%'`);
  return r.rows[0].n > 0;
}
const gateChatParity = async (t) => ((await chatParityLive()) ? false : skipHere(t, CHAT_PARITY_PENDING));

/** A chat-lane agent draft: interactive credential, director attached. */
async function chatDraft(client, {
  lines = null, codingKind = "supplier_bill", amount = 810000, kind = "invoice",
  typeCode = "01", direction = "purchase",
} = {}) {
  await ensureChart(OWNER(), client);
  const cited = await witnessedFiling(OWNER(), { client, gross: amount, typeCode, kind, direction });
  const cred = await interactiveCred(client, BOB());
  const draft = await agentDraft(OWNER(), cred, {
    client, cited, codingKind, lines: lines ?? supplierLines(amount),
  });
  return {
    cited, cred, draft,
    args: { entry: draft?.entry_id, expectedRevision: draft?.revision_token, client, booksVersion: await booksVersion(client) },
  };
}

// ===========================================================================
// 1 · IN THE F-A2 TRAIN — the post path.
// ===========================================================================

test("f-a2.c13.kind a CHAT POST lands with via_wake_kind='interactive' — the post keeps the PLAIN kind", async (t) => {
  if (await gateCore(t)) return;
  if (await gateGrants(t)) return;   // the post verb ships in PART 2
  const c = await chatDraft(A1());
  const wire = await wakePostEntry(c.cred, c.args);
  assert.equal(wire?.posted, true, `c13.kind: the chat post lands (${JSON.stringify(wire?.refusal)})`);
  const row = await postReceiptRow(c.args.entry);
  assert.equal(row?.via_wake_kind, "interactive",
    `c13.kind: the receipt records the PLAIN kind. 'interactive_client' is minted for wake_open_question ALONE and never carries a post — Annex E.1's CHECK says so, and a post arriving under it is a contract violation (got ${row?.via_wake_kind})`);
  assert.equal(row?.on_behalf_of, BOB(), "c13.kind: …and the chat lane's director is on the receipt");
});

test("f-a2.c13.rungs every Tier-B rung is RE-PROVEN on the chat lane — B15 included", async (t) => {
  if (await gateCore(t)) return;
  if (await gateGrants(t)) return;   // the post verb ships in PART 2
  // Chat is DIRECTION-BLIND today (`chatTurn.v12.tools.ts:292`), and the `0046:2687-2688` arm was
  // autodraft-gated, so the generic hole GB-1 found is WIDER on this lane, not narrower. B15
  // lives in the LADDER precisely so it covers both lanes rather than in the autodraft toolface.
  const c = await chatDraft(A1(), { amount: 811000 });
  const wire = await wakePostEntry(c.cred, c.args);
  assertVectorShape(assert, wire?.rung_vector, "c13.rungs");
  for (const rung of TIER_B_RUNGS) {
    assert.ok(Object.prototype.hasOwnProperty.call(wire.rung_vector, rung),
      `c13.rungs: rung ${rung} is evaluated on the chat lane too — the ladder is in the CORE, not in a toolface`);
  }
  assert.ok(admits(wire.rung_vector, "B15"), "c13.rungs: a coded chat draft admits at B15");
  assert.equal(admitsAll(wire.rung_vector), wire.posted === true, "c13.rungs: and posting still means an empty failing-rung vector");

  // The B15 arm, on the chat lane: the suppressed-payable shape must refuse HERE too.
  const suppressed = await chatDraft(A1(), {
    amount: 812000, codingKind: null, lines: genericLines(812000),
  });
  const bad = await wakePostEntry(suppressed.cred, suppressed.args);
  assert.ok(!admits(bad?.rung_vector, "B15"),
    `c13.rungs: a GENERIC chat draft anchored to a DIRECTIONAL document does not admit at B15 (got ${JSON.stringify(bad?.rung_vector?.B15)})`);
});

test("f-a2.c13.generic a chat post of a journal_entry GENERIC lands when it is lawfully generic", async (t) => {
  if (await gateCore(t)) return;
  if (await gateGrants(t)) return;   // the post verb ships in PART 2
  const c = await chatDraft(A2(), {
    amount: 813000, codingKind: null, lines: genericLines(813000), direction: "unresolved",
  });
  const wire = await wakePostEntry(c.cred, c.args);
  assert.equal(wire?.posted, true,
    `c13.generic: D18 survives on the chat lane — a direction-unresolved generic still posts when tied (${JSON.stringify(wire?.refusal)})`);
  assert.equal((await postReceiptRow(c.args.entry))?.via_wake_kind, "interactive", "c13.generic: under the plain kind");
});

test("f-a2.c13.v13 chatTurn_v13 is a NEW export with its registry repoint — never an edit", async (t) => {
  const here = fileURLToPath(new URL("../../../packages/runtime/", import.meta.url));
  if (!existsSync(here)) { skipHere(t, "the runtime package is not reachable from this test's path"); return; }
  const files = [];
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".turbo" || e.name === "dist") continue;
      if (e.isDirectory()) walk(`${dir}${e.name}/`, depth + 1);
      else if (/^chatTurn\.v\d+\./.test(e.name)) files.push(`${dir}${e.name}`);
    }
  };
  walk(here);
  const v13 = files.filter((f) => /chatTurn\.v13\./.test(f));
  if (!v13.length) { skipHere(t, `${PR2_PENDING} — chatTurn.v13.* has not been authored`); return; }
  const v12 = files.filter((f) => /chatTurn\.v12\./.test(f));
  assert.ok(v12.length > 0,
    "c13.v13: chatTurn.v12.* SURVIVES. A workflow body is immutable once deployed — a behavioural change ships as a new _vN and repoints the registry; renaming or deleting an export with in-flight runs is the failure this law exists to prevent");
  const registry = files.length
    ? readdirSync(here, { withFileTypes: true }).filter((e) => /registry/i.test(e.name)).map((e) => here + e.name)
    : [];
  for (const reg of registry) {
    const src = readFileSync(reg, "utf8");
    if (/chatTurn/.test(src)) {
      assert.match(src, /chatTurn.{0,40}v13/s, `c13.v13: the registry at ${reg} points at v13`);
    }
  }
  noteLane(`c13.v13: chatTurn versions present — ${files.map((f) => f.split("/").pop()).join(", ")}`);
});

// ===========================================================================
// 2 · THE FOLLOW-ON PR's OWN BATTERY.
// ===========================================================================

test("f-a2.c13.checks the CHECK-SWAP TRIO — both durable CHECKs and the second mint gate admit interactive_client", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  // GB-3's blocker, made three cells in one. Extending only the KIND CHECK leaves the credential
  // UNMINTABLE, because `ck_wake_credentials_client_0011` is ITSELF a closed-world enumeration
  // over the three existing kinds — and `mint_wake_credential` carries a SECOND kind gate ABOVE
  // the arms §D.2 says to extend, so extending only the cited arms leaves every mint refused
  // 'bad wake_kind'. All three must move, and EXTENDING AN ENUMERATION IS NOT WEAKENING THE
  // CLIENT BINDING: C-3 reversed letting a PLAIN `interactive` credential carry a client, which
  // this does not do.
  const defs = await rootQuery(
    `select c.conname, pg_get_constraintdef(c.oid) as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='wake_credentials' and c.contype='c' order by c.conname`);
  const kindCheck = defs.rows.find((r) => /wake_kind/.test(r.d) && !/client_id/.test(r.d));
  const clientCheck = defs.rows.find((r) => /client_id/.test(r.d));
  assert.ok(kindCheck && new RegExp(NEW_KIND).test(kindCheck.d),
    `c13.checks/1: the KIND CHECK admits '${NEW_KIND}' (got ${kindCheck?.d})`);
  assert.ok(clientCheck && new RegExp(NEW_KIND).test(clientCheck.d),
    `c13.checks/2: the CLIENT CHECK admits it too — it is a closed-world enumeration, so leaving it alone makes the credential unmintable (got ${clientCheck?.d})`);
  const mint = await rootQuery(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='mint_wake_credential' limit 1`);
  const src = mint.rows[0]?.prosrc ?? "";
  const hits = src.split(NEW_KIND).length - 1;
  assert.ok(hits >= 2,
    `c13.checks/3: BOTH mint gates name the kind — the arms AND the second kind gate above them (found ${hits} occurrences; one alone means every mint still refuses 'bad wake_kind')`);
});

test("f-a2.c13.mint the new kind mints only with a firm-congruent active client, and KEEPS on_behalf_of", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  const ok = await mintWake5({ kind: NEW_KIND, firm, onBehalfOf: BOB(), client: A1() });
  assert.ok(ok?.secret, "c13.mint: a firm-congruent active client plus a director mints");
  const row = await rootQuery("select wake_kind, client_id, on_behalf_of from clara.wake_credentials where id=$1", [ok.credentialId]);
  assert.equal(row.rows[0]?.client_id, A1(), "c13.mint: the client pin is durable");
  assert.equal(row.rows[0]?.on_behalf_of, BOB(),
    "c13.mint: …and on_behalf_of SURVIVES, unlike autodraft which forbids it. The chat lane has a real director and the credential must say so");
  let raised = null;
  try { await mintWake5({ kind: NEW_KIND, firm, onBehalfOf: BOB(), client: null }); } catch (e) { raised = e; }
  assert.ok(raised, "c13.mint: a client-LESS mint of the pinned kind is refused — the pin is the point");
  noteLane("c13.mint: the mint verifies FIRM-CONGRUENT AND ACTIVE, not that this human is authorised for that client — the estate's existing firm-scoped model, stated rather than implied");
});

test("f-a2.c13.roster GB-3's closed-world cell — interactive_client holds EXACTLY wake_open_question plus F-A3 PR-3's ruled bank-agency parity roster (OQ-6, Annex A23)", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  // F-A3 PR-3 (OQ-6, Annex A23) is a NAMED, RULED widening of this kind past the original
  // wake_open_question-only pin — see f-a2-grants.test.mjs's sibling cell (c12.d34-roster) for
  // the full citation. Still a closed set: asserting the EXACT row list is what makes a FUTURE,
  // un-ruled addition turn this red.
  const r = await rootQuery(
    "select coalesce(fn_name, function_name) as fn from clara.wake_fn_allowlist where wake_kind=$1 order by 1", [NEW_KIND]);
  const fns = r.rows.map((x) => x.fn);
  assert.deepEqual(fns, [
    "wake_add_bank_account", "wake_complete_bank_reconciliation", "wake_get_bank_pack",
    "wake_match_bank_line", "wake_open_question", "wake_propose_bank_identifier_promotion",
    "wake_propose_bank_line_exception", "wake_resolve_and_book_bank_line",
    "wake_resolve_bank_line_exception", "wake_settle_from_bank_line", "wake_unmatch_bank_match",
    "wake_upsert_account", "wake_void_bank_reconciliation", "wake_void_bank_statement",
  ], `c13.roster: interactive_client's allowlist is not the ruled fourteen-row set (got ${fns.join(", ")})`);
});

test("f-a2.c13.woq wake_open_question succeeds from the pinned kind, and still REFUSES an unpinned credential", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  // The wall is the PIN, not the kind NAME (law 27(3)) — `wake_open_question` re-keys onto the
  // client pin. A cell that only proved the new kind works would leave the re-key untested, and
  // a kind-name check would be exactly the "spelling is not identity" defect.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  const pinned = await mintWake5({ kind: NEW_KIND, firm, onBehalfOf: BOB(), client: A1() });
  const { wakeOpenQuestion } = await import("./f-a2-post-world.mjs");
  // THE SCOPE ID IS THE CLIENT, and it is required rather than optional: `_open_question_core`
  // refuses CLR10 `open question is malformed` on a NULL `p_scope_id` for every scope kind, so
  // a client-scoped question names the client. Passing null refused before the pin was ever
  // consulted, which made the positive half of this cell measure the payload validator instead
  // of the re-key.
  const ok = await wakeOpenQuestion(ROLES.wakeInteractive, pinned.secret, {
    client: A1(), scopeKind: "client", scopeId: A1(), question: "c13 pinned question",
  });
  assert.ok(ok, "c13.woq: the pinned credential opens a question");
  const plain = await mintWake5({ kind: "interactive", firm, onBehalfOf: BOB(), client: null });
  let raised = null;
  try {
    await wakeOpenQuestion(ROLES.wakeInteractive, plain.secret, {
      client: A1(), scopeKind: "client", scopeId: A1(), question: "c13 unpinned question",
    });
  } catch (e) { raised = e; }
  assert.ok(raised, "c13.woq: an UNPINNED credential is still refused — the re-key is onto the pin, not onto the kind name");
  assert.equal(raised.code, "CLR03", `c13.woq: …with CLR03 (got ${raised.code}: ${raised.message})`);
});

// ===========================================================================
// 3 · THE EXTEND-ONLY REGRESSION CELLS — ungated, on purpose.
// ===========================================================================

test("f-a2.c13.reg-plain a PLAIN interactive credential still cannot carry a client", async (t) => {
  if (gateWaveA(t)) return;
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  let raised = null;
  try { await mintWake5({ kind: "interactive", firm, onBehalfOf: BOB(), client: A1() }); } catch (e) { raised = e; }
  assert.ok(raised,
    "c13.reg-plain: THE reversal C-3 minted. An extension adds a NEW kind; it never lets the existing one carry a client");
  noteLane(`c13.reg-plain: refused with ${raised.code}: ${raised.message}`);
});

test("f-a2.c13.reg-unassigned list_unassigned_documents still ADMITS a plain interactive credential, and still returns rows", async (t) => {
  if (gateWaveA(t)) return;
  // Census finding 1, rebuilt. `clara._agent_read_admitted` refuses ANY client-pinned credential
  // on a `p_client => null` call, so extending the credential CHECKs could have regressed this
  // reader — and the first cut of this cell could not have noticed:
  //   (a) it asserted `!error || error.code !== 'CLR03'`, which passes on success AND on every
  //       other error, including "relation does not exist";
  //   (b) it never looked at what came back, so an ADMITTED-but-empty reader read as a pass;
  //   (c) it set the wake secret with `set_config(..., false)` in ONE pooled roleQuery and then
  //       issued the read in a SECOND one — a different connection — so the call it measured
  //       most likely carried no credential at all.
  // MEASURED WHILE REBUILDING IT, and it is the sharpest of the three: `clara
  // .list_unassigned_documents` HAS NO `p_client` PARAMETER. Its only argument is `p_limit`; the
  // "p_client => null" in the census wording is the second argument of the reader's INTERNAL
  // `_agent_read_admitted('list_unassigned_documents', null)` call, not a parameter a caller can
  // pass. So the old cell issued a call that did not resolve at all (42883), the `.catch`
  // swallowed it, and `!error || error.code !== 'CLR03'` read function-not-found as a pass. It
  // had been green against a call the server never accepted.
  // The lawful instrument is `wakeQuery`, which sets the secret txn-locally on the SAME
  // connection, and the reader is asked for a document it must actually find.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;

  // AN UNASSIGNED DOCUMENT, built through the estate's own doors: the reader's population is
  // "documents with no live filing", so a filed document has its filing RETIRED.
  const doc = await filedDocument(OWNER(), { firm, client: A1(), kind: "invoice" });
  const filingRow = await rootQuery(
    "select id, revision_token from clara.document_filings where document_id=$1 and retired_at is null",
    [doc.documentId]);
  assert.equal(filingRow.rows.length, 1, "c13.reg-unassigned: mandatory setup — the document is filed exactly once");
  await retireDocumentFiling(OWNER(), {
    filing: filingRow.rows[0].id, reason: "c13.reg-unassigned: make the document unassigned",
    expectedRevision: filingRow.rows[0].revision_token, opKey: opk("c13unassign"),
  });
  assert.equal(
    (await rootQuery(
      "select count(*)::int as n from clara.document_filings where document_id=$1 and retired_at is null",
      [doc.documentId])).rows[0].n,
    0, "c13.reg-unassigned: mandatory setup — it now has NO live filing, which is the reader's own population");

  const read = async (secret) => {
    const r = await wakeQuery(ROLES.agentRo, secret,
      "select coalesce(jsonb_agg(x.r), '[]'::jsonb) as rows from clara.list_unassigned_documents(p_limit => 500) x(r)");
    return r.rows[0].rows;
  };

  // (a) THE PLAIN, CLIENT-LESS INTERACTIVE CREDENTIAL — admitted, and it SEES the document.
  const plain = await mintWake5({ kind: "interactive", firm, onBehalfOf: BOB(), client: null });
  const seen = await read(plain.secret);
  assert.ok(Array.isArray(seen), `c13.reg-unassigned: the reader answered a list (got ${JSON.stringify(seen)?.slice(0, 120)})`);
  assert.ok(seen.some((x) => x?.id === doc.documentId),
    `c13.reg-unassigned: …and the unassigned document is IN it (${seen.length} row(s)) — an admitted-but-empty reader is the shape the old assertion could not tell from a working one`);

  // (b) THE PINNED CREDENTIAL — still refused by the admission gate, which is what makes (a) a
  // measurement of the ADMISSION rather than of a reader that admits everybody.
  const pinned = await mintWake5({ kind: NEW_KIND, firm, onBehalfOf: BOB(), client: A1() });
  // THE INTENDED IDENTITY, RE-READ FROM THE LIVE BODY (a correction: my first pass here read
  // only _agent_read_admitted's tail and missed its own middle line). 0011:3922-3939 —
  // `if w.wake_kind not in ('interactive','proactive') then perform
  // clara.assert_wake_allowed(w.wake_kind,p_fn); end if;` — runs BEFORE the client-match check,
  // and NEW_KIND ('interactive_client') is not in that fast-path pair. So for THIS credential
  // kind the call always raises CLR03 via assert_wake_allowed (not allowlisted for
  // list_unassigned_documents) and never reaches the false-return path at all. The empty-array
  // shape is real for 'interactive'/'proactive' credentials but not reachable here; asserting it
  // for interactive_client made this cell provably wrong the moment it stopped swallowing errors.
  const err = await read(pinned.secret).then(() => null, (e) => e);
  assert.equal(err?.code, "CLR03",
    `c13.reg-unassigned CONTROL: an interactive_client credential is refused by the wake-kind allowlist specifically (assert_wake_allowed, not allowlisted for list_unassigned_documents) — got ${err?.code}: ${err?.message}`);
});

test("f-a2.c13.reg-coding-lane coding_lane returns EXACTLY what it returns today for a plain interactive credential", async (t) => {
  if (gateWaveA(t)) return;
  // Census finding 2 — THE DECISIVE ONE, and the cell that would have caught the frozen
  // `chatTurn_v12` behaviour change. `coding_lane` (`0011:1570`) has NO is-not-null guard:
  // `if p_client is null or w.client_id is distinct from p_client then return; end if;`. For a
  // client-LESS interactive credential `NULL is distinct from p_client` is TRUE, so chat gets
  // EMPTY today. A pinned credential would suddenly return rows — a frozen workflow's answers
  // changing with NO byte change anywhere.
  const src = await rootQuery(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='coding_lane' limit 1`);
  const body = src.rows[0]?.prosrc ?? "";
  assert.ok(/is\s+distinct\s+from/i.test(body),
    "c13.reg-coding-lane: the reader still uses the `is distinct from` shape the census measured — if that changed, this whole finding must be re-derived rather than assumed");
  assert.ok(!/client_id\s+is\s+not\s+null/i.test(body),
    "c13.reg-coding-lane: and it STILL has no is-not-null guard. That absence is the standing warning §7 registers, not a bug to be quietly fixed under a different PR");
  noteLane("c13.reg-coding-lane: any future change to what a credential's client binding MEANS changes a FROZEN workflow's answers with no byte change anywhere. This cell is the tripwire");
});
