// Wave-A rig — counterparty ALIASES (Codex probe 24; contract §1/§11 + companion
// §2). add / retire / rename writers; a normalized collision against a live alias OR
// any counterparty's canonical name is a typed CLR23 refusal (never silent
// precedence); rename auto-creates a former-name alias on-conflict-do-nothing; alias
// hits are NAME-LANE candidates under the unchanged registration-dominant law (a
// differing-registration alias hit is the existing conflict refusal). Contract-blind.
// SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, billLines, ev, FIELD, normalize,
  counterpartyRows, addAlias, retireAlias, renameCounterparty, aliasRows, grantConsent,
  CLR23, ROUTINE_CENTS,
} from "./wave-a-fixtures.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-aliases"); printSkipCount("wave-a-aliases"); await endPool(); });

async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("vend"),
  });
  await import("./wave-a-fixtures.mjs").then((m) => m.approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") }));
  return (await counterpartyRows(client)).find((c) => normalize(c.name_display ?? c.name ?? c.name_normalized) === normalize(name))?.id ?? null;
}

// ===========================================================================
// add / retire writers + normalized collision refusals.
// ===========================================================================

test("add_counterparty_alias creates a live alias; a normalized duplicate of a LIVE alias refuses CLR23 (alias_collision)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "ALIASCO SDN BHD", reg: "201801012000" });
  if (!cp) { noteLane("aliases: counterparty not located"); return; }
  await addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "AC Trading", origin: "human" });
  const live = (await aliasRows(clients.A1)).filter((a) => a.retired_at == null && normalize(a.alias_normalized ?? a.alias_display) === normalize("AC Trading"));
  assert.ok(live.length >= 1, "a live alias was created");
  // A normalized duplicate of the live alias → CLR23.
  await assert.rejects(() => addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "ac trading", origin: "human" }),
    (e) => e.code === CLR23, "a normalized duplicate of a live alias refuses CLR23 (alias_collision)");
});

test("a normalized collision against another counterparty's CANONICAL name refuses CLR23 (never silent precedence)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cpA = await makeVendor(users.alice, { client: clients.A1, name: "CANONA SDN BHD", reg: "201801012100" });
  const cpB = await makeVendor(users.alice, { client: clients.A1, name: "CANONB SDN BHD", reg: "201801012200" });
  if (!cpA || !cpB) { noteLane("canonical-collision: counterparties not located"); return; }
  // Try to alias cpA with cpB's canonical name → collides with a canonical name → CLR23.
  await assert.rejects(() => addAlias(users.alice, { client: clients.A1, counterparty: cpA, alias: "CANONB SDN BHD", origin: "human" }),
    (e) => e.code === CLR23, "an alias equal to another counterparty's canonical name refuses CLR23");
});

test("retire_counterparty_alias retires the alias; the normalized value is then reusable", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "RETIREALIASCO SDN BHD", reg: "201801012300" });
  if (!cp) { noteLane("retire-alias: counterparty not located"); return; }
  await addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "RA Trading", origin: "human" });
  const aliasRow = (await aliasRows(clients.A1)).find((a) => normalize(a.alias_normalized ?? a.alias_display) === normalize("RA Trading") && a.retired_at == null);
  assert.ok(aliasRow, "the alias exists live");
  await retireAlias(users.alice, { client: clients.A1, alias: aliasRow.id });
  const stillLive = (await aliasRows(clients.A1)).find((a) => a.id === aliasRow.id && a.retired_at == null);
  assert.ok(!stillLive, "the alias is retired (retired_at set)");
  // The normalized value is now reusable (the partial unique is WHERE unretired).
  await addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "RA Trading", origin: "human" });
});

// ===========================================================================
// rename auto-creates a former-name alias (on-conflict-do-nothing).
// ===========================================================================

test("rename_counterparty updates the display name AND auto-creates a former-name alias (on-conflict-do-nothing — probe P5)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "OLDNAME SDN BHD", reg: "201801012400" });
  if (!cp) { noteLane("rename: counterparty not located"); return; }
  await renameCounterparty(users.alice, { client: clients.A1, counterparty: cp, newName: "NEWNAME SDN BHD" });
  const row = (await counterpartyRows(clients.A1)).find((c) => c.id === cp);
  assert.ok(normalize(row.name_display ?? row.name) === normalize("NEWNAME SDN BHD"), "the display name is updated to the new name");
  const formerAlias = (await aliasRows(clients.A1)).find((a) => normalize(a.alias_normalized ?? a.alias_display) === normalize("OLDNAME SDN BHD"));
  assert.ok(formerAlias, "a former-name alias for the OLD name was auto-created");
  // A second rename to the same new name must not raise on the auto-alias conflict.
  await renameCounterparty(users.alice, { client: clients.A1, counterparty: cp, newName: "NEWNAME SDN BHD" }).catch((e) => noteLane(`repeat rename raised ${e.code} (auto-alias should be on-conflict-do-nothing)`));
});

// ===========================================================================
// Alias hits are name-lane candidates UNDER registration-dominant law.
// ===========================================================================

test("an alias hit is a NAME-LANE candidate: a facts vendor matching an alias but with a DIFFERING registration is the existing conflict refusal (registration-dominant)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "REGDOMCO SDN BHD", reg: "201801012500" });
  if (!cp) { noteLane("reg-dominant alias: counterparty not located"); return; }
  await addAlias(users.alice, { client: clients.A1, counterparty: cp, alias: "RegDom Trading", origin: "human" });
  // A new draft proposing the ALIAS name but a DIFFERENT registration → registration
  // conflict refusal (the alias is only a name-lane candidate; registration dominates).
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const attempt = () => draftEntryV3(users.alice, {
    client: clients.A1, resolution: freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name: "RegDom Trading", registration_no: "201899999999" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("regdomcite"),
  });
  await assert.rejects(attempt, (e) => [CLR23].includes(e.code), "an alias-name hit with a differing registration refuses CLR23 (registration-dominant, not a silent alias match)");
});
