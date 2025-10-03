import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { enforceRateLimit } from "@/lib/rate-limit";

const ScopeSchema = z.object({
  accountId: z.string().min(1),
  fleetId: z.string().min(1).optional().nullable(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canInvite: z.boolean(),
});

const CreateInviteSchema = z.object({
  email: z.string().email().optional(),
  expiresInHours: z.number().int().min(1).max(720).optional(),
  scopes: z.array(ScopeSchema).min(1),
});

export async function GET() {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ invites: [] });
    }
    const invites = await prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        scopes: {
          include: {
            account: {
              select: { label: true },
            },
            fleet: {
              select: { name: true },
            },
          },
        },
      },
    });

    const visible = isOwner(context)
      ? invites
      : invites.filter((invite: { scopes: Array<{ accountId: string; fleetId: string | null }> }) =>
          invite.scopes.some((scope) =>
            context.scopes.some((userScope) => {
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
            }),
          ),
        );

    // Expose tokens so the owner can copy the link
    return jsonResponse({ invites: visible });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ error: "Only the owner can create invites" }, { status: 403 });
    }
    const body = await request.json();
    enforceRateLimit(`invite-create:${context.userId}`, { limit: 20, windowMs: 60_000 });
    const parsed = CreateInviteSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid invite payload" }, { status: 422 });
    }
    const { email, scopes, expiresInHours } = parsed.data;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (expiresInHours ?? 72) * 60 * 60 * 1000);

    const targetScopes = await prisma.account.findMany({
      where: { id: { in: scopes.map((scope) => scope.accountId) } },
      select: { id: true },
    });

    if (targetScopes.length !== new Set(scopes.map((scope) => scope.accountId)).size) {
      return jsonResponse({ error: "Unknown account in scopes" }, { status: 400 });
    }

    for (const scope of scopes) {
      if (!scope.canRead && !scope.canWrite && !scope.canInvite) {
        return jsonResponse({ error: "At least one permission must be granted" }, { status: 422 });
      }
    }

    const token = crypto.randomUUID().replace(/-/g, "");

    const invite = await prisma.invite.create({
      data: {
        token,
        email,
        expiresAt,
        createdById: context.userId,
        scopes: {
          create: scopes.map((scope) => ({
            accountId: scope.accountId,
            fleetId: scope.fleetId ?? null,
            canRead: scope.canRead,
            canWrite: scope.canWrite,
            canInvite: scope.canInvite,
          })),
        },
      },
      include: {
        scopes: true,
      },
    });

    return jsonResponse({ invite });
  } catch (error) {
    return handleApiError(error);
  }
}
