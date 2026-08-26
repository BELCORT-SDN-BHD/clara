// Card 1 — STAGE (a): the placeholder block, the pinned payload pre-join, and the sandbox job
// family. Annex B sections B.1, B.2 and B.6.
//
// Design of record: card1-substitution-seam-design.md §2 (§2.1 the block kind · §2.2 the widened
// _sandbox_client_set · §2.3 derivation · §2.4 the payload · §2.6 the claim/dispatch verbs) +
// card1-substitution-seam-annexes.md Annex B.1/B.2/B.6.
//
// WHAT STAGE (a) IS. A `placeholder` block cites a PRE-COMPUTED metric_cells row by its pinned id;
// the renderer substitutes that cell's own displayed_text at render time. No model-typed numeral
// reaches the sealed bytes, because a placeholder block carries no numeral-shaped field at all.
//
// EVERY WALL IN BOTH POLARITIES (law 31): a refusal cell's differential twin must be ADMITTED, and
// the two fixtures differ in exactly the term the wall reads.
//
// ============================================================================================
// THIS FILE'S NAME IS PART OF THE EVIDENCE CONTRACT. DO NOT RENAME IT SHORTER.
//
// node --test runs a directory's files in SORTED order, and this battery's `before()` performs the
// evaluator ceremony (it must, to mint cells at all). Named `card1-seam-*` it sorted BEFORE
// `delta-contract.test.mjs` and permanently destroyed two ONE-SHOT witnesses that can each be
// observed once per database, EVER:
//   * delta-contract.test.mjs's fresh arm — `metric_cells count == 0` is honest evidence of an
//     unconsumed database only before any cell has been minted; and
//   * delta-catalog-phase.mjs's direct-deployment ROLLBACK proof, gated on
//     `evaluatorCeremonyUnwitnessed()`, which 0060's one-way deploy trigger makes unrepeatable.
// The `f-a5b-` prefix is the lane's own convention AND puts this file after delta/epsilon/eta and
// after f-a5's cell D, so every one of those keeps the witness it owns. A tidier shortening the
// name would turn all of those cells into their re-run arms with nothing going red to say so.
// ============================================================================================

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, asHuman, opk, ROLES, roleQuery } from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { freshDeltaClient } from "./delta-fixtures.mjs";
import {
  card1Ready, skipHere, ensureV1EvaluatorsDeployed, mintDefinitionBackedCell, mintUndefinedCell,
  mintSandboxView, textBlock, placeholderBlock, previewBasis, body, basisArr, model,
  asSandboxWake, SANDBOX_DISPATCH_COLUMNS,
} from "./f-a5b-card1-seam-fixtures.mjs";

let ready = false;
let world = null;
let fx = null;

before(async () => {
  ready = await card1Ready();
  if (!ready) return;
  world = await buildWorld();
  await ensureV1EvaluatorsDeployed();
  const a1 = await freshDeltaClient(world.users.alice, "c1a1");
  const a2 = await freshDeltaClient(world.users.alice, "c1a2");
  fx = {
    A1: await mintDefinitionBackedCell(world.users.alice, a1, "a1"),
    A2: await mintDefinitionBackedCell(world.users.alice, a2, "a2"),
  };
  // A NON-'ok' cell for B1.3, MADE by asking the evaluator for a figure it cannot produce — never
  // by editing a row, which the integrity trigger would refuse anyway and which would prove
  // nothing about the path a placeholder actually cites.
  const undef = await mintUndefinedCell(world.users.alice, await freshDeltaClient(world.users.alice, "c1nk"), "b13");
  fx.notOk = [{ id: undef.cellId, cell_status: undef.cellStatus }];
});
after(async () => { await endPool(); });

// =============================================================================================
// B.1 — BLOCK / BASIS VALIDATION (design §2.2)
// =============================================================================================

test("B1.1 — a placeholder citing an 'ok' preview-cell basis MINTS, and derives the EXACT client set (no free text present)", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const out = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("figure")),
    basis: basisArr(previewBasis("figure", fx.A1.cellId)),
  });
  assert.ok(out.sandbox_view_id, "the mint returned a view");
  // THE S30 BOUNDARY, POSITIVE ARM: a body with NO text block sets no free-text flag, so the
  // fail-safe interim does not widen and the derived set is the exact one.
  assert.equal(out.client_set_basis, "exact",
    "a placeholder-only body derives the EXACT client set — this is the reversal 0132:541-542 predicted");
  assert.deepEqual([...out.client_set].sort(), [fx.A1.clientId].sort());
  assert.deepEqual([...out.client_set_exact].sort(), [fx.A1.clientId].sort(),
    "and the exact derivation and the returned set are the same value, byte for byte");
});

test("B1.2 — a placeholder citing a NON-preview_cell basis kind REFUSES sandbox_placeholder_basis_not_cell; the preview_cell twin succeeds", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // `freeform_read` is the only OTHER basis kind that exists, so it is the only fixture that can
  // reach this wall. Whether it CAN reach it is MEASURED here, never assumed: 0132 requires every
  // basis element id to match a uuid shape and casts it `::uuid`, while F-A6 PR-1's live
  // clara.freeform_read_log carries a BIGINT id. On such a chain a freeform_read basis refuses at
  // an EARLIER wall (`sandbox_view_basis_unknown`, the malformed-id arm), so running the cell would
  // read a pass off the wrong refusal — the exact shape a green test is supposed to make impossible.
  const idType = (await rootQuery(
    `select data_type from information_schema.columns
      where table_schema='clara' and table_name='freeform_read_log' and column_name='id'`)).rows[0]?.data_type;
  if (idType !== "uuid") {
    t.skip(`card 1 B1.2 refusal arm: clara.freeform_read_log.id is ${idType ?? "absent"}, not uuid, so 0132's uuid-shaped basis_ref id can never resolve a freeform_read basis on this chain — the refusal this cell wants is unreachable behind an earlier wall (reported to the conductor; it is F-A5b PR-1's own integration with F-A6 PR-1, not card 1's to move)`);
  } else {
    const read = (await rootQuery(
      "select id from clara.freeform_read_log where firm_id=$1 limit 1", [world.firms.A])).rows[0];
    if (!read) {
      t.skip("card 1 B1.2 refusal arm: no freeform_read_log row exists in firm A on this database to cite");
    } else {
      await assert.rejects(
        mintSandboxView(world.firms.A, world.users.alice, {
          viewBody: body(placeholderBlock("fr")),
          basis: basisArr({ label: "fr", kind: "freeform_read", id: read.id }),
        }),
        (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /sandbox_placeholder_basis_not_cell/); return true; });
    }
  }
  // THE TWIN, ALWAYS RUN whichever arm the measurement chose: the same placeholder over a
  // preview_cell basis mints, so the cell always says something about the wall it is named for.
  const ok = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("fr")),
    basis: basisArr(previewBasis("fr", fx.A1.cellId)),
  });
  assert.ok(ok.sandbox_view_id);
});

test("B1.3 — D3's MINT-TIME door: a placeholder citing a non-'ok' cell REFUSES sandbox_placeholder_cell_not_ok, for every non-ok status this estate carries; the 'ok' twin mints", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // THE PRECONDITION IS ASSERTED WHERE IT IS RELIED ON, not left as a silent dependency on
  // mintUndefinedCell's internal throw. This cell is only meaningful if the fixture really is a
  // non-'ok' cell — a read that cannot say NO has a meaningless YES — so it says so here, in one
  // line, rather than guarding an arm that can never fire.
  assert.equal(fx.notOk.length, 1, "the B1.3 fixture minted exactly one non-'ok' cell to cite");
  for (const cell of fx.notOk) {
    assert.ok(cell.cell_status && cell.cell_status !== "ok",
      `the cited fixture cell must be non-'ok' or this cell proves nothing (got '${cell.cell_status}')`);
    await assert.rejects(
      mintSandboxView(world.firms.A, world.users.alice, {
        viewBody: body(placeholderBlock("bad")),
        basis: basisArr(previewBasis("bad", cell.id)),
      }),
      (e) => {
        assert.equal(e.code, "CLR10", `cell_status=${cell.cell_status}`);
        assert.match(e.detail || "", /sandbox_placeholder_cell_not_ok/, `cell_status=${cell.cell_status}`);
        return true;
      });
  }
  const ok = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("good")),
    basis: basisArr(previewBasis("good", fx.A1.cellId)),
  });
  assert.ok(ok.sandbox_view_id, "the 'ok' twin mints");
});

test("B1.4 (N2) — THE MIXED-BODY DIFFERENTIAL: adding one text block widens client_set to firm_closure while client_set_exact still reads the cited client ALONE", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const basis = basisArr(previewBasis("f", fx.A1.cellId));
  const mixed = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("f"), textBlock("f", "and here is the commentary")),
    basis,
  });
  assert.equal(mixed.client_set_basis, "firm_closure",
    "a text block is still free text, so the fail-safe interim still widens — S30's boundary, unmoved");
  // NT-1's whole point: asserting only against the widened set would pass even on a silently
  // NARROWED exact derivation, since the roster contains everything.
  assert.deepEqual([...mixed.client_set_exact].sort(), [fx.A1.clientId].sort(),
    "the EXACT derivation still reads the cited client alone");
  assert.ok(mixed.client_set.length >= mixed.client_set_exact.length,
    "coverage only ever widens, never narrows");

  // THE TWIN, differing in exactly one term — the text block removed.
  const placeholderOnly = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("f")),
    basis,
  });
  assert.equal(placeholderOnly.client_set_basis, "exact");
  assert.deepEqual([...placeholderOnly.client_set].sort(), [...placeholderOnly.client_set_exact].sort(),
    "with no free text the widened and exact sets are byte-identical");
});

test("B1.5 (N2) — a placeholder-only body citing TWO clients' cells derives the exact UNION: a placeholder-only view can genuinely be cross-client (N8)", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const out = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("a"), placeholderBlock("b")),
    basis: basisArr(previewBasis("a", fx.A1.cellId), previewBasis("b", fx.A2.cellId)),
  });
  assert.equal(out.client_set_basis, "exact");
  assert.deepEqual([...out.client_set_exact].sort(), [fx.A1.clientId, fx.A2.clientId].sort(),
    "the EXACT derivation is the union of the two cited clients — the constraint that makes stage (b) single-client lives in the EVALUATOR's signature, not in this loop");
});

test("B1.6 — an unrecognised third block kind still REFUSES block_kind_unsupported; both admitted kinds mint", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  await assert.rejects(
    mintSandboxView(world.firms.A, world.users.alice, {
      viewBody: body({ kind: "chart_ref", basis_ref: "x" }),
      basis: basisArr(previewBasis("x", fx.A1.cellId)),
    }),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /block_kind_unsupported/); return true; });
  for (const block of [textBlock("x"), placeholderBlock("x")]) {
    const ok = await mintSandboxView(world.firms.A, world.users.alice, {
      viewBody: body(block), basis: basisArr(previewBasis("x", fx.A1.cellId)),
    });
    assert.ok(ok.sandbox_view_id, `the ${block.kind} arm mints`);
  }
});

test("B1.7 (M4) — THE CLOSED-KEY RULE IS placeholder-ONLY: an extra key on a placeholder REFUSES, the SAME extra key on a text block SUCCEEDS", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  await assert.rejects(
    mintSandboxView(world.firms.A, world.users.alice, {
      viewBody: body({ kind: "placeholder", basis_ref: "x", displayed_text: "1,234.50" }),
      basis: basisArr(previewBasis("x", fx.A1.cellId)),
    }),
    (e) => { assert.equal(e.code, "CLR10"); assert.match(e.detail || "", /placeholder_unknown_key/); return true; },
    "a placeholder carrying a numeral-shaped field is exactly what this rule exists to refuse");
  // THE DIFFERENTIAL TWIN. 0132's text-block validation does NOT reject an unrecognised extra key,
  // and this build must not silently narrow it — M4's own instruction.
  const ok = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body({ ...textBlock("x"), some_unrecognised_key: "0132 admits this today" }),
    basis: basisArr(previewBasis("x", fx.A1.cellId)),
  });
  assert.ok(ok.sandbox_view_id, "a text block with the same extra key still mints — the closed-key rule is placeholder-only");
});

// =============================================================================================
// B.2 — THE PIN RULE (design §2.4, S46, M11/CD-13)
// =============================================================================================

/**
 * Request an export for a view and put THAT EXACT ROW under a lease.
 *
 * The lease is stamped directly rather than through clara.claim_sandbox_export ON PURPOSE.
 * The claim verb takes the OLDEST claimable row in the whole table — correct behaviour, and
 * exactly what B6.2 forces — but it means a payload cell that claimed "a" row would be reading
 * whatever another cell happened to leave behind. B.2 is about the PAYLOAD's pinned join; the
 * claim verb has its own cell and is not re-proved here by accident.
 */
async function leasedExport(viewId, workerId) {
  const recipient = await asHuman(world.users.alice, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["firm_member", world.users.bob, "Bob card1", "card 1 battery", null, opk("c1rcpt")]))
    .then((r) => r.rows[0].r.recipient_id);
  const requested = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [viewId, recipient, "en", "card1", model(), opk("c1req")]));
  assert.equal(requested.rows[0].r.state, "claimable");
  const exportId = requested.rows[0].r.sandbox_export_id;
  await rootQuery(
    `update clara.sandbox_exports set state='running', claimed_by=$2, claimed_at=now(),
       lease_expires_at=now() + interval '20 minutes', attempts = attempts + 1 where id=$1`,
    [exportId, workerId]);
  return { exportId };
}

async function payloadFor(exportId, workerId) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.sandbox_export_payload($1,$2) as p", [exportId, workerId]);
  return r.rows[0].p;
}

test("B2.1 — THE PIN-RULE REPLAY: reading the payload twice, with nothing else changed, returns a byte-identical `cells` object", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const view = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("f")), basis: basisArr(previewBasis("f", fx.A1.cellId)),
  });
  const worker = `card1-b21-${Date.now()}`;
  const { exportId } = await leasedExport(view.sandbox_view_id, worker);
  const first = await payloadFor(exportId, worker);
  const second = await payloadFor(exportId, worker);
  assert.deepEqual(second.cells, first.cells, "the same pinned basis resolves to the same cells on replay");
  assert.equal(first.cells.f.cell_id, fx.A1.cellId);
  assert.equal(first.cells.f.cell_status, "ok");
  assert.equal(first.cells.f.displayed_text, fx.A1.displayedText,
    "and the resolved text is the DATABASE's own displayed_text for the pinned cell");
});

test("B2.2 — THE PIN-RULE'S NEGATIVE CONTROL: a SECOND cell for the same (client, definition) does NOT displace the pinned one", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const view = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("f")), basis: basisArr(previewBasis("f", fx.A1.cellId)),
  });
  const worker = `card1-b22-${Date.now()}`;
  const { exportId } = await leasedExport(view.sandbox_view_id, worker);
  const before = await payloadFor(exportId, worker);

  // Mint a SECOND, later cell for the SAME client and definition version — a different run, so the
  // (client, run, definition) uniqueness admits it. A "latest cell for this definition" resolver
  // would now return this one.
  const { randomUUID } = await import("node:crypto");
  const { evaluateMetricHuman } = await import("./delta-fixtures.mjs");
  const second = await evaluateMetricHuman(world.users.alice, {
    client: fx.A1.clientId, definitionVersion: fx.A1.definitionVersionId,
    periodIds: [fx.A1.periodId], snapshotId: fx.A1.snapshotId, runId: randomUUID(),
  });
  assert.notEqual(second.cell_id, fx.A1.cellId, "the fixture genuinely minted a SECOND, different cell");

  const after = await payloadFor(exportId, worker);
  assert.deepEqual(after.cells, before.cells,
    "the payload still resolves the cell id FROZEN in sandbox_views.basis, never the newest one");
  assert.equal(after.cells.f.cell_id, fx.A1.cellId);
});

test("B2.3 (M11/CD-13) — the `cells` map carries an entry ONLY for labels a PLACEHOLDER block cites", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // Two preview_cell basis elements. One is cited by a placeholder (substituted); the other only
  // by a text block, for provenance — it must NOT appear in the joined map.
  const view = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("sub"), textBlock("prov", "cited for provenance only")),
    basis: basisArr(previewBasis("sub", fx.A1.cellId), previewBasis("prov", fx.A2.cellId)),
  });
  const worker = `card1-b23-${Date.now()}`;
  const { exportId } = await leasedExport(view.sandbox_view_id, worker);
  const p = await payloadFor(exportId, worker);
  assert.deepEqual(Object.keys(p.cells).sort(), ["sub"],
    "only the placeholder-cited label is pre-joined; a provenance-only citation is never substituted and gets no entry");
  // R-CD-5's owed cell, discharged here rather than asserted in prose: the payload builder's own
  // filter and the body's placeholder blocks must select the SAME label set. Derived from the
  // payload's OWN body rather than from the fixture literal, so the two filters are compared
  // against each other and not both against this test's expectations.
  const citedByBody = p.body.blocks
    .filter((b) => b.kind === "placeholder").map((b) => b.basis_ref).sort();
  assert.deepEqual(Object.keys(p.cells).sort(), citedByBody,
    "the payload's `cells` filter and the body's placeholder blocks agree on the label set, exactly — a drift between the two is the only way a placeholder could reach the renderer unresolvable");
});

// =============================================================================================
// B.6 — THE ALTER, THE LIFECYCLE WALL AND THE JOB VERBS (design §2.6, BL-6)
// =============================================================================================

async function freshClaimableRow(tag) {
  const view = await mintSandboxView(world.firms.A, world.users.alice, {
    viewBody: body(placeholderBlock("f")), basis: basisArr(previewBasis("f", fx.A1.cellId)),
  });
  const recipient = await asHuman(world.users.alice, (db) =>
    db.query("select clara.register_export_recipient($1,$2,$3,$4,$5,$6) as r",
      ["firm_member", world.users.bob, `Bob ${tag}`, "card 1 battery", null, opk(`c1r${tag}`)]))
    .then((r) => r.rows[0].r.recipient_id);
  const r = await asSandboxWake(world.firms.A, world.users.alice, (db) =>
    db.query("select clara.wake_request_sandbox_export($1,$2,$3,$4,$5,$6) as r",
      [view.sandbox_view_id, recipient, "en", tag, model(), opk(`c1q${tag}`)]));
  return r.rows[0].r.sandbox_export_id;
}

test("B6.1a — every NEW dispatch column is mutable through the recut lifecycle trigger; max_attempts is NOT", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const id = await freshClaimableRow("b61a");
  // first_claimed_at and claim_delay_ms are PAIRED by ck_sandboxexports_claim_delay_paired (the
  // estate's own render_jobs shape), so they move together or not at all — moving one alone is a
  // constraint violation, not a lifecycle refusal, and the two must not be confused.
  await rootQuery(
    "update clara.sandbox_exports set first_claimed_at = now(), claim_delay_ms = 42 where id = $1", [id]);
  for (const set of [
    "dispatch_attempts = 1", "last_dispatch_at = now()", "last_dispatch_ok = true",
    "last_dispatch_error = '{}'::jsonb",
  ]) {
    await rootQuery(`update clara.sandbox_exports set ${set} where id = $1`, [id]);
  }
  // ...and the PAIRING itself still bites: moving one half alone is refused by the CHECK.
  await assert.rejects(
    rootQuery("update clara.sandbox_exports set claim_delay_ms = null where id = $1", [id]),
    (e) => { assert.equal(e.code, "23514"); return true; },
    "the claim-delay pairing survives the widening — mutable is not unconstrained");
  await assert.rejects(
    rootQuery("update clara.sandbox_exports set max_attempts = 9 where id = $1", [id]),
    (e) => { assert.equal(e.code, "CLR08"); assert.match(e.detail || "", /sandbox_export_request_immutable/); return true; },
    "max_attempts is FROZEN request half — clara.render_jobs draws the line in exactly this place");
});

test("B6.1b — the rest of the request half is STILL frozen: the ALTER widened the mutable array and nothing else", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const id = await freshClaimableRow("b61b");
  for (const [col, value] of [["locale", "'ms'"], ["op_key", "'rewritten'"], ["coverage_proof", "'{}'::jsonb"]]) {
    await assert.rejects(
      rootQuery(`update clara.sandbox_exports set ${col} = ${value} where id = $1`, [id]),
      (e) => { assert.equal(e.code, "CLR08"); assert.match(e.detail || "", /sandbox_export_request_immutable/); return true; },
      `${col} must remain frozen`);
  }
});

test("B6.1c — the TERMINAL whole-row freeze carves out NO exception for the six new columns", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const id = await freshClaimableRow("b61c");
  await rootQuery("update clara.sandbox_exports set state='failed', finished_at=now() where id=$1", [id]);
  for (const col of ["dispatch_attempts = 7", "last_dispatch_ok = false", "last_dispatch_at = now()"]) {
    await assert.rejects(
      rootQuery(`update clara.sandbox_exports set ${col} where id = $1`, [id]),
      (e) => { assert.equal(e.code, "CLR08"); assert.match(e.detail || "", /sandbox_export_terminal/); return true; },
      `a terminal row refuses ${col} even though the column is otherwise mutable`);
  }
});

test("B6.2 — claim transitions claimable -> running and stamps the clock columns; the ATTEMPTS CEILING is strict at the cap", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  // The verb takes the OLDEST ELIGIBLE row in the table, never a row of this cell's choosing —
  // that IS the contract. So this cell PREDICTS which row it will take, from the verb's own
  // predicate, and then proves the prediction plus the delta.
  //
  // AN ABSOLUTE `attempts === 1` WAS WRONG HERE, and it was wrong in a way only a re-run exposes:
  // on a REUSED database the oldest eligible row is one an earlier run already claimed, so its
  // attempts is 2 on the second pass and the cell reds for a reason that says nothing about the
  // verb. The property was never "attempts is 1" — it is "a claim INCREMENTS attempts and stamps
  // the clock columns", which is a delta, and a delta is what is asserted now.
  await freshClaimableRow("b62");
  const worker = `card1-b62-${Date.now()}`;
  const predicted = (await rootQuery(
    `select id, attempts from clara.sandbox_exports
      where (state = 'claimable' or (state = 'running' and lease_expires_at < now()))
        and attempts < max_attempts
      order by created_at, id limit 1`)).rows[0];
  assert.ok(predicted, "at least one eligible row exists — the fixture above guarantees it");

  const claimed = await roleQuery(ROLES.runtime,
    "select clara.claim_sandbox_export($1, interval '20 minutes') as j", [worker]);
  const receipt = claimed.rows[0].j;
  assert.ok(receipt, "a claimable row was claimed");
  assert.equal(receipt.claimed_by, worker, "and the receipt names this worker");
  assert.equal(receipt.sandbox_export_id, predicted.id,
    "the verb took the OLDEST eligible row, exactly as its own order-by says it will");

  const row = (await rootQuery(
    `select state, claimed_by, claimed_at, lease_expires_at, attempts, max_attempts,
            first_claimed_at, claim_delay_ms
       from clara.sandbox_exports where id=$1`, [receipt.sandbox_export_id])).rows[0];
  assert.equal(row.state, "running");
  assert.equal(row.claimed_by, worker);
  assert.equal(row.attempts, predicted.attempts + 1, "a claim increments attempts by exactly one");
  assert.equal(row.attempts, receipt.attempts, "and the receipt and the row agree on the value");
  assert.ok(row.claimed_at && row.lease_expires_at && row.first_claimed_at);
  assert.ok(row.claim_delay_ms !== null, "the wait the row actually suffered is recorded, not inferred");
  assert.ok(new Date(row.first_claimed_at) <= new Date(row.claimed_at),
    "first_claimed_at is the FIRST claim's stamp and is never re-written by a later one");

  // THE CEILING, AT THE CAP ITSELF — not one below it. A cap enforced only on the cooperative
  // failure path is not a cap: a crash-only worker never reaches fail_sandbox_export, its lease
  // expires, and without `attempts < max_attempts` the row is claimable forever.
  const atCap = await freshClaimableRow("b62cap");
  await rootQuery(
    `update clara.sandbox_exports set state='running', claimed_by='dead', claimed_at=now(),
       lease_expires_at=now() - interval '1 hour', attempts = max_attempts where id=$1`, [atCap]);
  const capWorker = `card1-b62cap-${Date.now()}`;
  const none = await roleQuery(ROLES.runtime,
    "select clara.claim_sandbox_export($1, interval '20 minutes') as j", [capWorker]);
  assert.ok(!none.rows[0].j || none.rows[0].j.sandbox_export_id !== atCap,
    "a row AT the cap with an expired lease is never re-claimed");
  // THE TWIN, one below the cap: claimable.
  await rootQuery(
    `update clara.sandbox_exports set attempts = max_attempts - 1 where id=$1`, [atCap]);
  const again = await roleQuery(ROLES.runtime,
    "select clara.claim_sandbox_export($1, interval '20 minutes') as j", [`${capWorker}-b`]);
  assert.ok(again.rows[0].j, "one below the cap IS claimable — the predicate is strict, not off by one");
});

test("B6.3 — sandbox_dispatch_begin stamps the attempt BEFORE the machine call, and _record writes the receipt (skipping terminal rows)", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const id = await freshClaimableRow("b63");
  // p_max IS THE VERB'S OWN CEILING (100), not a number picked to fit today's queue. The due read
  // is oldest-first, so on a REUSED database a smaller cap could fill up with rows an earlier run
  // left behind and never reach the fixture row — the cell would then red for a reason that says
  // nothing about the verb, which is the same re-run trap B6.2's absolute `attempts` fell into.
  const due = (await roleQuery(ROLES.runtime,
    "select clara.sandbox_dispatch_begin(interval '0 seconds', 100) as r")).rows[0].r;
  assert.ok(due.export_ids.includes(id),
    `the due read names the claimable row (returned ${due.export_ids.length} of the eligible set)`);
  const stamped = (await rootQuery(
    "select dispatch_attempts, last_dispatch_at, last_dispatch_ok from clara.sandbox_exports where id=$1", [id])).rows[0];
  assert.equal(stamped.dispatch_attempts, 1, "the attempt is stamped by the due read itself");
  assert.ok(stamped.last_dispatch_at);
  assert.equal(stamped.last_dispatch_ok, null, "the outcome is not yet known");

  const rec = (await roleQuery(ROLES.runtime,
    "select clara.sandbox_dispatch_record($1::uuid[], false, $2::jsonb) as r",
    [[id], JSON.stringify({ error: "could not start the renderer" })])).rows[0].r;
  assert.ok(rec.recorded >= 1);
  const after = (await rootQuery(
    "select last_dispatch_ok, last_dispatch_error from clara.sandbox_exports where id=$1", [id])).rows[0];
  assert.equal(after.last_dispatch_ok, false);
  assert.equal(after.last_dispatch_error.error, "could not start the renderer",
    "'we could not start the renderer' is recorded ON THE ROW, not merely logged");

  // A TERMINAL row in the batch is SKIPPED, not written — otherwise the terminal wall would roll
  // back the whole batch and lose the outcome for every healthy row in it.
  const terminal = await freshClaimableRow("b63t");
  await rootQuery("update clara.sandbox_exports set state='failed', finished_at=now() where id=$1", [terminal]);
  const mixed = (await roleQuery(ROLES.runtime,
    "select clara.sandbox_dispatch_record($1::uuid[], true, '{}'::jsonb) as r", [[id, terminal]])).rows[0].r;
  assert.equal(mixed.skipped, 1, "the terminal row is reported as skipped rather than swallowed");
});

test("B6.4 — reap parks a crash-only row at its cap and leaves a below-cap row untouched", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const exhausted = await freshClaimableRow("b64x");
  const healthy = await freshClaimableRow("b64h");
  await rootQuery(
    `update clara.sandbox_exports set state='running', claimed_by='dead-worker', claimed_at=now(),
       lease_expires_at=now() - interval '1 hour', attempts = max_attempts where id=$1`, [exhausted]);
  await rootQuery(
    `update clara.sandbox_exports set state='running', claimed_by='slow-worker', claimed_at=now(),
       lease_expires_at=now() - interval '1 hour', attempts = max_attempts - 1 where id=$1`, [healthy]);
  const r = (await roleQuery(ROLES.runtime, "select clara.reap_exhausted_sandbox_exports() as r")).rows[0].r;
  assert.ok(r.reaped >= 1);
  assert.ok(r.reaped_export_ids.includes(exhausted));
  const parked = (await rootQuery(
    "select state, finished_at, claimed_by, claimed_at, lease_expires_at, last_error from clara.sandbox_exports where id=$1",
    [exhausted])).rows[0];
  assert.equal(parked.state, "failed");
  assert.ok(parked.finished_at);
  assert.equal(parked.claimed_by, null);
  assert.equal(parked.claimed_at, null);
  assert.equal(parked.lease_expires_at, null);
  assert.equal(parked.last_error.reason, "failed_at_cap_without_report");
  const untouched = (await rootQuery("select state from clara.sandbox_exports where id=$1", [healthy])).rows[0];
  assert.equal(untouched.state, "running", "a row below the cap is left alone by the same call");
});

test("B6.5 (M9) — the bidirectional grant census: each new verb is EXECUTE-able by clara_runtime and NO OTHER role", async (t) => {
  if (!ready) return skipHere(t, "the card-1 migration is not applied on this database");
  const verbs = [
    "claim_sandbox_export(text,interval)",
    "sandbox_dispatch_begin(interval,integer)",
    "sandbox_dispatch_record(uuid[],boolean,jsonb)",
    "reap_exhausted_sandbox_exports()",
  ];
  for (const verb of verbs) {
    // Derived from the function's OWN ACL, never from a fixed candidate list — a candidate list can
    // only find extras among names it already thought to ask about.
    const grantees = (await rootQuery(
      // rolname is pg's `name` type; array_agg over it yields name[], which node-pg has no parser
      // for and hands back as a RAW STRING — a deepEqual against it would compare a string to an
      // array and fail for the wrong reason. Cast to text inside SQL so the driver parses it.
      `select coalesce(array_agg(distinct rolname order by rolname), '{}'::text[]) as g from (
         select (case when a.grantee = 0 then 'public' else r.rolname::text end)::text as rolname
           from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           left join pg_roles r on r.oid = a.grantee
          where p.oid = ('clara.' || $1)::regprocedure and a.privilege_type = 'EXECUTE') g
        where g.rolname <> 'clara_fn_owner'`, [verb])).rows[0].g;
    assert.deepEqual(grantees, ["clara_runtime"], `clara.${verb} grantees`);
  }
  // AND THE OTHER DIRECTION: the roles that must NOT reach them cannot.
  for (const verb of verbs) {
    for (const role of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      const ok = (await rootQuery("select has_function_privilege($1, ('clara.' || $2)::regprocedure, 'EXECUTE') as ok",
        [role, verb])).rows[0].ok;
      assert.equal(ok, false, `${role} must not reach clara.${verb}`);
    }
  }
  // THE WAKE ALLOWLIST, BOTH DIRECTIONS (design §7 item 22 — this migration owns its own census
  // because no shared file exists to add rows to). Exactly one row for the new wrapper, on
  // 'interactive' alone; and the bare name is unambiguous, because wake_fn_allowlist's PK is
  // (wake_kind, function_name) with no argument-type column — an allowlist row is only as precise
  // as its name, so a second overload of that bare name would make the row unable to say which
  // function it authorizes.
  const rows = (await rootQuery(
    "select wake_kind from clara.wake_fn_allowlist where function_name='wake_compose_metric_preview_v2' order by 1")).rows;
  assert.deepEqual(rows.map((r) => r.wake_kind), ["interactive"],
    "'interactive' alone, permanently (CD-16) — never proactive, never interactive_client");
  assert.equal((await rootQuery(
    `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='clara' and p.proname='wake_compose_metric_preview_v2'`)).rows[0].n, 1,
  "exactly one overload answers to that bare name");
  // ...and F-A2's own pinned interactive_client row is untouched by this build. Read positively:
  // its ABSENCE would be the finding, and an absence proves nothing unless it is looked for.
  assert.equal((await rootQuery(
    `select count(*)::int n from clara.wake_fn_allowlist
      where wake_kind='interactive_client' and function_name='wake_open_question'`)).rows[0].n, 1,
  "card 1 must not touch the interactive_client roster at all");

  // The ALTER's own columns are present, all seven, read from the catalog.
  const cols = (await rootQuery(
    `select coalesce(array_agg(column_name::text order by column_name), '{}'::text[]) as c
       from information_schema.columns where table_schema='clara' and table_name='sandbox_exports'
        and column_name = any($1::text[])`, [[...SANDBOX_DISPATCH_COLUMNS]])).rows[0].c;
  assert.deepEqual(cols, [...SANDBOX_DISPATCH_COLUMNS]);
});
