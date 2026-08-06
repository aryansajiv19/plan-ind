import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (user) redirect("/home");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-grape">
          Deal three
        </p>
        <h1 className="mt-3 text-5xl font-extrabold leading-[0.92]">
          Plans happen
          <br />
          <span className="text-punch">together.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-muted">
          Sign in to plan a hangout, remember your favourite spots, and keep your crew close.
        </p>
      </div>

      <AuthForm pageError={params.error} />
    </main>
  );
}
