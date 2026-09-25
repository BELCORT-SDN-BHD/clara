// chatTurn_v22 · #985 — `read_opening_source` AGAINST A REAL DATABASE.
//
// The sibling file `chat-turn-v22-tools.test.mjs` proves the decisions (the schema, the walls, the
// refusal mapping) without a database. THIS file proves the one acceptance criterion that cannot
// be proved that way:
//
//   AC2 — "a successful read records the same targets, and reports the same recorded count, as the
//   browser action on the same basis."
//
// It is proved TWO ways, because the interesting half is the one a fresh-fixture comparison would
// miss: the tool and the browser route share ONE op key (`openingparse:<seed>:<document>`,
// `lib/opening-parse.mjs`'s `openingOpKey`), so a read of a basis the browser has already read is
// the SAME operation replayed, not a second one — and the tool has to report that replay's own
// recorded count rather than counting anything itself.
//
// AND IT DRIVES THE REAL TOOL, not a re-implementation: `globalThis.__claraPools` is the supervisor
// slot `pools()` reads (chatTurn.v13.infra.ts:61-65), so injecting `withRuntime` here runs
// `runReadOpeningSource` exactly as a chat turn runs it — its floor read, its client wall, its
// `reassert` guard and its door call all against this rig's own Postgres.
//
// Serial, RELAY_TEST_MODE, and it bootstraps NO Workflow World, so it leaves
// `packages/db/tests/rig-isolation.test.mjs` T10b green (#866).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { register } = await import("tsx/esm/api");
register();

import * as rig from "./rig.mjs";

const { parseOpeningTargets, openingOpKey } = await import("../lib/opening-parse.mjs");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");

const MODEL_TASK = "77777777-7777-4777-8777-777777777777";

/** The same readiness probe `tests/wave-b-opening-parse.test.mjs` uses: this lane's surface is
 *  0017's, and a rig without it declines rather than fails. */
async function openingReady() {
  try {
    const r = await rig.rootQuery(
      `select to_regprocedure('clara.record_opening_targets_parsed(uuid,jsonb,uuid,text)') is not null as parsed,
              to_regprocedure('clara.create_opening_seed(uuid,uuid,date,uuid,text,text)') is not null as seed,
              to_regprocedure('clara.begin_client_onboarding(text,text)') is not null as onb,
              to_regprocedure('clara.resolve_chat_principal(uuid)') is not null as principal,
              to_regprocedure('clara._seed_verified_document(uuid,uuid,text,text,text,bigint,text,uuid,integer,text,date,uuid)') is not null as doc`,
    );
    const o = r.rows[0];
    return o.parsed && o.seed && o.onb && o.doc && o.principal;
  } catch {
    return false;
  }
}

const READY = await openingReady();
const skip = READY ? false : "Wave-B (0017) opening surface absent";

/** THE POOL SLOT THE SUPERVISOR FILLS AT BOOT, filled here with this rig's runtime persona. The
 *  tool takes ONE connection for the whole act — floor read, seed read, re-assert and door call —
 *  exactly as `src/openingRoutes.ts` takes one for the browser. */
const priorPools = globalThis.__claraPools;
globalThis.__claraPools = { withRuntime: (fn) => rig.asRuntime(fn) };

after(async () => {
  globalThis.__claraPools = priorPools;
  await rig.endPool();
});

/** An onboarding client + plan + chart + verified filed opening_balance_doc + opening seed, with a
 *  done extraction carrying `opening_tb.line` regions. Lifted from
 *  `tests/wave-b-opening-parse.test.mjs`'s own fixture so both batteries read one shape. */
async function buildOpeningFixture(label, { regionTexts = null, owner = null, firm = null } = {}) {
  const built = owner && firm ? { owner, firm } : await rig.buildFirm(label);
  const onb = await rig.asHuman(built.owner, (c) =>
    c.query("select clara.begin_client_onboarding($1,$2) as r", [`${label}_onb_${randomUUID().slice(0, 6)}`, rig.opk("onb")]));
  const { client_id: client, plan_id: plan } = onb.rows[0].r;
  for (const [code, name, type] of [["1000", "Cash", "asset"], ["900-RE", "Retained earnings", "equity"], ["910-000", "Share capital", "equity"]]) {
    await rig.asHuman(built.owner, (c) => c.query("select clara.upsert_account($1,$2,$3,$4,$5,$6,$7) as r", [client, code, name, type, null, rig.opk("acct"), null]));
  }
  const sha = rig.sha(`${label}-${randomUUID()}`);
  const path = `firms/${built.firm}/docs/${sha}.pdf`;
  const doc = await rig.asRoot((c) =>
    c.query("select clara._seed_verified_document($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r",
      [built.firm, client, sha, "opening.pdf", "application/pdf", 2048, path, built.owner, 1, "opening_balance_doc", null, null]));
  const documentId = doc.rows[0].r.document_id;
  const seedRes = await rig.asHuman(built.owner, (c) =>
    c.query("select clara.create_opening_seed($1,$2,$3::date,$4,$5,$6) as r",
      [client, plan, "2026-01-01", documentId, sha, rig.opk("seed")]));
  const seed = seedRes.rows[0].r.seed_id;
  if (regionTexts) {
    const ext = await rig.asRoot((c) =>
      c.query("insert into clara.document_extractions(firm_id,document_id,engine_id,engine_kind,version_n,status,page_count) values ($1,$2,'rig-ocr:1','ocr',1,'done',1) returning id",
        [built.firm, documentId]));
    for (const text of regionTexts) {
      await rig.asRoot((c) =>
        c.query("insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content) values ($1,$2,'page_polygon','{\"page\":1}'::jsonb,'opening_tb.line',$3)",
          [built.firm, ext.rows[0].id, text]));
    }
  }
  return { owner: built.owner, firm: built.firm, client, plan, seed, documentId, sha };
}

const THREE_LINES = [
  "1000 Cash and bank RM 105,000.00 DR",
  "900-RE Retained earnings RM 65,747.97 CR",
  "910-000 Share capital RM 39,252.03 CR",
];

/** The targets a basis carries, as a comparable shape. */
async function targetsOf(seed) {
  const r = await rig.rootQuery(
    `select account_code, source_label, debit_cents, credit_cents, provenance_kind, document_id,
            (extraction_ref ->> 'region_id') is not null as cites_region
       from clara.opening_tb_targets where seed_id = $1 order by account_code`,
    [seed],
  );
  return r.rows;
}

const ctxFor = (fx, actor) => ({ firmId: fx.firm, clientId: fx.client, createdBy: actor ?? fx.owner, taskId: MODEL_TASK });

// ---------------------------------------------------------------------------
// AC2 — the same targets and the same recorded count as the browser action
// ---------------------------------------------------------------------------

test("985.db: the tool records what the BROWSER action records, on its own basis", { skip }, async () => {
  const browser = await buildOpeningFixture("p985-browser", { regionTexts: THREE_LINES });
  const chat = await buildOpeningFixture("p985-chat", { regionTexts: THREE_LINES });

  // the browser's road: the route core, on a clara_runtime connection, exactly as
  // `src/openingRoutes.ts` calls it.
  const viaBrowser = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: browser.seed, firmId: browser.firm }));
  assert.equal(viaBrowser.http, 202, JSON.stringify(viaBrowser.body));
  assert.equal(viaBrowser.body.lines, 3);

  // the chat's road: the REAL tool, through the pools slot.
  const viaChat = await v22Tools.runReadOpeningSource(ctxFor(chat), { client_id: chat.client, seed_id: chat.seed });
  assert.equal(viaChat.ok, true, JSON.stringify(viaChat));
  assert.equal(viaChat.status, "parsed");
  assert.equal(viaChat.lines, viaBrowser.body.lines, "the same recorded count");
  assert.equal(viaChat.seed_id, chat.seed);
  assert.equal(viaChat.client_id, chat.client);

  // and the SAME targets: three document-primary rows, each citing its own region.
  const [browserRows, chatRows] = [await targetsOf(browser.seed), await targetsOf(chat.seed)];
  assert.equal(chatRows.length, 3);
  assert.deepEqual(
    chatRows.map((r) => [r.account_code, r.source_label, r.debit_cents, r.credit_cents, r.provenance_kind, r.cites_region]),
    browserRows.map((r) => [r.account_code, r.source_label, r.debit_cents, r.credit_cents, r.provenance_kind, r.cites_region]),
    "one lane, one derivation: the chat's targets are the browser's, row for row",
  );
  for (const row of chatRows) {
    assert.equal(row.provenance_kind, "document");
    assert.equal(row.document_id, chat.documentId);
    assert.equal(row.cites_region, true, "every figure cites the region it was re-derived from");
  }
});

test("985.db: reading a basis the BROWSER already read is the SAME operation, replayed", { skip }, async () => {
  // The op key is `openingparse:<seed>:<document>` on BOTH roads, so the second read cannot mint a
  // second operation and cannot double the basis. The tool must report the replay's own recorded
  // count rather than counting the lines it sent.
  const fx = await buildOpeningFixture("p985-replay", { regionTexts: THREE_LINES });
  const first = await rig.asRuntime((c) => parseOpeningTargets(c, { seedId: fx.seed, firmId: fx.firm }));
  assert.equal(first.http, 202);

  const second = await v22Tools.runReadOpeningSource(ctxFor(fx), { client_id: fx.client, seed_id: fx.seed });
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.equal(second.lines, first.body.lines, "the replay reports the count the FIRST read recorded");

  const rows = await targetsOf(fx.seed);
  assert.equal(rows.length, 3, "and the basis was not doubled");
  const receipts = await rig.rootQuery(
    "select count(*)::int as n from clara.op_receipts where op_key = $1",
    [openingOpKey(fx.seed, fx.documentId)],
  );
  assert.equal(receipts.rows[0].n, 1, "ONE operation, reserved once and replayed");
});

// ---------------------------------------------------------------------------
// the walls, driven rather than described
// ---------------------------------------------------------------------------

test("985.db: a basis of ANOTHER client of the same firm is masked, and nothing is recorded", { skip }, async () => {
  const mine = await buildOpeningFixture("p985-mine", { regionTexts: THREE_LINES });
  // a SECOND client of the SAME firm, with its own basis and its own readable document
  const sibling = await buildOpeningFixture("p985-sibling", {
    regionTexts: THREE_LINES, owner: mine.owner, firm: mine.firm,
  });

  const out = await v22Tools.runReadOpeningSource(ctxFor(mine), { client_id: mine.client, seed_id: sibling.seed });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "opening_basis_not_found", "masked exactly as a basis that does not exist");
  assert.equal((await targetsOf(sibling.seed)).length, 0, "and the sibling's basis was not touched");
});

test("985.db: a VIEWER of the firm is refused the read the browser route also refuses them", { skip }, async () => {
  const fx = await buildOpeningFixture("p985-viewer", { regionTexts: THREE_LINES });
  const viewer = await rig.addMember(fx.owner, fx.firm, { role: "viewer", prefix: "p985v" });

  const out = await v22Tools.runReadOpeningSource(ctxFor(fx, viewer), { client_id: fx.client, seed_id: fx.seed });
  assert.equal(out.ok, false);
  assert.equal(out.code, "CLR04");
  assert.equal(out.reason, "insufficient_role", "the bookkeeper+ floor of src/openingRoutes.ts, on the chat lane");
  assert.equal((await targetsOf(fx.seed)).length, 0, "nothing was recorded for the person who could not ask");

  // CONTROL: the same basis, the same tool, the firm's OWNER — the refusal was the role, not the rig.
  const allowed = await v22Tools.runReadOpeningSource(ctxFor(fx), { client_id: fx.client, seed_id: fx.seed });
  assert.equal(allowed.ok, true, JSON.stringify(allowed));
  assert.equal((await targetsOf(fx.seed)).length, 3);
});

test("985.db: an unreadable row forfeits the WHOLE document, and the answer names the region", { skip }, async () => {
  // #985 AC3 end to end: the 422 the model is handed carries `namedUnparseableReason`'s own text,
  // with the failing region id in it, because that id is the only thing that tells a person which
  // row to go and look at.
  const fx = await buildOpeningFixture("p985-strict", {
    regionTexts: [THREE_LINES[0], "this row is not a TB line at all", THREE_LINES[1]],
  });
  const out = await v22Tools.runReadOpeningSource(ctxFor(fx), { client_id: fx.client, seed_id: fx.seed });
  assert.equal(out.ok, false);
  assert.equal(out.code, "unparseable");
  assert.match(out.reason, /^1 opening_tb\.line region\(s\) did not parse: /);
  assert.ok(out.message.includes(out.reason), "the door's own sentence, inside what the model is shown");
  const region = out.reason.split(": ")[1];
  assert.match(region, /^[0-9a-f-]{36}$/, "and it names the region by id");
  assert.equal((await targetsOf(fx.seed)).length, 0, "NOT ONE survivor target was authored");
});
