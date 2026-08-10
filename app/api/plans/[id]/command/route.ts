import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const COMMANDS = new Set(["advance", "decide", "patch"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Send a valid command." }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Send a valid command." }, { status: 400 });
  const raw = body as Record<string, unknown>;
  const hostToken = typeof raw.hostToken === "string" ? raw.hostToken : "";
  const command = typeof raw.command === "string" ? raw.command : "";
  const patch = raw.patch && typeof raw.patch === "object" && !Array.isArray(raw.patch) ? raw.patch : {};
  if (!/^[0-9a-f]{64}$/.test(hostToken) || !COMMANDS.has(command)) {
    return Response.json({ error: "Invalid plan command." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("execute_plan_command", {
    p_plan_id: id,
    p_host_token: hostToken,
    p_command: command,
    p_patch: patch,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : 409;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
