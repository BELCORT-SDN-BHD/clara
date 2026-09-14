// The governed-Knowledge runtime helpers — #644, migration 0192_client_knowledge_records.sql.
//
// A NON-FROZEN lib module, and that is the point. The chat capture tool
// (`remember_client_information`) and the honest knowledge-pack context step both belong inside a
// frozen chatTurn body, and a frozen body is never edited afterwards. So every decision those two
// steps need — what an unavailable read looks like, how a governed refusal reaches the model, how
// an op_key is minted — is made HERE, where it can be reviewed and tested, and the frozen closure
// becomes two calls.
//
// WHAT `sql` IS: anything with `query(text, params)` — a `pg` Client or PoolClient. Every caller
// supplies its own scoped connection (the runtime lane's `withRuntime`, or the OBO-scoped client
// the chat step already opens), because THIS module decides nothing about authority. The doors do.
//
// =============================================================================================
// THE RULE THIS MODULE EXISTS TO ENFORCE.
//
// `loadContextStepV10` (workflows/chatTurn.v10.impl.ts:127-139, re-exported by v18) wraps its
// context-pack read in `catch { contextPack = null }`. A null pack and a client with genuinely no
// knowledge are then the same value, so a turn cannot tell "I could not read" from "there is
// nothing to read" — and #603 resolved exactly that: "required knowledge-read failures are
// technical retries/blocks, not silent empty knowledge and not requests for the user to repeat
// existing information."
//
// `readKnowledgePack` therefore NEVER returns null and NEVER throws into its caller. It answers
// `{status:'ok'}` with the door's own records, or `{status:'unavailable', reason}` with an EMPTY
// record list that no caller can mistake for data. The reasons are distinct on purpose:
//   no_client   — this turn has no client scope, so there is no pack to read (not a failure).
//   no_purpose  — a pack is read FOR something; an unstated purpose is a caller bug, not a read.
//   refused     — the door said no (a CLR code). The caller can surface it verbatim.
//   malformed   — the envelope is not the shape the door promises. Absence of a well-formed
//                 answer is NOT evidence of no knowledge (law 2), so this is unavailable, never
//                 an empty ok.
//   read_failed — transport/connection. Retryable, and the caller should say so rather than
//                 advising as though the client had no knowledge at all.
// =============================================================================================

import { randomUUID } from "node:crypto";

/** The door's own name, in one place, so a rename is one edit rather than a grep. */
export const KNOWLEDGE_PACK_FN = "clara.get_knowledge_pack";
export const CAPTURE_KNOWLEDGE_FOR_FN = "clara.capture_knowledge_for";

// THE PACK DOOR IS CALLED WITH NAMED ARGS, like the capture door and for the same reason: it
// gained a defaulted parameter (`p_firm`) in the #644 review round, and positional binding to a
// function whose arity moved is exactly how a silent mis-bind happens.
//
// `p_firm` IS THE TENANT BINDING, and this module does not invent it. The pack's machine lane
// REQUIRES it (CLR10 `pack_firm_required`) and refuses CLR11 when the named firm does not own the
// client, so a caller that omits it gets the door's own refusal rather than another firm's
// knowledge. The guard is deliberately NOT duplicated here: this module decides nothing about
// authority — the doors do — and a local "firmId is required" would be a second, drifting copy of
// a rule the database already enforces.
const PACK_SQL = `select ${KNOWLEDGE_PACK_FN}(
  p_client => $1, p_purpose => $2, p_firm => $3) as pack`;

// The runtime capture door, called with NAMED args (the estate's signature strategy: positional
// binding to a function that gained a defaulted parameter is how a silent mis-bind happens).
const CAPTURE_SQL = `select ${CAPTURE_KNOWLEDGE_FOR_FN}(
  p_asserted_by => $1, p_client => $2, p_knowledge_key => $3, p_value => $4::jsonb,
  p_basis => $5, p_op_key => $6, p_source_kind => $7, p_applies_when => $8::jsonb,
  p_effective_from => $9::date, p_effective_to => $10::date, p_source => $11::jsonb,
  p_correction_reason => $12) as receipt`;

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** A governed refusal is a CLR SQLSTATE; anything else is a transport or programming failure.
 *  Spelling is not identity: this reads the DRIVER's `code`, never the message text. */
function isGovernedRefusal(err) {
  return typeof err?.code === "string" && /^CLR\d{2}$/.test(err.code);
}

/** The DETAIL discriminant the doors attach, when they attach one. Never invented. */
function refusalReason(err) {
  if (typeof err?.detail !== "string") return null;
  try {
    const parsed = JSON.parse(err.detail);
    return typeof parsed?.reason === "string" ? parsed.reason : null;
  } catch {
    return null;
  }
}

function unavailable(reason, extra = {}) {
  return {
    status: "unavailable",
    reason,
    knowledge_version: null,
    records: [],
    ...extra,
  };
}

/**
 * Read one client's knowledge pack. Never null, never throws.
 *
 * `firmId` is the tenant the runtime lane MEANS. The door requires it of that lane and verifies
 * it against the client; omitting it yields the door's own `refused`/`pack_firm_required`, never
 * another firm's records.
 *
 * @param {{query: (text: string, params?: unknown[]) => Promise<{rows: any[]}>}} sql
 * @param {{clientId: string|null|undefined, purpose: string, firmId?: string|null}} args
 * @returns {Promise<{status: 'ok'|'unavailable', reason?: string, code?: string|null,
 *                    message?: string, purpose?: string, client_id?: string,
 *                    knowledge_version: unknown, records: unknown[]}>}
 */
export async function readKnowledgePack(sql, { clientId, purpose, firmId } = {}) {
  const client = text(clientId);
  if (!client) return unavailable("no_client");
  const p = text(purpose);
  if (!p) return unavailable("no_purpose");

  let pack;
  try {
    const r = await sql.query(PACK_SQL, [client, p, text(firmId) || null]);
    pack = r?.rows?.[0]?.pack;
  } catch (err) {
    if (isGovernedRefusal(err)) {
      return unavailable("refused", {
        code: err.code,
        detail_reason: refusalReason(err),
        // VERBATIM (lib/doors.ts's law, applied on this side of the wire): a governed refusal is
        // the database's considered answer and is never re-worded by a layer above it.
        message: String(err?.message ?? ""),
      });
    }
    return unavailable("read_failed", { code: null, message: String(err?.message ?? err) });
  }

  // THE SHAPE CHECK IS PART OF THE CONTRACT, not defensive noise. `get_knowledge_pack` promises
  // {status:'ok', records:[...], knowledge_version}. Anything else — a null, a pre-0192 database
  // answering something different, a future door that changed shape — is UNAVAILABLE. Reading a
  // missing `records` as `[]` would manufacture exactly the false "this client knows nothing"
  // that this module exists to prevent.
  if (!pack || typeof pack !== "object" || pack.status !== "ok" || !Array.isArray(pack.records)) {
    return unavailable("malformed", {
      message: `${KNOWLEDGE_PACK_FN} answered an envelope this reader does not recognise`,
    });
  }

  return {
    status: "ok",
    client_id: pack.client_id ?? client,
    firm_id: pack.firm_id ?? null,
    purpose: pack.purpose ?? p,
    // VERBATIM. The watermark #631's trace records is a bigint the driver hands over as a STRING;
    // coercing it through Number() would quietly lose precision past 2^53 and, worse, would make
    // a later "is this the version I read?" comparison compare two different things.
    knowledge_version: pack.knowledge_version ?? null,
    records: pack.records,
  };
}

function invalid(message) {
  return { ok: false, kind: "invalid_request", code: null, reason: null, message };
}

/**
 * Capture (or, with `correctionReason`, correct) one client-scoped knowledge record on behalf of
 * a NAMED human. The door verifies that person's live active membership and rank itself — this
 * helper never decides authority and never impersonates.
 *
 * Never throws. A governed refusal comes back as `{ok:false, kind:'refusal', code, reason,
 * message}` so a tool can surface the database's own sentence; a transport failure is
 * `{ok:false, kind:'unavailable'}`, which is a different thing and must be retried, not shown to
 * the user as a refusal.
 *
 * @param {{query: (text: string, params?: unknown[]) => Promise<{rows: any[]}>}} sql
 */
export async function captureKnowledgeFor(sql, args = {}) {
  const assertedBy = text(args.assertedBy);
  if (!assertedBy) return invalid("assertedBy is required: a runtime capture names the human whose statement it is");
  const clientId = text(args.clientId);
  if (!clientId) return invalid("clientId is required: the runtime knowledge lane is client-scoped");
  const knowledgeKey = text(args.knowledgeKey);
  if (!knowledgeKey) return invalid("knowledgeKey is required");
  if (args.value === undefined) return invalid("value is required (a JSON null is a value; undefined is not)");
  const basis = text(args.basis);
  if (!basis) return invalid("basis is required: who said so, on what evidence");

  const params = [
    assertedBy,
    clientId,
    knowledgeKey,
    JSON.stringify(args.value),
    basis,
    // A SUPPLIED op_key is used VERBATIM — that is what makes a retried tool call idempotent
    // rather than a second record. An absent one is minted here, so a caller that does not care
    // still cannot collide with another turn.
    text(args.opKey) || `kn_${randomUUID()}`,
    text(args.sourceKind) || "user_statement",
    JSON.stringify(args.appliesWhen ?? {}),
    args.effectiveFrom ?? null,
    args.effectiveTo ?? null,
    JSON.stringify(args.source ?? {}),
    text(args.correctionReason) || null,
  ];

  try {
    const r = await sql.query(CAPTURE_SQL, params);
    return { ok: true, receipt: r?.rows?.[0]?.receipt ?? null };
  } catch (err) {
    if (isGovernedRefusal(err)) {
      return {
        ok: false,
        kind: "refusal",
        code: err.code,
        reason: refusalReason(err),
        message: String(err?.message ?? ""),
      };
    }
    return { ok: false, kind: "unavailable", code: null, reason: null, message: String(err?.message ?? err) };
  }
}
