"use client";

import { useState } from "react";
import { secureJsonFetch } from "@/lib/security/csrf-client";

export interface SmartIntent {
  category: string;
  title: string;
  summary: string;
  maxBudget: number | null;
  origin: string;
  radiusKm: number | null;
  vibeKeywords: string[];
  avoidKeywords: string[];
  occasion: string | null;
}

// "Describe the place in your head": the query box, the model call and its
// result chips. The composer applies the intent (onIntent). Signed out it
// asks for sign-in up front (P7): the route answers 401 only after the
// visitor has written their brief, and the composer saves it as a draft.
export default function SmartSearchBox({
  query,
  onQueryChange,
  intent,
  onIntent,
  demoMode,
  onSignIn,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  intent: SmartIntent | null;
  onIntent: (intent: SmartIntent) => void;
  demoMode: boolean;
  onSignIn: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function interpret() {
    const trimmed = query.trim();
    if (trimmed.length < 8) {
      setError("Describe the atmosphere, occasion or kind of place you want.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await secureJsonFetch("/api/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const result = await response.json() as { intent?: SmartIntent; error?: string };
      if (!response.ok || !result.intent) throw new Error(result.error ?? "Smart search failed.");
      onIntent(result.intent);
    } catch (smartSearchError) {
      setError(smartSearchError instanceof Error ? smartSearchError.message : "Smart search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    // The composer's first line (StartPlanForm). Enter builds the search here; it must
    // never submit the deal form this sits in.
    <section className="plan-smart-search" aria-labelledby="smart-search-heading">
      <label id="smart-search-heading" htmlFor="smart-search-input" className="plan-form__label">Describe the night to Luna</label>
      <div className="plan-smart-search__bar">
        <input
          id="smart-search-input"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (demoMode) onSignIn();
            else if (!loading) void interpret();
          }}
          placeholder="A quiet terrace near Jumeirah, about AED 250 each"
          maxLength={600}
        />
        {demoMode ? (
          <button type="button" onClick={onSignIn}>Sign in to build this</button>
        ) : (
          <button type="button" onClick={interpret} disabled={loading || query.trim().length < 8}>{loading ? "Understanding…" : "Build it"}</button>
        )}
      </div>
      {error && <p className="plan-smart-search__error" role="alert">{error}</p>}
      {intent && (
        <div className="plan-smart-result" aria-live="polite">
          <div><strong>{intent.summary}</strong></div>
          <div>{intent.occasion && <span>{intent.occasion}</span>}{intent.vibeKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}{intent.maxBudget != null && <span>≤ AED {intent.maxBudget} pp</span>}</div>
        </div>
      )}
    </section>
  );
}
