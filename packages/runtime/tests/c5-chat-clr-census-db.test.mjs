// FS-4 C-5 item 12 — the chat-turn route's CLR CENSUS, as a drift guard against the LIVE
// catalog.
//
// THE DEFECT THIS CLOSES (found by the chat-parity lane, PR #508). `chatRoutes.ts` mapped
// CLR14/CLR13/23505/CLR11/CLR04 and nothing else, so a six-attachment turn reached the caller as
// `{"error":"internal"}` with a 500 — an operator-visible incident for an ordinary client
// mistake.
//
// WHY THIS CELL READS THE CATALOG RATHER THAN LISTING CODES. A hand-written list of "the codes
// the doors raise" is a comment, and comments do not fail. The instrument here recomputes the
// reachable set from `prosrc` on every run, so the migration that adds the next code makes THIS
// cell red instead of shipping a 500 to a customer.
//
// IT INCLUDES THE TRIGGERS, AND THAT IS THE WHOLE FINDING ABOUT THE INSTRUMENT. A call-graph
// walk over `clara.begin_chat_turn`'s own prosrc finds NO called clara function — it names only
// two relations — so a census built that way reports five codes and misses the attachment wall
// entirely. The refusals that actually bite live in the TRIGGERS on `clara.chat_messages` and
// `clara.agent_tasks`, which no prosrc call-graph can see. The census below reads
// `pg_trigger` for exactly that reason.
//
// BOTH DIRECTIONS (裁-107b). A raised code missing from the map is a 500 waiting to happen; a
// mapped code nothing raises is a claim the code does not close. Both fail.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { register } from "tsx/esm/api";
import * as rig from "./rig.mjs";
import { cohortGate } from "./c5-cohort-gate.mjs";

register();
const { turnErrorStatus, TURN_MAPPED_CODES } = await import("../src/chatRoutes.ts");

const skip = await cohortGate(
  "the Slice-4 runtime core (0006)",
  "select to_regprocedure('clara.begin_chat_turn(uuid,uuid,text,jsonb,text)') is not null as ok",
);

after(async () => {
  await rig.endPool();
});

/** The relations `begin_chat_turn` writes. Their triggers are part of the door's refusal
 *  surface even though nothing in its prosrc names them as functions. */
const WRITTEN_RELATIONS = ["clara.chat_messages", "clara.agent_tasks"];
const RAISE_RE = /raise exception\s+'((?:[^']|'')*)'([\s\S]{0,300}?)errcode\s*=\s*'([A-Z0-9]+)'/g;

async function reachableCodes() {
  const door = await rig.rootQuery(
    `select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='begin_chat_turn'`,
  );
  const triggers = await rig.rootQuery(
    `select distinct p.oid::regprocedure::text as fn, p.prosrc
       from pg_trigger t join pg_proc p on p.oid=t.tgfoid
      where not t.tgisinternal and t.tgrelid::regclass::text = any($1::text[])`,
    [WRITTEN_RELATIONS],
  );
  const found = new Map();
  for (const row of [...door.rows, ...triggers.rows]) {
    for (const m of row.prosrc.matchAll(RAISE_RE)) {
      if (!found.has(m[3])) found.set(m[3], []);
      found.get(m[3]).push(m[1]);
    }
  }
  return found;
}

test("c5clr.1 every CLR code the turn doors can raise has a status — no catch-all", { skip }, async () => {
  const found = await reachableCodes();
  assert.ok(found.size >= 5, `the census found only ${found.size} codes — the instrument is not reading prosrc`);
  const unmapped = [...found.keys()].filter((code) => turnErrorStatus(code) === null);
  assert.deepEqual(
    unmapped,
    [],
    `these codes reach the turn route and fall through to a bare 500: ${unmapped
      .map((c) => `${c} (${found.get(c)[0]})`)
      .join("; ")}`,
  );
});

test("c5clr.2 CLR10 specifically — the reported defect, and its live raise sites", { skip }, async () => {
  const found = await reachableCodes();
  assert.ok(found.has("CLR10"), "CLR10 must be reachable — otherwise this cell has no subject");
  assert.equal(turnErrorStatus("CLR10"), 400);
  // The finding's own example, read off the live catalog rather than quoted from the report.
  const messages = found.get("CLR10");
  assert.ok(
    messages.some((m) => /at most five attachments/.test(m)),
    `the six-attachment refusal is not in the CLR10 census: ${JSON.stringify(messages)}`,
  );
});

test("c5clr.3 the map claims nothing it cannot reach, except the one stated fail-safe", { skip }, async () => {
  const found = await reachableCodes();
  // 23505 is PostgreSQL's own unique_violation, raised by an index rather than a RAISE, so it
  // never appears in a prosrc census — exempted here by name, not by a wildcard.
  const claimed = TURN_MAPPED_CODES.filter((c) => c !== "23505");
  const unreachable = claimed.filter((c) => !found.has(c));
  // CLR08 is the ONE deliberate over-claim, and it is stated in `chatRoutes.ts` as such: it is
  // raised only by UPDATE/DELETE/TRUNCATE triggers, and the admission path only INSERTs. It IS
  // in the trigger census (the triggers exist on these relations), so this list should be
  // empty; if a future migration removes those triggers, this cell says so rather than leaving
  // a dead mapping behind.
  assert.deepEqual(
    unreachable,
    [],
    `mapped but not reachable — either the mapping is dead or the census lost sight of it: ${unreachable.join(", ")}`,
  );
  assert.equal(turnErrorStatus("CLR99"), null, "an unknown code must fall through, never to a default status");
  assert.equal(turnErrorStatus(undefined), null);
});
