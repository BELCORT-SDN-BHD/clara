// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (pack) — the run record, the pack view, and the two PURE judgements the tool set makes
// before and after a database call: which allocation a match may send, and whether a reply is an
// admitted act. Split from bankAgent.v1.tools.ts for the repo's 500-line module budget, exactly as
// closePrep.v1.reads.ts is split from its own tools file — and with the same second benefit: every
// judgement in here is a plain function a cell can drive directly, with no pool, no credential and
// no model in the way.
//
// THE ONE LAW THIS FILE EXISTS TO KEEP (裁-44 / FOLD-1, hard constraint 2): no numeral the MODEL
// produced may reach clara.bank_match_entry_members. The model names lines and entries; every cent
// is read back out of the pack the database itself computed and digested.

/** The prose cap every model-written string on this lane carries (裁-44 / FOLD-7).
 *
 *  4000 is the DATABASE'S OWN number where one exists — clara.bank_agent_receipts.rationale is
 *  `check (btrim(rationale) <> '' and length(rationale) <= 4000)` (0121:4375), and the close lane's
 *  receipt carries the identical check (0138:362). Every OTHER prose column these verbs write
 *  (bank_agent_proposals.rationale at 0121:4425, the proposal payload's reason and identifier
 *  value) is guarded only as non-blank, so 4000 is applied here as the estate's own house limit
 *  rather than invented. A model that writes past it now gets a SCHEMA error it can shorten and
 *  retry, instead of a CLR10 length violation from a receipt insert it cannot see. The DB-side
 *  CHECKs that would make this structural are booked as G1 PR-2 / the 裁-44 DB pass. */
export const BANK_PROSE_MAX = 4000;

/** DID THE DATABASE JUDGE THIS, or did the call never reach it? Only the estate's own typed
 *  refusal codes count as a verdict — a POSITIVE test on the one signal that means "the DB
 *  considered this and said no". Everything else (pools, a mint failure, a driver fault) falls to
 *  the other branch, which is the fail-safe direction: none of those is the model's fault. */
export function isDbVerdict(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^CLR\d{2}$/.test(code);
}

/** The DB's OWN typed reason for a refusal, read out of the error's `detail` — which every guard
 *  in 0121 populates as a json object (`detail='{"reason":"op_key_identity_mismatch"}'`, :5004).
 *  Read as DATA, never matched against the human message text: the message is prose that may be
 *  reworded, the detail is the contract (review law 3 — spelling is not identity). Returns null
 *  when there is no parseable typed reason, which falls through to the generic branch. */
export function dbRefusalReason(e: unknown): string | null {
  const detail = (e as { detail?: unknown })?.detail;
  if (typeof detail !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    const reason = (parsed as { reason?: unknown })?.reason;
    return typeof reason === "string" ? reason : null;
  } catch {
    return null;
  }
}

/** One oracle-safe refusal string for every authority/tenant fault, identical regardless of
 *  whether the subject exists — the same shape autoDraft's safeRead uses, for the same reason:
 *  a refusal that varies with existence is an existence oracle.
 *
 *  THE NON-VERDICT BRANCH IS NOW REDACTED TOO (裁-44 / FIND-9). It used to hand the raw driver
 *  message back to the model, which made this function's own oracle-safety claim false for exactly
 *  the errors nobody audits: a connection string, a role name, a constraint name, whatever the
 *  driver happened to say. The model can do nothing with any of it — the fault is OURS, not its —
 *  so it gets a fixed sentence, and the real message goes to the runtime log where an operator
 *  reads it. Deliberately a redaction rather than a comment admitting the leak.
 *
 *  IT ALSO RECORDS WHO IS AT FAULT (S9) — see BankRunRecord.infraFaults. */
export function refusal(rec: BankRunRecord, e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (!isDbVerdict(e)) {
    rec.infraFaults += 1;
    console.warn(`[bankAgent_v1] tool call did not reach the database: ${e instanceof Error ? e.message : String(e)}`);
    return { error: "the act did not go through: something on our side failed before the database saw it. Do not retry it." };
  }
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  return { error: `refused (${code}): the database declined this act.` };
}

/** The pack THIS run read, reduced to the three facts a write needs from it. Built ONLY from what
 *  the database returned — never from anything the model said. */
export type BankPackView = {
  digest: string;
  /** line_id (lowercase) -> the line's own amount_cents, as the DB reported it. */
  lineCents: Map<string, number>;
  /** entry_id (lowercase) -> the remaining capacity on each side, as the DB reported it. */
  entryCaps: Map<string, { dr: number; cr: number }>;
};

/** The mutable per-run record. One per tool set, i.e. per model-step execution attempt. */
export type BankRunRecord = {
  /** The pack view, or null before the first successful pack read. */
  pack: BankPackView | null;
  /** The digest, kept beside the view because the outcome classifier asks only "did we look?". */
  digest: string | null;
  admitted: number;
  /** 裁-44 / FOLD-3 — writes the model ATTEMPTED, admitted or not (a local refusal counts). */
  writeAttempts: number;
  /** 裁-44 / FOLD-3 — writes that were REFUSED, locally or by the database. */
  refusals: number;
  /** Pack reads only, and only to keep their op keys distinct — see bankOpKey's own header. */
  packReads: number;
  /** Tool calls that NEVER REACHED the database, so this lane cannot blame the model for its own
   *  bugs (S9) — see closePrep.v1.reads.ts's own record for the full statement. */
  infraFaults: number;
  /** 裁-44 / FOLD-8 — the STEP ATTEMPT's own identity, folded into every pack read's op key so a
   *  WDK retry's first re-read does not collide with the previous attempt's. */
  attemptKey: string;
  /** 裁-44 / FOLD-2 — the non-'running' status a write gate actually SAW, or null. Once set, every
   *  later act refuses and the run settles the cancellation instead of a night's work. */
  cancelledAs: string | null;
};

export function newBankRunRecord(attemptKey: string): BankRunRecord {
  return {
    pack: null,
    digest: null,
    admitted: 0,
    writeAttempts: 0,
    refusals: 0,
    packReads: 0,
    infraFaults: 0,
    attemptKey,
    cancelledAs: null,
  };
}

const uuidKey = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v.toLowerCase() : null);
const intOr = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/**
 * Reduce the database's own pack reply to the view a write is allowed to derive numbers from.
 *
 * EVERY FIELD READ HERE IS THE DB'S (0121:5715-5771, read directly): `lines[].line_id` and
 * `lines[].amount_cents` come from clara.bank_statement_lines; `candidates[].entry_id`,
 * `debit_remaining_cents` and `credit_remaining_cents` are the pack's own arithmetic over
 * clara.journal_lines minus every live/pending bank_match_entry_members row. Returns null when the
 * reply carries no digest — an unreadable pack is not a pack, and the caller fails closed on it.
 */
export function readPackView(pack: unknown): BankPackView | null {
  const p = pack as { digest?: unknown; lines?: unknown; candidates?: unknown } | null;
  const digest = typeof p?.digest === "string" && p.digest.length > 0 ? p.digest : null;
  if (digest === null) return null;
  const lineCents = new Map<string, number>();
  for (const l of Array.isArray(p?.lines) ? p.lines : []) {
    const id = uuidKey((l as { line_id?: unknown })?.line_id);
    if (id !== null) lineCents.set(id, intOr((l as { amount_cents?: unknown }).amount_cents, 0));
  }
  const entryCaps = new Map<string, { dr: number; cr: number }>();
  for (const c of Array.isArray(p?.candidates) ? p.candidates : []) {
    const id = uuidKey((c as { entry_id?: unknown })?.entry_id);
    if (id !== null) {
      entryCaps.set(id, {
        dr: intOr((c as { debit_remaining_cents?: unknown }).debit_remaining_cents, 0),
        cr: intOr((c as { credit_remaining_cents?: unknown }).credit_remaining_cents, 0),
      });
    }
  }
  return { digest, lineCents, entryCaps };
}

/** What a match allocation derivation produced: either the exact entry rows to send, or a typed
 *  reason the model can act on. `reason` is a stable token, not prose — the cells pin it. */
export type BankAllocation =
  | { ok: true; entries: Array<{ entry_id: string; matched_cents: number }>; lineCents: number }
  | { ok: false; reason: string; detail: string };

/**
 * DERIVE THE ALLOCATION FROM THE PACK — the whole of 裁-44 / FOLD-1 in one pure function.
 *
 * WHAT THE DATABASE'S OWN LADDER DOES NOT CATCH, and why this function has to exist. 0121's
 * `tie_nonzero` checks only the AGGREGATE (`v_line_cents <> v_entry_cents + v_adj_cents`,
 * :5897); `capacity_exhausted` bounds each amount by that entry's OWN remaining capacity
 * (:5955-5967); `same_amount_ambiguous` searches for an UNSELECTED entry whose capacity equals
 * the aggregate (:5911-5918). A 10,000-cent line split 4,999 + 5,001 across two entries that
 * each have spare capacity passes all three — and the model's invented split becomes a durable
 * clara.bank_match_entry_members row. That is a model-generated numeral in a client's books,
 * which hard constraint 2 forbids outright.
 *
 * THE TWO ADMISSIBLE SHAPES, and there is no third:
 *   ONE entry   — matched_cents is the signed min of the line total and that entry's remaining
 *                 capacity on the matching side. When the capacity is the larger of the two the
 *                 line settles in full and the entry is partly consumed; when it is the smaller,
 *                 the derived amount cannot tie and the DATABASE refuses on tie_nonzero, which is
 *                 the right court for that verdict.
 *   MANY entries — every selected entry contributes its FULL remaining capacity, and their sum
 *                 must equal the line total exactly. A model that wants a different division does
 *                 not get one: there is no arithmetic left for it to invent.
 * Anything else is refused HERE, with a typed reason, and the prompt sends the model to
 * propose_line_exception — a human dividing an amount is the whole point of that door.
 *
 * THE SIGN CONVENTION is the estate's: matched_cents is the signed effect on the BANK account, so
 * a positive line (money in) is settled by DEBIT capacity and a negative line by CREDIT capacity.
 */
export function deriveMatchAllocation(pack: BankPackView, lineIds: string[], entryIds: string[]): BankAllocation {
  const lines = [...new Set(lineIds.map((v) => v.toLowerCase()))];
  const entries = [...new Set(entryIds.map((v) => v.toLowerCase()))];
  if (lines.length === 0) return { ok: false, reason: "no_lines", detail: "name at least one statement line" };
  if (entries.length === 0) return { ok: false, reason: "no_entries", detail: "name at least one journal entry" };

  const missingLine = lines.find((id) => !pack.lineCents.has(id));
  if (missingLine !== undefined) {
    return { ok: false, reason: "line_not_in_pack", detail: `line ${missingLine} is not among the unmatched lines of the pack this run read` };
  }
  const missingEntry = entries.find((id) => !pack.entryCaps.has(id));
  if (missingEntry !== undefined) {
    return { ok: false, reason: "entry_not_in_pack", detail: `entry ${missingEntry} is not among the candidates of the pack this run read` };
  }

  const lineCents = lines.reduce((sum, id) => sum + (pack.lineCents.get(id) ?? 0), 0);
  if (lineCents === 0) {
    return { ok: false, reason: "lines_net_to_zero", detail: "the lines you named net to zero, and a match must settle a non-zero amount" };
  }
  const sign = lineCents > 0 ? 1 : -1;
  const want = Math.abs(lineCents);
  const capacityOf = (id: string): number => {
    const cap = pack.entryCaps.get(id);
    return cap === undefined ? 0 : sign > 0 ? cap.dr : cap.cr;
  };

  const empty = entries.find((id) => capacityOf(id) <= 0);
  if (empty !== undefined) {
    return {
      ok: false,
      reason: "entry_has_no_capacity",
      detail: `entry ${empty} has no remaining ${sign > 0 ? "debit" : "credit"} capacity against this bank account in the pack this run read`,
    };
  }

  const only = entries[0];
  if (entries.length === 1 && only !== undefined) {
    const magnitude = Math.min(want, capacityOf(only));
    return { ok: true, entries: [{ entry_id: only, matched_cents: sign * magnitude }], lineCents };
  }

  const total = entries.reduce((sum, id) => sum + capacityOf(id), 0);
  if (total !== want) {
    return {
      ok: false,
      reason: "entries_do_not_tie",
      detail:
        `the entries you named carry ${total} cent(s) of remaining capacity between them and the line(s) total ${want} — ` +
        "a multi-entry match settles every entry in FULL, so pick a set that adds up, or propose an exception for a human to divide",
    };
  }
  return { ok: true, entries: entries.map((id) => ({ entry_id: id, matched_cents: sign * capacityOf(id) })), lineCents };
}

/** The three verbs' own POSITIVE admitted shapes (裁-44 / FOLD-5).
 *
 *  THIS USED TO BE ABSENCE-BASED — "no `error` key and status is not 'refused'" — which review law
 *  2 forbids and which counted an empty object, an unrecognised reply and clara._reserve_op's own
 *  `{"pending": true}` (0004:59, a reservation whose first attempt never finished) as admitted
 *  acts. Each verb's success shape was read off 0121 rather than guessed:
 *    match      — _match_bank_line_core returns {match_id, status} and this delegate only ever
 *                 inserts 'live' groups (0121:1622, :5840).
 *    exception  — {proposal_id, status:'open', line_id} (0121:5566).
 *    promotion  — {proposal_id, status:'open', counterparty_id} (0121:5643).
 *  A REPLAY returns the stored result verbatim (_reserve_op/_finish_op, 0004:53-59), so a replay
 *  counts as admitted — correctly: it names the same durable act, which did happen. */
export type BankVerb = "match" | "exception" | "promotion";

export function isAdmittedBankReply(verb: BankVerb, reply: unknown): boolean {
  const r = reply as { status?: unknown; match_id?: unknown; proposal_id?: unknown } | null;
  if (r === null || typeof r !== "object") return false;
  if (verb === "match") return r.status === "live" && typeof r.match_id === "string";
  return r.status === "open" && typeof r.proposal_id === "string";
}

export function countIfAdmitted(rec: BankRunRecord, verb: BankVerb, reply: unknown): unknown {
  if (isAdmittedBankReply(verb, reply)) rec.admitted += 1;
  else rec.refusals += 1;
  return reply;
}
