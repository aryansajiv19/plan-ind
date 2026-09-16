"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

const CHOICES = ["🍜", "🌮", "🍕", "🧋", "🍰", "🔥", "✨", "🦩", "🐙", "🌴"];
// The server keeps at most 8 characters (code points, so "👨‍👩‍👧" fits).
const MAX_CHARS = 8;

/**
 * The emoji friends see beside your name. NULL means none chosen (052), so
 * removing sends null, never '' or '?'. Each choice saves on tap and the screen
 * shows the value the server returns, which it may have cleaned or shortened.
 */
export default function ProfileEmojiForm({ personId, emoji }: { personId: string; emoji: string | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState(emoji);
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function save(next: string | null) {
    setPending(true);
    setMessage(null);
    // .select().single(): an update RLS refuses touches 0 rows with no error.
    const { data, error } = await getSupabase()
      .from("people")
      .update({ emoji: next })
      .eq("id", personId)
      .select("emoji")
      .single();
    setPending(false);
    if (error) {
      setMessage({ error: true, text: error.code === "23514" ? "That can’t be used as an emoji. Pick another." : "Couldn’t save your emoji. Try again." });
      return;
    }
    const saved = (data as { emoji: string | null }).emoji;
    setCurrent(saved);
    setCustom("");
    setMessage({ error: false, text: saved ? "Saved." : "Emoji removed." });
    router.refresh();
  }

  const customTrimmed = custom.trim();
  const customTooLong = [...customTrimmed].length > MAX_CHARS;

  return (
    <section className="profile-emoji" aria-labelledby="profile-emoji-title">
      <h2 id="profile-emoji-title">Your emoji</h2>
      <p>Shown next to your name for friends. Optional.</p>
      <div className="profile-emoji__choices" role="group" aria-label="Pick an emoji">
        {CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={current === choice}
            disabled={pending}
            onClick={() => void save(choice)}
          >
            {choice}
          </button>
        ))}
      </div>
      <form
        className="profile-emoji__custom"
        onSubmit={(event) => { event.preventDefault(); if (customTrimmed && !customTooLong) void save(customTrimmed); }}
      >
        <label htmlFor="profile-emoji-custom">Or use your own</label>
        <div>
          <input
            id="profile-emoji-custom"
            value={custom}
            autoComplete="off"
            aria-describedby="profile-emoji-status"
            onChange={(event) => { setCustom(event.target.value); setMessage(null); }}
          />
          <button type="submit" disabled={pending || !customTrimmed || customTooLong}>Use</button>
          {current && (
            <button type="button" className="profile-emoji__remove" disabled={pending} onClick={() => void save(null)}>
              Remove {current}
            </button>
          )}
        </div>
      </form>
      <p
        id="profile-emoji-status"
        role={message?.error || customTooLong ? "alert" : "status"}
        className={message?.error || customTooLong ? "profile-emoji__error" : "profile-emoji__status"}
      >
        {customTooLong ? `Keep it to ${MAX_CHARS} characters or fewer.` : message?.text}
      </p>
    </section>
  );
}
