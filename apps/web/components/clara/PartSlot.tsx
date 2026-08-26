// P2 FOLD SEAM A: post-fold re-export. The stand-in this file used to carry (text-only
// + honest "Unsupported part" fallback) is retired now that the real 18(+4)-part
// catalog renderer exists — every call site here already imports `PartSlot` by name.
export { PartRenderer as PartSlot } from "@/components/parts/PartRenderer";
