// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE REFUSAL ENVELOPE THE SEVEN NEW TOOLS SHARE.
//
// ONE MODULE RATHER THAN TWO COPIES, and the reason is the estate's own: the three reads of #1136
// and the four tenancy tools of #1137 land in separate modules (they are separate subjects with
// separate doors), and a second copy of an envelope is how two tools in one version come to
// disagree about what a refusal looks like. `chatTurn.v23.tools.ts` imports BOTH modules to build
// the map, so the shared helpers cannot live in either of them without a cycle.
//
// THE SHAPE IS v22's, BY REFERENCE. `ToolRefusalV23` is `ToolRefusalV22`, which is v21's, which is
// v20's: this cut adds no field to a refusal and renames nothing.

import { authoringRefusal } from "./chatTurn.v11.tools.js";
import type { ToolRefusalV22 } from "./chatTurn.v22.tools.js";

/** v22's refusal envelope, unchanged and reached by reference. */
export type ToolRefusalV23 = ToolRefusalV22;

/** The shape node-postgres hands a caught door error. */
export type DbErrorV23 = { code?: string; message?: string; detail?: string };

/** A GOVERNED REFUSAL IS A CLR SQLSTATE, AND NOTHING ELSE IS — v22's `isGovernedRefusalV22`,
 *  carried. Anything else is a fault this lane owns, not a sentence a person should read. */
export function isGovernedRefusalV23(code: unknown): boolean {
  return typeof code === "string" && /^CLR\d{2}$/.test(code);
}

/** A fault of this lane's own making. It carries no CLR code because the database did not refuse:
 *  something in the tool's own wiring did. */
export function internalFaultV23(message: string): ToolRefusalV23 {
  return { ok: false, code: "internal", reason: null, fix: null, message, details: {} };
}

/** The conversation is bound to no client at all. v22's sentence shape and v22's fix, carried. */
export function noClientRefusalV23(reason: string, message: string): ToolRefusalV23 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client workspace whose books this belongs to.",
    message,
    details: {},
  };
}

/**
 * The model named a client that is not the one this conversation is pinned to.
 *
 * REFUSED RATHER THAN SILENTLY RESOLVED, and #1137's contract says why in one line: a tool that
 * quietly preferred one of two client ids would be deciding whose books an act lands in.
 */
export function clientMismatchRefusalV23(reason: string, message: string, clientId: string): ToolRefusalV23 {
  return {
    ok: false,
    code: "CLR03",
    reason,
    fix: "Open this conversation from the client whose books you mean, then ask again.",
    message,
    details: { client_id: clientId },
  };
}

/**
 * The database's typed refusal, handed back with this cut's own sentence when the estate knows
 * the reason and with the door's own message verbatim when it does not.
 *
 * `sentence(reason, detail, code)` is the caller's map; returning null from it means "this cut has
 * no sentence for that token", and the door's own message is then carried verbatim rather than
 * replaced by a generic one.
 *
 * A MAP MAY ALSO NAME THE TOOL'S OWN TOKEN, by returning `{reason, message}` instead of a bare
 * string, AND THAT IS A MEASUREMENT RATHER THAN A CONVENIENCE. `tests/chat-turn-v23-e2e.mjs` drove
 * `clara.wake_get_contract_terms` against a document the firm does not hold: the door answered
 * `CLR11` with a sentence and NO `detail.reason`, so a mapper that replaced only the MESSAGE handed
 * the model `reason: null` — losing the very token the contract's refusal table tells a caller to
 * branch on. A map that names one wins; a door that sent its own keeps it.
 *
 * THE CODE IS PASSED AS WELL AS THE REASON, and that is not redundancy: some doors refuse with a
 * sqlstate and NO typed reason (`CLR16` on a document that is not what the caller named), so a map
 * keyed on the reason alone could never reach them. The reason is passed as `""` in that case
 * rather than as null, so a map never has to test two kinds of absence.
 *
 * A refusal whose code is not a CLR sqlstate is a FAULT rather than a refusal: the door did not
 * govern it, so nobody wrote a sentence for it and nobody should read one.
 */
export type MappedRefusalV23 = string | { reason?: string; message: string } | null;

/**
 * THE `CLR03` ARM EVERY READ OF THIS CUT OWES, and it is a correction rather than a convenience.
 *
 * `authoringRefusal` replaces the message of ANY `CLR03` with its own literal — "That authoring
 * action is not permitted in this session." — which is the AUTHORING lane's sentence. The five
 * reads of #1136 and #1137 each specify their own ("I cannot read your firm's inbox in this
 * conversation.", and four siblings), and every one of them shipped as a constant no mapper
 * reached: the review round drove a `CLR03` through the shipped mapper and read the authoring
 * sentence back. Calling a READ an authoring action is also wrong on its face.
 *
 * The TOKEN is `not_permitted`, which is the refusal table's own word, and it is named only where
 * the door named none: `governedRefusalV23` still lets a door's own token win.
 */
export function notPermittedV23(sentence: string): { reason: string; message: string } {
  return { reason: "not_permitted", message: sentence };
}

export function governedRefusalV23(
  error: unknown,
  sentence: (reason: string, detail: Record<string, unknown>, code: string) => MappedRefusalV23,
  internalMessage: string,
): ToolRefusalV23 {
  const refused = authoringRefusal(error as DbErrorV23);
  if (refused.ok !== false) return internalFaultV23(internalMessage);
  if (!isGovernedRefusalV23(refused.code)) return internalFaultV23(internalMessage);
  const reason = typeof refused.reason === "string" ? refused.reason : null;
  const mapped = sentence(reason ?? "", refused.details, String(refused.code));
  const message = mapped === null ? refused.message : typeof mapped === "string" ? mapped : mapped.message;
  const named = mapped === null || typeof mapped === "string" ? null : (mapped.reason ?? null);
  return {
    ok: false,
    code: refused.code,
    // THE DOOR'S OWN TOKEN WINS where it sent one: this cut renames nothing a door named.
    reason: reason ?? named,
    fix: refused.fix,
    message,
    details: refused.details,
  };
}
