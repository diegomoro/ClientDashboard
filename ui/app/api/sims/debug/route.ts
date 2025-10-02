import { requireAuthContext, isOwner } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { jsonResponse } from "@/lib/response";
import { handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const context = await requireAuthContext();
    if (!isOwner(context)) {
      return jsonResponse({ error: "Owner only" }, { status: 403 });
    }
    const accounts = await prisma.account.findMany({ select: { id: true, label: true } });
    const fleets = await prisma.fleet.findMany({ select: { id: true, accountId: true, name: true, externalRef: true } });
    const sims = await prisma.sim.findMany({ select: { id: true, accountId: true, fleetId: true } });
    const byAccount: Record<string, { label: string; fleets: number; sims: number }> = {};
    for (const a of accounts) byAccount[a.id] = { label: a.label, fleets: 0, sims: 0 };
    for (const f of fleets) if (byAccount[f.accountId]) byAccount[f.accountId].fleets += 1;
    for (const s of sims) if (byAccount[s.accountId]) byAccount[s.accountId].sims += 1;
    return jsonResponse({ byAccount, totals: { accounts: accounts.length, fleets: fleets.length, sims: sims.length } });
  } catch (error) {
    return handleApiError(error);
  }
}

