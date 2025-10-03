"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import toast from "react-hot-toast";
import clsx from "clsx";
import { READ_COMMANDS, WRITE_COMMANDS, COMMAND_DESCRIPTIONS } from "@/lib/commands";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSelection } from "@/hooks/use-selection";
import { SyncControls } from "@/components/common/sync-controls";
import { Badge } from "@/components/common/badge";
import { SimLogsDrawer, SimLogTarget } from "@/components/sims/sim-logs-drawer";

export type SimRecord = {
  id: string;
  accountId: string;
  accountLabel: string;
  fleetId: string;
  fleetName: string;
  fleetExternalRef: string;
  simSid: string;
  iccid: string;
  uniqueName: string | null;
  status: string;
  lastSeenAt: string | null;
};

type CommandResult = {
  accountId: string;
  accountLabel: string;
  simId: string;
  simSid: string;
  iccid: string;
  status: string;
  message: string;
  command?: string;
  payload?: string;
  sentAt?: string;
};

const COMMAND_OPTIONS = [
  ...READ_COMMANDS.map((command) => ({
    value: command,
    label: command,
    kind: "read" as const,
  })),
  ...WRITE_COMMANDS.map((command) => ({
    value: command,
    label: command,
    kind: "write" as const,
  })),
  { value: "custom", label: "custom", kind: "custom" as const },
];

async function fetchSims() {
  const response = await fetch("/api/sims", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Failed to load SIMs");
  }
  return body as { sims: SimRecord[] };
}

async function sendCommand(payload: {
  command: string;
  text?: string;
  accountScopedTargets: Array<{
    accountId: string;
    simIds: string[];
  }>;
}) {
  const response = await fetch("/api/sims/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? "Command failed");
  }
  return body as { results: CommandResult[] };
}

async function fetchAccounts() {
  const res = await fetch("/api/accounts", { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? "Failed to load accounts");
  return body as { accounts: Array<{ id: string; label: string; isParent: boolean }> };
}

export function SimConsole({ hasAccess }: { hasAccess: boolean }) {
  const queryClient = useQueryClient();
  const selection = useSelection<SimRecord>();
  const [search, setSearch] = useState("");
  const [command, setCommand] = useState(COMMAND_OPTIONS[0]?.value ?? "accinfo");
  const [textPayload, setTextPayload] = useState("");
  const [lastResults, setLastResults] = useState<CommandResult[]>([]);
  const [logsTarget, setLogsTarget] = useState<SimLogTarget | null>(null);
  const debouncedSearch = useDebouncedValue(search, 200);
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [fleetFilter, setFleetFilter] = useState<string>("");
  const searchParams = useSearchParams();
  const router = useRouter();

  const simsQuery = useQuery({
    queryKey: ["sims"],
    queryFn: fetchSims,
    enabled: hasAccess,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: fetchAccounts,
    enabled: hasAccess,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: sendCommand,
    onMutate: () => toast.loading("Sending command...", { id: "command" }),
    onSuccess: (data) => {
      toast.success("Command dispatched", { id: "command" });
      // Show queued immediately and start background polling for updates
      setLastResults(data.results.map((r) => ({ ...r, status: r.status || "queued" })));
      scheduleResultChecks(data.results);
      queryClient.invalidateQueries({ queryKey: ["sims"] });
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Command failed", { id: "command" });
    },
  });

  const sims = useMemo(() => simsQuery.data?.sims ?? [], [simsQuery.data?.sims]);

  const accountOptions = useMemo(() => {
    const list = accountsQuery.data?.accounts ?? [];
    if (list.length > 0) {
      return list.map((a) => ({ value: a.id, label: a.label }));
    }
    // Fallback to what we see in SIMs (in case accounts haven’t been synced yet)
    const map = new Map<string, string>();
    for (const s of sims) {
      if (!map.has(s.accountId)) map.set(s.accountId, s.accountLabel);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [accountsQuery.data?.accounts, sims]);

  async function fetchFleets(accountIds: string[]) {
    const url = new URL("/api/fleets", window.location.origin);
    for (const id of accountIds) url.searchParams.append("accountId", id);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? "Failed to load fleets");
    return body as { fleets: Array<{ id: string; name: string; accountId: string }> };
  }

  const fleetsQuery = useQuery({
    queryKey: ["fleets", accountFilter || "all"],
    queryFn: async () => {
      if (accountFilter) return fetchFleets([accountFilter]);
      const ids = Array.from(new Set(sims.map((s) => s.accountId)));
      return fetchFleets(ids);
    },
    enabled: hasAccess && sims.length > 0,
    staleTime: 60_000,
  });

  const fleetOptions = useMemo(() => {
    const list = fleetsQuery.data?.fleets ?? [];
    const filtered = accountFilter ? list.filter((f) => f.accountId === accountFilter) : list;
    return filtered.map((f) => ({ value: f.id, label: f.name }));
  }, [fleetsQuery.data?.fleets, accountFilter]);

  const filtered = useMemo(() => {
    let base = accountFilter ? sims.filter((s) => s.accountId === accountFilter) : sims;
    base = fleetFilter ? base.filter((s) => s.fleetId === fleetFilter) : base;
    if (!debouncedSearch) {
      return base;
    }
    const query = debouncedSearch.toLowerCase();
    return base.filter((sim) =>
      [sim.uniqueName ?? "", sim.simSid, sim.iccid, sim.fleetName ?? "", sim.accountLabel]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [sims, debouncedSearch, accountFilter, fleetFilter]);

  const parentRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  const timersRef = useRef<number[]>([]);
  function scheduleResultChecks(results: CommandResult[]) {
    // Clear any prior scheduled checks to avoid stacking
    for (const id of timersRef.current) {
      clearTimeout(id);
    }
    timersRef.current = [];
    const delays = [3000, 30000, 60000, 60000];
    let elapsed = 0;
    for (const delay of delays) {
      elapsed += delay;
      const id = window.setTimeout(() => checkResultsOnce(results), elapsed);
      timersRef.current.push(id);
    }
  }

  useEffect(() => () => {
    // Cleanup on unmount
    for (const id of timersRef.current) clearTimeout(id);
    timersRef.current = [];
  }, []);

  async function checkResultsOnce(results: CommandResult[]) {
    const pending = results.filter((r) => r.status === "queued");
    if (!pending.length) return;
    try {
      const updates: Record<string, { status: string; message: string }> = {};
      for (const r of pending) {
        const url = new URL(`/api/sims/${r.simId}/logs`, window.location.origin);
        url.searchParams.set("accountId", r.accountId);
        if (r.sentAt) url.searchParams.set("createdAfter", r.sentAt);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) continue;
        const body = (await res.json()) as { logs: Array<{ status: string; payload: string; command: string; createdAt: string }>; nextCursor?: string | null };
        const match = body.logs.find((log) =>
          (r.command && log.command === r.command) || (r.payload && log.payload === r.payload),
        );
        if (match) {
          updates[`${r.accountId}:${r.simId}`] = { status: match.status, message: match.payload };
        }
      }
      if (Object.keys(updates).length) {
        setLastResults((prev) =>
          prev.map((r) => {
            const key = `${r.accountId}:${r.simId}`;
            const u = updates[key];
            return u ? { ...r, status: u.status, message: u.message } : r;
          }),
        );
      }
    } catch {
      // ignore transient errors
    }
  }

  // URL state sync (q, accountId, fleetId)
  useEffect(() => {
    // On mount, initialize from URL
    const q = searchParams.get("q") ?? "";
    const a = searchParams.get("accountId") ?? "";
    const f = searchParams.get("fleetId") ?? "";
    if (q) setSearch(q);
    if (a) setAccountFilter(a);
    if (f) setFleetFilter(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (accountFilter) params.set("accountId", accountFilter);
    if (fleetFilter) params.set("fleetId", fleetFilter);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [search, accountFilter, fleetFilter, router]);

  // Keyboard: '/' focuses search
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleToggle = (sim: SimRecord) => {
    selection.toggle(sim);
  };

  const handleRunCommand = () => {
    if (!selection.count) {
      toast.error("Select at least one SIM");
      return;
    }
    if (command === "custom" && textPayload.trim().length === 0) {
      toast.error("Custom command text is required");
      return;
    }
    const grouped = new Map<string, string[]>();
    selection.items.forEach((sim) => {
      const list = grouped.get(sim.accountId) ?? [];
      list.push(sim.id);
      grouped.set(sim.accountId, list);
    });
    mutation.mutate({
      command,
      text: command === "custom" ? textPayload : undefined,
      accountScopedTargets: Array.from(grouped.entries()).map(([accountId, simIds]) => ({ accountId, simIds })),
    });
  };

  if (!hasAccess) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-6 text-center text-neutral-600">
        <h2 className="text-lg font-semibold text-neutral-900">No access granted</h2>
        <p className="mt-2 text-sm">Request account or fleet scopes from an owner to begin managing SIMs.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-3">
          <label className="flex min-w-[220px] flex-col gap-1 text-sm font-medium text-neutral-700">
            Command
            <select
              className="h-10 rounded-md border border-neutral-300 px-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={command}
              onChange={(event) => setCommand(event.currentTarget.value)}
            >
              <optgroup label="Read">
                {READ_COMMANDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Write">
                {WRITE_COMMANDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </optgroup>
              <option value="custom">custom</option>
            </select>
          </label>
          <label className="flex min-w-[220px] flex-col gap-1 text-sm font-medium text-neutral-700">
            Payload / Custom text
            <input
              className={clsx(
                "h-10 w-full rounded-md border border-neutral-300 px-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200",
                command !== "custom" && "opacity-60 cursor-not-allowed",
              )}
              value={textPayload}
              onChange={(event) => setTextPayload(event.currentTarget.value)}
              maxLength={160}
              placeholder={command === "custom" ? "Enter SMS command text" : "Disabled for catalog commands"}
              disabled={command !== "custom"}
            />
          </label>
          <button
            type="button"
            onClick={handleRunCommand}
            disabled={mutation.isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {mutation.isPending ? "Sending..." : `Send (${selection.count})`}
          </button>
          <button
            type="button"
            onClick={() => selection.clear()}
            className="h-10 rounded-md border border-neutral-300 px-3 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Clear selection
          </button>
        </div>
        <p className="text-xs text-neutral-500">{COMMAND_DESCRIPTIONS[command] ?? ""}</p>
        <div className="border-t border-neutral-200 pt-3">
          <SyncControls />
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-900">Last command results</h3>
        {lastResults.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">No command results yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {lastResults.map((result) => {
              const friendlyStatus =
                result.status === "queued"
                  ? "sent; awaiting device response"
                  : result.status;
              return (
              <li
                key={`${result.accountId}-${result.simId}`}
                className="flex items-start justify-between rounded-md border border-neutral-200 px-3 py-2"
              >
                <div>
                  <p className="font-medium text-neutral-800">
                    {result.accountLabel} - {result.iccid}
                  </p>
                  <p className="text-xs text-neutral-500">{result.simSid}</p>
                </div>
                <div className="text-right text-sm">
                  <div>
                    <Badge color={result.status === "success" ? "green" : result.status === "queued" ? "amber" : result.status === "error" ? "red" : "neutral"}>{friendlyStatus}</Badge>
                  </div>
                  {result.message ? <p className="text-xs text-neutral-500">{result.message}</p> : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <div>
          <div className="text-sm font-medium text-neutral-700">Search</div>
          <div className="mt-1 grid grid-cols-[220px_220px_1fr_auto] items-center gap-3">
            <select
              className="h-10 w-[220px] rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.currentTarget.value)}
            >
              <option value="">All accounts</option>
              {accountOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 w-[220px] rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={fleetFilter}
              onChange={(e) => setFleetFilter(e.currentTarget.value)}
              disabled={!accountFilter && fleetOptions.length === 0}
            >
              <option value="">All fleets</option>
              {fleetOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              className="h-10 w-full rounded-md border border-neutral-300 px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              placeholder="Unique name, SIM SID, ICCID"
              value={search}
              ref={searchRef}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <div className="h-10 flex items-center justify-end">
              <p className="whitespace-nowrap text-sm text-neutral-500">{selection.count} selected of {sims.length} SIMs</p>
            </div>
          </div>
        </div>
        <div ref={parentRef} className="mt-4 h-[540px] overflow-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[40px_repeat(4,minmax(0,1fr))_100px] gap-4 border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-xs font-semibold text-neutral-600">
            <div></div>
            <div>Unique Name</div>
            <div>SIM SID</div>
            <div>ICCID</div>
            <div>Status</div>
            <div className="text-right">Logs</div>
          </div>
          {simsQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="skeleton h-10 rounded" />
              ))}
            </div>
          ) : (
          <div
            className="relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const sim = filtered[virtualRow.index];
              if (!sim) {
                return null;
              }
              const selected = selection.isSelected(sim.id);
              return (
                <div
                  key={sim.id}
                  className={clsx(
                    "absolute inset-x-0 grid grid-cols-[40px_repeat(4,minmax(0,1fr))_100px] items-center gap-4 border-b border-neutral-100 px-2 py-3 text-sm",
                    selected ? "bg-red-50" : "bg-white",
                  )}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => handleToggle(sim)}
                      aria-label={`Select SIM ${sim.iccid}`}
                    />
                  </div>
                  <div className="text-neutral-900">{sim.uniqueName ?? "-"}</div>
                  <div className="font-mono text-xs text-neutral-900">
                    <button
                      type="button"
                      title="Copy SIM SID"
                      onClick={async () => { await navigator.clipboard.writeText(sim.simSid); toast.success("SIM SID copied"); }}
                      className="underline-offset-2 hover:underline"
                    >
                      {sim.simSid}
                    </button>
                  </div>
                  <div className="font-mono text-xs text-neutral-900">
                    <button
                      type="button"
                      title="Copy ICCID"
                      onClick={async () => { await navigator.clipboard.writeText(sim.iccid); toast.success("ICCID copied"); }}
                      className="underline-offset-2 hover:underline"
                    >
                      {sim.iccid}
                    </button>
                  </div>
                  <div className="text-neutral-900"><Badge color={sim.status === "active" ? "green" : sim.status === "inactive" ? "neutral" : "amber"}>{sim.status}</Badge></div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setLogsTarget({
                          simId: sim.id,
                          simSid: sim.simSid,
                          accountId: sim.accountId,
                          accountLabel: sim.accountLabel,
                        })
                      }
                      className="rounded-md border border-neutral-300 px-3 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                      Logs
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>

      {selection.count > 0 ? (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
          <p className="text-sm text-neutral-700">{selection.count} selected</p>
          <button
            type="button"
            onClick={handleRunCommand}
            disabled={mutation.isPending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
          >
            {mutation.isPending ? "Sending..." : "Send"}
          </button>
          <button
            type="button"
            onClick={() => selection.clear()}
            className="h-9 rounded-md border border-neutral-300 px-3 text-sm text-neutral-700 hover:bg-neutral-100"
          >
            Clear
          </button>
        </div>
      ) : null}

      <SimLogsDrawer target={logsTarget} onClose={() => setLogsTarget(null)} />
    </div>
  );
}

