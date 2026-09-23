import type { Metadata } from "next";

import { AppShell } from "@/components/eraser/app-shell";
import { UpdatePrompt } from "@/components/eraser/update-prompt";
import { listCampaignsForMj, listCharactersForUser } from "@/lib/google-sheets";
import { currentAccount, currentViewAccount } from "@/lib/server-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eraser",
  description: "L’espace de jeu, de personnages et de campagne du JDR Eraser.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()]);
  let content = children;
  if (account?.role && viewAccount) {
    const [characters, campaigns] = await Promise.all([
      viewAccount.role === "joueur" ? listCharactersForUser(account.uid).catch(() => []) : Promise.resolve([]),
      viewAccount.role === "mj" ? listCampaignsForMj(account.uid).catch(() => []) : Promise.resolve([]),
    ]);
    content = (
      <AppShell
        user={{ uid: account.uid, email: account.email, displayName: account.displayName, role: account.role }}
        initialViewRole={viewAccount.role}
        characters={characters}
        campaigns={campaigns}
        todos={[]}
        pageLabel="Eraser"
      >
        {children}
      </AppShell>
    );
  }
  return (
    <html lang="fr">
      <body className="antialiased">{content}<UpdatePrompt /></body>
    </html>
  );
}
