const baseUrl = process.env.BASE_URL ?? "http://localhost:3001";

async function check(path, expected, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  if (response.status !== expected) throw new Error(`${path}: expected ${expected}, received ${response.status}`);
  console.log(`ok ${path} (${response.status})`);
}

await check("/login", 200);
await check("/home-preview", 200);
await check("/api/plans", 401, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
console.log("Smoke checks passed.");
