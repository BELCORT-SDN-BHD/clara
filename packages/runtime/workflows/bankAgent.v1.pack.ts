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

/** The pack THIS run read, reduced to the facts a write needs from it. Built ONLY from what the
 *  database returned — never from anything the model said. */
export type BankPackView = {
  digest: string;
  /** line_id (lowercase) -> the line's own amount_cents, as the DB reported it. */
  lineCents: Map<string, number>;
  /** line_id (lowercase) -> the line's printed descriptive text, lowercased for matching.
   *
   *  裁-44 R2 / FOLD-11 — this is the EVIDENCE a promotion's `times_seen` is counted from, so it
   *  is part of the pack view rather than something a tool re-reads later. Empty string when the
   *  database reported no description: `clara.bank_statement_lines.description` is NULLABLE
   *  (`0038:546`, measured — not assumed), and a line with no printed narrative is a legitimate
   *  state of the books, not a corrupt reply. It matches no identifier, which is the conservative
   *  direction: a promotion grounded in nothing is refused rather than admitted. */
  lineText: Map<string, string>;
  /** entry_id (lowercase) -> the remaining capacity on each side, as the DB reported it. */
  entryCaps: Map<string, { dr: number; cr: number }>;
};

/** Reading a pack either produces a view or FAILS — there is no third answer, and that is the
 *  whole of 裁-44 R2 / FOLD-12. A malformed reply used to become an authoritative EMPTY pack: the
 *  run armed itself on it, every write was refused for "not in the pack", and the task settled
 *  `nothing_due` — a corrupt read reported as a quiet night. Absence is not evidence (review law
 *  2), so a reply this parser cannot fully account for is an INFRASTRUCTURE failure. */
export type BankPackParse =
  | { ok: true; view: BankPackView }
  | { ok: false; reason: string; detail: string };

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An id the DATABASE could have written, lowercased. Anything else is null and fails the parse —
 *  a key this closure cannot round-trip against the DB's own lowercase spelling is not an id. */
const uuidKey = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const k = v.toLowerCase();
  return UUID_RE.test(k) ? k : null;
};

/**
 * A CENTS VALUE THIS PROCESS CAN CARRY WITHOUT ROUNDING IT — 裁-44 R2 / FOLD-10, and the reason
 * this is a hard gate rather than a coercion.
 *
 * THE LOSS HAPPENS BEFORE THIS CODE RUNS. The pack arrives as jsonb, node-postgres parses it with
 * JSON.parse, and `amount_cents` is an unrestricted PostgreSQL bigint. 9007199254740993 is already
 * 9007199254740992 by the time any function here sees it. So there is nothing to "detect" about
 * the original value — what there is, is a SOUND test on the result: every integer JSON.parse
 * rounds lands at or above 2^53, and Number.isSafeInteger is false for all of those. An integer
 * that IS a safe integer round-tripped exactly. The test therefore admits exactly the values this
 * process can carry losslessly, and refuses every value it cannot — which is the whole
 * requirement, even though it can never name the digit it lost.
 *
 * WHAT THE ROUNDING WOULD HAVE COST, since "a big number" sounds academic: a cap of
 * 9007199254740993 paired with a cap of 5 against a line of 9007199254740997 ties EXACTLY in
 * rounded JS arithmetic and EXACTLY in PostgreSQL's — but they are different sums. The evaluator
 * would claim a multi-entry FULL settlement while leaving the first entry one cent open, and every
 * DB rung would pass. A wrong durable amount, from arithmetic this process was never able to do.
 *
 * A STRING IS ACCEPTED ONLY IF IT ROUND-TRIPS, which is the same test one layer out: node-postgres
 * hands back int8 columns as decimal strings in some shapes, and `Number("9007199254740993")` is
 * just as lossy as JSON.parse. `String(Number(s)) === s` is exact for every decimal integer that
 * survives, and rejects leading zeros and any other spelling this closure cannot reproduce.
 *
 * The lossless answer is bigint end to end (decimal strings out of the pack, BigInt sums, decimal
 * strings back in). That is a v2 change to a frozen body and is recorded as a known limit.
 */
export function exactCents(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) ? v : null;
  if (typeof v === "string") {
    if (!/^-?\d+$/.test(v)) return null;
    const n = Number(v);
    return Number.isSafeInteger(n) && String(n) === v ? n : null;
  }
  return null;
}

const packFail = (reason: string, detail: string): BankPackParse => ({ ok: false, reason, detail });

/**
 * Reduce the database's own pack reply to the view a write is allowed to derive numbers from —
 * or FAIL, loudly, without producing a view at all.
 *
 * EVERY FIELD READ HERE IS THE DB'S (0121:5715-5771, read directly): `lines[].line_id`,
 * `lines[].amount_cents` and `lines[].description` come from clara.bank_statement_lines;
 * `candidates[].entry_id`, `debit_remaining_cents` and `credit_remaining_cents` are the pack's own
 * arithmetic over clara.journal_lines minus every live/pending bank_match_entry_members row.
 *
 * 裁-44 R2 / FOLD-12 — WHY EVERY BRANCH BELOW FAILS RATHER THAN COERCES. The earlier version read
 * `{digest}` as an authoritative EMPTY pack and turned a missing or malformed cents value into
 * ZERO. Both are absence-as-evidence, and the second is the sharper one: a silently-zeroed LINE
 * amount does not merely refuse a write, it CHANGES a multi-line allocation's total without
 * complaining — the derivation then ties against a number the books never carried. So the parser
 * admits only what it can fully account for, and everything else is an INFRASTRUCTURE failure the
 * caller settles `internal` on. It is never a refusal: a refusal blames the model for our fault.
 */
export function readPackView(pack: unknown): BankPackParse {
  const p = pack as { digest?: unknown; lines?: unknown; candidates?: unknown } | null;
  if (p === null || typeof p !== "object") return packFail("pack_not_object", "the pack reply is not an object");
  if (typeof p.digest !== "string" || p.digest.length === 0) return packFail("no_digest", "the pack reply carries no digest");
  // EXPLICIT ARRAYS, NOT "whatever is iterable". The verb always builds both with
  // coalesce(jsonb_agg(...), '[]'::jsonb), so an ABSENT one means the reply is not the verb's.
  if (!Array.isArray(p.lines)) return packFail("lines_not_array", "the pack reply carries no `lines` array");
  if (!Array.isArray(p.candidates)) return packFail("candidates_not_array", "the pack reply carries no `candidates` array");

  const lineCents = new Map<string, number>();
  const lineText = new Map<string, string>();
  for (const raw of p.lines) {
    const l = raw as { line_id?: unknown; amount_cents?: unknown; description?: unknown } | null;
    const id = uuidKey(l?.line_id);
    if (id === null) return packFail("line_id_malformed", `a pack line carries no usable line_id (${String(l?.line_id)})`);
    const cents = exactCents(l?.amount_cents);
    if (cents === null) {
      return packFail("line_cents_unrepresentable", `line ${id}'s amount_cents is missing, non-integer, or beyond this process's exact range`);
    }
    // description is NULLABLE in the schema (0038:546) — null/absent is a real state of the books
    // and becomes empty text, which matches no identifier. Any OTHER type is a malformed reply.
    const text = l?.description;
    if (text !== null && text !== undefined && typeof text !== "string") {
      return packFail("line_description_malformed", `line ${id}'s description is neither text nor null`);
    }
    lineCents.set(id, cents);
    lineText.set(id, typeof text === "string" ? text.toLowerCase() : "");
  }

  const entryCaps = new Map<string, { dr: number; cr: number }>();
  for (const raw of p.candidates) {
    const c = raw as { entry_id?: unknown; debit_remaining_cents?: unknown; credit_remaining_cents?: unknown } | null;
    const id = uuidKey(c?.entry_id);
    if (id === null) return packFail("entry_id_malformed", `a pack candidate carries no usable entry_id (${String(c?.entry_id)})`);
    const dr = exactCents(c?.debit_remaining_cents);
    const cr = exactCents(c?.credit_remaining_cents);
    if (dr === null || cr === null) {
      return packFail("capacity_unrepresentable", `entry ${id}'s remaining capacity is missing, non-integer, or beyond this process's exact range`);
    }
    entryCaps.set(id, { dr, cr });
  }
  return { ok: true, view: { digest: p.digest, lineCents, lineText, entryCaps } };
}

/**
 * COUNT THE SIGHTINGS OF AN IDENTIFIER IN THE PACK THIS RUN READ — 裁-44 R2 / FOLD-11.
 *
 * `times_seen` used to be the MODEL's number, and 0121:5634 stores it verbatim in the proposal
 * payload a human reads to decide. That is a model-generated numeral in a durable artifact with no
 * deterministic evaluator behind it — the pack's own `learned_payers` is explicitly
 * `{"not_implemented": true}` (0121:5781), so there was nothing to reproduce it from. Hard
 * constraint 2, in the same shape FOLD-1 closed one table over.
 *
 * THE DERIVATION IS DELIBERATELY THE DUMBEST ONE THAT IS TRUE: the number of lines in THIS pack
 * whose printed descriptive text contains the proposed identifier, matched case-insensitively as
 * an exact substring. It is not fuzzy matching and does not try to be — a human settles the
 * proposal, and what they need is a count they can check against the same statement.
 *
 * THERE IS NO FLOOR. Zero sightings is not "at least one", it is a proposal grounded in nothing
 * this run saw, and the caller REFUSES it — FOLD-4's rule one table over: propose only what you
 * actually read.
 */
export function countIdentifierSightings(pack: BankPackView, identifierValue: string): number {
  const needle = identifierValue.trim().toLowerCase();
  if (needle.length === 0) return 0;
  let seen = 0;
  for (const text of pack.lineText.values()) if (text.includes(needle)) seen += 1;
  return seen;
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
