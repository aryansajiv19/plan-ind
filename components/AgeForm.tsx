"use client";

import { useActionState, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useFormStatus } from "react-dom";
import { saveBirthDate } from "@/app/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="auth-submit">
      {pending ? "Saving…" : "Continue"}
    </button>
  );
}

// P14: the name friends see, saved from here before the birthday action runs
// (that action belongs to the auth lane). .select().single() because an RLS
// refusal updates 0 rows with no error.
async function saveDisplayName(name: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "Sign in again to save your name.";
  await supabase.rpc("ensure_authenticated_profile", { p_display_name: name });
  const { error } = await supabase.from("people").update({ display_name: name }).eq("id", user.id).select("display_name").single();
  if (!error) return null;
  return error.code === "23514" ? "That name can’t be used. Use letters, numbers or emoji, up to 40 characters." : "Couldn’t save your name. Try again.";
}

export default function AgeForm({ next, suggestedName = "" }: { next: string; suggestedName?: string }) {
  const [state, action] = useActionState(saveBirthDate, { error: "" });
  const [name, setName] = useState(suggestedName);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameSaved = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Save the name first, then let the form submit to the birthday action.
  async function saveNameFirst(event: React.FormEvent<HTMLFormElement>) {
    if (nameSaved.current || !name.trim()) return;
    event.preventDefault();
    const failure = await saveDisplayName(name.trim());
    setNameError(failure);
    if (failure) return;
    nameSaved.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={action} onSubmit={saveNameFirst} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <div className="auth-fields">
        <div>
          <label htmlFor="onboarding-displayName">What should friends call you?</label>
          <input
            id="onboarding-displayName"
            value={name}
            onChange={(event) => { setName(event.target.value); nameSaved.current = false; }}
            maxLength={40}
            autoComplete="nickname"
            autoFocus
            className="auth-input"
          />
          {nameError && <p role="alert" className="auth-error">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="onboarding-dateOfBirth">Date of birth</label>
          <input
            id="onboarding-dateOfBirth"
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            required
            className="auth-input"
          />
        </div>
        <Submit />
      </div>
      <p className="auth-footnote">
        Kept private and never shown on your profile. Enter it carefully: you can
        correct it once from Settings, and a correction that makes you older needs
        a quick check by a person.
      </p>
      {state?.error && <p role="alert" className="auth-error">{state.error}</p>}
    </form>
  );
}
