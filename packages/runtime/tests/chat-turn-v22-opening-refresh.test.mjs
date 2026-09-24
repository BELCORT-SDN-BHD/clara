// chatTurn_v22 — roster entry A3 (#986), `refresh_opening_source`.
//
// A SECOND TOOL BESIDE #985'S READ, NOT A FLAG ON IT. #986's contract says why in one sentence:
// "a model that could pass `{force: true}` to the read would be able to retire a basis's targets
// by accident". Reading again and refreshing are different acts with different keys, different
// receipts and different news.
//
// THIS IS ALSO THE MATCHED PAIR §1.10 REQUIRES. #985's "read again since last parse" mapping is
// UNCHANGED — the read still answers `409 {status:'conflict', reason:'source_reread_since_parse'}`
// — and only the GUIDANCE beside it moves, from describing a dead end to naming the tool that is
// the way on. Both halves are asserted here, because "unchanged" is a claim a cell has to make.
//
// WHAT THIS FILE PROVES:
//   1. The input is TWO UUIDS and `.strict()`: no document id, no extraction id, no amount.
//   2. BOTH NUMBERS are reported. A refresh that recorded 9 and retired 3 is not "9 lines read".
//   3. Every refusal of #986's eight-row table reaches the model with its own reason, and the
//      three that are CLR31 keep their code.
//   4. The door is the ROUTE CORE, never the writer: `refreshOpeningTargets(client, {seedId,
//      firmId, reassert})`, which mints `openingRefreshOpKey` and calls the SQL door itself.
//   5. The read's own reread refusal now NAMES this tool, and the read is still refused.
//
// NO DATABASE IS NEEDED HERE.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { register } = await import("tsx/esm/api");
register();

const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const SEED = "55555555-5555-4555-8555-555555555555";

function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

// ---------------------------------------------------------------------------
// 1 · the input
// ---------------------------------------------------------------------------

test("v22.refresh: the input is `.strict()` and carries ONLY client_id and seed_id", () => {
  const ok = { client_id: CTX.clientId, seed_id: SEED };
  assert.equal(v22Tools.refreshOpeningSourceInputSchema.safeParse(ok).success, true);
  assert.deepEqual(Object.keys(v22Tools.refreshOpeningSourceInputSchema.shape).sort(),
    ["client_id", "seed_id"]);
  // #986's contract, verbatim: "no document id and no extraction id — the tied document and the
  // authoritative reading are both resolved server-side".
  for (const invented of ["document_id", "extraction_id", "amount_cents", "account_code", "force"]) {
    assert.equal(
      v22Tools.refreshOpeningSourceInputSchema.safeParse({ ...ok, [invented]: "x" }).success,
      false,
      invented,
    );
  }
});

test("v22.refresh: it is a SECOND tool, never a flag on the read", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built[v22Tools.REFRESH_OPENING_SOURCE_TOOL], "the refresh act has its own name");
  assert.equal(v22Tools.REFRESH_OPENING_SOURCE_TOOL, "refresh_opening_source");
  // and the read gained no flag that could retire a basis's targets by accident
  assert.deepEqual(Object.keys(v22Tools.readOpeningSourceInputSchema.shape).sort(),
    ["client_id", "seed_id"]);
});

// ---------------------------------------------------------------------------
// 2 · the answer — BOTH numbers, and neither invented
// ---------------------------------------------------------------------------

test("v22.refresh: a 202 reports the lines recorded AND the lines retired", () => {
  const out = v22Tools.openingRefreshOutcome(
    { http: 202, body: { status: "refreshed", lines: 9, retired: 3 } },
    { seedId: SEED, clientId: CTX.clientId },
  );
  assert.equal(out.ok, true);
  assert.equal(out.status, "refreshed");
  assert.equal(out.lines, 9);
  assert.equal(out.retired, 3, "#986: report BOTH numbers — the retired count is the news");
});

test("v22.refresh: a receipt missing either count is a FAULT, never a zero", () => {
  // The same ADV-08 rule the core itself applies one door down: `Number(undefined)` is NaN and
  // `Number(null)` is 0, so a lenient read would report an act that recorded nothing as
  // "0 lines recorded, 0 retired".
  for (const body of [
    { status: "refreshed", retired: 3 },
    { status: "refreshed", lines: 9 },
    { status: "refreshed", lines: null, retired: 0 },
  ]) {
    const out = v22Tools.openingRefreshOutcome({ http: 202, body }, { seedId: SEED, clientId: CTX.clientId });
    assert.equal(out.ok, false, JSON.stringify(body));
    assert.equal(out.code, "internal");
  }
});

// ---------------------------------------------------------------------------
// 3 · the eight-row refusal table, verbatim
// ---------------------------------------------------------------------------

test("v22.refresh: each refusal of #986's table reaches the model with its OWN reason", () => {
  const table = [
    { http: 409, body: { status: "refused", code: "CLR31", reason: "no_reread_to_refresh" } },
    { http: 409, body: { status: "refused", code: "CLR31", reason: "stale_extraction_version" } },
    { http: 409, body: { status: "refused", code: "CLR31", reason: "refresh_extraction_mixed" } },
    { http: 409, body: { status: "conflict", reason: "registry_not_open" } },
    { http: 409, body: { status: "refused", code: "CLR02", reason: "tie_document_mismatch" } },
    { http: 409, body: { status: "refused", code: "CLR28", reason: "consent_not_given" } },
    { http: 422, body: { status: "unparseable", reason: "row_amount_unreadable", failing_region_ids: ["r1"] } },
    { http: 404, body: { error: "not_found", message: "not found" } },
  ];
  for (const answer of table) {
    const out = v22Tools.openingRefreshOutcome(answer, { seedId: SEED, clientId: CTX.clientId });
    assert.equal(out.ok, false, JSON.stringify(answer.body));
    if (answer.body.reason) {
      assert.equal(out.reason, answer.body.reason, "the token is never replaced by a generic message");
    }
    if (answer.body.code) assert.equal(out.code, answer.body.code, "the CLR code is the door's own");
    // and the whole body travels under details, so nothing the core said is dropped on the way
    for (const key of Object.keys(answer.body)) {
      if (key === "status") continue;
      assert.ok(Object.prototype.hasOwnProperty.call(out.details, key), `${key} survives`);
    }
  }
});

test("v22.refresh: `no_reread_to_refresh` says somebody already did it, not that it failed", () => {
  const out = v22Tools.openingRefreshOutcome(
    { http: 409, body: { status: "refused", code: "CLR31", reason: "no_reread_to_refresh" } },
    { seedId: SEED, clientId: CTX.clientId },
  );
  assert.match(out.message, /nothing to refresh|already/i);
  assert.ok(!/try again/i.test(out.message + String(out.fix ?? "")),
    "the same call answers the same way: a retry is not the act");
});

// ---------------------------------------------------------------------------
// 4 · the door is the core
// ---------------------------------------------------------------------------

test("v22.refresh: the door is the route core, with #986's argument order", () => {
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  assert.match(src, /refreshOpeningTargetsTyped\(c, \{ seedId: input\.seed_id, firmId: ctx\.firmId, reassert \}\)/);
  assert.ok(!/refresh_opening_targets_from_reread/.test(src),
    "the audited writer is reached ONLY through the core, which mints the op key");
});

test("v22.refresh: the bookkeeper+ floor is the read's own, not a looser one", () => {
  // The standing owner ruling: access control is never loosened. Retiring a basis's targets is
  // strictly more than reading into it, so it stands on the same floor and no lower.
  const viewer = v22Tools.openingFloorRefusal({ firmId: CTX.firmId, role: "viewer" }, CTX.firmId);
  assert.equal(viewer.reason, "insufficient_role");
  const src = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));
  const refresh = src.slice(src.indexOf("export async function runRefreshOpeningSource"));
  assert.match(refresh, /openingFloorRefusal\(await liveChatPrincipal\(c, ctx\.createdBy\), ctx\.firmId\)/);
});

// ---------------------------------------------------------------------------
// 5 · the matched pair — #985's mapping unchanged, its guidance moved
// ---------------------------------------------------------------------------

test("v22.refresh: the READ's reread refusal is UNCHANGED and now names the refresh tool", () => {
  const reread = v22Tools.openingSourceOutcome(
    { http: 409, body: { status: "conflict", reason: "source_reread_since_parse" } },
    { seedId: SEED, clientId: CTX.clientId },
  );
  // UNCHANGED: still a refusal, still that token, still not a retry.
  assert.equal(reread.ok, false);
  assert.equal(reread.reason, "source_reread_since_parse");
  assert.match(reread.message, /read again since/i);
  // MOVED: the act beside it is now a tool the model actually has.
  assert.match(reread.fix, /refresh_opening_source/);
});

test("v22.refresh: the stanza tells the model not to retry the read", () => {
  const g = v22Prompt.OPENING_REFRESH_CHAT_GUIDANCE;
  assert.match(g, /do not retry the read/i);
  assert.match(g, /refresh_opening_source/);
  assert.match(g, /two figures|both/i, "#986: report the two figures it returns");
  assert.match(g, /never a figure you inferred|never a figure you did not/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(g));
});
