import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { decryptSecret } from "@/lib/crypto";
import { listFleetsFromKore } from "@/lib/kore";
import { sequentialProcess } from "@/lib/db-utils";

const BodySchema = z.object({
  accountIds: z.array(z.string().min(1)).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    let body: z.infer<typeof BodySchema> = {};
    const len = request.headers.get("content-length");
    if (len && Number(len) > 0) {
      try {
        const json = await request.json();
        const parsed = BodySchema.safeParse(json);
        if (!parsed.success) {
          return jsonResponse({ error: "Invalid request body" }, { status: 422 });
        }
        body = parsed.data;
      } catch {
        body = ({} as z.infer<typeof BodySchema>);
      }
    }

    let targetAccountIds: string[];
    if (isOwner(context)) {
      if (body.accountIds?.length) {
        targetAccountIds = body.accountIds;
      } else {
        const all = await prisma.account.findMany({ select: { id: true } });
        targetAccountIds = all.map((account: { id: string }) => account.id);
      }
    } else {
      const readableAccountIds = Array.from(
        new Set(context.scopes.filter((s) => s.canWrite).map((s) => s.accountId)),
      );
      if (!readableAccountIds.length) {
        return jsonResponse({ error: "Write scope required to sync fleets" }, { status: 403 });
      }
      targetAccountIds = body.accountIds?.length
        ? body.accountIds.filter((id) => readableAccountIds.includes(id))
        : readableAccountIds;
    }

    const accounts: Array<{
      id: string;
      label: string;
      clientId: string;
      clientSecretEncrypted: string;
      oauthScope: string | null;
      oauthAudience: string | null;
    }> = await prisma.account.findMany({
      where: { id: { in: targetAccountIds } },
    });

    const results: Array<{ accountId: string; fleets: number; error?: string }> = [];

    await sequentialProcess(accounts, async (account) => {
      try {
        const secret = decryptSecret(account.clientSecretEncrypted);
        const fleets = await listFleetsFromKore({
          label: account.label,
          clientId: account.clientId,
          clientSecret: secret,
          scope: account.oauthScope ?? undefined,
          audience: account.oauthAudience ?? undefined,
        });

        for (const fleet of fleets) {
          const upserted = await prisma.fleet.upsert({
            where: { accountId_externalRef: { accountId: account.id, externalRef: fleet.sid } },
            update: { name: fleet.friendlyName, accountId: account.id },
            create: { accountId: account.id, name: fleet.friendlyName, externalRef: fleet.sid },
          });

          if (isOwner(context)) {
            await prisma.userScope.upsert({
              where: {
                userId_accountId_fleetId: {
                  userId: context.userId,
                  accountId: account.id,
                  fleetId: upserted.id,
                },
              },
              update: { canRead: true, canWrite: true, canInvite: true },
              create: {
                userId: context.userId,
                accountId: account.id,
                fleetId: upserted.id,
                canRead: true,
                canWrite: true,
                canInvite: true,
              },
            });
          }
        }
        results.push({ accountId: account.id, fleets: fleets.length });
      } catch (err) {
        const message = err instanceof Error ? err.message : "sync failed";
        results.push({ accountId: account.id, fleets: 0, error: message });
      }
    });

    return jsonResponse({ ok: true, results });
  } catch (error) {
    return handleApiError(error);
  }
}



