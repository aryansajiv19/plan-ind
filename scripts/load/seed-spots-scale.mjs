// Seeds the LOCAL catalogue up to N synthetic curated spots, so index and
// query work can be measured at the sizes the owner is actually targeting
// (500-1000+, stress at 5000). Measuring any of this at 82 rows proves
// nothing: Postgres will seq-scan 82 rows faster than it can use an index,
// so a "no improvement" result there is an artefact of the row count.
//
// Synthetic rows are marked with a 'zzscale-' name prefix so they can be
// removed again without touching the 82 real curated spots.
//
// Usage (loopback only):
//   node scripts/load/seed-spots-scale.mjs 1000
//   node scripts/load/seed-spots-scale.mjs 0      # remove all synthetic rows

import { createClient } from "@supabase/supabase-js";

const LOCAL_URL = "http://127.0.0.1:54321";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(LOCAL_URL)) throw new Error("Refusing to run: not loopback.");

const PREFIX = "zzscale-";
const target = Number(process.argv[2] ?? 1000);
const admin = createClient(LOCAL_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CATEGORIES = ["dinner", "cafe", "shisha", "movie", "games", "brunch", "dessert", "vibes", "beach",
  "outdoors", "sports", "karaoke", "nightlife", "live_music", "culture", "family", "adventure", "shopping",
  "water", "padel", "wellness", "escape", "beach_club"];
const AREAS = ["Dubai Marina", "JBR", "Downtown Dubai", "Business Bay", "Al Quoz", "Jumeirah", "Deira",
  "DIFC", "JLT", "Al Barsha", "Palm Jumeirah", "City Walk", "Al Satwa", "Umm Suqeim", "Meydan",
  "Dubai Hills", "Al Wasl", "Trade Centre", "Mirdif", "Al Warqa"];
// Real-ish words so trigram matching has something to bite on -- random hex
// would make every search miss and flatter the index unfairly.
const WORDS = ["Amber", "Olive", "Cedar", "Falcon", "Pearl", "Saffron", "Ember", "Lantern", "Marble",
  "Copper", "Dune", "Oasis", "Verde", "Aurora", "Indigo", "Nomad", "Terrace", "Harbour", "Atlas", "Sable",
  "Kite", "Coral", "Mirage", "Zephyr", "Cardamom", "Basil", "Juniper", "Sesame", "Fig", "Pomegranate"];
const SUFFIX = ["Kitchen", "House", "Lounge", "Club", "Room", "Garden", "Social", "Bar", "Cafe", "Studio",
  "Collective", "Yard", "Table", "Deck", "Rooftop"];

const pick = (arr, i) => arr[i % arr.length];

// Not discarded: a failed count reads as 0, which would silently reseed from
// scratch and -- worse -- the row counts this script reports are what
// migration 040's benchmark numbers are quoted against. A benchmark against
// a misreported catalogue size is not a benchmark.
const { count: existing, error: countError } = await admin
  .from("spots").select("id", { count: "exact", head: true }).like("name", `${PREFIX}%`);
if (countError) throw new Error(`Counting existing synthetic spots failed: ${countError.message}`);
console.log(`${existing ?? 0} synthetic spots currently seeded.`);

if (target === 0) {
  const { error } = await admin.from("spots").delete().like("name", `${PREFIX}%`);
  console.log(error ? `delete failed: ${error.message}` : "removed all synthetic spots.");
  process.exit(0);
}

if ((existing ?? 0) > target) {
  await admin.from("spots").delete().like("name", `${PREFIX}%`);
  console.log("target below current count -- cleared, reseeding from scratch.");
}

const have = (existing ?? 0) > target ? 0 : (existing ?? 0);
const toCreate = target - have;
if (toCreate <= 0) { console.log("nothing to do."); process.exit(0); }

const BATCH = 500;
for (let i = 0; i < toCreate; i += BATCH) {
  const rows = Array.from({ length: Math.min(BATCH, toCreate - i) }, (_, j) => {
    const n = have + i + j;
    return {
      name: `${PREFIX}${pick(WORDS, n)} ${pick(SUFFIX, n * 7)} ${n}`,
      category: pick(CATEGORIES, n * 3),
      area: pick(AREAS, n * 5),
      cuisine: pick(["Levantine", "Japanese", "Italian", "Indian", "Emirati", "Seafood", "Fusion"], n),
      price_band: pick(["$", "$$", "$$$"], n),
      min_spend: 40 + (n % 400),
      open_till: pick(["11pm", "12am", "1am", "2am", "3am"], n),
      vibe: pick(["relaxed", "buzzing", "romantic", "loud and fun", "quiet corner"], n * 2),
      description: `Synthetic scale-test row ${n}.`,
      source: "curated",
      visibility: "community",
    };
  });
  const { error } = await admin.from("spots").insert(rows);
  if (error) throw new Error(`insert failed at ${i}: ${error.message}`);
  process.stdout.write(`\r  seeded ${Math.min(i + BATCH, toCreate)}/${toCreate}`);
}

const { count: total } = await admin.from("spots").select("id", { count: "exact", head: true }).eq("source", "curated");
console.log(`\ncurated spots now: ${total} (${target} synthetic + the real catalogue).`);
