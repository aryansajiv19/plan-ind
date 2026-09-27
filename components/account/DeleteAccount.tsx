"use client";

import { useState } from "react";
import { secureJsonFetch } from "@/lib/security/csrf-client";
import { clearAccountState } from "@/lib/device";

// P14: /privacy promises deletion, and this is where it happens. Typing
// DELETE is the confirmation the route itself requires; the route signs the
// session out, so the client forgets this device's keys and leaves.
export default function DeleteAccount() {
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const response = await secureJsonFetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Couldn’t delete your account. Try again.");
      clearAccountState();
      window.location.replace("/");
    } catch (deleteError) {
      setError(deleteError instanceof Error && deleteError.message !== "Failed to fetch"
        ? deleteError.message
        : "Couldn’t reach the server. Check your connection and try again.");
      setPending(false);
    }
  }

  if (!armed) {
    return (
      <button type="button" className="settings-danger" onClick={() => setArmed(true)}>
        Delete account
      </button>
    );
  }
  return (
    <div className="settings-delete" role="group" aria-labelledby="delete-account-title">
      <p id="delete-account-title"><strong>Delete your account for good?</strong> Your profile, visits, photos and votes go. Plans you started that others joined may need handing over first.</p>
      <label>
        <span>Type DELETE to confirm</span>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      </label>
      <div className="settings-delete__actions">
        <button type="button" className="settings-danger" disabled={typed !== "DELETE" || pending} onClick={() => void remove()}>
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" disabled={pending} onClick={() => { setArmed(false); setTyped(""); setError(null); }}>Keep it</button>
      </div>
      {error && <p role="alert" className="settings-delete__error">{error}</p>}
    </div>
  );
}
