"use client";

import { useClientIdentity } from "@/components/app-shell/scope-context";
import { ClientNeedsYou } from "@/components/firm/client-home/client-needs-you";
import { useReviewQueue } from "@/lib/firm/use-review-queue";

/**
 * This client's slice of the review queue, for `/clients/:id/work`.
 *
 * IT OWNS THE HOOK AND NOTHING ELSE. `ClientNeedsYou` (the client workspace
 * home's section C) already renders the queue properly: counts from the
 * envelope rather than `rows.length`, the section-banner-versus-row-attachment
 * rule for a refusal, `NeedsYouRow` with its deep link and its inline act, and
 * the load-more control. Copying any of that here would be a second rendering of
 * one queue, which is the exact defect 裁-190 closed when the client tab rendered
 * bare `<li>` text beside the firm inbox's real rows.
 *
 * WHAT IT OWNS is the READ. `ClientNeedsYou` takes the queue as a prop because
 * the workspace home already holds one envelope and a second `useReviewQueue`
 * there would be a second RPC for data the page has. This page has no such
 * envelope, so it makes the one call.
 *
 * THE NAME COMES FROM THE SHELL'S STORE, not a second `loadClientById`. The
 * client layout above has already read the client record; `useClientIdentity`
 * reads what it published, and returns null — never another client's name —
 * while that is still in flight. `NeedsYouRow` then falls back to the short id,
 * which is its own documented contract.
 */
export function ClientWorkQueue({ clientId }: { clientId: string }) {
  const queue = useReviewQueue({ client_id: clientId });
  const { name } = useClientIdentity();
  return <ClientNeedsYou queue={queue} clientName={name} />;
}
