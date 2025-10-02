import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getServerAuthSession } from "@/lib/auth/session";

export default async function LoginPage() {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <LoginForm />
    </div>
  );
}
