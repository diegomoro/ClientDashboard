import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { decryptSecret } from "@/lib/crypto";
import { listSimsFromKore, KoreHttpError } from "@/lib/kore";
import { logError } from "@/lib/logger";
import { sequentialProcess } from "@/lib/db-utils";

const BodySchema = z.object({
  accountIds: z.array(z.string().min(1)).optional(),
  fleetIds: z.array(z.string().min(1)).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    let json: unknown = {};
    const len = request.headers.get("content-length");
    if (len && Number(len) > 0) {
      try { json = await request.json(); } catch { json = {}; }
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid request body" }, { status: 422 });
    }
    const body = parsed.data;

    const accountFilter = body.accountIds;
    const fleetFilter = body.fleetIds;

    let accountIds: string[];
    if (isOwner(context)) {
      if (accountFilter?.length) {
        accountIds = accountFilter;
      } else {
        const all = await prisma.account.findMany({ select: { id: true } });
        accountIds = all.map((account: { id: string }) => account.id);
      }
    } else {
      const readableScopes = context.scopes.filter((scope) => scope.canRead);
      const allowedAccountIds = new Set(readableScopes.map((scope) => scope.accountId));
      if (!allowedAccountIds.size) {
        return jsonResponse({ error: "No access granted" }, { status: 403 });
      }
      accountIds = accountFilter?.length
        ? accountFilter.filter((id) => allowedAccountIds.has(id))
        : Array.from(allowedAccountIds);
      if (!accountIds.length) {
        return jsonResponse({ error: "No permitted accounts in request" }, { status: 403 });
      }
    }

    const accounts: Array<{
      id: string;
      label: string;
      clientId: string;
      clientSecretEncrypted: string;
      oauthScope: string | null;
      oauthAudience: string | null;
      fleets: Array<{ id: string; externalRef: string }>;
    }> = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      include: {
        fleets: true,
      },
    });

    const summary: Array<{ accountId: string; fleetId?: string; synced?: number; error?: string }> = [];

    await sequentialProcess(accounts, async (account) => {
      try {
        const secret = decryptSecret(account.clientSecretEncrypted);
        const accountScope = isOwner(context)
          ? null
          : context.scopes.filter((scope) => scope.accountId === account.id && scope.canRead);
        const targetFleets = account.fleets.filter((fleet) => {
          if (fleetFilter?.length && !fleetFilter.includes(fleet.id)) {
            return false;
          }
          if (isOwner(context)) {
            return true;
          }
          return accountScope?.some((scope) => scope.fleetId === null || scope.fleetId === fleet.id) ?? false;
        });

      await sequentialProcess(targetFleets, async (fleet) => {
        let sims;
        try {
          sims = await listSimsFromKore(
            {
              label: account.label,
              clientId: account.clientId,
              clientSecret: secret,
              scope: account.oauthScope ?? undefined,
              audience: account.oauthAudience ?? undefined,
            },
            fleet.externalRef,
          );
        } catch (err) {
          if (err instanceof KoreHttpError && err.status === 404) {
            logError("Fleet not found when listing sims; skipping", {
              accountId: account.id,
              accountLabel: account.label,
              fleetId: fleet.id,
              fleetExternalRef: fleet.externalRef,
            });
            return; // skip this fleet
          }
          throw err;
        }

        await sequentialProcess(
          sims,
          async (sim) => {
            await prisma.sim.upsert({
              where: { simSid: sim.sid },
              update: {
                iccid: sim.iccid,
                uniqueName: sim.uniqueName,
                status: sim.status,
                lastSeenAt: sim.lastSeenAt ? new Date(sim.lastSeenAt) : null,
                accountId: account.id,
                fleetId: fleet.id,
              },
              create: {
                accountId: account.id,
                fleetId: fleet.id,
                simSid: sim.sid,
                iccid: sim.iccid,
                uniqueName: sim.uniqueName,
                status: sim.status,
                lastSeenAt: sim.lastSeenAt ? new Date(sim.lastSeenAt) : null,
              },
            });
          },
          { retries: 5, baseDelayMs: 200 },
        );

        summary.push({ accountId: account.id, fleetId: fleet.id, synced: sims.length });
      });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        summary.push({ accountId: account.id, error: message });
      }
    });

    return jsonResponse({ ok: true, summary });
  } catch (error) {
    return handleApiError(error);
  }
}

