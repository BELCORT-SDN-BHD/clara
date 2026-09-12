// THE FACE DERIVATION, THE CHECKOUT GATE AND THE SERVER LOADER (#621).
// `legalFaces` is the one place that decides what a legal document LOOKS like
// right now, and `allLegalAccepted` the one place that answers "may this person
// reach checkout" — so every cell below is aimed at those two and at the loader
// that feeds them, rather than at the rendering, which has its own file.
//
// THE TWO DERIVATION FUNCTIONS LIVE IN `./legal-reads.ts`, not in the module
// this file is named after, and that is load-bearing rather than tidy: the
// legal stage is a CLIENT component, so anything it value-imports must not
// reach `next/headers`. They are exercised here beside the loader because the
// three answer one question between them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { loadLegalStageState } from "./legal-server-reads";
import {
  allLegalAccepted,
  legalFaces,
  type LegalDocumentRow,
  type LegalStageState,
} from "./legal-reads";

/** PLAIN LOWERCASE HEX — the shape 0185's `body_sha256 text` column actually
 *  holds (its CHECK recomputes it as `encode(sha256(...),'hex')`). The earlier
 *  fixture wore `bytea`'s prefixed wire form, inherited from the RETIRED
 *  `dpa_documents` column, and `isLegalDocumentRow` now drops such a row. */
const TERMS_BODY = "Terms text.";
const TERMS_SHA = createHash("sha256").update(TERMS_BODY, "utf8").digest("hex");

function row(over: Partial<LegalDocumentRow> = {}): LegalDocumentRow {
  return {
    kind: "terms",
    version: 3,
    status: "published",
    title: "Clara Terms of Service",
    body: TERMS_BODY,
    body_sha256: TERMS_SHA,
    effective_from: "2026-09-01T00:00:00.000Z",
    published_at: "2026-08-30T00:00:00.000Z",
    accepted_at: null,
    accepted_version: null,
    ...over,
  };
}

const faceOf = (state: ReturnType<typeof legalFaces>, kind: "terms" | "dpa") =>
  state.find((doc) => doc.kind === kind)?.face;

test("ONE FACE PER KIND, always — a kind with no row at all is `absent`, never missing", () => {
  const faces = legalFaces([row({ kind: "terms" })]);
  assert.deepEqual(faces.map((f) => f.kind), ["terms", "dpa"], "a kind vanished from the stage");
  assert.equal(faceOf(faces, "terms"), "acceptable");
  assert.equal(faceOf(faces, "dpa"), "absent");
  assert.deepEqual(legalFaces([]).map((f) => f.face), ["absent", "absent"]);
});

test("published + not accepted is the ONLY face that may carry a control", () => {
  const faces = legalFaces([row({ status: "published", accepted_at: null })]);
  const terms = faces.find((f) => f.kind === "terms");
  assert.equal(terms?.face, "acceptable");
  assert.equal(terms?.face === "acceptable" ? terms.bodySha256 : null, TERMS_SHA,
    "the hash of the bytes the person will be shown did not survive the derivation");
});

test("a DRAFT is its own face and can never be accepted — the unpublished-text wall", () => {
  const faces = legalFaces([row({ status: "draft", accepted_at: null })]);
  assert.equal(faceOf(faces, "terms"), "draft");
  // The gate's own answer is the property that matters: a draft never opens
  // checkout, however it is rendered.
  assert.equal(allLegalAccepted({ kind: "ready", documents: faces }), false);
});

test("a SUPERSEDED version is told apart from a draft — different fact, different card", () => {
  const faces = legalFaces([row({ status: "superseded" })]);
  assert.equal(faceOf(faces, "terms"), "superseded");
  assert.equal(allLegalAccepted({ kind: "ready", documents: faces }), false);
});

test("ACCEPTANCE IS VERSION-EXACT: accepting v1 of a document now at v2 is not accepted", () => {
  const stale = legalFaces([row({ version: 2, accepted_at: "2026-09-02T00:00:00Z", accepted_version: 1 })]);
  assert.equal(faceOf(stale, "terms"), "acceptable", "an acceptance of an OLD version was honoured");

  const current = legalFaces([row({ version: 2, accepted_at: "2026-09-02T00:00:00Z", accepted_version: 2 })]);
  const terms = current.find((f) => f.kind === "terms");
  assert.equal(terms?.face, "accepted");
  assert.equal(terms?.face === "accepted" ? terms.acceptedAt : null, "2026-09-02T00:00:00Z");

  // A timestamp with no version, or a version with no timestamp, is not
  // evidence either — absence is not evidence (review law 2).
  assert.equal(faceOf(legalFaces([row({ accepted_at: "2026-09-02T00:00:00Z" })]), "terms"), "acceptable");
  assert.equal(faceOf(legalFaces([row({ accepted_version: 3 })]), "terms"), "acceptable");
});

test("THE CHECKOUT GATE opens only when BOTH kinds are accepted at their current version", () => {
  const accepted = (kind: "terms" | "dpa") =>
    row({ kind, version: 4, accepted_at: "2026-09-02T00:00:00Z", accepted_version: 4 });

  assert.equal(allLegalAccepted({ kind: "ready", documents: legalFaces([accepted("terms"), accepted("dpa")]) }), true);
  // One of two is never enough — the defect the single-document step could not
  // even express.
  assert.equal(allLegalAccepted({ kind: "ready", documents: legalFaces([accepted("terms")]) }), false);
  assert.equal(allLegalAccepted({ kind: "ready", documents: legalFaces([accepted("dpa")]) }), false);
  // And a read that failed is never an open gate.
  assert.equal(allLegalAccepted({ kind: "unavailable" }), false);
  assert.equal(allLegalAccepted({ kind: "ready", documents: [] }), false);
});

test("the server read degrades to ONE honest `unavailable`, never a crash and never a guess", async () => {
  const noSession: LegalStageState = await loadLegalStageState({ resolveSession: async () => null });
  assert.deepEqual(noSession, { kind: "unavailable" });

  const throwing = await loadLegalStageState({
    resolveSession: async () => {
      throw new Error("cookies() outside a request scope");
    },
  });
  assert.deepEqual(throwing, { kind: "unavailable" });

  // A transport failure under a real session lands on the same answer: the
  // stage must never crash the signup journey over a read it can report.
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  try {
    const failed = await loadLegalStageState({
      resolveSession: async () => ({ subject: "s1", accessToken: "tok", email: null }),
    });
    assert.deepEqual(failed, { kind: "unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});

test("a successful read returns one face per kind under the caller's OWN token", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  let authorization: string | null = null;
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization");
    return new Response(JSON.stringify([row({ kind: "dpa", title: "Clara DPA" })]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const state = await loadLegalStageState({
      resolveSession: async () => ({ subject: "s1", accessToken: "caller-token", email: null }),
    });
    assert.equal(state.kind, "ready");
    assert.deepEqual(
      state.kind === "ready" ? state.documents.map((d) => [d.kind, d.face]) : [],
      [["terms", "absent"], ["dpa", "acceptable"]],
    );
    assert.equal(authorization, "Bearer caller-token", "the read did not ride the caller's own token");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
});
