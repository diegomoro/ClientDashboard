import { InviteAcceptForm } from "@/components/auth/invite-accept-form";

export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
      <InviteAcceptForm token={token} />
    </div>
  );
}

