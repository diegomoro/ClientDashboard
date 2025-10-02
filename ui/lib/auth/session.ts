import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { HttpError } from "@/lib/errors";

export async function getServerAuthSession(): Promise<Session | null> {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    console.warn("[auth] getServerAuthSession failed; treating as signed out", error);
    return null;
  }
}

export async function requireServerSession(): Promise<Session> {
  const session = await getServerAuthSession();
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  return session;
}
