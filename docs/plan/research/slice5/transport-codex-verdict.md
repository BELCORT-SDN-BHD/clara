## Recommendation

Pick **C: runtime-owned, resumable store-and-forward ingestion**.

```text
Browser → Fly runtime upload session → encrypted local spool
        → server SHA-256 + malware scan
        → private immutable Supabase object
        → storage readback + SHA verification
        → WDK OCR workflow by reference
        → one DB transaction: document + OCR regions + audit + event/outbox
```

This preserves runtime custody, supports resumability, bounds memory, and never trusts a client checksum.

### Concrete flow

1. Browser calls the Fly runtime directly—not through Vercel—and creates one intake per file. The runtime authenticates against live firm membership and reserves `intake_id` plus `document_id`.
2. An embedded resumable/TUS endpoint streams chunks to an encrypted Fly Volume. The browser gets only an intake-scoped token, never a Storage credential.
3. On completion, the runtime re-reads the spool, enforces byte/page/type limits, sniffs the real format, malware-scans it, and computes SHA-256.
4. It derives and validates the final key from trusted DB values:

   `firms/{firm_id}/{client_slug|_unassigned}/{allowed_folder}/...-{sha256}.{ext}`

5. Using its own restricted Storage credential, the runtime uploads to the private bucket with `upsert=false`, preferably via Supabase TUS. It then downloads the completed object and hashes it again. Only this readback establishes the SHA↔stored-bytes bond.
6. Start `ingestDocument_v1` with only `{intake_id, document_id, sha256, storage_key}`. Storage and Azure credentials remain inside the step.
7. Azure DI `prebuilt-layout` v4.0 runs asynchronously. Its operation ID and attempt state live in the intake table. The successful polling step normalizes OCR and bounding regions and immediately calls one idempotent SECURITY DEFINER function that inserts the document/OCR facts, audit record, `document.ingested`, and outbox row in one transaction.
8. `202 Accepted` means only “transport accepted/processing.” Chat cannot reference the attachment and the UI cannot show success until status returns a committed `document_id`.

Keep the existing 1 MB JSON ingress unchanged; mount the upload router separately from [`express.json`](</C:/Users/zhant/Desktop/clara-rebuild/packages/runtime/src/index.ts:43>). Reuse the existing runtime pool for short transactions—no third application pool and no connection held during upload, scanning, Storage, or Azure calls.

## Why not A or B?

| Option | Verdict |
|---|---|
| A: direct multipart→Storage | Custody is correct, but the final key cannot contain a **verified** SHA until EOF. Direct streaming therefore requires an illegal temporary object or a trusted client hash. Adding the local spool turns A into the recommended C. |
| B: browser→Supabase | Reject. It bypasses runtime custody and creates an orphan window. Supabase signed upload URLs/TUS bind a path, not the actual full-file SHA; the runtime must still download and verify. |
| C: runtime spool→verified immutable object | Chosen. Resumable browser transport, bounded memory, server-derived key, readback verification, and recoverable crash windows. |

Supabase recommends TUS for files above 6 MB and gives each upload a resumable URL, but its signed-upload contract does not provide S3-style full-object SHA enforcement. Its S3 compatibility matrix explicitly lacks `PutObject` checksum and `Content-MD5` support, unlike AWS S3’s server-validated checksum headers. [`upsert=false` is first-writer-wins](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), not WORM: Supabase has no Object Lock or versioning. [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [AWS checksum behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html).

## Failure modes

| Window | Durable evidence | Recovery |
|---|---|---|
| Browser/network interruption | Intake offset + partial spool | Resume chunks. Host/volume loss degrades to retrying that file only. |
| Crash before final hash | Nonterminal intake | Resume or mark `needs_reupload`; no Storage object exists. |
| Crash during Storage TUS | Intake has SHA/key/upload URL | Resume within TUS lifetime; abandoned uploads expire. |
| Object completes before intake update | Intake already records expected SHA/key | Reconciler finds existing object, downloads and rehashes it, then adopts it. `Already Exists` is never accepted without verification. |
| OCR submission acknowledged, runtime crashes before saving operation ID | Object and intake remain durable | Azure call may be duplicated on retry; bound attempts and meter vendor spend. |
| OCR completes before DB commit | Azure operation ID remains durable | Poll again and retry the same finalization `op_key`. |
| DB commits, step throws | Document, OCR, event and op receipt committed together | Re-drive returns the existing receipt; no second document or event. |
| Document row but object missing | Structurally unreachable through the writer after readback | Indicates credential misuse/admin deletion. Integrity reconciler raises a high-severity incident; never delete the row. |
| Duplicate bytes for the same firm | `UNIQUE(firm_id, sha256)` | Map the intake to the existing document; never overwrite or emit a second ingest event. |

Also inventory Storage objects against document/intake locations periodically. An unexplained object is retained and alerted—not deleted.

## Assignment ruling

Choose **content-addressed, never move**. Client assignment is business metadata; it should not mutate the evidence blob. Supabase `move` requires update authority, removes the source, and is not atomic with Clara’s DB transaction. [Supabase copy/move semantics](https://supabase.com/docs/guides/storage/management/copy-move-objects).

To preserve either future ruling, separate immutable blob identity/location from append-only document assignment history. If move-on-assign wins later: copy to the new valid key, readback-verify the same SHA, switch the DB location pointer transactionally, and retain the old object. Do not call destructive Storage `move`.

## Eight implementation gotchas

1. **No buffering:** never use `multer.memoryStorage`, `req.arrayBuffer()`, or one 100 MB multipart turn. One file/session; stream chunks with backpressure. Browser concurrency 2, runtime ingress 1–2 globally initially, OCR/AV concurrency 1.
2. **Fly is not the limiter:** Fly publishes no general request-body ceiling, but `fly-replay` cannot replay bodies above 1 MB. Explicitly configure/test idle timeout and route admission. The current single machine gets no protection from load balancing. [Fly concurrency](https://fly.io/docs/apps/concurrency/), [dynamic routing limits](https://fly.io/docs/networking/dynamic-request-routing/#requirements-and-limitations).
3. **Treat the volume as disposable:** encrypted-at-rest spool, strict disk quotas and TTL cleanup, snapshots disabled. It is resumability state, never authoritative custody. [Fly Volume guarantees](https://fly.io/docs/volumes/overview/).
4. **Hash twice:** once from the completed spool to derive the key, once from Storage readback. Browser SHA, MIME, filename, ETag and key suffix are untrusted.
5. **Fix the DB privilege boundary:** the current wake writer can submit caller-supplied SHA/path. Slice 5 should add a runtime-only finalizer consuming a verified intake record and revoke the agent-callable raw ingest path; do not edit historical migrations.
6. **Do not use Supabase `service_role` as routine custody authority:** it bypasses RLS. Use a dedicated Storage role/JWT with only private-bucket `INSERT` and required `SELECT`; no `UPDATE` or `DELETE`.
7. **Scan before canonical upload and Azure:** allowlist only required formats, magic-signature validation, reject encrypted PDFs/archives, enforce decompression/page limits, and run a locally controlled scanner subprocess with fresh signatures. Do not send Malaysian accounting PII to public malware services. [OWASP upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).
8. **Never persist large OCR output through WDK step IO:** persist normalized OCR and `boundingRegions` directly inside the step, return references only. Azure v4.0 supports the required regions and comfortably exceeds Clara’s 20 MB cap. [Azure layout model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0).

Public production patterns support this shape: OpenAI stages multipart Uploads before producing a File and exposes asynchronous batch status; Anthropic uses upload-once `file_id` references; Intercom separates upload from later processing. Their public docs do **not** disclose browser transport, so they support reference-first asynchronous ingestion—not direct-to-storage specifically. [OpenAI Uploads](https://developers.openai.com/api/reference/resources/uploads), [Anthropic Files](https://platform.claude.com/docs/en/build-with-claude/files), [Intercom document ingestion](https://www.intercom.com/help/en/articles/8124534-upload-and-manage-documents).