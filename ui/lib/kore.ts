import { getEnv } from "@/lib/env";
import { withRetry } from "@/utils/retry";

export type KoreAccountSecret = {
  label: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  audience?: string;
};

export type KoreFleet = {
  sid: string;
  uniqueName: string | null;
  friendlyName: string;
};

export type KoreSim = {
  sid: string;
  iccid: string;
  uniqueName: string | null;
  status: string;
  fleetSid: string;
  fleetName: string | null;
  lastSeenAt?: string | null;
};

export type KoreCommandResult = {
  sid: string;
  status: string;
  payload: string;
  command: string;
  simSid: string;
  createdAt: string;
};

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();
const tokenInFlight = new Map<string, Promise<string>>();

type KoreListResponse<T> = {
  data?: T[];
  meta?: { next_page_url?: string | null; nextPageUrl?: string | null };
};

type FleetListResponse = KoreListResponse<Record<string, unknown>> & {
  fleets?: Record<string, unknown>[];
};

type SimListResponse = KoreListResponse<Record<string, unknown>> & {
  sims?: Record<string, unknown>[];
};

type CommandListResponse = KoreListResponse<Record<string, unknown>> & {
  sms_commands?: Record<string, unknown>[];
};

function baseUrl() {
  return getEnv().KORE_SUPERSIM_BASE_URL.replace(/\/$/u, "");
}

async function getAccessToken(account: KoreAccountSecret): Promise<string> {
  const cacheKey = account.clientId;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) {
    return cached.token;
  }
  const inflight = tokenInFlight.get(cacheKey);
  if (inflight) return inflight;
  const { KORE_TOKEN_URL } = getEnv();
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: account.clientId,
    client_secret: account.clientSecret,
  });
  if (account.scope) {
    params.set("scope", account.scope);
  }
  if (account.audience) {
    params.set("audience", account.audience);
  }

  const promise = withRetry(async () =>
    fetchWithTimeout(KORE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    }),
  );
  tokenInFlight.set(cacheKey, promise.then(async (response) => {
    if (!response.ok) {
      const detail = await safeJson(response);
      tokenInFlight.delete(cacheKey);
      throw new KoreHttpError(response.status, detail, `Failed to obtain KORE token for ${account.label}: ${response.status} ${response.statusText} ${JSON.stringify(detail)}`);
    }
    const data = (await response.json()) as { access_token: string; expires_in?: number };
    const expiresIn = data.expires_in ?? 3600;
    const entry: TokenCacheEntry = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    tokenCache.set(cacheKey, entry);
    tokenInFlight.delete(cacheKey);
    return entry.token;
  }));
  return tokenInFlight.get(cacheKey)!;
}

export class KoreHttpError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message?: string) {
    super(message ?? `KORE API request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const signal = controller.signal;
  const ms = 20000;
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(input, { ...(init ?? {}), signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function koreFetch<T>(account: KoreAccountSecret, path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(account);
  const url = path.startsWith("http") ? path : `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await withRetry(async () =>
    fetchWithTimeout(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    }),
  );

  if (!response.ok) {
    const detail = await safeJson(response);
    throw new KoreHttpError(response.status, detail, `KORE API request failed (${response.status}): ${JSON.stringify(detail)}`);
  }
  return (await response.json()) as T;
}

function normalizeFleet(input: Record<string, unknown>): KoreFleet {
  const sid = String(input.sid ?? input.id ?? "");
  const uniqueNameRaw = input.unique_name ?? input.uniqueName ?? null;
  const friendlyRaw = input.friendly_name ?? input.friendlyName ?? uniqueNameRaw ?? sid;
  return {
    sid,
    uniqueName: uniqueNameRaw ? String(uniqueNameRaw) : null,
    friendlyName: String(friendlyRaw),
  };
}

function normalizeSim(input: Record<string, unknown>): KoreSim {
  const sid = String(input.sid ?? input.id ?? "");
  const iccid = String(input.iccid ?? input.sim_iccid ?? "");
  const uniqueNameRaw = input.unique_name ?? input.uniqueName ?? null;
  const fleetSid = String(input.fleet_sid ?? input.fleetSid ?? input.fleet_id ?? "");
  const fleetNameRaw = input.fleet_name ?? input.fleetName ?? null;
  const status = String(input.status ?? "unknown");
  const lastSeenRaw = input.last_seen_at ?? input.lastSeenAt ?? null;
  return {
    sid,
    iccid,
    uniqueName: uniqueNameRaw ? String(uniqueNameRaw) : null,
    status,
    fleetSid,
    fleetName: fleetNameRaw ? String(fleetNameRaw) : null,
    lastSeenAt: lastSeenRaw ? String(lastSeenRaw) : null,
  };
}

export async function listFleetsFromKore(account: KoreAccountSecret): Promise<KoreFleet[]> {
  const fleets: KoreFleet[] = [];
  let nextPath: string | null = "/Fleets?PageSize=500";
  while (nextPath) {
    const data = await koreFetch<FleetListResponse>(account, nextPath, { method: "GET" });
    const items = (data.fleets ?? data.data ?? []) as Record<string, unknown>[];
    for (const item of items) {
      const fleet = normalizeFleet(item);
      if (fleet.sid) {
        fleets.push(fleet);
      }
    }
    const nextUrl = data.meta?.next_page_url ?? data.meta?.nextPageUrl ?? null;
    nextPath = nextUrl ? stripBase(String(nextUrl)) : null;
  }
  return fleets;
}

export async function listSimsFromKore(account: KoreAccountSecret, fleetSid: string): Promise<KoreSim[]> {
  const sims: KoreSim[] = [];
  // Try several endpoint/param casings to handle tenant differences.
  const candidates = [
    `/Fleets/${encodeURIComponent(fleetSid)}/Sims?PageSize=500`,
    `/Sims?FleetSid=${encodeURIComponent(fleetSid)}&PageSize=500`,
    `/Sims?Fleet=${encodeURIComponent(fleetSid)}&PageSize=500`,
    `/fleets/${encodeURIComponent(fleetSid)}/sims?PageSize=500`,
    `/sims?FleetSid=${encodeURIComponent(fleetSid)}&PageSize=500`,
    `/sims?fleetSid=${encodeURIComponent(fleetSid)}&PageSize=500`,
  ];

  for (const firstPath of candidates) {
    let nextPath: string | null = firstPath;
    let fetchedAny = false;
    const visited = new Set<string>();
    try {
      while (nextPath && !visited.has(nextPath)) {
        visited.add(nextPath);
        const data = await koreFetch<SimListResponse>(account, nextPath, { method: "GET" });
        const items = (data.sims ?? data.data ?? []) as Record<string, unknown>[];
        for (const item of items) {
          const sim = normalizeSim(item);
          if (sim.sid) {
            sims.push({ ...sim, fleetSid });
            fetchedAny = true;
          }
        }
        const nextUrl = data.meta?.next_page_url ?? data.meta?.nextPageUrl ?? null;
        nextPath = nextUrl ? stripBase(String(nextUrl)) : null;
      }
    } catch (err) {
      // Try next candidate if 404 or 400
      if (err instanceof KoreHttpError && (err.status === 404 || err.status === 400)) {
        continue;
      }
      throw err;
    }
    if (fetchedAny) break;
  }
  return sims;
}

export async function sendSmsCommand(account: KoreAccountSecret, payload: { command: string; simSid: string; text?: string }) {
  const form = new URLSearchParams();
  form.set("Command", payload.command);
  form.set("Sim", payload.simSid);
  // KORE requires Payload to be present even when empty for some commands
  form.set("Payload", payload.text ?? "");
  return koreFetch<Record<string, unknown>>(account, "/SmsCommands", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });
}

export async function listSmsLogs(
  account: KoreAccountSecret,
  params: { simSid: string; createdAfter?: string; pageSize?: number; nextPageUrl?: string | null },
) {
  const path = params.nextPageUrl
    ? params.nextPageUrl
    : `/SmsCommands?Sim=${encodeURIComponent(params.simSid)}&PageSize=${params.pageSize ?? 50}${
        params.createdAfter ? `&CreatedAfter=${encodeURIComponent(params.createdAfter)}` : ""
      }`;
  const data = await koreFetch<CommandListResponse>(account, path, { method: "GET" });
  const items = (data.sms_commands ?? data.data ?? []) as Record<string, unknown>[];
  const commands: KoreCommandResult[] = items.map((item) => ({
    sid: String(item.sid ?? item.id ?? ""),
    status: String(item.status ?? "unknown"),
    payload: String(item.payload ?? ""),
    command: String(item.command ?? item.Command ?? ""),
    simSid: String(item.sim_sid ?? item.simSid ?? ""),
    createdAt: String(item.date_created ?? item.created_at ?? new Date().toISOString()),
  }));
  const nextUrl = data.meta?.next_page_url ?? data.meta?.nextPageUrl ?? null;
  return {
    commands,
    nextPageUrl: nextUrl ? stripBase(String(nextUrl)) : null,
  };
}

function stripBase(url: string): string {
  const base = baseUrl();
  if (url.startsWith(base)) {
    return url.slice(base.length);
  }
  return url;
}

async function safeJson(response: Response) {
  try {
    return await response.clone().json();
  } catch {
    return { status: response.status };
  }
}
