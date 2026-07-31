import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import net from "node:net";
import { once } from "node:events";
import { inflateRawSync } from "node:zlib";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const MAX_ZIP_ENTRIES = 1000;
const MAX_ZIP_UNCOMPRESSED = 100 * 1024 * 1024;
const MAX_ZIP_RATIO = 100;
const MAX_XML_ENTRY = 16 * 1024 * 1024;
const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
/** @type {(message: string) => void} */
const NOOP_LOG = () => {};

export class IntakeScanError extends Error {
  constructor(code, message, status = 422) {
    super(message);
    this.name = "IntakeScanError";
    this.code = code;
    this.status = status;
  }
}

function extensionOf(filename) {
  const m = /\.([A-Za-z0-9]{1,12})$/.exec(String(filename || ""));
  return m ? m[1].toLowerCase() : "";
}

function starts(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
}

function assertNoEntities(text) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) {
    throw new IntakeScanError("quarantined", "XML declarations capable of entity expansion are forbidden");
  }
}

async function validatePlainXml(path) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let carry = "";
  try {
    for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
      const text = carry + decoder.decode(chunk, { stream: true });
      assertNoEntities(text);
      carry = text.slice(-64);
    }
    assertNoEntities(carry + decoder.decode());
  } catch (err) {
    if (err instanceof IntakeScanError) throw err;
    throw new IntakeScanError("bad_type", "XML is not valid UTF-8", 415);
  }
}

async function readPrefix(path, n = 8192) {
  const fh = await open(path, "r");
  try {
    const b = Buffer.alloc(n);
    const { bytesRead } = await fh.read(b, 0, n, 0);
    return b.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export async function readZipEntries(path) {
  const fh = await open(path, "r");
  try {
    const size = (await fh.stat()).size;
    const tailLen = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailLen);
    await fh.read(tail, 0, tailLen, size - tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new IntakeScanError("quarantined", "ZIP central directory is missing");
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      throw new IntakeScanError("quarantined", "ZIP64 is outside the intake safety profile");
    }
    if (count <= 0 || count > MAX_ZIP_ENTRIES || cdSize > 4 * 1024 * 1024 || cdOffset + cdSize > size) {
      throw new IntakeScanError("quarantined", "ZIP entry-count or central-directory cap exceeded");
    }
    const cd = Buffer.alloc(cdSize);
    await fh.read(cd, 0, cdSize, cdOffset);
    const entries = [];
    let off = 0;
    let totalCompressed = 0;
    let totalUncompressed = 0;
    for (let index = 0; index < count; index++) {
      if (off + 46 > cd.length || cd.readUInt32LE(off) !== 0x02014b50) {
        throw new IntakeScanError("quarantined", "malformed ZIP central directory");
      }
      const flags = cd.readUInt16LE(off + 8);
      const method = cd.readUInt16LE(off + 10);
      const compressedSize = cd.readUInt32LE(off + 20);
      const uncompressedSize = cd.readUInt32LE(off + 24);
      const nameLen = cd.readUInt16LE(off + 28);
      const extraLen = cd.readUInt16LE(off + 30);
      const commentLen = cd.readUInt16LE(off + 32);
      const localOffset = cd.readUInt32LE(off + 42);
      const end = off + 46 + nameLen + extraLen + commentLen;
      if (end > cd.length) throw new IntakeScanError("quarantined", "truncated ZIP entry");
      const name = cd.subarray(off + 46, off + 46 + nameLen).toString("utf8").replaceAll("\\", "/");
      if (!name || name.startsWith("/") || name.split("/").includes("..") || name.includes("\0")) {
        throw new IntakeScanError("quarantined", "unsafe ZIP entry path");
      }
      if ((flags & 1) !== 0) throw new IntakeScanError("quarantined", "encrypted archives are forbidden");
      if (![0, 8].includes(method)) throw new IntakeScanError("quarantined", "unsupported archive compression");
      if (/vbaProject|macros\//i.test(name)) throw new IntakeScanError("quarantined", "macro-bearing OOXML is forbidden");
      if (uncompressedSize > 0 && compressedSize === 0) throw new IntakeScanError("quarantined", "invalid ZIP compression ratio");
      if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_ZIP_RATIO) {
        throw new IntakeScanError("quarantined", "ZIP compression-ratio cap exceeded");
      }
      totalCompressed += compressedSize;
      totalUncompressed += uncompressedSize;
      entries.push({ name, flags, method, compressedSize, uncompressedSize, localOffset });
      off = end;
    }
    if (totalUncompressed > MAX_ZIP_UNCOMPRESSED || (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_ZIP_RATIO)) {
      throw new IntakeScanError("quarantined", "ZIP aggregate expansion cap exceeded");
    }
    return entries;
  } finally {
    await fh.close();
  }
}

export async function readZipEntry(path, entry, maxBytes = MAX_XML_ENTRY) {
  if (entry.uncompressedSize > maxBytes || entry.compressedSize > 24 * 1024 * 1024) {
    throw new IntakeScanError("quarantined", "ZIP entry exceeds the extraction cap");
  }
  const fh = await open(path, "r");
  try {
    const local = Buffer.alloc(30);
    await fh.read(local, 0, 30, entry.localOffset);
    if (local.readUInt32LE(0) !== 0x04034b50) throw new IntakeScanError("quarantined", "malformed ZIP local header");
    const nameLen = local.readUInt16LE(26);
    const extraLen = local.readUInt16LE(28);
    const data = Buffer.alloc(entry.compressedSize);
    await fh.read(data, 0, data.length, entry.localOffset + 30 + nameLen + extraLen);
    const out = entry.method === 0 ? data : inflateRawSync(data, { maxOutputLength: maxBytes });
    if (out.length !== entry.uncompressedSize || out.length > maxBytes) {
      throw new IntakeScanError("quarantined", "ZIP entry length mismatch");
    }
    return out;
  } finally {
    await fh.close();
  }
}

async function validateOoxml(path) {
  const entries = await readZipEntries(path);
  const names = new Set(entries.map((e) => e.name));
  const format = names.has("xl/workbook.xml") ? "xlsx" : names.has("word/document.xml") ? "docx" : null;
  if (!format || !names.has("[Content_Types].xml")) throw new IntakeScanError("bad_type", "ZIP is not an allowed OOXML document", 415);
  for (const entry of entries) {
    if (!/\.xml$/i.test(entry.name)) continue;
    const xml = (await readZipEntry(path, entry)).toString("utf8");
    assertNoEntities(xml);
  }
  const pages = format === "xlsx" ? Math.max(1, entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(e.name)).length) : 1;
  return { format, ext: format, mime: format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pages };
}

// --- OFX (Wave C-b design §4.3) -------------------------------------------------------
//
// WHY OFX NEEDS ITS OWN DETECTION. Until now an OFX upload had exactly two fates, both
// wrong: rejected outright ("file signature is not in the intake allowlist"), or — for the
// XML-flavoured OFX 2.x carrying a .xml extension — MISROUTED into the MyInvois/UBL lane,
// where a bank statement would be parsed as an e-invoice. Neither is a statement.
//
// OFX comes in two dialects and both are detected here:
//   * 1.x — a plain-text header block (`OFXHEADER:100`, `DATA:OFXSGML`) followed by SGML
//     with UNCLOSED leaf tags. It is not XML and must never be handed to an XML validator.
//   * 2.x — well-formed XML, usually announced by an `<?OFX ...?>` processing instruction,
//     with `<OFX>` as the root element.
//
// The detection is SIGNATURE-based, not extension-based, so a .qfx/.txt/.xml wrapper cannot
// change what the file is. The entity guard (`assertNoEntities`) still applies to both
// dialects: an OFX file has no legitimate reason to declare a DOCTYPE or an ENTITY, and
// refusing them here keeps this lane off the entity-expansion surface entirely.
//
// PAGES = 1: an OFX file is a record stream, not a paginated document, and the page count
// feeds the vendor page budget — which this lane never spends (the structured statement
// parse is in-process and free).
function looksLikeOfx(prefix) {
  const text = prefix.toString("latin1").replace(/^\uFEFF/, "").trimStart();
  if (/^OFXHEADER\s*:/i.test(text)) return true; // 1.x SGML header block
  if (/<\?OFX\b/i.test(text)) return true; // 2.x processing instruction
  return /^(?:<\?xml[^>]*\?>\s*)?<OFX\b/i.test(text); // 2.x root element
}

async function validateOfx(path) {
  // latin1 never throws, which matters: OFX 1.x exports from Malaysian banking portals are
  // frequently CP1252 rather than UTF-8, and refusing them for an encoding a statement lane
  // can read perfectly well would be a false rejection.
  let carry = "";
  let sawBody = false;
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const text = carry + chunk.toString("latin1");
    assertNoEntities(text);
    sawBody ||= /<(?:OFX|STMTTRN|BANKTRANLIST)\b/i.test(text);
    carry = text.slice(-64);
  }
  if (!sawBody) throw new IntakeScanError("bad_type", "file announces OFX but carries no OFX body", 415);
  return { format: "ofx", ext: "ofx", mime: "application/x-ofx", pages: 1 };
}

function validateDelimited(prefix, ext) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(prefix);
  } catch {
    throw new IntakeScanError("bad_type", "delimited text is not valid UTF-8", 415);
  }
  if (text.includes("\0") || !text.trim()) throw new IntakeScanError("bad_type", "delimited text parse probe failed", 415);
  const lines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 20);
  const delimiter = ext === "tsv" ? "\t" : lines.some((l) => l.includes(",")) ? "," : lines.some((l) => l.includes(";")) ? ";" : null;
  if (!delimiter) throw new IntakeScanError("bad_type", "delimited text has no stable delimiter", 415);
  const widths = lines.map((line) => line.split(delimiter).length);
  // A real bank CSV export routinely opens with one or more single-column BANNER/title
  // rows above the transaction header (institution name, "Account Statement", a blank
  // separator) before the genuinely delimited header+data rows begin. This is a
  // lightweight shape sniff, not the parser — statement-parse.mjs's `parseStatementCsv`
  // already scans past exactly this preamble and skips-and-counts it at parse time (its
  // own header comment names the preamble explicitly) — so refusing the file HERE, before
  // the parser that already handles it ever runs, was the transport-layer bug (2026-07-31
  // C-b acceptance-night finding (4)). Leading width<2 rows are tolerated UNCOUNTED; the
  // strictness (no row under 2 fields, at most 2 distinct widths) still applies, but only
  // from the first genuinely-delimited row onward — a real transaction table still has to
  // be internally consistent, and a width-1 row appearing AFTER the body has started (not
  // a leading banner) still refuses.
  const bodyStart = widths.findIndex((n) => n >= 2);
  if (bodyStart === -1) throw new IntakeScanError("bad_type", "delimited text has no stable delimiter", 415);
  const bodyWidths = widths.slice(bodyStart);
  if (bodyWidths.some((n) => n < 2) || new Set(bodyWidths).size > 2) throw new IntakeScanError("bad_type", "delimited text parse probe failed", 415);
  return { format: ext, ext, mime: ext === "tsv" ? "text/tab-separated-values" : "text/csv", pages: 1 };
}

export async function detectDocument(path, { originalFilename, prefix: suppliedPrefix } = {}) {
  const prefix = suppliedPrefix || (await readPrefix(path));
  const ext = extensionOf(originalFilename);
  if (starts(prefix, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { format: "pdf", ext: "pdf", mime: "application/pdf", pages: await countPdfPages(path) };
  if (starts(prefix, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { format: "png", ext: "png", mime: "image/png", pages: 1 };
  if (starts(prefix, [0xff, 0xd8, 0xff])) return { format: "jpeg", ext: "jpg", mime: "image/jpeg", pages: 1 };
  if (prefix.length >= 12 && prefix.subarray(0, 4).toString("ascii") === "RIFF" && prefix.subarray(8, 12).toString("ascii") === "WEBP") return { format: "webp", ext: "webp", mime: "image/webp", pages: 1 };
  if (starts(prefix, [0x49, 0x49, 0x2a, 0x00]) || starts(prefix, [0x4d, 0x4d, 0x00, 0x2a])) return { format: "tiff", ext: "tiff", mime: "image/tiff", pages: 1 };
  if (prefix.length >= 12 && prefix.subarray(4, 8).toString("ascii") === "ftyp" && /heic|heix|hevc|mif1/.test(prefix.subarray(8, 32).toString("ascii"))) return { format: "heic", ext: "heic", mime: "image/heic", pages: 1 };
  if (starts(prefix, [0x50, 0x4b, 0x03, 0x04])) return validateOoxml(path);
  // OFX is tested BEFORE both the delimited and the plain-XML branches: an OFX 2.x file
  // carrying a .xml extension is still a bank statement, and the XML branch would send it to
  // the MyInvois/UBL lane (Wave C-b design §4.3).
  if (looksLikeOfx(prefix)) return validateOfx(path);
  if (ext === "csv" || ext === "tsv") return validateDelimited(prefix, ext);
  const text = prefix.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (ext === "xml" && text.startsWith("<")) {
    await validatePlainXml(path);
    return { format: "xml", ext: "xml", mime: "application/xml", pages: 0 };
  }
  throw new IntakeScanError("bad_type", "file signature is not in the intake allowlist", 415);
}

export async function countPdfPages(path) {
  let count = 0;
  let objectStarts = 0;
  let objectEnds = 0;
  let hasStartXref = false;
  let carry = "";
  let tail = "";
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const overlap = carry.length;
    const text = carry + chunk.toString("latin1");
    if (/\/Encrypt\b/.test(text)) throw new IntakeScanError("quarantined", "encrypted PDF documents are forbidden");
    const countFresh = (pattern) => [...text.matchAll(pattern)]
      .filter((match) => Number(match.index) + match[0].length > overlap).length;
    count += countFresh(/\/Type\s*\/Page\b/g);
    objectStarts += countFresh(/\b\d+\s+\d+\s+obj\b/g);
    objectEnds += countFresh(/\bendobj\b/g);
    hasStartXref ||= /\bstartxref\b/.test(text);
    carry = text.slice(-64);
    tail = (tail + chunk.toString("latin1")).slice(-4096);
  }
  // This is a pre-storage structural plausibility gate, not a full PDF parser.
  // The vendor still performs complete parse/render validation after custody is
  // sealed, but header-only/corrupt junk must never become canonical evidence.
  if (!hasStartXref || objectStarts < 1 || objectEnds < 1 || !/%%EOF[\s\0]*$/.test(tail)) {
    throw new IntakeScanError("bad_type", "PDF structure is incomplete or corrupt", 415);
  }
  return Math.max(1, count);
}

async function testScan(path) {
  let carry = "";
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const text = carry + chunk.toString("latin1");
    if (text.includes(EICAR)) throw new IntakeScanError("malware_detected", "malware scanner rejected the file");
    carry = text.slice(-EICAR.length);
  }
  return { clean: true, adapter: "test" };
}

function socketOptions(value) {
  if (!value) throw new Error("CLARA_CLAMD_SOCKET is required outside RELAY_TEST_MODE");
  const tcp = /^([^:]+):(\d+)$/.exec(value);
  return tcp ? { host: tcp[1], port: Number(tcp[2]) } : { path: value };
}

function connectSocket(value) {
  return net.createConnection(socketOptions(value));
}

export async function scannerReachable(timeoutMs = 500) {
  if (process.env.RELAY_TEST_MODE === "1") return { ok: true, adapter: "test" };
  try {
    const socket = connectSocket(process.env.CLARA_CLAMD_SOCKET);
    const timer = setTimeout(() => socket.destroy(new Error("scanner timeout")), timeoutMs);
    await once(socket, "connect");
    clearTimeout(timer);
    socket.destroy();
    return { ok: true, adapter: "clamd" };
  } catch {
    return { ok: false, adapter: "clamd" };
  }
}

/** The scanner-unavailable fail-closed refusal — retryable 503, nothing stored unscanned. */
function scannerUnavailable() {
  return new IntakeScanError(
    "scanner_unavailable",
    "malware scanner is unavailable; the upload was refused (nothing is stored unscanned)",
    503,
  );
}

export async function scanFile(path) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const injected = globalThis.__claraScannerForTest;
    return injected ? injected(path) : testScan(path);
  }
  // FAIL CLOSED, HONESTLY (PIN-AB-2 / W6): clamd may die at ANY point in the scan — the
  // live incident was an OOM kill mid signature-load. The ENTIRE scan lifetime runs under
  // ONE persistent socket 'error' handler + a scan-wide deadline, so a mid-stream death or
  // a wedged (connected-but-silent) scanner resolves to the fail-closed refusal — never an
  // unhandled 'error' reaching the process-wide handler (which exits the runtime), never a
  // hang. Nothing is ever stored unscanned; already-spooled bytes hold until clamd returns.
  const deadlineMs = Number(process.env.CLARA_CLAMD_SCAN_DEADLINE_MS || 120_000);
  let socket;
  try {
    socket = connectSocket(process.env.CLARA_CLAMD_SOCKET);
  } catch {
    throw scannerUnavailable();
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    let response = "";
    let timer;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeListener("error", onError);
      try {
        socket.destroy();
      } catch {
        /* best-effort */
      }
      fn(arg);
    };
    // Any socket fault over the WHOLE lifetime (connect refusal, mid-stream RST, a
    // cleanup fault) is a fail-closed refusal — the persistent handler means there is
    // never a window without an 'error' listener (the finding-6 crash window).
    const onError = () => finish(reject, scannerUnavailable());
    // A connected-but-silent scanner (no data, no close) trips the scan-wide deadline.
    timer = setTimeout(() => finish(reject, scannerUnavailable()), deadlineMs);
    timer.unref?.();

    socket.on("error", onError);
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("close", () => {
      if (settled) return;
      if (/FOUND/i.test(response)) return finish(reject, new IntakeScanError("malware_detected", "malware scanner rejected the file"));
      if (!/OK/i.test(response)) return finish(reject, new IntakeScanError("internal", "malware scanner failed closed", 503));
      finish(resolve, { clean: true, adapter: "clamd" });
    });

    socket.once("connect", () => {
      // Stream the file to clamd INSTREAM. Any fault here (write after death, a read
      // error, a rejected drain wait) fails closed — the try/catch keeps a rejected
      // `once(socket,'drain')` from becoming an unhandled rejection or a hang.
      void (async () => {
        try {
          socket.write("zINSTREAM\0");
          for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
            if (settled) return;
            const len = Buffer.alloc(4);
            len.writeUInt32BE(chunk.length);
            if (!socket.write(len)) await once(socket, "drain");
            if (!socket.write(chunk)) await once(socket, "drain");
          }
          if (!settled) socket.end(Buffer.alloc(4));
        } catch {
          finish(reject, scannerUnavailable());
        }
      })();
    });
  });
}

function childExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

/** Start the image-local scanner when explicitly enabled. Production never gets
 * an in-process bypass: the runtime still speaks clamd INSTREAM over the socket.
 *
 * PIN-AB-2 (Slice-6 §13 as-built amendment): a clamd exit is NO LONGER runtime-FATAL.
 * The live incident was a 1GB VM OOM-killing clamd after a signature load, and the
 * old FATAL law crash-looped the WHOLE runtime. Now the supervisor RESTARTS clamd with
 * bounded backoff (self-healing); while the socket is unavailable, intake scans fail
 * closed HONESTLY (scanFile → 503 scanner_unavailable — nothing is stored unscanned)
 * and /ready keeps scanner.ok:false as a WARNING (the world stays ready). `done`
 * settles only on stop(), so the supervisor's watcher never treats a clamd bounce as a
 * crash. A backoff resets after a healthy run and grows (capped) on rapid re-exits. */
export function startManagedScanner({ log = NOOP_LOG } = {}) {
  if (process.env.RELAY_TEST_MODE === "1" || process.env.CLARA_CLAMD_MANAGED !== "1") return null;
  const clamdBin = process.env.CLARA_CLAMD_BIN || "clamd";
  const freshclamBin = process.env.CLARA_FRESHCLAM_BIN || "freshclam";
  const configuredRefreshMs = Number(process.env.CLARA_FRESHCLAM_INTERVAL_MS);
  const refreshMs = Math.max(60 * 60_000, Number.isFinite(configuredRefreshMs) ? configuredRefreshMs : 6 * 60 * 60_000);
  const minBackoffMs = Number(process.env.CLARA_CLAMD_MIN_BACKOFF_MS || 2000);
  const maxBackoffMs = Number(process.env.CLARA_CLAMD_MAX_BACKOFF_MS || 60_000);
  const healthyRunMs = Number(process.env.CLARA_CLAMD_HEALTHY_RUN_MS || 60_000);
  let stopping = false;
  let clamd = null;

  const refresh = async () => {
    const child = spawn(freshclamBin, ["--stdout"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout?.on("data", (chunk) => log(`[freshclam] ${String(chunk).trim()}`));
    child.stderr?.on("data", (chunk) => log(`[freshclam] ${String(chunk).trim()}`));
    const result = await childExit(child);
    if (result.code !== 0) log(`[freshclam] update exited ${result.code ?? result.signal}; clamd remains fail-closed`);
  };

  // The supervise LOOP: refresh signatures, run clamd, and on exit restart with
  // bounded backoff until stop() is called. It NEVER throws on a clamd exit.
  const done = (async () => {
    let backoffMs = minBackoffMs;
    await refresh().catch((err) => log(`[freshclam] update failed: ${err?.message ?? err}`));
    while (!stopping) {
      const startedAt = Date.now();
      clamd = spawn(clamdBin, ["--foreground=true"], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      clamd.stdout?.on("data", (chunk) => log(`[clamd] ${String(chunk).trim()}`));
      clamd.stderr?.on("data", (chunk) => log(`[clamd] ${String(chunk).trim()}`));
      const result = await childExit(clamd).catch((err) => ({ code: null, signal: String(err?.message ?? err) }));
      clamd = null;
      if (stopping) break;
      const ranMs = Date.now() - startedAt;
      backoffMs = ranMs >= healthyRunMs ? minBackoffMs : Math.min(backoffMs * 2, maxBackoffMs);
      log(
        `[clamd] exited ${result.code ?? result.signal}; intake fails closed until it returns — restarting in ${backoffMs}ms (ran ${ranMs}ms)`,
      );
      await sleep(backoffMs).catch(() => {});
    }
  })();

  const timer = setInterval(() => {
    if (!stopping) void refresh().catch((err) => log(`[freshclam] refresh failed: ${err?.message ?? err}`));
  }, refreshMs);
  timer.unref?.();
  return {
    done,
    stop: async () => {
      stopping = true;
      clearInterval(timer);
      clamd?.kill("SIGTERM");
      await done.catch(() => {});
    },
  };
}
