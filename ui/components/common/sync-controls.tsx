"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";

async function postJson(url: string) {
  const response = await fetch(url, { method: "POST" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error ?? "Request failed";
    throw new Error(message);
  }
  return body;
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
      // Run in sequence so dependencies are respected
      await postJson("/api/accounts/sync");
      await postJson("/api/fleets/sync");
      await postJson("/api/sims/sync");
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
