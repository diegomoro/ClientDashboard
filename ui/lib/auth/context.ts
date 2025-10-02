import type { Session } from "next-auth";
import { requireServerSession } from "@/lib/auth/session";
import type { Scope } from "@/lib/auth/scopes";
import { HttpError } from "@/lib/errors";

export type AuthContext = {
  session: Session;
  userId: string;
  role: "owner" | "agent";
  scopes: Scope[];
};

export async function requireAuthContext(): Promise<AuthContext> {
  const session = await requireServerSession();
  if (!session.user) {
    throw new HttpError(401, "Unauthorized");
  }
  return {
    session,
    userId: session.user.id,
    role: session.user.role,
    scopes: session.user.scopes,
  };
}

export function isOwner(context: AuthContext) {
  return context.role === "owner";
}
