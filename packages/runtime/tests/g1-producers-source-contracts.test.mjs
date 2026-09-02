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
import { classifyBankDueReason, EMIT_REASONS } from "../lib/reconciler-bank-agent.mjs";

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

function writerLockContract(source) {
  const sf = ts.createSourceFile("bankAgent.v1.impl.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nodes = walk(sf);
  const declarations = nodes.filter((node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === "writer"
    && node.initializer && ts.isCallExpression(node.initializer)
    && ts.isPropertyAccessExpression(node.initializer.expression)
    && node.initializer.expression.name.text === "getWriter"
    && ts.isCallExpression(node.initializer.expression.expression)
    && ts.isIdentifier(node.initializer.expression.expression.expression)
    && node.initializer.expression.expression.expression.text === "getWritable");
  if (declarations.length !== 1) return { ok: false, detail: `expected one writer acquisition, found ${declarations.length}` };

  const releases = nodes.filter((node) => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "writer"
    && node.expression.name.text === "releaseLock"
    && node.arguments.length === 0);
  if (releases.length !== 1) return { ok: false, detail: `expected one writer.releaseLock(), found ${releases.length}` };

  const variableStatement = declarations[0].parent?.parent;
  const ownerBlock = variableStatement?.parent;
  if (!ts.isVariableStatement(variableStatement) || !ts.isBlock(ownerBlock)) {
    return { ok: false, detail: "writer acquisition is not a direct statement in a block" };
  }

  const candidates = ownerBlock.statements.filter((statement) => ts.isTryStatement(statement)
    && statement.pos > variableStatement.pos
    && walk(statement.tryBlock).some((node) => ts.isCallExpression(node)
      && ts.isIdentifier(node.expression) && node.expression.text === "drainBankStream")
    && statement.finallyBlock?.statements.some((finallyStatement) => ts.isExpressionStatement(finallyStatement)
      && finallyStatement.expression === releases[0]));
  if (candidates.length !== 1) {
    return { ok: false, detail: `expected one same-block TryStatement owning drain + direct release, found ${candidates.length}` };
  }
  return { ok: true, detail: "writer acquisition and direct release bind to the drain's TryStatement" };
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

  assert.deepEqual([...EMIT_REASONS].sort(), sqlReasons,
    "runtime EMIT_REASONS and the SQL wall must expose exactly the same set");
});

test.skip("superseded: runtime classifier due_key grammar (the runtime no longer mints keys)", () => {
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

test("R2-7: writer acquisition and release bind to the SAME TryStatement that protects drainBankStream", async () => {
  const src = await readFile(new URL("../workflows/bankAgent.v1.impl.ts", import.meta.url), "utf8");
  const result = writerLockContract(src);
  assert.equal(result.ok, true, result.detail);
});

test("R2-7 source-text mutant: an unrelated nested finally cannot satisfy the acquisition/release ownership proof", async () => {
  const src = await readFile(new URL("../workflows/bankAgent.v1.impl.ts", import.meta.url), "utf8");
  const mutant = src.replace(
    "  } finally {\r\n    writer.releaseLock();\r\n  }",
    "  } finally {\r\n    try { /* unrelated cleanup */ } finally { writer.releaseLock(); }\r\n  }",
  ).replace(
    "  } finally {\n    writer.releaseLock();\n  }",
    "  } finally {\n    try { /* unrelated cleanup */ } finally { writer.releaseLock(); }\n  }",
  );
  assert.notEqual(mutant, src, "the nested-finally mutant must be constructed from the shipping source");
  const result = writerLockContract(mutant);
  assert.equal(result.ok, false, "a release owned only by an unrelated nested finally must be rejected");
});

test("R2-2: runtime requires a DB-owned subject_id and carries no due-key minting grammar", () => {
  const classify = (subject_id) => classifyBankDueReason({
    due: true,
    reason: "unmatched_lines",
    bank_account_id: "11111111-1111-4111-8111-111111111111",
    subject_id,
  });
  for (const bad of [null, undefined, "", 42]) {
    assert.equal(classify(bad).action, "anomalous", `subject_id ${JSON.stringify(bad)} must be refused`);
  }
  assert.equal(classify("22222222-2222-4222-8222-222222222222").action, "emit");
});
