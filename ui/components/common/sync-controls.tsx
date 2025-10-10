"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

function readApiError(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const v = (data as { error?: unknown }).error;
    return typeof v === "string" ? v : null;
  }
  return null;
}

async function postJson(url: string, payload?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const message = readApiError(data) ?? "Request failed";
    throw new Error(message);
  }
  return data;
}

export function SyncControls() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // Keep individual steps internal to drive the single button
  const syncAccounts = useMutation({
    mutationFn: () => postJson("/api/accounts/sync"),
  });
  const syncFleets = useMutation({
    mutationFn: () => postJson("/api/fleets/sync"),
  });
  const syncSims = useMutation({
    mutationFn: () => postJson("/api/sims/sync"),
  });

  const syncAll = useMutation({
    mutationFn: async () => {
      // 1) Discover accessible accounts from the server
      const accountsRes = await fetch("/api/accounts", { cache: "no-store" });
      const accountsBody = await accountsRes.json();
      if (!accountsRes.ok) throw new Error(accountsBody?.error ?? "Failed to load accounts");
      const accountIds: string[] = (accountsBody.accounts ?? []).map((a: { id: string }) => a.id);

      // 2) If owner, sync accounts first (env -> DB)
      if (canSyncAccounts) {
        await postJson("/api/accounts/sync");
      }

      // 3) For each account, sync fleets then sims to keep requests shorter
      for (const id of accountIds) {
        await postJson("/api/fleets/sync", { accountIds: [id] });
        await postJson("/api/sims/sync", { accountIds: [id] });
      }
    },
    onMutate: () => toast.loading("Syncing everything...", { id: "sync-all" }),
    onSuccess: () => {
      toast.success("All synced", { id: "sync-all" });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["fleets"] });
      queryClient.invalidateQueries({ queryKey: ["sims"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Sync failed", { id: "sync-all" });
    },
  });

  const role = session?.user?.role;
  const scopes = session?.user?.scopes ?? [];
  const canSyncAccounts = role === "owner";
  const canSyncFleets = canSyncAccounts || scopes.some((scope) => scope.canWrite);
  const canSyncSims = canSyncFleets;

  if (!canSyncFleets && !canSyncAccounts && !canSyncSims) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {(canSyncAccounts || canSyncFleets || canSyncSims) && (
        <button
          type="button"
          onClick={() => syncAll.mutate()}
          disabled={syncAll.isPending || syncAccounts.isPending || syncFleets.isPending || syncSims.isPending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {syncAll.isPending ? "Syncing SIMs..." : "Sync SIMs"}
        </button>
      )}
    </div>
  );
}

