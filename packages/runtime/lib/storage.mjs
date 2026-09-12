import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";

/**
 * A typed Storage failure.
 *
 * `reason` (#620) IS THE FOURTH FIELD AND IT IS OPTIONAL BY DESIGN. `code` says which FAMILY of
 * failure this is (`storage_error` vs `checksum_mismatch`) and `status` says what HTTP answer it
 * deserves; neither can tell an operator — or a reader's UI — whether the object is MISSING, the
 * CREDENTIAL was refused, the service is DOWN, or the runtime was never configured. Those four
 * outcomes want four different human answers ("re-upload", "rotate the JWT", "retry", "fix the
 * deployment") and a bare 502 gives them one. Every existing construction site that does not pass
 * a reason keeps its exact previous shape — `reason` is simply `null` there — so nothing that
 * reads `code`/`status`/`message` today changes behaviour.
 */
export class StorageError extends Error {
  constructor(code, message, status = 502, reason = null) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

function safeKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/docs\/[0-9a-f]{64}\.[a-z0-9]{1,12}$/i.test(value)) {
    // NOT one of the four GET-side reasons below: this refusal happens BEFORE any request, and it
    // means the key the caller handed in is not a canonical docs address at all — a row whose
    // storage_path drifted, never a Storage outcome.
    throw new StorageError("storage_error", "canonical storage key is invalid", 502, "invalid_key");
  }
  return value;
}

function testRoot() {
  return process.env.CLARA_TEST_STORAGE_DIR || join(process.env.CLARA_SPOOL_DIR || ".", "test-storage");
}

function localPath(key) {
  return join(testRoot(), ...safeKey(key).split("/"));
}

/**
 * WHAT A LOCAL OPEN FAILURE MEANS (#630, fifth review round, finding [3]).
 *
 * The eager-open cure below used to swallow `err` and report every failure as "(object absent)".
 * A permission failure, a directory standing where the object should be, or fd exhaustion then
 * read to an operator as MISSING BYTES — and since `storage_error` is in local-facts.mjs's
 * RETRYABLE set (:48), the lane logs `retryable=true ... (object absent)` and re-drives a task
 * whose object is in fact present and unreadable. `localObjectExists` in this same file already
 * keeps ENOENT and everything else apart (:191-199); this is the same discipline for the readers.
 *
 * THE TYPE DOES NOT CHANGE, only the diagnosis. Every arm stays `storage_error`: the retry is
 * bounded (the task stays `running` until requeueStranded's window and the DB attempt cap), and
 * moving EACCES out of the retryable set would be a behaviour change this finding did not ask
 * for and no cell measures. What changes is that the message names the errno instead of
 * asserting something the process never checked.
 *
 * ENOTDIR joins ENOENT: a path component that is not a directory means the object is not there,
 * which is the same fact by a different route. Everything else names itself.
 */
export function localOpenFailure(err, what) {
  const code = err?.code;
  // #620 — THE REASON IS THE SAME VOCABULARY THE DEPLOYED PATH USES, and it has to be, because
  // every storage-touching local test runs through here while production runs through
  // `classifyGetFailure`. If the local arm answered a different word for "the object is not
  // there", the route battery would be measuring a classification production never emits. The
  // MESSAGES are byte-identical to what this function has always returned.
  if (code === "ENOENT" || code === "ENOTDIR") {
    return new StorageError("storage_error", `${what} storage read failed (object absent)`,
      502, "object_missing");
  }
  return new StorageError("storage_error",
    `${what} storage read failed (${code || "open failed, no errno"})`,
    502, code === "EACCES" || code === "EPERM" ? "credential_refused" : "unavailable");
}

/**
 * Open a RELAY_TEST_MODE object EAGERLY and hand back a stream that is already attached to the
 * open file handle.
 *
 * A BARE `createReadStream(path)` IS A LOADED GUN IN A CRASH-ONLY PROCESS (#630). It is lazy: the
 * `open()` runs on a later libuv turn and its failure arrives as an `'error'` EVENT, not as a
 * rejected promise. Every reader below has at least one `await` between creating that stream and
 * the `pipeline()` that would listen to it (`downloadCanonical`'s destination `mkdir` is the
 * measured one), so on a missing object the event fired into an EMPTY listener set, Node re-raised
 * it as an uncaughtException, and `scripts/serve.mjs`'s fatal handler took the whole supervisor
 * down at startup. One absent file under `packages/runtime/test-storage` — the ordinary state of a
 * rebuilt rig whose database still holds `clara.documents` rows — was enough.
 *
 * Opening first also makes the LOCAL failure the SAME failure the deployed one is: a typed,
 * retryable `storage_error`, not a bare ENOENT a route's error mapper reads as an unrecognised
 * internal fault — the reasoning `artifactResponseFor` below records for the artifact family.
 *
 * ALL FOUR FAMILIES GO THROUGH HERE (#630 round-6 finding [4]). An earlier draft of this header
 * said the artifact family "already took this cure"; it had only adopted the CLASSIFIER, and still
 * returned a lazy `createReadStream` after its stat. Sharing a classifier is not sharing an eager
 * open, and the difference is a second, unprotected `open()`. Do not re-introduce one.
 */
async function openLocalStream(path, what) {
  let fh;
  try {
    fh = await open(path, "r");
  } catch (err) {
    throw localOpenFailure(err, what);
  }
  // `FileHandle.createReadStream` owns the handle and closes it on end/error/destroy, and the fd
  // is already open — so there is no second `open()` left to fail asynchronously.
  return fh.createReadStream();
}

function decodeJwtClaims(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function realConfig() {
  const base = process.env.CLARA_STORAGE_URL;
  const jwt = process.env.CLARA_STORAGE_ROLE_JWT;
  const designatedRole = process.env.CLARA_STORAGE_ROLE
    || (process.env.RELAY_TEST_MODE === "1" ? "clara_storage_docs" : "");
  // #620 — ALL FOUR OF THESE ARE `unconfigured`, and they keep their 503. They are not failures of
  // a request: no request was made. An operator reading `unavailable` would go looking at Supabase;
  // `unconfigured` sends them to the deployment's own environment, which is where the fault is.
  if (!base || !jwt || !designatedRole) {
    throw new StorageError("storage_error", "Storage custom-role configuration is missing", 503, "unconfigured");
  }
  if (["anon", "authenticated", "service_role"].includes(designatedRole)) {
    throw new StorageError("storage_error", "Storage designated role must be a dedicated custom role", 503, "unconfigured");
  }
  const claims = decodeJwtClaims(jwt);
  const exp = Number(claims?.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now() + 30_000) {
    throw new StorageError("storage_error", "Storage role credential is expired or malformed", 503, "unconfigured");
  }
  if (typeof claims?.role !== "string"
      || ["anon", "authenticated", "service_role"].includes(claims.role)
      || claims.role !== designatedRole) {
    throw new StorageError("storage_error", "Storage credential does not assume the designated custom-role", 503, "unconfigured");
  }
  return { base: base.replace(/\/+$/, ""), jwt };
}

/**
 * IS THIS FAILED UPLOAD THE PROVIDER SAYING "that object is already there"?
 *
 * ONE PREDICATE FOR FOUR WRITERS, because the answer is a property of the PROVIDER, not of a key
 * family. Supabase's storage-api puts its real status INSIDE the body: a duplicate arrives as
 * **HTTP 400** carrying `{"statusCode":"409","error":"Duplicate",…}`, so `response.status === 409`
 * is never true against the hosted service (found 2026-07-26 by re-uploading an already-ingested
 * document — the ordinary case — and the diagnosis cost a day; the captured envelope is in
 * packages/runtime/tests/intake-unit.test.mjs:285-325).
 *
 * FOR A CONTENT-ADDRESSED KEY A DUPLICATE IS IDEMPOTENT SUCCESS, never an error: the key IS the
 * sha256, so a second write puts the same bytes at the same address. That is what makes an
 * at-least-once writer safe, and it is why every one of the four families uploads with
 * `x-upsert:false` and then treats the refusal as "existed".
 *
 * WHY IT IS EXTRACTED (#620 review, F5). The docs, report and sandbox families each carried this
 * test inline and the WIKI family did not — it tested the transport status alone, so the hosted
 * wrapped-409 was a fatal `StorageError("wiki storage upload failed (400)")` and
 * wiki-projection.mjs's idempotent redrive (:434) died on the ordinary re-projection. Three copies
 * and one divergence is the shape a bug hides in; one helper cannot diverge. The predicate is the
 * three siblings' own, character for character, so their behaviour is unchanged — the vendor also
 * documents a symbolic `ResourceAlreadyExists` for 409, which this repository has never captured
 * and which is therefore NOT read here rather than guessed at.
 *
 * @param {number} status the transport status
 * @param {string} body   the response body, already read once (every caller needs it for the log)
 */
function isDuplicateUpload(status, body) {
  let inner = null;
  try { inner = JSON.parse(body ?? ""); } catch { /* not JSON — the transport status is all there is */ }
  return status === 409 || String(inner?.statusCode) === "409" || inner?.error === "Duplicate";
}

function objectUrl(base, key) {
  return `${base}/${safeKey(key).split("/").map(encodeURIComponent).join("/")}`;
}

async function localPut(filePath, key) {
  const dest = localPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putCanonical(filePath, key, mime) {
  safeKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : localPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(objectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  // SUPABASE WRAPS ITS REAL STATUS INSIDE THE BODY. A duplicate object comes back as
  // **HTTP 400** with `{"statusCode":"409","error":"Duplicate",...}`, and a permission failure
  // as HTTP 400 with `{"statusCode":"403",...}`. So `response.status === 409` was NEVER true and
  // the re-upload path below was unreachable: every duplicate became a fatal `storage_error`.
  // Found 2026-07-26 by re-uploading an already-ingested document, which is the ordinary case —
  // a human re-dropping a file they already sent. Read the body ONCE and branch on what it says.
  if (response.ok) return { created: true, existed: false };
  const body = await response.text().catch(() => "");
  if (isDuplicateUpload(response.status, body)) return { created: false, existed: true };
  // Carry the BODY, not just the HTTP status: `(400)` alone cannot distinguish a duplicate from
  // a permission denial from a bad key, and discarding it cost a full day of diagnosis.
  throw new StorageError(
    "storage_error",
    `Storage upload failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`,
  );
}

/**
 * #620 — THE GET SIDE'S CLASSIFIER. Turn one failed Storage read into a typed `reason`.
 *
 * THE WRAPPED STATUS IS THE WHOLE REASON THIS EXISTS. Supabase's storage-api returns its own
 * status INSIDE the body — a duplicate upload arrives as **HTTP 400** carrying
 * `{"statusCode":"409","error":"Duplicate",...}` — which is the 2026-07-26 incident `putCanonical`
 * above documents at length: `response.status === 409` was never true, every duplicate became a
 * fatal error, and the diagnosis cost a day. That parsing has lived on the UPLOAD side only. The
 * READ side had one arm — `Storage read failed (<http status>)` — so a 400-wrapped 404 (the object
 * is gone) and a 400-wrapped 403 (the JWT lost its role) were the same sentence, and a route could
 * only ever answer "502, something went wrong".
 *
 * TWO ENVELOPE SHAPES ARE IN THE WILD, AND BOTH ARE READ HERE.
 *   · `{"statusCode":"409","error":"Duplicate","message":"…"}` — the shape this repository has
 *     CAPTURED VERBATIM against live storage (packages/runtime/tests/intake-unit.test.mjs:285-325,
 *     observed 2026-07-26), and the one `putCanonical` above already parses.
 *   · `{"code":"NoSuchKey","message":"The specified key does not exist."}` — the shape the vendor
 *     documents today at https://supabase.com/docs/guides/storage/debugging/error-codes (fetched
 *     2026-09-12), which also states that older responses may carry `httpStatusCode` beside
 *     `code`/`message`, and pins NoSuchKey=404, InvalidJWT=401, AccessDenied=403.
 * A numeric status inside the body wins; then the symbolic code; then the transport status. The
 * hosted capture of the GET side is still outstanding — packages/runtime/tests/
 * storage-read-contract.test.mjs says so in its own header rather than implying it has one.
 *
 * FOUR REASONS, AND NO FIFTH. `object_missing` (the row points at bytes that are not there —
 * re-upload), `credential_refused` (the custody JWT was rejected — rotate), `unavailable` (5xx,
 * network, timeout — retry), and `unconfigured` (realConfig never let a request happen — fix the
 * deployment, and that one is raised in realConfig itself with its 503).
 *
 * @param {number} status the HTTP status
 * @param {string} body   the response body, already read (it is discarded either way)
 * @returns {{reason: string, status: number}}
 */
export function classifyGetFailure(status, body) {
  let inner = null;
  try { inner = JSON.parse(body ?? ""); } catch { /* not JSON — the HTTP status is all there is */ }
  const wrapped = Number(inner?.statusCode ?? inner?.httpStatusCode);
  // The BODY's status wins when it is present and plausible: that is the service's own word about
  // what happened, and the transport status is the envelope it arrived in.
  if (Number.isFinite(wrapped) && wrapped >= 100 && wrapped <= 599) {
    return { reason: reasonForStatus(wrapped), status: 502 };
  }
  // THE SYMBOLIC CODE IS READ TOO, and matched case-insensitively against the documented names
  // rather than by substring: `NoSuchBucket` and `NoSuchKey` mean the same thing to a reader (the
  // bytes are not there) but a `includes("NoSuchKey")` test would also match a message that merely
  // QUOTED the code back, which is how a classifier starts agreeing with prose.
  const code = typeof inner?.code === "string" ? inner.code.toLowerCase() : null;
  if (code === "nosuchkey" || code === "nosuchbucket") return { reason: "object_missing", status: 502 };
  if (code === "invalidjwt" || code === "accessdenied" || code === "unauthorized") {
    return { reason: "credential_refused", status: 502 };
  }
  return { reason: reasonForStatus(status), status: 502 };
}

function reasonForStatus(status) {
  if (status === 404 || status === 410) return "object_missing";
  if (status === 401 || status === 403) return "credential_refused";
  return "unavailable";
}

async function responseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(localPath(key), "canonical");
  }
  const { base, jwt } = realConfig();
  let response;
  try {
    response = await fetch(objectUrl(base, key), {
      headers: { authorization: `Bearer ${jwt}`, apikey: jwt },
    });
  } catch (err) {
    // A REJECTED FETCH IS `unavailable`, NEVER `object_missing`. DNS failure, a refused connection
    // and an aborted timeout all land here, and none of them is evidence about the object. The
    // cause's own message is carried for the operator; it never reaches a client (the route
    // answers `{error:"storage_error", reason}` and nothing else).
    throw new StorageError("storage_error",
      `Storage read failed (network: ${String(err?.message ?? err).slice(0, 200)})`, 502, "unavailable");
  }
  if (response.ok && response.body) return response.body;
  // An `ok` response with no body is a broken read, not a missing object — it falls through to the
  // classifier as its own transport status, which is `unavailable` for a 2xx.
  const body = await response.text().catch(() => "");
  const { reason, status } = classifyGetFailure(response.status, body);
  // THE BODY IS CARRIED, CAPPED AT 200 CHARACTERS — the same discipline `putCanonical` adopted
  // after discarding it cost a full day of diagnosis, and the same cap, so a vendor error page can
  // never become the bulk of a log line. It stays server-side.
  throw new StorageError("storage_error",
    `Storage read failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`, status, reason);
}

export async function hashCanonical(key) {
  const body = await responseFor(safeKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyCanonical(key, expectedSha256) {
  const actual = await hashCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "canonical readback hash mismatch");
  return { sha256: actual };
}

export async function downloadCanonical(key, destination, expectedSha256) {
  const body = await responseFor(safeKey(key));
  await mkdir(dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const tee = async function* () {
    for await (const chunk of body) {
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(tee(), createWriteStream(destination, { flags: "w", mode: 0o600 }));
  const actual = hash.digest("hex");
  if (expectedSha256 && actual !== expectedSha256) {
    await rm(destination, { force: true }).catch(() => {});
    throw new StorageError("checksum_mismatch", "downloaded canonical object no longer matches its document SHA");
  }
  return { path: destination, sha256: actual };
}

export async function localObjectExists(key) {
  if (process.env.RELAY_TEST_MODE !== "1") return null;
  try {
    const fh = await open(localPath(key), "r");
    await fh.close();
    return true;
  } catch (err) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Wave B — the wiki content-addressed object family (migration 0017 W5). ADDITIVE ONLY: a
// safeWikiKey validator sibling of safeKey + put/verify siblings that share the private
// realConfig()/test-shim plumbing but validate the DISTINCT wiki key grammar
// (firms/{firm}/wiki/{client}/{sha}.md). The docs safeKey regex above is UNTOUCHED, so a wiki
// key can never be put on the docs path and vice-versa. Same private bucket (firm-docs → the
// daily rclone mirror covers wiki bytes for free). Overwrite is structurally impossible
// (x-upsert:false → a 409 is idempotent success). Reuses globalThis.__claraStorageForTest when
// the injected shim is wiki-key-aware; otherwise the local file shim handles wiki keys directly.
// ---------------------------------------------------------------------------
export function safeWikiKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/wiki\/[0-9a-f-]{36}\/[0-9a-f]{64}\.md$/i.test(value)) {
    throw new StorageError("storage_error", "canonical wiki storage key is invalid");
  }
  return value;
}

function wikiLocalPath(key) {
  return join(testRoot(), ...safeWikiKey(key).split("/"));
}
function wikiObjectUrl(base, key) {
  return `${base}/${safeWikiKey(key).split("/").map(encodeURIComponent).join("/")}`;
}
async function wikiLocalPut(filePath, key) {
  const dest = wikiLocalPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putWikiCanonical(filePath, key, mime = "text/markdown") {
  safeWikiKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : wikiLocalPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(wikiObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.ok) return { created: true, existed: false };
  // THE SHARED PREDICATE, not a local one. This arm used to test `response.status === 409` alone,
  // which the hosted service never returns for a duplicate (it wraps 409 inside an HTTP 400), so a
  // re-projection of an unchanged page — the ordinary redrive at wiki-projection.mjs:434 — was a
  // fatal error. The body is read once and carried in the log line for the same reason the docs
  // family carries it: `(400)` alone cannot tell a duplicate from a permission denial.
  const body = await response.text().catch(() => "");
  if (isDuplicateUpload(response.status, body)) return { created: false, existed: true };
  throw new StorageError(
    "storage_error",
    `wiki storage upload failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`,
  );
}

async function wikiResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(wikiLocalPath(key), "wiki");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(wikiObjectUrl(base, key), { headers: { authorization: `Bearer ${jwt}`, apikey: jwt } });
  if (!response.ok || !response.body) throw new StorageError("storage_error", `wiki storage read failed (${response.status})`);
  return response.body;
}

export async function hashWikiCanonical(key) {
  const body = await wikiResponseFor(safeWikiKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyWikiCanonical(key, expectedSha256) {
  const actual = await hashWikiCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "wiki canonical readback hash mismatch");
  return { sha256: actual };
}

// ---------------------------------------------------------------------------
// Wave E lane ζ — the sealed-report object family (design part2 §9, "Custody"). ADDITIVE ONLY,
// and the third key family beside safeKey (docs) and safeWikiKey (wiki): a safeReportKey
// validator plus put/verify siblings sharing the same private realConfig()/test-shim plumbing.
// The docs and wiki regexes above are UNTOUCHED, so a report key can never be put on the docs or
// wiki path and vice-versa.
//
// Same `firm-docs` bucket, deliberately (§9): the wiki family made exactly this call so the daily
// R2 mirror covers the bytes for free — a new bucket needs its own mirror, restore drill and role.
//
// THE BUCKET POLICY IS NOT INHERITED, AND THAT IS THE POINT (§9, R18/MINOR 25). safeKey's live
// regex admits only `firms/…/docs/…` and the role check is about the ROLE, not the prefix — so
// the storage role's policy must be extended to the `reports/` prefix DELIBERATELY. That
// extension is a named ceremony step with a positive read (upload one object, read it back by
// key) before the first seal — a ceremony this repository does not carry a runbook for (#617:
// the `docs/ops/DR.md` cited here does not exist); it is not implied by this code either.
//
// Overwrite is structurally impossible (x-upsert:false → a 409 is idempotent success), which is
// what makes an at-least-once render safe: the key is the content address, so a second identical
// render writes the same bytes to the same key and the second PUT is a no-op.
// ---------------------------------------------------------------------------
export function safeReportKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/reports\/[0-9a-f]{64}\.(pdf|json)$/i.test(value)) {
    throw new StorageError("storage_error", "canonical report storage key is invalid");
  }
  return value;
}

function reportLocalPath(key) {
  return join(testRoot(), ...safeReportKey(key).split("/"));
}
function reportObjectUrl(base, key) {
  return `${base}/${safeReportKey(key).split("/").map(encodeURIComponent).join("/")}`;
}
async function reportLocalPut(filePath, key) {
  const dest = reportLocalPath(key);
  await mkdir(dirname(dest), { recursive: true });
  try {
    await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
    return { created: true, existed: false };
  } catch (err) {
    if (err?.code === "EEXIST") return { created: false, existed: true };
    await rm(dest, { force: true }).catch(() => {});
    throw err;
  }
}

export async function putReportCanonical(filePath, key, mime = "application/pdf") {
  safeReportKey(key);
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    return injected?.put ? injected.put(filePath, key, mime) : reportLocalPut(filePath, key);
  }
  const { base, jwt } = realConfig();
  const response = await fetch(reportObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.ok) return { created: true, existed: false };
  // `isDuplicateUpload` is the shared reading of Supabase's wrapped status (the 2026-07-26 finding
  // the helper's own header records): a duplicate comes back as HTTP 400 with
  // {"statusCode":"409",...}, and a duplicate report object is idempotent SUCCESS — treating it as
  // fatal is exactly what would make an at-least-once render unsafe.
  const body = await response.text().catch(() => "");
  if (isDuplicateUpload(response.status, body)) return { created: false, existed: true };
  throw new StorageError(
    "storage_error",
    `report storage upload failed (${response.status})${body ? ` ${body.slice(0, 200)}` : ""}`,
  );
}

async function reportResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    return openLocalStream(reportLocalPath(key), "report");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(reportObjectUrl(base, key), { headers: { authorization: `Bearer ${jwt}`, apikey: jwt } });
  if (!response.ok || !response.body) throw new StorageError("storage_error", `report storage read failed (${response.status})`);
  return response.body;
}

export async function hashReportCanonical(key) {
  const body = await reportResponseFor(safeReportKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifyReportCanonical(key, expectedSha256) {
  const actual = await hashReportCanonical(key);
  if (actual !== expectedSha256) throw new StorageError("checksum_mismatch", "report canonical readback hash mismatch");
  return { sha256: actual };
}

// ---------------------------------------------------------------------------
// THE ARTIFACT PREFIXES — the READ half of the two sealed-artifact families (FS-7 echelon 2,
// 裁-96②), plus the sandbox family's WRITE half.
//
// TWO PREFIXES, ONE KEY SPACE, AND THE SHAPE IS THE DATABASE'S. `firms/<firm>/reports/<sha>.<ext>`
// is what clara.report_artifacts' ck_ra_content_addressed CHECK derives; `firms/<firm>/sandbox/
// <sha>.pdf` is what clara.complete_sandbox_export refuses to deviate from. This validator admits
// exactly those two and nothing else, so a key that reached here from anywhere but one of those
// two writers cannot be fetched — the traversal wall is the SHAPE, not an escaping pass.
//
// IT IS DELIBERATELY NOT A WIDENING OF safeReportKey. That validator is the seal path's own, its
// callers pass only `reports/` keys, and loosening it would silently let a report writer put bytes
// under the sandbox prefix. A second, read-side validator that admits both is additive: neither
// writer's wall moves.
export function safeArtifactKey(key) {
  const value = String(key || "");
  if (!/^firms\/[0-9a-f-]{36}\/reports\/[0-9a-f]{64}\.(pdf|json)$/i.test(value)
      && !/^firms\/[0-9a-f-]{36}\/sandbox\/[0-9a-f]{64}\.pdf$/i.test(value)) {
    throw new StorageError("storage_error", "canonical artifact storage key is invalid");
  }
  return value;
}

function artifactLocalPath(key) {
  return join(testRoot(), ...safeArtifactKey(key).split("/"));
}
function artifactObjectUrl(base, key) {
  return `${base}/${safeArtifactKey(key).split("/").map(encodeURIComponent).join("/")}`;
}

async function artifactResponseFor(key) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.get) return injected.get(key);
    // A MISSING OBJECT IS A StorageError IN BOTH MODES, and that costs one open to guarantee.
    // Without it the local path raises a bare ENOENT from the stream, which a route's error mapper
    // reads as an unrecognised internal fault (500) while the real Supabase path raises a
    // StorageError (502) for the identical condition — so the local test would have been measuring
    // a different failure than the deployed one. Measured, not assumed: this is the divergence the
    // FS-7 e2 route battery's missing-object cell actually caught.
    //
    // ONE open, HELD (#630 round-6 finding [4]). This arm used to stat with an `open`/`close` pair
    // and then hand back a fresh, LAZY `createReadStream(path)` — a SECOND open, on a later libuv
    // turn, that the stat did nothing to protect. The steady-state miss was covered; an object
    // that vanished inside the stat→open window (a rig sweep) or an open that failed there
    // (a Windows sharing violation, fd pressure) fired 'error' into an empty listener set, because
    // `downloadArtifactCanonical` below `await`s the destination `mkdir` before `pipeline()`
    // attaches anything. `openLocalStream` is the same cure the other three families take, and it
    // keeps this arm's messages byte-identical: it throws through the very `localOpenFailure` this
    // catch used to call.
    return openLocalStream(artifactLocalPath(key), "artifact");
  }
  const { base, jwt } = realConfig();
  const response = await fetch(artifactObjectUrl(base, key), {
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt },
  });
  if (!response.ok || !response.body) {
    throw new StorageError("storage_error", `artifact storage read failed (${response.status})`);
  }
  return response.body;
}

/**
 * Download one sealed artifact to a local path, hashing EN ROUTE and refusing on mismatch.
 *
 * THE HASH IS NOT OPTIONAL HERE, unlike downloadCanonical's. Both artifact families are
 * content-addressed — the sha256 IS the last path segment — so a byte stream that does not hash to
 * the expected value is either a tampered object or the wrong object, and there is no third
 * reading. Serving it to a human would hand them a document the estate cannot vouch for, which is
 * the one thing a download door exists to prevent.
 */
export async function downloadArtifactCanonical(key, destination, expectedSha256) {
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new StorageError("storage_error", "an artifact download requires the row's own sha256");
  }
  const body = await artifactResponseFor(safeArtifactKey(key));
  await mkdir(dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const tee = async function* () {
    for await (const chunk of body) {
      hash.update(chunk);
      yield chunk;
    }
  };
  await pipeline(tee(), createWriteStream(destination, { flags: "w", mode: 0o600 }));
  const actual = hash.digest("hex");
  if (actual !== expectedSha256) {
    await rm(destination, { force: true }).catch(() => {});
    throw new StorageError("checksum_mismatch", "the stored artifact no longer matches its sealed sha256");
  }
  return { path: destination, sha256: actual };
}

/**
 * Put one sandbox export's bytes at their content address. Overwrite-impossible (`x-upsert:false`),
 * the putReportCanonical shape exactly — including the Supabase quirk where a duplicate arrives as
 * HTTP 400 carrying `{"statusCode":"409"}` in the body, which is idempotent SUCCESS for a
 * content-addressed key and must never be treated as a fatal error.
 */
export async function putSandboxCanonical(filePath, key, mime = "application/pdf") {
  const value = safeArtifactKey(key);
  if (!/\/sandbox\//.test(value)) {
    throw new StorageError("storage_error", "a sandbox export writes under the sandbox prefix only");
  }
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraStorageForTest;
    if (injected?.put) return injected.put(filePath, key, mime);
    const dest = artifactLocalPath(key);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await pipeline(createReadStream(filePath), createWriteStream(dest, { flags: "wx", mode: 0o600 }));
      return { created: true, existed: false };
    } catch (err) {
      if (err?.code === "EEXIST") return { created: false, existed: true };
      await rm(dest, { force: true }).catch(() => {});
      throw err;
    }
  }
  const { base, jwt } = realConfig();
  const response = await fetch(artifactObjectUrl(base, key), {
    method: "POST",
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, "content-type": mime, "x-upsert": "false" },
    body: createReadStream(filePath),
    duplex: "half",
  });
  if (response.ok) return { created: true, existed: false };
  const raw = await response.text().catch(() => "");
  if (isDuplicateUpload(response.status, raw)) return { created: false, existed: true };
  throw new StorageError(
    "storage_error",
    `sandbox storage upload failed (${response.status})${raw ? ` ${raw.slice(0, 200)}` : ""}`,
  );
}

/** The sandbox family's read-back hash, the verifyReportCanonical sibling. */
export async function hashSandboxCanonical(key) {
  const body = await artifactResponseFor(safeArtifactKey(key));
  const hash = createHash("sha256");
  for await (const chunk of body) hash.update(chunk);
  return hash.digest("hex");
}

export async function verifySandboxCanonical(key, expectedSha256) {
  const actual = await hashSandboxCanonical(key);
  if (actual !== expectedSha256) {
    throw new StorageError("checksum_mismatch", "sandbox canonical readback hash mismatch");
  }
  return { sha256: actual };
}
