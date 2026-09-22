# Instructions pour les IA travaillant sur Eraser

## Source et sécurité

- Ce dépôt GitHub est la source principale de l’application Windows.
- Travailler sur `windows-app-migration` sauf instruction explicite contraire.
- Ne jamais placer de jeton OAuth, secret client, mot de passe, export de base
  ou donnée personnelle dans GitHub.
- Ne jamais modifier ou supprimer des données utilisateur pendant une tâche de
  maintenance du code.
- Ne jamais recréer une feuille Google si une feuille Eraser du même nom existe
  déjà dans le Drive connecté. Google Sheets reste la source métier prioritaire.
- Préserver les fonctionnalités existantes. Toute migration de données doit
  être testée sur une copie, progressive et réversible.

## Architecture Windows

- Electron lance le serveur Vinext autonome inclus dans l’installateur.
- L’interface locale est servie sur `http://127.0.0.1:32147`.
- Le point d’entrée Electron est `desktop/main.cjs`.
- `desktop/runtime/cloudflare-workers.ts` adapte les bindings attendus par le
  code serveur à SQLite et au stockage local. Son nom est historique mais le
  fichier est indispensable.
- Les migrations SQL sont dans `drizzle/`. Elles sont appliquées directement
  aux bases des installations existantes : ne jamais en supprimer une.
- `electron-builder.yml` fixe notamment `executableName: Eraser`. Ne pas le
  renommer sans migration dédiée des raccourcis et de l’auto-update.

## Données partagées et locales

- `worker-accounts/` est le backend Cloudflare partagé actuel, pas un reste de
  l’ancien hébergement. Il conserve comptes, sessions, rôles, configuration et
  autorisation Google, `user_identity_links` et `shared_records`.
- La SQLite locale conserve l’état technique propre à l’installation, le flux
  PKCE éphémère, des caches/index et des fallbacks de compatibilité.
- `user_identity_links` existe encore dans le schéma local pour compatibilité,
  mais l’information partagée est également représentée dans le Worker.
- Google Sheets contient principalement les données JDR partagées.
- Google Drive est la source principale des médias partagés ; le stockage local
  est un cache ou un repli, pas une nouvelle source métier.
- Ne jamais remplacer silencieusement le Worker partagé par les fallbacks
  locaux dans une Release distribuée.

## Google Drive et Google Sheets

- Le compte dédié attendu est `eraser.jdr@gmail.com`.
- L’URL OAuth locale est
  `http://127.0.0.1:32147/api/admin/google-drive/oauth/callback`.
- Le flux OAuth desktop s’ouvre dans le navigateur système et stocke son état
  PKCE temporaire dans `google_oauth_flows`.
- Le bouton « Relier mes feuilles existantes » recherche les noms définis dans
  `jdrSheetDefinitions`, conserve les fichiers trouvés et ne crée que les
  feuilles réellement absentes.

## Tabletop et Roll20

- Le tabletop utilise notamment Leaflet et Trystero. Ses routes, composants et
  styles ne doivent pas être supprimés comme du scaffolding générique.
- Le compagnon Roll20 appelle
  `http://127.0.0.1:32147/api/roll20/bridge` ; Eraser doit rester ouvert.
- Les sources Roll20 sont dans `integrations/roll20/` et les téléchargements
  distribués dans `public/roll20/`. Conserver les deux tant qu’aucun script de
  génération vérifié ne remplace les copies publiques.
- Le jeton de campagne est l’authentification du pont. Ne pas ajouter une
  authentification par cookie aux routes `/api/roll20/bridge`.

## Vérifications avant publication

1. `npm ci`
2. `npm run lint`
3. `npm run build`
4. `npm run test:ci`
5. `npm run desktop:build`
6. `npm run desktop:verify`
7. `npm run desktop:dist` sur Windows
8. Installer `Eraser-Setup.exe` et tester connexion, Google Drive/Sheets,
   campagnes, personnages, tabletop, Roll20 et mise à jour automatique.

Le workflow Windows produit `Eraser-Setup.exe`, `latest.yml` et le `.blockmap`,
puis teste une vraie installation. Une préversion est publiée seulement par un
commit contenant `[publish alpha]` sur `windows-app-migration`.
Chaque commit `[publish alpha]` doit **incrémenter `version` dans
`package.json`** (`0.1.1-alpha.N` → `N+1`) et réécrire `RELEASE_ALPHA.md` :
sinon la construction réussit mais la publication échoue, le tag existant déjà,
et aucune mise à jour n’arrive aux utilisateurs.
