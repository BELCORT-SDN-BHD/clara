// THE SHARED E2E MOCK-LANE DISPATCH PRIMITIVES (#722 fold).
//
// `serve-built.mjs` runs ONE Node HTTPS process for the whole browser suite, and every lane
// mock (`*-mock.mjs`) answers requests on that ONE shared server. A Node request stream can be
// read exactly once — `for await (const chunk of request)` drains it — so before this module
// existed, every lane that needed a POST body had reinvented the same read-and-parse loop, and
// FOUR DIFFERENT REMEDIES had accumulated for the one hazard that follows from that fact: a lane
// that reads the body and THEN decides the verb is not its own leaves every later lane in the
// chain reading an already-drained stream, which resolves to `{}` rather than an error — and
// `{}`'s every field is `undefined`, which satisfies a permissive guard's equality checks just
// well enough that the failure is silent. `bank-close-registers-mock.mjs` fixed its own instance
// with an exact-verb allow-list guarding the read; `journals-table-mock.mjs` and
// `journal-work-mock.mjs` each fixed theirs by caching the parsed body on the request under a
// hand-matched key; `serve-built.mjs` itself grew a one-off stream-replay hack for the one verb
// three lanes answer. Three lanes, three shapes, one underlying fact: the STREAM cannot be
// re-read, but a PARSED BODY can be re-served to as many callers as ask for it, in ANY order.
//
// `readCachedJson` is that one implementation, used by every lane mock and by `serve-built.mjs`
// itself. `matchVerb` is the allow-list-guard idiom bank-close-registers-mock.mjs pioneered,
// named so a NEW lane can reach for it directly rather than reinventing the same `Set.has(...)`
// check under a different name.

/**
 * Parse a POST body exactly once and cache the parsed value on the request object itself, so
 * every later caller — another lane's own `readCachedJson(request)`, in whatever order
 * `serve-built.mjs`'s dispatch chain happens to run them — reads back the SAME object rather
 * than an empty one from an already-drained stream. An unparsable or empty body resolves to
 * `{}`, never a thrown error: a lane mock's whole point is to answer or fall through, not to
 * 500 on a body a real PostgREST call would never send malformed.
 *
 * @param {AsyncIterable<Buffer> & { __e2eParsedBody?: unknown }} request
 * @returns {Promise<any>}
 */
export async function readCachedJson(request) {
  if (request.__e2eParsedBody !== undefined) return request.__e2eParsedBody;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  let parsed = {};
  if (chunks.length > 0) {
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      parsed = {};
    }
  }
  request.__e2eParsedBody = parsed;
  return parsed;
}

/**
 * Whether `verb` is one this lane's own RPC dispatch recognises. A THIN wrapper over
 * `Set.has`, and deliberately so: its value is not the one line it saves but the SHAPE it
 * names — call this BEFORE `readCachedJson`, so a verb this lane does not own returns `false`
 * without the stream ever being touched, leaving it fully intact for whichever hook in
 * `serve-built.mjs`'s chain runs next, in ANY order. `L7_RPC_VERBS` in
 * `bank-close-registers-mock.mjs` is the original instance of this guard, kept as a direct
 * `Set.has` there rather than migrated onto this helper — it already ran the guard before the
 * read, so nothing about the hazard this module exists to close was open in that file to begin
 * with, and rewriting proven, source-pinned code for a cosmetic rename was not this ticket's to
 * do (`e2e-fixture-ownership.test.ts`'s N7 cells read that file's own literal source).
 *
 * @param {ReadonlySet<string>} verbSet
 * @param {string} verb
 * @returns {boolean}
 */
export function matchVerb(verbSet, verb) {
  return verbSet.has(verb);
}
