import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.user) {
    redirect("/login");
  }
  return <DashboardShell>{children}</DashboardShell>;
}
