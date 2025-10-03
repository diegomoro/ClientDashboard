"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Badge } from "@/components/common/badge";
import { Modal } from "@/components/common/modal";

type OverviewScope = {
  scopeId: string;
  accountId: string;
  fleetId: string | null;
  fleetName: string | null;
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
};

type OverviewUser = {
  id: string;
  email: string;
  role: string;
  scopes: OverviewScope[];
};

type OverviewAccount = {
  id: string;
  label: string;
  isParent: boolean;
  fleets: Array<{ id: string; name: string; externalRef: string }>;
};

type OverviewResponse = {
  viewer: { isOwner: boolean; userId: string };
  accounts: OverviewAccount[];
  users: OverviewUser[];
};

type InviteScopeSummary = {
  id: string;
  account: { label: string };
  fleet: { name: string } | null;
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
};

type InviteSummary = {
  id: string;
  token: string;
  email: string | null;
  expiresAt: string;
  scopes: InviteScopeSummary[];
};

async function fetchOverview(): Promise<OverviewResponse> {
  const response = await fetch("/api/access/overview", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to load access overview");
  }
  return body as OverviewResponse;
}

async function fetchInvites(): Promise<{ invites: InviteSummary[] }> {
  const response = await fetch("/api/invites", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to load invites");
  }
  return body as { invites: InviteSummary[] };
}

async function updateScopes(
  userId: string,
  scope: { accountId: string; fleetId: string | null; canRead: boolean; canWrite: boolean; canInvite: boolean },
) {
  const response = await fetch(`/api/users/${userId}/scopes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scopes: [scope] }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to update scopes");
  }
  return body;
}

async function createInvite(payload: {
  email?: string;
  scopes: Array<{ accountId: string; fleetId?: string | null; canRead: boolean; canWrite: boolean; canInvite: boolean }>;
}) {
  const response = await fetch("/api/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to create invite");
  }
  return body;
}

async function deleteInvite(inviteId: string) {
  const response = await fetch(`/api/invites/${inviteId}`, { method: "DELETE" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to revoke invite");
  }
  return body;
}

const initialInvitePermissions = {
  canRead: true,
  canWrite: false,
  canInvite: false,
};

export function AccessManager() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({ queryKey: ["access-overview"], queryFn: fetchOverview });
  const invitesQuery = useQuery({ queryKey: ["invites"], queryFn: fetchInvites });

  const accounts = useMemo(() => overviewQuery.data?.accounts ?? [], [overviewQuery.data?.accounts]);
  const users = useMemo(() => overviewQuery.data?.users ?? [], [overviewQuery.data?.users]);
  const canEdit = overviewQuery.data?.viewer?.isOwner ?? false;
  const viewerId = overviewQuery.data?.viewer?.userId ?? "";
  const [selectedUserId, setSelectedUserId] = useState<string>(viewerId);
  const [userQuery, setUserQuery] = useState("");
  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, userQuery]);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? users[0], [users, selectedUserId]);
  const [confirm, setConfirm] = useState<{ open: boolean; accountId?: string }>(() => ({ open: false }));

  const scopeMutation = useMutation({
    mutationFn: (params: { userId: string; scope: OverviewScope }) =>
      updateScopes(params.userId, {
        accountId: params.scope.accountId,
        fleetId: params.scope.fleetId,
        canRead: params.scope.canRead,
        canWrite: params.scope.canWrite,
        canInvite: params.scope.canInvite,
      }),
    onSuccess: () => {
      toast.success("Scopes updated");
      queryClient.invalidateQueries({ queryKey: ["access-overview"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Update failed");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: () => {
      toast.success("Invite created");
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Invite failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: deleteInvite,
    onSuccess: () => {
      toast.success("Invite revoked");
      queryClient.invalidateQueries({ queryKey: ["invites"] });
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Revoke failed"),
  });

  const [inviteAccountId, setInviteAccountId] = useState<string | null>(null);
  const [inviteFleetId, setInviteFleetId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermissions, setInvitePermissions] = useState(initialInvitePermissions);

  const inviteAccountOptions = useMemo(
    () => accounts.map((account) => ({ value: account.id, label: account.label })),
    [accounts],
  );
  const selectedAccount = inviteAccountId ? accounts.find((account) => account.id === inviteAccountId) ?? null : null;

  const handleToggle = (
    userId: string,
    accountId: string,
    fleetId: string | null,
    key: "canRead" | "canWrite" | "canInvite",
    value: boolean,
    currentScope: OverviewScope | undefined,
  ) => {
    const next: OverviewScope = {
      accountId,
      fleetId,
      scopeId: currentScope?.scopeId ?? `${accountId}:${fleetId ?? "account"}`,
      fleetName: currentScope?.fleetName ?? null,
      canRead: currentScope?.canRead ?? false,
      canWrite: currentScope?.canWrite ?? false,
      canInvite: currentScope?.canInvite ?? false,
    };
    next[key] = value;
    scopeMutation.mutate({ userId, scope: next });
  };

  const handleInviteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteAccountId) {
      toast.error("Select an account to invite into");
      return;
    }
    if (!invitePermissions.canRead && !invitePermissions.canWrite && !invitePermissions.canInvite) {
      toast.error("Grant at least one permission");
      return;
    }
    inviteMutation.mutate({
      email: inviteEmail.trim() || undefined,
      scopes: [
        {
          accountId: inviteAccountId,
          fleetId: inviteFleetId,
          canRead: invitePermissions.canRead,
          canWrite: invitePermissions.canWrite,
          canInvite: invitePermissions.canInvite,
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900">Accounts &amp; Fleets</h2>
        {overviewQuery.isLoading ? <p className="mt-2 text-sm text-neutral-500">Loading access overview...</p> : null}
        {overviewQuery.isError ? (
          <p className="mt-2 text-sm text-red-600">
            {overviewQuery.error instanceof Error ? overviewQuery.error.message : "Failed to load access"}
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-[260px_1fr]">
          <aside className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
            <p className="mb-2 text-sm font-semibold text-neutral-700">Users</p>
            <input
              className="mb-2 h-9 w-full rounded-md border border-neutral-300 px-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="Search users"
              aria-label="Search users"
              value={userQuery}
              onChange={(e) => setUserQuery(e.currentTarget.value)}
            />
            <ul className="max-h-[320px] overflow-auto text-sm">
              {filteredUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`flex w-full items-start justify-between rounded px-2 py-1 text-left ${
                      (selectedUser?.id ?? "") === u.id ? "bg-white text-neutral-900" : "text-neutral-700 hover:bg-white"
                    }`}
                  >
                    <span>
                      <span className="block font-medium">{u.email}</span>
                      <span className="block text-xs uppercase text-neutral-500">{u.role}</span>
                    </span>
                  </button>
                </li>
              ))}
              {filteredUsers.length === 0 ? <p className="px-2 py-1 text-neutral-500">No users</p> : null}
            </ul>
          </aside>
          <div className="space-y-4">
            {selectedUser ? (
              accounts.map((account) => (
                <article key={account.id} className="rounded-md border border-neutral-200 p-4">
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold text-neutral-900">{account.label}</h3>
                      <Badge color={account.isParent ? "red" : "neutral"}>{account.isParent ? "Parent" : "Child"}</Badge>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setConfirm({ open: true, accountId: account.id })}
                        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                      >
                        Remove all access
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setExpandedAccounts((prev) => ({ ...prev, [account.id]: !prev[account.id] }))}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                    >
                      {(expandedAccounts[account.id] ?? false) ? "Hide fleets" : `Show fleets (${account.fleets.length})`}
                    </button>
                  </header>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200 text-sm">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">User</th>
                          <th className="px-3 py-2 text-left font-semibold text-neutral-600">Scope</th>
                          <th className="px-3 py-2 text-center font-semibold text-neutral-600">Read</th>
                          <th className="px-3 py-2 text-center font-semibold text-neutral-600">Write</th>
                          <th className="px-3 py-2 text-center font-semibold text-neutral-600">Invite</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {(() => {
                          const user = selectedUser;
                          const accountLevel = user.scopes.find((scope) => scope.accountId === account.id && scope.fleetId === null);
                          const fleetRows = account.fleets.map((fleet) => ({
                            fleet,
                            scope: user.scopes.find((scope) => scope.accountId === account.id && scope.fleetId === fleet.id),
                          }));
                          const isExpanded = expandedAccounts[account.id] ?? false;
                          const rows = [{ label: "Account-wide", fleetId: null as string | null, scope: accountLevel }].concat(
                            isExpanded ? fleetRows.map((row) => ({ label: row.fleet.name, fleetId: row.fleet.id, scope: row.scope })) : [],
                          );
                          return rows.map((row, index) => (
                            <tr key={`${user.id}-${row.fleetId ?? "account"}`} className="bg-white">
                              {index === 0 ? (
                                <td rowSpan={rows.length} className="px-3 py-2 align-top">
                                  <div>
                                    <p className="font-medium text-neutral-800">{user.email}</p>
                                    <p className="text-xs uppercase text-neutral-500">{user.role}</p>
                                  </div>
                                </td>
                              ) : null}
                              <td className="px-3 py-2 text-neutral-700">{row.label}</td>
                              {(["canRead", "canWrite", "canInvite"] as const).map((key) => (
                                <td key={key} className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={row.scope?.[key] ?? false}
                                    onChange={(event) =>
                                      handleToggle(
                                        user.id,
                                        account.id,
                                        row.fleetId,
                                        key,
                                        event.currentTarget.checked,
                                        row.scope,
                                      )
                                    }
                                    disabled={!canEdit || scopeMutation.isPending}
                                  />
                                </td>
                              ))}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-sm text-neutral-600">No user selected.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {canEdit ? (
        <form onSubmit={handleInviteSubmit} className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Create invite</h2>
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
              Account
              <select
                className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 placeholder:text-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-500"
                value={inviteAccountId ?? ""}
                onChange={(event) => {
                  setInviteAccountId(event.currentTarget.value || null);
                  setInviteFleetId(null);
                }}
              >
                <option value="">Select account</option>
                {inviteAccountOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
              Fleet (optional)
              <select
                className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:bg-neutral-50 disabled:text-neutral-500"
                value={inviteFleetId ?? ""}
                onChange={(event) => setInviteFleetId(event.currentTarget.value || null)}
                disabled={!selectedAccount}
              >
                <option value="">Account-wide</option>
                {selectedAccount?.fleets.map((fleet) => (
                  <option key={fleet.id} value={fleet.id}>
                    {fleet.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
              Email (optional)
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.currentTarget.value)}
                className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 placeholder:text-neutral-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder="agent@example.com"
              />
            </label>
            <fieldset className="rounded-md border border-neutral-200 p-3">
              <legend className="text-sm font-semibold text-neutral-700">Permissions</legend>
              <label className="mt-2 flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={invitePermissions.canRead}
                  onChange={(event) => {
                    const checked = (event.target as HTMLInputElement).checked;
                    setInvitePermissions((prev) => ({ ...prev, canRead: checked }));
                  }}
                />
                Read
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={invitePermissions.canWrite}
                  onChange={(event) => {
                    const checked = (event.target as HTMLInputElement).checked;
                    setInvitePermissions((prev) => ({ ...prev, canWrite: checked }));
                  }}
                />
                Write
              </label>
              <label className="mt-2 flex items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={invitePermissions.canInvite}
                  onChange={(event) => {
                    const checked = (event.target as HTMLInputElement).checked;
                    setInvitePermissions((prev) => ({ ...prev, canInvite: checked }));
                  }}
                />
                Invite
              </label>
            </fieldset>
          </div>
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
            disabled={inviteMutation.isPending}
          >
            {inviteMutation.isPending ? "Creating..." : "Create invite"}
          </button>
        </form>
        ) : null}

        {canEdit ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">Active invites</h2>
          {invitesQuery.isLoading ? <p className="mt-2 text-sm text-neutral-500">Loading invites...</p> : null}
          {invitesQuery.isError ? (
            <p className="mt-2 text-sm text-red-600">
              {invitesQuery.error instanceof Error ? invitesQuery.error.message : "Failed to load invites"}
            </p>
          ) : null}
          <ul className="mt-3 space-y-3 text-sm">
            {(invitesQuery.data?.invites ?? []).map((invite) => (
              <li key={invite.id} className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-neutral-800">{invite.email ?? "No email specified"}</p>
                    <p className="text-xs text-neutral-500">Expires {new Date(invite.expiresAt).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/invite/accept/${invite.token}`;
                        await navigator.clipboard.writeText(url);
                        toast.success("Invite link copied");
                      }}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => revokeMutation.mutate(invite.id)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
                    >
                      Revoke
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-xs text-neutral-500">
                  {invite.scopes.map((scope) => (
                    <p key={scope.id}>
                      {scope.account.label} / {scope.fleet?.name ?? "Account"} -
                      {scope.canRead ? " read" : ""}
                      {scope.canWrite ? " write" : ""}
                      {scope.canInvite ? " invite" : ""}
                    </p>
                  ))}
                </div>
              </li>
            ))}
            {(invitesQuery.data?.invites ?? []).length === 0 ? <p className="text-sm text-neutral-600">No active invites.</p> : null}
          </ul>
        </div>
        ) : null}
      </section>
      <Modal
        open={confirm.open}
        title="Remove all access?"
        onCancel={() => setConfirm({ open: false })}
        onConfirm={async () => {
          if (!selectedUser) return;
          const url = confirm.accountId
            ? `/api/users/${selectedUser.id}/scopes?accountId=${encodeURIComponent(confirm.accountId)}`
            : `/api/users/${selectedUser.id}/scopes`;
          await fetch(url, { method: "DELETE" });
          setConfirm({ open: false });
          toast.success("Access removed");
          queryClient.invalidateQueries({ queryKey: ["access-overview"] });
        }}
        confirmLabel="Remove"
      >
        <p>This action removes all the selected user&apos;s permissions for this account. You can re‑grant them later.</p>
      </Modal>
    </div>
  );
}

