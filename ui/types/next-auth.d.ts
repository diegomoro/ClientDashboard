import type { Scope } from "@/lib/auth/scopes";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: (DefaultSession["user"] & {
      id: string;
      role: "owner" | "agent";
      scopes: Scope[];
    }) | null;
  }

  interface User {
    id: string;
    role: "owner" | "agent";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: "owner" | "agent";
    scopesFetchedAt?: number;
  }
}
