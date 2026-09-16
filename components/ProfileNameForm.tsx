"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * Change the name friends and plans see. Writes people.display_name, which
 * is what every screen now reads (not the sign-in provider's name).
 *
 * The .select().single() is load-bearing: RLS refusing an update touches 0
 * rows and returns NO error, so without it a refused save reads as saved.
 */
export default function ProfileNameForm({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const trimmed = draft.trim();
  const unchanged = trimmed === name;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed || unchanged) return;
    setStatus("saving");
    setMessage(null);
    const { error } = await getSupabase()
      .from("people")
      .update({ display_name: trimmed })
      .eq("id", personId)
      .select("id")
      .single();
    if (error) {
      setStatus("error");
      // 23514: the database stripped the name to nothing (control/bidi
      // characters only) or it broke the length rule.
      setMessage(error.code === "23514"
        ? "That name can’t be used. Use letters, numbers or emoji, up to 40 characters."
        : "Couldn’t save your name. Try again.");
      return;
    }
    setDraft(trimmed);
    setStatus("saved");
    setMessage("Saved.");
    // Re-read the server's copy so the greeting and header show what was
    // actually stored (the database trims and cleans on write).
    router.refresh();
  }

  return (
    <form className="profile-name-form" onSubmit={save}>
      <label htmlFor="profile-name">Your name</label>
      <p id="profile-name-help">What friends see on plans, invites and your Friends list.</p>
      <div>
        <input
          id="profile-name"
          value={draft}
          maxLength={40}
          autoComplete="nickname"
          aria-describedby="profile-name-help profile-name-status"
          onChange={(event) => { setDraft(event.target.value); if (status !== "saving") { setStatus("idle"); setMessage(null); } }}
        />
        <button type="submit" disabled={!trimmed || unchanged || status === "saving"}>
          {status === "saving" ? "Saving…" : "Save"}
        </button>
      </div>
      <p
        id="profile-name-status"
        role={status === "error" ? "alert" : "status"}
        className={status === "error" ? "profile-name-form__error" : "profile-name-form__status"}
      >
        {message}
      </p>
    </form>
  );
}
