import type { ReactNode } from "react";

// A section that leads with its point and keeps the detail one tap away:
// native <details>, so keyboard, screen readers and the open state come free.
// The heading stays a real heading inside the summary.
export default function Fold({ heading, hint, children }: { heading: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <details className="fold">
      <summary>
        {heading}
        {hint && <span className="fold__hint">{hint}</span>}
      </summary>
      {children}
    </details>
  );
}
