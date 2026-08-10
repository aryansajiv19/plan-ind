import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function IndexPage() {
  const user = await getCurrentUser();
  if (!user && process.env.NODE_ENV !== "production") redirect("/home-preview");
  redirect(user ? "/home" : "/login");
}
