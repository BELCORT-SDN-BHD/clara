// documents/api.ts tests — Finding 3 (live-gate-run-2026-07-24): the classify control's
// wire client. Mocks globalThis.fetch (the openingApi.test.ts idiom) — no live DB.
//   - DOCUMENT_KINDS pins the exact documents_document_kind_check literal set (0016/0017)
//     the classify dropdown offers — a drift here would silently offer a kind the DB refuses,
//     or omit one it accepts.
//   - setDocumentKind calls the governed set_document_kind rpc with p_document/p_kind/
//     p_reason/p_op_key — a fresh op_key every call, the reason passed through VERBATIM
//     (never defaulted client-side — the DB requires one, CLR10 otherwise).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setDocumentKind, DOCUMENT_KINDS } from "./api";
import type { PgrestError } from "../shared/wire";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("DOCUMENT_KINDS pins the exact documents_document_kind_check literal set (0016/0017)", () => {
  assert.deepEqual(
    [...DOCUMENT_KINDS],
    [
      "invoice", "receipt", "credit_note", "debit_note", "bank_statement",
      "payment_voucher", "claim_form", "payroll_summary", "tax_correspondence",
      "ssm_company_doc", "agreement_contract", "e_invoice_xml", "management_account",
      "opening_balance_doc", "knowledge_artifact", "handwritten_note", "consent_evidence",
      "prior_gl", "other",
    ],
  );
});

test("setDocumentKind calls set_document_kind with p_document/p_kind/p_reason and a fresh op_key", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ document_id: "doc-1", document_kind: "opening_balance_doc" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await setDocumentKind("jwt", "doc-1", "opening_balance_doc", "confirmed against the SFP cover page");
  assert.ok(seenUrl.includes("/rpc/set_document_kind"));
  assert.equal(bodies[0]?.p_document, "doc-1");
  assert.equal(bodies[0]?.p_kind, "opening_balance_doc");
  assert.equal(bodies[0]?.p_reason, "confirmed against the SFP cover page", "the reason is passed through verbatim, never defaulted");
  assert.ok(typeof bodies[0]?.p_op_key === "string" && (bodies[0]?.p_op_key as string).length > 0);
});

test("setDocumentKind propagates a governed refusal (e.g. CLR10 missing reason) as a typed PgrestError", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes({ code: "CLR10", message: "a document and a reason are required" }, 400));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(
    () => setDocumentKind("jwt", "doc-1", "invoice", ""),
    (e: PgrestError) => {
      assert.equal(e.clr, "CLR10");
      assert.ok(e.message.includes("a document and a reason are required"), "the DB message renders verbatim");
      return true;
    },
  );
});
