"use client";

function csrfToken(): string {
  const preferred = process.env.NODE_ENV === "production" ? "__Host-csrf" : "csrf";
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${preferred}=`))
    ?.slice(preferred.length + 1) ?? "";
}

export function secureJsonFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  headers.set("x-csrf-token", csrfToken());
  return fetch(input, { ...init, headers });
}
