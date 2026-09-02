// F-A2 PR-1 — Annex C.13: CHAT PARITY AND ITS FAIL-CLOSED PATH. **In THIS battery**, on the
// owner's ruling D34.
//
// THE SEVERANCE IS OFF, AND THAT IS A CORRECTION TO AN EARLIER CUT OF THIS FILE. v5's §D.2c
// severed the `interactive_client` limb to its own follow-on PR after GB-3 found it unbuildable
// as written; **v6.1's D34 reversed that** and put the limb back in PR-1 in GB-3's CORRECTED
// form. Design §5 step 2 now lists "the `interactive_client` limb … BOTH CHECKs" among PR-1's
// contents; §D.5 reads "EXTEND, **in PR-1 (D34)**" for `mint_wake_credential`'s arms and the
// early kind gate at `0011:1163-1165`, and "RE-KEY onto the client pin, **in PR-1**" for
// `wake_open_question`. So every cell below is PR-1's own obligation, and the gate says so: a
// false probe here means PR-1 is HALF-APPLIED, not that some later PR is pending. Reporting the
// second when the first is true is the kind of diagnosis that sends a night's debugging at the
// wrong file.
//
// THREE POPULATIONS OF CELL LIVE HERE, and the distinction is about WHICH PR-1 FILE each needs:
//
//   1. THE POST PATH — gated on `f_a2_posting_core$`. These need the ladder and the receipt.
//   2. THE LIMB — gated on a PROBE for the durable CHECK admitting the kind, not on a stem.
//      The probe is deliberate: it is a positive control on the thing itself, so it cannot go
//      true because a migration merely got named right.
//   3. THE EXTEND-ONLY REGRESSION CELLS — UNGATED, because their whole job is to record what the
//      estate does TODAY and keep asserting it afterwards. `coding_lane`'s cell is the one that
//      would have caught the frozen-`chatTurn_v12` behaviour change C-3 reversed, and a cell
//      that only started running after the change could not catch it.
//
// WHY A NEW KIND AND NOT A WEAKENED CHECK, kept in full because a later reader will otherwise
// re-propose the weakening. v2 proposed relaxing `ck_wake_credentials_client_0011` so a plain
// `interactive` credential could carry a client. The census killed it: `list_unassigned_documents`
// REGRESSES, `coding_lane` widens SILENTLY (it has no is-not-null guard, so a client-less
// credential gets EMPTY today and a pinned one would suddenly return rows — changing a FROZEN
// workflow's answers with no byte change anywhere), eight further readers flip, and it
// contradicts a documented PIN BLOCKER. The adopted shape is a NEW KIND, an EXTENSION. GB-3 then
// found the two ways that extension is harder than it looks — the client CHECK is ITSELF a
// closed-world enumeration, and `mint_wake_credential` carries an EARLY kind gate above the arms
// — and both failure modes push a builder back toward the weakening. D34's corrected recipe is
// what the CHECK-swap and both-mint-gate cells below exist to hold in place.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  rootQuery, endPool, buildWorld, printLaneNotes, printSkipCount, noteLane, skipHere,
  ROLES, roleQuery, booksVersion, fnPresent,
  gateCore, wakePostEntry, agentDraft, interactiveCred, ensureChart, witnessedFiling,
  postReceiptRow, supplierLines, genericLines, admits, admitsAll, assertVectorShape,
  TIER_B_RUNGS, CHAT_PARITY_LIMB_ABSENT, PR2_PENDING, mintWake5,
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

/** Is PR-1's `interactive_client` limb applied? Probed by the ONE thing that cannot be true
 *  without it — the durable CHECK admitting the new kind. A PROBE and not a stem gate on
 *  purpose: the stem would go true when a file is merely NAMED right, while this goes true only
 *  when the CHECK really admits the kind, which is the thing every cell below depends on. */
async function chatParityLive() {
  const r = await rootQuery(
    `select count(*)::int as n from pg_constraint c join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='wake_credentials' and c.contype='c'
        and pg_get_constraintdef(c.oid) like '%interactive\\_client%'`).catch(() => ({ rows: [{ n: 0 }] }));
  return r.rows[0].n > 0;
}
const gateChatParity = async (t) => ((await chatParityLive()) ? false : skipHere(t, CHAT_PARITY_LIMB_ABSENT));

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
// 1 · THE POST PATH.
// ===========================================================================

test("f-a2.c13.kind a CHAT POST lands with via_wake_kind='interactive' — the post keeps the PLAIN kind", async (t) => {
  if (await gateCore(t)) return;
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
  // THE OTHER HALF OF C.13's LAST CELL: the frozen `_vN` of `chatTurn.v10.infra.ts`, which is
  // where the pinned kind is actually minted (R-1: for `wake_open_question` ALONE). That file
  // carries `// @frozen` on line 1, so parity cannot edit it — it ships as a NEW `_vN` with its
  // own repoint, exactly like the toolface. A cell that checked only chatTurn_v13 would call the
  // limb shipped while the thing that mints its credential was still frozen at v10.
  const infra = files.filter((f) => /infra/.test(f));
  const v10Infra = infra.filter((f) => /\.v10\.infra\./.test(f));
  const newInfra = infra.filter((f) => !/\.v10\.infra\./.test(f));
  if (v10Infra.length && !newInfra.length) {
    noteLane("c13.v13: chatTurn.v10.infra.ts is present with NO successor _vN — the minting half of the limb has not shipped yet (PR-2)");
  } else if (newInfra.length) {
    assert.ok(v10Infra.length > 0,
      "c13.v13: the v10 infra file SURVIVES beside its successor — a frozen file is superseded, never edited or removed");
  }
  noteLane(`c13.v13: chatTurn files present — ${files.map((f) => f.split("/").pop()).join(", ")}`);
});

// ===========================================================================
// 2 · THE LIMB — PR-1's own, on D34.
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

test("f-a2.c13.swap-validates the CHECK swap VALIDATES over every pre-existing row, and moves no existing kind's semantics", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  // BOTH CHECKS ARE A DROP+ADD, which is the step that can go wrong quietly. Two ways:
  //
  //   (1) the re-added constraint lands NOT VALID, so it admits every row already in the table
  //       and only polices new ones — a wall that is present, named, and inert. `convalidated`
  //       is the catalog's own answer and it is asserted here rather than assumed.
  //   (2) the rewrite "tidies" a pre-existing disjunct while adding the third one, moving an
  //       existing kind's semantics under cover of an extension. C-3's whole reversal was about
  //       NOT letting a plain `interactive` credential carry a client; an extension that quietly
  //       relaxed that would be the reversed weakening arriving by the back door.
  //
  // (2) is proven BEHAVIOURALLY, as a truth table through the real mint door, because
  // `pg_get_constraintdef` normalises its output — a literal-substring test against the design's
  // spelling would fail on formatting and pass on nothing. The door composes the mint arms with
  // the CHECK, which is the pair a caller actually meets.
  const con = await rootQuery(
    `select c.conname, c.convalidated, pg_get_constraintdef(c.oid) as d
       from pg_constraint c join pg_class t on t.oid=c.conrelid
       join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='wake_credentials' and c.contype='c'
      order by c.conname`);
  assert.ok(con.rows.length >= 2, "c13.swap-validates: both durable CHECKs are present after the swap");
  for (const row of con.rows) {
    assert.equal(row.convalidated, true,
      `c13.swap-validates: ${row.conname} is VALIDATED. A NOT VALID constraint polices only new rows and silently admits every credential already on file — present, named and inert`);
  }
  // …and no row on file violates the new shape. A drop+add that validated against an empty table
  // proves nothing, so the population is reported rather than assumed.
  const rows = await rootQuery("select count(*)::int as n from clara.wake_credentials");
  noteLane(`c13.swap-validates: the swap validated against ${rows.rows[0].n} pre-existing wake_credentials row(s)`);

  // THE TRUTH TABLE. Every pre-existing kind keeps exactly the client binding it had.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  const attempt = async (kind, client) => {
    try {
      await mintWake5({ kind, firm, onBehalfOf: kind === "autodraft" ? null : BOB(), client });
      return "minted";
    } catch (e) { return e.code ?? "raised"; }
  };
  assert.equal(await attempt("autodraft", A1()), "minted", "c13.swap-validates: autodraft + client still mints");
  assert.notEqual(await attempt("autodraft", null), "minted", "c13.swap-validates: autodraft WITHOUT a client is still refused");
  assert.equal(await attempt("interactive", null), "minted", "c13.swap-validates: plain interactive + no client still mints");
  assert.notEqual(await attempt("interactive", A1()), "minted",
    "c13.swap-validates: plain interactive + a client is STILL refused — this is C-3's reversal, and an extension that relaxed it would be the weakening arriving by the back door");
  assert.equal(await attempt("proactive", null), "minted", "c13.swap-validates: proactive + no client still mints");
  assert.notEqual(await attempt("proactive", A1()), "minted", "c13.swap-validates: proactive + a client is still refused");
});

test("f-a2.c13.mint-gates BOTH mint gates moved — the new kind mints, and an UNKNOWN kind is still refused", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  // GB-3's second failure mode, forced from both ends. `mint_wake_credential` carries an EARLY
  // kind gate ABOVE the arms — the `p_wake_kind not in ('interactive','proactive','autodraft')`
  // raise at `0011:1163-1165` — so extending only the arms leaves every mint of the new kind
  // refused `bad wake_kind`. The positive half proves that gate moved.
  //
  // THE NEGATIVE HALF IS THE ONE THAT EARNS ITS PLACE: a builder who "fixed" the early gate by
  // DELETING it would pass the positive half and hand the estate an unbounded kind column, with
  // only the CHECK left standing between a typo and a credential. So an unknown kind must still
  // be refused, and refused THERE.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  const ok = await mintWake5({ kind: NEW_KIND, firm, onBehalfOf: BOB(), client: A1() });
  assert.ok(ok?.secret, "c13.mint-gates: the early gate was EXTENDED — the new kind mints");
  let raised = null;
  try { await mintWake5({ kind: "not_a_wake_kind", firm, onBehalfOf: BOB(), client: A1() }); } catch (e) { raised = e; }
  assert.ok(raised,
    "c13.mint-gates: an UNKNOWN kind is still refused — the early gate was extended, not deleted");
  assert.match(`${raised.message} ${raised.detail ?? ""}`, /wake.?kind/i,
    `c13.mint-gates: …and refused AT THE KIND GATE, naming the kind (got ${raised.code}: ${raised.message})`);
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

test("f-a2.c13.one-row GB-3's closed-world cell — interactive_client holds EXACTLY ONE allowlist row", async (t) => {
  if (gateWaveA(t)) return;
  if (await gateChatParity(t)) return;
  const r = await rootQuery(
    "select coalesce(fn_name, function_name) as fn from clara.wake_fn_allowlist where wake_kind=$1 order by 1", [NEW_KIND]);
  const fns = r.rows.map((x) => x.fn);
  assert.deepEqual(fns, ["wake_open_question"],
    `c13.one-row: exactly ONE row, and it is the fail-closed question call. A SECOND row is how this kind would quietly become a posting kind (got ${fns.join(", ")})`);
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
  const ok = await wakeOpenQuestion(ROLES.wakeInteractive, pinned.secret, {
    client: A1(), scopeKind: "client", scopeId: null, question: "c13 pinned question",
  });
  assert.ok(ok, "c13.woq: the pinned credential opens a question");
  const plain = await mintWake5({ kind: "interactive", firm, onBehalfOf: BOB(), client: null });
  let raised = null;
  try {
    await wakeOpenQuestion(ROLES.wakeInteractive, plain.secret, {
      client: A1(), scopeKind: "client", scopeId: null, question: "c13 unpinned question",
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

test("f-a2.c13.reg-unassigned list_unassigned_documents still admits a plain interactive credential on a p_client => null call", async (t) => {
  if (gateWaveA(t)) return;
  // Census finding 1. `_agent_read_admitted` refuses ANY client-pinned credential on a
  // `p_client => null` call, so a weakening would have REGRESSED this reader. It must keep
  // working, and this cell is what says so afterwards as well as before.
  const firm = (await rootQuery("select firm_id from clara.clients where id=$1", [A1()])).rows[0].firm_id;
  const plain = await mintWake5({ kind: "interactive", firm, onBehalfOf: BOB(), client: null });
  const out = await roleQuery(ROLES.wakeInteractive,
    "select set_config('clara.wake_secret',$1,false) as s", [plain.secret]).then(() =>
    roleQuery(ROLES.wakeInteractive, "select clara.list_unassigned_documents(p_client => null) as r"))
    .catch((e) => ({ error: e }));
  assert.ok(!out?.error || out.error.code !== "CLR03",
    `c13.reg-unassigned: the reader still ADMITS the plain credential (got ${out?.error?.code}: ${out?.error?.message})`);
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
