import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { jsonResponse } from "@/lib/response";
import { handleApiError } from "@/lib/api";

const ScopeUpdateSchema = z.object({
  accountId: z.string().min(1),
  fleetId: z.string().min(1).optional().nullable(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canInvite: z.boolean(),
});

const BodySchema = z.object({
  scopes: z.array(ScopeUpdateSchema).min(1),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ error: "Only the owner can modify user scopes" }, { status: 403 });
    }
    const { id } = await params;
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return jsonResponse({ error: "User not found" }, { status: 404 });
    }
    // Owner modifying owner is allowed only for self-hardening; keep as-is

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid payload" }, { status: 422 });
    }

    for (const scope of parsed.data.scopes) {
      if (!scope.canRead && !scope.canWrite && !scope.canInvite) {
        continue;
      }
      if (!isOwner(context)) {
        const allowed = context.scopes.some((userScope) => {
          if (userScope.accountId !== scope.accountId) {
            return false;
          }
          if (!userScope.canInvite) {
            return false;
          }
          if (scope.fleetId) {
            return userScope.fleetId === null || userScope.fleetId === scope.fleetId;
          }
          return true;
        });
        if (!allowed) {
          return jsonResponse({ error: `Invite scope missing for account ${scope.accountId}` }, { status: 403 });
        }
      }
    }

    const updates = parsed.data.scopes;

    await prisma.$transaction(async (tx) => {
      for (const scope of updates) {
        if (!scope.canRead && !scope.canWrite && !scope.canInvite) {
          await tx.userScope.deleteMany({
            where: {
              userId: id,
              accountId: scope.accountId,
              fleetId: scope.fleetId ?? null,
            },
          });
          continue;
        }
        if (scope.fleetId) {
          // Fleet-scoped: composite unique works
          await tx.userScope.upsert({
            where: {
              userId_accountId_fleetId: {
                userId: id,
                accountId: scope.accountId,
                fleetId: scope.fleetId,
              },
            },
            update: {
              canRead: scope.canRead,
              canWrite: scope.canWrite,
              canInvite: scope.canInvite,
            },
            create: {
              userId: id,
              accountId: scope.accountId,
              fleetId: scope.fleetId,
              canRead: scope.canRead,
              canWrite: scope.canWrite,
              canInvite: scope.canInvite,
            },
          });
        } else {
          // Account-wide (fleetId null): composite unique cannot be used; do findFirst + update/create
          const existing = await tx.userScope.findFirst({
            where: { userId: id, accountId: scope.accountId, fleetId: null },
          });
          if (existing) {
            await tx.userScope.update({
              where: { id: existing.id },
              data: {
                canRead: scope.canRead,
                canWrite: scope.canWrite,
                canInvite: scope.canInvite,
              },
            });
          } else {
            await tx.userScope.create({
              data: {
                userId: id,
                accountId: scope.accountId,
                fleetId: null,
                canRead: scope.canRead,
                canWrite: scope.canWrite,
                canInvite: scope.canInvite,
              },
            });
          }
        }
      }
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ error: "Only the owner can modify user scopes" }, { status: 403 });
    }
    const { id } = await params;
    const accountId = request.nextUrl.searchParams.get("accountId") ?? undefined;
    await prisma.userScope.deleteMany({ where: { userId: id, ...(accountId ? { accountId } : {}) } });
    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
