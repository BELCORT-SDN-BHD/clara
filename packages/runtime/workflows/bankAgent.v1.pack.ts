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
  /** 裁-44 R4 / FOLD-20 — THE MODEL STEP THIS PACK WAS RETURNED IN, stamped when it is armed.
   *
   *  IT LIVES HERE RATHER THAN ON THE RECORD, and that placement is the fix rather than a
   *  preference. FOLD-16 clears `rec.pack` and `rec.digest` before every re-read; a separate
   *  `rec.packEpoch` field would have to be cleared in lockstep, and the first edit that forgot
   *  would leave a stale epoch vouching for a pack that is no longer there. On the view, "cleared"
   *  and "stale" are one fact: no pack, no epoch.
   *
   *  WHAT IT BUYS. The provider runs sibling tool calls in ONE step concurrently (OpenAI defaults
   *  parallelToolCalls to true). Even with local serialisation, a write that ran after a same-step
   *  read would derive its amounts from a pack THE MODEL HAS NEVER SEEN — returned to the provider
   *  after the model had already chosen the write's arguments. That is grounding in evidence
   *  nobody read: FOLD-4's defect across TIME rather than across accounts. So a write may only use
   *  a pack from a STRICTLY EARLIER step. */
  epoch: number;
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
  /** 裁-44 R4 / FOLD-20 — THE MODEL STEP THIS RUN IS CURRENTLY IN. Advanced by the step loop, never
   *  by a tool. It is the clock the evidence epoch below is measured against. */
  step: number;
  /** 裁-44 R4 / FOLD-21 — EVERY tool call this attempt made, admitted or not, read or write. ONE
   *  named counter rather than a sum recomputed at the call site: the question "has anything
   *  happened yet?" must have one answer, and a sum drifts the moment a counter is added. */
  toolCalls: number;
  /** 裁-44 R4 / FOLD-21 — a stream/network failure that landed AFTER tool activity. The attempt
   *  settles this itself rather than rethrowing into a clean retry whose record starts at zero. */
  streamFault: boolean;
};

/** Advance the model-step clock (裁-44 R4 / FOLD-20). Called by the step loop's own
 *  `onStepEnd`, and by a direct-drive cell between the read and the write it grounds — which is
 *  exactly what the loop does, made explicit. */
export function beginModelStep(rec: { step: number }): void {
  rec.step += 1;
}

/** Has this attempt done ANYTHING yet? 裁-44 R4 / FOLD-21 asks this to decide whether a stream
 *  failure may be rethrown into a retry (nothing happened) or must be settled by this attempt. */
export function hadToolActivity(rec: { toolCalls: number }): boolean {
  return rec.toolCalls > 0;
}

export function newBankRunRecord(attemptKey: string): BankRunRecord {
  return {
    pack: null, digest: null, admitted: 0, writeAttempts: 0, refusals: 0, packReads: 0,
    infraFaults: 0, attemptKey, cancelledAs: null, step: 0, toolCalls: 0, streamFault: false,
  };
}

/**
 * 裁-44 R5 / FOLD-23 — SERIALISATION IS A BOUNDARY, NOT A HABIT.
 *
 * FOLD-20(b) put a promise-chain mutex in this closure and then applied it AT EVERY CALL SITE. The
 * fifth review round found the cost of that shape on the sibling lane: ten of closePrep's twelve
 * tools went through it and two did not, so two write executors could overlap each other and the
 * queued reads, mutating one record concurrently. The bank lane's four call sites were all covered
 * — and were one new verb away from the same defect, because "remember to wrap it" is a
 * convention, and a convention is not a wall.
 *
 * SO THE MUTEX IS APPLIED ONCE, TO THE WHOLE MAP. The builder assembles its tools plainly and hands
 * them here; every `execute` in the returned map is the wrapped function, and an unwrapped tool is
 * not expressible — a new verb is serialised by existing. A tool with no `execute` throws rather
 * than passing through unguarded (absence is not evidence).
 *
 * NEVER WRAP TWICE. `serial` links each body onto the previous one's settlement, so a serialised
 * body that itself calls `serial` waits on a chain it is already the head of — a deadlock, not a
 * double lock. That is why the builders below pass their tools here PLAIN.
 */
export type ToolSerialiser = <T>(body: () => Promise<T>) => Promise<T>;

/** Every execute this factory produced. A WeakSet rather than a marker property, because the
 *  question a cell must be able to ask is "is this THE wrapped function?" — review law 3, spelling
 *  is not identity: a hand-written execute that merely mentions `serial` can satisfy a source grep
 *  and cannot satisfy this. */
const SERIALISED_EXECUTES = new WeakSet<object>();

export function isSerialisedExecute(fn: unknown): boolean {
  return typeof fn === "function" && SERIALISED_EXECUTES.has(fn as object);
}

export function serialiseTools<T extends Record<string, unknown>>(tools: T, serial: ToolSerialiser): T {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(tools)) {
    const inner = (spec as { execute?: unknown } | null)?.execute;
    if (typeof inner !== "function") {
      throw new Error(`tool ${name} has no execute to serialise — every tool in this closure runs one at a time, and a tool this boundary cannot wrap must not ship`);
    }
    const call = inner as (...args: unknown[]) => unknown;
    const wrapped = (...args: unknown[]): Promise<unknown> => serial(async () => call(...args));
    SERIALISED_EXECUTES.add(wrapped);
    out[name] = { ...(spec as Record<string, unknown>), execute: wrapped };
  }
  return out as T;
}

/** The chain itself, built per tool set (per run record) — one queue for reads and writes alike,
 *  because a read and a write interleaving is the same hazard as two reads. Each body links onto
 *  the previous one's SETTLEMENT, both branches: a rejection must not break the chain. */
export function newToolSerialiser(): ToolSerialiser {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(body: () => Promise<T>): Promise<T> => {
    const next = chain.then(body, body);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
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
/** A BigInt aggregate this process can carry back as an exact JS integer (裁-44 R3 / FOLD-18). */
export function isSafeBig(v: bigint): boolean {
  return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER);
}

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
export function readPackView(pack: unknown, epoch: number): BankPackParse {
  const p = pack as { digest?: unknown; lines?: unknown; candidates?: unknown } | null;
  if (p === null || typeof p !== "object") return packFail("pack_not_object", "the pack reply is not an object");
  // 裁-44 R3 / FOLD-16 — THE DIGEST IS A SHA-256, NOT "any non-empty string". The verb computes it
  // as encode(clara._hash(v_pack), 'hex') (0121:5785), so lowercase 64-hex is its ONLY lawful
  // shape. Accepting `{digest:"x", lines:[], candidates:[]}` made a one-character string
  // authoritative evidence — the same absence-as-evidence this parser exists to refuse, one field
  // over. Every write re-presents this value as p_inputs_digest, so a digest we cannot vouch for
  // is a write we cannot ground.
  if (typeof p.digest !== "string" || !/^[0-9a-f]{64}$/.test(p.digest)) {
    return packFail("digest_malformed", "the pack reply's digest is not the lowercase 64-hex sha-256 the verb computes");
  }
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
    // 裁-44 R3 / FOLD-16 — EXACTLY string OR null, and ABSENT is neither. The column is NULLABLE
    // (0038:546) so an explicit null is a real state of the books; but the verb ALWAYS emits the
    // key (jsonb_build_object('description', l.description), 0121:5719), so a reply with the key
    // MISSING is not this verb's reply. Treating undefined as lawful null let a truncated or
    // foreign payload arm the run with empty evidence — which is exactly what FOLD-11's sighting
    // count is derived from.
    if (l === null || typeof l !== "object" || !("description" in l)) {
      return packFail("line_description_absent", `line ${id} carries no description key at all — this is not the pack verb's own reply`);
    }
    const text = l.description;
    if (text !== null && typeof text !== "string") {
      return packFail("line_description_malformed", `line ${id}'s description is neither text nor null`);
    }
    lineCents.set(id, cents);
    // Stored RAW (whitespace intact): FOLD-15's matching tokenises on whitespace and canonicalises
    // each token, so it needs the printed boundaries the statement actually has.
    lineText.set(id, typeof text === "string" ? text : "");
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
  return { ok: true, view: { epoch, digest: p.digest, lineCents, lineText, entryCaps } };
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

const isUuid = (v: unknown): boolean => typeof v === "string" && UUID_RE.test(v.toLowerCase());

/**
 * 裁-44 R4 / FOLD-22(a) — THREE ANSWERS, NOT TWO, and the third is the finding.
 *
 * `admitted` and `refused` were the whole world; a reply that CLAIMED the success status but
 * carried no usable identity fell into `refused`, which blames the MODEL for a shape the DATABASE
 * is supposed to guarantee. Worse on the counting side: an id was accepted as "any string", so
 * `{status:'live', match_id:'ok'}` counted a durable act that names nothing an audit can follow.
 *
 * A PURPORTED SUCCESS THAT CANNOT BE VERIFIED IS OURS, NOT THE MODEL'S — `malformed` is an
 * INFRASTRUCTURE fault, which on this lane settles `internal` (FOLD-16). The identity checks are
 * the DB's own documented shapes: a match returns a uuid `match_id` (0121:1622), and a proposal
 * returns a uuid `proposal_id` PLUS the subject it was asked about (0121:5566, :5643) — so a reply
 * about a DIFFERENT line or counterparty than the one this call named is not this call's receipt.
 */
export type BankReplyVerdict = "admitted" | "refused" | "malformed";

export function classifyBankReply(verb: BankVerb, reply: unknown, subjectId?: string): BankReplyVerdict {
  const r = reply as { status?: unknown; match_id?: unknown; proposal_id?: unknown; line_id?: unknown; counterparty_id?: unknown } | null;
  if (r === null || typeof r !== "object") return "refused";
  if (verb === "match") {
    if (r.status !== "live") return "refused";
    return isUuid(r.match_id) ? "admitted" : "malformed";
  }
  if (r.status !== "open") return "refused";
  if (!isUuid(r.proposal_id)) return "malformed";
  // THE SUBJECT MUST BE THE ONE WE ASKED ABOUT. Absent from the reply, or naming something else,
  // and this receipt is not evidence for THIS act (review law 2).
  const subject = verb === "exception" ? r.line_id : r.counterparty_id;
  if (subjectId === undefined) return isUuid(subject) ? "admitted" : "malformed";
  return typeof subject === "string" && subject.toLowerCase() === subjectId.toLowerCase() ? "admitted" : "malformed";
}

/** Kept as the boolean the reply PROJECTION asks (裁-44 R3 / FOLD-18): only an admitted reply is
 *  narrowed to status + ids. A malformed one is replaced wholesale by the caller. */
export function isAdmittedBankReply(verb: BankVerb, reply: unknown, subjectId?: string): boolean {
  return classifyBankReply(verb, reply, subjectId) === "admitted";
}

export function countIfAdmitted(rec: BankRunRecord, verb: BankVerb, reply: unknown, subjectId?: string): BankReplyVerdict {
  const verdict = classifyBankReply(verb, reply, subjectId);
  if (verdict === "admitted") rec.admitted += 1;
  else if (verdict === "refused") rec.refusals += 1;
  else {
    // Not counted as a refusal: a refusal is the model's act being judged, and nothing here was.
    rec.infraFaults += 1;
    console.warn(`[bankAgent_v1] ${verb} reply claimed success but carries no verifiable identity`);
  }
  return verdict;
}
