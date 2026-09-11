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
// WHY IT IS BOUNDED (native review, N9). The first cut rendered one paragraph and one link PER
// spoken-for document. That list is the client's whole filing history, and on a client a year in
// most documents ARE posted — so the "advisory note" grew into hundreds of paragraphs under a
// chooser. What a person actually needs is two different things at two different moments:
//   * WHILE BROWSING: why an option is greyed out. That belongs ON the option (each picker appends
//     the reason to its own label — bounded by the option list, which exists anyway) plus ONE line
//     here saying how many are unavailable. A native `<option disabled>` is announced as
//     unselectable by itself, and the label text carries the reason, so C08.6 holds without colour.
//   * WHEN THEIR OWN CHOICE IS THE CONFLICTED ONE: where the document went. THAT is the actionable
//     case and the only one that earns a link — it is reachable (a restored composer draft whose
//     document has since been posted keeps its `documentId` while the option turns disabled), and
//     it is at most one paragraph because a select holds one value.
//
// NEVER A HIDDEN OPTION. The picker keeps rendering the document; hiding it would be a claim this
// advisory read cannot make with the door's own force (see `mergeSpokenFor`'s note).

import Link from "next/link";
import { useTranslations } from "next-intl";

import { journalEntryHref } from "@/lib/navigation/tree";
import type { EvidenceOption } from "@/lib/work/evidence";

export function SpokenForNotes({
  clientId,
  options,
  selectedDocumentId,
}: {
  /** The client whose picker is asking — the comparison that decides which sentence is true. */
  clientId: string;
  options: readonly EvidenceOption[];
  /** The picker's current value, or "". Only this document's own reason is spelled out. */
  selectedDocumentId: string;
}) {
  const t = useTranslations("ManualJournal");
  const tWalk = useTranslations("WalkFindings728");

  const spokenFor = options.filter((doc) => doc.spokenFor !== null);
  if (spokenFor.length === 0) return null;
  const selected = spokenFor.find((doc) => doc.documentId === selectedDocumentId) ?? null;

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {tWalk("evidenceSpokenForSummary", { count: spokenFor.length })}
      </p>
      {selected === null ? null : (
        <p className="text-xs text-muted-foreground">
          {selected.spokenFor!.clientId === clientId
            ? tWalk("evidenceSpokenFor", { name: selected.filename ?? t("evidence.unnamed") })
            : tWalk("evidenceSpokenForElsewhere", {
                name: selected.filename ?? t("evidence.unnamed"),
                // The door joins the claimant's own name in (0183, arm 4) so this needs no second
                // read; the fallback exists because the wire type admits a null, and a surface
                // printing "undefined" would be worse than a vaguer true sentence.
                client: selected.spokenFor!.clientName ?? tWalk("evidenceSpokenForUnnamedClient"),
              })}{" "}
          <Link
            // THE CLAIMANT'S ROUTE, not the asking client's: the entry lives in the client that
            // posted it, and `/clients/<other>/journals?entry=<id>` would show a journal the entry
            // is not in. Review round (Codex, 2026-09-11) — the first cut linked to the asking
            // client unconditionally, which was right only while the read was client-scoped.
            href={journalEntryHref(selected.spokenFor!.clientId, selected.spokenFor!.entryId)}
            // UNCONDITIONAL underline, not hover:underline — this link sits INLINE inside a
            // sentence of plain text (axe's link-in-text-block rule), so a colour cue alone
            // (text-primary at 1.33:1 against text-muted-foreground, measured) is not enough at
            // rest.
            className="text-primary underline underline-offset-4"
          >
            {tWalk("evidenceSpokenForLink")}
          </Link>
        </p>
      )}
    </>
  );
}
