import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userScope: {
      findMany: vi.fn(),
    },
  },
}));
import { hasReadAccess, hasWriteAccess } from "@/lib/auth/scopes";

describe("scope helpers", () => {
  const scopes = [
    {
      scopeId: "1",
      accountId: "acc1",
      accountLabel: "Account 1",
      fleetId: null,
      fleetName: null,
      canRead: true,
      canWrite: true,
      canInvite: true,
    },
    {
      scopeId: "2",
      accountId: "acc1",
      accountLabel: "Account 1",
      fleetId: "fleet1",
      fleetName: "Fleet 1",
      canRead: true,
      canWrite: false,
      canInvite: false,
    },
  ];

  test("account level scope grants read", () => {
    expect(hasReadAccess(scopes, "acc1")).toBe(true);
  });

  test("fleet write denied when flag false", () => {
    expect(hasWriteAccess(scopes, "acc1", "fleet1")).toBe(false);
  });

  test("missing account returns false", () => {
    expect(hasReadAccess(scopes, "acc2")).toBe(false);
  });
});
