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

  const syncAccounts = useMutation({
    mutationFn: () => postJson("/api/accounts/sync"),
    onSuccess: () => {
      toast.success("Accounts synced");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const syncFleets = useMutation({
    mutationFn: () => postJson("/api/fleets/sync"),
    onSuccess: () => {
      toast.success("Fleets synced");
      queryClient.invalidateQueries({ queryKey: ["fleets"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    },
  });

  const syncSims = useMutation({
    mutationFn: () => postJson("/api/sims/sync"),
    onSuccess: () => {
      toast.success("SIMs synced");
      queryClient.invalidateQueries({ queryKey: ["sims"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Sync failed");
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
      {canSyncAccounts && (
        <button
          type="button"
          onClick={() => syncAccounts.mutate()}
          disabled={syncAccounts.isPending}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
        >
          {syncAccounts.isPending ? "Syncing accounts..." : "Sync accounts"}
        </button>
      )}
      {canSyncFleets && (
        <button
          type="button"
          onClick={() => syncFleets.mutate()}
          disabled={syncFleets.isPending}
          className="rounded-md border border-red-500 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-200 disabled:text-red-300"
        >
          {syncFleets.isPending ? "Syncing fleets..." : "Sync fleets"}
        </button>
      )}
      {canSyncSims && (
        <button
          type="button"
          onClick={() => syncSims.mutate()}
          disabled={syncSims.isPending}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:text-neutral-400"
        >
          {syncSims.isPending ? "Syncing SIMs..." : "Sync SIMs"}
        </button>
      )}
    </div>
  );
}
