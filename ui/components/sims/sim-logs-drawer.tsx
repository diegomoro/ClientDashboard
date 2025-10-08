"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Fragment, useEffect } from "react";
import { Badge } from "@/components/common/badge";

export type SimLogTarget = {
  simId: string;
  simSid: string;
  accountId: string;
  accountLabel: string;
};

async function fetchLogs({ pageParam, simId, accountId }: { pageParam?: string | null; simId: string; accountId: string }) {
  const url = new URL(`/api/sims/${simId}/logs`, window.location.origin);
  url.searchParams.set("accountId", accountId);
  if (pageParam) {
    url.searchParams.set("cursor", pageParam);
  }
  const response = await fetch(url.toString(), { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.error ?? "Failed to load logs");
    }
    return body as { logs: Array<{ sid: string; status: string; payload: string; command: string; createdAt: string }>; nextCursor?: string | null };
  }
  // Fallback: non-JSON (likely an HTML error page). Surface a readable error.
  const text = await response.text();
  const snippet = text.slice(0, 200).trim();
  throw new Error(snippet || `Unexpected non-JSON response (status ${response.status})`);
}

export function SimLogsDrawer({ target, onClose }: { target: SimLogTarget | null; onClose: () => void }) {
  const open = Boolean(target);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery({
    queryKey: ["sim-logs", target?.accountId, target?.simId],
    enabled: open && Boolean(target),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (!target) {
        return Promise.resolve({ logs: [], nextCursor: null });
      }
      return fetchLogs({ pageParam, simId: target.simId, accountId: target.accountId });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
  }, [open]);

  return (
    <div
      className={clsx(
        "fixed inset-y-0 right-0 z-40 w-96 transform border-l border-neutral-200 bg-white shadow-xl transition-transform",
        open ? "translate-x-0" : "translate-x-full",
      )}
      role="dialog"
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-neutral-200 p-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Command logs</h2>
            {target ? (
              <p className="text-sm text-neutral-500">
                {target.accountLabel} - {target.simSid}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
                  <div className="skeleton h-4 w-28 rounded" />
                  <div className="mt-2 skeleton h-6 w-40 rounded" />
                  <div className="mt-2 skeleton h-14 w-full rounded" />
                </div>
              ))}
            </div>
          ) : null}
          {isError ? (
            <p className="text-sm text-red-600">{error instanceof Error ? error.message : "Failed to load logs"}</p>
          ) : null}
          {data?.pages?.length ? (
            <ol className="relative ml-4 space-y-4 before:absolute before:left-[-12px] before:top-0 before:h-full before:w-px before:bg-neutral-200">
              {data.pages.map((page, pageIndex) => (
                <Fragment key={pageIndex}>
                  {page.logs.map((log) => (
                    <li key={log.sid} className="relative">
                      <span className="absolute -left-[16px] mt-2 h-2 w-2 rounded-full bg-neutral-300" />
                      <article className="rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge color={log.status.toLowerCase() === "received" || log.status.toLowerCase() === "delivered" ? "green" : log.status.toLowerCase() === "failed" ? "red" : "amber"}>{log.status}</Badge>
                            <p className="text-sm font-medium text-neutral-900">{log.command || "<payload>"}</p>
                          </div>
                          <p className="text-xs text-neutral-500">{new Date(log.createdAt).toLocaleString()}</p>
                        </div>
                        {log.payload ? (
                          <pre className="mt-2 whitespace-pre-wrap rounded bg-neutral-50 p-2 text-xs text-neutral-800">{log.payload}</pre>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </Fragment>
              ))}
            </ol>
          ) : null}
        </div>
        {hasNextPage ? (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="m-4 rounded-md border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
          >
            Load more
          </button>
        ) : null}
      </div>
    </div>
  );
}


