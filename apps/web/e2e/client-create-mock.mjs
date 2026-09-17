// #649's client-creation lane mock — a file-disjoint sibling of `plans-mock.mjs`, consulted by
// `serve-built.mjs` through ONE hook, exactly as that module's own header describes for itself.
// Every id below is distinct from every other lane's and EVERY handler falls through with
// `return false` for a subject that is not this lane's, so no walk can starve another's fixtures.
//
// WHAT IS REAL AND WHAT IS FAKE. The browser, the built Next bundle and every line of client code
// under test are REAL — the register, the Add-client dialog, the candidate face, the
// acknowledgement gate, the focus manager, the layout at 320 CSS px and at 200% zoom. What is
// faked is PostgREST: `clara.client_identity_candidates` and `clara.begin_client_onboarding`. So
// this walk proves the JOURNEY and what the surface does with the database's answers; it proves
// NOTHING about whether Postgres really finds a name family, really refuses at arity >= 2, or
// really births a client and its plan in one transaction.
// `packages/db/tests/client-onboarding-identity.test.mjs` owns those against a real Postgres.
//
// ONE OF THE TWO VERBS IS ANSWERED FOR EVERY NAME, and the asymmetry is deliberate.
// `clara.client_identity_candidates` has exactly ONE claimant in this suite — this file — and the
// Add-client control asks it BEFORE every dispatch, on every walk, including walks that own no
// client_identity fixture at all. A verb nobody answers is an outage, not a fall-through, so this
// lane answers every other name with the honest arity-0 shape (`{name, arity: 0, candidates: []}`)
// and keeps its three fixture names for the three arities. `clara.begin_client_onboarding` has a
// SECOND claimant (`agentic-finish-mock.mjs`, which answers it for every name its own walk mints),
// so that one still falls through for a name this lane does not own.
//
// SCOPED BY THE REQUEST'S OWN SUBJECT, and for this door the subject IS the name.
// `clara.begin_client_onboarding(p_name, p_op_key)` takes a free-text name and nothing else —
// there is no id in the request to key on — so the name is not a LABEL for the subject here, it is
// the subject. `agentic-finish-mock.mjs` declares the same verb `unscopeable` because its own walk
// does not care WHICH name reached it; this lane's three names are its whole fixture, so it gates
// on them and falls through for every other name, including that lane's. Both claimants are
// declared in `e2e-fixture-ownership.test.ts`'s SHARED_RPC_VERBS.

// THE BODY IS READ THROUGH THE SHARED CACHE, never a private loop. A Node request stream drains
// exactly once, so a lane that parses it privately hands every later lane in `serve-built.mjs`'s
// chain an empty `{}` — the silent failure `mock-dispatch.mjs`'s own header was written for, and
// `begin_client_onboarding`'s other claimant (`agentic-finish-mock.mjs`, hooked AFTER this lane)
// reads its body through the same helper.
import { matchVerb, readCachedJson } from "./mock-dispatch.mjs";

export const CLIENT_CREATE = {
  /** arity 0 — nothing in the firm answers to it. The face proceeds with no interruption. */
  freeName: "Zamboni Holdings 649",
  /** arity 1 — one same-family client. Shown, and acknowledged in the face. */
  loneName: "Rome Ventures 649",
  /** arity >= 2 — a client AND a live counterparty. The DATABASE refuses. */
  collidingName: "Rome Consortium 649",

  /** The client the two Rome names collide with — a real, openable record. */
  existingClientId: "64900001-6490-4649-8649-649000000001",
  existingClientName: "Rome Public Advisory Sdn Bhd",
  existingCounterpartyId: "64900002-6490-4649-8649-649000000002",
  existingCounterpartyName: "Rome Logistics Sdn Bhd",

  /** The client the birth door returns. The walk lands on ITS workspace, by the id the DATABASE
   *  returned — never one the browser composed. */
  newClientId: "64900003-6490-4649-8649-649000000003",
  newPlanId: "64900004-6490-4649-8649-649000000004",
};

const CANDIDATE_CLIENT = {
  party_kind: "client",
  id: CLIENT_CREATE.existingClientId,
  name: CLIENT_CREATE.existingClientName,
  status: "active",
  client_id: CLIENT_CREATE.existingClientId,
  match_reason: "name_family",
};

const CANDIDATE_COUNTERPARTY = {
  party_kind: "counterparty",
  id: CLIENT_CREATE.existingCounterpartyId,
  name: CLIENT_CREATE.existingCounterpartyName,
  status: null,
  client_id: CLIENT_CREATE.existingClientId,
  match_reason: "name_family",
};

/** The three names this lane owns. Anything else falls through. */
const OWNED_NAMES = new Set([CLIENT_CREATE.freeName, CLIENT_CREATE.loneName, CLIENT_CREATE.collidingName]);

/** The ONLY RPC verbs this lane's dispatch chain recognises. */
export const CLIENT_CREATE_RPC_VERBS = new Set(["client_identity_candidates", "begin_client_onboarding"]);
const OWNED_VERBS = CLIENT_CREATE_RPC_VERBS;

/** The rows the two id-scoped `/rest/v1/clients` reads answer with. `bornClients` grows when the
 *  walk actually creates one, so the landing page reads a client the DOOR returned rather than a
 *  fixture that was always there — the distinction the "hydrate never trust" rule turns on. */
const bornClients = new Map();

export function resetClientCreate() {
  bornClients.clear();
}

const EXISTING_CLIENT_ROW = () => ({
  id: CLIENT_CREATE.existingClientId,
  name: CLIENT_CREATE.existingClientName,
  status: "active",
  fy_end_month: 12,
  fy_end_day: 31,
  created_at: "2026-01-04T00:00:00.000Z",
});

/** #649's lane. Returns true when it answered, so the server's delegate chain falls through to
 *  every other lane for anything that is not this fixture's. */
export async function handleClientCreateSupabase(request, response, path, url, sendJson, cors) {
  if (request.method === "GET" && path === "/rest/v1/clients") {
    // ID-SCOPED ONLY: the UNFILTERED /clients register is shared by every walk, and claiming it
    // would replace another walk's fixture. This lane navigates by the id the door returned.
    const idFilter = url.searchParams.get("id");
    const id = idFilter?.startsWith("eq.") ? idFilter.slice(3) : null;
    if (id === CLIENT_CREATE.existingClientId) {
      sendJson(response, 200, [EXISTING_CLIENT_ROW()], cors);
      return true;
    }
    if (id !== null && bornClients.has(id)) {
      sendJson(response, 200, [bornClients.get(id)], cors);
      return true;
    }
    return false;
  }

  if (request.method !== "POST" || !path.startsWith("/rest/v1/rpc/")) return false;
  const verb = path.slice("/rest/v1/rpc/".length);
  // The allow-list the body read guards on (`matchVerb`, mock-dispatch.mjs), so a verb this lane
  // does not own is never even parsed — and because the parse is CACHED on the request, a verb it
  // does own and then declines is still fully re-servable to every later lane, in any order.
  if (!matchVerb(OWNED_VERBS, verb)) return false;
  const body = await readCachedJson(request);
  const name = typeof body.p_name === "string" ? body.p_name.trim() : "";

  if (verb === "client_identity_candidates") {
    // THIS LANE IS THE ONLY CLAIMANT OF THIS VERB, so falling through for a name it does not own
    // is not a fall-through — it is an OUTAGE. `AddClientControl` now asks this read before it
    // dispatches the birth door at all (client-register-list.tsx), and a read that could not run
    // correctly blocks the dispatch: no other lane answers it, so P6-5's own H-51 arm (which
    // types a name outside this fixture) got a 501 and never reached `begin_client_onboarding`.
    // Every other name therefore gets the HONEST arity-0 shape — the same "answer with the empty,
    // never with someone else's fixture" posture `home-board-mock.mjs` states for its own
    // unscoped reads. Nothing in it can resolve as another walk's fixture: it names no party.
    if (!OWNED_NAMES.has(name)) {
      sendJson(response, 200, { name, arity: 0, candidates: [] }, cors);
      return true;
    }
    if (name === CLIENT_CREATE.freeName) {
      sendJson(response, 200, { name, arity: 0, candidates: [] }, cors);
      return true;
    }
    if (name === CLIENT_CREATE.loneName) {
      sendJson(response, 200, { name, arity: 1, candidates: [CANDIDATE_CLIENT] }, cors);
      return true;
    }
    // ARITY >= 2 — PostgREST's own error envelope, and the exact shape `lib/doors.ts` classifies
    // as a governed DoorRefusal: a CLR code in `code`, the database's message verbatim, and the
    // typed detail inside `details`. The detail carries the CANDIDATE ROWS, which is what lets the
    // refused face render the same linkable list the successful one would have — 0204's own
    // contract, not a convenience of this fixture.
    sendJson(response, 400, {
      code: "CLR10",
      message: "this name matches 2 existing clients or counterparties in your firm; decide which business this is before another record is created",
      details: JSON.stringify({
        reason: "name_family_collision",
        class: "client_identity",
        name,
        arity: 2,
        candidates: [CANDIDATE_CLIENT, CANDIDATE_COUNTERPARTY],
      }),
    }, cors);
    return true;
  }

  if (verb === "begin_client_onboarding") {
    // A NAME THIS LANE DOES NOT OWN FALLS THROUGH to whichever lane minted it — above all the
    // P6-5 lane, which answers this door for every other name and says so in its own
    // declaration. The walk only ever reaches here for a name the face let through.
    if (!OWNED_NAMES.has(name)) return false;
    bornClients.set(CLIENT_CREATE.newClientId, {
      id: CLIENT_CREATE.newClientId,
      name,
      status: "onboarding",
      fy_end_month: null,
      fy_end_day: null,
      created_at: "2026-09-15T00:00:00.000Z",
    });
    sendJson(response, 200, { client_id: CLIENT_CREATE.newClientId, plan_id: CLIENT_CREATE.newPlanId }, cors);
    return true;
  }

  return false;
}
