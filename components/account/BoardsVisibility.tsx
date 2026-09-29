"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// Settings: stay off the public (Dubai and area) leaderboards. Friends
// still see you on theirs, and you always see your own row.
export default function BoardsVisibility({ personId }: { personId: string }) {
  const [hidden, setHidden] = useState<boolean | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    void getSupabase().from("people").select("hide_from_boards").eq("id", personId).maybeSingle().then(({ data, error: readError }) => {
      if (!live) return;
      if (readError || !data) { setError(true); return; }
      setHidden(Boolean(data.hide_from_boards));
    });
    return () => { live = false; };
  }, [personId]);

  async function toggle() {
    if (hidden == null) return;
    const next = !hidden;
    setHidden(next);
    const { data, error: writeError } = await getSupabase().from("people").update({ hide_from_boards: next }).eq("id", personId).select("id");
    if (writeError || !data?.length) { setHidden(!next); setError(true); }
  }

  return (
    <div className="settings-toggle">
      <label>
        <input type="checkbox" checked={hidden ?? false} disabled={hidden == null} onChange={() => void toggle()} />
        <span>Hide me from public leaderboards</span>
      </label>
      <small>Dubai and area boards show you as first name and initial. Friends still see you.</small>
      {error && <p role="alert">That setting didn’t load or save. Refresh to try again.</p>}
    </div>
  );
}
