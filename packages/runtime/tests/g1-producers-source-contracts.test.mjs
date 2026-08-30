// Gate G1 PR-2b — DB-free source/contract guards added by the #449 Codex-r2 fold.
//
// These are deliberately isolated from the rig batteries: the leader handoff and frozen-body
// lock-release proofs are AST properties, while the reason/due-key checks are pure runtime/SQL
// contract parity. Keeping them here makes each judgement wall independently mutation-testable
// without a database hiding a source-contract failure behind fixture setup.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { classifyBankDueReason } from "../lib/reconciler-bank-agent.mjs";

function walk(sourceFile) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

function isDateNow(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Date"
    && node.expression.name.text === "now" && node.arguments.length === 0;
}

test("R2-1: migration source and runtime classifier expose the SAME closed emit-reason set", async () => {
  const source = await readFile(
    new URL("../../db/migrations/UNNUMBERED_g1_pr_2b_bank_agent_due_emit.sql", import.meta.url),
    "utf8",
  );
  const clauses = [...source.matchAll(/p_reason\s+not\s+in\s*\(([^)]+)\)/gi)];
  assert.equal(clauses.length, 1, "the SQL door must carry one explicit p_reason NOT IN (...) guard");
  const sqlReasons = [...clauses[0][1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const expected = ["reconcilable", "retry_later", "unmatched_lines"];
  assert.deepEqual(sqlReasons, expected, "the door source drifted from the ruled three-value set");

  const bankAccountId = randomUUID();
  const runtimeReasons = expected.filter((reason) => classifyBankDueReason({
    due: true,
    reason,
    bank_account_id: bankAccountId,
    due_key: "r2-1-drift",
  }).action === "emit").sort();
  assert.deepEqual(runtimeReasons, sqlReasons, "runtime classification and the SQL wall must admit exactly the same emit reasons");
});

test("R2-2: runtime classifier enforces the canonical due_key grammar before the SQL door", () => {
  const bankAccountId = randomUUID();
  const classify = (due_key) => classifyBankDueReason({
    due: true,
    reason: "unmatched_lines",
    bank_account_id: bankAccountId,
    due_key,
  });
  for (const bad of [
    null, 7, { key: "k" }, "", " padded", "padded ", "has space", "has/slash", "字", "k".repeat(257),
  ]) {
    assert.equal(classify(bad).action, "anomalous", `due_key ${JSON.stringify(bad)} must be rejected by the runtime classifier`);
  }
  assert.equal(classify("k").action, "emit");
  assert.equal(classify("AZaz09._:-").action, "emit");
  assert.equal(classify("k".repeat(256)).action, "emit", "the exact 256-byte boundary is valid in both layers");
});

test("R2-6: the real leader tick structurally derives, hands off, and success-advances both producer cadences", async () => {
  const src = await readFile(new URL("../lib/leader.mjs", import.meta.url), "utf8");
  const sf = ts.createSourceFile("leader.mjs", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const nodes = walk(sf);

  const sweepCalls = nodes.filter((node) => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === "runReconcilerSweep");
  assert.equal(sweepCalls.length, 1, "the leader tick must have exactly one runReconcilerSweep handoff");
  const depsObject = sweepCalls[0].arguments[1];
  assert.ok(ts.isObjectLiteralExpression(depsObject), "runReconcilerSweep's second argument must be the tick dependency object");

  for (const contract of [
    { label: "bank_agent", dueVar: "bankAgentDue", dueFn: "bankAgentProduceDue", lastVar: "lastBankAgentRun", flag: "bankAgentRuns", ok: "bankAgentOk" },
    { label: "close_prep", dueVar: "closePrepDue", dueFn: "closePrepProduceDue", lastVar: "lastClosePrepRun", flag: "closePrepRuns", ok: "closePrepOk" },
  ]) {
    const declarations = nodes.filter((node) => ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name) && node.name.text === contract.dueVar
      && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === contract.dueFn
      && node.initializer.arguments.length === 2
      && ts.isIdentifier(node.initializer.arguments[0]) && node.initializer.arguments[0].text === contract.lastVar
      && isDateNow(node.initializer.arguments[1]));
    assert.equal(declarations.length, 1, `${contract.label}: leader must derive ${contract.dueVar} from ${contract.lastVar} through ${contract.dueFn}`);

    const handoffs = depsObject.properties.filter((node) => ts.isPropertyAssignment(node)
      && node.name.getText(sf) === contract.flag
      && ts.isIdentifier(node.initializer) && node.initializer.text === contract.dueVar);
    assert.equal(handoffs.length, 1, `${contract.label}: the derived due flag must be handed to runReconcilerSweep as ${contract.flag}`);

    const updates = nodes.filter((node) => {
      if (!ts.isIfStatement(node) || !ts.isBinaryExpression(node.expression)
          || node.expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return false;
      const left = node.expression.left;
      const right = node.expression.right;
      if (!ts.isIdentifier(left) || left.text !== contract.dueVar
          || !ts.isPropertyAccessExpression(right)
          || !ts.isIdentifier(right.expression) || right.expression.text !== "swept"
          || right.name.text !== contract.ok) return false;
      const statement = ts.isBlock(node.thenStatement) && node.thenStatement.statements.length === 1
        ? node.thenStatement.statements[0]
        : node.thenStatement;
      if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression)
          || statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsToken
          || !ts.isIdentifier(statement.expression.left) || statement.expression.left.text !== contract.lastVar) return false;
      return isDateNow(statement.expression.right);
    });
    assert.equal(updates.length, 1, `${contract.label}: only a due + successful belt may advance ${contract.lastVar}`);
    assert.ok(declarations[0].pos < sweepCalls[0].pos && sweepCalls[0].pos < updates[0].pos,
      `${contract.label}: derive -> handoff -> success advance must stay in tick order`);
  }
});

test("R2-7: the sole writer.releaseLock() call is an AST descendant of the intended finally block", async () => {
  const src = await readFile(new URL("../workflows/bankAgent.v1.impl.ts", import.meta.url), "utf8");
  const sf = ts.createSourceFile("bankAgent.v1.impl.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls = walk(sf).filter((node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "writer"
    && node.expression.name.text === "releaseLock"
    && node.arguments.length === 0);
  assert.equal(calls.length, 1, "writer.releaseLock() must appear exactly once in the shipping source");

  let ancestor = calls[0].parent;
  let owningFinally = null;
  while (ancestor) {
    if (ts.isBlock(ancestor) && ts.isTryStatement(ancestor.parent) && ancestor.parent.finallyBlock === ancestor) {
      owningFinally = ancestor;
      break;
    }
    ancestor = ancestor.parent;
  }
  assert.ok(owningFinally, "the sole writer.releaseLock() call must sit under a TryStatement's actual finallyBlock node");
});
