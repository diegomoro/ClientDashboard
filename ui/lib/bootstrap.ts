import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

let bootstrapped = false;

export async function ensureBootstrap() {
  if (bootstrapped) {
    return;
  }
  const env = getEnv();
  const ownerEmail = env.OWNER_EMAIL.toLowerCase();
  const existingOwner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!existingOwner) {
    const passwordHash = await bcrypt.hash(env.OWNER_PASSWORD, 12);
    await prisma.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        role: "owner",
      },
    });
  }
  bootstrapped = true;
}
