// FS-4 C-5 — THE REDACTED STRIPE PROJECTION (裁-91, checkout-gate design part 2 §1.2).
//
// The raw event is verified, projected and DISCARDED. This module is the projector, and it is a
// PURE FUNCTION of the parsed event: no I/O, no clock, no environment. Everything that decides
// what reaches the database is visible in one file, and a cell can drive it without a rig.
//
// AN ALLOW-LIST, NOT A DENY-LIST, AND THAT DISTINCTION IS THE WALL. Design part 2 §1.2 states
// it plainly: "the containment is that the projector COPIES NAMED FIELDS rather than deleting
// unwanted ones — the difference between an allow-list and a deny-list, and why a new Stripe
// field cannot arrive here by default." `ck_stripe_events_no_pii` (0160:181) refuses five named
// keys at the projection's TOP LEVEL; it is the mistake-net that catches this file being edited
// wrongly later, not the containment. A deny-list would let the next Stripe API version ship a
// `customer_tax_ids` — or a `customer_details` nested one level down, where the CHECK cannot
// cheaply look — straight into an append-only table with no erasure door.
//
// THE NESTED-PII STRIP WALL (裁-91's containment half, named in the 09-01-pm ledger as C-5's
// obligation). An allow-list of KEYS is not sufficient on its own, because a Stripe field that
// is a scalar today can become an object tomorrow: `session.customer` is a string id normally
// and an EXPANDED Customer OBJECT — name, email, address, phone — the moment anyone adds
// `expand: ['customer']` to the Session create call, or Stripe changes a default. So every
// copied value additionally passes `scalarOrNull`: a string, a finite number, a boolean or
// null survives; an object or an array is DROPPED to null and named in the `dropped` list the
// route logs. The wall is structural — an object cannot reach `projection` through this
// function whatever the key is called — rather than a list of nested keys somebody has to keep
// current.
//
// AN UNRECOGNISED EVENT TYPE IS RECORDED, NOT DROPPED, AND NOT REJECTED. Design part 3 §1:
// "Every other type is still RECORDED — the store is the record — and applied by nothing."
// The work order's "an unrecognised event is answered with a non-2xx" is reconciled the only
// way both sentences can both be true: an event whose TYPE has no cell here is projected to its
// ENVELOPE ONLY (`created`, `api_version`, `livemode` — nothing at all from `data.object`, and
// no `type`, which is its own NOT NULL column rather than a jsonb duplicate) and recorded, and
// the route logs it loudly by id and type so it is visible.
// "Rejected" is reserved for an event that is NOT recorded — a bad signature, a livemode
// disagreement, a malformed envelope, a door failure — and every one of those answers non-2xx
// so Stripe retries. Nothing is ever 200-and-dropped. The PR body states this reconciliation.
//
// THE APPLIER READS COLUMNS, SO THE PROJECTION MUST CARRY THEIR SOURCE KEYS. `record_stripe_event`
// (0160:276) writes `clara.stripe_events` by reading `p_projection->>'livemode'`,
// `->>'session_id'`, `->>'intent_id'`, `->>'registration_id'`, `->>'applicant'`,
// `->>'amount_total'`, `->>'currency'`, `->>'payment_status'`, `->>'mode'`,
// `->>'session_status'`, `->>'customer_id'` and `->>'subscription_id'`. Those twelve names are
// this module's output contract, not a convenience — `PROJECTION_COLUMN_KEYS` below is the
// single list, and the db battery asserts it against the live table's own column set so a
// future column rename cannot silently leave a reconciliation key NULL.

/** The metadata keys the checkout route writes onto the Session (design part 3 §2). */
export const METADATA_KEYS = Object.freeze({
  registration: "clara_registration_id",
  applicant: "clara_applicant",
  intent: "clara_intent_id",
});

/** The one event type the applier acts on at beta (design part 3 §1). */
export const APPLIED_EVENT_TYPE = "checkout.session.completed";

/** The projection keys `record_stripe_event` reads into typed columns. Named here so the db
 *  battery can compare them with the live `clara.stripe_events` column set rather than trust
 *  this comment. */
export const PROJECTION_COLUMN_KEYS = Object.freeze([
  "livemode",
  "session_id",
  "intent_id",
  "registration_id",
  "applicant",
  "amount_total",
  "currency",
  "payment_status",
  "mode",
  "session_status",
  "customer_id",
  "subscription_id",
]);

/** The five keys `ck_stripe_events_no_pii` refuses. Kept here so a cell can prove the projector
 *  never emits one WITHOUT relying on the CHECK to catch it — the mistake-net is not the wall. */
export const DENIED_PROJECTION_KEYS = Object.freeze([
  "customer_details",
  "customer_email",
  "billing_details",
  "shipping_details",
  "payment_method_details",
]);

/** A typed refusal for an envelope this projector will not accept. The route answers non-2xx. */
export class StripeProjectionError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "StripeProjectionError";
    this.code = code;
  }
}

/**
 * THE NESTED-PII STRIP WALL. Returns the value when it is a scalar Stripe could legitimately
 * put in a typed column, and `null` otherwise — an object, an array, a function, a symbol, a
 * NaN or an Infinity all become null and are reported to the caller as dropped.
 *
 * `undefined` is not "dropped" in the interesting sense (the field was simply absent), so it
 * returns null WITHOUT being named — otherwise every optional field on every event would be
 * logged as a strip, and a log line that fires on every request tells a reader nothing.
 */
function scalarOrNull(value, key, dropped) {
  if (value === undefined || value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "boolean") return value;
  if (t === "number") return Number.isFinite(value) ? value : (dropped.push(key), null);
  dropped.push(key);
  return null;
}

/** `record_stripe_event`'s own uuid guard, copied from the door (0160:301-318) so this module
 *  refuses exactly what the door would refuse rather than something nearby. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** `ck_stripe_events_status_shape`'s own bound, copied from the TABLE (0160:178-182). The three
 *  fields it covers are the only CHECK-bounded columns in `clara.stripe_events` whose values come
 *  from `data.object`; `c5sclr.4` reads `pg_constraint` and fails if that stops being true. */
export const STATUS_MAX_LENGTH = 64;
/** The constraint's own character class: printable ASCII, `^[ -~]*$`. */
const PRINTABLE_ASCII_RE = /^[ -~]*$/;
/** The three columns `ck_stripe_events_status_shape` bounds, by their PROJECTION key. */
export const BOUNDED_STATUS_KEYS = Object.freeze(["payment_status", "mode", "session_status"]);

/** The key under which a malformed metadata field is NAMED in the stored projection. Not a
 *  denied key, and it can carry no personal data: its values come from `METADATA_KEYS`, a fixed
 *  three-name set of OUR OWN keys, never from the event's key names or values. */
export const MALFORMED_METADATA_KEY = "metadata_malformed";

/** Read `object.metadata[key]` as a scalar. Metadata values are always strings in Stripe; a
 *  non-string is dropped by the same wall rather than coerced. */
function metadataValue(object, key, dropped) {
  const md = object?.metadata;
  if (md === null || md === undefined) return null;
  if (typeof md !== "object" || Array.isArray(md)) {
    dropped.push("metadata");
    return null;
  }
  const v = scalarOrNull(md[key], `metadata.${key}`, dropped);
  return typeof v === "string" ? v : v === null ? null : String(v);
}

/**
 * A metadata field the door will cast to `uuid`. PRESENT-BUT-MALFORMED becomes NULL and is
 * NAMED; absent stays absent.
 *
 * WHY NULL AND NOT A THROW — the #511 review's M-1, and the shape matters more than the fix.
 * `record_stripe_event` raises `CLR10 projection <field> is not a valid uuid` on a bad cast, and
 * the route's `default: 500` turned that into a PERMANENT 500: no `stripe_events` row, no
 * `stripe_event_problems` row, and Stripe re-delivering for days against something that reads
 * like an outage. "The store is the record" failed for exactly the events that are malformed.
 *
 * Throwing a 400 here would store nothing — and, corrected at r2 (NEW-2), would not even stop
 * the retries: Stripe's current documentation recommends a 400 *precisely so that it retries*
 * ("We recommend returning a 400 status to let Stripe automatically retry the event"), and its
 * delivery schedule draws no 4xx/5xx distinction. So throwing would have been strictly worse
 * than nulling — a multi-day retry loop AND nothing stored. Nulling is the only shape that
 * terminates at all: it stores the event AND produces a problem row, through machinery that
 * already exists. With these three
 * fields NULL, `apply_stripe_events` files `metadata_missing` with a detail naming which fields
 * were absent (0160:400-410), and `list_stripe_event_problems` shows it to an operator. That is
 * the design's "recorded as a problem" outcome reached with no DB change and no new grant — and
 * a problem row is not otherwise reachable from this lane at all: `stripe_event_problems.event_id`
 * is `not null references clara.stripe_events(event_id)`, so no problem row can exist for an
 * event the door refused, and `clara_stripe_webhook` holds zero relation privileges besides.
 *
 * The lost information is the malformed VALUE, and it is not lost silently: the field name lands
 * in `metadata_malformed` inside the stored projection, and the route logs it. The value itself
 * is Stripe's to keep — the raw event is answerable by `event_id` in their dashboard, which is
 * the same division of labour 裁-91 already relies on.
 */
/**
 * A field the TABLE bounds. Over-long or non-printable-ASCII becomes NULL and is NAMED; a value
 * inside the bound passes through untouched.
 *
 * THE SAME CLASS AS THE MALFORMED UUID, ON A DIFFERENT REFUSER (the r2 review's NEW-1). The uuid
 * arms are raised by the FUNCTION and surface as CLR10; these three are raised by
 * `ck_stripe_events_status_shape` on the TABLE and surface as SQLSTATE 23514 — and the first cut
 * of the fold pre-empted only the function's arms, so a 65-character or non-ASCII
 * `payment_status` still produced the exact shape M-1 named: a deterministic 500, no event row,
 * no problem row, Stripe re-delivering. Measured by the reviewer through the shipped router,
 * three separate trips.
 *
 * NOT REACHABLE FROM TODAY'S STRIPE API, and that is stated rather than relied on: `mode` is one
 * of {payment, setup, subscription}, `status` one of {open, complete, expired}, `payment_status`
 * one of {paid, unpaid, no_payment_required} — all short ASCII. It goes live the day Stripe
 * lengthens an enum or a localised string reaches one of the three. A wall that costs four lines
 * is not worth deferring to that day.
 *
 * NULL, NOT TRUNCATED. Truncating would store a value Stripe never sent, on a money surface, and
 * `clara.stripe_events` is append-only — there is no correcting it later. Nulling is honest and
 * it keeps the event recordable rather than refused.
 *
 * WHAT A NULLED `payment_status` ACTUALLY DOES, CORRECTED (the r3 review's r3-1; an earlier
 * version of this paragraph said it makes the applier file `payment_not_settled`, and that was
 * WRONG). `apply_stripe_events`'s settlement test is
 * `payment_status='paid' OR (mode='subscription' AND session_status='complete')`, so with
 * `payment_status` NULL and the other two at their ordinary values the SECOND disjunct carries
 * it and the gate PASSES. Measured on a rig by reading which gate stopped each event (the applier
 * files the first problem it reaches, so the problem NAME identifies the gate):
 *
 *   payment_status NULLED, mode+status normal      -> PASSED settlement
 *   payment_status='no_payment_required' (legal)   -> PASSED settlement  <- the identical gate
 *   payment_status NULLED + mode='payment'         -> payment_not_settled
 *   payment_status NULLED + session_status NULLED  -> payment_not_settled
 *
 * So a nulled `payment_status` and a legal `no_payment_required` are behaviourally the same
 * event, and `payment_not_settled` is filed only when the RM0 relaxation is ALSO unavailable. At
 * RM0 the nulling therefore opens no new path — which makes the old sentence a wrong CLAIM rather
 * than a wrong WALL. What still holds, and is the real reason for NULL over truncation, is that
 * the event is stored, the field is named in `metadata_malformed`, and the route logs it.
 *
 * THE FORWARD HAZARD, RECORDED HERE BECAUSE IT HAS A DATE. That second disjunct is 0160's own
 * 裁-58/裁-28 tripwire — an RM0-ONLY relaxation whose comment says it MUST tighten to proof of
 * settled payment when amounts are ruled. On that day `payment_status` becomes load-bearing, and
 * **a NULLED `payment_status` must be treated as NOT SETTLED**, or a garbage status on a
 * real-money session sails straight through the tightened gate. `c5sclr.5` is a drift guard that
 * reds the moment the relaxation is tightened and says exactly this in its failure message, so
 * the lane doing the tightening cannot miss it.
 */
function scalarBounded(value, key, dropped, malformed) {
  const v = scalarOrNull(value, key, dropped);
  if (v === null) return null;
  const s = String(v);
  if (s.length <= STATUS_MAX_LENGTH && PRINTABLE_ASCII_RE.test(s)) return v;
  malformed.push(key);
  return null;
}

function metadataUuid(object, key, dropped, malformed) {
  const raw = metadataValue(object, key, dropped);
  if (raw === null) return null;
  if (UUID_RE.test(raw)) return raw;
  malformed.push(key);
  return null;
}

/**
 * The envelope every projection carries, whatever the type. Nothing here comes from
 * `data.object`.
 *
 * `livemode` is REQUIRED and typed: `clara.stripe_events.livemode` is `boolean not null`, so a
 * projection without it makes `record_stripe_event`'s insert fail with a bare NOT NULL
 * violation rather than a named refusal. Fail here, named, before the door.
 */
function envelope(event, dropped) {
  if (typeof event?.livemode !== "boolean") {
    throw new StripeProjectionError("livemode_absent", "the event carries no boolean livemode");
  }
  // NO `type` KEY, FOR TWO REASONS THAT AGREE. (1) It would be a DUPLICATE: the event type is
  // its own `not null` column, written from `record_stripe_event`'s `p_type` argument, and the
  // door never reads `projection->>'type'`. A second copy inside the jsonb is a value that can
  // disagree with the column. (2) `scripts/check-parts-parity.mjs` refuses an object literal
  // carrying a `type:` whose initializer is not a string literal, because that is the shape of a
  // typed `parts[]` member and its census cannot tell one from a Stripe envelope. The gate is
  // fail-closed and it is right to be; the duplicate had to go anyway.
  return {
    created: scalarOrNull(event.created, "created", dropped),
    api_version: scalarOrNull(event.api_version, "api_version", dropped),
    livemode: event.livemode,
  };
}

/** The `checkout.session.completed` cell — the ONLY type whose `data.object` is read. */
function projectCheckoutSession(event, dropped, malformed) {
  const object = event?.data?.object;
  if (object === null || typeof object !== "object" || Array.isArray(object)) {
    throw new StripeProjectionError("object_absent", `${APPLIED_EVENT_TYPE} carries no data.object`);
  }
  // BUILT BY ASSIGNMENT, NOT BY SPREAD, AND THAT IS A GATE OBLIGATION RATHER THAN A STYLE
  // CHOICE. `packages/runtime/scripts/check-parts-parity.mjs:302` refuses ANY object spread
  // anywhere under `packages/runtime` outside `tests/` — the census cannot tell whether
  // `{ ...x, type: "…" }` constructs a typed `parts[]` member, so it fails closed. Writing the
  // fields out one per line is also the honest shape for an ALLOW-LIST: every key that reaches
  // the database is on its own line in this function, and nothing arrives by inheritance.
  const projection = envelope(event, dropped);
  projection.session_id = scalarOrNull(object.id, "id", dropped);
  // The three `ck_stripe_events_status_shape` bounds — nulled and named rather than passed on to
  // a CHECK violation the route cannot turn into a stored row (NEW-1). The key each is NAMED
  // under is its PROJECTION key, so `metadata_malformed` reads the same as the column that would
  // have refused it.
  projection.mode = scalarBounded(object.mode, "mode", dropped, malformed);
  projection.session_status = scalarBounded(object.status, "session_status", dropped, malformed);
  projection.payment_status = scalarBounded(object.payment_status, "payment_status", dropped, malformed);
  projection.amount_total = scalarOrNull(object.amount_total, "amount_total", dropped);
  projection.currency = scalarOrNull(object.currency, "currency", dropped);
  // `customer` and `subscription` are id STRINGS on an unexpanded Session and full OBJECTS on
  // an expanded one. The strip wall turns an expansion into a null + a named drop rather than
  // letting a Customer's name, email, address and phone ride into an append-only table.
  projection.customer_id = scalarOrNull(object.customer, "customer", dropped);
  projection.subscription_id = scalarOrNull(object.subscription, "subscription", dropped);
  // The three the door casts to `uuid`. A present-but-malformed value becomes NULL and is named
  // — see `metadataUuid` for why that, and not a throw.
  projection.registration_id = metadataUuid(object, METADATA_KEYS.registration, dropped, malformed);
  projection.applicant = metadataUuid(object, METADATA_KEYS.applicant, dropped, malformed);
  projection.intent_id = metadataUuid(object, METADATA_KEYS.intent, dropped, malformed);
  if (malformed.length > 0) projection[MALFORMED_METADATA_KEY] = [...malformed];
  return projection;
}

/**
 * Project a verified Stripe event into the redacted shape `record_stripe_event` accepts.
 *
 * @param {Record<string, unknown>} event the parsed event — already signature-verified
 * @returns {{eventId: string, eventType: string, projection: Record<string, unknown>,
 *            recognised: boolean, dropped: string[], malformed: string[]}}
 */
export function projectStripeEvent(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    throw new StripeProjectionError("event_not_object", "the payload is not a JSON object");
  }
  const eventId = typeof event.id === "string" ? event.id.trim() : "";
  const eventType = typeof event.type === "string" ? event.type.trim() : "";
  // `ck_stripe_events_event_id_shape` (0160:176) pins `^evt_[A-Za-z0-9_]+$`, ≤255. Refusing here
  // turns a malformed id into a named 400 instead of a CHECK violation surfacing as a 500.
  if (!/^evt_[A-Za-z0-9_]+$/.test(eventId) || eventId.length > 255) {
    throw new StripeProjectionError("event_id_shape", "the event id is not a well-formed evt_ id");
  }
  if (eventType === "" || eventType.length > 255) {
    throw new StripeProjectionError("event_type_absent", "the event carries no usable type");
  }

  const dropped = [];
  const malformed = [];
  const recognised = eventType === APPLIED_EVENT_TYPE;
  const projection = recognised ? projectCheckoutSession(event, dropped, malformed) : envelope(event, dropped);

  // THE MISTAKE-NET, RUN HERE TOO, AND ON PURPOSE. The allow-list above already makes a denied
  // key unreachable — there is no code path that writes one. This re-reads the produced object
  // anyway, because an allow-list is only a wall while every cell in it stays an allow-list, and
  // the cheapest moment to catch an edit that reached for `...object` is before the row exists.
  // It is belt to the CHECK's braces, not a substitute for either.
  for (const denied of DENIED_PROJECTION_KEYS) {
    if (Object.hasOwn(projection, denied)) {
      throw new StripeProjectionError("projection_carries_denied_key", `the projection carries ${denied}`);
    }
  }
  // `eventType`, not `type`. The parts-parity census refuses any object literal carrying a
  // `type` key it cannot resolve to a string literal — including a SHORTHAND one, which is what
  // this used to be — because `{ type: "<kind>", … }` is the shape of a typed `parts[]` member.
  // Renaming the field costs one word and keeps a fail-closed gate meaningful instead of
  // teaching it an exemption for a value that is not a part kind at all.
  return { eventId, eventType, projection, recognised, dropped, malformed };
}
