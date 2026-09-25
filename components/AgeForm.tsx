"use client";

import { useActionState } from "react";
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

export default function AgeForm({ next }: { next: string }) {
  const [state, action] = useActionState(saveBirthDate, { error: "" });
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />
      <div className="auth-fields">
        <div>
          <label htmlFor="onboarding-dateOfBirth">Date of birth</label>
          <input
            id="onboarding-dateOfBirth"
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            required
            autoFocus
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
