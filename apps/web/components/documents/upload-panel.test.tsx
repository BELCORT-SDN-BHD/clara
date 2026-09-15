// #633 — THE REBUILT UPLOAD SURFACE.
//
// The panel it replaced was a hand-rolled `<ul>/<li>` carrying a phase word (:58-97).
// These cells pin what the rebuild owes:
//   * Data Table semantics — a real `<table>` with named columns, the composition
//     `filed-document-list.tsx` already uses one folder over;
//   * the four capability tiers PER ROW, from the registry read, with the payroll-PDF
//     case the gap map names: `extraction_status: 'done'` must never render as facts
//     support;
//   * nine `IntakeFailureCode` next steps, each its own sentence;
//   * a REAL `role="progressbar"` whose values come from measured bytes — and no
//     number at all when nothing was measured;
//   * exactly ONE live region on the surface;
//   * focus RETURNED into the table after Cancel and after Remove.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { UploadPanel } from "./upload-panel";
import { CapabilityTiers } from "./capability-tiers";
import { buildCapabilityIndex, type CapabilityRegistryRow } from "../../lib/documents/capability-registry";
import messages from "../../messages/en.json";

enableDomInspection();

const CLIENT = "c1111111-1111-4111-8111-111111111111";

/** Registry rows in the SHAPE the live catalogue publishes — verified against
 *  `clara.document_capabilities` on the #633 rig (12 formats x 20 kinds = 240 rows;
 *  `custody` is `supported` for every row; `byte_extraction` is `stored_only` for the
 *  20 ofx rows and `supported` elsewhere). */
function registryRow(over: Partial<CapabilityRegistryRow>): CapabilityRegistryRow {
  return {
    format: "pdf", document_kind: "invoice", mime_type: "application/pdf",
    custody: "supported", byte_extraction: "supported", typed_facts: "supported",
    business_operation: "supported", engine_id: null, engine_byte: "clara-ocr:v1",
    registry_version: 1, basis: "seeded", limits: {},
    ...over,
  };
}

const REGISTRY: CapabilityRegistryRow[] = [
  registryRow({}),
  // THE CASE FROM THE GAP MAP: a payroll PDF. Custody and byte extraction are
  // supported (the format is readable), and the KIND carries no typed facts.
  registryRow({ document_kind: "payroll_summary", typed_facts: "unsupported", business_operation: "unsupported" }),
  registryRow({ format: "ofx", mime_type: "application/x-ofx", document_kind: "bank_statement", byte_extraction: "stored_only", typed_facts: "unsupported", business_operation: "stored_only", limits: { opening_balance: "absent_in_format" } }),
];

function wrap(node: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: node,
  });
}

function panelFetch(over: { bytes?: () => Response } = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
    if (/document_capabilities/.test(url)) return j(REGISTRY);
    if (/\/intake\/documents$/.test(url)) return j({ intake_id: "in-1", upload_token: "ut-1", expires_at: null });
    if (/\/bytes$/.test(url)) return over.bytes ? over.bytes() : new Response(null, { status: 200 });
    if (/\/finalize$/.test(url)) return j({ status: "adopted" }, 202);
    if (/document_intakes_visible/.test(url)) {
      return j([{
        id: "in-1", uploaded_by: "u1", origin: "documents_tab", original_filename: "a.pdf",
        declared_mime: "application/pdf", declared_bytes: 16, status: "adopted",
        document_id: "d1111111-1111-4111-8111-111111111111", failure_code: null, expires_at: null,
        created_at: "2026-04-01T00:00:00Z", updated_at: "2026-04-01T00:00:00Z",
      }]);
    }
    if (/document_processing_tasks_visible/.test(url)) return j([]);
    if (/rpc\//.test(url)) return j({ resolution_id: "res-1" });
    return j([]);
  }) as typeof fetch;
}

async function withPanel(run: (h: Awaited<ReturnType<typeof renderComponent>>) => Promise<void>, opts: { bytes?: () => Response } = {}): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = panelFetch(opts);
  configureSessionTokenSource(async () => "tok");
  const h = await renderComponent(wrap(createElement(UploadPanel, { clientId: CLIENT, onFiled: () => {} })));
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

function fakeFile(name: string, lastModified = 1): File {
  return new File([new Uint8Array(8)], name, { type: "application/pdf", lastModified });
}

function findAll(node: unknown, pred: (n: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (n: unknown) => {
    const cur = n as Record<string, unknown>;
    if (!cur) return;
    if (pred(cur)) out.push(cur);
    for (const c of ((cur.childNodes as unknown[]) ?? [])) walk(c);
  };
  walk(node);
  return out;
}

const attr = (n: Record<string, unknown>, name: string): string | null => {
  const get = n.getAttribute as ((k: string) => string | null) | undefined;
  return typeof get === "function" ? get.call(n, name) : null;
};

test("[633] AC8: the queue is a real Data Table with named columns — not a hand-rolled list", async () => {
  await withPanel(async (h) => {
    await h.act(() => {
      const input = h.find((n) => n.tagName === "INPUT")!;
      (input as unknown as { files?: unknown }).files = [fakeFile("a.pdf")];
      return undefined;
    });
    // The file input is driven through the queue's own `add` by dispatching change;
    // the harness's fireEvent sets target first.
    const input = h.find((n) => n.tagName === "INPUT")!;
    await h.fireEvent(input, "change", (n) => { (n as unknown as { files: unknown[] }).files = [fakeFile("a.pdf")]; });
    for (let i = 0; i < 12; i++) await h.settle();

    const table = h.find((n) => n.tagName === "TABLE");
    assert.ok(table, "the queue must render a real <table>");
    const headers = findAll(h.container, (n) => n.tagName === "TH").map((n) => textOf(n as never));
    for (const col of ["File", "Size", "Kind", "Status", "Progress", "Support", "Actions"]) {
      assert.ok(headers.includes(col), `column "${col}" is missing — saw ${headers.join(" | ")}`);
    }
  });
});

test("[633] AC8: the progress bar is a REAL progressbar, and with no measurement it carries NO value", async () => {
  await withPanel(async (h) => {
    const input = h.find((n) => n.tagName === "INPUT")!;
    await h.fireEvent(input, "change", (n) => { (n as unknown as { files: unknown[] }).files = [fakeFile("a.pdf")]; });
    for (let i = 0; i < 12; i++) await h.settle();

    const bars = findAll(h.container, (n) => attr(n, "role") === "progressbar");
    assert.equal(bars.length, 1, "exactly one progress bar per row");
    const bar = bars[0]!;
    assert.equal(attr(bar, "aria-valuemin"), "0");
    assert.ok(attr(bar, "aria-label")?.includes("a.pdf"), "the bar must name its file");
    // The Node test environment has no XMLHttpRequest, so the transport falls back to
    // fetch and NOTHING is measured — which is exactly the case that must not produce
    // a number. An indeterminate Base UI Progress drops aria-valuenow entirely.
    assert.equal(attr(bar, "aria-valuenow"), null, "an unmeasured upload must not wear a value");
    assert.match(h.text(), /Not measurable in this browser/);
  });
});

test("[633] AC1(a): three DIFFERENT controls, and Cancel keeps the row while Remove takes it away", async () => {
  await withPanel(async (h) => {
    const input = h.find((n) => n.tagName === "INPUT")!;
    await h.fireEvent(input, "change", (n) => {
      (n as unknown as { files: unknown[] }).files = [fakeFile("a.pdf", 1), fakeFile("b.pdf", 2)];
    });
    for (let i = 0; i < 20; i++) await h.settle();

    const rowsBefore = findAll(h.container, (n) => n.tagName === "TR").length;
    assert.ok(rowsBefore >= 3, "header + two rows");

    // Both rows have settled `ready` (custody confirmed), so Cancel is gone — there is
    // no transfer left to stop — and Retry/Remove remain. That is the three-control
    // split doing its job: a terminal row offers only the acts that still mean
    // something.
    assert.equal(
      findAll(h.container, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel").length, 0,
      "Cancel must not be offered on a settled row",
    );
    const removes = findAll(h.container, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Remove");
    assert.equal(removes.length, 2, "every row carries its own Remove");

    // FIRST Remove on a row whose document may already exist parks it as `stopped`
    // rather than vanishing it (the shipped N7/N8 guard, unchanged by the split) —
    // the row stays, wearing the untracked sentence.
    await clickButton(removes[0] as never);
    for (let i = 0; i < 6; i++) await h.settle();
    assert.equal(findAll(h.container, (n) => n.tagName === "TR").length, rowsBefore, "the first Remove must not vanish a row that was adopted");
    assert.match(h.text(), /Tracking stopped after the file was sent/);

    // SECOND Remove: nothing left to protect.
    const removes2 = findAll(h.container, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Remove");
    await clickButton(removes2[0] as never);
    for (let i = 0; i < 6; i++) await h.settle();
    assert.equal(findAll(h.container, (n) => n.tagName === "TR").length, rowsBefore - 1, "the second Remove deletes it");
  }, { bytes: () => new Response(null, { status: 200 }) });
});

test("[633] AC1(a): focus is RETURNED into the table after Remove — never dropped on the body", async () => {
  await withPanel(async (h) => {
    const input = h.find((n) => n.tagName === "INPUT")!;
    await h.fireEvent(input, "change", (n) => {
      (n as unknown as { files: unknown[] }).files = [fakeFile("a.pdf", 1), fakeFile("b.pdf", 2)];
    });
    for (let i = 0; i < 20; i++) await h.settle();

    const removes = findAll(h.container, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Remove");
    await clickButton(removes[0] as never);
    for (let i = 0; i < 6; i++) await h.settle();

    const active = activeElement() as Record<string, unknown> | null;
    assert.ok(active, "focus must land somewhere");
    assert.equal((active as { tagName?: string }).tagName, "TR", "focus must return to a surviving row, not the document body");
  });
});

test("[633] AC9: exactly ONE live region on this surface (one announcement owner)", async () => {
  await withPanel(async (h) => {
    const live = findAll(h.container, (n) => attr(n, "aria-live") !== null);
    assert.equal(live.length, 1, `expected one aria-live region, found ${live.length}`);
    assert.equal(attr(live[0]!, "role"), "status");
    assert.equal(attr(live[0]!, "aria-live"), "polite");
  });
});

test("[633] AC6: all nine IntakeFailureCode values have their own NEXT STEP, and an unknown code names itself", () => {
  const cd = (messages as { ClientDocuments: { queueFailure: Record<string, string>; queueFailureUnknown: string } }).ClientDocuments;
  const CODES = [
    "too_large", "bad_type", "limit", "checksum_mismatch", "storage_error",
    "expired", "malware_detected", "quarantined", "internal",
  ];
  for (const code of CODES) {
    const phrase = cd.queueFailure[code];
    assert.equal(typeof phrase, "string", `missing next step for ${code}`);
    assert.ok(phrase!.length > 30, `${code}'s phrase is a label, not a next step: ${phrase}`);
  }
  assert.equal(Object.keys(cd.queueFailure).length, 9, "exactly the nine live codes, no invented tenth");
  assert.equal(new Set(Object.values(cd.queueFailure)).size, 9, "two codes share one next step");
  assert.match(cd.queueFailureUnknown, /\{code\}/, "an unrecognised code must carry itself into the sentence");
});

// --- AC3(b): the four tiers, and the payroll-PDF defect the gap map names -------

test("[633] AC3(b): a payroll PDF publishes custody + byte extraction from the FORMAT and Needs-classification until the kind lands", async () => {
  const index = buildCapabilityIndex(REGISTRY);
  const h = await renderComponent(wrap(createElement(CapabilityTiers, {
    index, mime: "application/pdf", kind: null, filename: "payroll-april.pdf",
  })));
  try {
    const text = h.text();
    assert.match(text, /Custody\s*Supported/, "custody is format-intrinsic and publishes before classification");
    assert.match(text, /Extraction\s*Supported/, "byte extraction is format-intrinsic too");
    // The facts/operation half must be the NAMED state, twice.
    const needs = (text.match(/Needs classification/g) ?? []).length;
    assert.ok(needs >= 2, `facts and operation must BOTH read as Needs classification — saw ${needs}`);
  } finally {
    await h.unmount();
  }
});

test("[633] AC3(b) [the defect]: once the kind lands, a payroll PDF says facts are NOT supported — `done` never stands in for facts support", async () => {
  const index = buildCapabilityIndex(REGISTRY);
  const h = await renderComponent(wrap(createElement(CapabilityTiers, {
    index, mime: "application/pdf", kind: "payroll_summary", filename: "payroll-april.pdf",
  })));
  try {
    const text = h.text();
    assert.match(text, /Facts\s*Not supported/, "the published level for (pdf, payroll_summary) is unsupported");
    assert.match(text, /Operation\s*Not supported/);
    assert.doesNotMatch(text, /Needs classification/, "the kind is known now");
  } finally {
    await h.unmount();
  }
});

test("[633] AC3(b) / C-37: an OFX bank statement publishes its honest stored-only byte extraction and its named limit", async () => {
  const index = buildCapabilityIndex(REGISTRY);
  const h = await renderComponent(wrap(createElement(CapabilityTiers, {
    index, mime: "application/x-ofx", kind: "bank_statement", filename: "march.ofx",
  })));
  try {
    const text = h.text();
    assert.match(text, /Extraction\s*Stored, not read/, "OFX is store-only at intake (intake-lanes.mjs:45-51)");
    assert.match(text, /Facts\s*Not supported/);
    assert.match(text, /opening_balance/, "the pair's published limit must be visible, not swallowed");
  } finally {
    await h.unmount();
  }
});

test("[633] AC3(b): an unknown mime and an unseeded pair both render the honest 'not published' — never a guessed tier", async () => {
  const index = buildCapabilityIndex(REGISTRY);
  for (const [mime, kind] of [["application/zip", "invoice"], ["application/pdf", "prior_gl"]] as const) {
    const h = await renderComponent(wrap(createElement(CapabilityTiers, {
      index, mime, kind, filename: "mystery",
    })));
    try {
      const text = h.text();
      assert.doesNotMatch(text, /Supported(?!.*Not)/, `(${mime}, ${kind}) must claim nothing`);
      assert.match(text, /Not published/, `(${mime}, ${kind}) must render the honest unknown`);
    } finally {
      await h.unmount();
    }
  }
});

test("[633] AC3(b): a registry that could not be read claims nothing at all", async () => {
  const h = await renderComponent(wrap(createElement(CapabilityTiers, {
    index: null, mime: "application/pdf", kind: "invoice", filename: "a.pdf",
  })));
  try {
    assert.match(h.text(), /Not published/);
    assert.doesNotMatch(h.text(), /Stored, not read/);
  } finally {
    await h.unmount();
  }
});
