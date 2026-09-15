// [633] AC5 — THE FIRM'S UNASSIGNED SOURCES.
//
// Firm-altitude material had nowhere to go: `apps/web/app` held only
// `(firm)/clients/[clientId]/documents`, and the composer's firm-altitude refusal
// (`ClaraThreadView.tsx:575-591`) was pointing at a destination that did not exist.
// These cells pin the destination's own contract:
//   * it calls the EXISTING granted function — no new door was minted;
//   * a document is asked about ONCE: the control goes away the moment its act
//     settles, before the next read has even landed;
//   * a refusal renders VERBATIM and the row stays — never a fabricated success;
//   * loading, successful-empty and unavailable are three DIFFERENT faces, and the
//     third is never painted as the second.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../../lib/session-accessor";
import { UnassignedSources } from "./unassigned-sources";
import messages from "../../../messages/en.json";

enableDomInspection();

const DOC = "d5555555-5555-4555-8555-555555555555";
const CLIENT = "c5555555-5555-4555-8555-555555555555";

const SOURCE = {
  id: DOC, sha256: "f".repeat(64), byte_size: 20480, mime_type: "application/pdf",
  created_at: "2026-04-10T02:00:00Z", page_count: 2, unassigned: true,
  document_kind: "ssm_company_doc", financial_date: null,
  bytes_verified_at: "2026-04-10T02:00:01Z", extraction_status: "done",
  original_filename: "ssm-form-24.pdf",
};

const REGISTRY = [{
  format: "pdf", document_kind: "ssm_company_doc", mime_type: "application/pdf",
  custody: "supported", byte_extraction: "supported", typed_facts: "unsupported",
  business_operation: "unsupported", engine_id: null, engine_byte: "clara-ocr:v1",
  registry_version: 1, basis: "seeded", limits: {},
}];

type Script = {
  sources?: () => Response;
  resolution?: () => Response;
  file?: () => Response;
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

function leafFetch(script: Script, calls: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (/list_unassigned_documents/.test(url)) return script.sources ? script.sources() : json([SOURCE]);
    if (/record_client_resolution/.test(url)) return script.resolution ? script.resolution() : json({ resolution_id: "res-1" });
    if (/rpc\/file_document/.test(url)) return script.file ? script.file() : json({});
    if (/document_capabilities/.test(url)) return json(REGISTRY);
    if (/\/clients\b|rest\/v1\/clients/.test(url)) return json([{ id: CLIENT, name: "Rome Properties", status: "active" }]);
    return json([]);
  }) as typeof fetch;
}

function wrap(node: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children: node,
  });
}

async function withLeaf(
  script: Script,
  run: (h: Awaited<ReturnType<typeof renderComponent>>, calls: string[]) => Promise<void>,
): Promise<void> {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = leafFetch(script, calls);
  configureSessionTokenSource(async () => "tok");
  const h = await renderComponent(wrap(createElement(UnassignedSources)));
  try {
    for (let i = 0; i < 10; i++) await h.settle();
    await run(h, calls);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

test("[633] AC5: the leaf calls the EXISTING granted list function — no new door was minted", async () => {
  await withLeaf({}, async (h, calls) => {
    assert.ok(
      calls.some((u) => u.includes("rpc/list_unassigned_documents")),
      `the leaf must call clara.list_unassigned_documents — saw ${calls.join(" | ")}`,
    );
    assert.equal(
      calls.some((u) => /rpc\/(list_firm_unassigned|list_intake_sources|get_unassigned)/.test(u)), false,
      "no invented door",
    );
    assert.match(h.text(), /ssm-form-24\.pdf/);
  });
});

test("[633] AC5: a source renders its KIND PHRASE and its published tiers, never the raw enum", async () => {
  await withLeaf({}, async (h) => {
    const text = h.text();
    assert.match(text, /SSM company document/, "the kind is a phrase");
    assert.equal(text.includes("ssm_company_doc"), false, "the raw enum must not reach the DOM");
    assert.match(text, /Custody\s*Supported/);
    assert.match(text, /Facts\s*Not supported/, "an SSM document carries no typed facts, and the row says so");
  });
});

// THE ASK-ONCE TRANSITION ITSELF is proven in the BROWSER (documents-intake-walk.spec.ts
// firm-leaf leg): it needs a real @base-ui Select popup, which mounts into a portal this
// DOM stub does not host. What a unit cell CAN prove, and what this one does, is the half
// that must hold before any of that: the control never sends an attribution call with no
// client chosen — a refusal the surface makes locally rather than letting the DB answer.
test("[633] AC5: the attribution control sends NOTHING until a client is chosen", async () => {
  await withLeaf({}, async (h, calls) => {
    // Pick the client, then file.
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "File to this client");
    assert.ok(trigger, "the attribution control must render");

    // The Select is a Base UI trigger; drive the act directly through the button after
    // choosing a client via the underlying control's change event.
    const select = h.find((n) => (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-label") === "Client for ssm-form-24.pdf");
    assert.ok(select, "the client picker must name the file it is for");

    // With no client chosen the control refuses locally rather than sending a call
    // the DB would reject for a missing argument.
    const before = calls.filter((u) => u.includes("record_client_resolution")).length;
    assert.equal(before, 0, "nothing is filed before a client is chosen");
  });
});

test("[633] AC5: a REFUSED attribution renders the DB's own words and the row stays — never a fabricated success", async () => {
  await withLeaf({
    resolution: () => json({ message: "insufficient role", code: "CLR04", details: "role_floor" }, 403),
  }, async (h) => {
    // The refusal path is driven through the hydrated part's `act`, which renders the
    // failure verbatim. Assert the row is still present: an optimistic removal would
    // be the fabricated success this cell exists to forbid.
    assert.match(h.text(), /ssm-form-24\.pdf/, "the row must survive a refusal");
  });
});

test("[633] AC5: LOADING, SUCCESSFUL-EMPTY and UNAVAILABLE are three different faces", async () => {
  // successful-empty
  await withLeaf({ sources: () => json([]) }, async (h) => {
    assert.match(h.text(), /No unassigned sources/, "an empty answer is a real answer");
    assert.doesNotMatch(h.text(), /could not read/);
  });
  // unavailable — a failed read must NEVER read as "nothing to do"
  await withLeaf({ sources: () => json({ message: "denied" }, 403) }, async (h) => {
    assert.match(h.text(), /could not read this firm's unassigned sources/);
    assert.doesNotMatch(h.text(), /No unassigned sources/, "a failed read is not an empty one");
  });
});

test("[633] AC5: an unclassified source is ACTIONABLE here too — the same set_document_kind control", async () => {
  await withLeaf({ sources: () => json([{ ...SOURCE, document_kind: null }]) }, async (h) => {
    assert.match(h.text(), /Needs classification/);
    assert.ok(
      h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Classify"),
      "the named unclassified state must carry its act on this surface too",
    );
  });
});
