// @frozen — determinism-critical (Wave E lane zeta, design part2 §10).
//
// Canonical JSON + its digest. Everything the renderer derives from the manifest — the document
// id, the creation timestamp, the ordering of anything it draws — is derived through THIS
// function, so that two runs of the same job over the same inputs produce the same bytes.
//
// WHY NOT JSON.stringify. Its key order is insertion order, so two objects with the same
// contents can serialise differently, and a digest over that is a digest over how the object
// happened to be built. This is RFC 8785 (JCS) restricted to the value space a Clara manifest
// actually contains: object keys sorted by UTF-16 code unit, no insignificant whitespace,
// strings escaped minimally.
//
// NON-INTEGER NUMBERS ARE REFUSED, not rounded. JCS specifies ECMAScript number formatting, and
// reproducing it exactly across languages is a known footgun — but the refusal here is not about
// difficulty. A manifest has no business carrying a float: every figure in a Clara report is a
// DB-owned exact decimal that travels as an integer of cents or as an already-formatted string
// (E-R8 floor 1). A float appearing in a manifest means something upstream computed a number in
// the wrong place, and the honest response to that is to stop, not to serialise it prettily.
//
// THIS MODULE IS NOT THE SEAL'S HASH. `render_manifest_sha256` is computed IN THE DATABASE by
// clara.complete_render_job, using Postgres's own jsonb text form, because the seal gate
// re-derives it the same way; asking this module to reproduce that form would make a
// cross-language match load-bearing for the seal. What this module hashes is the renderer's own
// inputs — the request pin set and the document metadata it derives — where the only requirement
// is that the SAME function is used on both sides of a comparison.

import { createHash } from "node:crypto";

export class CanonicalJsonError extends Error {
  constructor(message, path) {
    super(path ? `${message} (at ${path})` : message);
    this.name = "CanonicalJsonError";
    this.path = path ?? "$";
  }
}

function escapeString(s) {
  let out = '"';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

/** Sort by UTF-16 code unit, which is what `<` on JS strings already does. Named so nobody
 *  "improves" it into a locale-aware collation, which would make the digest depend on ICU. */
function byCodeUnit(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function serialize(value, path) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return escapeString(value);
  if (t === "number") {
    if (!Number.isInteger(value)) {
      throw new CanonicalJsonError(
        "a manifest may not carry a non-integer number; every Clara figure is a DB-owned exact decimal",
        path,
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalJsonError("integer is outside the exactly-representable range", path);
    }
    return String(value);
  }
  if (t === "bigint") return value.toString();
  if (Array.isArray(value)) {
    return "[" + value.map((v, i) => serialize(v, `${path}[${i}]`)).join(",") + "]";
  }
  if (t === "object") {
    const keys = Object.keys(value).sort(byCodeUnit);
    const parts = [];
    for (const k of keys) {
      const v = value[k];
      // `undefined` is not a JSON value. Dropping it silently is how a pin goes missing without
      // anybody noticing, so it is a refusal.
      if (v === undefined) {
        throw new CanonicalJsonError(`key ${JSON.stringify(k)} is undefined; absence must be explicit null`, path);
      }
      parts.push(escapeString(k) + ":" + serialize(v, `${path}.${k}`));
    }
    return "{" + parts.join(",") + "}";
  }
  throw new CanonicalJsonError(`value of type ${t} has no canonical JSON form`, path);
}

/** The canonical serialisation of a JSON value. Deterministic for equal values. */
export function canonicalJson(value) {
  return serialize(value, "$");
}

/** sha256 (hex) of the canonical serialisation. */
export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** sha256 (hex) of raw bytes — the produced PDF, an embedded font, a logo. */
export function bytesSha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
