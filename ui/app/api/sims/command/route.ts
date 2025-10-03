import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { decryptSecret } from "@/lib/crypto";
import { sendSmsCommand } from "@/lib/kore";
import { isSupportedCommand, isWriteCommand } from "@/lib/commands";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sleep } from "@/utils/retry";

const TargetSchema = z.object({
  accountId: z.string().min(1),
  simIds: z.array(z.string().min(1)).optional(),
  iccids: z.array(z.string().min(1)).optional(),
  uniqueNames: z.array(z.string().min(1)).optional(),
});

const BodySchema = z.object({
  command: z.string().min(1),
  text: z.string().max(160).optional(),
  accountScopedTargets: z.array(TargetSchema).min(1),
  throttle: z
    .object({
      perAccountPerSecond: z.number().min(1).max(30).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    const context = await requireAuthContext();
    const json = await request.json();
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonResponse({ error: "Invalid command payload" }, { status: 422 });
    }

    const body = parsed.data;
    const command = body.command.trim();

    if (!isSupportedCommand(command)) {
      return jsonResponse({ error: `Unsupported command ${command}` }, { status: 422 });
    }

    if (command === "custom") {
      if (!body.text || !body.text.trim()) {
        return jsonResponse({ error: "Custom command text is required" }, { status: 422 });
      }
    }

    const requiresWrite = isWriteCommand(command);

    enforceRateLimit(`command:${context.userId}`, { limit: 30, windowMs: 60_000 });

    const accountIds = body.accountScopedTargets.map((target) => target.accountId);

    const accounts: Array<{
      id: string;
      label: string;
      clientId: string;
      clientSecretEncrypted: string;
      oauthScope: string | null;
      oauthAudience: string | null;
    }> = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      include: {
        fleets: { select: { id: true, externalRef: true } },
      },
    });

    const accountMap = new Map(accounts.map((account) => [account.id, account]));

    const results: Array<{
      accountId: string;
      accountLabel: string;
      simSid: string;
      simId: string;
      iccid: string;
      status: string;
      message: string;
      command?: string;
      payload?: string;
      sentAt?: string;
    }> = [];

    for (const target of body.accountScopedTargets) {
      const account = accountMap.get(target.accountId);
      if (!account) {
        results.push({
          accountId: target.accountId,
          accountLabel: "Unknown",
          simSid: "",
          simId: "",
          iccid: "",
          status: "error",
          message: "Account not found",
        });
        continue;
      }

      const secret = decryptSecret(account.clientSecretEncrypted);
      const mappedScopes = isOwner(context)
        ? null
        : context.scopes.filter((scope) => scope.accountId === account.id);

      const simWhere: { accountId: string } & Record<string, unknown> = {
        accountId: account.id,
      };
      const identifiers: Array<Record<string, unknown>> = [];
      if (target.simIds?.length) {
        identifiers.push({ id: { in: target.simIds } });
      }
      if (target.iccids?.length) {
        identifiers.push({ iccid: { in: target.iccids } });
      }
      if (target.uniqueNames?.length) {
        identifiers.push({ uniqueName: { in: target.uniqueNames } });
      }
      if (!identifiers.length) {
        results.push({
          accountId: account.id,
          accountLabel: account.label,
          simSid: "",
          simId: "",
          iccid: "",
          status: "error",
          message: "No target identifiers supplied",
        });
        continue;
      }
      simWhere.OR = identifiers;

      const sims = await prisma.sim.findMany({
        where: simWhere,
        include: {
          fleet: true,
        },
      });

      if (!sims.length) {
        results.push({
          accountId: account.id,
          accountLabel: account.label,
          simSid: "",
          simId: "",
          iccid: "",
          status: "error",
          message: "No SIMs resolved for target",
        });
        continue;
      }

      const perAccountDelay = body.throttle?.perAccountPerSecond
        ? Math.ceil(1000 / body.throttle.perAccountPerSecond)
        : 0;

      for (const sim of sims) {
        if (!isOwner(context)) {
          const allowed = mappedScopes?.some((scope) => {
            const fleetMatch = scope.fleetId === null || scope.fleetId === sim.fleetId;
            if (!fleetMatch) {
              return false;
            }
            return requiresWrite ? scope.canWrite : scope.canRead;
          });
          if (!allowed) {
            results.push({
              accountId: account.id,
              accountLabel: account.label,
              simSid: sim.simSid,
              simId: sim.id,
              iccid: sim.iccid,
              status: "forbidden",
              message: `Write scope missing in Account ${account.label}`,
            });
            continue;
          }
        }

        // Device command string: for catalog commands, payload equals the command name;
        // for custom, payload equals the custom text.
        const commandToSend = command === "custom" ? body.text!.trim() : command;
        const payloadText = command === "custom" ? body.text!.trim() : command;
        const dispatchStartedAt = new Date().toISOString();

        try {
          await sendSmsCommand(
            {
              label: account.label,
              clientId: account.clientId,
              clientSecret: secret,
              scope: account.oauthScope ?? undefined,
              audience: account.oauthAudience ?? undefined,
            },
            {
              command: commandToSend,
              simSid: sim.simSid,
              text: payloadText || undefined,
            },
          );

          await prisma.commandLog.create({
            data: {
              accountId: account.id,
              simId: sim.id,
              command: commandToSend,
              direction: "outbound",
              payload: payloadText,
              createdAt: new Date(),
            },
          });

          // Return immediately with queued status; client will poll logs later.
          results.push({
            accountId: account.id,
            accountLabel: account.label,
            simSid: sim.simSid,
            simId: sim.id,
            iccid: sim.iccid,
            status: "queued",
            message: "",
            command: commandToSend,
            payload: payloadText,
            sentAt: dispatchStartedAt,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to send";
          results.push({
            accountId: account.id,
            accountLabel: account.label,
            simSid: sim.simSid,
            simId: sim.id,
            iccid: sim.iccid,
            status: "error",
            message,
            command: commandToSend,
            payload: payloadText,
            sentAt: dispatchStartedAt,
          });
        }

        if (perAccountDelay) {
          await sleep(perAccountDelay);
        }
      }
    }

    return jsonResponse({ ok: true, results });
  } catch (error) {
    return handleApiError(error);
  }
}
