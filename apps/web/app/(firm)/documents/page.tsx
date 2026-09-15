import { UnassignedSources } from "@/components/firm/documents/unassigned-sources";

/**
 * "/documents" — THE FIRM'S UNASSIGNED SOURCES (#633 AC5).
 *
 * Firm-altitude material (an SSM form, an identity document, a bank statement that
 * arrived before anyone decided whose it is) had nowhere to live: `apps/web/app` held
 * only `(firm)/clients/[clientId]/documents`, and the Clara composer deliberately
 * hides Attach outside a client with a sentence explaining why
 * (`ClaraThreadView.tsx:575-591`). That refusal was honest and stays exactly as it is
 * — this leaf is the destination it was pointing at.
 *
 * SCOPE: ancestor-covered. `app/(firm)/layout.tsx` is a registered entrance
 * (`SCOPE_ENTRANCES`), and `firm-scope-surfaces.test.ts`'s `classify()` treats a PAGE
 * leaf under an entrance layout's directory as covered, so this file needs no
 * `SCOPE_ENTRANCES` row of its own. It is a single `page.tsx` with NO colocated
 * module beside it and no inline `"use server"`, so WALL 1 and WALL 2 of
 * `firm-scope-fourth-entrance.test.ts` need no roster entry either — the component
 * lives under `components/firm/documents/` where it belongs.
 *
 * THE NAV FLOOR IS MEASURED, not chosen: on the #633 rig a viewer persona reads
 * `clara.list_unassigned_documents(50)` (SECURITY INVOKER, so its floor is whatever
 * RLS admits), while the attribution act's own door refuses a viewer CLR04. The
 * registry row is therefore `viewer`, and the act's higher floor arrives as the DB's
 * refusal on the row that asked for it rather than as an empty page.
 */
export default function FirmDocumentsPage() {
  return <UnassignedSources />;
}
