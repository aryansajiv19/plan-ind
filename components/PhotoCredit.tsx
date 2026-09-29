/**
 * The attribution line Google's terms require beside a Google Places photo:
 * the author's name, tiny, bottom-left, no "©" (owner, 2026-09-29). Our own
 * photos carry no mark on the image at all; their licence credits live on
 * /credits (CC BY allows credit "in any reasonable manner").
 */
export function CreditMark({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`photo-attrib ${className}`.trim()} aria-label={`Photo: ${text}`}>
      {text}
    </span>
  );
}
