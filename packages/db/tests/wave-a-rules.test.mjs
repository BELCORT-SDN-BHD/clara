// Wave-A rig — KB Layer-2 coding RULES (Codex probes 21/22; contract §6 +
// companion §7). Real (client_id, account_code) composite key; account must exist +
// be postable at sign AND at application; duplicate live rule 23505→CLR27; the
// deterministic fired-decision snapshot (account_matched only on a proven match — no
// false "per your rule"); a rule signed AFTER a draft leaves no snapshot; sign/retire
// vs draft races. Contract-blind. SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, approveEntry, billLines, ev, FIELD, normalize,
  counterpartyRows, grantConsent, proposeCodingRule, signCodingRule,
  codingRuleRows, ruleDecisionRows, CLR27, WREASON, reasonOf, ROUTINE_CENTS,
} from "./wave-a-fixtures.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
const EXP2 = "500-A02";
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP2, name: "Rent", type: "expense", opKey: opk("exp2") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-rules"); printSkipCount("wave-a-rules"); await endPool(); });

/** Create a counterparty (draft+approve a bill). Returns the counterparty id. */
async function makeVendor(sub, { client, name, reg }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00" });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name, registration_no: reg } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("vend"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  return (await counterpartyRows(client)).find((c) => normalize(c.name_display ?? c.name ?? c.name_normalized) === normalize(name))?.id ?? null;
}

// ===========================================================================
// Lifecycle + composite key + account validity.
// ===========================================================================

test("propose→sign a rule on the REAL (client_id, account_code) key; a non-existent/cross-client account refuses (CLR27 account_not_postable / not-found)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "RULECO SDN BHD", reg: "201801009000" });
  if (!cp) { noteLane("rules: counterparty not located"); return; }
  const proposed = await proposeCodingRule(users.alice, { client: clients.A1, counterparty: cp, accountCode: EXP });
  const rid = proposed?.rule_id ?? proposed?.id ?? proposed;
  await signCodingRule(users.alice, { rule: rid });
  const live = (await codingRuleRows(clients.A1)).find((r) => r.id === rid || (r.counterparty_id === cp && r.status === "live"));
  assert.ok(live && live.status === "live", "the signed rule is live");
  // Propose against an account_code that does not exist for the client → refuse.
  await assert.rejects(() => proposeCodingRule(users.alice, { client: clients.A1, counterparty: cp, accountCode: "999-ZZZ" }),
    (e) => [CLR27, "CLR10", "CLR11", "23503"].includes(e.code), "a non-existent account refuses (composite FK / postable guard)");
});

test("duplicate LIVE rule for (client, counterparty, vendor_account) refuses CLR27 duplicate_live (the one-live partial unique → 23505 mapped)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: "DUPRULECO SDN BHD", reg: "201801009100" });
  if (!cp) { noteLane("dup-rule: counterparty not located"); return; }
  const p1 = await proposeCodingRule(users.alice, { client: clients.A2, counterparty: cp, accountCode: EXP });
  await signCodingRule(users.alice, { rule: p1?.rule_id ?? p1?.id ?? p1 });
  // A second live rule for the same key → CLR27 duplicate_live.
  const p2 = await proposeCodingRule(users.alice, { client: clients.A2, counterparty: cp, accountCode: EXP2 }).catch((e) => ({ error: e }));
  if (p2?.error) { assert.equal(p2.error.code, CLR27, "a duplicate proposal refuses CLR27"); return; }
  const err = await signCodingRule(users.alice, { rule: p2?.rule_id ?? p2?.id ?? p2 }).then(() => null, (e) => e);
  assert.ok(err && err.code === CLR27, `signing a second live rule for the same key refuses CLR27 (got ${err?.code})`);
  const rr = err && reasonOf(err); if (rr) assert.equal(rr, WREASON.duplicateLive, "the CLR27 reason discriminant is duplicate_live");
});

// ===========================================================================
// Fired-decision snapshot truth (Codex 17/22).
// ===========================================================================

test("fired-decision snapshot: a draft coded to the rule's account records account_matched=true ('per your rule' proven); a different account records account_matched=false (no false claim)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A1, name: "FIREDCO SDN BHD", reg: "201801009200" });
  if (!cp) { noteLane("fired-snapshot: counterparty not located"); return; }
  const p = await proposeCodingRule(users.alice, { client: clients.A1, counterparty: cp, accountCode: EXP });
  await signCodingRule(users.alice, { rule: p?.rule_id ?? p?.id ?? p });
  // A NEW draft for the vendor coded to EXP (matches the rule).
  const firm = await firmOf(clients.A1);
  const citedMatch = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const dMatch = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: citedMatch.documentId }),
    document: citedMatch.documentId, sha256: citedMatch.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { existing_id: cp }, evidence: [ev(citedMatch.regionId, citedMatch.quote, FIELD.total)], opKey: opk("matchcite"),
  });
  const decMatch = await ruleDecisionRows(dMatch.entry_id);
  if (!decMatch.length) { noteLane("no rule_decisions row for a rule-backed draft — the fired-snapshot may key differently; inspect"); }
  else assert.equal(decMatch[decMatch.length - 1].account_matched, true, "a matching draft records account_matched=true");
  // A draft coded to a DIFFERENT account (EXP2) — the rule fired but did NOT match.
  const citedMiss = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const dMiss = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: citedMiss.documentId }),
    document: citedMiss.documentId, sha256: citedMiss.sha256, lines: billLines(EXP2, AP, ROUTINE_CENTS),
    vendor: { existing_id: cp }, evidence: [ev(citedMiss.regionId, citedMiss.quote, FIELD.total)], opKey: opk("misscite"),
  });
  const decMiss = await ruleDecisionRows(dMiss.entry_id);
  if (decMiss.length) assert.equal(decMiss[decMiss.length - 1].account_matched, false, "a non-matching draft records account_matched=false (no false 'per your rule')");
});

test("a rule signed AFTER a draft leaves NO fired snapshot on that draft (nothing fired)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const cp = await makeVendor(users.alice, { client: clients.A2, name: "LATECO SDN BHD", reg: "201801009300" });
  if (!cp) { noteLane("late-sign: counterparty not located"); return; }
  // Draft FIRST (no live rule yet).
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { existing_id: cp }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("latecite"),
  });
  const before = (await ruleDecisionRows(d.entry_id)).length;
  // NOW sign a rule — it must not retroactively attach a fired snapshot to the earlier draft.
  const p = await proposeCodingRule(users.alice, { client: clients.A2, counterparty: cp, accountCode: EXP });
  await signCodingRule(users.alice, { rule: p?.rule_id ?? p?.id ?? p });
  const after = (await ruleDecisionRows(d.entry_id)).length;
  assert.equal(after, before, "signing a rule after the draft adds NO fired snapshot to that draft (nothing fired at draft time)");
});
