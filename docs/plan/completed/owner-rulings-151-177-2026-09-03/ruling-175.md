# 裁-175 — OD-24 (new, from the P6-X classification): the XML blob-open exposure in `apps/web` is a KNOWN-ISSUES row, fixed AFTER beta live. (Owner ruled AGAINST "fix the minimal version before beta".)

**Ruled 2026-09-03 ≈21:40 MYT (shell clock; owner, AskUserQuestion), verbatim:** 「先記 Known issue，beta 後修」.

**The finding (classify-3, measured at `9d5d844e`):** `apps/web/lib/documents/bytes.ts:24` admits
`application/xml`; `fetchDocumentBytes` wraps the bytes in a `blob:` URL (`:59`);
`lib/documents/open-in-new-tab.ts` navigates a new tab to it; `components/documents/document-metadata.tsx:71`
calls it with no MIME gate; no `Content-Security-Policy` / `script-src` anywhere in `apps/web`. A `blob:`
URL inherits the creating page's origin, so an XML carrying an inline `<?xml-stylesheet?>` executes in
`apps/web`'s origin under the opening user's session. MyInvois e-invoices are XML — an uploadable artifact.

**Recommendation declined (dissent filed):** a minimal `apps/web` PR before beta (a MIME allowlist for
open-in-new-tab — PDF + images; XML served as an attachment or the structured view only), CSP to Backlog.
Consequence stated once: during beta, any malicious XML a firm member opens through "open in new tab"
runs in the app's origin as that member.

**The sharpened record (the owner's choice, made explicit):**
1. `PROGRESS.md` Known-issues row (owner · next step · ruling): "XML documents open as `blob:` in a
   new tab with no MIME gate and no CSP — an XSS-class exposure to a firm member who opens a crafted
   XML; fix = MIME allowlist on `open-in-new-tab` + XML as attachment/structured view; CSP as its own
   row; first post-beta code item" — 裁-175.
2. The Wave-G product walk (item 2) records the exposure beside the document-open line; the walk does
   NOT open an XML through the new-tab door (a walk must not exercise a known hole).
3. The launch-sitting record lists it among the knowingly-open items read aloud (裁-171).
4. No code change tonight; #540 is unaffected.

**Record.** Ledger `-09-03` (with the dissent line) + digest row; the PROGRESS row at the final truing.
