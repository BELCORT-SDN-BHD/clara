"use client";

// A minimal fixed-height windowing list (DIRECTION List model — virtualization). No
// new dependency: a scroll viewport with a full-height spacer renders only the rows
// in the visible window plus an overscan margin, absolutely positioned by index. The
// queue flattens its sections + rows into ONE uniform-height item stream so headers
// and rows window together. Keyset pagination keeps each page bounded; this keeps the
// DOM bounded when many pages have accumulated.

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./queue.module.css";

export const QUEUE_ROW_HEIGHT = 54;

export function VirtualList<T>({
  items,
  rowHeight = QUEUE_ROW_HEIGHT,
  overscan = 6,
  render,
}: {
  items: T[];
  rowHeight?: number;
  overscan?: number;
  render: (item: T, index: number) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (el) setViewportH(el.clientHeight || 600);
  }, []);

  const total = items.length * rowHeight;
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const windowCount = Math.ceil(viewportH / rowHeight) + overscan * 2;
  const last = Math.min(items.length, first + windowCount);
  const slice = items.slice(first, last);

  return (
    <div ref={ref} className={styles.viewport} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      <div className={styles.spacer} style={{ height: total }}>
        {slice.map((item, i) => {
          const index = first + i;
          return (
            <div key={index} style={{ position: "absolute", top: index * rowHeight, left: 0, right: 0, height: rowHeight, boxSizing: "border-box", padding: "0.15rem" }}>
              {render(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
