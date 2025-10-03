import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

type UserOverview = {
  id: string;
  email: string;
  role: string;
  scopes: Array<{
    scopeId: string;
    accountId: string;
    fleetId: string | null;
    fleetName: string | null;
    canRead: boolean;
    canWrite: boolean;
    canInvite: boolean;
  }>;
};

export async function GET() {
  try {
    const context = await requireAuthContext();

    let accountIds: string[];
    if (isOwner(context)) {
      const accounts = await prisma.account.findMany({ select: { id: true } });
      accountIds = accounts.map((account) => account.id);
    } else {
      const readable = context.scopes.filter((scope) => scope.canRead);
      accountIds = Array.from(new Set(readable.map((scope) => scope.accountId)));
      if (!accountIds.length) {
        return jsonResponse({ accounts: [], users: [] });
      }
    }

    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      orderBy: { label: "asc" },
      include: {
        fleets: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            externalRef: true,
          },
        },
      },
    });

    const scopeRecords = await prisma.userScope.findMany({
      where: {
        accountId: { in: accountIds },
        ...(isOwner(context) ? {} : { userId: context.userId }),
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        fleet: { select: { id: true, name: true } },
      },
    });

    const usersList = await prisma.user.findMany({
      where: isOwner(context) ? {} : { id: context.userId },
      select: { id: true, email: true, role: true },
      orderBy: { email: "asc" },
    });

    const usersMap = new Map<string, UserOverview>();
    for (const record of scopeRecords) {
      const existing = usersMap.get(record.user.id);
      const entry: UserOverview = existing ?? {
        id: record.user.id,
        email: record.user.email,
        role: record.user.role,
        scopes: [],
      };
      entry.scopes = entry.scopes.concat({
        scopeId: record.id,
        accountId: record.accountId,
        fleetId: record.fleetId,
        fleetName: record.fleet?.name ?? null,
        canRead: record.canRead,
        canWrite: record.canWrite,
        canInvite: record.canInvite,
      });
      usersMap.set(record.user.id, entry);
    }

    // Ensure users with zero scopes still appear (owner can re-grant access)
    for (const user of usersList) {
      if (!usersMap.has(user.id)) {
        usersMap.set(user.id, { id: user.id, email: user.email, role: user.role, scopes: [] });
      }
    }

    return jsonResponse({
      viewer: { isOwner: isOwner(context), userId: context.userId },
      accounts,
      users: Array.from(usersMap.values()).sort((a, b) => a.email.localeCompare(b.email)),
    });
  } catch (error) {
    return handleApiError(error);
  }
}






