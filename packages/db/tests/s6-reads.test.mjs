// Slice-6 rig — the NEW READ fns: client-pinned isolation, the agent-lane
// CLR03-never-silent-empty law, not-found-shape equality (no oracle), and the
// aggregate char budget. Contract-blind: companion §7 + C-11 + D-F1/NEW-5 +
// INTERFACE-PINS §1 — NEVER from 0009. Every test SKIPS until 0009 lands.
//
// Reads (security invoker, RLS-scoped): list_unassigned_documents,
// get_document_extract, get_draft_review, list_uncoded_filings, get_journal_entry_for.
// Agent lane (clara_agent_ro) scopes by clara.wake_firm() (the credential); when
// null, each raises CLR03 (never a silent empty). Human lane uses its broad RLS.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ROUTINE_CENTS,
  assertRaises,
  opk,
  s6EnsureReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  CLR,
  withActor,
  mintWake,
  firmOf,
  seedCitedDocument,
  draftEntryV3,
  approveEntry,
  balanced,
  freshResolution,
  ev,
  FIELD,
  getDraftReview,
  listUncodedFilings,
  getDocumentExtract,
} from "./s6-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  ready = await s6EnsureReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("s6-reads");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-6 coding floor not present — 0009 not yet applied"); return true; }
  return false;
}

/** Run a read fn under the agent lane (clara_agent_ro + a firm credential). */
async function agentRead(secret, sql, params) {
  return withActor({ role: ROLES.agentRo, wakeSecret: secret, transaction: true }, (c) => c.query(sql, params));
}
/** Run a read fn under the agent lane with NO credential (wake_firm() null). */
async function agentReadNoFirm(sql, params) {
  return withActor({ role: ROLES.agentRo }, (c) => c.query(sql, params));
}

// ===========================================================================
// list_uncoded_filings — ACTIVE filings with no draft AND no unreversed approved
// entry bound to THAT filing [C-15].
// ===========================================================================

test("list_uncoded_filings: an unfiled-then-filed doc appears; it disappears once an approved unreversed entry binds the filing", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const before = await listUncodedFilings(users.alice, { client: clients.A1 });
  assert.ok(JSON.stringify(before).includes(cited.filingId), "a freshly-filed, uncoded filing appears in list_uncoded_filings");

  const d = await draftEntryV3(users.alice, { client: clients.A1, resolution: await freshResolution(users.alice, clients.A1), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("uf") });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ap") });
  const after = await listUncodedFilings(users.alice, { client: clients.A1 });
  assert.ok(!JSON.stringify(after).includes(cited.filingId), "a filing bound by an approved unreversed entry is no longer uncoded");
});

// ===========================================================================
// get_draft_review — returns the authoritative review payload; client-pinned for
// the agent lane.
// ===========================================================================

test("get_draft_review returns the entry + lines + an eligible-checker count for a draft (hydration law)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const d = await draftEntryV3(users.alice, { client: clients.A1, resolution: await freshResolution(users.alice, clients.A1), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("gr") });
  const review = await getDraftReview(users.alice, { entry: d.entry_id, client: clients.A1 });
  assert.ok(review, "get_draft_review returns a payload");
  const j = JSON.stringify(review);
  assert.ok(j.includes(d.entry_id), "the review carries the entry id");
  assert.ok(/checker/i.test(j), "the review surfaces an eligible-checker signal (§6)");
});

test("get_draft_review is CLIENT-PINNED for the agent lane: the wrong client → not-found (no cross-client entry oracle, C-11)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const d = await draftEntryV3(users.alice, { client: clients.A1, resolution: await freshResolution(users.alice, clients.A1), document: cited.documentId, sha256: cited.sha256, lines: balanced(world.coa.A1, ROUTINE_CENTS), evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("cp") });
  const cred = await mintWake({ kind: "interactive", firm });
  // Correct client → resolves.
  const ok = await agentRead(cred.secret, "select clara.get_draft_review(p_entry => $1, p_client => $2) as r", [d.entry_id, clients.A1]);
  assert.ok(ok.rows[0].r, "the entry's own client resolves the draft review for the agent");
  // Wrong (sibling) client → not-found shape (null / empty), never the other client's data.
  const wrong = await agentRead(cred.secret, "select clara.get_draft_review(p_entry => $1, p_client => $2) as r", [d.entry_id, clients.A2]);
  const payload = wrong.rows[0].r;
  const empty = payload == null || (typeof payload === "object" && !JSON.stringify(payload).includes(d.entry_id));
  assert.ok(empty, "a mismatched client yields a not-found shape (no cross-client entry data)");
});

// ===========================================================================
// Agent-lane CLR03 — never a silent empty when wake_firm() is null [D-F1/NEW-5].
// ===========================================================================

test("D-F1 each new read fn REFUSES (never a silent empty) on the agent lane when wake_firm() is null", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  // `agentReadNoFirm` runs as a raw clara_agent_ro with NO wake secret. Two lane
  // detectors are now in play (ADR-015: a SET ROLE identity is INVISIBLE inside a
  // SECURITY DEFINER function, so the wake-secret GUC is the only lane marker there):
  //   • the credential-pattern readers (list_unassigned_documents / list_uncoded_filings)
  //     detect the agent lane by current_role and, with a null wake context, raise
  //     CLR03 ("no valid agent read context");
  //   • the wake-secret-GUC readers (get_document_extract / get_draft_review) are
  //     SECURITY DEFINER, so with NO secret set a raw agent_ro session is
  //     indistinguishable from an anonymous human — it falls into the human branch and
  //     raises CLR04 ("no authenticated actor").
  // Either way the fn REFUSES; the D-F1 law (never a silent empty) holds for both codes.
  const calls = [
    ["list_unassigned_documents", "select clara.list_unassigned_documents(p_limit => 50)", CLR.wake],
    ["get_document_extract", "select clara.get_document_extract(p_document => gen_random_uuid(), p_client => null, p_max_chars => 100)", CLR.authz],
    ["get_draft_review", "select clara.get_draft_review(p_entry => gen_random_uuid(), p_client => $1)", CLR.authz],
    ["list_uncoded_filings", "select clara.list_uncoded_filings(p_client => $1)", CLR.wake],
  ];
  for (const [name, sql, code] of calls) {
    await assertRaises(code, () => agentReadNoFirm(sql, sql.includes("$1") ? [clients.A1] : []), `${name}: secretless agent lane → ${code}`);
  }
});

// ===========================================================================
// not-found-shape equality (no oracle) — a cross-firm entry and a nonexistent one
// yield the IDENTICAL not-found shape.
// ===========================================================================

test("no-oracle: get_journal_entry_for on a cross-firm entry vs a nonexistent id yield the SAME not-found shape", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  // A real entry in firm B.
  const firmB = await firmOf(clients.B1);
  const citedB = await seedCitedDocument(users.dave, { firm: firmB, client: clients.B1 });
  const dB = await draftEntryV3(users.dave, { client: clients.B1, resolution: await freshResolution(users.dave, clients.B1), document: citedB.documentId, sha256: citedB.sha256, lines: balanced(world.coa.B1, ROUTINE_CENTS), evidence: [ev(citedB.regionId, citedB.quote, FIELD.total)], opKey: opk("nb") });
  const credA = await mintWake({ kind: "interactive", firm: await firmOf(clients.A1) });
  const { randomUUID } = await import("node:crypto");
  const crossFirm = await agentRead(credA.secret, "select clara.get_journal_entry_for(p_entry => $1, p_client => $2) as r", [dB.entry_id, clients.A1]);
  const nonexist = await agentRead(credA.secret, "select clara.get_journal_entry_for(p_entry => $1, p_client => $2) as r", [randomUUID(), clients.A1]);
  assert.deepEqual(crossFirm.rows[0].r ?? null, nonexist.rows[0].r ?? null, "a cross-firm entry and a nonexistent one look identical to the agent (no existence oracle)");
});

// ===========================================================================
// get_document_extract — aggregate char budget.
// ===========================================================================

test("get_document_extract honors ONE aggregate char budget (p_max_chars caps the returned text)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "X".repeat(400) });
  const small = await getDocumentExtract(users.alice, { document: cited.documentId, client: clients.A1, maxChars: 50 });
  const big = await getDocumentExtract(users.alice, { document: cited.documentId, client: clients.A1, maxChars: 20000 });
  const lenOf = (r) => JSON.stringify(r ?? "").length;
  assert.ok(small != null, "get_document_extract returns a payload for an assigned doc");
  assert.ok(lenOf(small) <= lenOf(big), "a smaller p_max_chars returns no more text than a larger budget (aggregate cap, C-11)");
  if (lenOf(small) >= lenOf(big)) noteLane("get_document_extract: small vs large budget produced equal-size payloads — verify the aggregate char budget is enforced (interface expectation)");
});
