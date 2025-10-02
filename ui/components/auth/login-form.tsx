"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      // Ensure CSRF cookie is set before attempting credentials
      await fetch("/api/auth/csrf", { cache: "no-store" }).catch(() => {});
      const result = await signIn("credentials", {
        redirect: false,
        callbackUrl: "/dashboard",
        email,
        password,
      });
      if (result?.error) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">Sign in</h1>
        <p className="text-sm text-neutral-600">Use your console credentials to continue.</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Email
        <input
          type="email"
          autoComplete="email"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700">
        Password
        <input
          type="password"
          autoComplete="current-password"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
