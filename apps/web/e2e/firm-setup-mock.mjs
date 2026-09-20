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
  "dismiss_firm_setup_tip",
]);

/** #935 — the two education tips this fixture carries, one per dismissal action ("Later" and
 *  "Got it"), so the walk covers AC4's "reading and skipping a tip" rather than skipping alone
 *  (review L06-SPEC-07). Exported so the spec cannot misspell them. */
export const TIP_KEY = "tip_invite_colleagues";
export const TIP_KEY_READ = "tip_knowledge_page";

function armed(request) {
  return (request.headers.cookie ?? "").includes(`${FIRM_SETUP_COOKIE}=`);
}

/**
 * THE CATALOGUE, as `clara.get_firm_setup` emits it — eight rows over four groups, so the walk
 * meets a single-`Field` fact, a bounded related set, an optional fact it can skip, a fact that
 * reaches the knowledge register, and (#935) an education tip in its own group. The shapes and
 * option lists are the ones 0218 seeds from `clara.knowledge_keys.allowed_values`; nothing here
 * invents a vocabulary.
 *
 * #934 — every `note` below is the owner-approved ACCOUNTANT sentence
 * (0258_firm_setup_user_notes.sql), never the engineer's own provenance text: `get_firm_setup`
 * itself now prefers that sentence, so a fixture modelling the real door's response must too.
 */
const CATALOGUE = [
  {
    item_key: "legal_name", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered legal name?",
    note: "Enter the name exactly as on the SSM certificate. It appears on every report and letter Clara produces for the firm.",
    required: true, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 10, knowledge_key: null,
  },
  {
    item_key: "address", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered address?",
    note: "The registered address as filed with SSM, not the office you work from.",
    required: true, min_role: "admin", answer_shape: "long_text", answer_options: [], answer_field: null,
    sort_order: 20, knowledge_key: null,
  },
  {
    item_key: "mia", kind: "capture", group_key: "identity",
    question: "What is the firm's MIA registration number?",
    note: "Optional. The firm's MIA registration number, if it has one; skip with a reason if none.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 30, knowledge_key: null,
  },
  {
    item_key: "fye", kind: "must_ask", group_key: "tax",
    question: "Which month is the firm's financial year-end?",
    note: "The month the firm's own financial year ends, 1 to 12. Clients keep their own year-end on their client record.",
    required: true, min_role: "admin", answer_shape: "month", answer_options: [], answer_field: null,
    sort_order: 40, knowledge_key: null,
  },
  {
    item_key: "tin", kind: "capture", group_key: "tax",
    question: "What is the firm's MyInvois TIN?",
    note: "The firm's MyInvois TIN. Required when annual turnover is RM1 million or more; otherwise skip with a reason.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 45, knowledge_key: null,
  },
  {
    item_key: "currency", kind: "capture", group_key: "accounting",
    question: "What is the firm's default currency?",
    note: "The currency the firm keeps its own books in, as a three-letter code. Client books carry their own currency.",
    required: false, min_role: "admin", answer_shape: "choice",
    answer_options: ["MYR", "USD", "SGD", "EUR", "GBP", "OTHER"], answer_field: null,
    sort_order: 50, knowledge_key: "default_currency",
  },
  // #935 — TWO education tips, so the walk meets a row with `kind: "education"` for each of the
  // two actions it offers: "Later" on the first, "Got it" on the second (AC4 asks the walk to
  // cover READING and skipping, and the first cut pressed only "Later" — review L06-SPEC-07).
  // A title, a body, no answer shape any code path reads, and their own group. The real catalogue
  // seeds three; the door itself is proven against a real Postgres in
  // packages/db/tests/firm-setup-education-tips.test.mjs.
  {
    item_key: TIP_KEY, kind: "education", group_key: "tips",
    question: "Invite your colleagues",
    note: "Settings → Members sends an invitation by email; a bookkeeper sees client work, an admin also manages members and firm setup.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 130, knowledge_key: null,
  },
  {
    item_key: TIP_KEY_READ, kind: "education", group_key: "tips",
    question: "Where Clara keeps what it knows",
    note: "Every client has a Knowledge page: facts, aliases, preferences and policies with their source; correct or withdraw anything there, and Clara reads it before every task.",
    required: false, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 140, knowledge_key: null,
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

/**
 * `clara._reserve_op`'s OWN RULE, modelled rather than approximated (0004_governed_fns.sql:46-60):
 * one op key names exactly ONE request. The same key carrying the same arguments replays the
 * stored receipt; the same key carrying DIFFERENT arguments is refused CLR10 "op_key reused with
 * different args", with no detail.
 *
 * It is modelled here because it is the one server rule the client's op-key derivation can get
 * wrong in a way no fixture that ignores keys would ever show: a key derived from the intent
 * (verb, plan, item, value) repeats whenever a value repeats, and the argument list it is checked
 * against carries `p_expected_revision`, which does not. `p648.opkey.attempt`
 * (packages/db/tests/firm-setup.test.mjs) proves both halves against a real Postgres; this keeps
 * the browser leg honest about them.
 *
 * Recorded on SUCCESS only: a real reservation rolls back with its transaction when the door
 * raises, so a refused call leaves no receipt for the browser to meet.
 */
const receipts = new Map();

function reserve(verb, body) {
  const key = `${verb}:${body.p_op_key}`;
  const hash = JSON.stringify(
    Object.entries(body).filter(([k]) => k !== "p_op_key").sort(([a], [b]) => (a < b ? -1 : 1)));
  const prior = receipts.get(key);
  if (!prior) return { key, hash, replay: null, conflict: false };
  if (prior.hash !== hash) return { key, hash, replay: null, conflict: true };
  return { key, hash, replay: prior.result, conflict: false };
}

function finish(slot, result) {
  receipts.set(slot.key, { hash: slot.hash, result });
  return result;
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
    const body = await readCachedJson(request);
    const slot = reserve(verb, body);
    if (slot.replay) { sendJson(response, 200, slot.replay, cors); return true; }
    state.seeded = true;
    rotate();
    sendJson(response, 200, finish(slot, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      state: "open", seeded: CATALOGUE.length, catalogue_total: CATALOGUE.length,
    }), cors);
    return true;
  }

  if (verb === "answer_firm_setup_item") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    // RESERVE BEFORE THE MUTABLE VALIDATION, the door's own order: `_reserve_op` runs before the
    // CAS comparison, which is exactly why replaying the revision that was SENT works and
    // replaying a re-read one does not.
    const slot = reserve(verb, body);
    if (slot.conflict) {
      refusal(response, sendJson, cors, "CLR10", "op_key reused with different args", null);
      return true;
    }
    if (slot.replay) { sendJson(response, 200, slot.replay, cors); return true; }
    // THE PLAN CAS, and it is the real mechanism rather than a scripted refusal: the walk's
    // SECOND browser context answers first through the same door, which rotates the token below,
    // so the first context's submit arrives carrying a revision this plan has left behind.
    if (body.p_expected_revision !== state.revision) {
      refusal(response, sendJson, cors, "CLR06", "stale onboarding plan revision", "stale_plan");
      return true;
    }
    state.answers.set(body.p_item_key, { state: "answered", answer: body.p_answer });
    rotate();
    sendJson(response, 200, finish(slot, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      item_key: body.p_item_key, state: "answered", answered_by: FS.userId,
      knowledge: CATALOGUE.find((c) => c.item_key === body.p_item_key)?.knowledge_key
        ? { status: "captured", record_id: FS.recordCurrency }
        : null,
    }), cors);
    return true;
  }

  if (verb === "defer_firm_setup_item") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    const slot = reserve(verb, body);
    if (slot.conflict) {
      refusal(response, sendJson, cors, "CLR10", "op_key reused with different args", null);
      return true;
    }
    if (slot.replay) { sendJson(response, 200, slot.replay, cors); return true; }
    state.answers.set(body.p_item_key, { state: "deferred", answer: { deferred_reason: body.p_reason } });
    rotate();
    sendJson(response, 200, finish(slot, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      item_key: body.p_item_key, state: "deferred", deferred_reason: body.p_reason,
    }), cors);
    return true;
  }

  if (verb === "dismiss_firm_setup_tip") {
    if (!armed(request)) return false;
    const body = await readCachedJson(request);
    if (body.p_plan !== FS.planId) return false;
    // #935 — deliberately NOT `reserve`/`finish`: the real door takes no op_key at all (its whole
    // point is to ride neither the idempotency ledger nor the plan's CAS token), and it never
    // rotates `state.revision` — a tip's settlement never competes with an accounting answer for
    // the same optimistic-concurrency slot (0259_firm_setup_education_tips.sql's own header).
    const action = body.p_action === "deferred" ? "deferred" : "answered";
    state.answers.set(body.p_item_key, { state: action, answer: { tip_action: body.p_action } });
    sendJson(response, 200, {
      plan_id: FS.planId, item_key: body.p_item_key, state: action, tip_action: body.p_action,
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
    const slot = reserve(verb, body);
    if (slot.conflict) {
      refusal(response, sendJson, cors, "CLR10", "op_key reused with different args", null);
      return true;
    }
    if (slot.replay) { sendJson(response, 200, slot.replay, cors); return true; }
    state.committed = true;
    rotate();
    sendJson(response, 200, finish(slot, {
      plan_id: FS.planId, revision_token: state.revision, revision_n: state.revisionN,
      state: "committed", committed_at: "2026-09-16T03:00:00.000Z",
    }), cors);
    return true;
  }

  return false;
}
