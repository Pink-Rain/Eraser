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

`node:sqlite` est synchrone : chaque requête bloque le serveur. La base est donc en
WAL avec `synchronous = NORMAL` (pas d'écriture forcée sur le disque à chaque modification),
ses requêtes compilées sont gardées par texte, et `batch()` exécute sa transaction d'un seul
tenant. Les médias en cache se lisent et s'écrivent de façon asynchrone.

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

Parmi ces `shared_records`, deux portées décrivent les personnages sans passer par Google :
`character-history` (chutes, retours, objets reçus, pour le dossier de campagne) et
`character-satiety` (`lib/character-satiety.ts`) : la barre de rassasiement (5 charges) et les
jours passés par campagne. La règle (nuit, ellipse, repas) est dans `lib/satiety.ts`, commune
à la page et au serveur ; `/api/characters/satiety` applique chaque action sur la barre relue
(une à la fois par personnage). Elle n'est pas dans la case JSON de la fiche : une nuit de
groupe donnée par le MJ créerait sinon un conflit sur la fiche ouverte de chaque joueur.

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

Les sessions du Créateur de session vivent dans la feuille « Sessions de
campagne » (`lib/campaign-sessions.ts`). Une session garde seulement les
identifiants de ses personnages, PNJs et magasins ; la colonne « Ajouté au
créateur de session » des PNJs et magasins vaut « Oui » tant qu’ils figurent dans
au moins une session.

Depuis l’alpha 257, une session garde aussi ses lieux de l’Index des lieux
(« Lieux liés (JSON) » : identifiant, nom, onglet ; clé de visibilité `place:ID`) et
ses dates en jeu (« Calendrier », « Date de début », « Date de fin », écrites telles
qu’affichées : « 12 Brumaire 1023 AC »). Le Créateur cherche un lieu dans l’index
et en ajoute un absent (action `ensure` de `/api/resources/world-indexes`) ; l’ancien
texte « Lieux de la session » reste affiché tant qu’il n’est pas vide. Le journal
montre les dates à tous et ajoute les lieux liés à ceux que citent les notes.

Les dates du monde (naissance sur la fiche, sessions) se choisissent dans
`components/eraser/calendar-date-field.tsx` : le calendrier de Cir’Hoit de l’Index
des calendriers d’office (`defaultWorldCalendar`, `lib/calendars.ts`), un autre au
besoin. `/api/calendars` ne renvoie que les calendriers, lisibles par les joueurs.
La fiche range « Date de naissance », « Calendrier de naissance » et « Lieu de
naissance » après « Sorts de classe choisis JSON » (`characterBirthHeaders`) ; les
index des onglets personnalisés et des choix de classe sont cherchés par leur nom.

Ce que les joueurs voient d’une session est réglé dans la colonne « Cachés (JSON) »
(`lib/session-reveal.ts`, clés `character:ID`, `npc:ID`, `shop:ID`, `event:ID`, `place:ID`) :
toute chose ajoutée arrive cachée, l’œil du Créateur la révèle, le journal des
joueurs ne montre que ce qui est révélé (`revealedSession`). Une case vide (sessions
d’avant l’alpha 237) ne cache rien ; une case illisible cache tout. La vitrine d’un
magasin (`magasin-et-fouille/sauvegardes?shop=ID`, la fenêtre du journal
`/api/campaigns/[id]/shops/[shopId]`) applique la même règle à un joueur.

Les magasins sont les mêmes partout (`ShopCards`) : le MJ voit l'effet des items, un
joueur seulement leur description (`shopForPlayers`, `lib/shop-purchase.ts`, appliqué
aussi au tabletop et à Roll20). Chaque ligne garde ses exemplaires (`quantity` dans
« Objets JSON » ; absent : le « Nombre max » de l'item, sinon 1). Un achat
(`.../buy`, `lib/shop-access.ts`) retient d'abord les exemplaires (`takeFromShop`,
verrou « shops »), puis paie avec la bourse (`replaceCharacterPurse`) et remplit
l'inventaire (`addCharacterInventoryItem` avec `count`) ; un refus remet tout comme
avant. La vente est gardée dans la colonne « Ventes JSON », que seul un achat écrit (un
enregistrement du MJ peut seulement y marquer « remis en vente »). Elle appartient à
une session (celle de l'achat, sinon la dernière où le magasin apparaît) et ne
s'affiche que là. La fenêtre du journal ne relit la page qu'à sa fermeture.
Le change : 1 PO = 100 PC, 1 PN = 150 PC (`planPayment`).

Le cadrage d’un token (`components/eraser/portrait-framing.tsx`) recadre les avatars
partout : sous 72 px, il agrandit et décale l’image elle-même, et ne le fait donc
que si son parent la rogne exactement (sinon, seul le point de vue change). Un avatar
doit être une `<img>` pleine dans un cadre `overflow-hidden`, pas une image arrondie
toute seule.

Un MJ peut aussi cacher un personnage joueur aux autres joueurs de la campagne
(tableau de bord) : portée Worker `campaign-hidden-characters`, une entrée par
campagne (`lib/campaign-hidden-characters.ts`). Le tableau de bord, le journal, les
relations et les transferts d’objets des joueurs l’ignorent ; son joueur, le MJ et
les administrateurs le voient toujours.

Les portraits, bannières et fonds de carte partagés passent par Google Drive.
`lib/shared-media.ts` utilise le stockage local comme cache et sait migrer les
anciens médias locaux sans remplacer Drive comme source partagée.

## Index : présentations, filtres, cartes et formulaires

Vocabulaire du code (chaque mot ne désigne qu’une chose) :

- **Présentation** : la forme donnée aux lignes d’un onglet (liste, kanban,
  maître-détail, calendrier, tableau de bord, galerie, chronologie,
  arborescence, codex ; tableau et cartes pour les blocs de page). Modèle
  `lib/index-presentations.ts` (`Presentation`, `PresentationKind`), éditeur
  `components/eraser/index-presentations-editor.tsx`, affichage
  `components/eraser/index-presentation.tsx`, formes de départ
  `lib/index-presentation-starters.ts`. Enregistrées sur le Worker (portées
  `index-presentations` et `index-view-presets`, `lib/index-presentations-store.ts`).
- **Filtre** : des conditions sur les lignes (`FilterCondition`,
  `filterOperators`, `matchesFilter`, dans `lib/index-windows.ts`).
- **Onglet-fenêtre** (`IndexWindow`) : un onglet sans données propres qui
  réaffiche les lignes d’un filtre, en tableau ou en cartes, ou un onglet stat.
  Gardé dans le classeur Google « Eraser · Réglages des index »
  (`lib/index-settings.ts`), c’est le dernier réglage d’index encore dans Sheets.
- **Cartes** (`lib/index-cards.ts`), **formulaires et survols**
  (`lib/index-layouts.ts`), **stats** (`lib/index-stats.ts`) : sur le Worker
  (portées `index-cards`, `index-layouts`, `index-stats`).
- **Bloc « Vue d’index »** d’une page (`ViewBlock`, `lib/custom-pages.ts`) :
  réglé dans la page (onglet, présentation, forme, filtre, tri, clic), ou
  montrant une vue enregistrée (`savedViewId`) : la vue règle alors tout cela,
  la page garde son titre, sa hauteur, son nombre de lignes, sa page de ligne et
  la recherche. Le bloc garde une copie de la vue (ce que la page montre si la
  vue disparaît) ; « Détacher pour cette page » la lui laisse en propre. Le
  serveur des pages lit la vue sur le Worker, jamais dans Google
  (`linkedBlock`, `app/api/pages/block-data/route.ts`). L’ancien champ `viewId`
  (onglet-fenêtre, alpha 206) n’est jamais relu d’office.
- **Vue enregistrée** (`SavedView`, `lib/index-saved-views.ts`) : un filtre, un
  tri et une présentation sous un nom. Gardée sur le Worker (portée
  `index-saved-views`, une entrée par vue, `lib/index-saved-views-store.ts`) ;
  les onglets-fenêtres de la feuille sont relus comme des vues tant qu'aucune
  vue enregistrée ne les remplace (même identifiant), jamais modifiés. Créée et
  réglée par le dialogue « Nouvelle vue » de l'index, choisie dans le groupe
  « Vues » du choix d'onglet, affichée sous sa présentation (tableau, cartes,
  liste, kanban…, onglet stat), réutilisable par les blocs de page ; le
  dialogue nomme les pages qui la montrent avant de la modifier ou de la
  supprimer (`savedViewUses`). Voir la roadmap « Vues des index ».

Les clés déjà enregistrées ou échangées avec le serveur gardent leurs anciens
noms et ne se renomment jamais : actions `save-view`, `delete-view`,
`save-view-preset`, clés `views` et `viewPresets` de l’API des réglages, portées
du Worker, colonnes de la feuille, préfixe de version `vue:`, élément `@vue`.

## Colonnes liées ↔

Une colonne liée (`kind: "linked"`, `link: { index, tab, column }`) nomme la colonne qui lui
répond en face ; écrire un nom d’un côté l’inscrit de l’autre (`propagateCellLinks`,
`syncRowLinks` dans `lib/world-indexes.ts`). Les deux bouts sont dans le schéma de leur
classeur (« Eraser · colonnes ») ; les liens de départ d’Eraser (`defaultWorldIndexLinks`)
sont les mêmes réglages.
- **Vers son propre index** : « Cet index » dans « Modifier » (« Se recycle en » ↔
  « Recyclage de » dans les items), ou une colonne qui se répond à elle-même (« Allié de »),
  comme Ancêtres ↔ Descendant des peuples. Une ligne ne se cite jamais en retour.
- **Sur plusieurs onglets** : posée dans plusieurs onglets, la colonne a une réponse qui les
  vise tous (`link.tab: "*"`, élargie par `ensureReciprocal`) ; les bouts d’en face d’une même
  colonne sont réunis (`linkEndsOf`) : un nom cité y est cherché partout, et une ligne absente
  n’est créée qu’une fois, dans le premier onglet qui a la colonne d’en face.
- **Refusés avant toute écriture** (`reciprocalOf`, `linkedColumnProblems`, partagé avec
  l’éditeur) : « Nom » ou « ID » comme réponse, une réponse qui répond déjà à une autre
  colonne, et, dans un même index, une réponse ajoutée en même temps sous un autre type (son
  réglage, écrit après, effacerait le lien). Ajoutées ensemble et se visant l’une l’autre, les
  deux colonnes sont acceptées : la seconde, déjà créée par la première, est seulement réglée.

## L’Index des items, un index du moteur

L’Index des items est l’index `objects` du moteur (`OBJECTS_INDEX_KEY`,
`lib/world-index-definitions.ts`) : `lib/world-indexes.ts` le lit, l’écrit, gère ses relations
(colonnes liées, listes liées, recherches, agrégats), son « Modifier » et sa corbeille, comme
pour tout index. Sa page est `WorldIndexPage`. Il n’a **pas d’autre lecteur** :
- le moteur trouve son classeur (le seul du dossier « Objets », sous son nom du Drive), en lit
  les onglets et la ligne 1, puis chaque onglet par sa lecture habituelle (`readTable`), qui
  garde ici les icônes `=IMAGE` (`readFormattedSheet(…, { keepImages: true })`). Un onglet
  ajouté, renommé ou réuni dans Sheets fait relire ses onglets ; « Actualiser » aussi ;
- avant d’être servi, un item nommé sans ID reçoit le sien (`freezeObjectIndexRowIds`, écrit
  par le moteur lui-même) ; icônes, colonnes de combat et en-têtes vides sont complétés en
  arrière-plan (`maintainObjectIndexTables`) ;
- l’inventaire, les magasins, les fouilles, les événements, les références, les dons et la
  corbeille des colonnes lisent **le catalogue du moteur** (`objectCatalog`, par
  `lib/object-catalog.ts`) : les mêmes lignes que l’index, donc à jour de ses écritures sans
  relecture. `current` attend une version de moins de cinq minutes (pour écrire d’après elle) ;
  sinon la copie gardée est rendue tout de suite et relue en arrière-plan ;
- une écriture d’ailleurs dans son classeur (icônes, « Nombre max », corbeille) fait relire
  l’index et l’inventaire (`onSpreadsheetWrite`) ;
- ses colonnes prennent le type et les verrous des items (`objectColumnSpec`,
  `objectColumnPolicy`) : l’inventaire, les magasins et la table les lisent par leur nom ;
- le regroupement des anciens classeurs séparés (`lib/object-index-regroup-server.ts`) lit ces
  anciens classeurs à part (`readLegacyObjectSpreadsheet`) : une migration, qui ne sert les
  items à personne ;
- tous les items peuvent tenir dans un seul onglet : la colonne « Genre » range chaque item
  dans l’inventaire (`genreInventoryCategory`, `inventoryKindOf`, `lib/inventory-schema.ts`) :
  Arme → Armes, Équipement → Équipement, tout autre genre → Inventaire (qui peut aussi aller au
  sol ou dans l’esthétique). Sans genre, le type décide, comme avant. Les types de magasin
  comparent aussi le genre (`shopTypeAllows`) : un type réglé sur « Armes » vend les items de
  genre « Arme ».
- un **inventaire sur mesure** (le + sous chacune des deux colonnes de la fiche) est un
  contenant « Inventaire » qui a une couleur : colonnes « Couleur », « Icône », « Contenu
  accepté » et « Colonne » (Gauche, Droite : où il s'affiche) de « Contenants personnages »,
  vides pour les autres (une version plus ancienne y voit un sac). Les grandes catégories
  (sauf la bourse) et ces inventaires se replient ; le pli est gardé sur l'ordinateur
  (`eraser:inventory-folds`).
  « Contenu accepté » : familles (Armes, Équipement, Objets) et mots-clés séparés par « | »,
  vide = tout sauf la monnaie (`canItemGoInCustomInventory`). On n’y range qu’exprès : le
  rangement automatique (achat, don, ajout sans contenant) ne le vise jamais
  (`itemAutoFitsInventoryContainer`).
Les vues d’avant désignaient un onglet par « fichier:sheetId » : la page les lit sous son nom.

### Affichage des items (inventaire, magasin, fouille)

« Index des items › Modifier › Affichage des items » (`components/eraser/item-display-editor.tsx`)
règle, endroit par endroit (`inventory`, `shop`, `search`), les colonnes de l’item : leur zone
(à côté du nom, sous le nom, avec la description, avec l’effet ; absente : masquée), leur ordre,
leur style (valeur seule, « Libellé : valeur », texte, pastilles) et pour qui (tous, MJ seul,
joueurs seuls). Modèle pur `lib/item-display.ts` ; gardé sur le Worker (portée `item-display`,
une entrée par endroit, `lib/item-display-store.ts`) ; un endroit sans entrée garde l’affichage
d’Eraser, reproduit à l’identique par `defaultItemPlaceDisplay`.
- Chaque endroit garde sa forme, ses boutons et ce qui lui est propre (quantité, rareté du
  tirage, prix modifiable…) ; une zone suit ce que l’endroit fait de sa place (description
  repliée de l’inventaire, effet caché aux joueurs dans un magasin…). Une case vide ne s’affiche
  jamais.
- Les colonnes qu’Eraser lit déjà dans l’item (`itemKnownColumns` : type, sous-type, prix,
  description, effet, valeur, traits de combat) se dessinent depuis l’item, retouches de
  l’exemplaire comprises ; l’inventaire garde type, sous-type, description et effet modifiables.
  Les traits se dessinent ensemble (`ObjectTraits only`). Les autres colonnes viennent de
  `GET /api/items/display`, qui renvoie les réglages taillés pour le lecteur
  (`itemDisplayForViewer` : rien de « MJ seul » ni de l’effet d’un magasin pour un joueur) et la
  valeur de ces seules colonnes, lue dans `objectCatalog` (aucune lecture Google de plus).
- Côté page (`components/eraser/item-display.tsx`) : une copie pour la session (et la dernière
  dans le navigateur), relue en arrière-plan passé une minute et quand l’Index des items change.
  Une colonne renommée dans « Colonnes » est suivie (`followItemDisplayRenames`).
- La roue « Régler l’affichage » (MJ, admin) de l’inventaire, du générateur et des sauvegardes de
  magasins et des fouilles ouvre l’éditeur sur son endroit (`?modifier=affichage-items&endroit=`).

## Rareté et emplacements, sections, listes d’index, index des pages

- **« Rareté et emplacements »** (type `rarity-places`, `lib/rarity-places.ts`) :
  une case, une ligne par rareté (`Commun : Armurerie - Marché noir`). Les lieux
  viennent de Lieux › Environnement et Lieux › Magasin. Les magasins
  (`lib/shop-schema.ts`, `loadRarityPlaceFinds`), les fouilles et les
  événements lisent cette colonne dans **tout** index qui l’a
  (`indexesWithColumnKind`, `lib/index-kinds-server.ts`) ; un lieu y désigne le
  magasin par son nom (`exact`). Un onglet qui n’a pas encore la colonne garde
  ses anciennes colonnes (rareté et emplacement principaux, secondaires) et les
  « Trouvailles » de Lieux › Magasin ; ces colonnes ne sont jamais effacées.
  Les statistiques la lisent par rareté, par lieu, ou par paire.
- **« Sections »** (`sections`, `lib/index-sections.ts`) : des paragraphes
  titrés, chaque titre sur une ligne `## Titre` (texte enrichi dans Sheets).
- **« Liste d’index »** (`index-list`) : choisit parmi les index qui ont une
  colonne d’un type donné (`GET /api/resources/index-kinds`). Lieux ›
  Environnement s’en sert pour « Fouille » (vide : les items) et « Événement »
  (`lib/environment-draws.ts`, page Événements).
- **Index des pages** (`lib/pages-index.ts`, clé `pages`) : un index sans
  feuille, construit pour chaque lecteur depuis les pages du Worker et le menu
  d’Eraser. Cartes, survols et vues comme un autre index ; utilisable dans un
  bloc Vue d’index.
- **Créateur de pages** : réservé aux administrateurs (`canBuildPages`,
  `lib/custom-pages.ts`) — créer, modifier, brouillons, menu. `canManagePages` (MJ
  et administrateurs) garde ce que le MJ fait d’une page qu’il lit (secrets, notes),
  sans la construire.
- **Dossiers des pages** (`lib/page-folders.ts`, `lib/page-folders-store.ts`, route
  `/api/pages/folders`) : un seul rangement pour toute la table, portée Worker
  `custom-page-folders`, clé `rangement` (dossiers imbriqués, place de chaque page). La clé d’une
  page est son identifiant, ou `eraser:` et l’adresse pour une page d’Eraser, reprise ou non
  (`folderKeyOf`) : reprendre, publier ou jeter une reprise ne la déplace pas. Supprimer un
  dossier remonte son contenu, jamais une page. Le serveur refait chaque geste sur le rangement
  relu ; l’explorateur l’affiche avant (retour en arrière si refus). La coque n’en lit que la
  copie en mémoire (`knownPageFolders`).
- **Explorateur des pages** (`components/eraser/page-directory.tsx`, `lib/page-explorer.ts`) :
  pages d’Eraser et pages de l’atelier sous une seule forme ; « Ouvrir » reprend une page
  d’Eraser en coulisses. `?dossier=` et `?vue=` (toutes, corbeille, modeles) gardent la vue ;
  l’atelier y revient. Onglets communs Pages · Menu · Modèles (`page-creator-nav.tsx`).
- **Menu et dossiers** : une entrée `dossier:<id>` (`lib/app-menu.ts`) montre les pages
  publiées et lisibles d’un dossier (au premier niveau : une section, un groupe par
  sous-dossier). Une page placée à la main n’y est pas répétée. L’éditeur du menu montre
  les pages d’une section comme des entrées (`expandSectionPages`) ; une page d’Eraser y
  entre comme un lien vers son adresse.
- **Versions brouillon d’une page** : portée Worker `custom-page-drafts`
  (`listPageSnapshots`, `savePageSnapshot`), 20 par page, supprimées avec la page.

## Fluidité de l'interface

Le réglage « Fluidité » du compte (`lib/visual-effects.ts`) pose `data-effects="light"` sur
`<html>` avant le premier affichage (script de `app/layout.tsx`) : d'office sur un ordinateur à
quatre cœurs ou moins, ou au choix. `app/globals.css` y coupe les animations et flous des états
de la fiche, tout `backdrop-filter` et la glissade de la barre latérale. Les surfaces
permanentes (en-tête, chat, barres collantes, notifications) n'utilisent pas de flou
d'arrière-plan : un fond opaque, que la page défile dessous ou non. Une règle CSS globale ne
doit jamais avoir la forme « [attribut*=…] * » : chaque élément y cherche ce texte chez tous
ses parents, à chaque calcul des styles.

Le React Compiler (`vite.config.ts`) mémorise composants et calculs de rendu. Le lint applique
ses règles (`react-hooks/*`) ; un composant qui les suspend (`eslint-disable react-hooks/…`)
n'est pas compilé et garde son comportement.

### Navigation

- Le routeur de vinext 0.0.50 est retouché à la compilation (`eraserVinextRouter`, dans
  `vite.config.ts`) : sa table des pages visitées est accessible (`__ERASER_VISITED_PAGES__`)
  et dure 30 minutes, et chaque page n'a qu'une copie (le « contexte d'interception », la
  page d'où l'on vient, ne sert qu'aux routes interceptées, qu'Eraser n'a pas). Si vinext
  change, la compilation l'écrit et `lib/navigation-cache.ts` retombe sur l'oubli complet.
- `lib/navigation-cache.ts` : une écriture vers `/api` n'oublie que la page où elle a été
  faite ; une page revue depuis sa copie, d'avant une modification ou de plus d'une minute,
  s'affiche aussitôt puis se relit en arrière-plan (mode « refresh » du routeur, sans vider
  les autres copies comme `router.refresh()`). Deux demandes identiques d'une même page en
  route (préchargement puis clic) partagent une seule réponse.
- Les liens de la barre latérale préchargent leur page quand ils sont visés (survol de
  120 ms, clavier), jamais d'office.

### Données et mesures

- `lib/warm-up.ts` : peu après le lancement par un MJ ou un admin, les index sont lus en
  arrière-plan, une fois, espacés de quelques secondes ; au premier refus de quota il
  s'arrête et reprend où il en était cinq minutes plus tard. Les caches de Google (plages,
  index, schémas, spécificités de classe) rendent leur copie aussitôt et la relisent derrière
  pendant six heures. Une relecture d'arrière-plan refusée par Google garde l'index en mémoire
  (jamais remplacé par un index sans réglages) et n'est pas une erreur du journal
  (`lib/background-work.ts`).
- Les réglages gardés sur le serveur partagé (mises en page, cartes, présentations, vues,
  cadenas, presets, statistiques, rangement des index) passent par `lib/shared-snapshot.ts` :
  copie servie tout de suite, relue derrière passé 30 s ; seules la première lecture, une
  lecture `fresh` (après ou avant une écriture) et « Actualiser » attendent. La vérification
  de session (`lib/site-auth.ts`) garde de même sa copie pendant la revérification, pour toutes
  les requêtes d'une page.
- `lib/timed-fetch.ts` : le délai des requêtes vers Google et le serveur partagé, arrêté dès
  la réponse lue ; une réponse qu'on ne lit pas passe par `discardResponse`.
- Pied de la barre latérale › jauge « Fluidité de cet ordinateur », pour chaque compte
  (`lib/fluidity-journal.ts`, `components/eraser/fluidity-panel.tsx`) : clics lents, gels de
  l'écran, temps de chaque page et attentes du serveur, gardés dans le navigateur. « Copier le
  relevé » y joint le relevé du serveur local (`/api/fluidity` : Google, serveur partagé,
  refus de quota). Un gel de plus de 0,4 s garde son profil (JS Self-Profiling, autorisé par
  l'en-tête `Document-Policy: js-profiling` de `next.config.ts`) : les fonctions qui tournaient,
  et dans le relevé copié quelques caractères de leur code pour les retrouver dans les sources.
  Le panneau ne se redessine pas à chaque mesure (il gelait l'écran, ce qui faisait une mesure).
- Recalcul du style : changer le style de `<body>` ou un `:has()` large refait le style de toute
  la page (des dizaines de millisecondes par recalcul sur l'index des items). Les fenêtres et
  menus Radix posent un calque sous eux au lieu de `pointer-events: none` sur `<body>`
  (`lib/modal-blocker.ts`, branché dans `@radix-ui/react-dismissable-layer` par
  `vite.config.ts`) ; `react-remove-scroll-bar` est remplacé par `lib/vendor/remove-scroll-bar.ts`
  (`<body>` ne défile jamais) ; plus de `body:has(…)` (attribut `data-tabletop-windows`), ni de
  `:has()` sur la coque de la barre latérale.
- Porte du quota (`lib/google-quota.ts`) : des requêtes refusées ensemble (429) ne comptent que
  pour un refus ; la pause ne s'allonge que pour un refus arrivé après la fin de la précédente.
- Lectures partagées (`lib/shared-reads.ts`) : une page n'attend la copie d'une autre
  installation que 6 s (l'arrière-plan, 80 s), puis lit Google elle-même ; une installation en
  pause de quota ne prend pas de bail, et son bail renouvelé le dit (`paused`) : personne ne
  l'attend.
- Salon en direct (chat, tabletop) : trystero préparait vingt connexions pair à pair d'un coup
  (1,5 à 2 s de gel au lancement et à chaque changement de salon). `vite.config.ts`
  (`eraserTrysteroPool`) les fait préparer une à une, au repos, six au plus. À vérifier à toute
  montée de version de trystero (la compilation prévient).
- `components/eraser/fold-section.tsx` : une partie de page repliable. Avec `serverOpen`, ses
  parties dépliées sont dans l'adresse (`?ouvert=…`, `lib/open-sections.ts`) et le serveur ne
  calcule que celles-là (page Google Drive et Sheets).

## Documents

La page Document d’une campagne (`/campagne/[id]/document`, menu › Créateur de session)
écrit des documents : un fond (fourni dans `public/documents/fonds`, envoyé depuis
l’ordinateur ou une adresse) et des zones de texte posées dessus, chacune avec sa police
(`public/documents/polices`, licence OFL), sa taille, son encre et son inclinaison. Le modèle
est pur et partagé (`lib/document-model.ts`) : mesures en unités du document (largeur 1000),
texte en paragraphes de morceaux stylés (gras, italique, souligné, barré, couleur).

- Une ligne par document dans la feuille « Documents de campagne » (`lib/campaign-documents.ts`),
  créée au premier document enregistré ; « ID session » le range dans une session.
- « Enregistrer » dessine le document dans le navigateur (`components/eraser/document-render.ts`,
  même coupure des lignes que l’éditeur) : le rendu WebP et l’impression JPEG sur fond blanc
  vont dans Drive avec le fond envoyé. Le PDF (une page, `lib/document-pdf.ts`) est fait à la
  demande de l’impression.
- Donner un document (`.../documents/[documentId]/give`) pose un item personnalisé dans le sac
  du personnage ; l’entrée `{"target":"document"}` du JSON de l’exemplaire le désigne, et
  l’inventaire l’ouvre d’un clic. `keepItemCharges` et `setCharacterInventoryItemModifiers`
  gardent cette entrée.
- Le Créateur de session montre les documents de la session ; Roll20 les reçoit en handouts
  (image) et en PDF du Journal (voir plus bas).

## Tabletop

Le tabletop conserve ses pages, routes API, composants Leaflet, styles globaux
et synchronisation Trystero. Un tabletop appartient à une campagne ou au bac à
sable. Les cartes et portraits partagés proviennent de Drive avec cache local.

## Roll20

Les sources sont dans `integrations/roll20/`. La page Roll20 télécharge encore
les copies versionnées dans `public/roll20/`; elles doivent donc rester présentes
tant qu’un script de génération ne les remplace pas.

Le compagnon appelle `/api/roll20/bridge` sur le serveur local (`?view=players` : les
personnages joueurs seuls, `?view=documents` : les documents seuls). Le token par défaut
qu’il dessine reprend le cadrage de l’éditeur de token (`framing`, `token-art.js`) ; le Mod
met aussi à jour les jetons déjà posés sur les cartes. Un document devient un handout (son
image, déposée comme les portraits) ; son PDF est déposé dans Journal › + Ajouter › PDF par
le compagnon, ou téléchargé si cette fenêtre de Roll20 a changé (le Mod ne peut pas créer de
PDF). Le lien d’une
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

