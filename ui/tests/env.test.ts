import { describe, expect, test, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("getEnv", () => {
  test("throws when required keys are missing", async () => {
    const env = { ...process.env };
    delete env.NEXTAUTH_SECRET;
    process.env = env;
    const { getEnv } = await import("@/lib/env");
    expect(() => getEnv()).toThrow(/NEXTAUTH_SECRET/);
  });

  test("returns parsed values when keys set", async () => {
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.OWNER_EMAIL = "owner@example.com";
    process.env.OWNER_PASSWORD = "superstrong";
    process.env.KORE_TOKEN_URL = "https://example.com/token";
    process.env.KORE_SUPERSIM_BASE_URL = "https://example.com/api";
    process.env.KORE_ACCOUNTS_JSON = "[{\"label\":\"Test\",\"clientId\":\"abc\",\"clientSecret\":\"def\"}]";
    process.env.DATABASE_URL = "file:./test.db";
    process.env.ENCRYPTION_KEY = "5f8d9c3a1e7b4d2f6a5c1b8e3d7f9a02468c13579bdf2468ac9e0f1b2c3d4e5f";

    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.NEXTAUTH_SECRET).toBe("secret");
  });
});
