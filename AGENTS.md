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

## Mises à jour sans réinstallation

- Chaque préversion publie, en plus de l’installateur, le serveur seul
  (`eraser-update.asar.gz`, migrations comprises) et sa description
  (`eraser-update.json` : version, empreinte SHA-256, version d’enveloppe).
  `scripts/build-desktop.mjs` les produit, le workflow Windows les publie.
- `desktop/hot-update.cjs` les télécharge dans `%APPDATA%/Eraser/updates`,
  vérifie l’empreinte, puis `desktop/main.cjs` redémarre le serveur local sur
  cette version et recharge la page. Un serveur téléchargé qui ne démarre pas
  est écarté (`failed.json`) et la version installée reprend la main.
- Le champ **`eraserShell`** de `package.json` est la version de l’enveloppe
  (tout ce qui est dans `desktop/`, la version d’Electron, `electron-builder.yml`).
  **L’incrémenter dès que l’un d’eux change** : les installations dont
  l’enveloppe est plus ancienne passent alors par l’installateur, en mode
  silencieux. Sans cet incrément, elles recevraient un serveur que leur
  enveloppe ne sait pas faire tourner.
- Le serveur ne doit jamais dépendre d’un changement de `desktop/` sans ce
  même incrément.

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

- Toutes les installations passent par le même compte Google et partagent son quota Google
  Sheets (5 joueurs ou plus en séance). Toute requête passe par `googleSheetsFetch` et la
  porte du quota (`lib/google-quota.ts`) ; une relecture qui n'est pas attendue par une page
  passe par `asBackgroundGoogleWork`. Ne pas ajouter de relecture périodique ni de cache de
  moins de quelques minutes sans en mesurer le coût (lectures groupées, `cachedSpreadsheetTabs`,
  `lib/sheet-checks.ts`).
- Les lectures GET de Google Sheets sont partagées entre installations par le Worker
  (`lib/shared-reads.ts`) : une seule lit Google, les autres reprennent sa copie. Toute écriture
  passe par `announceSpreadsheetWrite`, qui rend les copies du classeur inutilisables. Une
  lecture qui décide d'une écriture reste une lecture fraîche (POST), jamais partagée.
- « Actualiser » (F5) pose le cookie `eraser-fresh` (`lib/request-freshness.ts`) : un cache
  de page vérifie `mustReread`/`freshAfter` au lieu d'être vidé en entier. Seuls l'admin et
  le MJ oublient aussi les règles (`forgetGoogleData`).
- Le compte dédié attendu est `eraser.jdr@gmail.com`.
- L’URL OAuth locale est
  `http://127.0.0.1:32147/api/admin/google-drive/oauth/callback`.
- Le flux OAuth desktop s’ouvre dans le navigateur système et stocke son état
  PKCE temporaire dans `google_oauth_flows`.
- Le bouton « Relier mes feuilles existantes » recherche les noms définis dans
  `jdrSheetDefinitions`, conserve les fichiers trouvés et ne crée que les
  feuilles réellement absentes.

## Vues des index

- Vocabulaire : une **présentation** est une forme (liste, kanban…,
  `lib/index-presentations.ts`) ; un **filtre** est fait de conditions et un
  **onglet-fenêtre** (`IndexWindow`, `lib/index-windows.ts`) affiche un filtre ;
  une **vue** (`SavedView`, `lib/index-saved-views.ts`) réunit filtre, tri et
  présentation sous un nom ; elle se garde sur le Worker, les onglets-fenêtres
  de la feuille ne sont plus que relus.
  Détail dans `ARCHITECTURE.md`.
- Ne jamais renommer une clé déjà enregistrée ou échangée avec le serveur
  (`save-view`, `views`, `viewPresets`, portées du Worker, colonnes de la feuille
  « Eraser · Réglages des index », `vue:`, `@vue`).
- Les éditeurs enregistrent la valeur « par défaut » comme absente : vérifier que
  l’affichage a bien le même défaut.
- **Survols, cartes, formulaires et présentations se créent dans l'atelier des pages**
  (Apparences d'un index, extension Eraser Page, avec leur éditeur). **Dans une page, ils se règlent
  depuis la page** (« Modifier l'apparence » d'un bloc : une seule rangée de formes, carte et
  disposition propres au bloc) ; les Apparences d'un index ne sont qu'un raccourci et une réserve de
  presets (choix du propriétaire). Le « Modifier » d'un index
  (`EDITOR_MODES`) ne garde que les colonnes, le formulaire principal, la carte officielle, les
  stats et l'affichage des items : ne pas y remettre le reste. Il fait toujours suivre aux
  apparences les colonnes et onglets renommés.
- « Liste » réunit dans l'éditeur des apparences (Eraser Page) les formes `list`, `kanban` et `master-detail` : leurs
  clés d'enregistrement restent séparées (une version désignée « forme|id » dans l'éditeur).
- Les rôles d'un lecteur pour une ligne (joueur, joueur de la campagne, joueur propriétaire,
  MJ, MJ de la campagne, admin) sont dans `lib/view-roles.ts` ; ils règlent l'affichage
  (boutons, clic, détail modifiable), jamais les droits d'écriture, que le serveur vérifie.
- Tous les index sont le même moteur, côté page (`components/eraser/world-index-manager.tsx`)
  comme côté serveur (`lib/world-indexes.ts`), y compris l’Index des items (clé `objects`).
  Ne jamais recréer une page, une passerelle ou un code d’index à part : une possibilité
  ajoutée au moteur vaut pour tous les index.
- Les items n’ont qu’un lecteur, le moteur : l’inventaire, les magasins, les fouilles, les
  événements, les références et les dons lisent `objectCatalog` (`lib/object-catalog.ts`).
  Ne jamais rajouter de lecture ni de copie en mémoire des items à part (l’ancien
  `listObjectIndexTables` a été retiré à l’alpha 240) ; ne jamais annoncer « branché sur le
  moteur » tant qu’un consommateur lit ailleurs.
- Ce qu’un exemplaire d’inventaire porte en propre (réserve de portions ou de doses, recyclage,
  lignes d’effet : `lib/item-instance.ts`) vit dans son JSON « Modificateurs » : toute réécriture
  de ce JSON passe par `withKeptItemEntries` (ou `keepItemCharges`) ; ne jamais renommer ses
  cibles (`reserve`, `recyclage`, `effet`). L’effet d’un item est caché d’office derrière l’œil
  de l’inventaire (`lib/shown-effects.ts`) : ne pas ajouter d’autre système de verrou.
- Le chantier en cours suit la roadmap « Eraser · Vues des index » (document
  partagé du propriétaire) : la relire et la mettre à jour à chaque étape.

## Fluidité

- Un envoi de fichiers (`multipart/form-data`) passe par le contrôle des « actions serveur » de
  vinext, même vers `/api/…` : sa taille maximale est `experimental.serverActions.bodySizeLimit`
  de `next.config.ts` (40 Mo). Chaque route vérifie ensuite ses propres limites.
- `putSharedMedia` garde la liste du dossier des visuels à jour au lieu de l'oublier : plusieurs
  visuels envoyés de suite ne relisent pas tout le dossier chacun.
- Une action d'un clic s'affiche d'abord et s'enregistre ensuite, avec retour en arrière visible
  si le serveur refuse (modèles : quantités de l'inventaire, relations, quêtes, PNJ). Ce qui
  attend un identifiant donné par le serveur reste en attente.
- `vite.config.ts` retouche le routeur de vinext 0.0.50 (`eraserVinextRouter`) : à vérifier, et
  à refaire si besoin, à toute montée de version de vinext. Voir `ARCHITECTURE.md`.
- Le React Compiler est actif : garder le code conforme aux règles `react-hooks/*` du lint.
- Mesurer avant et après : la jauge « Fluidité de cet ordinateur » du pied de la barre latérale
  (`lib/fluidity-journal.ts`), ouverte à chaque compte : demander leur relevé aux joueurs.
- Un réglage lu sur le serveur partagé à chaque page passe par `lib/shared-snapshot.ts` : jamais
  de lecture qui attend le Worker toutes les 30 s.
- Pas de `:has()` sur `body` ni sur un grand conteneur (coque, barre latérale), et pas de style
  posé sur `<body>` à l'ouverture d'une fenêtre : chacun refait le style de toute la page. Les
  retouches de Radix et de trystero dans `vite.config.ts` sont à vérifier à toute montée de version.
- Le salon en direct du chat (Trystero, WebRTC) gèle la fenêtre 1 à 2 s quand il se rejoint : il
  n'attend pas un simple temps mort, mais qu'on ouvre le chat, qu'Eraser passe à l'arrière-plan ou
  que personne n'y touche (`live` dans `global-table-chat.tsx`). Ne pas le rejoindre plus tôt.

## Polices

- L'interface est en IM Fell (texte : Double Pica ; titres `.font-display` : Double Pica SC ;
  variantes `font-english`, `font-english-sc`, `font-dw`, `font-dw-sc`, `font-sc`), embarquée
  dans `public/polices` et déclarée dans `app/globals.css` (`size-adjust` la ramène à la taille de
  lecture). Les chiffres viennent d'« Eraser Chiffres » (EB Garamond, chiffres seuls) : le « 1 »
  d'IM Fell se lit « I ». Garder « Eraser Chiffres » en tête de chaque pile.
- Deux polices qui tranchent, à leur place seulement : Cinzel (« Eraser Cinzel », `font-title`)
  pour les `h1.font-display` et le titre de la bannière du journal ; Alegreya Sans (`font-label`)
  pour les petites étiquettes (`text-[9px]` à `text-[11.5px]`, `uppercase tracking-*`, `kbd`),
  par une règle `:where(…)` de `app/globals.css`. Une police posée exprès sur l'élément gagne.
- Les polices des documents (`lib/document-model.ts`) sont à part : ne pas leur appliquer de
  `size-adjust` ni réutiliser leur nom de famille (d'où « Eraser IM Fell English » pour l'interface).

## Tokens

- Les cadres des tokens sont des images (`public/token-frames`), rendues une fois par le moteur
  du dépôt ClaudeIcones (`scripts/token-frames/export.mjs`). Ne jamais faire tourner ce moteur
  dans Eraser : il lui faut ~25 s. L'éditeur (`components/eraser/token-editor.tsx`) superpose
  calque arrière, portrait et cadre.
- Les cadres proposés et les défauts par type de token sont dans `lib/token-frames.ts` ; le
  cadre choisi est gardé sur le Worker (portée `token-frames`). Ne jamais renommer un
  identifiant de cadre déjà enregistré (« gold-3 », « special-lich », « door-market »…).
- Le compagnon Roll20 compose ses tokens par défaut comme l'éditeur
  (`renderFramedToken` dans `integrations/roll20/extension/token-art.js`, cadre et cadrage
  envoyés par `lib/roll20-bridge.ts`). Tout changement de la composition de l'éditeur
  (filtre du portrait, fond, calques) est à reporter là.

## Documents

- **L'éditeur des documents vit dans `Pink-Rain/Eraser_doc`** (extension `doc`,
  `/extension/doc/campagne/<id>`) avec son rendu, ses polices et ses fonds : ne pas le recréer
  dans Eraser. Eraser garde le modèle pur (`lib/document-model.ts` : clés vérifiées, nettoyage,
  marque d'inventaire, adresses), la feuille « Documents de campagne »
  (`lib/campaign-documents.ts`), les API (`/api/campaigns/[id]/documents…`), la lecture
  (`components/eraser/document-viewer.tsx` : inventaire, Créateur de session) et Roll20.
- Une police ou un fond ajouté à l'éditeur ajoute sa clé dans `documentFontKeys` ou
  `builtinBackgroundKeys` (sinon Eraser la refuse à l'enregistrement) : Eraser d'abord, puis
  l'extension.
- Ne jamais renommer les clés enregistrées (colonnes de la feuille, dont « Dossier »,
  « Modèle », « Pages (JSON) » et « Journal », les champs `relief*`, `metal`, `role` et le fond
  `{ kind: "library" }`, la portée `document-backgrounds`, la ligne d'un document en magasin —
  `source: "document"`, `id: "document:<id>"` —, noms des images dans Drive — `fond`, `rendu`, `impression` pour la
  première page, `fond-<id>`, `rendu-<n>`, `impression-<n>` pour les suivantes —, champs du JSON des
  zones, lignes, formes et images, modes de fusion
  `documentBlendModes`, `{"target":"document"}` dans le JSON d'un exemplaire d'inventaire).
- Un nouvel élément de document (ou un nouveau champ) s'ajoute d'abord au nettoyage de
  `lib/document-model.ts` (sinon Eraser l'efface à l'enregistrement) et à `features` de
  `GET …/documents?atelier=1` si l'éditeur doit savoir que le serveur le garde : Eraser d'abord,
  puis l'extension.

## Chat, tabletop et Roll20

- Le tabletop a quitté Eraser (alpha 273) : il renaîtra dans l'extension Eraser Map
  (`Pink-Rain/Eraser_map`), sur d'autres principes. Ne pas le recréer dans Eraser ni y
  recopier l'ancien code.
- Le chat (`components/eraser/global-table-chat.tsx`, `lib/campaign-chat.ts`) garde ses
  messages dans l'onglet « Journal » du classeur Google « Tabletop » : ce classeur, son nom et
  la clé `tabletop` de `jdrSheetDefinitions` restent. Ses anciens onglets (Cartes, Tokens,
  Dossiers) ne sont plus lus ; ne jamais les effacer. Le chat passe en direct par Trystero.
- Le compagnon Roll20 appelle
  `http://127.0.0.1:32147/api/roll20/bridge` ; Eraser doit rester ouvert.
- Les sources Roll20 sont dans `integrations/roll20/` et les téléchargements
  distribués dans `public/roll20/`. Conserver les deux tant qu’aucun script de
  génération vérifié ne remplace les copies publiques.
- Le jeton de campagne est l’authentification du pont. Ne pas ajouter une
  authentification par cookie aux routes `/api/roll20/bridge`.
- Le MJ met le compagnon à jour depuis le dossier de campagne, en 3 étapes : le serveur local
  écrit lui-même ses fichiers dans le dossier du PC (`lib/roll20-companion.ts`, fichiers
  d'`integrations/roll20/extension` inclus par `?raw`), ouvre Chrome ou Opera sur leur page des
  extensions, puis le MJ copie le script Mod. Jamais de lien qui fait naviguer la fenêtre d'Eraser
  vers un fichier (`.js`, `.zip`) : elle l'affiche sans retour possible. Le compagnon se recharge
  seul quand son dossier a une version plus récente (`/api/roll20/bridge/companion`).
- Le compagnon et le script Mod portent la même version (`VERSION`, `manifest.json`) : le
  compagnon refuse un Mod d'une autre version. Après toute modification, recopier le Mod dans
  `public/roll20/` et refaire `public/roll20/eraser-roll20-companion.zip` (fichiers à la racine).

## Extensions

- Une extension vit dans son propre dépôt GitHub public (`Pink-Rain/Eraser_doc`, `Eraser_map`,
  `Eraser_page`, `Eraser_craft`) et se lie dans `linkedExtensions` (`lib/extensions.ts`), jamais depuis
  l'application. Toutes les installations les reçoivent toutes. **Les droits se règlent par module,
  dans chaque extension**, jamais par extension (le tabletop aura des modules pour les MJ, d'autres
  pour les joueurs…) ; les API d'Eraser les vérifient. Ne jamais renommer l'identifiant d'une
  extension liée (`doc`, `map`, `page`, `craft`).
- **L'atelier des pages vit dans `Pink-Rain/Eraser_page`** (extension `page`), les documents dans
  `Pink-Rain/Eraser_doc` (extension `doc`) : ne pas les recréer dans Eraser. Eraser garde l'affichage, le modèle et les API des pages, et les données de
  l'atelier (`lib/page-atelier-data.ts`). Un changement de l'atelier se fait dans ce dépôt ; un
  nouveau type de bloc touche les deux (lire son `AGENTS.md`).
- Ce qu'Eraser prête aux extensions (`components/eraser/extension-modules.ts`) et
  `EXTENSION_API_VERSION` forment le contrat : ne jamais retirer ni renommer un module prêté, ni
  changer ses exports, sans mettre à jour les extensions ; jamais de module qui tire du code
  serveur. Détail dans `ARCHITECTURE.md` (« Extensions »).
- **Une extension agit sur toute l'application, pas seulement sur sa page** (API 3) : module
  `boot` lancé au démarrage, `globalStyles`, emplacements (`extensionSlots`, `lib/extensions.ts`),
  fenêtres et messages, écoute de la page. Le contrat stable est `lib/extension-api.ts`
  (`eraser`, la même boîte à outils partout) et `extensionSlots` : on y ajoute, on n'y retire et
  on n'y renomme jamais rien (gardé par `tests/extensions.test.mjs`). Eraser ne connaît aucune
  extension : jamais de code propre à une extension pour la faire agir. Si une extension doit se
  glisser à un endroit précis d'une page, ajouter un emplacement générique (`<ExtensionSlot>`),
  jamais un code qui la nomme. Le CSS d'une extension vise `data-eraser-part` / `data-eraser-slot`,
  jamais les classes d'Eraser.
- **Rien dans Eraser qui ne serve qu'à une extension** : on ne prête que ce qu'Eraser utilise
  lui-même ; le reste vit dans le dépôt de l'extension. Pour retirer d'Eraser un module prêté,
  publier d'abord l'extension qui n'en a plus besoin, puis l'alpha qui le retire.
- Ce qu'une extension charge encore porte `aria-busy="true"` : le relevé de fluidité mesure son
  ouverture (et le changement de page) jusqu'à ce qu'il n'y en ait plus.
- Une extension n'appelle jamais Google elle-même : elle passe par une API d'Eraser (porte du quota,
  lectures partagées). Elle garde ses données sur le Worker (`store`, portée `extension:<id>`).
- Publier : Eraser d'abord quand l'extension en dépend, puis l'extension (construite contre
  `windows-app-migration`).

## Vérifications avant publication

1. `npm ci`
2. `npm run lint`
3. `npm run build`
4. `npm run test:ci`
5. `npm run desktop:build`
6. `npm run desktop:verify`
7. `npm run desktop:dist` sur Windows
8. Installer `Eraser-Setup.exe` et tester connexion, Google Drive/Sheets,
   campagnes, personnages, chat, extensions, Roll20 et mise à jour automatique.

Le workflow Windows produit `Eraser-Setup.exe`, `latest.yml` et le `.blockmap`,
puis teste une vraie installation. Une préversion est publiée seulement par un
commit contenant `[publish alpha]` sur `windows-app-migration`.
**Publier sans demander** (choix du propriétaire) : dès qu'un changement est fini et vérifié,
il part en alpha sur `windows-app-migration`, sans attendre d'accord. Le commit `[publish alpha]`
doit être le dernier poussé : c'est son message qui déclenche la publication.
Chaque commit `[publish alpha]` doit **incrémenter `version` dans
`package.json`** (`0.1.1-alpha.N` → `N+1`) et réécrire `RELEASE_ALPHA.md` :
sinon la construction réussit mais la publication échoue, le tag existant déjà,
et aucune mise à jour n’arrive aux utilisateurs.
