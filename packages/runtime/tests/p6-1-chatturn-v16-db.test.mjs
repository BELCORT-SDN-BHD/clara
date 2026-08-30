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

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";

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

test("p6-1.db.stamp: no chatturn engine id is priced, so moving the stamp v15 -> v16 moves no cost line", { skip }, async () => {
  const r = await rig.rootQuery(
    `select count(*) filter (where engine_id like '%chatturn%')::int as chatturn_rows,
            count(*)::int as total_rows from clara.llm_price_table`,
  );
  assert.equal(r.rows[0].chatturn_rows, 0, "the chat lane is ALREADY unpriced at every version — 0110's own tripwire, not a regression this bump introduces");
  assert.ok(r.rows[0].total_rows > 0, "control: the price table is seeded, so the zero above is a measured absence rather than an empty table");
});
