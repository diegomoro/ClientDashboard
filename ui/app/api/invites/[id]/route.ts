import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { jsonResponse } from "@/lib/response";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuthContext();
    const { id } = await params;
    enforceRateLimit(`invite-delete:${context.userId}`, { limit: 20, windowMs: 60_000 });

    const invite = await prisma.invite.findUnique({
      where: { id },
      include: { scopes: true },
    });
    if (!invite) {
      return jsonResponse({ error: "Invite not found" }, { status: 404 });
    }

    if (!isOwner(context)) {
      return jsonResponse({ error: "Only the owner can revoke invites" }, { status: 403 });
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.inviteFleetScope.deleteMany({ where: { inviteId: id } });
      await tx.invite.delete({ where: { id } });
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

