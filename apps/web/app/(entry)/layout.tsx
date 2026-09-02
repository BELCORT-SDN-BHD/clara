import type { ReactNode } from "react";

import { BrandLockup } from "@/components/entry/brand-lockup";

/**
 * THE (entry) ROUTE GROUP — the pre-firm faces a person meets before they are
 * inside a firm, including sign-in, signup, invitation, confirmation, password
 * recovery and the holding state.
 *
 * WHY A GROUP AND NOT A PATH SEGMENT. A Next.js route group contributes NO URL
 * segment, so /login and /invite/:token keep byte-identical URLs across P4-3's
 * move — `tests/firm-scope-surfaces.test.ts` asserts exactly that, by resolving
 * the URL each leaf answers on rather than by taking this comment's word for it.
 * Nothing that links to /login, no invite email already in someone's inbox, and
 * no `?next=` value `lib/supabase/proxy.ts` writes had to change.
 *
 * THIS LAYOUT DOES NOT CALL `requireFirmScope()`, AND MUST NOT (P4-2's spine,
 * `lib/require-firm-scope.ts`). Four of the five faces can run with NO session at
 * all, and the fifth — /pending — is the holding state for a session that has a
 * user but no firm: gating it on firm scope would redirect it to itself forever.
 * The registry in `lib/require-firm-scope.ts` names each of these leaves and its
 * reason, and the census suite reds if one of them ever starts calling the spine.
 *
 * 裁-2 4a — THE TREATMENT (`docs/plan/active/mohe-grill-rulings-2026-08-28.md`,
 * approved live against real token values): a white card on the identity canvas,
 * **card edge by shadow, decorative border only**. That last clause is a
 * constraint, not a flourish: a new meaning-bearing border would be a component
 * boundary under WCAG 1.4.11 and would have to clear 3:1 on cream, which
 * `--border` does not (annex 1 §C.3 measured it at 1.195). The edge here is
 * `shadow-lg` plus `Card`'s own `ring-1 ring-foreground/10` hairline — both
 * decorative, neither identifying, so neither faces the contrast gate.
 *
 * The shadow is applied HERE, to the card slot, rather than in each of the five
 * faces: `LoginForm` and `InviteAcceptForm` are P2/P4-1's files and this train
 * only MOVES their routes. Reaching into them to add a class would be this train
 * editing another lane's component to achieve a layout effect that belongs to the
 * layout.
 */
export default function EntryLayout({ children }: { children: ReactNode }) {
  return (
    <main
      className={[
        "flex min-h-dvh flex-col items-center justify-center gap-6 bg-identity-canvas p-6",
        // The 裁-2 4a card edge, applied to every `Card` any of the five faces
        // renders — `data-slot="card"` is components/ui/card.tsx's own marker.
        "[&_[data-slot=card]]:shadow-lg",
      ].join(" ")}
    >
      <BrandLockup />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
