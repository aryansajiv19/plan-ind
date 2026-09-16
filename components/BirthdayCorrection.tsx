"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

type Outcome =
  | { kind: "done"; message: string }
  | { kind: "support"; message: string }
  | { kind: "retry"; message: string };

/**
 * Fix a wrong date of birth (migration 059). Date of birth stays write-once;
 * this allows ONE correction per account, and a correction that would make
 * someone older past an age gate goes to a person instead of the app.
 *
 * The one-time limit is stated before submitting, so nobody spends their
 * only correction on a second typo. member_ages isn't readable by the client,
 * so whether it's already been used is only known from the answer.
 */
export default function BirthdayCorrection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    setPending(true);
    setOutcome(null);
    const { data, error } = await getSupabase().rpc("correct_birth_date", { p_date_of_birth: date });
    setPending(false);
    const result = (data as { result?: string } | null)?.result;
    if (error) {
      setOutcome({ kind: "retry", message: error.code === "42501" ? "Sign in again to change your birthday." : "That didn’t save. Try again." });
      return;
    }
    switch (result) {
      case "corrected":
        setOutcome({ kind: "done", message: "Your birthday is updated. That was your one correction." });
        // Age-gated suggestions depend on it; re-read with the new age.
        router.refresh();
        return;
      case "already_corrected":
        setOutcome({ kind: "support", message: "You’ve already used your one correction." });
        return;
      case "crosses_age_gate":
        setOutcome({ kind: "support", message: "A change that makes you older needs a quick check by a person, so it can’t be done here." });
        return;
      case "not_on_file":
        setOutcome({ kind: "retry", message: "We don’t have a birthday for you yet." });
        return;
      case "invalid_date":
        setOutcome({ kind: "retry", message: "Enter your real date of birth. You need to be at least 13." });
        return;
      case "no_change":
        setOutcome({ kind: "retry", message: "That’s already the date we have, so nothing changed." });
        return;
      default:
        setOutcome({ kind: "retry", message: "That didn’t save. Try again." });
    }
  }

  // Final answers replace the form: there's nothing left to submit.
  if (outcome && outcome.kind !== "retry") {
    return (
      <section className="birthday-fix" aria-labelledby="birthday-fix-title">
        <h2 id="birthday-fix-title">Your birthday</h2>
        <p role="status">{outcome.message}</p>
        {outcome.kind === "support" && (
          <p>Still wrong? Contact us using the email on our <Link href="/privacy">Privacy page</Link> and we’ll fix it.</p>
        )}
      </section>
    );
  }

  return (
    <section className="birthday-fix" aria-labelledby="birthday-fix-title">
      <h2 id="birthday-fix-title">Your birthday</h2>
      {!open ? (
        <>
          <p>Used to leave out places the group can’t get into.</p>
          <button type="button" onClick={() => setOpen(true)}>Fix a wrong birthday</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="birthday-fix__limit">
            <strong>You can correct this once.</strong> Check the date carefully before saving.
            Making yourself older may need a quick check by a person.
          </p>
          <label htmlFor="birthday-fix-date">Correct date of birth</label>
          <div>
            <input id="birthday-fix-date" type="date" max={today} value={date} onChange={(event) => { setDate(event.target.value); setOutcome(null); }} />
            <button type="submit" disabled={!date || pending}>{pending ? "Saving…" : "Save correction"}</button>
            <button type="button" className="birthday-fix__cancel" disabled={pending} onClick={() => { setOpen(false); setDate(""); setOutcome(null); }}>Cancel</button>
          </div>
          {outcome && (
            <p role="alert" className="birthday-fix__error">
              {outcome.message}
              {outcome.message.startsWith("We don’t have") && <> <Link href="/onboarding">Add your birthday</Link>.</>}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
