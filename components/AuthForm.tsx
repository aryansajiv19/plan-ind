"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestEmailCode,
  signInWithGoogle,
  verifyEmailCode,
  type AuthFormState,
} from "@/app/auth/actions";
import Turnstile, { type TurnstileStatus } from "@/components/Turnstile";

const INITIAL_STATE: AuthFormState = {};

function SubmitButton({ idle, pending, disabled = false }: { idle: string; pending: string; disabled?: boolean }) {
  const status = useFormStatus();
  return (
    <button
      type="submit"
      disabled={status.pending || disabled}
      className="auth-submit"
    >
      {status.pending ? pending : idle}
    </button>
  );
}

export default function AuthForm({ pageError, next }: { pageError?: string; next?: string }) {
  const [captchaToken, setCaptchaToken] = useState("");
  // The gate below is right — no code is requested before the captcha passes.
  // The SILENCE around it was the bug: with the button disabled purely on
  // `!captchaToken` and nothing said, a visitor whose Turnstile never loads
  // (adblocker, blocked region, a Cloudflare incident, or the pending-load
  // case we hit headless) gets a permanently dead button on the first screen
  // they meet, and no reason. Starts as "loading" because that is what is
  // true before anything has reported.
  const [captchaStatus, setCaptchaStatus] = useState<TurnstileStatus>("loading");
  const gateClosed = process.env.NODE_ENV === "production" && !captchaToken;
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
        {next && <input type="hidden" name="next" value={next} />}
        <button
          type="submit"
          className="auth-google"
        >
          <svg aria-hidden className="auth-google__icon" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
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
          {next && <input type="hidden" name="next" value={next} />}
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
          <a href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="auth-link">
            Use a different email
          </a>
        </form>
      ) : (
        <form action={requestAction} className="auth-fields" id="email-auth">
          <input type="hidden" name="captchaToken" value={captchaToken} />
          {next && <input type="hidden" name="next" value={next} />}
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
          <Turnstile action="email-login" onVerify={setCaptchaToken} onStatus={setCaptchaStatus} />
          <SubmitButton
            idle="Email me a code"
            pending="Sending code…"
            disabled={gateClosed}
          />
          {/* Only ever shown while the button is actually disabled by the
              captcha, so it explains something the visitor can see. Says what
              is known and nothing more: "didn't load" is true and points
              somewhere, where "something went wrong" would just occupy the
              space. */}
          {gateClosed && captchaStatus === "loading" && (
            <p className="auth-note" role="status">Checking your browser…</p>
          )}
          {gateClosed && captchaStatus === "failed" && (
            <p className="auth-note" role="alert">
              Bot protection didn’t load, so email sign-in is unavailable right
              now. Continue with Google above, or reload to try again.
            </p>
          )}
        </form>
      )}

      {(activeError ?? pageError) && (
        <p role="alert" className="auth-error">
          {activeError ?? pageError}
        </p>
      )}

      <p className="auth-footnote">
        By continuing, you agree to the <a href="/terms">Terms</a> and acknowledge the <a href="/privacy">Privacy policy</a>. No password to remember.
      </p>
    </div>
  );
}
