"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders `children` once its spot comes within ~800 px of the viewport, so
 * the signed-out landing ships a below-the-fold section's JS (and its
 * reads) only when a visitor scrolls toward it. The placeholder reserves the
 * section's height so nothing above or around it moves. Without
 * IntersectionObserver it renders at once.
 */
export default function NearViewport({ children, minHeight }: { children: ReactNode; minHeight: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer: show it now
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: "800px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return near ? <>{children}</> : <div ref={holder} aria-busy="true" style={{ minHeight }} />;
}
