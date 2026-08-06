import { createHash } from "node:crypto";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MODEL = "gpt-5.6-luna";
const CATEGORIES = [
  "dinner", "cafe", "brunch", "dessert", "shisha", "vibes", "nightlife",
  "live_music", "karaoke", "beach", "beach_club", "water", "sports", "padel",
  "adventure", "outdoors", "games", "movie", "culture", "wellness", "shopping",
  "family", "escape",
] as const;
const ORIGINS = ["anywhere", "downtown", "marina", "jumeirah", "al-quoz", "creek"] as const;

export interface SmartSearchIntent {
  category: (typeof CATEGORIES)[number];
  title: string;
  summary: string;
  maxBudget: number | null;
  origin: (typeof ORIGINS)[number];
  radiusKm: number | null;
  vibeKeywords: string[];
  avoidKeywords: string[];
  occasion: string | null;
}

const requests = new Map<string, { count: number; resetsAt: number }>();

function allowRequest(identifier: string): boolean {
  const now = Date.now();
  const current = requests.get(identifier);
  if (!current || current.resetsAt <= now) {
    requests.set(identifier, { count: 1, resetsAt: now + 60_000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

function privateIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeIntent(value: unknown): SmartSearchIntent {
  if (!value || typeof value !== "object") throw new Error("Model returned invalid intent.");
  const raw = value as Record<string, unknown>;
  const category = CATEGORIES.includes(raw.category as SmartSearchIntent["category"])
    ? raw.category as SmartSearchIntent["category"]
    : "dinner";
  const origin = ORIGINS.includes(raw.origin as SmartSearchIntent["origin"])
    ? raw.origin as SmartSearchIntent["origin"]
    : "anywhere";
  const stringList = (candidate: unknown, limit: number) => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 30)).filter(Boolean).slice(0, limit)
    : [];
  const nullableNumber = (candidate: unknown, maximum: number) => typeof candidate === "number" && Number.isFinite(candidate)
    ? Math.max(0, Math.min(maximum, Math.round(candidate)))
    : null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 60) : "A Dubai plan";
  const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 180) : "A considered match for the plan you described.";
  return {
    category,
    origin,
    title: title || "A Dubai plan",
    summary: summary || "A considered match for the plan you described.",
    maxBudget: nullableNumber(raw.maxBudget, 10_000),
    radiusKm: origin === "anywhere" ? null : nullableNumber(raw.radiusKm, 100),
    vibeKeywords: stringList(raw.vibeKeywords, 6),
    avoidKeywords: stringList(raw.avoidKeywords, 5),
    occasion: typeof raw.occasion === "string" ? raw.occasion.trim().slice(0, 40) || null : null,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Sign in to use smart search." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid search description." }, { status: 400 });
  }
  const query = typeof body === "object" && body !== null && "query" in body
    ? String((body as { query: unknown }).query).trim()
    : "";
  if (query.length < 8 || query.length > 600) {
    return Response.json({ error: "Describe the plan in 8 to 600 characters." }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const safetyIdentifier = privateIdentifier(user?.id ?? forwarded);
  if (!allowRequest(safetyIdentifier)) {
    return Response.json({ error: "Too many searches. Try again in a minute." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Smart search is not configured yet." }, { status: 503 });
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: MODEL,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 600,
      safety_identifier: safetyIdentifier,
      instructions: [
        "Convert a Dubai hangout request into search intent for an existing venue catalog.",
        "Never invent or recommend venue names. Return only constraints and short search language.",
        "Choose exactly one closest category from the supplied enum.",
        "Treat explicit budgets and locations as hard constraints. Use null when the user did not specify one.",
        "Map Dubai Marina/JBR/JLT to marina; Downtown/DIFC/Business Bay to downtown; Jumeirah/Umm Suqeim to jumeirah; Al Quoz/Al Barsha to al-quoz; Creek/Deira/Bur Dubai to creek.",
        "Keep vibe and avoid keywords short, concrete, and useful against venue descriptions.",
      ].join(" "),
      input: query,
      text: {
        format: {
          type: "json_schema",
          name: "dubai_plan_intent",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string", enum: CATEGORIES },
              title: { type: "string" },
              summary: { type: "string" },
              maxBudget: { anyOf: [{ type: "integer" }, { type: "null" }] },
              origin: { type: "string", enum: ORIGINS },
              radiusKm: { anyOf: [{ type: "integer" }, { type: "null" }] },
              vibeKeywords: { type: "array", items: { type: "string" } },
              avoidKeywords: { type: "array", items: { type: "string" } },
              occasion: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["category", "title", "summary", "maxBudget", "origin", "radiusKm", "vibeKeywords", "avoidKeywords", "occasion"],
          },
        },
      },
    });

    const intent = normalizeIntent(JSON.parse(response.output_text));
    return Response.json({ intent, model: response.model }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const details = error instanceof OpenAI.APIError
      ? { requestId: error.requestID, status: error.status, code: error.code, type: error.type, message: error.message }
      : { message: error instanceof Error ? error.message : "Unknown error" };
    console.error("Smart search request failed", details);
    return Response.json({ error: "Smart search couldn’t interpret that right now. Try again." }, { status: 502 });
  }
}
