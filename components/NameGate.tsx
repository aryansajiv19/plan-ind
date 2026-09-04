"use client";

import { useState } from "react";

interface NameGateProps {
  planTitle: string;
  onSubmit: (name: string) => void;
}

// Voters type their name once. No account, no email — just a name so the
// group can see who's in. Persisted per-plan by the parent.
export default function NameGate({ planTitle, onSubmit }: NameGateProps) {
  const [name, setName] = useState("");
  const trimmed = name.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
      className="vote-name-gate mx-auto w-full max-w-sm"
    >
      <p className="vote-kicker font-display text-sm font-bold uppercase tracking-[0.14em] text-grape">
        A Dubai plan is waiting
      </p>
      <h1 className="mt-2 text-3xl font-extrabold">{planTitle}</h1>
      <label htmlFor="voter-name" className="mt-6 block text-sm text-muted">
        First, who’s voting?
      </label>
      <input
        id="voter-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        maxLength={24}
        aria-describedby="voter-name-help"
        className="vote-field mt-2 w-full rounded-2xl border-2 border-ink bg-card px-4 py-3 text-lg font-medium outline-none placeholder:text-muted/60"
      />
      <p id="voter-name-help" className="vote-name-help">
        Your choices are remembered on this device for this plan. Use the same browser if you come back later.
      </p>
      <button
        type="submit"
        disabled={!trimmed}
        className="vote-primary-action mt-4 w-full rounded-2xl border-2 border-ink px-6 py-3.5 font-display text-lg font-extrabold disabled:opacity-40"
      >
        Start voting
      </button>
    </form>
  );
}
