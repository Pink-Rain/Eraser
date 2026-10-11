import type { Metadata } from "next";

import { AppShell } from "@/components/eraser/app-shell";
import { ReplacementView } from "@/components/eraser/custom-page-route";
import { OpenInAppPrompt } from "@/components/eraser/open-in-app-prompt";
import { UpdatePrompt } from "@/components/eraser/update-prompt";
import { listCampaignsForMj, listCharactersForUser } from "@/lib/google-sheets";
import { canManagePages } from "@/lib/custom-pages";
import { replacementFor, shellMenu } from "@/lib/custom-pages-server";
import { currentRequestPath } from "@/lib/request-path";
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

/** Une lecture du serveur partagé qui tarde ne retient jamais la page : on garde le menu et la page d'Eraser. */
function withinTime<T>(promise: Promise<T>, fallback: T, ms = 1500) {
  return Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [account, viewAccount] = await Promise.all([currentAccount(), currentViewAccount()]);
  let content = children;
  if (account?.role && viewAccount) {
    // Cette coque est rendue à chaque navigation (vinext relance le layout racine, requêtes
    // RSC comprises). Attendre ici la liste des personnages ou des campagnes — qui peut
    // attendre la resynchronisation des index Google jusqu'à 2,5 s (premier lancement,
    // « Actualiser ») — retardait le premier octet de *toutes* les pages, même de celles qui
    // n'en ont aucun besoin. Les promesses sont transmises en vol : la page s'affiche tout de
    // suite et la barre latérale se remplit dès qu'elles arrivent. Aucune ne rejette. Les
    // pages qui décident d'un accès (fiche, campagne) font toujours leur propre vérification.
    const characters = viewAccount.role === "joueur" ? listCharactersForUser(account.uid).catch(() => []) : Promise.resolve([]);
    const campaigns = viewAccount.role === "mj" ? listCampaignsForMj(account.uid).catch(() => []) : Promise.resolve([]);
    // Le menu réglé dans l'éditeur du menu, et la page du créateur de pages qui remplace ou
    // complète celle demandée : deux lectures du serveur partagé gardées en mémoire (aucune de Google).
    const { pathname, searchParams } = currentRequestPath();
    const [menu, replacement] = await Promise.all([
      withinTime(shellMenu(viewAccount), null),
      pathname ? withinTime(replacementFor(pathname, viewAccount), null) : Promise.resolve(null),
    ]);
    // « Voir la page d'origine » (admins et MJ) : la page d'Eraser telle quelle.
    const original = searchParams.get("origine") === "1" && canManagePages(viewAccount.role);
    const page = replacement && !original
      ? <ReplacementView page={replacement.page} view={replacement.view} mode={replacement.mode} pathname={pathname} account={viewAccount}>{children}</ReplacementView>
      : children;
    content = (
      <AppShell
        menu={menu}
        user={{ uid: account.uid, email: account.email, displayName: account.displayName, role: account.role }}
        initialViewRole={viewAccount.role}
        characters={characters}
        campaigns={campaigns}
        todos={[]}
        pageLabel="Eraser"
      >
        {page}
      </AppShell>
    );
  }
  return (
    <html lang="fr">
      <body className="antialiased">{content}<UpdatePrompt /><OpenInAppPrompt /></body>
    </html>
  );
}
