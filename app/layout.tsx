import type { Metadata } from "next";

import { AppShell } from "@/components/eraser/app-shell";
import { ReplacementView } from "@/components/eraser/custom-page-route";
import { OpenInAppPrompt } from "@/components/eraser/open-in-app-prompt";
import { UpdatePrompt } from "@/components/eraser/update-prompt";
import { listCampaignsForMj, listCharactersForUser } from "@/lib/google-sheets";
import { replacementFor, shellMenu, warmShellCopies } from "@/lib/custom-pages-server";
import { currentRequestPath } from "@/lib/request-path";
import { currentAccount, currentViewAccount } from "@/lib/server-auth";
import { applyEffectsScript } from "@/lib/visual-effects";
import { warmUpOnce } from "@/lib/warm-up";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eraser",
  description: "L’espace de jeu, de personnages et de campagne du JDR Eraser.",
  icons: {
    icon: "/eraser-logo.png",
    shortcut: "/eraser-logo.png",
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
    // Une fois par lancement : les index se lisent en arrière-plan pour s'ouvrir tout de suite (lib/warm-up.ts).
    warmUpOnce(account.role);
    // Cette coque est rendue à chaque navigation (vinext relance le layout racine, requêtes
    // RSC comprises), et même deux fois par page : une première fois « à blanc », sans
    // paramètres de requête, pour y détecter une redirection, puis pour de vrai. Attendre ici
    // la liste des personnages ou des campagnes — qui peut attendre la resynchronisation des
    // index Google jusqu'à 2,5 s (premier lancement, « Actualiser ») — retardait le premier
    // octet de *toutes* les pages, même de celles qui n'en ont aucun besoin. Les promesses
    // sont transmises en vol : la page s'affiche tout de suite et la barre latérale se remplit
    // dès qu'elles arrivent. Aucune ne rejette. Les pages qui décident d'un accès (fiche,
    // campagne) font toujours leur propre vérification.
    const characters = viewAccount.role === "joueur" ? listCharactersForUser(account.uid).catch(() => []) : Promise.resolve([]);
    const campaigns = viewAccount.role === "mj" ? listCampaignsForMj(account.uid).catch(() => []) : Promise.resolve([]);
    // Le menu réglé dans l'éditeur du menu et la page du créateur de pages qui remplace ou
    // complète celle demandée viennent de la copie en mémoire du serveur partagé
    // (lib/app-menu-store.ts, lib/custom-pages-store.ts) : rien n'est attendu ici, ni du
    // serveur partagé ni de Google ; la copie se relit en arrière-plan.
    const { pathname } = currentRequestPath();
    // Seule exception : le tout premier rendu après le démarrage attend ces copies (3 s au
    // plus), sans quoi l'accueil et le menu d'origine s'affichaient jusqu'au rechargement.
    await warmShellCopies();
    const { items: menu, campaignPages } = shellMenu(viewAccount);
    const replacement = pathname ? replacementFor(pathname, viewAccount) : null;
    const page = replacement
      ? <ReplacementView page={replacement.page} view={replacement.view} mode={replacement.mode} pathname={pathname} account={viewAccount}>{children}</ReplacementView>
      : children;
    // Les pages créées d'une campagne, sous son dossier (vue MJ) : seulement celles de ses
    // campagnes, connues quand la liste en vol arrive — aucune lecture de plus.
    const ownCampaignPages = viewAccount.role === "mj"
      ? campaigns.then((list) => Object.fromEntries(list.flatMap((campaign) => campaignPages[campaign.id] ? [[campaign.id, campaignPages[campaign.id]]] : [])))
      : {};
    content = (
      <AppShell
        menu={menu}
        campaignPages={ownCampaignPages}
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
    // `data-effects` est posé sur <html> avant l'affichage (effets allégés, lib/visual-effects.ts).
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: applyEffectsScript }} />
        {content}<UpdatePrompt /><OpenInAppPrompt />
      </body>
    </html>
  );
}
