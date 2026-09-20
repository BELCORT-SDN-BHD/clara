// #965 FIX ROUND (L05-SPEC-07) — THE RECEIPTS LIST NEVER SHOWS A RAW DATABASE TOKEN.
//
// WHY THIS FILE EXISTS NOW. Until #965's migration 0254, a file the daily ceiling refused at
// intake CREATION rolled its own `clara.document_intakes` row back, so no such row ever reached
// this table. 0254 commits it at `status='failed'` / `failure_code='limit'`, and
// `lib/documents/receipts.ts`'s `INTAKE_RECEIPT_COLS` already carries both columns — so every
// ceiling refusal now lands on the Documents tab's upload list with no web change at all. It
// arrived rendering the literal token `limit`, which is exactly what this component family's own
// rule forbids: the phrased next step already existed in `ClientDocuments.queueFailure`, it was
// simply not reachable from here.
//
// The upload QUEUE (`upload-panel.tsx`) and this DURABLE list are two surfaces over one
// vocabulary, so the closed map with an honest default lives in `lib/documents/failure-advice.ts`
// and both read it. A code this build has not met names itself inside a sentence rather than
// borrowing another code's advice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { IntakeReceipts } from "./intake-receipts";
import type { IntakeReceipt, IntakeReceiptsLoad } from "../../lib/documents/receipts";
import type { IntakeFailureCode } from "../../lib/documents/types";

enableDomInspection();

const receipt = (over: Partial<IntakeReceipt["intake"]> = {}): IntakeReceipt => ({
  intake: {
    id: "i1111111-1111-4111-8111-111111111111",
    uploaded_by: "u1111111-1111-4111-8111-111111111111",
    origin: "documents_tab",
    original_filename: "over-quota.pdf",
    declared_mime: "application/pdf",
    declared_bytes: 1048576,
    status: "failed",
    document_id: null,
    failure_code: "limit",
    expires_at: null,
    created_at: "2026-04-05T01:30:00Z",
    updated_at: "2026-04-05T01:30:00Z",
    ...over,
  } as IntakeReceipt["intake"],
  filedHere: true,
  unassigned: false,
  documentKind: null,
  mimeType: "application/pdf",
});

const load = (r: IntakeReceipt): IntakeReceiptsLoad => ({
  receipts: [r],
  readAt: "2026-04-05T02:00:00Z",
  unsettled: 0,
  derivation: {} as IntakeReceiptsLoad["derivation"],
});

async function render(r: IntakeReceipt) {
  const h = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(IntakeReceipts, {
      load: load(r), loading: false, err: null, clr: null, capabilityIndex: null,
      exhausted: false, onRefresh: () => {}, act: async () => true,
    } as never),
  }));
  for (let i = 0; i < 2; i += 1) await h.settle();
  return h;
}

test("intake receipts: a ceiling-refused row states the NEXT STEP, never the raw `limit` token", async () => {
  const h = await render(receipt());
  const text = textOf(h.container as never);
  assert.match(text, /over-quota\.pdf/, "the row is on the surface at all");
  assert.match(text, /reached its upload allowance for today/,
    "the phrased next step the catalogue already carries is what the firm reads");
  assert.ok(!/\blimit\b/.test(text),
    `the raw database token rendered on a user surface: ${text}`);
  await h.unmount();
});

test("intake receipts: every live failure code is phrased, and an unknown one names ITSELF in a sentence", async () => {
  // The nine codes are `IntakeFailureCode`'s own closed set; the honest default is the rule the
  // upload queue already follows (`upload-panel.test.tsx`'s own nine-code cell).
  const codes: IntakeFailureCode[] = [
    "too_large", "bad_type", "limit", "checksum_mismatch", "storage_error",
    "expired", "malware_detected", "quarantined", "internal",
  ];
  for (const code of codes) {
    const h = await render(receipt({ failure_code: code }));
    const text = textOf(h.container as never);
    const phrase = (messages as unknown as { ClientDocuments: { queueFailure: Record<string, string> } })
      .ClientDocuments.queueFailure[code];
    assert.ok(text.includes(phrase.slice(0, 40)),
      `the ${code} row does not carry its own phrased next step`);
    await h.unmount();
  }
  const odd = await render(receipt({ failure_code: "not_a_shipped_code" as IntakeFailureCode }));
  const oddText = textOf(odd.container as never);
  assert.match(oddText, /no advice for yet \(not_a_shipped_code\)/,
    "an unrecognised code names itself inside a sentence rather than borrowing another code's advice");
  await odd.unmount();
});
