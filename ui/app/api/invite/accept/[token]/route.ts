import { NextRequest } from "next/server";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { jsonResponse } from "@/lib/response";
import { handleApiError } from "@/lib/api";

const AcceptSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        scopes: {
          include: {
            account: { select: { label: true } },
            fleet: { select: { name: true } },
          },
        },
      },
    });
    if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
      return jsonResponse({ error: "Invite not found" }, { status: 404 });
    }
    return jsonResponse({ invite });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: { scopes: true },
    });
    if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
      return jsonResponse({ error: "Invite not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = AcceptSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid payload" }, { status: 422 });
    }

    if (invite.email && invite.email.toLowerCase() !== parsed.data.email.toLowerCase()) {
      return jsonResponse({ error: "Email does not match invite" }, { status: 422 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (existingUser) {
      return jsonResponse({ error: "User already exists. Please sign in." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: parsed.data.email.toLowerCase(),
          passwordHash,
          role: "agent",
        },
      });

      for (const scope of invite.scopes) {
        if (scope.fleetId) {
          await tx.userScope.upsert({
            where: {
              userId_accountId_fleetId: {
                userId: user.id,
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
              userId: user.id,
              accountId: scope.accountId,
              fleetId: scope.fleetId,
              canRead: scope.canRead,
              canWrite: scope.canWrite,
              canInvite: scope.canInvite,
            },
          });
        } else {
          const existing = await tx.userScope.findFirst({
            where: { userId: user.id, accountId: scope.accountId, fleetId: null },
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
                userId: user.id,
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

      await tx.invite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
