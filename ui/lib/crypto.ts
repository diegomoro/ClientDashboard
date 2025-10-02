import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getEnv } from "@/lib/env";

const key = Buffer.from(getEnv().ENCRYPTION_KEY, "hex");

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${encrypted.toString("hex")}.${authTag.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const [ivHex, dataHex, tagHex] = payload.split(".");
  if (!ivHex || !dataHex || !tagHex) {
    throw new Error("Encrypted payload is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
