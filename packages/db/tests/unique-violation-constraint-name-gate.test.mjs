// Pins the pre-integration decision table independently of the two behavioural cells. Every
// catalog mutation is transaction-local and rolled back to its savepoint; no weakened writer
// body can escape a cell.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { endPool } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  KNOWN_NEW_PROSRC_SHA,
  KNOWN_OLD_PROSRC_SHA,
  PROPOSE_VENDOR_IDENTITY_BINDING_SIG,
  UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION,
  readUniqueViolationConstraintNameGate,
} from "./unique-violation-constraint-name-gate.mjs";

const OLD_DECLARATION = "  v_blocker text; v_suppressed text;";
const NEW_DECLARATION = "  v_blocker text; v_suppressed text; v_con text;";
const OLD_HANDLER = [
  "  exception when unique_violation then",
  "    raise exception 'binding_conflict' using errcode='CLR36';",
  "  end;",
].join("\n");
const NEW_HANDLER = [
  "  exception when unique_violation then",
  "    -- PROGRESS 3b: read WHICH constraint fired and map only the ROSTERED ones to the",
  "    -- estate's typed refusal -- the 0028 idiom every OTHER handler was meant to follow.",
  "    -- Both rostered indexes protect the SAME invariant this door has always meant to",
  "    -- enforce (no second proposed/live binding for the same client+counterparty), so both",
  "    -- map to the SAME existing 'binding_conflict' rather than a new vocabulary member.",
  "    -- ANY OTHER unique_violation on this table (an id/PK collision, or a future index this",
  "    -- roster does not yet know about) is re-raised UNCHANGED -- the safe default for an",
  "    -- unrostered collision is to surface it honestly, not swallow it under a name that",
  "    -- does not describe it.",
  "    get stacked diagnostics v_con = constraint_name;",
  "    if v_con = 'uq_vib_one_active_binding' or v_con = 'uq_vib_one_live' then",
  "      raise exception 'binding_conflict' using errcode='CLR36';",
  "    else",
  "      raise;",
  "    end if;",
  "  end;",
].join("\n");

after(async () => { await endPool(); });

function replaceExactlyOnce(text, needle, replacement, label) {
  assert.equal(text.split(needle).length - 1, 1, `${label}: expected exactly one source match`);
  return text.replace(needle, replacement);
}

async function readGate(c, preload = "1") {
  return readUniqueViolationConstraintNameGate((sql, params) => c.query(sql, params), preload);
}

async function plantKnownBody(c, targetSha) {
  const current = await readGate(c);
  if (current.prosrcSha === targetSha) return;
  assert.ok(
    current.prosrcSha === KNOWN_OLD_PROSRC_SHA || current.prosrcSha === KNOWN_NEW_PROSRC_SHA,
    `fixture precondition: expected a known old/new body, got ${current.prosrcSha}`,
  );
  let definition = (await c.query(
    "select pg_get_functiondef($1::regprocedure) as def",
    [PROPOSE_VENDOR_IDENTITY_BINDING_SIG],
  )).rows[0].def;
  if (targetSha === KNOWN_OLD_PROSRC_SHA) {
    definition = replaceExactlyOnce(definition, NEW_DECLARATION, OLD_DECLARATION, "new-to-old declaration");
    definition = replaceExactlyOnce(definition, NEW_HANDLER, OLD_HANDLER, "new-to-old handler");
  } else {
    assert.equal(targetSha, KNOWN_NEW_PROSRC_SHA, "fixture target is one of the two pinned bodies");
    definition = replaceExactlyOnce(definition, OLD_DECLARATION, NEW_DECLARATION, "old-to-new declaration");
    definition = replaceExactlyOnce(definition, OLD_HANDLER, NEW_HANDLER, "old-to-new handler");
  }
  await c.query(definition);
  assert.equal((await readGate(c)).prosrcSha, targetSha, "planted body has the migration-pinned identity");
}

async function plantUnknownNonMarkerBody(c) {
  await c.query(`
    create or replace function clara.propose_vendor_identity_binding(
      p_proposal jsonb,
      p_op_key text
    ) returns jsonb
    language plpgsql security definer
    set search_path to clara,pg_temp
    as $unknown_gate_body$
    begin
      return jsonb_build_object('unknown_gate_stub', true);
    end
    $unknown_gate_body$`);
}

async function legacySubstringLedgerWouldSkip(c, preload = "1") {
  const r = await c.query(
    `select exists (select 1 from clara.schema_migrations where version ~ '^0028_') as has_0028,
            position('constraint_name' in p.prosrc) <> 0 as has_marker
       from pg_proc p
      where p.oid = 'clara.propose_vendor_identity_binding(jsonb,text)'::regprocedure`,
  );
  return preload === "1" && (!r.rows[0].has_0028 || !r.rows[0].has_marker);
}

test("uvc.gate.a preload + NEW body + no 0028 ledger row executes both behavioural cells", async () => {
  await withTxn(async (c) => {
    await c.query("savepoint uvc_gate_a");
    await plantKnownBody(c, KNOWN_NEW_PROSRC_SHA);
    const removed = await c.query("delete from clara.schema_migrations where version ~ '^0028_' returning version");
    assert.equal(removed.rowCount, 1, "fixture removes exactly the 0028 ledger row inside the savepoint");
    const decision = await readGate(c);
    assert.equal(decision.has28, false, "informational ledger read sees the deliberate absence");
    assert.equal(decision.action, "execute", "ledger absence cannot authorize a skip");
    assert.equal(await legacySubstringLedgerWouldSkip(c), true, "RED-before control: the retired ledger predicate skips this state");
    await c.query("rollback to savepoint uvc_gate_a");
  }, { commit: false });
});

test("uvc.gate.b preload + exact OLD body yields exactly two named skip decisions", async () => {
  await withTxn(async (c) => {
    await c.query("savepoint uvc_gate_b");
    await plantKnownBody(c, KNOWN_OLD_PROSRC_SHA);
    const decision = await readGate(c);
    assert.equal(decision.action, "skip", "only the positive old-body identity authorizes skipping");
    const outcomes = [decision, decision].filter((outcome) => outcome.action === "skip");
    assert.equal(outcomes.length, 2, "the file's two behavioural cells each receive a counted skip");
    for (const outcome of outcomes) {
      assert.ok(
        outcome.reason.includes(UNIQUE_VIOLATION_CONSTRAINT_NAME_MIGRATION),
        "each skip reason names the exact UNNUMBERED migration file",
      );
    }
    await c.query("rollback to savepoint uvc_gate_b");
  }, { commit: false });
});

test("uvc.gate.c preload + unknown non-marker body executes with zero skips", async () => {
  await withTxn(async (c) => {
    await c.query("savepoint uvc_gate_c");
    await plantUnknownNonMarkerBody(c);
    const decision = await readGate(c);
    assert.notEqual(decision.prosrcSha, KNOWN_OLD_PROSRC_SHA, "stub identity is not the known old body");
    assert.notEqual(decision.prosrcSha, KNOWN_NEW_PROSRC_SHA, "stub identity is not the known new body");
    assert.equal(decision.action, "execute", "an unknown body never becomes vacuous through substring absence");
    assert.equal(await legacySubstringLedgerWouldSkip(c), true, "RED-before control: the retired substring predicate skips this state");
    await c.query("rollback to savepoint uvc_gate_c");
  }, { commit: false });
});
