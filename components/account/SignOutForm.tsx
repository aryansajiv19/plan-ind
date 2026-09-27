"use client";

import { signOut } from "@/app/auth/actions";
import { clearAccountState } from "@/lib/device";

// Sign out, forgetting this device's per-plan keys first (R14).
export default function SignOutForm({ name }: { name: string }) {
  return (
    <form action={signOut} onSubmit={() => clearAccountState()} className="home-profile-actions">
      <span>Signed in as {name}</span>
      <button type="submit">Sign out</button>
    </form>
  );
}
