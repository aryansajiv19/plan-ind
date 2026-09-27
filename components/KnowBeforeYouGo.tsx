import { sourceHost, venueFacts } from "@/lib/venue-facts";

// P20: the facts people otherwise text a friend for. Renders nothing when the
// catalogue holds none, and never a row for an unknown.
export default function KnowBeforeYouGo({ spot, className = "" }: { spot: Parameters<typeof venueFacts>[0]; className?: string }) {
  const { rows, checked } = venueFacts(spot);
  if (rows.length === 0) return null;
  return (
    <section className={className} aria-labelledby="know-before-you-go">
      <p id="know-before-you-go" className="text-xs font-bold uppercase tracking-wide text-muted">Know before you go</p>
      <dl className="mt-2 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-[8rem_1fr] sm:gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-0.5 sm:contents">
            <dt className="text-muted">{row.label}</dt>
            <dd className="min-w-0 break-words">
              {row.href ? <a href={row.href} className="underline" {...(row.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{row.value}</a> : row.value}
              {row.source && (
                <a href={row.source} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-muted underline">
                  {sourceHost(row.source)}
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {checked && <p className="mt-2 text-xs text-muted">{checked}</p>}
    </section>
  );
}

