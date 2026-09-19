"use client";

// #642 AC1 — THE CONVERSATION'S SCOPE, BESIDE THE COMPOSER.
//
// THE DEFECT. Scope was ABSENT from this screen. `ClaraRail.tsx:113` renders `t("title")`
// ("Clara"), `ClaraFullScreenThread.tsx:53`'s only `<h1>` is the same word, and the ONE
// sentence about scope anywhere on the surface was the NEGATIVE one — the firm-altitude
// note explaining why there is no attach control. So a person about to send an
// instruction that will move a client's books had nothing on screen telling them WHOSE
// books, and the rail is mounted beside every page in the firm.
//
// IT IS READ-ONLY, AND THAT IS A DECISION. The shell's `ScopeSwitcher` owns switching;
// a second switcher here would be two controls for one fact, and the one beside the
// composer would be the one pressed by accident mid-sentence.
//
// IT NEVER GUESSES A NAME. `useClientIdentity()` returns `name: null` unless the stored
// identity is for the SAME client the URL is on (components/app-shell/scope-context.tsx),
// and that rule is preserved verbatim here: an unpublished identity renders the NEUTRAL
// PLACEHOLDER, never the previous client's name. Rendering a stale name beside a composer
// is how an instruction reaches the wrong client's books.
//
// DATA-DRIVEN, so #664 needs no second band. The band takes one descriptor and renders
// what it carries; per-result client attribution (#664's own altitude) arrives as
// `attributions` and drops into the slot below with no structural change here. #642
// builds ONE band and no cross-client attribution — the slot is empty and the type says
// so.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

/** One per-result attribution (#664 fills these; #642 never does). */
export interface ClaraScopeAttribution {
  id: string;
  label: string;
}

export interface ClaraScopeDescriptor {
  /** The firm this conversation's executions belong to. `null` when the mount point
   *  could not read it — the band degrades to the placeholder rather than blocking the
   *  composer, because a person who cannot see the firm's name can still send. */
  firmName: string | null;
  /** The client, when the conversation is pinned to one. `null` at firm altitude AND
   *  when the identity has not been published for THIS client id. */
  clientName: string | null;
  clientId: string | null;
  attributions?: readonly ClaraScopeAttribution[];
}

/**
 * The scope sentence, as a pure function of the descriptor — separated from the
 * component so the four cases can be driven directly and so the copy and the logic
 * cannot drift apart in a conditional inside JSX.
 */
export function claraScopeText(
  scope: ClaraScopeDescriptor,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const firm = scope.firmName ?? t("scope.firmPlaceholder");
  if (scope.clientId === null) return t("scope.atFirm", { firm });
  return t("scope.atClient", { client: scope.clientName ?? t("scope.clientPlaceholder"), firm });
}

export function ClaraScopeBand({
  scope,
  note,
}: {
  scope: ClaraScopeDescriptor;
  /** The firm-altitude attachment note, folded INTO the band instead of sitting as a
   *  loose `<p>` in the composer's grid — two sentences about the same scope, one block. */
  note?: ReactNode;
}) {
  const t = useTranslations("Clara.thread");
  const attributions = scope.attributions ?? [];
  return (
    // `role="group"` + a stable accessible name is what a browser walk can find by ROLE
    // AND NAME rather than by a `data-testid` (#896 left `StateBanner`'s testid broken,
    // and the lesson is that a walk should assert what a screen reader hears anyway).
    // Not a landmark: one region per composer, on a rail mounted beside every page,
    // would clutter the landmark list for the readers who rely on it most.
    <div
      role="group"
      aria-label={t("scope.label")}
      data-slot="clara-scope-band"
      className="flex flex-col gap-1 border-t border-border px-2 pt-2 text-xs text-muted-foreground"
    >
      <p className="truncate font-medium text-foreground">{claraScopeText(scope, t)}</p>
      {note}
      {attributions.length > 0 ? (
        <ul className="flex flex-wrap gap-x-2 gap-y-1">
          {attributions.map((item) => (
            <li key={item.id} className="truncate">{item.label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
