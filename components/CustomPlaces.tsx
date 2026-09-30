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
export function useCustomPlaces(category: string, setError: (message: string | null) => void, reserved = 0) {
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
  // Read or refused: until then an empty list is "loading", not "none".
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Set while the editor holds one of `saved` rather than a new place.
  const [editingId, setEditingId] = useState<string | null>(null);

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
      setLoaded(true);
      if (error) { setLoadFailed(true); return; }
      setSaved((data ?? []) as SavedCustomPlace[]);
    })();
    return () => { cancelled = true; };
  }, []);

  function toggle(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      // One pin per round, shared with catalogue pins (`reserved`, P25).
      if (current.length + reserved >= 3) return current;
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

  function edit(place: SavedCustomPlace) {
    setEditingId(place.id);
    setName(place.name);
    setArea(place.area);
    setVisibility(place.visibility);
    setOpen(true);
  }

  function closeEditor() {
    setEditingId(null);
    setName("");
    setArea("");
    setAddress("");
    setNote("");
    setOpen(false);
  }

  async function update(id: string) {
    setSaving(true);
    setError(null);
    // Name, area and visibility only: my_custom_spots doesn't return the
    // note or address, so the editor can't show what it would overwrite.
    // Name and area only when edited: JS trim() also strips Unicode spaces
    // that the database's clean_app_text keeps, so re-sending an untouched
    // name could differ and trip 082's in-plan guard on a visibility change.
    const loaded = saved.find((item) => item.id === id);
    const { data, error: updateError } = await getSupabase()
      .from("spots")
      .update({
        ...(loaded?.name !== name ? { name: name.trim() } : {}),
        ...(loaded?.area !== area ? { area: area.trim() } : {}),
        visibility,
      })
      .eq("id", id)
      .select("id,name,area,category,visibility")
      .maybeSingle();
    setSaving(false);
    // 082 refuses changing a place that is in a plan, with a message and
    // the way out in its hint; say that. No row back and no error: RLS
    // filtered it (not the caller's place).
    if (updateError?.code === "42501" && updateError.hint) {
      setError([updateError.message, updateError.hint].join(" "));
      return;
    }
    if (updateError || !data) {
      setError("That place couldn’t be updated. Try again in a moment.");
      return;
    }
    const place = data as SavedCustomPlace;
    setSaved((current) => current.map((item) => (item.id === id ? { ...item, ...place } : item)).sort((a, b) => a.name.localeCompare(b.name)));
    closeEditor();
  }

  async function remove(id: string) {
    setError(null);
    const { data, error: deleteError } = await getSupabase().from("spots").delete().eq("id", id).select("id");
    // 065's trigger refuses a place in a plan or in someone else's saves,
    // with a readable message and the way out in its hint.
    if (deleteError) {
      setError(deleteError.code === "23503" ? [deleteError.message, deleteError.hint].filter(Boolean).join(" ") : "That place couldn’t be deleted. Try again in a moment.");
      return;
    }
    if (!data?.length) {
      setError("That place couldn’t be deleted. Refresh and try again.");
      return;
    }
    setSaved((current) => current.filter((item) => item.id !== id));
    setSelectedIds((current) => current.filter((item) => item !== id));
    if (editingId === id) closeEditor();
  }

  async function save() {
    const cleanName = name.trim();
    const cleanArea = area.trim();
    if (!cleanName || !cleanArea) {
      setError("Add a name and area for your custom place.");
      return;
    }
    if (prohibitedVenueReason(cleanName, note, address)) {
      setError("That place is outside Planind's mainstream social venue policy.");
      return;
    }
    if (editingId) return update(editingId);
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
        // The form asks neither, so hours stay empty. price_band can't: its
        // CHECK allows only $/$$/$$$ (schema.sql), so it holds a placeholder.
        price_band: "$$",
        min_spend: 0,
        open_till: "",
        // Never the email prefix: community places are readable by every account.
        vibe: note.trim() || "Saved by a friend",
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
      setError("That place couldn’t be saved. Try again in a moment.");
      setSaving(false);
      return;
    }
    const place = data as SavedCustomPlace;
    setSaved((current) => [...current, place].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedIds((current) => [...current, place.id].slice(0, 3));
    closeEditor();
    setSaving(false);
  }

  return {
    open, setOpen, name, setName, area, setArea, address, setAddress, note, setNote,
    visibility, setVisibility, saving, saved, loaded, loadFailed, selectedIds, toggle, restrictedFor, save,
    editingId, edit, closeEditor, remove,
    // P26: the pinned places as the reveal shows them, in pin order.
    pinnedCards: selectedIds.map((id) => saved.find((place) => place.id === id))
      .map((place) => place && { name: place.name, area: place.area, photo_url: null, photo_attribution: null }),
  };
}

// onSignIn is set when signed out (P7): saving needs an account, so the
// button asks for one up front instead of refusing a filled-in form.
export default function CustomPlaceSection({ places: p, onSignIn }: { places: ReturnType<typeof useCustomPlaces>; onSignIn?: () => void }) {
  return (
    <section className="plan-custom-place" aria-labelledby="custom-place-heading">
      <div className="plan-custom-place__header">
        <div><p id="custom-place-heading" className="plan-form__label">A place of your own</p><small>Save it once; it waits in My places for any plan.</small></div>
        {onSignIn ? (
          <button type="button" onClick={onSignIn}>Sign in to add a place</button>
        ) : (
          <button type="button" onClick={() => (p.open ? p.closeEditor() : p.setOpen(true))} aria-expanded={p.open}>{p.open ? "Close" : "Add a place"}</button>
        )}
      </div>

      {p.loadFailed && (
        <p className="plan-custom-place__error" role="status">Couldn’t load your saved places. Refresh to try again.</p>
      )}

      {!onSignIn && p.saved.length > 0 && (
        <ul className="plan-custom-place__list" aria-label="Your places">
          {p.saved.map((place) => (
            <li key={place.id}>
              <span>{place.name} · {place.area}</span>
              <button type="button" onClick={() => p.edit(place)}>Edit</button>
              <button type="button" onClick={() => void p.remove(place.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      {p.open && (
        <div className="plan-custom-place__editor">
          <label><span>Name</span><input value={p.name} onChange={(event) => p.setName(event.target.value)} placeholder="Desert camp, friend's majlis…" maxLength={80} /></label>
          <label><span>Area</span><input value={p.area} onChange={(event) => p.setArea(event.target.value)} placeholder="Al Khawaneej" maxLength={80} /></label>
          {!p.editingId && <>
          <label className="plan-custom-place__wide"><span>Address or map link</span><input value={p.address} onChange={(event) => p.setAddress(event.target.value)} placeholder="Kept private unless you share it" maxLength={300} /></label>
          <label className="plan-custom-place__wide"><span>Note</span><textarea value={p.note} onChange={(event) => p.setNote(event.target.value)} placeholder="What should the group know?" maxLength={280} /></label>
          </>}
          <fieldset className="plan-custom-place__wide"><legend>Visibility</legend><div>{(["private", "friends", "community"] as const).map((option) => <button key={option} type="button" onClick={() => p.setVisibility(option)} aria-pressed={p.visibility === option}>{option}</button>)}</div></fieldset>
          <button type="button" className="plan-custom-place__save" onClick={p.save} disabled={p.saving}>{p.saving ? "Saving…" : p.editingId ? "Save changes" : "Save and pin this place"}</button>
        </div>
      )}
    </section>
  );
}
