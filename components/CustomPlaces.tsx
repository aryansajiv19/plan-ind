"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { minimumAgeForCategory, prohibitedVenueReason } from "@/lib/age-policy";

interface SavedCustomPlace {
  id: string;
  name: string;
  area: string;
  category: string;
  visibility: "private" | "friends" | "community";
  minimum_age?: number;
}

/**
 * StartPlanForm's "Your own places": load the caller's saved places, create
 * one, and pin up to three into the deal. State lives in the hook so the form
 * can read the pinned ids at submit; the section below only renders it.
 */
export function useCustomPlaces(category: string, setError: (message: string | null) => void) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<SavedCustomPlace["visibility"]>("private");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedCustomPlace[]>([]);
  // A refused read must not look like "you have no saved places".
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await getSupabase().auth.getUser();
      if (!auth.user) return;
      // Via RPC (migration 050): 051 hides spots.created_by_user_id from
      // clients, so the caller's own places are resolved server-side from
      // auth.uid(). Already ordered by name.
      const { data, error } = await getSupabase().rpc("my_custom_spots");
      if (cancelled) return;
      if (error) { setLoadFailed(true); return; }
      setSaved((data ?? []) as SavedCustomPlace[]);
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  /** The first pinned place this account is too young for, if any. */
  function restrictedFor(age: number): SavedCustomPlace | undefined {
    return saved.find((place) =>
      selectedIds.includes(place.id)
      && age < Math.max(minimumAgeForCategory(place.category), Number(place.minimum_age ?? 0)),
    );
  }

  async function save() {
    const cleanName = name.trim();
    const cleanArea = area.trim();
    if (!cleanName || !cleanArea) {
      setError("Add a name and area for your custom place.");
      return;
    }
    if (prohibitedVenueReason(cleanName, note, address)) {
      setError("That place is outside Deal three's mainstream social venue policy.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data: auth } = await getSupabase().auth.getUser();
    if (!auth.user) {
      setError("Sign in again before saving a private place.");
      setSaving(false);
      return;
    }
    const { data, error: saveError } = await getSupabase()
      .from("spots")
      .insert({
        name: cleanName,
        category,
        area: cleanArea,
        cuisine: "Custom place",
        price_band: "$$",
        min_spend: 0,
        open_till: "Flexible",
        vibe: note.trim() || `Saved by ${auth.user.email?.split("@")[0] ?? "a friend"}`,
        description: note.trim() || null,
        booking_url: null,
        photo_url: null,
        source: "custom",
        visibility,
        created_by_user_id: auth.user.id,
        address: address.trim() || null,
        minimum_age: minimumAgeForCategory(category),
      })
      .select("id,name,area,category,visibility")
      .single();
    if (saveError || !data) {
      setError("That place couldn’t be saved. Check the database migration and try again.");
      setSaving(false);
      return;
    }
    const place = data as SavedCustomPlace;
    setSaved((current) => [...current, place].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedIds((current) => [...current, place.id].slice(0, 3));
    setName("");
    setArea("");
    setAddress("");
    setNote("");
    setOpen(false);
    setSaving(false);
  }

  return {
    open, setOpen, name, setName, area, setArea, address, setAddress, note, setNote,
    visibility, setVisibility, saving, saved, loadFailed, selectedIds, toggle, restrictedFor, save,
  };
}

export default function CustomPlaceSection({ places: p }: { places: ReturnType<typeof useCustomPlaces> }) {
  return (
    <section className="plan-custom-place" aria-labelledby="custom-place-heading">
      <div className="plan-custom-place__header">
        <div><p id="custom-place-heading" className="plan-form__label">Your own places</p><small>Pin up to three saved locations into this plan.</small></div>
        <button type="button" onClick={() => p.setOpen((open) => !open)} aria-expanded={p.open}>{p.open ? "Close" : "Add a place"}</button>
      </div>

      {p.loadFailed && (
        <p className="plan-custom-place__error" role="status">Couldn’t load your saved places. Refresh to try again.</p>
      )}
      {p.saved.length > 0 && (
        <div className="plan-custom-place__saved">
          {p.saved.map((place) => (
            <button key={place.id} type="button" onClick={() => p.toggle(place.id)} aria-pressed={p.selectedIds.includes(place.id)}>
              <strong>{place.name}</strong><span>{place.area} · {place.visibility}</span>
            </button>
          ))}
        </div>
      )}

      {p.open && (
        <div className="plan-custom-place__editor">
          <label><span>Name</span><input value={p.name} onChange={(event) => p.setName(event.target.value)} placeholder="Desert camp, friend's majlis…" maxLength={80} /></label>
          <label><span>Area</span><input value={p.area} onChange={(event) => p.setArea(event.target.value)} placeholder="Al Khawaneej" maxLength={80} /></label>
          <label className="plan-custom-place__wide"><span>Address or map link</span><input value={p.address} onChange={(event) => p.setAddress(event.target.value)} placeholder="Kept private unless you share it" maxLength={300} /></label>
          <label className="plan-custom-place__wide"><span>Note</span><textarea value={p.note} onChange={(event) => p.setNote(event.target.value)} placeholder="What should the group know?" maxLength={280} /></label>
          <fieldset className="plan-custom-place__wide"><legend>Visibility</legend><div>{(["private", "friends", "community"] as const).map((option) => <button key={option} type="button" onClick={() => p.setVisibility(option)} aria-pressed={p.visibility === option}>{option}</button>)}</div></fieldset>
          <button type="button" className="plan-custom-place__save" onClick={p.save} disabled={p.saving}>{p.saving ? "Saving…" : "Save and pin this place"}</button>
        </div>
      )}
    </section>
  );
}
