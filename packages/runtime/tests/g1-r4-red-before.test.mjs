process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRuntime, buildFirm, endPool } from "./relay-fixtures.mjs";
import { buildBankPrereqs, buildBankAccount } from "./g1-wake-bank-fixtures.mjs";
import { ensureBankAgentDueEventType, eventsFor } from "./g1-producers-bank-agent-fixtures.mjs";

after(endPool);

test("RED R2-2: one DB statement subject cannot be re-emitted with a different runtime token", async () => {
  await ensureBankAgentDueEventType();
  const w = await buildFirm("g1-r4-red-r22");
  await buildBankPrereqs(w);
  const bank = await buildBankAccount(w, [1000], "r4-red");

  await asRuntime((c) => c.query(
    "select clara.emit_bank_agent_due($1,$2,$3,$4)",
    [w.client, bank.bankAccountId, "runtime-token-a", "unmatched_lines"],
  ));
  await asRuntime((c) => c.query(
    "select clara.emit_bank_agent_due($1,$2,$3,$4)",
    [w.client, bank.bankAccountId, "runtime-token-b", "unmatched_lines"],
  ));

  assert.equal((await eventsFor(bank.bankAccountId)).length, 1,
    "the door must derive one key from the statement subject; caller tokens cannot define occurrence identity");
});
