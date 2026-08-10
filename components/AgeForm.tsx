"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveBirthDate } from "@/app/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="token min-h-12 w-full rounded-2xl border-2 border-ink bg-grape px-5 py-3 font-bold text-white disabled:opacity-60">{pending ? "Saving…" : "Continue"}</button>;
}

export default function AgeForm() {
  const [state, action] = useActionState(saveBirthDate, { error: "" });
  return (
    <form action={action} className="token rounded-[28px] border-2 border-ink bg-card p-5 sm:p-6">
      <label htmlFor="onboarding-dateOfBirth" className="mb-2 block text-sm font-bold">Date of birth</label>
      <input id="onboarding-dateOfBirth" name="dateOfBirth" type="date" max={new Date().toISOString().slice(0, 10)} required className="min-h-12 w-full rounded-2xl border-2 border-ink bg-paper px-4 text-base" />
      <Submit />
      {state?.error && <p role="alert" className="mt-4 rounded-xl bg-punch/10 px-4 py-3 text-sm font-bold text-punch">{state.error}</p>}
    </form>
  );
}
