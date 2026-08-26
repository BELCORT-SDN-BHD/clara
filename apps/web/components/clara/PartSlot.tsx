// The part-rendering seam (P2-RAIL, build order item 5). The sibling `p2-parts` lane
// builds the real 18(+4)-part catalog renderer in parallel
// (docs/plan/active/mohe-grill-rulings-2026-08-27.md Q8) at `components/parts/
// PartRenderer` — importing it directly was tried first (per the work order: "import
// PartRenderer from '@/components/parts/PartRenderer' IF present") but that module
// does not exist in this worktree yet, so this file is the fallback: text parts render
// plainly, every other kind renders an honest "Unsupported part" label rather than
// guessing at a shape this lane has no evidence for (law 2).
//
// TODO-SWAP AT MERGE: once `@/components/parts/PartRenderer` lands, replace this
// file's body with `export { PartRenderer as PartSlot } from "@/components/parts/PartRenderer";`
// — every call site here already imports `PartSlot` by name, so that is the one edit
// the merge needs.

import { useTranslations } from "next-intl";

import type { ClaraPartLike } from "@/lib/clara/api";

export function PartSlot({ part }: { part: ClaraPartLike }) {
  const t = useTranslations("Clara.part");

  if (part.type === "text" && typeof part.text === "string") {
    return <p className="whitespace-pre-wrap text-sm text-foreground">{part.text}</p>;
  }

  return <p className="text-sm text-muted-foreground italic">{t("unsupported", { kind: part.type })}</p>;
}
