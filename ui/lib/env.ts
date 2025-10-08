import { z } from "zod";

const EnvSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required"),
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  OWNER_EMAIL: z.string().email("OWNER_EMAIL must be an email address"),
  OWNER_PASSWORD: z.string().min(8, "OWNER_PASSWORD must be at least 8 characters"),
  KORE_TOKEN_URL: z.string().url("KORE_TOKEN_URL must be a valid URL"),
  KORE_SUPERSIM_BASE_URL: z.string().url("KORE_SUPERSIM_BASE_URL must be a valid URL"),
  KORE_ACCOUNTS_JSON: z.string().min(2, "KORE_ACCOUNTS_JSON is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/u, "ENCRYPTION_KEY must be a 64 character hex string"),
});

type RawEnv = z.infer<typeof EnvSchema>;

let cachedEnv: RawEnv | null = null;

export function getEnv(): RawEnv {
  if (cachedEnv) {
    return cachedEnv;
  }
  // Provide sensible fallbacks for Vercel/preview to avoid brittle setup.
  // If NEXTAUTH_URL is not set, derive it from VERCEL_URL (production/preview)
  // or localhost for development.
  const derivedNextAuthUrl =
    process.env.NEXTAUTH_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);

  const envWithFallbacks = {
    ...process.env,
    NEXTAUTH_URL: derivedNextAuthUrl,
  } as NodeJS.ProcessEnv;

  const parsed = EnvSchema.safeParse(envWithFallbacks);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const key = firstIssue?.path?.[0];
    const message = key
      ? `[env] Missing or invalid ${String(key)}. Set it in ui/.env (see ui/.env.example).`
      : `[env] Invalid environment configuration. Review ui/.env.`;
    throw new Error(message);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export type KoreAccountConfig = {
  label: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  audience?: string;
};

let cachedAccounts: KoreAccountConfig[] | null = null;

export function getKoreAccounts(): KoreAccountConfig[] {
  if (cachedAccounts) {
    return cachedAccounts;
  }
  const { KORE_ACCOUNTS_JSON } = getEnv();
  let parsed: unknown;
  try {
    parsed = JSON.parse(KORE_ACCOUNTS_JSON);
  } catch {
    throw new Error(`[env] KORE_ACCOUNTS_JSON must be valid JSON. Update ui/.env.`);
  }

  const AccountSchema = z
    .object({
      label: z.string().min(1),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      scope: z.string().optional(),
      audience: z.string().optional(),
    })
    .array()
    .min(1, "At least one KORE account must be defined");

  const parsedAccounts = AccountSchema.safeParse(parsed);
  if (!parsedAccounts.success) {
    throw new Error(`[env] KORE_ACCOUNTS_JSON entries are invalid. Fix ui/.env.`);
  }
  cachedAccounts = parsedAccounts.data;
  return cachedAccounts;
}
