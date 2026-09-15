// #648's A5 lane mock — a file-disjoint sibling of `plans-mock.mjs` and `knowledge-mock.mjs`,
// consulted by `serve-built.mjs` through ONE hook, exactly as those modules' own headers describe.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the checklist, the single-`Field` form, the bounded walk, the skip Dialog,
// the confirmed-facts panel, `lib/firm-setup/{api,types}.ts`, `useAsyncRead`'s reload-after-write,
// the draft store and the firm-home tile. What is faked is PostgREST. So this walk proves the
// JOURNEY and what the surface does with each answer; it proves NOTHING about whether Postgres
// really reconciles a `firmInterview_v3`-filled plan, really refuses a stale CAS, or really
// captures a firm-scope knowledge record. `packages/db/tests/firm-setup.test.mjs` owns those
// against a real Postgres under real least-privileged roles.
//
// =============================================================================================
// THE SCOPE GUARD IS A COOKIE, AND IT IS NOT A CONVENIENCE — IT IS THE WHOLE REASON THIS FILE
// CAN EXIST WITHOUT DISTURBING EVERY OTHER WALK.
//
// `components/firm/firm-home/firm-setup-tile.tsx` calls `clara.get_firm_setup()` on EVERY firm
// home render, so the verb fires in the home-board walk, the shell walks, the navigation walk and
// the a11y walk — none of which has anything to do with firm setup. And the verb carries NO
// SUBJECT AT ALL: the firm comes from the caller's own JWT, so its request body is `{}`. There is
// nothing in the request to key on.
//
// A cookie the walk sets on the app origin is therefore the subject this lane scopes by. Every
// handler below reads it and `return false`s when it is absent, so for every other walk this
// module is invisible and `serve-built.mjs`'s own honest default answers instead — an envelope
// with no outstanding required facts, which makes the tile render NOTHING. That default is the
// `get_my_preferences` / `list_entry_links` shape `serve-built.mjs` already uses for a call that
// fires on every signed-in page.
//
// The cookie reaches here because the mock PostgREST origin is the app origin
// (`${CLARA_E2E_APP_ORIGIN}/e2e-supabase`), so a same-origin `fetch` sends it.
// =============================================================================================

import { readCachedJson } from "./mock-dispatch.mjs";

/** The marker the walk sets with `context.addCookies`. Exported so the spec cannot misspell it. */
export const FIRM_SETUP_COOKIE = "clara_e2e_firm_setup";

export const FS = {
  firmId: "64864864-6480-4648-8648-648648648648",
  planId: "64811111-6480-4648-8648-648648648648",
  userId: "64822222-6480-4648-8648-648648648648",
  recordCurrency: "64833333-6480-4648-8648-648648648648",
};

/** The ONLY RPC verbs this lane's dispatch chain recognises. */
export const FIRM_SETUP_RPC_VERBS = new Set([
  "get_firm_setup",
  "seed_firm_setup_plan",
  "answer_firm_setup_item",
  "defer_firm_setup_item",
  "commit_firm_setup",
]);

function armed(request) {
  return (request.headers.cookie ?? "").includes(`${FIRM_SETUP_COOKIE}=`);
}

/**
 * THE CATALOGUE, as `clara.get_firm_setup` emits it — six rows over three groups, so the walk
 * meets a single-`Field` fact, a bounded related set, an optional fact it can skip, and a fact
 * that reaches the knowledge register. The shapes and option lists are the ones 0203 seeds from
 * `clara.knowledge_keys.allowed_values`; nothing here invents a vocabulary.
 */
const CATALOGUE = [
  {
    item_key: "legal_name", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered legal name?",
    note: "FIRM_SEGMENTS_V2 legal_name. Recorded on the setup plan with its author.",
    required: true, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 10, knowledge_key: null,
  },
  {
    item_key: "address", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered address?",
    note: "FIRM_SEGMENTS_V2 address. Recorded on the setup plan with its author.",
    required: true, min_role: "admin", answer_shape: "long_text", answer_options: [], answer_field: null,
    sort_order: 20, knowledge_key: null,
  },
  {
    item_key: "mia", kind: "capture", group_key: "identity",
    question: "What is the firm's MIA registration number?",
    note: "FIRM_SEGMENTS_V2 mia — optional and skippable in the interview, and optional here.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 30, knowledge_key: null,
  },
  {
    item_key: "fye", kind: "must_ask", group_key: "tax",
    question: "Which month is the firm's financial year-end?",
    note: "FIRM_SEGMENTS_V2 fye — a whole month 1-12, the interview's own validateFye shape.",
    required: true, min_role: "admin", answer_shape: "month", answer_options: [], answer_field: null,
    sort_order: 40, knowledge_key: null,
  },
  {
    item_key: "tin", kind: "capture", group_key: "tax",
    question: "What is the firm's MyInvois TIN?",
    note: "FIRM_SEGMENTS_V2 tin — not required for commit here, and skippable with a stated reason.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 45, knowledge_key: null,
  },
  {
    item_key: "currency", kind: "capture", group_key: "accounting",
    question: "What is the firm's default currency?",
    note: "FIRM_SEGMENTS_V2 currency. Firm-defaultable (D8): answering it records a firm-scope knowledge record.",
    required: false, min_role: "admin", answer_shape: "choice",
    answer_options: ["MYR", "USD", "SGD", "EUR", "GBP", "OTHER"], answer_field: null,
    sort_order: 50, knowledge_key: "default_currency",
  },
];

/**
 * MUTABLE, deliberately: this walk's whole subject is a PERSISTENT outcome that survives a reload
 * ("update the persistent object first; a Toast is never the only receipt"). A fresh module load —
 * one per `serve-built.mjs` process — starts from the state below.
 *
 * THE CONCURRENT EDITOR IS A REAL SECOND BROWSER CONTEXT, not a canned refusal: it answers through
 * the same UI and the same door, which rotates `revision` below, and the first context's submit
 * then fails the token comparison exactly as a real plan CAS would. Nothing about that leg is
 * scripted here.
 */
const state = {
  seeded: false,
  committed: false,
  revision: "rev-1",
  revisionN: 1,
  answers: new Map(),
};

function rotate() {
  state.revisionN += 1;
  state.revision = `rev-${state.revisionN}`;
}

function itemRow(row) {
  const settled = state.answers.get(row.item_key) ?? null;
  return {
    ...row,
    state: state.seeded ? (settled ? settled.state : "pending") : "unseeded",
    answer: settled ? settled.answer : null,
    answered_by: settled ? FS.userId : null,
    answered_by_name: settled ? "Aisyah Rahman" : null,
    answered_at: settled ? "2026-09-16T02:00:00.000Z" : null,
    knowledge_record_id: settled && row.knowledge_key ? FS.recordCurrency : null,
  };
}

function envelope() {
  const items = CATALOGUE.map(itemRow);
  const required = items.filter((i) => i.required);
  const outstanding = required.filter((i) => i.state === "pending" || i.state === "unseeded");
  const facts = [];
  const currency = state.answers.get("currency");
  if (currency && currency.state === "answered") {
    facts.push({
      record_id: FS.recordCurrency, revision_id: `${FS.recordCurrency}-r1`, revision_n: 1,
      scope_kind: "firm", knowledge_key: "default_currency", item_key: "currency",
      question: "What is the firm's default currency?", kind: "assertion",
      value: currency.answer, applies_when: {}, applies_when_digest: "d-currency",
      effective_from: null, effective_to: null,
      source_kind: "user_statement", trust: "asserted",
      basis: "Stated by a firm administrator in firm setup (item currency)",
      asserted_by: FS.userId, asserted_by_name: "Aisyah Rahman", recorded_via: "human_ui",
      recorded_at: "2026-09-16T02:00:00.000Z", knowledge_version: "7",
      revision_kind: "capture", revision_reason: null, supersedes_id: null,
      superseded_by: null, superseded_at: null, state: "live",
      editable: true, correctable: true,
      key_description: "The default presentation currency.", value_shape: "string",
      validated_against: "enum:CURRENCIES_V1", authority_bearing: false,
      asserted_by_active: true, asserted_by_role: "admin", authority_current: true,
      legacy_client_fact_key: false,
    });
  }
  return {
    plan_id: FS.planId,
    revision_token: state.revision,
    revision_n: state.revisionN,
    state: state.committed ? "committed" : "open",
    committed_at: state.committed ? "2026-09-16T03:00:00.000Z" : null,
    seeded: state.seeded,
    catalogue_total: CATALOGUE.length,
    counter: {
      required_answered: required.filter((i) => i.state !== "pending" && i.state !== "unseeded").length,
      required_total: required.length,
    },
    items,
    required_outstanding: outstanding.map((i) => i.item_key),
    confirmed_facts: facts,
  };
}

function refusal(response, sendJson, cors, code, message, reason, status = 400) {
  sendJson(response, status, { code, message, details: reason === null ? null : JSON.stringify({ reason }), hint: null }, cors);
}

export async function handleFirmSetupSupabase(request, response, path, url, sendJson, cors) {
  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  if (!FIRM_SETUP_RPC_VERBS.has(verb)) return false;

  if (verb === "get_firm_setup") {
    if (!armed(request)) return false;
    sendJson(response, 200, envelope(), cors);
    return true;
  }

  if (verb === "seed_firm_setup_plan") {
    if (!armed(request)) return false;
    state.seeded = true;
    rotate();
    sendJson(response, 200, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      state: "open", seeded: CATALOGUE.length, catalogue_total: CATALOGUE.length,
    }, cors);
    return true;
  }

  if (verb === "answer_firm_setup_item") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    // THE PLAN CAS, and it is the real mechanism rather than a scripted refusal: the walk's
    // SECOND browser context answers first through the same door, which rotates the token below,
    // so the first context's submit arrives carrying a revision this plan has left behind.
    if (body.p_expected_revision !== state.revision) {
      refusal(response, sendJson, cors, "CLR06", "stale onboarding plan revision", "stale_plan");
      return true;
    }
    state.answers.set(body.p_item_key, { state: "answered", answer: body.p_answer });
    rotate();
    sendJson(response, 200, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      item_key: body.p_item_key, state: "answered", answered_by: FS.userId,
      knowledge: CATALOGUE.find((c) => c.item_key === body.p_item_key)?.knowledge_key
        ? { status: "captured", record_id: FS.recordCurrency }
        : null,
    }, cors);
    return true;
  }

  if (verb === "defer_firm_setup_item") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    state.answers.set(body.p_item_key, { state: "deferred", answer: { deferred_reason: body.p_reason } });
    rotate();
    sendJson(response, 200, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      item_key: body.p_item_key, state: "deferred", deferred_reason: body.p_reason,
    }, cors);
    return true;
  }

  if (verb === "commit_firm_setup") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    const outstanding = envelope().required_outstanding;
    if (outstanding.length > 0) {
      sendJson(response, 400, {
        code: "CLR10", message: "the firm setup checklist still has required items outstanding",
        details: JSON.stringify({ reason: "required_items_outstanding", item_keys: outstanding }), hint: null,
      }, cors);
      return true;
    }
    state.committed = true;
    rotate();
    sendJson(response, 200, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      state: "committed", committed_at: "2026-09-16T03:00:00.000Z",
    }, cors);
    return true;
  }

  return false;
}
