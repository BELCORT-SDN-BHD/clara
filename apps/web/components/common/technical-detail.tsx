"use client";

// CB-AE2E-022 — the ONE place an internal identifier is allowed to reach a
// human, and the shape it takes when it does.
//
// THE DEFECT. Five governed-door dialogs wrote the DB function's name into the
// SENTENCE a professional reads before confirming an act:
//
//   "Abandons the draft entirely (clara.withdraw_draft) — distinct from …"
//   "Re-queues this document … (clara.request_reextraction). A reason is …"
//   "Marks this document as … (clara.classify_consent_evidence_document). …"
//   "Asks Clara to draft a journal entry from this filing
//    (clara.request_autodraft) — a one-click admission; …"
//   "A manual entry — recorded via record_client_resolution + draft_entry, the
//    DB's own manual-compose ceremony."
//
// A bookkeeper about to approve something does not read `clara.request_
// reextraction` as reassurance; they read it as a sentence that broke, in the
// middle of the one moment the product most needs to be understood.
//
// THE AUDIT TRAIL IS NOT THE PROBLEM, THE PLACEMENT IS. Naming the exact verb
// an act performs is genuinely useful — to a reviewer reconciling a receipt, to
// support reading a screenshot, to the owner auditing what a door really did.
// So the verb is not deleted; it MOVES, into a collapsed disclosure under the
// description. The prose says what the act does and what it needs; the
// disclosure says what it calls.
//
// WHY ONE SHARED COMPONENT rather than a <details> per dialog: the shape has to
// be identical everywhere or it stops being recognisable as "the technical
// bit", and every future door inherits it for free. It is deliberately NOT the
// `StateBanner` `code` chip (state.tsx:85-108) — that chip is a governed
// REFUSAL's own code, rendered verbatim because the DB just said it, and
// conflating "here is what this button calls" with "here is what the DB
// refused" would make both meaningless.

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function TechnicalDetail({ children, className }: { children: string; className?: string }) {
  const t = useTranslations("Common");
  return (
    <details className={cn("text-xs text-muted-foreground", className)}>
      <summary className="cursor-pointer select-none">{t("technicalDetail")}</summary>
      {/* `wrap-anywhere`, for the reason not-built-note.tsx:29-35 measured:
          these strings are unbreakable 30-55 character identifiers, and
          `break-words` does NOT shrink a flex item whose min-content size is
          the unbreakable word — only `anywhere` does. A dialog is the narrowest
          container in the app, so this is where it bites first. */}
      <code className="mt-1 block wrap-anywhere font-mono">{children}</code>
    </details>
  );
}
