import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google";
import { RootProvider } from "@/providers/root-provider";
import "./globals.css";
import { getServerAuthSession } from "@/lib/auth/session";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const fira = Fira_Code({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "KORE SIM Operations Console",
  description: "Manage KORE Super SIM fleets, commands, and access in one secure console.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerAuthSession();

  return (
    <html lang="en" className={`${inter.variable} ${fira.variable}`} suppressHydrationWarning>
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <RootProvider session={session}>{children}</RootProvider>
      </body>
    </html>
  );
}
