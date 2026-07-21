// The region-polygon highlight (PIN-ADD-2 / contract §5 / WA-R8). A pure
// presentational SVG that fills its positioned parent (the image box) and draws the
// cited region as a normalized 0..1 polygon. `preserveAspectRatio="none"` maps the
// unit square linearly onto the same box the image occupies, so normalized points
// land on the image; `vector-effect: non-scaling-stroke` keeps the outline crisp.

import { polygonPointsAttr, type Pt } from "./regionGeometry";
import styles from "./cards.module.css";

export function RegionOverlay({ points }: { points: Pt[] }) {
  if (points.length < 3) return null;
  return (
    <svg className={styles.regionOverlaySvg} viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden focusable="false">
      <polygon className={styles.regionPolygon} points={polygonPointsAttr(points)} />
    </svg>
  );
}
