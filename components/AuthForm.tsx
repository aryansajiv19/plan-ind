"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestEmailCode,
  signInWithGoogle,
  verifyEmailCode,
  type AuthFormState,
} from "@/app/auth/actions";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      disabled={status.pending}
      className="token min-h-12 w-full rounded-2xl border-2 border-ink bg-grape px-5 py-3 font-bold text-white disabled:cursor-wait disabled:opacity-60"
    >
      {status.pending ? pending : idle}
    </button>
  );
}

export default function AuthForm({ pageError }: { pageError?: string }) {
  const [requestState, requestAction] = useActionState(
    requestEmailCode,
    INITIAL_STATE,
  );
  const [verifyState, verifyAction] = useActionState(
    verifyEmailCode,
    INITIAL_STATE,
  );
  const isCodeStep = requestState.sent;
  const activeError = verifyState.error ?? requestState.error;

  return (
    <div className="token rounded-[28px] border-2 border-ink bg-card p-5 sm:p-6">
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border-2 border-ink bg-white px-5 py-3 font-bold transition-colors hover:bg-paper"
        >
          <span aria-hidden className="grid size-7 place-items-center rounded-full bg-ink text-sm text-white">
            G
          </span>
          Continue with Google
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.14em] text-muted">
        <span className="h-px flex-1 bg-line" />
        or use email
        <span className="h-px flex-1 bg-line" />
      </div>

      {isCodeStep ? (
        <form action={verifyAction} className="space-y-4">
          <input type="hidden" name="email" value={requestState.email} />
          <div>
            <label htmlFor="token" className="mb-2 block text-sm font-bold">
              Six-digit code
            </label>
            <input
              id="token"
              name="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              placeholder="000000"
              className="min-h-14 w-full rounded-2xl border-2 border-ink bg-paper px-4 text-center font-display text-2xl font-extrabold tracking-[0.35em]"
            />
          </div>
          <p className="text-sm text-muted">{requestState.message}</p>
          <SubmitButton idle="Verify and continue" pending="Checking code…" />
          <a href="/login" className="block text-center text-sm font-bold text-grape underline">
            Use a different email
          </a>
        </form>
      ) : (
        <form action={requestAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-bold">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="min-h-12 w-full rounded-2xl border-2 border-ink bg-paper px-4 text-base"
            />
          </div>
          <SubmitButton idle="Email me a code" pending="Sending code…" />
        </form>
      )}

      {(activeError || pageError) && (
        <p role="alert" className="mt-4 rounded-xl bg-punch/10 px-4 py-3 text-sm font-bold text-punch">
          {activeError ?? "Sign-in did not finish. Please try again."}
        </p>
      )}

      <p className="mt-5 text-center text-xs leading-relaxed text-muted">
        By continuing, you agree to keep things friendly. No password to remember.
      </p>
    </div>
  );
}
