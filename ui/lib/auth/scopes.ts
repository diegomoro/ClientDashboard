import { prisma } from "@/lib/prisma";

export type Scope = {
  scopeId: string;
  accountId: string;
  accountLabel: string;
  fleetId: string | null;
  fleetName: string | null;
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
};

export async function loadUserScopes(userId: string): Promise<Scope[]> {
  const data = await prisma.userScope.findMany({
    where: { userId },
    include: {
      account: true,
      fleet: true,
    },
    orderBy: [{ account: { label: "asc" } }, { fleet: { name: "asc" } }],
  });

  return data.map((item) => ({
    scopeId: item.id,
    accountId: item.accountId,
    accountLabel: item.account.label,
    fleetId: item.fleetId,
    fleetName: item.fleet?.name ?? null,
    canRead: item.canRead,
    canWrite: item.canWrite,
    canInvite: item.canInvite,
  }));
}

export function hasReadAccess(scopes: Scope[], accountId: string, fleetId?: string | null) {
  return scopes.some((scope) => {
    if (scope.accountId !== accountId) {
      return false;
    }
    if (fleetId) {
      return scope.fleetId === fleetId && scope.canRead;
    }
    return scope.fleetId === null ? scope.canRead : scope.canRead;
  });
}

export function hasWriteAccess(scopes: Scope[], accountId: string, fleetId?: string | null) {
  return scopes.some((scope) => {
    if (scope.accountId !== accountId) {
      return false;
    }
    if (fleetId) {
      return scope.fleetId === fleetId && scope.canWrite;
    }
    return scope.fleetId === null ? scope.canWrite : scope.canWrite;
  });
}

export function hasInviteAccess(scopes: Scope[], accountId: string, fleetId?: string | null) {
  return scopes.some((scope) => {
    if (scope.accountId !== accountId) {
      return false;
    }
    if (fleetId) {
      return scope.fleetId === fleetId && scope.canInvite;
    }
    return scope.fleetId === null ? scope.canInvite : scope.canInvite;
  });
}

export function assertReadable(scopes: Scope[], accountId: string, fleetId?: string | null) {
  if (!hasReadAccess(scopes, accountId, fleetId)) {
    throw new Error(`Read scope missing for account ${accountId}${fleetId ? ` / fleet ${fleetId}` : ""}`);
  }
}

export function assertWritable(scopes: Scope[], accountId: string, fleetId?: string | null) {
  if (!hasWriteAccess(scopes, accountId, fleetId)) {
    throw new Error(`Write scope missing for account ${accountId}${fleetId ? ` / fleet ${fleetId}` : ""}`);
  }
}

export function assertInvitable(scopes: Scope[], accountId: string, fleetId?: string | null) {
  if (!hasInviteAccess(scopes, accountId, fleetId)) {
    throw new Error(`Invite scope missing for account ${accountId}${fleetId ? ` / fleet ${fleetId}` : ""}`);
  }
}
