// #933 — THE PROPOSAL, AS THE BROWSER READS IT.
//
// SUBJECT: `lib/registers/fa-particulars-proposal.ts` — the reader all three answering entrances
// pre-fill from. It is the mirror of `packages/runtime/lib/fa-particulars-proposal.ts`'s wire
// block, and it is a SEPARATE implementation for the reason `apps/web` has no dependency on
// `@clara/runtime` at all: the two agree because they are written from one contract and because
// `packages/db/tests/fa-particulars-proposal.test.mjs` drives that contract through a live
// database. A divergence shows up as a proposal a surface refuses to render — a finding about
// this file, not a mystery.
//
// THE READER IS TOLERANT ON PURPOSE AND THE CELLS SAY SO. A question is durable and a person opens
// it hours later; a block this build does not understand must degrade to TODAY'S behaviour — the
// ordinary empty form — and never to a crash or a guess. Every "returns null" cell below is that
// rule, not a defensive habit.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadAssetParticularsProposal, particularsFromProposal, proposalAnswerDraft, readFaParticularsProposal,
} from "./fa-particulars-proposal";
import type { SessionTokenAccessor } from "@/lib/session";

const fakeSession = (token: string | null): SessionTokenAccessor => ({ getAccessToken: async () => token });

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

function captureRead(rows: unknown[]): { impl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, urls };
}

/** The block exactly as the db battery proved it travels (`p933.wire.verbatim`). */
const WIRE = Object.freeze({
  v: 1,
  method: "straight_line",
  useful_life_months: 60,
  rate_bps: null,
  residual_cents: 0,
  start_date: "2026-08-15",
  description: "Air compressor, workshop bay 2",
  basis: ["account_siblings", "acquisition_date", "firm_default_residual"],
  reason: "Every other completed asset on 1500 is depreciated straight line over 60 months, so I propose the same.",
});

const sourceRef = (over: Record<string, unknown> = {}) => ({
  kind: "fixed_asset",
  asset_id: "11111111-1111-4111-8111-111111111111",
  proposal: { ...WIRE, ...over },
});

test("readFaParticularsProposal: the block the question carries comes back field for field", () => {
  const p = readFaParticularsProposal(sourceRef());
  assert.ok(p, "a #933 question carries a proposal");
  assert.equal(p.method, "straight_line");
  assert.equal(p.useful_life_months, 60);
  assert.equal(p.rate_bps, null);
  assert.equal(p.residual_cents, 0);
  assert.equal(p.start_date, "2026-08-15");
  assert.equal(p.description, "Air compressor, workshop bay 2");
  assert.match(p.reason, /straight line over 60 months/);
});

test("readFaParticularsProposal: a #639 question with no proposal reads as no proposal — today's empty form, unchanged", () => {
  assert.equal(readFaParticularsProposal({ kind: "fixed_asset", asset_id: "a1" }), null);
  assert.equal(readFaParticularsProposal(null), null);
  assert.equal(readFaParticularsProposal(undefined), null);
});

test("readFaParticularsProposal: a block at a version this build does not know is NOT read — the form degrades to empty rather than guessing", () => {
  assert.equal(readFaParticularsProposal(sourceRef({ v: 2 })), null);
  assert.equal(readFaParticularsProposal({ kind: "fixed_asset", asset_id: "a1", proposal: "straight_line" }), null);
});

test("readFaParticularsProposal: a value outside the shape the particulars door admits is DROPPED, never clamped into a plausible wrong one", () => {
  const p = readFaParticularsProposal(sourceRef({
    method: "declining_balance", useful_life_months: 0, rate_bps: 20000, residual_cents: -1,
    start_date: "15/08/2026", description: "   ",
  }));
  assert.ok(p, "the block is still a block — a bad field is not a reason to refuse the reason line");
  assert.equal(p.method, null, "a method outside 0041's three is not a method");
  assert.equal(p.useful_life_months, null, "a life must be positive");
  assert.equal(p.rate_bps, null, "a rate lives in 1..10000 and 20000 is not clamped to 10000");
  assert.equal(p.residual_cents, null, "a residual is non-negative");
  assert.equal(p.start_date, null, "the in-service date is ISO — the spelling the answer door stores");
  assert.equal(p.description, null);
});

// ------------------------------------------------------------------------------------------
// THE READ THE TWO REGISTER-SIDE ENTRANCES ISSUE. The asset page dialog and the Needs-you inline
// form hold an asset id and a client id, and NO question id — `clara.list_review_queue`'s
// `fixed_asset_incomplete` row carries `asset_id` alone (`lib/firm/needs-you.ts`). So they find
// the parked question by reading `clara.agent_interruptions` under the human role's own
// firm-scoped policy, which `packages/db/tests/fa-particulars-proposal.test.mjs`'s
// `p933.read.by_asset` and `p933.read.firm_walled` drive on a live database.
// ------------------------------------------------------------------------------------------

test("loadAssetParticularsProposal: reads the client's PENDING work questions and returns the block for this asset", async () => {
  const { impl, urls } = captureRead([
    { id: "q-other", source_ref: { kind: "fixed_asset", asset_id: "other", proposal: { ...WIRE, useful_life_months: 120 } } },
    { id: "q-mine", source_ref: sourceRef() },
  ]);
  await withMockedFetch(impl, async () => {
    const p = await loadAssetParticularsProposal(fakeSession("tok"), {
      clientId: "c1", assetId: "11111111-1111-4111-8111-111111111111",
    });
    assert.ok(p, "the asset's own parked question is the one that is read");
    assert.equal(p.useful_life_months, 60, "…and never a sibling question's block");
  });
  assert.equal(urls.length, 1, "one read, not one per row");
  assert.match(urls[0]!, /agent_interruptions/);
  assert.match(urls[0]!, /status=eq\.pending/, "a settled question is not a proposal anybody can still confirm");
  assert.match(urls[0]!, /client_id=eq\.c1/, "scoped to the client the surface is on");
});

test("loadAssetParticularsProposal: no parked question means no proposal, and a refused read means no proposal either — never a thrown page", async () => {
  const { impl } = captureRead([]);
  await withMockedFetch(impl, async () => {
    assert.equal(
      await loadAssetParticularsProposal(fakeSession("tok"), { clientId: "c1", assetId: "a1" }),
      null);
  });
  const boom = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  await withMockedFetch(boom, async () => {
    assert.equal(
      await loadAssetParticularsProposal(fakeSession("tok"), { clientId: "c1", assetId: "a1" }),
      null,
      "a proposal is a convenience: a read that fails leaves the ordinary empty form, never an error the person cannot act on");
  });
  // AND A BODY THAT IS NOT A LIST reads as no proposal too. PostgREST always answers a select with
  // an array, but "always" is the assumption that takes a page down when it turns out not to be:
  // a form whose pre-fill threw would leave a person unable to complete particulars at all.
  const notAList = (async () => new Response(JSON.stringify({ message: "nope" }),
    { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  await withMockedFetch(notAList, async () => {
    assert.equal(
      await loadAssetParticularsProposal(fakeSession("tok"), { clientId: "c1", assetId: "a1" }),
      null);
  });
});

// ------------------------------------------------------------------------------------------
// THE TWO PRE-FILLS. One proposal, two form grammars: the register's own `FaParticularsInput`
// (numbers, the door's own spelling) and the Work question's `WorkAnswerDraft` (a `text` field is
// a string, a `money` field is integer cents — `clara._assert_work_answer`, 0180:444-486). A
// single mapper for both would have to lie to one of them.
// ------------------------------------------------------------------------------------------

test("particularsFromProposal: fills only what the proposal grounds and leaves the rest of the base untouched", () => {
  const base = {
    method: "straight_line" as const, useful_life_months: null, rate_bps: null,
    residual_cents: null, start_date: "", description: null, ca_class: null,
    is_commercial_vehicle: null, is_new: null,
  };
  const filled = particularsFromProposal(readFaParticularsProposal(sourceRef()), base);
  assert.equal(filled.method, "straight_line");
  assert.equal(filled.useful_life_months, 60);
  assert.equal(filled.rate_bps, null);
  assert.equal(filled.residual_cents, 0);
  assert.equal(filled.start_date, "2026-08-15");
  assert.equal(filled.description, "Air compressor, workshop bay 2");
  assert.equal(filled.ca_class, null, "the proposal says nothing about capital-allowance class and neither does the fill");
});

test("particularsFromProposal: a proposal that grounds NO method leaves the base's method alone and still fills the two facts", () => {
  const base = {
    method: "straight_line" as const, useful_life_months: null, rate_bps: null,
    residual_cents: null, start_date: "", description: null, ca_class: null,
    is_commercial_vehicle: null, is_new: null,
  };
  const filled = particularsFromProposal(
    readFaParticularsProposal(sourceRef({ method: null, useful_life_months: null, basis: ["acquisition_date", "firm_default_residual"] })),
    base);
  assert.equal(filled.method, "straight_line", "the form's own starting method stands — the proposal proposed none");
  assert.equal(filled.useful_life_months, null, "and no life is invented to go with it");
  assert.equal(filled.start_date, "2026-08-15");
  assert.equal(filled.residual_cents, 0);
});

test("particularsFromProposal: no proposal at all returns the base UNCHANGED — today's empty form", () => {
  const base = {
    method: "straight_line" as const, useful_life_months: null, rate_bps: null,
    residual_cents: null, start_date: "", description: null, ca_class: null,
    is_commercial_vehicle: null, is_new: null,
  };
  assert.deepEqual(particularsFromProposal(null, base), base);
});

test("proposalAnswerDraft: each declared field is pre-filled in ITS OWN wire spelling — a `text` driver as a string, `money` as integer cents", () => {
  const fields = [
    { key: "method", label: "Depreciation method", kind: "choice", required: true,
      options: [{ value: "straight_line", label: "Straight line" }, { value: "none", label: "Not depreciated" }] },
    { key: "useful_life_months", label: "Useful life (months)", kind: "text", required: false },
    { key: "rate_bps", label: "Annual rate (basis points)", kind: "text", required: false },
    { key: "residual_cents", label: "Residual value", kind: "money", required: false },
    { key: "start_date", label: "In-service date", kind: "date", required: true },
    { key: "description", label: "Asset description", kind: "text", required: false },
  ];
  const draft = proposalAnswerDraft(fields, readFaParticularsProposal(sourceRef()));
  assert.equal(draft.method, "straight_line");
  assert.equal(draft.useful_life_months, "60",
    "a `text`-declared driver is a JSON STRING to clara._assert_work_answer — sending 60 would be refused");
  assert.equal(draft.rate_bps, undefined, "an ungrounded driver is ABSENT, never a blank a person has to clear");
  assert.equal(draft.residual_cents, 0, "a `money` field is an integer number of cents");
  assert.equal(draft.start_date, "2026-08-15");
  assert.equal(draft.description, "Air compressor, workshop bay 2");
});

test("proposalAnswerDraft: a field the question did not declare is never pre-filled, and no proposal means an empty draft", () => {
  const fields = [{ key: "method", label: "Depreciation method", kind: "choice", required: true,
    options: [{ value: "straight_line", label: "Straight line" }, { value: "none", label: "Not depreciated" }] }];
  const draft = proposalAnswerDraft(fields, readFaParticularsProposal(sourceRef()));
  assert.deepEqual(draft, { method: "straight_line" },
    "the question's own declared fields bound the fill — a key outside them is one the answer door refuses");
  assert.deepEqual(proposalAnswerDraft(fields, null), {});
});
