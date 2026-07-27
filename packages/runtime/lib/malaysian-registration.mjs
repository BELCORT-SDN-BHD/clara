// @frozen
//
// The marker is deliberate and not merely descriptive: this module is already hash-locked by
// being inside interview_v2's import closure, and the marker makes that INDEPENDENT of the
// import edge — a later interview version that stopped importing it would otherwise leave a
// registered entry with nothing freezing it (the freeze-lint's ORPHANED case). A validator that
// a parked run will re-enter must not be able to change underneath it either way.
//
// The Malaysian business-registration GRAMMAR — one definition, shared by the invoice
// vendor-identity lane (via invoice-vendor-identity.mjs, which re-exports it) and the durable
// onboarding interview (interview.v2.core.ts, which imports it directly).
//
// WHY A SEPARATE LEAF MODULE, and this is load-bearing rather than tidiness. The order was to
// add the new export to `invoice-vendor-identity.mjs` alongside `looksLikeRegistration`. That
// module is imported by nobody frozen today: NO file under packages/runtime/lib is in
// frozen-workflows.json, and the freeze-lint hashes the whole transitive RELATIVE-import
// closure of every @frozen file. So a frozen interview_v2 importing invoice-vendor-identity
// directly would drag `invoice-vendor-identity.mjs` + `invoice-totals-reader.mjs` +
// `invoice-amount-grammar.mjs` into the frozen set — hash-locking the three modules the
// extraction slice is actively iterating (X5's two-reader corroboration is still to be built).
// Freezing another lane's live work surface is not a side effect worth paying for a shorter
// import path. A dependency-free leaf gives BOTH properties: the shared module gains the new
// export additively (it re-exports from here), and the frozen closure grows by exactly this
// one pure file — which is the RIGHT outcome for an interview validator, because a grammar
// that silently changes under a parked run is precisely the T6 hazard the freeze law exists
// to prevent (ARCHITECTURE Appendix A). A future SSM format ships as a new module version +
// a new interview version, which is the law working, not fighting.
//
// `looksLikeRegistration` in invoice-vendor-identity.mjs is NOT touched by a single byte: it
// is the invoice lane's adversarially-calibrated accept gate (deliberately permissive — it
// only ever decides whether a token is worth matching against an EXISTING registry row). This
// grammar is the opposite posture: a DATA-ENTRY gate, where a wrong shape becomes a firm's
// permanent identity, so it enumerates the forms it accepts and refuses everything else with
// the list. Two jobs, two gates, one file naming both.
//
// THE FORMS, as Malaysian documents actually print them:
//   (a) legacy numeric + check letter — `1050274-A`, `1475415-P`. The old ROC/ROB shape; a
//       sole proprietorship's ROB number reads the same way as an old company number, which
//       is exactly why the v1 validator's digits-first assumption looked sufficient and was
//       not (it accepted this one and refused (b) outright).
//   (b) STATE-PREFIXED business registration — `SA1234567-X`, `JM0123456-A`. Two letters for
//       the registering state, then digits, then the check letter. The v1 regex anchored on a
//       leading digit, so every ROB registration of this shape was refused at the question —
//       finding F1, and the reason a sole-prop client could not be onboarded at all.
//   (c) the unified 12-digit year-prefixed number (SSM 2019+) — `202401001234`, and the
//       check-suffixed print `202401001234-K`.
//   (d) the LLP/PLT registration — `LLP0012345-LGN`, `LLP0012345-LCA`, and its combined print
//       `201901000001 (LLP0012345-LGN)`. A FOURTH family, and the one that would have re-run
//       finding F1 in full: an LLP prints THREE leading letters and a THREE-letter suffix, so
//       none of (a)–(c) can reach it, and a PLT accounting practice — a common shape for the
//       firms this product serves, and for their clients — would have hit the same
//       re-ask-forever wall the state-prefixed form did. Caught in review before it shipped.
//       THE SUFFIX IS DELIBERATELY NOT ENUMERATED. `LGN` (general) and `LCA` (professional
//       practice) are the two I can state with confidence; SSM issues others, and a closed list
//       I am not certain of is precisely the mechanism that produced F1 — a validator refusing
//       a real registration because its author had not seen that variant. `LLP` + digits is
//       already unambiguous against every other family and against the SST/TIN shapes, so the
//       suffix is matched as a shape (2–4 letters) and, since some prints omit it entirely,
//       treated as optional rather than as a second thing to get wrong.
//   (e) the COMBINED print — `201501005365 (1130695-T)`, `202401047756 (1593602-X)`. Not in
//       the ruling's list of three, and included anyway because it is the form MEASURED TWICE
//       on real documents: the Gate-F receipt records the owner's own certificate printing
//       `201501005365 (1130695-T)` (noted there as "the combined print is not a validator
//       shape — finding F1's boundary"), and the X6 diagnosis found `Company No. 202401047756
//       (1593602-X)` in a live letterhead. Refusing a form the product has already seen twice
//       on paper would be shipping the same bug with a longer regex.
//
// WHAT THIS MODULE CAN AND CANNOT ATTEST, stated here because the recorded field name depends on
// it. It checks FORM ONLY. It cannot tell you that a well-formed number belongs to the entity
// being onboarded: a value forged from two unrelated valid halves — `202401047756 (1130695-T)`,
// each half individually real — is indistinguishable from a genuine combined print, and so is any
// single valid number that happens to be someone else's. Attesting IDENTITY requires an SSM
// lookup, which is a future integration and not a regex. That is why the recorded flag is
// `format_verified` and never `verified`: the durable record must not claim, to a practitioner
// reading it months later, an assurance nobody performed.
//
// NORMALIZATION is the counterparty registry's own key (0009: strip every non-alphanumeric,
// lowercase) — identical to `registrationKey` in invoice-vendor-identity.mjs, and pinned to it
// by a test rather than by hope. That rule is what makes the combined print (d) useful rather
// than awkward: `202401047756 (1593602-X)` normalizes to `2024010477561593602x`, which is
// byte-for-byte what X6 measured the registry storing for that vendor. Normalizing (d) down to
// its 12-digit half would LOSE that match, so the value is recorded verbatim and the key is
// derived — never the other way round.

/** The registry's registration key: strip separators, lowercase (0009:359-360). Same rule as
 *  `registrationKey` in invoice-vendor-identity.mjs — bound to it by test, never re-derived. */
export const normalizeRegistration = (s) => String(s ?? "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();

/** Upper bound on a registration token. Longer than every real form (the combined print, the
 *  longest, is 26 characters) and short enough that a pasted address/sentence cannot pass. */
const MAX_LENGTH = 40;

// Every pattern is tested against the COMPACT form (uppercased, all whitespace removed), so a
// document typed `202401001234 - K` or `SA 1234567-X` is the same registration as the tight
// print. Separators inside are tolerated on input and preserved in the recorded verbatim.
// THE UNIFIED NUMBER IS YEAR-PREFIXED, AND THAT IS STRUCTURE, NOT DECORATION. `^\d{12}$` alone
// accepted `601112345678` — a mobile number — and `999999999999`, recording either as a
// format-checked registration. The first four digits are the year of registration, so they must
// read like a year: 19xx or 20xx. This is a STRUCTURAL constraint on a documented field, not an
// enumeration of values (contrast the LLP suffix, deliberately left open), so it cannot refuse a
// real registration unless SSM begins issuing numbers in the 2100s — at which point it is a
// one-character edit in a NEW module version.
const YEAR_PREFIX = "(?:19|20)";
const LEGACY_NUMERIC = /^\d{4,10}-?[A-Z]{1,2}$/; // (a) 1050274-A · 1475415-P
const STATE_PREFIXED = /^[A-Z]{2}\d{4,10}-?[A-Z]{1,2}$/; // (b) SA1234567-X · JM0123456-A
const UNIFIED_12 = new RegExp(`^${YEAR_PREFIX}\\d{10}$`); // (c) 202401001234
const UNIFIED_12_CHECK = new RegExp(`^${YEAR_PREFIX}\\d{10}-?[A-Z]{1,2}$`); // (c) 202401001234-K
const LLP_REGISTRATION = /^LLP\d{4,10}(?:-?[A-Z]{2,4})?$/; // (d) LLP0012345-LGN · LLP0012345-LCA
const COMBINED = new RegExp(`^(${YEAR_PREFIX}\\d{10})[([]([A-Z0-9-]{4,20})[)\\]]$`); // (e) 202401047756(1593602-X)

/** The forms a bracketed COMBINED print may carry inside its brackets: the pre-2019 identifier
 *  of any family. An LLP's combined print carries an LLP number, not a legacy numeric one, so
 *  the inner test is a list rather than one pattern — omitting the LLP entry here is how the
 *  combined LLP print would still have been refused after the bare form was fixed. */
const COMBINED_INNER = [LEGACY_NUMERIC, STATE_PREFIXED, LLP_REGISTRATION];

/** The recognised forms — data, so a new SSM format is a table edit in a NEW module version,
 *  never a rewrite of the classifier. This table also FEEDS THE QUESTION TEXT and every refusal
 *  reason, so a family added here is a family the person is told about. */
export const BUSINESS_REGISTRATION_FORMS = Object.freeze([
  Object.freeze({ form: "combined_unified_and_legacy", example: "202401047756 (1593602-X)", describe: "the unified number with the earlier number in brackets" }),
  Object.freeze({ form: "unified_12", example: "202401001234", describe: "the unified 12-digit registration number" }),
  Object.freeze({ form: "unified_12_check", example: "202401001234-K", describe: "the unified 12-digit number with a check letter" }),
  Object.freeze({ form: "llp_registration", example: "LLP0012345-LGN", describe: "an LLP/PLT registration" }),
  Object.freeze({ form: "state_prefixed_business", example: "SA1234567-X", describe: "a state-prefixed business (ROB) registration" }),
  Object.freeze({ form: "legacy_numeric", example: "1475415-P", describe: "a legacy ROB/ROC number with a check letter" }),
]);

/** An example of one named form. Looked up BY NAME, never by index: the empty-input message used
 *  positional indexes into the table above, which silently pointed at different families the
 *  moment a row was inserted. */
const exampleOf = (form) => BUSINESS_REGISTRATION_FORMS.find((f) => f.form === form)?.example ?? "";

/** The human list of accepted shapes — the refusal reason and the question text share it, so a
 *  person told "that is not a registration" is always also told what one looks like here. */
export function describeBusinessRegistrationForms() {
  return BUSINESS_REGISTRATION_FORMS.map((f) => `${f.example} (${f.describe})`).join(", ");
}

/**
 * Classify a typed registration.
 *
 * @param {unknown} raw
 * @returns {{ok:true, form:string, value:string, normalized:string}
 *          | {ok:false, reason:string}}
 *
 * `value` is the VERBATIM submission (trimmed, internal whitespace collapsed, uppercased — the
 * v1 validator's own casing discipline), never a canonicalised rewrite: the registry key is
 * derived from it, so nothing is lost by keeping what the certificate actually prints.
 */
export function classifyBusinessRegistration(raw) {
  const verbatim = String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!verbatim) {
    return { ok: false, reason: `A registration number is required (e.g. ${exampleOf("unified_12")} or ${exampleOf("state_prefixed_business")}).` };
  }
  if (verbatim.length > MAX_LENGTH) {
    return { ok: false, reason: `That is too long to be a registration number (max ${MAX_LENGTH} characters). Accepted forms: ${describeBusinessRegistrationForms()}.` };
  }
  const compact = verbatim.replace(/\s+/g, "");
  const combined = COMBINED.exec(compact);
  if (combined && COMBINED_INNER.some((re) => re.test(combined[2]))) {
    return ok("combined_unified_and_legacy", verbatim);
  }
  if (UNIFIED_12.test(compact)) return ok("unified_12", verbatim);
  if (UNIFIED_12_CHECK.test(compact)) return ok("unified_12_check", verbatim);
  if (LLP_REGISTRATION.test(compact)) return ok("llp_registration", verbatim);
  if (STATE_PREFIXED.test(compact)) return ok("state_prefixed_business", verbatim);
  if (LEGACY_NUMERIC.test(compact)) return ok("legacy_numeric", verbatim);
  return {
    ok: false,
    reason: `“${verbatim}” is not a Malaysian business registration number. Accepted forms: ${describeBusinessRegistrationForms()}.`,
  };
}

function ok(form, verbatim) {
  return { ok: true, form, value: verbatim, normalized: normalizeRegistration(verbatim) };
}

/**
 * True iff `s` is a registration in one of the recognised Malaysian business/company forms.
 * The boolean face of `classifyBusinessRegistration` — the NEW export the shared
 * vendor-identity module re-exports alongside `looksLikeRegistration` (which is a different,
 * deliberately looser gate for a different job; see this file's header).
 */
export function looksLikeBusinessRegistration(s) {
  return classifyBusinessRegistration(s).ok === true;
}
