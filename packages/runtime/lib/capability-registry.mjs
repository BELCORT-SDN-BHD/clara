// THE SERVER-OWNED CAPABILITY REGISTRY (#631 AC1). One place that says, for every capability a
// Clara run may exercise, WHICH purpose token authorises it, WHAT class of data it moves, whether
// it is MODEL-BOUND (i.e. whether exercising it is an egress event at all), and which database
// SCOPE it needs.
//
// WHAT THIS FILE IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT.
//
// It is the successor to `GOVERNED_EGRESS_PURPOSES` (lib/egress.mjs:232-300), widened from "which
// egress purposes exist" to "which CAPABILITIES exist and what each one is allowed to reach". It
// is DOCUMENTATION AND A LOOKUP. It is NEVER an authorization: nothing in the runtime may treat a
// capability's presence here as permission. The database verbs are the only gate — a capability
// listed here whose purpose has no live authorization is refused at
// `clara.consume_egress_dispatch` and refused AGAIN at `clara._record_journal_entry_core`
// (migration 0195), and this object cannot change either answer.
//
// WHY IT MATTERS ANYWAY, AND WHAT AC1 ACTUALLY ASKS FOR. The acceptance line is "expose the model
// and its tools ONLY from a server-owned capability registry; prompt, file, wiki and imported OKF
// content cannot register tools, widen scope or grant authority." The STRUCTURAL half of that is
// already true and stays true: `buildClaraWorkToolsV3` returns a FIXED OBJECT LITERAL of three
// tools whose names come from the hashed bundle's own roster, so there is no code path — none —
// by which a string arriving from a document, a wiki page, a Knowledge record or a model's own
// output can add a key to it. This registry is the DECLARATIVE half: it names what those three
// tools are FOR, so a reviewer can ask "which capability moved this client's data, under which
// purpose" and get an answer that is not a grep.
//
// THE VERSION IS PART OF THE ANSWER. Every execution-trace row records `registry_version` beside
// `capability_id`, so "which registry decided this" is a recorded fact rather than an assumption
// about which image was live. Bump it in the SAME commit as any change to the table below.

/** The registry's own version. Recorded on every `clara.work_execution_traces` row. */
export const CAPABILITY_REGISTRY_VERSION = "clara-capability-registry/v1";

/** The data classes a capability may move. Closed. */
export const DATA_CLASSES = Object.freeze(["client_confidential", "firm_internal", "public"]);

/**
 * THE TABLE. Keyed by capability id — a stable string that is NOT a tool name, because one
 * capability can be exercised by more than one tool version and a tool name is a spelling.
 *
 * `purpose`        the typed egress purpose token that authorises it, or null when exercising the
 *                  capability moves nothing to a third party.
 * `modelBound`     true iff exercising it sends client data to an external model/vendor. This is
 *                  the field that decides whether a dispatch authorization is owed AT ALL.
 * `dataClass`      what class of data it moves.
 * `scope`          the database surface it needs, named as the role and the door, so a reviewer
 *                  can check the grant rather than trust the description.
 * `description`    one sentence, in the terms the domain uses.
 */
export const CAPABILITY_REGISTRY = Object.freeze({
  "accounting_work.model_segment": Object.freeze({
    id: "accounting_work.model_segment",
    purpose: "accounting_work",
    modelBound: true,
    dataClass: "client_confidential",
    scope: "clara_runtime → clara.prepare_work_egress_dispatch + clara.consume_egress_dispatch",
    description:
      "ONE model segment of an admitted accounting Work: the admitted basis and this client's "
      + "chart go to the model. This is the only model-bound capability the Work lane has.",
  }),
  "accounting_work.list_accounts": Object.freeze({
    id: "accounting_work.list_accounts",
    purpose: null,
    modelBound: false,
    dataClass: "client_confidential",
    scope: "clara_wake_interactive (OBO, client-pinned) → clara.trial_balance",
    description:
      "Read this client's chart of accounts with its current approved totals. A LOCAL read: the "
      + "rows reach the model only as part of the segment above, which is separately authorised.",
  }),
  "accounting_work.record_journal_entry": Object.freeze({
    id: "accounting_work.record_journal_entry",
    purpose: "accounting_work",
    modelBound: false,
    dataClass: "client_confidential",
    scope: "clara_wake_interactive (OBO, client-pinned) → clara.wake_record_journal_entry",
    description:
      "Record the admitted journal entry. It moves nothing to a third party, but it carries the "
      + "purpose token because migration 0195's posting core re-verifies the SAME authorisation "
      + "at the write — the second, independent check #631 AC2 asks for.",
  }),
  "accounting_work.ask_question": Object.freeze({
    id: "accounting_work.ask_question",
    purpose: null,
    modelBound: false,
    dataClass: "firm_internal",
    scope: "clara_runtime → clara.open_work_question",
    description:
      "Park the Work on ONE shared, typed question for a human. Nothing leaves the estate; the "
      + "question and its answer live in clara.agent_interruptions.",
  }),
  "accounting_work.settle": Object.freeze({
    id: "accounting_work.settle",
    purpose: null,
    modelBound: false,
    dataClass: "firm_internal",
    scope: "clara_runtime → clara.settle_work_run",
    description: "Settle the run and the Work to one terminal outcome. Idempotent by task.",
  }),
});

/** Look one capability up. Returns null rather than throwing: a caller that names a capability
 *  this registry does not carry has a bug, and the trace row should RECORD the unknown id rather
 *  than crash a run over a diagnostic. */
export function capability(id) {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_REGISTRY, id) ? CAPABILITY_REGISTRY[id] : null;
}

/** The purpose token a capability needs, or null. NEVER an authorization — see this file's head. */
export function purposeFor(id) {
  return capability(id)?.purpose ?? null;
}

/** True iff exercising this capability is an egress event, i.e. a dispatch authorization is owed
 *  before it runs. */
export function isModelBound(id) {
  return capability(id)?.modelBound === true;
}

/** Every capability id, sorted — the shape a census asserts against. */
export function capabilityIds() {
  return Object.keys(CAPABILITY_REGISTRY).sort();
}
