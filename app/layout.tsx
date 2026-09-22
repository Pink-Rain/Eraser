import type { Metadata } from "next";

import { AppShell } from "@/components/eraser/app-shell";
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
    // Cette coque est rendue à chaque navigation, y compris les navigations
    // internes. Attendre ici la liste des personnages ou des campagnes — deux
    // lectures Google Sheets — retardait donc l'affichage de *toutes* les pages,
    // même celles qui n'en ont aucun besoin. Les promesses sont transmises sans
    // être attendues : la page s'affiche tout de suite et la barre latérale se
    // remplit dès que Sheets répond. Ni l'une ni l'autre ne rejette, la coque n'a
    // donc pas d'erreur à traiter.
    const characters = viewAccount.role === "joueur"
      ? listCharactersForUser(account.uid).catch(() => [])
      : Promise.resolve([]);
    const campaigns = viewAccount.role === "mj"
      ? listCampaignsForMj(account.uid).catch(() => [])
      : Promise.resolve([]);
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
      <body className="antialiased">{content}</body>
    </html>
  );
}
