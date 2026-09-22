# Architecture actuelle d’Eraser

Ce document décrit l’application Windows telle qu’elle fonctionne aujourd’hui.
Il remplace les anciens documents de migration et de comparaison avec le site.

## Vue d’ensemble

Eraser est une application Electron. Chaque installation embarque un serveur
Node/Vinext autonome, démarré sur `127.0.0.1:32147`, et une base SQLite dans le
dossier de données utilisateur. L’interface et les routes API s’exécutent donc
sur la machine locale.

L’application reste néanmoins collaborative : le Worker `eraser-accounts`,
Google Sheets, Google Drive, Trystero et Roll20 assurent les données et échanges
qui doivent dépasser une seule installation.

| Élément | Responsabilité |
| --- | --- |
| `desktop/main.cjs` | Cycle de vie Electron, serveur local, fenêtre, IPC, cookies et mises à jour |
| `scripts/build-desktop.mjs` | Build Vinext standalone et création de `eraser-server.asar` |
| `desktop/runtime/cloudflare-workers.ts` | Adaptation des bindings serveur vers SQLite et le stockage local |
| SQLite locale | État technique, caches, index, PKCE temporaire et fallbacks locaux |
| `worker-accounts/` | Comptes, sessions, rôles, OAuth Google, identités et états communs |
| Google Sheets | Source principale des données JDR |
| Google Drive | Source principale des médias partagés |
| Trystero | Synchronisation en temps réel du tabletop |
| Roll20 | Extension, Mod et pont HTTP vers le serveur local |

## Démarrage et stockage local

Electron lance le serveur emballé dans `dist/eraser-server.asar`. Le serveur
reçoit `ERASER_DESKTOP=1`, le chemin de la base utilisateur, le chemin des
migrations et la configuration du Worker partagé. Les migrations SQL de
`drizzle/` sont appliquées sans supprimer l’historique.

La base locale contient encore plusieurs tables couvrant comptes, caches,
index et intégrations. Certaines servent de fallback ou de compatibilité quand
le Worker n’est pas configuré. Cela ne transforme pas SQLite en source métier
principale : les personnages, campagnes, classes, objets et autres données JDR
restent principalement dans Sheets.

## Worker partagé `eraser-accounts`

Le dossier `worker-accounts/` contient un Worker Cloudflare autonome et sa base
D1. Il est déployé par `.github/workflows/deploy-accounts-worker.yml` et doit
être conservé avec :

- `users` et `sessions` ;
- rôles et statuts des comptes ;
- `google_oauth_settings` ;
- `google_drive_authorizations` ;
- `user_identity_links` ;
- `shared_records` pour de petits états communs entre installations.

Les secrets Google y sont chiffrés au repos. Les clients utilisent
`ERASER_ACCOUNTS_API_URL` et `ERASER_ACCOUNTS_API_KEY`, injectés dans la Release
Windows par le workflow de build.

## Google Drive et Google Sheets

Le flux OAuth desktop démarre par
`POST /api/admin/google-drive/oauth/start`. Le navigateur système revient vers
`/api/admin/google-drive/oauth/callback` avec un état PKCE enregistré localement
dans `google_oauth_flows`. Les réglages OAuth et l’autorisation Drive partagée
sont lus et écrits via le Worker lorsqu’il est configuré.

Les définitions de feuilles et leur logique d’accès sont principalement dans
`lib/jdr-sheets.ts` et `lib/google-sheets.ts`. La liaison recherche d’abord les
fichiers existants afin de ne jamais dupliquer ni écraser les données.

Les portraits, bannières et fonds de carte partagés passent par Google Drive.
`lib/shared-media.ts` utilise le stockage local comme cache et sait migrer les
anciens médias locaux sans remplacer Drive comme source partagée.

## Tabletop

Le tabletop conserve ses pages, routes API, composants Leaflet, styles globaux
et synchronisation Trystero. Un tabletop appartient à une campagne ou au bac à
sable. Les cartes et portraits partagés proviennent de Drive avec cache local.

## Roll20

Les sources sont dans `integrations/roll20/`. La page Roll20 télécharge encore
les copies versionnées dans `public/roll20/`; elles doivent donc rester présentes
tant qu’un script de génération ne les remplace pas.

Le compagnon appelle `/api/roll20/bridge` sur le serveur local. Le lien d’une
campagne est encore représenté dans `roll20_campaign_links` en SQLite locale.
`shared_records` fournit le support nécessaire à un état commun, mais la
migration des liens existants doit être traitée séparément et de façon
réversible.

## Build, installation et mises à jour

`electron-builder.yml` produit un installateur NSIS x64 nommé
`Eraser-Setup.exe`. `executableName: Eraser` reste fixe pour préserver les
raccourcis existants.

`.github/workflows/windows-release.yml` :

1. installe les dépendances ;
2. injecte la configuration du Worker partagé ;
3. exécute `desktop:dist` ;
4. vérifie `latest.yml` et le `.blockmap` ;
5. installe et démarre réellement l’application ;
6. publie les artefacts et, selon le déclencheur, la Release GitHub.

`electron-updater` vérifie les Releases au démarrage et toutes les six heures,
télécharge en arrière-plan et installe au redémarrage ou à la fermeture.

## Caches

Rien ici n'est un cache HTTP : ce sont des variables de module, vivantes tant
que le serveur local tourne, et vidées à sa fermeture. Elles existent parce que
la source métier est distante — Google Sheets, Google Drive, le Worker partagé —
et qu'une même page demande souvent la même chose plusieurs fois.

Chacune a une portée et une durée propres. La règle est qu'un cache ne vide
jamais un cache qu'il ne comprend pas : l'écriture qui invalide est toujours au
plus près de la donnée qu'elle change.

| Cache | Fichier | Durée | Vidé par |
| --- | --- | --- | --- |
| `rangeReadCache` | `lib/google-sheets.ts` | 3 min | toute écriture dans le classeur concerné (`clearSpreadsheetReadCache`) |
| `objectIndexTableCache` | `lib/google-sheets.ts` | 5 min | `markObjectIndexFileStale` pour un classeur, `clearObjectIndexTableCache` pour tout l'index |
| `staleObjectIndexFiles` | `lib/google-sheets.ts` | — | consommé par la lecture suivante de l'index |
| `inventoryWorkbookCache` | `lib/google-sheets.ts` | 1 min | toute écriture d'inventaire, et tout changement de l'index d'objets |
| `characterSheetCache` | `lib/google-sheets.ts` | 30 s | réécrit par l'enregistrement de la fiche |
| `sheetRowCache` | `lib/google-sheets.ts` | 10 min | jamais : un identifiant ne change pas de ligne sans suppression |
| `sheetRecordCache` | `lib/jdr-sheets.ts` | 5 min | la liaison d'une feuille |
| `workbookFilesCache` | `lib/class-content.ts` | 1 min | l'actualisation demandée depuis l'Index des classes |
| `sessionAccountCache` | `lib/site-auth.ts` | 30 s | tout changement de rôle ou de statut |
| `remoteLinksCache` | `lib/identity-links.ts` | 30 s | l'écriture d'un lien d'identité |
| `pointerCache`, `folderListing` | `lib/shared-media.ts` | 5 min | l'envoi d'un média |
| `cachedAccessToken` | `lib/google-oauth.ts` | expiration du jeton | la révocation ou le changement de réglages OAuth |
| `tokenCache` | `lib/google-service-account.ts` | expiration du jeton | — |

Deux mécanismes voisins ne sont pas des caches mais des garde-fous, et se
lisent comme tels : `pendingJdrSheetResolutions` déduplique deux résolutions
simultanées de la même feuille, `missingJdrSheetRetryAt` empêche de redemander
en boucle une feuille réellement absente.

Côté client, une seule chose est conservée : les préférences d'interface dans
`localStorage`, lues par `hooks/use-persistent-state.ts`. Ce ne sont jamais des
données de jeu, uniquement l'état de l'affichage.

### Ce qui n'est délibérément pas mis en cache

Les magasins lisent Sheets par `readRangeFresh`, qui passe par un POST
`batchGetByDataFilter`. Le serveur desktop sait dédupliquer deux GET identiques
même avec `no-store` : après une écriture, la relecture recevait alors encore
la réponse précédente. Ce chemin doit le rester.

## Chemin critique de l'affichage

La coque de `app/layout.tsx` est rendue à chaque navigation, y compris les
navigations internes. Elle ne doit donc jamais attendre une lecture distante :
les listes de la barre latérale lui sont transmises en vol et se remplissent
quand elles arrivent. Y remettre un `await` retarderait le premier octet de
toutes les pages, y compris celles qui n'ont pas besoin de ces listes.

De la même façon, les préférences d'interface sont lues dès le premier rendu
client par `useSyncExternalStore`, et non restaurées après peinture : une
restauration différée coûte un rendu complet de plus et un saut visible.

## Dettes techniques suivies séparément

- Rendre obligatoires l’URL et la clé du Worker pour les Releases distribuées.
- Migrer les liens Roll20 locaux vers un état réellement partagé.
- Réconcilier `drizzle/meta/_journal.json` avec les migrations `0013–0015` sans
  supprimer ni réécrire l’historique SQL.
- Ajouter un test d’intégration du vrai chemin `eraser-accounts`.
- Découper plus tard les gros modules, notamment `lib/google-sheets.ts` et le
  tabletop, sans mêler ces refactors au nettoyage.
- La synchronisation des images de classe dans Sheets construit encore une URL
  `chatgpt.site` dans `lib/google-sheets.ts`. Ce chemin doit être remplacé par
  un endpoint partagé durable dans un chantier fonctionnel dédié avant la
  disparition définitive de cet endpoint.

