// Guards the one hand-synced pairing in the repo: every column in
// supabase/schema.sql must be mentioned somewhere in lib/types.ts.
//
// This is deliberately shallow. It catches the failure that actually happened
// here — a column added to the schema and forgotten in the types — and nothing
// subtler. It does not check types, nullability, or types-ahead-of-schema.
//
//   node scripts/check-schema-types.mjs
//
// Exit 1 and print the offenders on drift. Run in CI.

import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const types = readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");

// Column names that carry no meaning if matched — every table has them and a
// bare-word match proves nothing. Not exempt from needing a type, just not
// worth failing the build over a false "present".
const NOISE = new Set(["id", "created_at", "updated_at"]);

// Tables the browser never reads as rows — accessed only through
// security-definer RPCs, with RLS on and no select policy (see migration 020).
// lib/types.ts deliberately has no interface for these.
const SERVER_ONLY = new Set([
  "plan_host_tokens", "member_ages", "plan_access",
  "app_control_secrets", "app_rate_limits", "security_events",
]);

// Lines inside a create-table body that are constraints, not columns.
const NOT_A_COLUMN = /^\s*(primary\s+key|foreign\s+key|unique|check|constraint|references)\b/i;

const tableRe = /^create table (?:if not exists )?(\w+) \(/gim;
const missing = [];
let m;

while ((m = tableRe.exec(schema))) {
  const table = m[1];
  if (SERVER_ONLY.has(table)) continue;
  const bodyStart = m.index + m[0].length;
  // Body ends at the first line that begins with ')' — matches this file's style.
  const end = schema.indexOf("\n)", bodyStart);
  const body = schema.slice(bodyStart, end === -1 ? undefined : end);

  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/--.*$/, "").trim();
    if (!line || NOT_A_COLUMN.test(line)) continue;
    const col = line.match(/^(\w+)\s/)?.[1];
    if (!col || NOISE.has(col)) continue;
    // Word-boundary match anywhere in the types file.
    if (!new RegExp(`\\b${col}\\b`).test(types)) {
      missing.push(`${table}.${col}`);
    }
  }
}

if (missing.length) {
  console.error("schema.sql columns with no mention in lib/types.ts:\n  " + missing.join("\n  "));
  console.error("\nThese are hand-synced. Update lib/types.ts in the same change.");
  process.exit(1);
}
console.log("schema.sql <-> lib/types.ts: no drift");
