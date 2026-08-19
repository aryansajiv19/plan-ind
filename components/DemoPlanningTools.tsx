"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  readPlanningState,
  writePlanningState,
  type LocalPlan,
  type Moodboard,
  type MoodboardItemKind,
  type PlanningCircle,
} from "@/lib/planning";
import { validateImageFile } from "@/lib/upload";

type ToolView = "discover" | "been" | "friends" | "profile";
type Circle = PlanningCircle;

const CIRCLES_KEY = "deal-three:demo-circles";
const MOODBOARDS_KEY = "deal-three:demo-moodboards";
const PLAN_KEY = "deal-three:demo-plan-lifecycle";
const DEFAULT_CIRCLES: Circle[] = [{ id: "friday-crew", name: "Friday crew", memberIds: ["S", "Z", "M", "O"] }, { id: "work-friends", name: "Work friends", memberIds: ["L", "A", "N"] }];
const DEFAULT_MOODBOARDS: Moodboard[] = [{ id: "summer-dubai", name: "Summer in Dubai", theme: "Sunset plans", visibility: "private", items: [{ id: "ninive", label: "Ninive", kind: "place", note: "Long dinner, no rush." }, { id: "beach", label: "Drift Beach", kind: "place", note: "Saturday pool day." }] }];
const DEFAULT_PLAN: LocalPlan = { id: "demo-plan", title: "Friday crew plan", category: "dinner", stage: "idea", circleId: "friday-crew", selectedPlace: "Ninive", eventTime: null, rsvp: "coming", reminderAt: null, memoryNote: "" };

function fileAsDataUrl(file: File, onDone: (value: string) => void) {
  const reader = new FileReader();
  reader.onload = () => { if (typeof reader.result === "string") onDone(reader.result); };
  reader.readAsDataURL(file);
}

export default function DemoPlanningTools({ view, onStartPlan }: { view: ToolView; onStartPlan: () => void }) {
  const [ready, setReady] = useState(false);
  const [circles, setCircles] = useState<Circle[]>(DEFAULT_CIRCLES);
  const [moodboards, setMoodboards] = useState<Moodboard[]>(DEFAULT_MOODBOARDS);
  const [plan, setPlan] = useState<LocalPlan>(DEFAULT_PLAN);
  const [circleName, setCircleName] = useState("");
  const [boardName, setBoardName] = useState("");
  const [itemLabel, setItemLabel] = useState("");
  const [itemNote, setItemNote] = useState("");
  const [itemKind, setItemKind] = useState<MoodboardItemKind>("link");
  const [activeBoard, setActiveBoard] = useState(DEFAULT_MOODBOARDS[0].id);
  const [memoryPhoto, setMemoryPhoto] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [wrappedCopied, setWrappedCopied] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCircles(readPlanningState(CIRCLES_KEY, DEFAULT_CIRCLES));
      const boards = readPlanningState(MOODBOARDS_KEY, DEFAULT_MOODBOARDS);
      setMoodboards(boards); setActiveBoard(boards[0]?.id ?? "");
      setPlan(readPlanningState(PLAN_KEY, DEFAULT_PLAN)); setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (ready) writePlanningState(CIRCLES_KEY, circles); }, [circles, ready]);
  useEffect(() => { if (ready) writePlanningState(MOODBOARDS_KEY, moodboards); }, [moodboards, ready]);
  useEffect(() => { if (ready) writePlanningState(PLAN_KEY, plan); }, [plan, ready]);

  function createCircle() {
    const name = circleName.trim().slice(0, 40); if (!name) return;
    setCircles((current) => [...current, { id: `${Date.now()}`, name, memberIds: ["A", "S"] }]); setCircleName("");
  }
  function createBoard() {
    const name = boardName.trim().slice(0, 50); if (!name) return;
    const board: Moodboard = { id: `${Date.now()}`, name, theme: "New ideas", visibility: "private", items: [] };
    setMoodboards((current) => [...current, board]); setActiveBoard(board.id); setBoardName("");
  }
  function addBoardItem() {
    const label = itemLabel.trim().slice(0, 80); if (!label || !activeBoard) return;
    setMoodboards((current) => current.map((board) => board.id === activeBoard ? { ...board, items: [...board.items, { id: `${Date.now()}`, label, kind: itemKind, note: itemNote.trim().slice(0, 180) }] } : board));
    setItemLabel(""); setItemNote("");
  }
  function advancePlan() {
    const next: Record<LocalPlan["stage"], LocalPlan["stage"]> = { idea: "voting", voting: "confirmed", confirmed: "completed", completed: "completed" };
    setPlan((current) => ({ ...current, stage: next[current.stage] }));
  }
  async function saveMemoryPhoto(file: File) {
    const error = await validateImageFile(file, 2_000_000);
    setPhotoError(error);
    if (error) return;
    fileAsDataUrl(file, (image) => { setMemoryPhoto(image); setPlan((current) => ({ ...current, memoryPhotoDataUrl: image })); });
  }
  async function shareWrapped() {
    const summary = "My Planind Wrapped: 6 plans, 4 circles, and Jumeirah was my most visited area.";
    if (navigator.share) await navigator.share({ title: "My Planind Wrapped", text: summary });
    else { await navigator.clipboard?.writeText(summary); setWrappedCopied(true); window.setTimeout(() => setWrappedCopied(false), 1800); }
  }

  if (view === "friends") return <section className="demo-tool-grid" aria-label="Planning tools">
    <article className="demo-tool-panel"><p className="home-section-kicker">Friend circles</p><h2>Choose the people before the place.</h2><div className="demo-circle-list">{circles.map((circle) => <button key={circle.id} type="button" className={plan.circleId === circle.id ? "is-selected" : ""} onClick={() => setPlan((current) => ({ ...current, circleId: circle.id }))}><strong>{circle.name}</strong><span>{circle.memberIds.length} people · {circle.memberIds.join(" · ")}</span></button>)}</div><div className="demo-inline-form"><input value={circleName} onChange={(event) => setCircleName(event.target.value)} placeholder="New circle" maxLength={40} /><button type="button" onClick={createCircle} disabled={!circleName.trim()}>Add</button></div></article>
    <article className="demo-tool-panel"><p className="home-section-kicker">Plan in progress</p><h2>{plan.selectedPlace}, with {circles.find((circle) => circle.id === plan.circleId)?.name ?? "your group"}.</h2><div className="demo-stage-line"><span className="is-current">Idea</span><span className={plan.stage !== "idea" ? "is-current" : ""}>Vote</span><span className={plan.stage === "confirmed" || plan.stage === "completed" ? "is-current" : ""}>Confirm</span><span className={plan.stage === "completed" ? "is-current" : ""}>Remember</span></div><label className="demo-tool-field"><span>When</span><input type="datetime-local" value={plan.eventTime ?? ""} onChange={(event) => setPlan((current) => ({ ...current, eventTime: event.target.value, reminderAt: current.reminderAt ? event.target.value : current.reminderAt }))} /></label><div className="demo-reaction-row" aria-label="Your RSVP"><button type="button" aria-pressed={plan.rsvp === "coming"} onClick={() => setPlan((current) => ({ ...current, rsvp: "coming" }))}>Coming</button><button type="button" aria-pressed={plan.rsvp === "maybe"} onClick={() => setPlan((current) => ({ ...current, rsvp: "maybe" }))}>Maybe</button><button type="button" aria-pressed={plan.rsvp === "no"} onClick={() => setPlan((current) => ({ ...current, rsvp: "no" }))}>Can’t make it</button></div><label className="demo-check"><input type="checkbox" checked={Boolean(plan.reminderAt)} onChange={(event) => setPlan((current) => ({ ...current, reminderAt: event.target.checked ? current.eventTime : null }))} /> Remind me locally before we leave</label><button type="button" className="demo-primary-action" onClick={plan.stage === "completed" ? onStartPlan : advancePlan}>{plan.stage === "idea" ? "Open voting" : plan.stage === "voting" ? "Confirm this plan" : plan.stage === "confirmed" ? "Mark it done" : "Start another plan"}</button></article>
  </section>;

  if (view === "discover") { const board = moodboards.find((item) => item.id === activeBoard); return <section className="demo-tool-panel demo-moodboard-panel" aria-labelledby="moodboard-title"><div className="demo-tool-panel__head"><div><p className="home-section-kicker">Moodboards</p><h2 id="moodboard-title">Keep the feeling, not just the venue.</h2></div><button type="button" onClick={createBoard} disabled={!boardName.trim()}>New board</button></div><div className="demo-inline-form"><input value={boardName} onChange={(event) => setBoardName(event.target.value)} placeholder="Board name" maxLength={50} /><span>{moodboards.length} boards</span></div><div className="demo-board-tabs">{moodboards.map((item) => <button key={item.id} type="button" aria-pressed={item.id === activeBoard} onClick={() => setActiveBoard(item.id)}>{item.name}<small>{item.items.length} ideas</small></button>)}</div>{board && <><div className="demo-board-items">{board.items.map((item) => <div key={item.id}><span>{item.kind}</span><strong>{item.label}</strong><small>{item.note || "Saved for later."}</small></div>)}{board.items.length === 0 && <p className="demo-empty">Start with a place, link or photo you want the group to see.</p>}</div><div className="demo-inline-form"><select value={itemKind} onChange={(event) => setItemKind(event.target.value as MoodboardItemKind)}><option value="place">Place</option><option value="link">Link</option><option value="photo">Photo</option></select><input value={itemLabel} onChange={(event) => setItemLabel(event.target.value)} placeholder="Paste a place or link" maxLength={80} /><input value={itemNote} onChange={(event) => setItemNote(event.target.value)} placeholder="Short note" maxLength={180} /><button type="button" onClick={addBoardItem} disabled={!itemLabel.trim()}>Save</button></div><button type="button" className="demo-primary-action" onClick={onStartPlan}>Turn this board into a plan</button></>}</section>; }

  if (view === "been") return <section className="demo-tool-panel demo-memory-panel" aria-labelledby="memory-title"><p className="home-section-kicker">After the plan</p><h2 id="memory-title">Keep the good part.</h2><p>Turn a finished outing into a small shared memory. Photos stay on this device in demo mode.</p><label className="demo-tool-field"><span>What should you remember?</span><textarea value={plan.memoryNote} onChange={(event) => setPlan((current) => ({ ...current, memoryNote: event.target.value.slice(0, 280) }))} placeholder="The table, the joke, the place we want to return to…" maxLength={280} /></label><label className="demo-memory-upload"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void saveMemoryPhoto(file); }} />{memoryPhoto ? <Image src={memoryPhoto} alt="Memory preview" fill unoptimized sizes="(max-width: 760px) 100vw, 50vw" /> : <strong>Add a photo from the outing</strong>}</label>{photoError && <p role="alert" className="auth-error">{photoError}</p>}<button type="button" className="demo-primary-action" onClick={() => setPlan((current) => ({ ...current, stage: "completed" }))}>Save memory</button></section>;

  return <>
    <section className="demo-tool-panel demo-reminder-panel" aria-labelledby="reminder-title"><p className="home-section-kicker">Your plans</p><h2 id="reminder-title">A quiet nudge at the right time.</h2><p>{plan.reminderAt && plan.eventTime ? `Reminder set for ${new Date(plan.eventTime).toLocaleString()}.` : "Choose a plan time and turn on a local reminder when you are ready."}</p><label className="demo-check"><input type="checkbox" checked={Boolean(plan.reminderAt)} onChange={(event) => setPlan((current) => ({ ...current, reminderAt: event.target.checked ? current.eventTime : null }))} /> Local reminder enabled</label><button type="button" className="demo-primary-action" onClick={() => setPlan((current) => ({ ...current, reminderAt: current.reminderAt ? null : current.eventTime }))}>{plan.reminderAt ? "Turn reminder off" : "Turn reminder on"}</button></section>
    <section className="demo-wrapped" aria-labelledby="wrapped-title">
      <div><p className="home-section-kicker">Your month in plans</p><h2 id="wrapped-title">Planind Wrapped</h2><p>A small recap of the places, people and decisions that shaped your month.</p></div>
      {!wrappedOpen ? <button type="button" className="demo-primary-action" onClick={() => setWrappedOpen(true)}>Create my Wrapped</button> : <div className="demo-wrapped__card"><div className="demo-wrapped__eyebrow">August 2026 · Aryan</div><strong>6</strong><span>plans made with people you like going out with</span><div className="demo-wrapped__stats"><div><b>Jumeirah</b><small>Your most visited area</small></div><div><b>Friday crew</b><small>Your most active circle</small></div><div><b>Late dinner</b><small>Your signature plan</small></div><div><b>4.8 / 5</b><small>Your best-rated place</small></div></div><div className="demo-wrapped__actions"><button type="button" onClick={shareWrapped}>{wrappedCopied ? "Copied" : "Share Wrapped"}</button><button type="button" onClick={() => setWrappedOpen(false)}>Close</button></div></div>}
    </section>
  </>;
}
