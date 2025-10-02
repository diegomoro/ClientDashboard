import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { z } from "zod";
import { decode as defaultJwtDecode, encode as defaultJwtEncode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { ensureBootstrap } from "@/lib/bootstrap";
import { loadUserScopes } from "@/lib/auth/scopes";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authOptions: NextAuthOptions = {
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        await ensureBootstrap();
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }
        const email = parsed.data.email.toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          return null;
        }
        const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!isValid) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          role: user.role,
        } as const;
      },
    }),
  ],
  jwt: {
    async encode(params) {
      return defaultJwtEncode(params);
    },
    async decode(params) {
      try {
        return await defaultJwtDecode(params);
      } catch (error) {
        console.warn("[auth] Failed to decode JWT; treating as signed out", error);
        return null;
      }
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = String(user.id);
        token.role = user.role;
        token.scopesFetchedAt = 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (!token?.userId) {
        return session;
      }
      const scopes = await loadUserScopes(String(token.userId));
      session.user = {
        ...(session.user ?? {}),
        id: String(token.userId),
        role: (token.role as string) ?? "agent",
        scopes,
      };
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      await loadUserScopes(String(user.id));
    },
  },
};
