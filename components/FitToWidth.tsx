"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Shows a fixed-width document (an A4 invoice laid out at `width` px) scaled down to fit its container, like a PDF
 * viewer's "fit to width" — never wider than the space, so no sideways scrolling. Never scaled up. Printing is
 * unaffected: the zoom is dropped for print, so the document prints at its real size.
 */
export function FitToWidth({ width, children }: { width: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / width));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={box} className="w-full">
      {/* zoom (unlike transform) also shrinks the space the document takes, so there is no gap under it */}
      <div style={{ width, "--fit": scale } as CSSProperties} className="[zoom:var(--fit)] print:w-auto! print:[zoom:1]!">
        {children}
      </div>
    </div>
  );
}
