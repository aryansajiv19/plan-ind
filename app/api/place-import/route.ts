import { createClient } from "@/lib/supabase/server";
import { classifyPlaceLink } from "@/lib/place-import";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.NODE_ENV === "production") {
    return Response.json({ error: "Sign in to save a place." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a valid link." }, { status: 400 });
  }
  const sourceUrl = typeof body === "object" && body !== null && "url" in body
    ? String((body as { url: unknown }).url).trim()
    : "";
  if (!sourceUrl || sourceUrl.length > 2_048) {
    return Response.json({ error: "Paste a link shorter than 2,048 characters." }, { status: 400 });
  }

  try {
    const candidate = classifyPlaceLink(sourceUrl);
    return Response.json({ candidate, status: "ready" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "That link is not supported." }, { status: 400 });
  }
}
