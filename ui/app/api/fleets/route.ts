import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    const params = request.nextUrl.searchParams;
    const filters = params.getAll("accountId").concat(params.getAll("accountId[]"));
    let accountIdsFilter = filters.length ? filters : undefined;

    if (isOwner(context)) {
      const fleets = await prisma.fleet.findMany({
        where: accountIdsFilter ? { accountId: { in: accountIdsFilter } } : undefined,
        orderBy: [{ account: { label: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          accountId: true,
          externalRef: true,
        },
      });
      return jsonResponse({ fleets });
    }

    const readableScopes = context.scopes.filter((scope) => scope.canRead);
    const allowedAccountIds = new Set(readableScopes.map((scope) => scope.accountId));

    if (accountIdsFilter) {
      accountIdsFilter = accountIdsFilter.filter((accountId) => allowedAccountIds.has(accountId));
    }

    const fleets = await prisma.fleet.findMany({
      where: {
        accountId: {
          in: accountIdsFilter ?? Array.from(allowedAccountIds),
        },
      },
      orderBy: [{ account: { label: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        accountId: true,
        externalRef: true,
      },
    });

    return jsonResponse({ fleets });
  } catch (error) {
    return handleApiError(error);
  }
}
