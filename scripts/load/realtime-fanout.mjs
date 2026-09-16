// Realtime fan-out load driver: many guests on one or more plans, voting,
// with Realtime attached -- the real group loop, not the front door.
//
// Every simulated guest does what app/plan/[id]/page.tsx + lib/supabase.ts
// do, in the same order: anonymous session -> realtime.setAuth ->
// claim_plan_access -> `plan:<id>` channel with the page's five
// postgres_changes listeners + the private presence channel with track() ->
// on every votes event, the page's full `select * from votes` refetch behind
// the same newest-request-wins sequence guard. Each guest is its own client
// and its own WebSocket, the way each phone is.
//
// LOCAL STACK ONLY (refuses non-loopback URLs): every vote is a real write.
//
// Usage:
//   node scripts/load/realtime-fanout.mjs mint <count>
//   node scripts/load/realtime-fanout.mjs run --plans 1 --per-plan 2 --rate 1 [--rounds 1] [--shards N] [--label x]
//
// Ops are open-loop and round-robin: op i is issued by guest i mod N at its
// scheduled time whether or not earlier ops finished, and latency is measured
// from the SCHEDULED time, so a stalled server shows up as latency instead of
// silently slowing the generator (coordinated omission). Each guest alternates
// vote/un-vote, and total ops are 2N x rounds, so every run ends with zero
// votes and every client's final tally has a known right answer.
//
// The report separates what this repo keeps conflating: a missing event
// (DELETE vs INSERT counted apart -- migration 045's bug is DELETE-only), a
// refused join/op (HTTP status), a network reset, and a timeout. A run whose
// load generator itself stalled (event-loop lag p99 > 50ms in any process) is
// printed INVALID: its latencies measure this machine, not the app.

import { createClient } from "@supabase/supabase-js";
import { fork, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const API_URL = process.env.LOAD_SUPABASE_URL ?? "http://127.0.0.1:54621";
const DB_URL = process.env.LOAD_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres";
// The CLI's well-known local demo keys -- public, and only valid on a local stack.
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const GUESTS_FILE = process.env.LOAD_GUESTS_FILE ?? join(tmpdir(), "plan-ind-guests.json");
const RESULTS_FILE = process.env.LOAD_RESULTS_FILE ?? join(tmpdir(), "plan-ind-fanout-results.jsonl");
const MAX_LOOP_LAG_P99_MS = 50;
const QUIESCE_MS = 8_000;
const JOIN_TIMEOUT_MS = 30_000;
const OP_TIMEOUT_MS = 15_000;

if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API_URL)) {
  console.error(`REFUSED: ${API_URL} is not a local stack. Every op here is a real, undeletable write elsewhere.`);
  process.exit(2);
}

const now = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const client = () =>
  createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: randomUUID() },
  });

function pct(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}
const dist = (v) => ({ n: v.length, p50: pct(v, 50), p95: pct(v, 95), p99: pct(v, 99), max: pct(v, 100) });

function lagMonitor() {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  return () => ({ p99: Math.round(h.percentile(99) / 1e6), max: Math.round(h.max / 1e6) });
}

function classify(error, status) {
  const msg = `${error?.message ?? error}`;
  if (/abort|timeout/i.test(msg)) return "timeout";
  if (!status) return "network";
  return `http${status}${error?.code ? `:${error.code}` : ""}`;
}

// ── mint ────────────────────────────────────────────────────────────────
// Batches of 8: local GoTrue drops sign-ins past ~30 concurrent (worklog,
// 2026-09-04). A refusal aborts and writes NOTHING -- a run must never
// proceed quietly with fewer guests than it claims.
async function mint(count) {
  const guests = [];
  while (guests.length < count) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(8, count - guests.length) }, async () => {
        const { data, error } = await client().auth.signInAnonymously();
        if (error || !data.session) return { error: error ?? { message: "no session returned" } };
        return { access_token: data.session.access_token, refresh_token: data.session.refresh_token, expires_at: data.session.expires_at };
      }),
    );
    const refused = batch.find((g) => g.error);
    if (refused) {
      const e = refused.error;
      console.error(`REFUSED after ${guests.length}/${count}: ${e.status ?? "-"} ${e.code ?? ""} ${e.message}. Nothing written.`);
      process.exit(2);
    }
    guests.push(...batch);
  }
  await writeFile(GUESTS_FILE, JSON.stringify(guests));
  console.log(`minted ${guests.length} anonymous guests -> ${GUESTS_FILE}`);
}

// ── shard: owns a slice of guests, one client + socket each ─────────────
async function shard() {
  const lag = lagMonitor();
  const guests = new Map(); // idx -> state
  const receipts = []; // [key, idx, tRecv, tVisible|-1]
  const refetches = []; // [ms, ok]
  const opLog = []; // {key, tSched, tStart, tEnd, ok, err}
  const channelEvents = []; // [idx, channel, status, t, message]
  const insertIds = []; // [insert op key, votes.id]

  async function joinGuest(g) {
    const t0 = now();
    const sb = client();
    const state = { ...g, sb, count: null, seq: 0, counters: { INSERT: 0, DELETE: 0, UPDATE: 0 }, voted: false };
    guests.set(g.idx, state);
    try {
      const { error: sessionError } = await sb.auth.setSession({ access_token: g.access_token, refresh_token: g.refresh_token });
      if (sessionError) return { idx: g.idx, ok: false, err: `session:${classify(sessionError, sessionError.status)}` };
      await sb.realtime.setAuth(g.access_token); // bootstrapPlanAccess does this right after signInAnonymously
      const { data: claimed, error: claimError, status } = await sb.rpc("claim_plan_access", { p_plan_id: g.plan });
      if (claimError || !claimed) return { idx: g.idx, ok: false, err: `claim:${claimError ? classify(claimError, status) : "false"}` };

      const refetch = async () => {
        const seq = ++state.seq;
        const t = now();
        const { data, error } = await sb.from("votes").select("*").eq("plan_id", g.plan);
        refetches.push([now() - t, !error]);
        if (error) return false;
        if (seq === state.seq) state.count = data.length;
        return true;
      };
      await refetch(); // the page's initial read

      const onVote = (payload) => {
        const tRecv = now();
        // With RLS on, a DELETE's `old` carries only the primary key even under
        // replica identity full, so DELETEs are keyed by row id and joined to
        // their op through the INSERT that created the row (see analysis).
        let key;
        if (payload.eventType === "DELETE") {
          key = `id:${payload.old?.id}`;
        } else {
          const n = (state.countsSeen ??= new Map());
          const k = `${payload.new?.participant_token_hash}|${payload.eventType}`;
          n.set(k, (n.get(k) ?? 0) + 1);
          key = `${k}|${n.get(k)}`;
          insertIds.push([key, payload.new?.id]);
        }
        void refetch().then((ok) => receipts.push([key, g.idx, tRecv, ok ? now() : -1]));
      };
      const subscribed = (channel, name) =>
        new Promise((resolve) => {
          const timer = setTimeout(() => resolve(`timeout`), JOIN_TIMEOUT_MS);
          channel.subscribe((status, err) => {
            channelEvents.push([g.idx, name, status, now(), err?.message ?? ""]);
            if (status === "SUBSCRIBED") {
              clearTimeout(timer);
              if (name === "presence") void channel.track({ name: `g${g.idx}` });
              resolve("ok");
            } else if (status !== "CLOSED" || !state.leaving) {
              clearTimeout(timer);
              resolve(status);
            }
          });
        });

      const data = sb
        .channel(`plan:${g.plan}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter: `plan_id=eq.${g.plan}` }, onVote)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "plans", filter: `id=eq.${g.plan}` }, () => {})
        .on("postgres_changes", { event: "*", schema: "public", table: "rsvps", filter: `plan_id=eq.${g.plan}` }, () => {})
        .on("postgres_changes", { event: "*", schema: "public", table: "ratings", filter: `plan_id=eq.${g.plan}` }, () => {})
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "plan_spots", filter: `plan_id=eq.${g.plan}` }, () => {});
      const presence = sb.channel(`plan:${g.plan}:presence`, { config: { private: true, presence: { key: randomUUID() } } });
      presence.on("presence", { event: "sync" }, () => {});

      const [dataStatus, presenceStatus] = await Promise.all([subscribed(data, "data"), subscribed(presence, "presence")]);
      const joinMs = now() - t0;
      if (dataStatus !== "ok") return { idx: g.idx, ok: false, joinMs, err: `channel:${dataStatus}` };
      return { idx: g.idx, ok: true, joinMs, presenceOk: presenceStatus === "ok", presenceErr: presenceStatus };
    } catch (error) {
      return { idx: g.idx, ok: false, err: `exception:${error?.message ?? error}` };
    }
  }

  async function runOp(op) {
    const g = guests.get(op.idx);
    const wait = op.tSched - now();
    if (wait > 0) await sleep(wait);
    const tStart = now();
    const value = !g.voted;
    g.voted = value;
    const type = value ? "INSERT" : "DELETE";
    const key = `${g.hash}|${type}|${++g.counters[type]}`;
    try {
      const { error, status } = await g.sb
        .rpc("cast_plan_vote", {
          p_plan_id: g.plan, p_spot_id: g.spot, p_voter_name: `g${g.idx}`, p_value: value,
          p_phase: "pool", p_pool_number: 1, p_participant_token_hash: g.hash,
        })
        .abortSignal(AbortSignal.timeout(OP_TIMEOUT_MS));
      opLog.push({ key, plan: g.plan, tSched: op.tSched, tStart, tEnd: now(), ok: !error, err: error ? classify(error, status) : null });
    } catch (error) {
      opLog.push({ key, plan: g.plan, tSched: op.tSched, tStart, tEnd: now(), ok: false, err: classify(error, 0) });
    }
  }

  process.on("message", async (msg) => {
    if (msg.type === "join") {
      const results = [];
      // A real crowd opens the link at once; 50 in flight per shard keeps the
      // generator itself from being the thing that's measured.
      for (let i = 0; i < msg.guests.length; i += 50) {
        results.push(...(await Promise.all(msg.guests.slice(i, i + 50).map(joinGuest))));
      }
      process.send({ type: "joined", results });
    } else if (msg.type === "go") {
      await Promise.all(msg.ops.map(runOp));
      process.send({ type: "opsDone" });
    } else if (msg.type === "finish") {
      const tallies = [...guests.values()].map((g) => ({ idx: g.idx, plan: g.plan, count: g.count }));
      for (const g of guests.values()) g.leaving = true;
      process.send({ type: "report", receipts, insertIds, refetches, opLog, channelEvents, tallies, lag: lag() });
      await Promise.all([...guests.values()].map((g) => g.sb.removeAllChannels().catch(() => {})));
      process.exit(0);
    }
  });
  process.send({ type: "ready" });
}

// ── orchestrator ────────────────────────────────────────────────────────
// A malformed count used to become NaN, run zero clients and report an empty
// FAIL -- a result for a question never asked. Refuse instead.
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? fallback : process.argv[i + 1];
  if (name !== "label" && !(Number(value) > 0)) {
    console.error(`REFUSED: --${name} must be a positive number, got ${JSON.stringify(value)}`);
    process.exit(2);
  }
  return value;
}

const psql = (sql) => spawnSync("psql", [DB_URL, "-Atc", sql], { encoding: "utf8" }).stdout.trim();

async function run() {
  const plans = Number(arg("plans", 1));
  const perPlan = Number(arg("per-plan", 2));
  const rate = Number(arg("rate", 1));
  const rounds = Number(arg("rounds", 1));
  const n = plans * perPlan;
  const shardCount = Number(arg("shards", Math.max(1, Math.ceil(n / 250))));
  const label = arg("label", "");
  const orchestratorLag = lagMonitor();

  const guests = JSON.parse(await readFile(GUESTS_FILE, "utf8").catch(() => "[]"));
  if (guests.length < n) {
    console.error(`REFUSED: need ${n} minted guests, have ${guests.length}. Run: mint ${n}`);
    process.exit(2);
  }
  const totalOps = 2 * n * rounds;
  const runSeconds = totalOps / rate + (JOIN_TIMEOUT_MS + QUIESCE_MS) / 1000;
  const earliestExpiry = Math.min(...guests.slice(0, n).map((g) => g.expires_at));
  if (earliestExpiry * 1000 < Date.now() + runSeconds * 1000 + 60_000) {
    console.error("REFUSED: minted sessions expire before this run would finish. Re-mint.");
    process.exit(2);
  }

  const admin = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: spots, error: spotsError } = await admin.from("spots").select("id").eq("source", "curated").limit(9);
  if (spotsError || spots.length < 9) throw new Error(`need 9 curated spots: ${spotsError?.message ?? spots.length}`);
  const planIds = Array.from({ length: plans }, () => randomUUID());
  for (const id of planIds) {
    const { error } = await admin.from("plans").insert({ id, title: `load ${label}`, category: "dinner", status: "open", stage: "pool", pool_count: 3 });
    if (error) throw new Error(`plan insert: ${error.message}`);
    const { error: linkError } = await admin.from("plan_spots").insert(
      spots.map((s, i) => ({ plan_id: id, spot_id: s.id, pool_number: (i % 3) + 1, advanced: false })),
    );
    if (linkError) throw new Error(`plan_spots insert: ${linkError.message}`);
  }
  const pool1 = spots.filter((_, i) => i % 3 === 0).map((s) => s.id);
  const assigned = guests.slice(0, n).map((g, idx) => ({
    ...g, idx, plan: planIds[Math.floor(idx / perPlan)], spot: pool1[idx % 3],
    hash: createHash("sha256").update(randomBytes(32)).digest("hex"), // participantTokenHash()'s shape
  }));
  const replicaIdentity = psql("select relreplident from pg_class where oid = 'public.votes'::regclass");

  const shards = await Promise.all(
    Array.from({ length: shardCount }, () =>
      new Promise((resolve) => {
        const child = fork(fileURLToPath(import.meta.url), ["shard"], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
        child.once("message", () => resolve(child));
      }),
    ),
  );
  const ask = (child, msg, replyType) =>
    new Promise((resolve) => {
      const onMsg = (m) => { if (m.type === replyType) { child.off("message", onMsg); resolve(m); } };
      child.on("message", onMsg);
      child.send(msg);
    });
  const sliceFor = (s) => assigned.filter((g) => g.idx % shardCount === s);

  // Join phase
  const tJoin = now();
  const joined = (await Promise.all(shards.map((c, s) => ask(c, { type: "join", guests: sliceFor(s) }, "joined")))).flatMap((m) => m.results);
  const joinWall = now() - tJoin;
  const okIdx = new Set(joined.filter((j) => j.ok).map((j) => j.idx));

  // Op phase -- schedule is absolute wall time, shared by every shard.
  const walBefore = psql("select pg_current_wal_lsn()");
  const start = now() + 2_000;
  const ops = Array.from({ length: totalOps }, (_, i) => ({ idx: i % n, tSched: start + (i * 1000) / rate }));
  await Promise.all(shards.map((c, s) => ask(c, { type: "go", ops: ops.filter((o) => o.idx % shardCount === s) }, "opsDone")));
  await sleep(QUIESCE_MS);
  const walBytes = Number(psql(`select pg_wal_lsn_diff(pg_current_wal_lsn(), '${walBefore}')`));

  const truth = new Map();
  for (const id of planIds) truth.set(id, Number(psql(`select count(*) from votes where plan_id = '${id}'`)));
  const reports = await Promise.all(shards.map((c) => ask(c, { type: "finish" }, "report")));
  await admin.from("plans").delete().in("id", planIds); // cascades votes, plan_spots, plan_access

  // ── analysis ──
  const opLog = reports.flatMap((r) => r.opLog);
  const receipts = reports.flatMap((r) => r.receipts);
  const byKey = new Map();
  for (const [key, , tRecv, tVisible] of receipts) {
    const list = byKey.get(key) ?? [];
    list.push([tRecv, tVisible]);
    byKey.set(key, list);
  }
  const subscribersOf = new Map(planIds.map((id) => [id, assigned.filter((g) => g.plan === id && okIdx.has(g.idx)).length]));
  const delivery = { INSERT: { expected: 0, received: 0 }, DELETE: { expected: 0, received: 0 } };
  const recvLat = [], visibleLat = [];
  let refetchFailedAfterEvent = 0;
  // Ops alternate per guest, so DELETE k removes the row INSERT k created.
  const idByInsertKey = new Map(reports.flatMap((r) => r.insertIds));
  const receiptKeyOf = (op) => {
    const [hash, type, k] = op.key.split("|");
    return type === "DELETE" ? `id:${idByInsertKey.get(`${hash}|INSERT|${k}`)}` : op.key;
  };
  for (const op of opLog.filter((o) => o.ok)) {
    const type = op.key.split("|")[1];
    const got = byKey.get(receiptKeyOf(op)) ?? [];
    delivery[type].expected += subscribersOf.get(op.plan);
    delivery[type].received += got.length;
    for (const [tRecv, tVisible] of got) {
      recvLat.push(tRecv - op.tSched);
      if (tVisible === -1) refetchFailedAfterEvent++;
      else visibleLat.push(tVisible - op.tSched);
    }
  }
  const opKeys = new Set(opLog.map(receiptKeyOf));
  const unmatchedReceipts = receipts.filter(([key]) => !opKeys.has(key)).length;
  const errors = {};
  for (const o of opLog.filter((o) => !o.ok)) errors[o.err] = (errors[o.err] ?? 0) + 1;
  const joinErrors = {};
  for (const j of joined.filter((j) => !j.ok)) joinErrors[j.err] = (joinErrors[j.err] ?? 0) + 1;
  const presenceFailed = joined.filter((j) => j.ok && !j.presenceOk).length;
  const channelEvents = reports.flatMap((r) => r.channelEvents);
  const dropsAfterSubscribe = channelEvents.filter(([, , status]) => status === "CHANNEL_ERROR" || status === "TIMED_OUT").length;
  const staleTallies = reports.flatMap((r) => r.tallies).filter((t) => okIdx.has(t.idx) && t.count !== truth.get(t.plan));
  const okOps = opLog.filter((o) => o.ok);
  const lags = [...reports.map((r) => r.lag), orchestratorLag()];
  const worstLag = Math.max(...lags.map((l) => l.p99));
  const ratio = (d) => (d.expected ? +(d.received / d.expected).toFixed(4) : null);

  const summary = {
    at: new Date().toISOString(), env: "local-docker", label, replicaIdentity,
    shape: { plans, perPlan, clients: n, shards: shardCount, rate, totalOps },
    valid: worstLag <= MAX_LOOP_LAG_P99_MS, generatorLagP99Ms: worstLag,
    join: { ok: okIdx.size, failed: n - okIdx.size, errors: joinErrors, presenceFailed, wallMs: Math.round(joinWall), latency: dist(joined.filter((j) => j.ok).map((j) => j.joinMs)) },
    ops: {
      ok: okOps.length, failed: opLog.length - okOps.length, errors,
      latencyFromScheduled: dist(okOps.map((o) => o.tEnd - o.tSched)),
      sendLagP99: pct(opLog.map((o) => o.tStart - o.tSched), 99),
      throughputPerSec: okOps.length ? +(okOps.length / ((Math.max(...okOps.map((o) => o.tEnd)) - start) / 1000)).toFixed(1) : 0,
    },
    delivery: { insertRatio: ratio(delivery.INSERT), deleteRatio: ratio(delivery.DELETE), ...delivery, unmatchedReceipts, dropsAfterSubscribe },
    tapToEventMs: dist(recvLat), tapToOthersScreenMs: dist(visibleLat), refetchFailedAfterEvent,
    refetch: { ...dist(reports.flatMap((r) => r.refetches.map(([ms]) => ms))), failed: reports.flatMap((r) => r.refetches).filter(([, ok]) => !ok).length },
    endState: { truth: Object.fromEntries(truth), staleClients: staleTallies.length },
    walBytes, walBytesPerOp: okOps.length ? Math.round(walBytes / okOps.length) : null,
  };
  const correct = summary.ops.failed === 0 && summary.join.failed === 0 && ratio(delivery.INSERT) === 1 && ratio(delivery.DELETE) === 1 && staleTallies.length === 0;
  summary.verdict = !summary.valid ? "INVALID" : correct ? "PASS" : "FAIL";

  await appendFile(RESULTS_FILE, `${JSON.stringify(summary)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n${summary.verdict}${summary.valid ? "" : ` -- generator lag p99 ${worstLag}ms > ${MAX_LOOP_LAG_P99_MS}ms; latencies measure this machine, not the app`}`);
  process.exit(summary.verdict === "PASS" ? 0 : 1);
}

const mode = process.argv[2];
if (mode === "shard") await shard();
else if (mode === "mint") await mint(Number(process.argv[3] ?? 10));
else if (mode === "run") await run();
else { console.error("usage: realtime-fanout.mjs mint <count> | run --plans P --per-plan K --rate R [--rounds 1] [--shards S] [--label x]"); process.exit(2); }
