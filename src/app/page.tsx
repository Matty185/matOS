import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/current-member";

// Middleware guarantees a session reaches this point (Stage 3: "/" was
// removed from the public allowlist, since there's now a real destination
// to send everyone to instead of a static placeholder).
export default async function RootPage() {
  const member = await getCurrentMember();

  if (!member) redirect("/login");
  redirect(member.role === "athlete" ? "/home" : "/dashboard");
}
