// doors.ts — the client Documents workbench's governed writers. Mocked-fetch style
// ported from lib/doors.test.ts's own precedent: the property under test is that
// each door posts the RIGHT rpc name + args, that a composite door (fileToClient)
// propagates a mid-sequence refusal VERBATIM without attempting its second call, and
// that every refusal is distinguishable from an ordinary failure — never re-derived
// (the CLR/status ordering itself stays proven in wire.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recordDocumentResolution, fileDocument, fileToClient, retireFiling, confirmCandidate,
  dismissCandidate, setDocumentKind, placeLegalHold, releaseLegalHold,
  proposeCorrection, approveCorrection,
  requestAutodraft, requestReextraction, classifyConsentEvidenceDocument,
} from "./doors";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

function session(): SessionTokenAccessor {
  return { getAccessToken: async () => "tok" };
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function refusal(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), { status: 400, headers: { "content-type": "application/json" } });
}
function rpcName(url: RequestInfo | URL): string {
  return String(url).split("/rpc/")[1] ?? "";
}

// --- rpc name + args, one per door -----------------------------------------------

test("recordDocumentResolution: posts record_client_resolution with method 'human' and returns resolution_id", async () => {
  let seenFn = ""; let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenFn = rpcName(url);
      seenBody = JSON.parse(String(init?.body));
      return okJson({ resolution_id: "res-1" });
    },
    async () => {
      const id = await recordDocumentResolution("doc-1", "client-1", "documents_tab", { session: session() });
      assert.equal(id, "res-1");
    },
  );
  assert.equal(seenFn, "record_client_resolution");
  assert.deepEqual(
    { ...seenBody as object, p_op_key: undefined },
    { p_client: "client-1", p_subject_kind: "document", p_subject: "doc-1", p_confidence: 1.0, p_method: "human", p_evidence: { source: "documents_tab" }, p_op_key: undefined },
  );
});

test("recordDocumentResolution: a response with no resolution_id throws (never fabricates one)", async () => {
  await withMockedFetch(
    async () => okJson({}),
    async () => {
      await assert.rejects(recordDocumentResolution("doc-1", "client-1", "x", { session: session() }), /no resolution_id/);
    },
  );
});

test("fileDocument: posts file_document with the three ids", async () => {
  let seenFn = ""; let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return okJson(null); },
    async () => { await fileDocument("doc-1", "client-1", "res-1", { session: session() }); },
  );
  assert.equal(seenFn, "file_document");
  assert.equal((seenBody as Record<string, unknown>).p_document, "doc-1");
  assert.equal((seenBody as Record<string, unknown>).p_client, "client-1");
  assert.equal((seenBody as Record<string, unknown>).p_resolution, "res-1");
});

test("fileToClient: record then file, in order (two calls, second uses the first's resolution_id)", async () => {
  const calls: string[] = [];
  let seenFileArgs: unknown;
  await withMockedFetch(
    async (url, init) => {
      const fn = rpcName(url);
      calls.push(fn);
      if (fn === "record_client_resolution") return okJson({ resolution_id: "res-9" });
      seenFileArgs = JSON.parse(String(init?.body));
      return okJson(null);
    },
    async () => { await fileToClient("doc-1", "client-1", "upload", { session: session() }); },
  );
  assert.deepEqual(calls, ["record_client_resolution", "file_document"]);
  assert.equal((seenFileArgs as Record<string, unknown>).p_resolution, "res-9");
});

test("fileToClient: a refusal on record_client_resolution propagates VERBATIM and file_document is NEVER called", async () => {
  const calls: string[] = [];
  await withMockedFetch(
    async (url) => { calls.push(rpcName(url)); return refusal("CLR01", "CLR01: client attribution not established."); },
    async () => {
      await assert.rejects(
        fileToClient("doc-1", "client-1", "upload", { session: session() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR01"); return true; },
      );
    },
  );
  assert.deepEqual(calls, ["record_client_resolution"], "file_document must never be attempted after the record step refuses");
});

test("retireFiling: posts retire_document_filing with reason + expected revision", async () => {
  let seenBody: unknown;
  await withMockedFetch(
    async (_url, init) => { seenBody = JSON.parse(String(init?.body)); return okJson(null); },
    async () => { await retireFiling("filing-1", "wrong client", "rev-1", { session: session() }); },
  );
  assert.equal((seenBody as Record<string, unknown>).p_filing_id, "filing-1");
  assert.equal((seenBody as Record<string, unknown>).p_expected_revision, "rev-1");
});

test("confirmCandidate: posts confirm_attribution_candidate with p_file_document: true", async () => {
  let seenBody: unknown;
  await withMockedFetch(
    async (_url, init) => { seenBody = JSON.parse(String(init?.body)); return okJson(null); },
    async () => { await confirmCandidate("cand-1", { session: session() }); },
  );
  assert.equal((seenBody as Record<string, unknown>).p_file_document, true);
});

test("dismissCandidate: posts dismiss_attribution_candidate", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson(null); },
    async () => { await dismissCandidate("cand-1", { session: session() }); },
  );
  assert.equal(seenFn, "dismiss_attribution_candidate");
});

test("setDocumentKind: refuses honestly (CLR10) when the DB requires a reason and none survives — surfaced verbatim, not swallowed", async () => {
  await withMockedFetch(
    async () => refusal("CLR10", "CLR10: a reason is required."),
    async () => {
      await assert.rejects(
        setDocumentKind("doc-1", "invoice", "", { session: session() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); return true; },
      );
    },
  );
});

test("placeLegalHold / releaseLegalHold: post the matching rpc name", async () => {
  let seenFn = "";
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson(null); },
    async () => { await placeLegalHold("doc-1", "compliance hold", { session: session() }); },
  );
  assert.equal(seenFn, "place_legal_hold");
  await withMockedFetch(
    async (url) => { seenFn = rpcName(url); return okJson(null); },
    async () => { await releaseLegalHold("doc-1", "resolved", { session: session() }); },
  );
  assert.equal(seenFn, "release_legal_hold");
});

// --- correction wizard: propose/approve, refusal verbatim ------------------------

test("proposeCorrection: posts propose_wrong_client_correction with a reason and returns the plan", async () => {
  await withMockedFetch(
    async () => okJson({ correction_id: "corr-1", plan_hash: "hash", books_version: 3, status: "proposed" }),
    async () => {
      const out = await proposeCorrection("doc-1", "c1", "c2", "wrong client", { session: session() });
      assert.equal(out.correction_id, "corr-1");
      assert.equal(out.status, "proposed");
    },
  );
});

test("approveCorrection: a distinct-checker refusal (CLR19) surfaces VERBATIM, never retried", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => { attempts += 1; return refusal("CLR19", "CLR19: approval needs a distinct eligible checker."); },
    async () => {
      await assert.rejects(
        approveCorrection("corr-1", "hash", null, { session: session() }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          assert.equal((e as { code: string }).code, "CLR19");
          assert.equal((e as { message: string }).message, "CLR19: approval needs a distinct eligible checker.");
          return true;
        },
      );
    },
  );
  assert.equal(attempts, 1);
});

// --- T6: request_autodraft / request_reextraction / classify_consent_evidence ----

test("requestAutodraft: posts request_autodraft with p_filing and normalizes a real 200 outcome envelope", async () => {
  let seenFn = ""; let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => { seenFn = rpcName(url); seenBody = JSON.parse(String(init?.body)); return okJson({ outcome: "admitted", task_id: "task-1" }); },
    async () => {
      const out = await requestAutodraft("filing-1", { session: session() });
      assert.equal(out.outcome, "admitted");
      assert.equal(out.task_id, "task-1");
      assert.equal(out.reason, null);
    },
  );
  assert.equal(seenFn, "request_autodraft");
  assert.deepEqual(seenBody, { p_filing: "filing-1" });
});

test("requestAutodraft: a real refusal (CLR11, no active filing) still surfaces as a DoorRefusal, distinct from a 200 hold outcome", async () => {
  await withMockedFetch(
    async () => refusal("CLR11", "CLR11: active filing not found"),
    async () => {
      await assert.rejects(
        requestAutodraft("filing-1", { session: session() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR11"); return true; },
      );
    },
  );
});

test("requestAutodraft: a 200 hold (refused_budget) is NOT thrown — the caller reads the outcome field", async () => {
  await withMockedFetch(
    async () => okJson({ outcome: "refused_budget", reason: "refused_budget" }),
    async () => {
      const out = await requestAutodraft("filing-1", { session: session() });
      assert.equal(out.outcome, "refused_budget");
      assert.equal(out.reason, "refused_budget");
    },
  );
});

test("requestReextraction: posts request_reextraction with document/reason/op_key and returns the admission envelope", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenFn = rpcName(url);
      seenBody = JSON.parse(String(init?.body));
      return okJson({ task_id: "task-2", document_id: "doc-1", version_n: 2, status: "queued", reused: false, admission: "reextraction" });
    },
    async () => {
      const out = await requestReextraction("doc-1", "wrong invoice amount extracted", { session: session() });
      assert.equal(out.admission, "reextraction");
      assert.equal(out.version_n, 2);
      assert.equal(out.reused, false);
    },
  );
  assert.equal(seenFn, "request_reextraction");
  assert.equal(seenBody.p_document, "doc-1");
  assert.equal(seenBody.p_reason, "wrong invoice amount extracted");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});

test("requestReextraction: CLR16 (no completed extraction to re-extract) surfaces verbatim", async () => {
  await withMockedFetch(
    async () => refusal("CLR16", "CLR16: no completed extraction to re-extract"),
    async () => {
      await assert.rejects(
        requestReextraction("doc-1", "x", { session: session() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR16"); return true; },
      );
    },
  );
});

test("classifyConsentEvidenceDocument: posts classify_consent_evidence_document with document/reason/op_key", async () => {
  let seenFn = ""; let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenFn = rpcName(url);
      seenBody = JSON.parse(String(init?.body));
      return okJson({ document_id: "doc-1", document_kind: "consent_evidence", prior_kind: "other" });
    },
    async () => {
      const out = await classifyConsentEvidenceDocument("doc-1", "client's signed PDPA consent letter", { session: session() });
      assert.equal(out.document_kind, "consent_evidence");
      assert.equal(out.prior_kind, "other");
    },
  );
  assert.equal(seenFn, "classify_consent_evidence_document");
  assert.equal(seenBody.p_document, "doc-1");
  assert.equal(seenBody.p_reason, "client's signed PDPA consent letter");
});

test("classifyConsentEvidenceDocument: CLR28 (evidence_kind_conflict — an owner acting on a coded document) surfaces verbatim", async () => {
  await withMockedFetch(
    async () => refusal("CLR28", "CLR28: consent evidence must be an unclassified, unplaced (other) or consent-evidence document, not a invoice"),
    async () => {
      await assert.rejects(
        classifyConsentEvidenceDocument("doc-1", "x", { session: session() }),
        (e: unknown) => { assert.ok(isDoorRefusal(e)); assert.equal((e as { code: string }).code, "CLR28"); return true; },
      );
    },
  );
});
