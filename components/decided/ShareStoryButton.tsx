"use client";

import { useState } from "react";

/**
 * "Share to story": fetches the 1080x1920 card from `href` and hands it to
 * the phone's share sheet (Instagram takes it as a story) where the browser
 * can share files, else downloads it. Unstyled; the lead styles it.
 */
export default function ShareStoryButton({ href, fileName }: { href: string; fileName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed" | "saved">("idle");

  async function share() {
    setState("busy");
    try {
      const response = await fetch(href, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const file = new File([await response.blob()], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setState("idle");
        return;
      }
      const url = URL.createObjectURL(file);
      const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
      link.click();
      URL.revokeObjectURL(url);
      setState("saved");
    } catch (error) {
      // Closing the share sheet is not a failure.
      setState(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    }
  }

  return (
    <span className="share-story">
      <button type="button" onClick={() => void share()} disabled={state === "busy"}>
        {state === "busy" ? "Making your story…" : "Share to story"}
      </button>
      {state === "saved" && <span role="status">Saved. Post it from your photos.</span>}
      {state === "failed" && <span role="alert">That didn’t work. Try again in a moment.</span>}
    </span>
  );
}
