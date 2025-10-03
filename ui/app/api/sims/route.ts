import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    const search = request.nextUrl.searchParams;
    const accountFilters = search.getAll("accountId").concat(search.getAll("accountId[]"));
    const fleetFilters = search.getAll("fleetId").concat(search.getAll("fleetId[]"));

    let whereClause: { accountId?: { in: string[] }; fleetId?: { in: string[] } } | undefined;

    if (isOwner(context)) {
      whereClause = {};
      if (accountFilters.length) {
        whereClause.accountId = { in: accountFilters };
      }
      if (fleetFilters.length) {
        whereClause.fleetId = { in: fleetFilters };
      }
    } else {
      const readable = context.scopes.filter((scope) => scope.canRead);
      if (!readable.length) {
        return jsonResponse({ sims: [] });
      }
      const fleetIds = new Set(
        readable.filter((scope) => scope.fleetId).map((scope) => scope.fleetId as string),
      );
      const accountIds = new Set(readable.map((scope) => scope.accountId));

      const allowedFleetIds = fleetFilters.length
        ? fleetFilters.filter((fleetId) => fleetIds.has(fleetId))
        : Array.from(fleetIds);
      const allowedAccountIds = accountFilters.length
        ? accountFilters.filter((accountId) => accountIds.has(accountId))
        : Array.from(accountIds);

      whereClause = {
        accountId: { in: allowedAccountIds },
      };
      if (allowedFleetIds.length) {
        whereClause.fleetId = { in: allowedFleetIds };
      }
    }

    const sims = await prisma.sim.findMany({
      where: whereClause,
      orderBy: [{ account: { label: "asc" } }, { iccid: "asc" }],
      select: {
        id: true,
        accountId: true,
        fleetId: true,
        simSid: true,
        iccid: true,
        uniqueName: true,
        status: true,
        lastSeenAt: true,
        account: {
          select: { label: true },
        },
        fleet: {
          select: { name: true, externalRef: true },
        },
      },
    });

    const payload = sims.map((sim: {
      id: string;
      accountId: string;
      account: { label: string };
      fleetId: string;
      fleet: { name: string; externalRef: string };
      simSid: string;
      iccid: string;
      uniqueName: string | null;
      status: string;
      lastSeenAt: Date | null;
    }) => ({
      id: sim.id,
      accountId: sim.accountId,
      accountLabel: sim.account.label,
      fleetId: sim.fleetId,
      fleetName: sim.fleet.name,
      fleetExternalRef: sim.fleet.externalRef,
      simSid: sim.simSid,
      iccid: sim.iccid,
      uniqueName: sim.uniqueName,
      status: sim.status,
      lastSeenAt: sim.lastSeenAt,
    }));

    return jsonResponse({ sims: payload });
  } catch (error) {
    return handleApiError(error);
  }
}
