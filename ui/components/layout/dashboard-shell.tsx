"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import clsx from "clsx";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  { href: "/dashboard", label: "SIMs" },
  { href: "/dashboard/access", label: "Access" },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    toast.success("Signed out");
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen bg-neutral-100">
      <aside className="flex w-64 flex-col border-r border-neutral-200 bg-white p-6">
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-neutral-900">Client Ops Console</h1>
          <p className="text-sm text-neutral-500">Operations &amp; access control</p>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            let active = false;
            if (item.href === "/dashboard") {
              active = pathname === "/dashboard";
            } else {
              active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={clsx(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-200",
                  active
                    ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                    : "text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 text-sm text-neutral-600">
          <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <p className="font-medium text-neutral-800">{session?.user?.email}</p>
            <p className="text-xs uppercase tracking-wide text-neutral-500">{session?.user?.role ?? "agent"}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-screen-xl">{children}</div>
      </main>
    </div>
  );
}
