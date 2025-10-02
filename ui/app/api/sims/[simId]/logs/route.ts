import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { decryptSecret } from "@/lib/crypto";
import { listSmsLogs } from "@/lib/kore";

export async function GET(request: NextRequest, { params }: { params: Promise<{ simId: string }> }) {
  try {
    const context = await requireAuthContext();
    const { simId } = await params;
    const accountId = request.nextUrl.searchParams.get("accountId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    const createdAfter = request.nextUrl.searchParams.get("createdAfter") ?? undefined;

    if (!accountId) {
      return jsonResponse({ error: "accountId is required" }, { status: 400 });
    }

    const sim = await prisma.sim.findUnique({
      where: { id: simId },
      include: {
        account: true,
      },
    });
    if (!sim || sim.accountId !== accountId) {
      return jsonResponse({ error: "SIM not found" }, { status: 404 });
    }

    if (!isOwner(context)) {
      const allowed = context.scopes.some((scope) => {
        if (scope.accountId !== accountId) {
          return false;
        }
        const fleetMatch = scope.fleetId === null || scope.fleetId === sim.fleetId;
        return fleetMatch && scope.canRead;
      });
      if (!allowed) {
        return jsonResponse({ error: "Read scope missing" }, { status: 403 });
      }
    }

    const accountSecret = decryptSecret(sim.account.clientSecretEncrypted);
    const logs = await listSmsLogs(
      {
        label: sim.account.label,
        clientId: sim.account.clientId,
        clientSecret: accountSecret,
        scope: sim.account.oauthScope ?? undefined,
        audience: sim.account.oauthAudience ?? undefined,
      },
      {
        simSid: sim.simSid,
        createdAfter,
        nextPageUrl: cursor,
        pageSize: 50,
      },
    );

    return jsonResponse({ logs: logs.commands, nextCursor: logs.nextPageUrl });
  } catch (error) {
    return handleApiError(error);
  }
}
