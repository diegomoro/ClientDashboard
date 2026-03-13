import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";
import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { decryptSecret } from "@/lib/crypto";
import { listSimsFromKore, KoreHttpError } from "@/lib/kore";
import { logError } from "@/lib/logger";
import { sequentialProcess, parallelLimit, chunkArray } from "@/lib/db-utils";

const BodySchema = z.object({
  accountIds: z.array(z.string().min(1)).optional(),
  fleetIds: z.array(z.string().min(1)).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // In-process lock to avoid concurrent heavy SIM syncs
    const locks: Map<string, { inProgress: boolean; startedAt: number }> =
      (globalThis as unknown as { __syncLocks?: Map<string, { inProgress: boolean; startedAt: number }> }).__syncLocks ??
      new Map();
    (globalThis as unknown as { __syncLocks?: Map<string, { inProgress: boolean; startedAt: number }> }).__syncLocks = locks;
    const key = "sims-sync";
    const existing = locks.get(key);
    const now = Date.now();
    const ttlMs = 15 * 60 * 1000; // 15 minutes
    if (existing?.inProgress && now - existing.startedAt < ttlMs) {
      return jsonResponse({ ok: true, message: "SIM sync already in progress" }, { status: 202 });
    }
    locks.set(key, { inProgress: true, startedAt: now });
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
        // Require write scope to run sync for non-owners
        const writableScopes = context.scopes.filter((scope) => scope.canWrite);
        const allowedAccountIds = new Set(writableScopes.map((scope) => scope.accountId));
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

            // Diff against DB by simSid globally (SIMs can move accounts)
            const providerSids = sims.map((s) => s.sid);
            const existing = await prisma.sim.findMany({
              where: { simSid: { in: providerSids } },
              select: { id: true, simSid: true, iccid: true, uniqueName: true, status: true, lastSeenAt: true, fleetId: true, accountId: true },
            });
            const existingBySid = new Map(existing.map((e) => [e.simSid, e] as const));

            const toCreate: Array<{ accountId: string; fleetId: string; simSid: string; iccid: string; uniqueName: string | null; status: string; lastSeenAt: Date | null }>= [];
            type UpdateItem = { id: string; data: { iccid?: string; uniqueName?: string | null; status?: string; lastSeenAt?: Date | null; fleetId?: string; accountId?: string } };
            const toUpdate: UpdateItem[] = [];

            for (const p of sims) {
              const e = existingBySid.get(p.sid);
              const pLast = p.lastSeenAt ? new Date(p.lastSeenAt) : null;
              if (!e) {
                toCreate.push({
                  accountId: account.id,
                  fleetId: fleet.id,
                  simSid: p.sid,
                  iccid: p.iccid,
                  uniqueName: p.uniqueName ?? null,
                  status: p.status,
                  lastSeenAt: pLast,
                });
                continue;
              }
              const eLast = e.lastSeenAt ? new Date(e.lastSeenAt) : null;
              const changed =
                e.iccid !== p.iccid ||
                (e.uniqueName ?? null) !== (p.uniqueName ?? null) ||
                e.status !== p.status ||
                (eLast?.getTime?.() ?? 0) !== (pLast?.getTime?.() ?? 0) ||
                e.fleetId !== fleet.id ||
                e.accountId !== account.id;
              if (changed) {
                toUpdate.push({
                  id: e.id,
                  data: {
                    iccid: p.iccid,
                    uniqueName: p.uniqueName ?? null,
                    status: p.status,
                    lastSeenAt: pLast,
                    fleetId: fleet.id,
                    accountId: account.id,
                  },
                });
              }
            }

            if (toCreate.length) {
              for (const chunk of chunkArray(toCreate, 1000)) {
                await prisma.sim.createMany({ data: chunk, skipDuplicates: true });
              }
            }
            if (toUpdate.length) {
              await parallelLimit(toUpdate, 8, async (item) => {
                await prisma.sim.update({ where: { id: item.id }, data: item.data });
              }, { retries: 5, baseDelayMs: 200 });
            }

            summary.push({ accountId: account.id, fleetId: fleet.id, synced: sims.length });
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "sync failed";
          summary.push({ accountId: account.id, error: message });
        }
      });

      return jsonResponse({ ok: true, summary });
    } finally {
      locks.set(key, { inProgress: false, startedAt: Date.now() });
    }
  } catch (error) {
    return handleApiError(error);
  }
}

