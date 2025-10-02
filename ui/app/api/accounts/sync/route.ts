import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { getKoreAccounts } from "@/lib/env";
import { encryptSecret } from "@/lib/crypto";
import { requireAuthContext, isOwner } from "@/lib/auth/context";

export async function POST() {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ error: "Only the owner can sync accounts" }, { status: 403 });
    }
    const envAccounts = getKoreAccounts();
    const ownerId = context.userId;
    const synced: Array<{ id: string; label: string }> = [];

    for (const accountConfig of envAccounts) {
      const encryptedSecret = encryptSecret(accountConfig.clientSecret);
      const account = await prisma.account.upsert({
        where: { clientId: accountConfig.clientId },
        update: {
          label: accountConfig.label,
          clientSecretEncrypted: encryptedSecret,
          oauthScope: accountConfig.scope ?? null,
          oauthAudience: accountConfig.audience ?? null,
        },
        create: {
          label: accountConfig.label,
          clientId: accountConfig.clientId,
          clientSecretEncrypted: encryptedSecret,
          oauthScope: accountConfig.scope ?? null,
          oauthAudience: accountConfig.audience ?? null,
          isParent: accountConfig.label.toLowerCase() === "parent",
        },
      });

      synced.push({ id: account.id, label: account.label });

      const existing = await prisma.userScope.findFirst({
        where: { userId: ownerId, accountId: account.id, fleetId: null },
      });
      if (existing) {
        await prisma.userScope.update({
          where: { id: existing.id },
          data: { canRead: true, canWrite: true, canInvite: true },
        });
      } else {
        await prisma.userScope.create({
          data: {
            userId: ownerId,
            accountId: account.id,
            fleetId: null,
            canRead: true,
            canWrite: true,
            canInvite: true,
          },
        });
      }
    }

    return jsonResponse({ ok: true, accounts: synced });
  } catch (error) {
    return handleApiError(error);
  }
}
