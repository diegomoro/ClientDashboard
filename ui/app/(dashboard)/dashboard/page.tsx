import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { SimConsole } from "@/components/sims/sim-console";

export default async function SimsPage() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/login");
  }
  const hasAccess = session.user?.role === "owner" || (session.user?.scopes ?? []).some((scope) => scope.canRead);
  return <SimConsole hasAccess={Boolean(hasAccess)} />;
}
