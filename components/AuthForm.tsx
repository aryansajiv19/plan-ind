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
      className="auth-submit"
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

  // Date of birth is NOT collected here. It used to be a required field on
  // this screen, which meant a returning user had to retype their birthday
  // every time they signed in — and it is stored write-once, so the retyped
  // value was discarded anyway. /onboarding collects it once, and /home
  // redirects there while it is missing.
  return (
    <div className="auth-form">
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="auth-google"
        >
          <span aria-hidden className="auth-google__icon">
            G
          </span>
          Continue with Google
        </button>
      </form>

      <div className="auth-divider">
        <span />
        or use email
        <span />
      </div>

      {isCodeStep ? (
        <form action={verifyAction} className="auth-fields" id="email-auth">
          <input type="hidden" name="email" value={requestState.email} />
          <div>
            <label htmlFor="token">
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
              className="auth-input auth-input--code"
            />
          </div>
          <p className="auth-message">{requestState.message}</p>
          <SubmitButton idle="Verify and continue" pending="Checking code…" />
          <a href="/login" className="auth-link">
            Use a different email
          </a>
        </form>
      ) : (
        <form action={requestAction} className="auth-fields" id="email-auth">
          <div>
            <label htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="auth-input"
            />
          </div>
          <SubmitButton idle="Email me a code" pending="Sending code…" />
        </form>
      )}

      {(activeError || pageError) && (
        <p role="alert" className="auth-error">
          {activeError ?? "Sign-in did not finish. Please try again."}
        </p>
      )}

      <p className="auth-footnote">
        By continuing, you agree to keep things friendly. No password to remember.
      </p>
    </div>
  );
}
