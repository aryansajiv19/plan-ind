"use client";

import ShareActions from "@/components/ShareActions";
import PrefsCard from "@/components/vote/PrefsCard";
import GatheringHost from "@/components/vote/GatheringHost";
import { avatarStyle, initialsOf } from "@/lib/avatar";
import type { usePlanPreferences } from "@/hooks/use-plan-preferences";
import type { Plan } from "@/lib/types";

/**
 * A plan with no places yet: everyone answers three taps, the host deals.
 * The roster is the people who answered, a lower bound (someone who opened
 * the link and said nothing is invisible), so it counts "N answered" and
 * never "N of M".
 */
export default function Gathering({ plan, voterName, isHost, prefs, onDealt }: {
  plan: Plan;
  voterName: string;
  isHost: boolean;
  prefs: ReturnType<typeof usePlanPreferences>;
  onDealt: () => void;
}) {
  const { rows, failed, save, refetch, userId } = prefs;
  const mine = rows?.find((row) => row.user_id === userId) ?? null;
  const answered = rows?.length ?? 0;
  const share = (
    <div className="vote-alone">
      <p>{isHost ? "Send the link. Friends answer in about ten seconds." : "Know someone who should weigh in? Send them the link."}</p>
      <ShareActions title={plan.title} />
    </div>
  );

  return (
    <main className="vote-experience mx-auto w-full max-w-4xl px-4 py-6 sm:py-10">
      <div className="vote-shell relative border border-line bg-card p-4 sm:p-7">
        <h1 className="text-2xl font-semibold sm:text-3xl">{plan.title}</h1>
        <p className="mt-1 text-sm text-muted">Hey {voterName}. We ask everyone first, then deal places that suit the whole group.</p>

        {isHost && share}

        <div className="mt-5 grid items-start gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {rows === null && !failed ? (
            <p role="status" className="border border-line p-4 text-sm text-muted">Loading answers…</p>
          ) : failed && rows === null ? (
            <div className="grid gap-2 border border-line p-4">
              <p role="alert" className="text-sm font-medium text-punch-text">Couldn’t load the group’s answers.</p>
              <button type="button" className="vote-secondary-action justify-self-start" onClick={() => void refetch()}>Try again</button>
            </div>
          ) : (
            // Keyed on the saved row so editing starts from what is stored, and a refetch never half-edits.
            <PrefsCard key={mine?.updated_at ?? "new"} mine={mine} onSave={save} />
          )}

          <div className="grid gap-5">
            <section aria-labelledby="gather-roster-title">
              <h2 id="gather-roster-title" className="text-lg font-semibold">Who has answered</h2>
              <p role="status" className="mt-1 text-sm text-muted">{rows === null ? " " : answered === 0 ? "No answers yet." : `${answered} answered`}</p>
              {answered > 0 && (
                <ul className="mt-3 grid gap-2" aria-label="People who answered">
                  {rows?.map((row) => (
                    <li key={row.user_id} className="flex min-h-8 items-center gap-2 text-sm">
                      <span aria-hidden="true" style={avatarStyle(row.voter_name)} className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium">{initialsOf(row.voter_name)}</span>
                      <span>{row.voter_name}{row.user_id === userId && <span className="text-muted"> (you)</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isHost
              ? <GatheringHost planId={plan.id} answered={answered} mine={mine} onDealt={onDealt} />
              : <p className="text-sm text-muted">The host deals the places once enough of you have answered.</p>}
          </div>
        </div>

        {!isHost && share}
      </div>
    </main>
  );
}
