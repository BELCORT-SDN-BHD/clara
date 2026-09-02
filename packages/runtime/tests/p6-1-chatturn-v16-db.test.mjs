// P6-1 — chatTurn_v16's LIVE battery, against a real migrated Postgres.
//
// WHY THIS FILE EXISTS. chatTurn.v16.prompt.ts's header makes four load-bearing claims about
// the DATABASE, and the whole shape of this bump rests on them: that `freeform_result` is the
// one Q8 kind a chat credential can lawfully produce, and that `firm_question`,
// `close_proposal` and `agent_receipt` are refused to it by walls that are the thing under test
// (hard constraint 14). Those claims were originally read out of migration TEXT. Migration text
// is a projection: a later `CREATE OR REPLACE`, a re-cut policy or a second allowlist row can
// all make a correct citation into a false statement — the superseded-body class this estate
// has paid for more than once. So each claim is re-read here from the LIVE catalog.
//
// THE DISCRIMINATING CONTROL IS `wake_freeform_read`. A file that only ever asserts "the
// allowlist does not admit an interactive credential" would pass just as well against an empty
// table, a typo'd verb name, or a `wake_fn_allowlist` that admits nothing at all. So the same
// query that shows two verbs closed to a chat credential shows a third OPEN to exactly the two
// interactive kinds — the one this closure actually calls. The wall is proven to be a wall by
// being shown to have a door in it.
//
// `wake_propose_close` IS THE CASE WORTH READING TWICE. Its EXECUTE grant is to
// `clara_wake_interactive` — the very role a chat turn's write pool runs on — so the grant is
// NOT the wall and a census that stopped at the grant would have concluded the opposite. What
// refuses a chat turn is the wake-KIND allowlist, checked by `clara._close_wake_ctx` through
// `assert_wake_allowed`. Both halves are read below, separately, and the file says which one
// does the work.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { mintWakeCredentialObo, mintWakeCredentialClientObo, withRuntime, endPools } from "../lib/pools.mjs";
import * as ff from "../lib/freeform-read.mjs";

const { register } = await import("tsx/esm/api");
register();
const registry = await import("../workflows/registry.ts");
const prompt16 = await import("../workflows/chatTurn.v16.prompt.ts");
const freeform15 = await import("../workflows/chatTurn.v15.freeform.ts");

// Successor-proofing: the live decoy-vs-receipt cell below promotes through the CURRENT registry
// version. The exact v16 pin remains its own cell, so a successor must deliberately update that
// assertion while automatically inheriting the live provenance battery.
const currentChatName = registry.workflows.chatTurn.name;
const currentChatMatch = /^chatTurn_v([1-9][0-9]*)$/.exec(currentChatName);
assert.ok(currentChatMatch, `registry.workflows.chatTurn has an unrecognised export name: ${currentChatName}`);
const currentChatVersion = Number(currentChatMatch[1]);
const currentPrompt = await import(`../workflows/chatTurn.v${currentChatVersion}.prompt.ts`);
const currentPromote = currentPrompt[`toTypedParts_v${currentChatVersion}`];
assert.equal(typeof currentPromote, "function", `${currentChatName}'s prompt module must export toTypedParts_v${currentChatVersion}`);

// The tool path reads its pools off the same global the supervisor injects at boot — the
// f-a6-pr2-freeform-db.test.mjs convention, reused rather than reinvented.
const priorPools = globalThis.__claraPools;
globalThis.__claraPools = { mintWakeCredentialObo, mintWakeCredentialClientObo, withFreeformRead: ff.withFreeformRead, withRuntime };

after(async () => {
  globalThis.__claraPools = priorPools;
  await endPools();
  await rig.endPool();
});

const READY = await rig
  .rootQuery(
    `select to_regclass('clara.agent_receipts_visible') is not null
        and to_regclass('clara.wake_fn_allowlist')      is not null
        and to_regclass('clara.firm_open_questions')    is not null
        and to_regclass('clara.close_proposals')        is not null as ok`,
  )
  .then((r) => r.rows[0]?.ok === true)
  .catch(() => false);
const skip = READY ? false : "P6-1: the Q8 hydrate surfaces (0103/0126/0131/0137/0138) are absent";

const AGENT_ROLES = ["clara_agent_ro", "clara_wake_interactive", "clara_wake_proactive", "clara_wake_bank", "clara_wake_filing", "clara_freeform_ro", "clara_runtime"];

test("p6-1.db.registry: v17 is the current pin and preserves v16's promotion behaviour", () => {
  assert.equal(currentChatName, "chatTurn_v17", "FS-7 succeeded P6-1 without widening the wire");
  // A bare text part exercises NO promotion arm at all (every version passes it through
  // unchanged) — this is the same three-item content array fs7-v17-chatturn.test.mjs's own
  // "fs7.v17.parts" cell builds, deliberately reused rather than re-typed, so a broken v17
  // freeform-read or refusal promotion arm reds THIS cell too, not only that one.
  const representative = [
    { type: "text", text: "I found the report context." },
    {
      type: "tool-result",
      toolCallId: "t-read",
      toolName: "read_books_freeform",
      output: { ok: true, read: { ok: true, outcome: "ok", read_id: 31 } },
    },
    {
      type: "tool-result",
      toolCallId: "t-refusal",
      toolName: "post_journal_entry",
      output: { ok: false, refusal: { type: "refusal", code: "CLR11", reason: "stale", message: "Refresh." } },
    },
  ];
  assert.deepEqual(currentPromote(representative), prompt16.toTypedParts_v16(representative));
});

test("p6-1.db.allowlist: freeform is OPEN to a chat credential; firm-question and close-proposal are NOT", { skip }, async () => {
  const r = await rig.rootQuery(
    `select function_name, array_agg(wake_kind order by wake_kind) as kinds
       from clara.wake_fn_allowlist
      where function_name in ('wake_freeform_read','wake_open_firm_question','wake_propose_close')
      group by function_name order by function_name`,
  );
  const byVerb = new Map(r.rows.map((x) => [x.function_name, x.kinds]));

  // THE CONTROL FIRST — without it the two assertions after it pass against an empty table.
  assert.deepEqual(
    byVerb.get("wake_freeform_read"),
    ["interactive", "interactive_client"],
    "the verb chatTurn_v16 DOES call is admitted to exactly the two interactive kinds a chat turn mints",
  );
  assert.deepEqual(byVerb.get("wake_open_firm_question"), ["filing"], "a firm question is the FILING lane's to open — no interactive kind is admitted");
  assert.deepEqual(byVerb.get("wake_propose_close"), ["close_prep"], "a close proposal is the close_prep lane's to make — no interactive kind is admitted");
});

test("p6-1.db.close: the ALLOWLIST is the wall, not the grant — the grant is genuinely permissive", { skip }, async () => {
  const r = await rig.rootQuery(
    `select has_function_privilege('clara_wake_interactive',
              'clara.wake_propose_close(uuid,jsonb,text,text,jsonb,text)','EXECUTE') as chat_role_can_execute`,
  );
  assert.equal(r.rows[0].chat_role_can_execute, true, "clara_wake_interactive CAN execute wake_propose_close — so a grant census would have reached the WRONG conclusion here");
  const g = await rig.rootQuery(
    `select p.proname,
            prosrc like '%assert_wake_allowed%' as asserts_kind
       from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='_close_wake_ctx'`,
  );
  assert.equal(g.rows.length, 1, "_close_wake_ctx resolves at exactly one body");
  assert.equal(g.rows[0].asserts_kind, true, "...and every close wrapper enters through it BECAUSE it calls assert_wake_allowed on the credential's own wake kind");
});

test("p6-1.db.firm-question: the door's EXECUTE is the filing role's alone, and its subject is p_question", { skip }, async () => {
  const r = await rig.rootQuery(
    `select r.rolname,
            has_function_privilege(r.rolname,
              'clara.wake_open_firm_question(uuid,text,text,jsonb,text,jsonb,text)','EXECUTE') as can_exec
       from pg_roles r where r.rolname = any($1) order by 1`,
    [AGENT_ROLES],
  );
  const can = r.rows.filter((x) => x.can_exec).map((x) => x.rolname);
  assert.deepEqual(can, ["clara_wake_filing"], "exactly one agent role may open a firm question, and it is not the chat lane's");

  const d = await rig.rootQuery(
    `select p.proname, pg_get_function_identity_arguments(p.oid) as args
       from pg_proc p where p.pronamespace='clara'::regnamespace
        and p.proname in ('resolve_firm_question','dismiss_firm_question') order by 1`,
  );
  assert.equal(d.rows.length, 2, "both human doors resolve, at exactly one signature each");
  for (const row of d.rows) {
    assert.match(row.args, /^p_question uuid/, `${row.proname}'s FIRST argument is the question id — which is why FirmQuestionPart carries that and nothing else`);
  }
});

test("p6-1.db.firm-question: the table has NO client_id column — the part's omission mirrors the schema", { skip }, async () => {
  const r = await rig.rootQuery(
    `select array_agg(attname order by attnum) as cols from pg_attribute
      where attrelid='clara.firm_open_questions'::regclass and attnum>0 and not attisdropped`,
  );
  const cols = r.rows[0].cols;
  assert.ok(!cols.includes("client_id"), "clara.firm_open_questions carries no client_id column at all (0103 D-11) — a part field would re-create the ambiguity the schema refused");
  assert.ok(cols.includes("named_client"), "control: it DOES carry named_client, the client a human names when they SETTLE it — so the absence above is a design, not a missing table");
  assert.ok(cols.includes("document_id"), "control: and document_id, which the card hydrates rather than copying");
});

test("p6-1.db.agent-receipt: the read surface is the HUMAN session's alone, and carries the 19-column address", { skip }, async () => {
  const r = await rig.rootQuery(
    `select r.rolname, has_table_privilege(r.rolname,'clara.agent_receipts_visible','select') as can_select
       from pg_roles r where r.rolname = any($1 || array['clara_authenticated']) order by 1`,
    [AGENT_ROLES],
  );
  const can = r.rows.filter((x) => x.can_select).map((x) => x.rolname);
  assert.deepEqual(can, ["clara_authenticated"], "only the human session reads agent receipts — no agent, wake, runtime or freeform role does, so chatTurn could not mint an agent_receipt card from a read of its own");

  const c = await rig.rootQuery(
    `select count(*)::int as mismatches
       from clara.agent_receipt_contract ct
       left join pg_attribute a
         on a.attrelid='clara.agent_receipts_visible'::regclass and a.attnum=ct.ordinal and not a.attisdropped
      where a.attname is distinct from ct.column_name
         or format_type(a.atttypid,a.atttypmod) is distinct from ct.data_type`,
  );
  assert.equal(c.rows[0].mismatches, 0, "the live view conforms to clara.agent_receipt_contract column for column");
  const addr = await rig.rootQuery(
    `select ordinal, column_name from clara.agent_receipt_contract where ordinal in (1,2,4) order by ordinal`,
  );
  assert.deepEqual(
    addr.rows.map((x) => x.column_name),
    ["receipt_kind", "receipt_id", "client_id"],
    "AgentReceiptPart's three fields ARE contract ordinals 1, 2 and 4 — the discriminator, the member PK as text, and the nullable client",
  );
});

test("p6-1.db.agent-receipt: receipt_kind's world is EXTEND-ONLY and has already outgrown 0103's seed", { skip }, async () => {
  // This is why AgentReceiptPart types `receipt_kind` as `string` rather than a union of
  // literals. 0103 seeded SEVEN kinds at :294-301; a union transcribed from that migration would
  // already be short, because later lanes insert their own rows. Measured, not argued — and the
  // cell reads the live table so it stays true as the estate grows, instead of pinning a number
  // that a future lane would have to come back and edit.
  const r = await rig.rootQuery(`select array_agg(receipt_kind order by receipt_kind) as kinds from clara.agent_receipt_surfaces`);
  const kinds = r.rows[0].kinds ?? [];
  for (const seeded of ["entry_post", "bank_agent", "agent_act", "report_agent", "freeform_read", "agent_filing", "web_fetch"]) {
    assert.ok(kinds.includes(seeded), `0103's own seeded kind '${seeded}' is still registered`);
  }
  assert.ok(
    kinds.length > 7,
    `the registry has grown past 0103's seven (live: ${kinds.length} — ${kinds.join(", ")}). If this ever goes red because a lane REMOVED a kind, that is the finding, not this cell.`,
  );
});

test("p6-1.db.close-proposal: the part's three fields are the settle door's subject plus the only fetch key", { skip }, async () => {
  const d = await rig.rootQuery(
    `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p
      where p.pronamespace='clara'::regnamespace and p.proname='settle_close_proposal'`,
  );
  assert.equal(d.rows.length, 1);
  assert.match(d.rows[0].args, /^p_proposal uuid/, "the settle door's subject is the proposal id");

  const c = await rig.rootQuery(
    `select attname, attnotnull from pg_attribute
      where attrelid='clara.close_proposals'::regclass and attname in ('id','close_run_id','client_id','state')
      order by attnum`,
  );
  const m = new Map(c.rows.map((x) => [x.attname, x.attnotnull]));
  for (const col of ["id", "close_run_id", "client_id"]) {
    assert.equal(m.get(col), true, `${col} is NOT NULL on the row — the part may carry it without inventing a nullable case`);
  }
  assert.equal(m.get("state"), true, "control: `state` is a real NOT NULL column too — it is omitted from the part by DESIGN (a settled proposal flips it under a card already on screen), not because it is missing");
});

test("p6-1.db.freeform: the receipt id is a bigint and the verb publishes it as read_id", { skip }, async () => {
  const r = await rig.rootQuery(
    `select format_type(atttypid,atttypmod) as typ from pg_attribute
      where attrelid='clara.freeform_read_log'::regclass and attname='id'`,
  );
  assert.equal(r.rows[0].typ, "bigint", "clara.freeform_read_log.id is a bigint — which is why FreeformResultPart renders read_id as text on the wire");
  const v = await rig.rootQuery(
    `select prosrc like '%''read_id'',%' as publishes from pg_proc
      where pronamespace='clara'::regnamespace and proname='wake_freeform_read'`,
  );
  assert.equal(v.rows.length, 1, "the verb resolves at exactly one body");
  assert.equal(v.rows[0].publishes, true, "and its result envelope carries read_id — the value toTypedParts_v16 promotes the card from");
});

// ==============================================================================================
// read_id PROVENANCE — the card's id comes from the DATABASE, never from the model's own rows.
// ==============================================================================================
//
// WHY THIS CELL EXISTS (Codex review, MEDIUM-2). The original pin searched `wake_freeform_read`'s
// prosrc for the SPELLING `'read_id'`. That is a projection of the thing, not the thing (review
// law 3): it would stay green if that key were later bound to a model-derived value, and the unit
// cells cannot help — they feed SYNTHETIC envelopes whose ids I chose. Constraint 2 is what is
// actually at stake: the model composes the SQL, so anything it can put in its own result rows is
// model-supplied, and a card addressing a receipt by a model-supplied id would let the model point
// a human at another read.
//
// THE INSTRUMENT: a REAL admitted read whose rows deliberately contain `999 AS read_id`. Two
// values then exist with the same name, one from each authority — the DB's receipt id at the
// envelope's top level, and the model's 999 nested under `rows`. The cell walks the WHOLE chain
// (verb -> tool wrapper -> toTypedParts_v16 -> card) and asserts the card carries the DB's and not
// the model's. A mutant binding the promotion to `rows[0].read_id` reds it.

const FREEFORM_READY = await rig
  .rootQuery("select to_regprocedure('clara.wake_freeform_read(text,text,uuid,text,int)') is not null as ok")
  .then((r) => r.rows[0]?.ok === true)
  .catch(() => false);
const skipFreeform = FREEFORM_READY ? false : "P6-1: the F-A6 freeform surface (0131) is absent";

/** A firm + a chat session + a LIVE turn — the three things TA-P4's turn binding needs. */
async function turnFixture(label) {
  const { owner, firm, client } = await rig.buildFirm(label);
  const session = await rig.createChatSession({ author: owner, client });
  const receipt = await rig.beginChatTurn({ session, author: owner });
  return { ctx: { firmId: firm, clientId: client, createdBy: owner, taskId: receipt.task_id } };
}

/** Drive the REAL tool wrapper, then the REAL promotion, exactly as a segment does. */
async function cardsFromRead(ctx, sql, purpose, seq, promote = currentPromote) {
  const out = await freeform15.runFreeformRead(ctx, { sql, purpose }, "gpt-5.6-terra", 0, seq);
  const parts = promote([
    { type: "tool-result", toolCallId: `tc-${seq}`, toolName: freeform15.FREEFORM_READ_TOOL, output: out },
  ]);
  return { out, parts, cards: parts.filter((p) => p.type === "freeform_result") };
}

test("p6-1.db.freeform.read-id-provenance: the card carries the DB's receipt id, NOT the model's own row", { skip: skipFreeform }, async () => {
  const { ctx } = await turnFixture("p61prov");
  // The rows deliberately carry a column NAMED read_id. If the promotion ever read the model's
  // rows instead of the verb's envelope, it would mint "999" and this cell would say so.
  const sql = "select 999 as read_id, count(*) as n from clara.journal_entries";
  const { out, cards } = await cardsFromRead(ctx, sql, "provenance probe: a row that calls itself read_id", 1);

  assert.equal(out.ok, true, `expected an ADMITTED read, got ${JSON.stringify(out).slice(0, 400)}`);
  assert.equal(cards.length, 1, "an admitted read mints exactly one card");

  // The control that makes the assertion below meaningful: the decoy really IS in the payload.
  assert.equal(Number(out.read.rows[0].read_id), 999, "control — the model's own row really does carry read_id = 999");

  const receipt = await rig.rootQuery(
    "select id from clara.freeform_read_log where op_key = $1",
    [freeform15.freeformOpKey(ctx.taskId, 0, 1)],
  );
  assert.equal(receipt.rows.length, 1, "exactly one receipt row was committed for this read");
  const dbId = String(receipt.rows[0].id);

  assert.equal(cards[0].read_id, dbId, "the card's read_id IS clara.freeform_read_log.id for this read");
  assert.notEqual(cards[0].read_id, "999", "...and is NOT the model-supplied row value of the same name");
  // Belt: the two are genuinely different values, so the equality above is not passing by luck.
  assert.notEqual(dbId, "999", "the receipt id and the decoy differ, so this cell can discriminate");
});

test("p6-1.db.freeform.read-id-provenance: a REFUSED read mints no card at all", { skip: skipFreeform }, async () => {
  const { ctx } = await turnFixture("p61refuse");
  // `clara.users` is enumerated but `pg_proc` is not — a relation outside the census is refused by
  // the DATABASE, which is the refusal path this arm exercises.
  const { out, parts, cards } = await cardsFromRead(ctx, "select 999 as read_id from pg_proc limit 1", "provenance probe: a refused read", 1);
  assert.equal(out.ok, false, `expected a REFUSED read, got ${JSON.stringify(out).slice(0, 400)}`);
  assert.equal(cards.length, 0, "a refused read mints no freeform_result — there is no receipt to address");
  assert.ok(
    parts.some((p) => p.type === "refusal"),
    "control — v15's own refusal arm still fires, so the zero above is a verdict rather than an empty promotion",
  );
});

test("p6-1.db.freeform.read-id-high-sequence: DB->wrapper loss is measured and fails closed", { skip: skipFreeform }, async (t) => {
  const { ctx } = await turnFixture("p61highseq");
  const highId = "9007199254740993"; // 2^53 + 1: the first odd bigint JS cannot represent.

  // Root-only rig setup: make the NEXT identity value exactly 2^53+1. This changes only the
  // throwaway sequence; the production body and every security mechanism remain untouched.
  await rig.rootQuery(
    "select setval(pg_get_serial_sequence('clara.freeform_read_log','id')::regclass,$1::bigint,true)",
    ["9007199254740992"],
  );

  let result;
  await assert.doesNotReject(async () => {
    result = await cardsFromRead(ctx, "select count(*) as n from clara.journal_entries", "high-sequence wire boundary", 1);
  }, "an unsafe JSON number omits the card without throwing the turn");

  const receipt = await rig.rootQuery(
    "select id from clara.freeform_read_log where op_key = $1",
    [freeform15.freeformOpKey(ctx.taskId, 0, 1)],
  );
  assert.equal(receipt.rows.length, 1, "the admitted read committed exactly one audit row");
  assert.equal(String(receipt.rows[0].id), highId, "the DB-owned receipt id is exactly 2^53+1");

  const wrapperId = result.out.read.read_id;
  assert.equal(typeof wrapperId, "number", "the current DB body emits a JSON number, so pg-types JSON.parse reaches the wrapper as number");
  assert.equal(Number.isSafeInteger(wrapperId), false, "that wrapper number is already unsafe and cannot identify the receipt honestly");
  assert.equal(result.cards.length, 0, "the current registry version emits NO card rather than a wrong id");

  // Mutation control: a promoter that stringified the already-rounded number would mint a card.
  // Run the cell's decisive assertion against that result and require it to red.
  const assertNoCard = (parts) => assert.equal(parts.filter((part) => part.type === "freeform_result").length, 0, "unsafe DB->wrapper numbers emit no card");
  assert.throws(
    () => assertNoCard([{ type: "freeform_result", read_id: String(wrapperId) }]),
    /unsafe DB->wrapper numbers emit no card/,
    "mutation control: stringify-an-unsafe-number is caught by this cell",
  );

  t.diagnostic(
    `receipt ${highId} reached the wrapper as unsafe JSON number ${String(wrapperId)}; ${currentChatName} omitted the card without throwing (DB text recut still owed)`,
  );
});
test("p6-1.db.stamp: no chatturn engine id is priced, so moving the stamp v15 -> v16 moves no cost line", { skip }, async () => {
  const r = await rig.rootQuery(
    `select count(*) filter (where engine_id like '%chatturn%')::int as chatturn_rows,
            count(*)::int as total_rows from clara.llm_price_table`,
  );
  assert.equal(r.rows[0].chatturn_rows, 0, "the chat lane is ALREADY unpriced at every version — 0110's own tripwire, not a regression this bump introduces");
  assert.ok(r.rows[0].total_rows > 0, "control: the price table is seeded, so the zero above is a measured absence rather than an empty table");
});
