// #631 — THE DIAGNOSTICS SECTION, under test. The FACES, over the shaping rules
// `lib/work/diagnostics.test.ts` proves in isolation.
//
// FIVE THINGS ONLY A MOUNTED SECTION CAN PROVE, and each has its own cell:
//   1. LOADING is a face, not a spinner: an `aria-busy` region with a named announcement, replaced
//      by a real answer — success, empty, denied or failed.
//   2. EMPTY, DENIED and UNREADABLE are THREE DIFFERENT ANSWERS. Collapsing any two would tell a
//      viewer "there are no steps" when the truth is "you may not see them", which is the exact
//      failure the refresh spec's Empty row forbids ("distinguish … unavailable capability").
//   3. A PARTIAL run — one whose trace stops before `settle` — says so, instead of reading as a
//      finished run that happened to record less.
//   4. NO PAYLOAD IS EVER RENDERED. The relation has no payload column, and this cell is the
//      positive control for the surface: a row carrying a refusal message with an email in it must
//      reach the screen with the DATABASE's own reason token and nothing else it was not given.
//   5. THE RE-READ IS A READ. It re-asks the door and never mutates.
//
// The section's `read` is INJECTED, which is how these cells drive `denied` and `unreadable`
// without a live PostgREST — the same door-stub posture the rest of this suite uses.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { WorkDiagnostics } from "./work-diagnostics";
import type { WorkTraceRead, WorkTraceRow } from "../../lib/work/diagnostics";
import messages from "../../messages/en.json";

const WORK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN = "wrun_01M2EG2KSV3XH86NA24B9162K4";

function row(over: Partial<WorkTraceRow> = {}): WorkTraceRow {
  return {
    id: `id_${over.seq ?? 1}`,
    run_id: RUN,
    seq: over.seq ?? 1,
    phase: "dispatch",
    capability_id: "accounting_work.model_segment",
    registry_version: "clara-capability-registry/v1",
    bundle_id: "clara-work/v3",
    bundle_digest: "345f2a38c3c8e128300fdf6af47d615285c8c278aea6db47283f5d85505d5bc4",
    instructions_id: "clara-work-instructions/v3",
    skills: ["journal-entry/v3"],
    tools_id: "clara-work-tools/v3",
    model_id: "gpt-5.6-terra",
    purpose: "accounting_work",
    authorization_id: "11111111-1111-4111-8111-111111111111",
    consent_ref: "22222222-2222-4222-8222-222222222222",
    activation_ref: "33333333-3333-4333-8333-333333333333",
    input_digest: "b".repeat(64),
    observed_revisions: {},
    started_at: "2026-09-14T02:00:00.000Z",
    ended_at: "2026-09-14T02:00:01.200Z",
    duration_ms: 1200,
    outcome: "ok",
    refusal: null,
    receipt_id: null,
    task_id: "44444444-4444-4444-8444-444444444444",
    ...over,
  };
}

const COMPLETE: WorkTraceRow[] = [
  row({ seq: 1, phase: "dispatch" }),
  row({ seq: 2, phase: "dispatch" }),
  row({ seq: 3, phase: "model_call" }),
  row({ seq: 4, phase: "tool_call", capability_id: "accounting_work.record_journal_entry", receipt_id: "55555555-5555-4555-8555-555555555555" }),
  row({ seq: 14, phase: "settle", capability_id: "accounting_work.settle" }),
];

function mount(read: () => Promise<WorkTraceRead>) {
  return renderComponent(
    createElement(
      NextIntlClientProvider,
      { locale: "en", messages, children: createElement(WorkDiagnostics, { workId: WORK, read: read as never }) },
    ),
  );
}

test("631.web.diag.loading a named loading face is replaced by a real answer", async () => {
  let release: ((v: WorkTraceRead) => void) | null = null;
  const pending = new Promise<WorkTraceRead>((resolve) => { release = resolve; });
  const h = await mount(() => pending);

  assert.ok(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-busy") === "true"), "the loading face is an aria-busy region");
  assert.match(h.text(), /Reading the execution trace/, "…with a named announcement, not a bare spinner");

  assert.ok(release, "the harness never handed back a resolver");
  (release as unknown as (v: WorkTraceRead) => void)({ kind: "ok", rows: COMPLETE });
  await h.settle();
  assert.equal(h.find((n) => (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-busy") === "true"), null, "the loading face is GONE once an answer arrives");
  assert.match(h.text(), /Latest run/);
  await h.unmount();
});

test("631.web.diag.faces empty, denied and unreadable are three DIFFERENT answers", async () => {
  const empty = await mount(async () => ({ kind: "ok", rows: [] }));
  await empty.settle();
  assert.match(empty.text(), /No steps have been recorded/, "EMPTY says the run has recorded nothing yet");
  assert.doesNotMatch(empty.text(), /do not have access/);
  await empty.unmount();

  const denied = await mount(async () => ({ kind: "denied" }));
  await denied.settle();
  assert.match(denied.text(), /do not have access to diagnostics/, "DENIED says you may not see this");
  assert.match(denied.text(), /bookkeepers and above/, "…and names the floor, so it is actionable");
  assert.doesNotMatch(denied.text(), /No steps have been recorded/, "…and never masquerades as empty");
  await denied.unmount();

  const failed = await mount(async () => ({ kind: "unreadable", message: "connection reset" }));
  await failed.settle();
  assert.match(failed.text(), /could not be read/, "UNREADABLE keeps its own face");
  assert.match(failed.text(), /connection reset/, "…and its message, so the fault is diagnosable");
  assert.match(failed.text(), /the result above is still the authoritative record/,
    "…and says the Work itself is unaffected, which is the honest reading");
  await failed.unmount();
});

test("631.web.diag.summary a complete run says a model was called; a refused one says it was not", async () => {
  const ok = await mount(async () => ({ kind: "ok", rows: COMPLETE }));
  await ok.settle();
  assert.match(ok.text(), /A model was called for this client under an authorisation consumed for this run/);
  assert.doesNotMatch(ok.text(), /has not settled yet/, "a settled run is not labelled as still running");
  await ok.unmount();

  const refused = await mount(async () => ({
    kind: "ok",
    rows: [
      row({ seq: 1, phase: "dispatch" }),
      row({ seq: 2, phase: "dispatch", outcome: "refused", refusal: { reason: "egress_not_authorized" } }),
      row({ seq: 14, phase: "settle", outcome: "refused", capability_id: "accounting_work.settle" }),
    ],
  }));
  await refused.settle();
  assert.match(refused.text(), /No model was called: the run stopped before anything was sent/,
    "the whole point of the dispatch row is that it can say a model was NEVER called");
  assert.match(refused.text(), /It stopped at the dispatch step/);
  await refused.unmount();
});

test("631.web.diag.partial a run with no settle row is labelled as still running", async () => {
  const h = await mount(async () => ({
    kind: "ok",
    rows: [row({ seq: 1, phase: "dispatch" }), row({ seq: 3, phase: "model_call" })],
  }));
  await h.settle();
  assert.match(h.text(), /This run has not settled yet/,
    "a partial trace must not read as a finished run that happened to record less");
  await h.unmount();
});

test("631.web.diag.steps the step table shows the versioned identity, and NO payload", async () => {
  const h = await mount(async () => ({
    kind: "ok",
    rows: [
      row({ seq: 1, phase: "dispatch" }),
      // A refusal whose MESSAGE carries an address. The section renders the database's own REASON
      // TOKEN; the message is not a field this surface has, and this cell is the control for that.
      row({ seq: 3, phase: "model_call", outcome: "refused", refusal: { reason: "egress_not_authorized", message: "refused for siti@example.com" } }),
    ],
  }));
  await h.settle();

  const toggle = h.find((n) => { const text = (n as { textContent?: string }).textContent; return typeof text === "string" && /Show \d+ steps/.test(text); });
  assert.ok(toggle, "the steps are behind a labelled disclosure, not dumped on the page");
  await h.fireEvent(toggle, "click");
  await h.settle();

  const text = h.text();
  assert.match(text, /accounting_work\.model_segment/, "the CAPABILITY is named from the server-owned registry");
  assert.match(text, /accounting_work/, "…beside the purpose it spent");
  assert.match(text, /clara-work\/v3/, "…and the versioned bundle that ran");
  assert.match(text, /345f2a38c3c8/, "…identified by a comparable digest prefix");
  assert.match(text, /egress_not_authorized/, "the typed reason is rendered verbatim");
  assert.doesNotMatch(text, /siti@example\.com/,
    "…and the refusal's free-text message is NOT a field this surface renders");
  assert.doesNotMatch(text, /b{40}/, "the input digest is not shown as a payload stand-in on this table");
  await h.unmount();
});

test("631.web.diag.reread the re-read asks the door again and mutates nothing", async () => {
  let calls = 0;
  const h = await mount(async () => {
    calls += 1;
    return { kind: "ok", rows: COMPLETE };
  });
  await h.settle();
  assert.equal(calls, 1);

  const button = h.find((n) => { const text = (n as { textContent?: string }).textContent; return typeof text === "string" && text.trim() === "Re-read trace"; });
  assert.ok(button, "the control is labelled as a READ — the page's other retry asks for a new RUN");
  await h.fireEvent(button, "click");
  await h.settle();
  assert.equal(calls, 2, "…and it really re-asked");
  await h.unmount();
});
