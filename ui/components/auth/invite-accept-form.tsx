"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";

type InviteScopeDetails = {
  id: string;
  account: { label: string };
  fleet: { name: string } | null;
  canRead: boolean;
  canWrite: boolean;
  canInvite: boolean;
};

type InviteAcceptResponse = {
  invite: {
    email: string | null;
    scopes: InviteScopeDetails[];
  };
};

async function fetchInvite(token: string): Promise<InviteAcceptResponse> {
  const response = await fetch(`/api/invite/accept/${token}`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Invite not found");
  }
  return body as InviteAcceptResponse;
}

async function acceptInvite(token: string, payload: { email: string; password: string }) {
  const response = await fetch(`/api/invite/accept/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Invite acceptance failed");
  }
  return body;
}

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const inviteQuery = useQuery({ queryKey: ["invite", token], queryFn: () => fetchInvite(token) });

  useEffect(() => {
    if (inviteQuery.data?.invite?.email) {
      setEmail(inviteQuery.data.invite.email);
    }
  }, [inviteQuery.data?.invite?.email]);

  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => acceptInvite(token, { email, password }),
    onSuccess: () => {
      toast.success("Invite accepted. You can sign in.");
      router.push("/login");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Invite failed");
    },
  });

  if (inviteQuery.isLoading) {
    return <p className="text-sm text-neutral-600">Loading invite...</p>;
  }

  if (inviteQuery.isError) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-red-600">
          {inviteQuery.error instanceof Error ? inviteQuery.error.message : "Invite not found"}
        </p>
      </div>
    );
  }

  const invite = inviteQuery.data?.invite;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Accept invite</h1>
        <p className="text-sm text-neutral-600">Join the KORE SIM console by setting your credentials.</p>
      </div>
      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">Access granted:</p>
        <ul className="mt-2 space-y-1">
          {(invite?.scopes ?? []).map((scope) => (
            <li key={scope.id}>
              {scope.account.label} / {scope.fleet?.name ?? "Account"} -
              {scope.canRead ? " read" : ""}
              {scope.canWrite ? " write" : ""}
              {scope.canInvite ? " invite" : ""}
            </li>
          ))}
        </ul>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          placeholder={invite?.email ?? "you@example.com"}
          className="rounded-md border border-neutral-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Password (min 12 characters)
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          minLength={12}
          className="rounded-md border border-neutral-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-red-300"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "Accepting..." : "Accept invite"}
      </button>
    </form>
  );
}

