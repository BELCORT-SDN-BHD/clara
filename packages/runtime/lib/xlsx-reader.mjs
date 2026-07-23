// A minimal, self-contained XLSX reader — a ZIP central-directory walk + DEFLATE inflate
// + XML parse over the first worksheet. Self-contained (CSP/dependency law): only
// node:zlib + fast-xml-parser, no external spreadsheet library. Extracted from
// seeding-parse.mjs (the module was outgrowing the 500-line ceiling); it is a general
// deep utility with a narrow surface — `readXlsxSheet(buffer) → {rows, rowNums}`,
// `looksLikeXlsx(buffer) → boolean`, `colIndex(ref)` — and knows nothing of the seeding
// domain. Every structural fault throws `UnparseableError` so the caller can 422 honestly.

import { inflateRawSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

const MAX_XLSX_INFLATED_BYTES = 8 * 1024 * 1024; // zip-bomb guard (per entry + total)
const ZIP_LOCAL_MAGIC = 0x04034b50; // "PK\x03\x04" as a little-endian uint32

/** A deterministic, honest "cannot parse" signal → the caller returns 422. */
export class UnparseableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "UnparseableError";
    this.reason = reason;
  }
}

// --- ZIP layer -----------------------------------------------------------------------

/** Locate the End Of Central Directory record and return {count, cdOffset}. */
function findEocd(buf) {
  const min = 22;
  if (buf.length < min) throw new UnparseableError("not_a_zip");
  // Scan back from the end for the EOCD signature (comment ≤ 64KB).
  const start = Math.max(0, buf.length - (min + 0xffff));
  for (let i = buf.length - min; i >= start; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      return { count: buf.readUInt16LE(i + 10), cdOffset: buf.readUInt32LE(i + 16) };
    }
  }
  throw new UnparseableError("not_a_zip");
}

/** Walk the central directory → a map of filename → {method, compSize, localOffset}. */
export function readCentralDirectory(buf) {
  const { count, cdOffset } = findEocd(buf);
  const entries = new Map();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new UnparseableError("bad_zip_cd");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Inflate one central-directory entry to a UTF-8 string (stored or DEFLATE only). */
function readZipEntry(buf, entry) {
  const lo = entry.localOffset;
  if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) throw new UnparseableError("bad_zip_local");
  const nameLen = buf.readUInt16LE(lo + 26);
  const extraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + nameLen + extraLen;
  const comp = buf.subarray(dataStart, dataStart + entry.compSize);
  let out;
  if (entry.method === 0) out = comp;
  else if (entry.method === 8) {
    out = inflateRawSync(comp, { maxOutputLength: MAX_XLSX_INFLATED_BYTES });
  } else throw new UnparseableError("unsupported_zip_compression");
  if (out.length > MAX_XLSX_INFLATED_BYTES) throw new UnparseableError("xlsx_too_large");
  return out.toString("utf8");
}

// --- XLSX layer ----------------------------------------------------------------------

/** A1-style column ref → 0-based column index. */
export function colIndex(ref) {
  const m = /^([A-Z]+)\d+$/.exec(String(ref ?? ""));
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const _xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const _asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
function _text(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node["#text"] !== "undefined") return String(node["#text"]);
  return "";
}

/** Resolve one sharedStrings <si> (plain <t> or rich <r> runs) to its text. */
function sharedStringText(si) {
  if (si == null) return "";
  if (si.t != null) return _text(si.t);
  return _asArray(si.r).map((run) => _text(run?.t)).join("");
}

/**
 * Read the first worksheet of an xlsx buffer into a dense 2D array of cell strings PLUS
 * the parallel PHYSICAL worksheet row numbers (`rowNums[i]` = the `<row r>` attribute of
 * `rows[i]`, sparse-aware — a workbook that omits empty rows keeps its true positions).
 * Throws UnparseableError for any structural fault (not a zip, no worksheet, ...).
 * @param {Buffer} buffer
 * @returns {{rows:string[][], rowNums:number[]}}
 */
export function readXlsxSheet(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new UnparseableError("not_a_zip");
  const cd = readCentralDirectory(buffer);
  // Shared strings (optional).
  let shared = [];
  const ssEntry = cd.get("xl/sharedStrings.xml");
  if (ssEntry) {
    const doc = _xml.parse(readZipEntry(buffer, ssEntry));
    shared = _asArray(doc?.sst?.si).map(sharedStringText);
  }
  // The first worksheet (lowest-named xl/worksheets/*.xml).
  const sheetName = [...cd.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new UnparseableError("no_worksheet");
  const sheet = _xml.parse(readZipEntry(buffer, cd.get(sheetName)));
  const rawRows = _asArray(sheet?.worksheet?.sheetData?.row);
  const rows = [];
  const rowNums = [];
  let seq = 0;
  for (const r of rawRows) {
    seq += 1;
    // The PHYSICAL row number is the `r` attribute; fall back to sequence only if absent.
    const physical = Number(r?.["@_r"]);
    rowNums.push(Number.isInteger(physical) && physical > 0 ? physical : seq);
    const cells = _asArray(r?.c);
    const line = [];
    let maxCol = -1;
    for (const c of cells) {
      const ci = colIndex(c?.["@_r"]);
      if (ci < 0) continue;
      let val;
      const t = c?.["@_t"];
      if (t === "s") val = shared[Number(_text(c?.v))] ?? "";
      else if (t === "inlineStr") val = _asArray(c?.is).map((is) => _text(is?.t)).join("") || _text(c?.is?.t);
      else if (t === "str") val = _text(c?.v);
      else val = _text(c?.v);
      line[ci] = String(val ?? "").trim();
      if (ci > maxCol) maxCol = ci;
    }
    for (let i = 0; i <= maxCol; i++) if (line[i] == null) line[i] = "";
    rows.push(line);
  }
  return { rows, rowNums };
}

/** Sniff a buffer for xlsx-ness BY BYTES (F-M13): the ZIP local-header magic PK\x03\x04
 *  AND the OOXML `[Content_Types].xml` package entry. Filename/mime never decide. */
export function looksLikeXlsx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return false;
  if (buffer.readUInt32LE(0) !== ZIP_LOCAL_MAGIC) return false;
  try {
    return readCentralDirectory(buffer).has("[Content_Types].xml");
  } catch {
    return false;
  }
}
