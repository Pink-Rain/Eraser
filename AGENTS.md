# Instructions pour les IA travaillant sur Eraser

## Source et sécurité

- Ce dépôt GitHub est la source principale de l’application.
- Ne jamais modifier, redéployer ou supprimer le site Sites/Cloudflare en ligne
  dans le cadre du travail sur la branche Windows.
- Ne jamais placer de jeton OAuth, secret client, mot de passe, export de base ou
  donnée personnelle dans GitHub.
- Ne jamais recréer une feuille Google si une feuille Eraser du même nom existe
  déjà dans le Drive connecté. Les données Google Sheets sont prioritaires.
- Préserver les fonctionnalités existantes. Toute migration de données doit être
  testée sur une copie et être réversible.

## Branches et versions

- `main` contient la copie fidèle de la dernière version Sites conservée.
- `windows-app-migration` contient l’application Windows autonome en cours de
  validation.
- Ne fusionner vers `main` et ne publier une version stable qu’après validation
  des données, de Google Drive/Sheets et de Roll20.

## Architecture Windows

- Electron lance le serveur Vinext autonome inclus dans l’installateur.
- L’interface locale est servie sur `http://127.0.0.1:32147`.
- La base D1 est remplacée en mode bureau par SQLite dans le dossier de données
  utilisateur. R2 est remplacé par un stockage de fichiers local.
- Le point d’entrée Electron est `desktop/main.cjs`.
- L’adaptateur local Cloudflare se trouve dans
  `desktop/runtime/cloudflare-workers.ts`.
- Les migrations SQL sont dans `drizzle/` et doivent rester compatibles avec
  une base utilisateur existante.

## Google Drive et Google Sheets

- Le compte dédié attendu est `eraser.jdr@gmail.com`.
- L’URL OAuth locale est
  `http://127.0.0.1:32147/api/admin/google-drive/oauth/callback`.
- Le flux OAuth de bureau s’ouvre dans le navigateur système et stocke seulement
  un état PKCE temporaire dans `google_oauth_flows`.
- Le bouton « Relier mes feuilles existantes » recherche les noms définis dans
  `jdrSheetDefinitions`, conserve les fichiers trouvés et ne crée que les
  feuilles réellement absentes.
- `user_identity_links` associe localement un compte Windows à l’UID déjà présent
  dans Google Sheets. Cette table est strictement locale : elle ne contacte pas
  le site et ne déclenche aucune synchronisation avec lui.

## Roll20

- Le compagnon Chrome v0.4.0 appelle
  `http://127.0.0.1:32147/api/roll20/bridge` ; Eraser doit rester ouvert.
- L’archive distribuée est `public/roll20/eraser-roll20-companion.zip`.
- Le script Mod distribué est `public/roll20/eraser-bridge.mod.js`.
- Les sources équivalentes sont dans `integrations/roll20/`.
- Le jeton de liaison par campagne est l’unique authentification du pont. Ne pas
  ajouter d’authentification par cookie aux routes `/api/roll20/bridge`.

## Vérifications avant publication

1. `npm ci`
2. `npm run build` pour vérifier la version Cloudflare historique.
3. `npm run desktop:dist` sur Windows.
4. Installer `Eraser-Setup.exe`.
5. Vérifier `%APPDATA%/Eraser/startup-ready.json` et la page `/connexion`.
6. Tester sur une copie de données avant toute importation réelle.

GitHub Actions réalise automatiquement les étapes de compilation, installation
et démarrage. Une Release alpha est créée uniquement par un commit contenant
`[publish alpha]` sur `windows-app-migration`.
