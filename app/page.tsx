import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function IndexPage() {
  const user = await getCurrentUser();
  redirect(user ? "/home" : "/login");
}
