// #1000 — `read_client_financial_pack`, the chat half of the client home's money band.
//
// THE SECOND TOOL OF THE 2026-09-25 CUT, landed onto the SAME `chatTurn.v22.*` files #985 minted.
// It reads `clara.get_client_financial_pack`'s envelope — book cash and period profit over the
// approved ledger, each with its coverage, its six points and its comparison — through the wake
// wrapper 0320 added, and it computes NOTHING of its own, so it can never disagree with the
// client home about the same inputs.
//
// WHAT THIS FILE PROVES, cell by cell:
//
//   1. THE INPUT IS A CLIENT AND AT MOST TWO DATES (#1000's Key interfaces). `.strict()`, so a
//      figure, an account code or a bare month name is refused by validation rather than dropped.
//      A month that is not a first day, and an as-of in the future, are NOT refused here: they are
//      the READ'S OWN typed CLR10s and the tool exists to carry them, not to pre-empt them.
//   2. THE ENVELOPE TRAVELS WHOLE. The pack is handed to the model as the door returned it, key
//      for key — no re-derivation, no rounding, no summarising, no defaulting of a NULL to 0.
//   3. THE DOOR IS THE WAKE WRAPPER, by name and with named arguments, on the READ credential.
//   4. THE WALLS ARE THE CONVERSATION'S. A turn may not read a client the conversation is not
//      about, and a turn with no client pin has no money band to read.
//   5. EVERY REFUSAL REACHES THE MODEL AS THE READ'S OWN, code and reason, with the detail bag
//      under `details` — and the two states that are DATA stay data.
//   6. THE PROMPT SAYS SHE REPORTS THE PACK'S FIGURES AND NEVER RE-DERIVES ONE, and never calls a
//      missing cash set zero.
//
// NO DATABASE IS NEEDED HERE: every cell is over pure functions, module constants and source
// text, with the pool seam injected. The DB-backed half — the same envelope as the client home's
// own read, through the real pool slot against real Postgres — is
// `tests/chat-turn-v22-financial-pack-db.test.mjs`.

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

/** A pack envelope in the door's OWN shape, trimmed to the keys a cell reads. Values are
 *  deliberately awkward — a NULL cash figure beside a real profit — because that is the shape the
 *  tool must not tidy up. */
const PACK = Object.freeze({
  computed_at: "2026-03-31T09:00:00.000Z",
  client_id: CTX.clientId,
  period: { start: "2026-03-01", end: "2026-03-31", as_of: "2026-03-31", month: "2026-03-01", is_mtd: false, timezone: "Asia/Kuala_Lumpur" },
  coverage_floor: "2026-01-01",
  cash: { value_cents: null, status: "unknown", unit: "minor_units", currency: "MYR", coverage: "unknown", coverage_reason: "cash_set_unpublished", set: null, points: [], composition: [] },
  profit: { value_cents: -30000, status: "ok", unit: "minor_units", currency: "MYR", coverage: "ok", coverage_reason: null, composition: [] },
  income: { value_cents: 120000, status: "ok" },
  expense: { value_cents: 150000, status: "ok" },
  series: [{ month: "2026-03-01", income_cents: 120000, expense_cents: 150000, profit_cents: -30000, partial: false }],
  unmarked_closing_entries: 0,
  excluded_by_design: ["receivable", "payable", "statement_balance"],
});

/** Install a pools double that records what the tool asked the database for. `readScoped` is the
 *  seam: it mints an OBO credential and runs on the read pool, and this stands in for both. */
function withPools(handler) {
  const calls = [];
  globalThis.__claraPools = {
    mintWakeCredentialObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredential: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    mintWakeCredentialClientObo: async () => ({ credentialId: "cred", secret: "s3cr3t" }),
    withReadWakeScoped: async (secret, fn) => fn({
      query: async (sql, params) => {
        calls.push({ sql, params, secret });
        return handler(sql, params);
      },
    }),
    withWriteWakeScoped: async (secret, fn) => fn({ query: async () => { throw new Error("the money band is a READ"); } }),
    withRuntime: async (fn) => fn({ query: async () => { throw new Error("the money band does not run on the act credential"); } }),
  };
  return calls;
}

/** A thrown Postgres error in node-postgres's own shape. */
function pgError(code, message, detail) {
  return Object.assign(new Error(message), { code, detail: detail === undefined ? undefined : JSON.stringify(detail) });
}

const run = (input, ctx = CTX) => v22Tools.runReadClientFinancialPack(ctx, input);

/** The file's CODE with its comments removed — the v22 battery's own reader, for the same reason:
 *  a source pin that reads comments is not a source pin. */
function codeOf(url) {
  return readFileSync(url, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
}
const TOOLS_SRC = codeOf(new URL("../workflows/chatTurn.v22.tools.ts", import.meta.url));

// ---------------------------------------------------------------------------
// 1 · the input
// ---------------------------------------------------------------------------

test("v22.pack: the input is `.strict()` — a client, and at most an as-of and one named month", () => {
  const S = v22Tools.readClientFinancialPackInputSchema;
  assert.ok(S.safeParse({ client_id: CTX.clientId }).success, "a client alone is month-to-date");
  assert.ok(S.safeParse({ client_id: CTX.clientId, month: "2026-03-01" }).success);
  assert.ok(S.safeParse({ client_id: CTX.clientId, as_of: "2026-03-17" }).success);
  assert.ok(S.safeParse({ client_id: CTX.clientId, month: "2026-03-01", as_of: "2026-03-17" }).success);

  // NOTHING A FIGURE COULD RIDE IN ON. Each of these is refused rather than ignored: a dropped
  // key is how "I read the money band" becomes a number nobody computed.
  for (const extra of [
    { value_cents: 1000 }, { cash_cents: 1000 }, { account_code: "1010" },
    { cash_account_set_version_id: "11111111-1111-4111-8111-111111111111" },
    { firm_id: CTX.firmId }, { currency: "MYR" }, { limit: 5 },
  ]) {
    const r = S.safeParse({ client_id: CTX.clientId, ...extra });
    assert.equal(r.success, false, `${Object.keys(extra)[0]} was accepted`);
  }
  // A client is required and is a uuid.
  assert.equal(S.safeParse({}).success, false);
  assert.equal(S.safeParse({ client_id: "the one we talked about" }).success, false);
  // The two dates are CALENDAR DAYS in the wire shape the door takes.
  for (const bad of ["March 2026", "2026-3-1", "2026-03-01T00:00:00Z", "01/03/2026", ""]) {
    assert.equal(S.safeParse({ client_id: CTX.clientId, month: bad }).success, false, `month ${bad}`);
    assert.equal(S.safeParse({ client_id: CTX.clientId, as_of: bad }).success, false, `as_of ${bad}`);
  }
});

test("v22.pack: a month that is not a first day, and an as-of in the future, are NOT refused here — they are the READ'S OWN typed refusals", () => {
  const S = v22Tools.readClientFinancialPackInputSchema;
  // #1000 AC2 asks for the read's own CLR10s to reach the model. Validating these locally would
  // answer a different refusal in a different vocabulary, from a body that has not seen the
  // client's book day — `as_of_in_future` is a question about `clara.book_today()`, not about the
  // calendar this process happens to run on.
  assert.ok(S.safeParse({ client_id: CTX.clientId, month: "2026-03-17" }).success);
  assert.ok(S.safeParse({ client_id: CTX.clientId, as_of: "2999-01-01" }).success);
  assert.ok(!/month_not_first_day|as_of_in_future|as_of_outside_month/.test(TOOLS_SRC.split("READ_CLIENT_FINANCIAL_PACK_TOOL")[0] ?? ""),
    "the tool must not pre-empt the door's own date refusals");
});

// ---------------------------------------------------------------------------
// 2 · the door, and the envelope that comes back through it
// ---------------------------------------------------------------------------

test("v22.pack: the door is clara.wake_get_client_financial_pack, called by NAMED arguments on the READ credential", async () => {
  const calls = withPools(() => ({ rows: [{ pack: PACK }], rowCount: 1 }));
  const out = await run({ client_id: CTX.clientId, month: "2026-03-01", as_of: "2026-03-17" });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1, "one read, one call");
  const { sql, params } = calls[0];
  assert.match(sql, /clara\.wake_get_client_financial_pack\s*\(/, "the model lane's own wrapper, never the human door");
  assert.ok(!/\bclara\.get_client_financial_pack\b/.test(sql), "the human door is closed to this lane");
  assert.ok(!/_client_financial_pack_core/.test(sql), "the ungranted core is reached by nobody");
  // NAMED ARGUMENTS, the #660 family's own call convention: a divergence in a parameter name is a
  // real finding rather than a silent positional mismatch.
  assert.match(sql, /p_client\s*=>/);
  assert.match(sql, /p_as_of\s*=>/);
  assert.match(sql, /p_month\s*=>/);
  assert.deepEqual(params, [CTX.clientId, "2026-03-17", "2026-03-01"]);
});

test("v22.pack: month-to-date is the ABSENCE of a month, and an omitted as-of is null — never a date this process made up", async () => {
  const calls = withPools(() => ({ rows: [{ pack: PACK }], rowCount: 1 }));
  await run({ client_id: CTX.clientId });
  assert.deepEqual(calls[0].params, [CTX.clientId, null, null],
    "a defaulted `today` here would be this host's calendar, not the client's book day");
});

test("v22.pack: the envelope travels WHOLE — key for key, NULL for NULL, and nothing is re-derived", async () => {
  withPools(() => ({ rows: [{ pack: PACK }], rowCount: 1 }));
  const out = await run({ client_id: CTX.clientId, month: "2026-03-01" });
  assert.equal(out.ok, true);
  assert.equal(out.status, "read");
  assert.deepEqual(out.pack, PACK, "the pack is the door's own object, not a projection of it");
  // THE TWO WAYS A TOOL SILENTLY LIES ABOUT MONEY, both refused by the cell above and named here
  // so a later editor knows they are the point: a NULL cash figure must not become 0, and a
  // figure must not be recomputed from the parts (income - expense) when the door already said it.
  assert.equal(out.pack.cash.value_cents, null);
  assert.equal(out.pack.cash.coverage_reason, "cash_set_unpublished");
  assert.equal(out.pack.profit.value_cents, -30000);
});

// ---------------------------------------------------------------------------
// 3 · the walls the conversation carries
// ---------------------------------------------------------------------------

test("v22.pack: a turn may not read a client the conversation is not about, and a turn with no client pin has no money band at all", async () => {
  const calls = withPools(() => ({ rows: [{ pack: PACK }], rowCount: 1 }));
  const other = await run({ client_id: "99999999-9999-4999-8999-999999999999" });
  assert.equal(other.ok, false);
  assert.equal(other.code, "CLR03");
  assert.equal(other.reason, "client_not_in_conversation");
  const unpinned = await run({ client_id: CTX.clientId }, { ...CTX, clientId: null });
  assert.equal(unpinned.ok, false);
  assert.equal(unpinned.code, "CLR03");
  assert.equal(unpinned.reason, "client_financial_pack_needs_client_pin");
  assert.equal(calls.length, 0, "neither wall may reach the database at all");
});

// ---------------------------------------------------------------------------
// 4 · the refusals — the read's own, in the read's own words
// ---------------------------------------------------------------------------

test("v22.pack: the READ'S OWN CLR10s reach the model with their code, their reason and their whole detail bag — #1000 AC2", async () => {
  const cases = [
    ["month_not_first_day", { reason: "month_not_first_day", month: "2026-03-17" }],
    ["as_of_in_future", { reason: "as_of_in_future", as_of: "2999-01-01", today: "2026-03-31" }],
    ["as_of_outside_month", { reason: "as_of_outside_month", as_of: "2026-05-01", month: "2026-03-01" }],
    ["invalid_client", { reason: "invalid_client" }],
  ];
  for (const [reason, detail] of cases) {
    withPools(() => { throw pgError("CLR10", "the door said so", detail); });
    const out = await run({ client_id: CTX.clientId });
    assert.equal(out.ok, false, `${reason}: answered as a success`);
    assert.equal(out.code, "CLR10", `${reason}: the door's own code`);
    assert.equal(out.reason, reason, `${reason}: the door's own reason`);
    // THE WHOLE BAG, not a chosen key: the dates the door names are the only thing that tells the
    // person what to ask for instead.
    for (const [k, v] of Object.entries(detail)) {
      assert.equal(out.details[k], v, `${reason}: detail.${k} did not travel`);
    }
    assert.ok(out.message.length > 0 && !out.message.includes(reason),
      `${reason}: the model is handed a machine word instead of a sentence`);
  }
});

test("v22.pack: the wake ceremony's refusals are authority refusals, and the one that means a person lost their standing says so", async () => {
  // (a) the credential itself — expired, revoked, or the kind not allowlisted for this door.
  withPools(() => { throw pgError("CLR03", "no valid wake credential"); });
  const noCred = await run({ client_id: CTX.clientId });
  assert.equal(noCred.ok, false);
  assert.equal(noCred.code, "CLR03");
  assert.equal(noCred.reason, "wake_credential_unavailable");

  // (b) a credential that names no person. This read rides a named human's authority.
  withPools(() => { throw pgError("CLR03", "names none", { reason: "wake_authority_absent", class: "on_behalf_of" }); });
  const unattended = await run({ client_id: CTX.clientId });
  assert.equal(unattended.code, "CLR03");
  assert.equal(unattended.reason, "wake_authority_absent");

  // (c) THE ONE THAT IS ABOUT A PERSON RATHER THAN A CREDENTIAL. `clara.mint_wake_credential`
  //     refuses to mint for somebody who is not an active bookkeeper+ of the firm, with #630's own
  //     typed word. It happens BEFORE the door is reached, so the read never answers here — and the
  //     model is told the truth about why, in the chat lane's authority code.
  withPools(() => { throw pgError("CLR10", "on_behalf_of must be an active bookkeeper+ of the firm", { reason: "authority_lost" }); });
  const lost = await run({ client_id: CTX.clientId });
  assert.equal(lost.ok, false);
  assert.equal(lost.code, "CLR04");
  assert.equal(lost.reason, "authority_lost");
  assert.match(lost.message, /bookkeeper/i, "the floor the person has to clear is named");
});

test("v22.pack: an unclassified failure is a FAULT in this lane's own words — never a refusal dressed in the estate's vocabulary", async () => {
  for (const err of [
    pgError("57014", "canceling statement due to statement timeout"),
    pgError("42883", "function clara.wake_get_client_financial_pack(uuid, date, date) does not exist"),
    new Error("connection terminated unexpectedly"),
  ]) {
    withPools(() => { throw err; });
    const out = await run({ client_id: CTX.clientId });
    assert.equal(out.ok, false);
    assert.equal(out.code, "internal");
    assert.equal(out.reason, null, "a fault names no governed reason, because it reached no judgement");
    assert.deepEqual(out.details, {});
    assert.ok(!/timeout|does not exist|connection/i.test(out.message),
      "a driver's words are not something to tell a professional");
  }
});

test("v22.pack: the mapping is a pure function a reviewer can drive, and it never invents a code the door did not state", () => {
  const map = v22Tools.clientFinancialPackRefusal;
  // Carried: the door's own code, verbatim, including one this lane cannot reach today (the
  // credential client pin, dormant while `interactive` is the only allowlisted kind).
  assert.equal(map(pgError("CLR11", "pinned elsewhere", { reason: "credential_client_pin" })).code, "CLR11");
  assert.equal(map(pgError("CLR11", "pinned elsewhere", { reason: "credential_client_pin" })).reason, "credential_client_pin");
  // A CLR the door can raise but this lane has no sentence for still keeps its own code and
  // reason — the refusal says which refusal it was rather than inventing a description.
  const unknown = map(pgError("CLR10", "something new", { reason: "a_reason_written_later" }));
  assert.equal(unknown.code, "CLR10");
  assert.equal(unknown.reason, "a_reason_written_later");
  assert.match(unknown.message, /a_reason_written_later/, "an unknown reason is NAMED rather than swallowed");
  // A malformed detail is not a crash and not a silent null: the code still travels.
  const garbled = Object.assign(new Error("x"), { code: "CLR10", detail: "{not json" });
  assert.equal(map(garbled).code, "CLR10");
  assert.equal(map(garbled).reason, null);
});

// ---------------------------------------------------------------------------
// 5 · the prompt
// ---------------------------------------------------------------------------

test("v22.pack: the stanza says she reports the pack's own figures, re-derives none, and never calls a missing cash set zero", () => {
  const g = v22Prompt.CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE;
  assert.match(g, /read_client_financial_pack/);
  // THE TWO SENTENCES #1000's contract asks for, and they are the two ways this tool could be
  // made to lie: a figure Clara worked out, and an empty figure read as nothing.
  assert.match(g, /never work (one|a figure) out|do not work (it|one) out|never calculate/i);
  assert.match(g, /not zero|never zero|is not (RM ?)?0|nobody has said which accounts are cash/i);
  // the unit is minor units and the currency is on the envelope — a figure without them is a
  // number, not money
  assert.match(g, /cent|minor unit/i);
  // coverage is part of the answer rather than a footnote
  assert.match(g, /coverage|partial/i);
  // it offers nothing this body cannot do: there is no chat path that publishes a cash set
  assert.ok(!/publish_client_cash_account_set|propose_client_cash_accounts/.test(g),
    "the stanza must not name a door this body does not carry");
});

test("v22.pack: SYSTEM_PROMPT_V22 is v21's text plus the cut's stanzas, in the order they were added, byte for byte", () => {
  const p = v22Prompt.SYSTEM_PROMPT_V22;
  assert.ok(p.includes(v22Prompt.OPENING_SOURCE_CHAT_GUIDANCE), "#985's stanza is still there, whole");
  assert.ok(p.includes(v22Prompt.CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE), "#1000's stanza is there, whole");
  assert.ok(
    p.indexOf(v22Prompt.OPENING_SOURCE_CHAT_GUIDANCE) < p.indexOf(v22Prompt.CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE),
    "each ticket APPENDS its own stanza; it does not reorder the ones before it",
  );
  // EVERY TICKET OF THIS LANE APPENDS ITS OWN, and this list is the second place that is
  // enumerated (the first is `chat-turn-v22-tools.test.mjs`'s own census). Two cells asserting the
  // same composition is deliberate: this one is read by whoever is working the money band, that one
  // by whoever is working the roster, and a stanza can arrive unnoticed in neither.
  assert.equal(
    p,
    `${v22Prompt.SYSTEM_PROMPT_V21}\n\n${v22Prompt.OPENING_SOURCE_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.CLIENT_FINANCIAL_PACK_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.TRADE_INVOICE_V22_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.OPENING_REFRESH_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.CLAIM_ALLOCATIONS_V22_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.ACCRUAL_V22_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.SCHEDULES_V22_CHAT_GUIDANCE}`
    + `\n\n${v22Prompt.PAYROLL_FACT_STATE_CHAT_GUIDANCE}`,
    "the whole prompt is v21 plus exactly this cut's exported stanzas, with nothing written inline",
  );
});
