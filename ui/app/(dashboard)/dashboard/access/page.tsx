import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { AccessManager } from "@/components/access/access-manager";

export default async function AccessPage() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/login");
  }
  return <AccessManager />;
}
