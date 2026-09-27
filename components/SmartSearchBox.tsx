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
    <section className="plan-smart-search" aria-labelledby="smart-search-heading">
      <div className="plan-smart-search__heading">
        <div><p id="smart-search-heading" className="plan-form__label">Describe the place in your head</p><small>Atmosphere, occasion, budget, area. Write it naturally.</small></div>
      </div>
      <textarea
        id="smart-search-input"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setError(null);
        }}
        placeholder="A quiet terrace near Jumeirah for a date, dim lighting, around AED 250 each, somewhere we can actually talk."
        maxLength={600}
        aria-describedby="smart-search-help smart-search-count"
      />
      <div className="plan-smart-search__meta">
        <small id="smart-search-help">Use a real plan, place or activity. Include an area, mood, occasion or budget if you know it.</small>
        <small id="smart-search-count" aria-live="polite">{query.length}/600</small>
      </div>
      {demoMode ? (
        <button type="button" onClick={onSignIn}>Sign in to build this</button>
      ) : (
        <button type="button" onClick={interpret} disabled={loading || query.trim().length < 8}>{loading ? "Understanding your plan…" : "Build my search"}</button>
      )}
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
