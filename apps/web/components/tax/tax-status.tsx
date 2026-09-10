// The screen-reader status labelling this ticket (#627) adds on top of the house state
// idiom (components/common/state.tsx's EmptyState / components/common/not-built-note.tsx's
// NotBuiltNote), WITHOUT editing either — both are shared across the whole product and
// this ticket owns only the tax/compliance surfaces (AGENTS.md's harness menu).
//
// THE GAP THIS CLOSES. Every OTHER state on the Tax tab already gets a distinct
// role + accessible name for free: StateBanner sets role="alert"/"status" per tone and
// each tone's text differs (loading's own sentence, the stale-evaluator warning, the
// no_session/forbidden/generic copy ErrorMessage renders). `EmptyState` and `NotBuiltNote`
// are the two that render as a bare, role-less block — a "successful, no data" read and a
// "this capability is not enabled" note were BOTH invisible to a screen reader's status
// announcements before this file, indistinguishable from ordinary paragraph text on the
// page. `TaxStatusRegion` gives either one `role="status"`, so it is announced, and
// announced as its OWN region — the accessible name comes from its content, which already
// differs per state (the same content-derived-name mechanism `StateBanner` already relies
// on), so no new copy is invented purely to be read aloud.

import type { ReactNode } from "react";

export function TaxStatusRegion({ children }: { children: ReactNode }) {
  return <div role="status">{children}</div>;
}
