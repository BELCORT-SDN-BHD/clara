// #728 finding 5, review round — THE ONE NOTE BOTH EVIDENCE PICKERS RENDER.
//
// WHY IT IS A SHARED COMPONENT AND NOT TWO COPIES. `clara.list_spoken_for_documents` (migration
// 0183) answers at the FIRM's scope, because the invariant it reports is the firm's: one document
// backs at most one live posted entry firm-wide, while `uq_document_filing_active` lets that same
// document be actively filed to two clients at once (0007:93). So the claimant named in a row may
// be a SIBLING client — and the sentence, and the link's destination, both change with that. Two
// copies of that branch in two components is two chances for one of them to keep sending a person
// to the wrong client's Journals route.
//
// NEVER A HIDDEN OPTION. The picker keeps rendering the document (disabled); this is the reason
// beside the select, where an `<option>` has no room for either the sentence or the link. C08.6:
// the disabling is announced by the native `<option disabled>` itself, never by colour alone, and
// this note is the readable half of it.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { journalEntryHref } from "@/lib/navigation/tree";
import type { EvidenceOption } from "@/lib/work/evidence";

export function SpokenForNotes({
  clientId,
  options,
}: {
  /** The client whose picker is asking — the comparison that decides which sentence is true. */
  clientId: string;
  options: readonly EvidenceOption[];
}) {
  const t = useTranslations("ManualJournal");
  const tWalk = useTranslations("WalkFindings728");

  return (
    <>
      {options
        .filter((doc) => doc.spokenFor !== null)
        .map((doc) => {
          const spokenFor = doc.spokenFor!;
          const name = doc.filename ?? t("evidence.unnamed");
          return (
            <p key={doc.documentId} className="text-xs text-muted-foreground">
              {spokenFor.clientId === clientId
                ? tWalk("evidenceSpokenFor", { name })
                : tWalk("evidenceSpokenForElsewhere", {
                    name,
                    // The door joins the claimant's own name in (0183, arm 4) so this needs no
                    // second read; the fallback exists because the wire type admits a null and a
                    // surface that printed "undefined" would be worse than a vaguer true sentence.
                    client: spokenFor.clientName ?? tWalk("evidenceSpokenForUnnamedClient"),
                  })}{" "}
              <Link
                // THE CLAIMANT'S ROUTE, not the asking client's: the entry lives in the client
                // that posted it, and `/clients/<other>/journals?entry=<id>` would show a journal
                // the entry is not in. Review round (Codex, 2026-09-11) — the first cut linked to
                // the asking client unconditionally, which was right only while the read was
                // client-scoped.
                href={journalEntryHref(spokenFor.clientId, spokenFor.entryId)}
                // UNCONDITIONAL underline, not hover:underline — this link sits INLINE inside a
                // sentence of plain text (axe's link-in-text-block rule), so a colour cue alone
                // (text-primary at 1.33:1 against text-muted-foreground, measured) is not enough
                // at rest.
                className="text-primary underline underline-offset-4"
              >
                {tWalk("evidenceSpokenForLink")}
              </Link>
            </p>
          );
        })}
    </>
  );
}
