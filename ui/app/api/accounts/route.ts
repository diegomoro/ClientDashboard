import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";

export async function GET() {
  try {
    const context = await requireAuthContext();
    let accounts;
    if (isOwner(context)) {
      accounts = await prisma.account.findMany({
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          isParent: true,
        },
      });
    } else {
      const accountIds = Array.from(new Set(context.scopes.map((scope) => scope.accountId)));
      accounts = await prisma.account.findMany({
        where: { id: { in: accountIds } },
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          isParent: true,
        },
      });
    }
    return jsonResponse({ accounts });
  } catch (error) {
    return handleApiError(error);
  }
}
