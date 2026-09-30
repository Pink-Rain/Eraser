# Feuille de route : données JDR de Google Sheets vers D1

## Décisions (septembre 2026)

- Toutes les données JDR passent dans la base D1 du Worker partagé
  `worker-accounts/` (Cloudflare).
- Les médias (images, cartes, portraits) restent sur Google Drive.
- Une seule application pour joueurs et MJ, qui s’adapte au rôle.
- Google Sheets devient une copie. Bouton **Exporter** : mettre à jour les
  feuilles du Drive, ou télécharger un `.xlsx` / `.csv`. Bouton
  **Importer** : depuis les feuilles du Drive ou un fichier, avec aperçu des
  différences avant d’appliquer.
- Le tabletop est hors de ce plan : il reste sur Google Sheets et n’est pas
  modifié jusqu’à décision contraire.
- Plan B si les quotas deviennent justes : forfait Cloudflare payant, ou
  Turso (voir « Plan B »).

Tant que la phase 8 n’est pas terminée, les règles d’`AGENTS.md` restent
valables : Sheets reste la source prioritaire pour chaque domaine qui n’a pas
encore basculé.

## Principes

1. **Un domaine à la fois, réversible.** Chaque domaine (vocabulaire, classes,
   campagnes…) a un interrupteur `sheets | d1` stocké dans le Worker. Pendant
   la transition, D1 est la source et chaque écriture est recopiée dans Sheets.
   Revenir en arrière consiste à rebasculer l’interrupteur sur `sheets`.
2. **Migration testée sur copie.** L’import initial tourne d’abord sur une
   base D1 de préproduction, avec un rapport (lignes lues, importées,
   rejetées), avant tout import réel.
3. **Aucune ancienne version ne doit écrire dans Sheets après une bascule.**
   Chaque appel au Worker envoie la version d’Eraser. Le Worker annonce une
   version minimale et refuse le jeton Google aux versions plus anciennes ou
   sans version : elles ne peuvent plus écrire dans des feuilles devenues des
   copies, et la mise à jour automatique les remet à niveau.
4. **Copie locale, synchronisation par différences.** L’application lit
   toujours sa SQLite locale ; D1 n’est interrogé que pour récupérer ce qui a
   changé, jamais à l’ouverture d’une page.
5. **Les droits sont vérifiés par le Worker.** Un joueur modifie ses
   personnages, un MJ ses campagnes, un admin tout. Masquer un bouton côté
   application ne suffit pas.
6. **Pas de changement de l’enveloppe.** Tout le travail est dans le serveur
   local (`app/`, `lib/`, `components/`) et le Worker : les mises à jour
   passent par la mise à jour à chaud, sans incrément d’`eraserShell`.

## Budget de requêtes

Limites gratuites (par jour, remise à zéro à 00:00 UTC) : 100 000 requêtes
Worker (partagées par tous les Workers du compte Cloudflare), 5 millions de
lignes D1 lues, 100 000 lignes D1 écrites. Une requête Worker peut exécuter
plusieurs requêtes D1 : c’est le nombre d’appels au Worker qui compte.

1. **Lecture locale.** Chaque installation garde une copie des données JDR
   dans sa SQLite. Ouvrir une page ne fait aucune requête.
2. **Une seule route de synchronisation** : « tout ce qui a changé depuis le
   curseur N », tous domaines confondus, en une réponse, paginée par environ
   1 000 lignes. Premier lancement : copie complète, une fois.
3. **Quand synchroniser** : au démarrage ; au retour sur l’application après
   plus de quelques minutes ; quand un signal de changement arrive ; toutes
   les 10 à 15 minutes seulement si l’application est visible et qu’aucun
   signal n’est arrivé. Jamais à la navigation.
4. **Deux vitesses.** Personnages et campagnes : synchronisés quelques
   secondes après un signal, seulement si l’élément modifié est affiché dans
   une fenêtre ouverte ; sinon marqués « à rafraîchir » et récupérés à
   l’ouverture de leur page ou à la synchronisation lente suivante. Données
   de référence (index, catalogues, vocabulaire, classes) : au plus toutes
   les 5 minutes, ou dès l’ouverture de la page concernée si un signal est en
   attente. Les signaux reçus en quelques secondes sont regroupés en une
   seule synchronisation.
5. **Écritures groupées.** L’interface enregistre immédiatement auprès du
   serveur local (`127.0.0.1`, gratuit), qui garde la file dans sa SQLite :
   rien n’est perdu si l’application se ferme. La file part vers le Worker
   après 3 secondes sans nouvelle modification, et au plus tard toutes les
   10 secondes pendant une saisie continue, soit 6 envois par minute au
   maximum. Plusieurs modifications de la même ligne fusionnent en une seule
   ligne écrite. Seules les cellules modifiées sont envoyées : le Worker les
   fusionne dans la ligne, et il n’y a conflit que si deux personnes ont
   changé la même cellule. Les gros envois (collage, import) sont découpés en
   paquets d’environ 200 lignes. La réponse à une écriture contient les
   différences, sans relecture derrière. Si le Worker est injoignable ou le
   quota atteint, la file attend et l’application reste utilisable.
6. **Signaux de changement par Trystero** : un salon global pour les données
   de référence et un salon par campagne, protégés par des clés secrètes
   stockées dans D1. Le signal ne contient que « tel élément a changé » ; les
   données viennent toujours de D1. Une seule connexion par application,
   partagée entre ses fenêtres par `BroadcastChannel`.
7. **Pas de requête de session séparée** : chaque appel au Worker valide
   déjà le jeton, le cache de session local peut donc durer plus longtemps.
8. **Index SQL sur `updated_at`** dans chaque table : D1 compte les lignes
   parcourues, pas les lignes renvoyées. Sans cet index, chaque
   synchronisation relirait toutes les tables. (Il s’agit des index internes
   de la base, pas des pages « Index » d’Eraser, qui ne sont pas limitées.)
9. **Peu d’index SQL** : chacun ajoute une ligne écrite par modification.
   Pas de table de journal séparée : le curseur de synchronisation est une
   colonne de la ligne elle-même, et les suppressions sont douces, ce qui
   suffit à les transmettre.
10. **Garde-fous** : attente croissante après une erreur, plafond d’envois
    par minute côté application, compteur par installation visible dans
    l’administration, alerte à 50 % puis 80 % des quotas du jour.
11. **Sauvegarde automatique** : export vers le Drive à la fin de chaque
    session de jeu et chaque nuit, réimportable avec le bouton Importer.

### Estimations

- 8 joueurs, 4 h de partie : environ 1 600 appels au Worker (moins de 2 %).
- Journée complète : 6 h de préparation (MJ à 20 cellules par minute, admin
  à 1 modification par minute), puis 5 h de partie à 8. Environ 6 800 appels
  au Worker (7 %), 23 000 lignes écrites (23 %), moins de 150 000 lignes lues
  (3 %). Les lignes écrites sont la limite la plus proche.

### Plan B

Si le compteur dépasse régulièrement 50 % des lignes écrites par jour en
conditions réelles, deux sorties existent, sans rien perdre :

- passer au forfait Cloudflare payant (5 $ par mois), sans changer de code ;
- déplacer les données JDR vers Turso (gratuit : 10 millions de lignes
  écrites et 500 millions lues par mois). Turso est aussi du SQLite : mêmes
  tables, mêmes requêtes ; la copie locale et la file d’écriture restent
  identiques. Seul le module d’accès aux données change, plus un module
  natif à embarquer dans l’installateur (incrément d’`eraserShell`).

Pour que cette sortie reste simple, les requêtes SQL restent du SQLite
standard, sans fonction propre à D1.

## Modèle de données D1

- Une table par domaine. Colonnes pour ce qui sert à filtrer (`id`,
  `owner_uid`, `campaign_id`, `page_linked`, `name`, `updated_at`,
  `deleted_at`), plus une colonne `data` en JSON pour le reste. La feuille de
  personnage compte plusieurs centaines de colonnes : elle devient un seul
  document JSON par personnage.
- Une colonne `version` par ligne. Une modification envoie la version
  qu’elle a lue ; si la même cellule a été changée entre-temps, le Worker
  refuse (409) au lieu d’écraser silencieusement.
- Suppression douce (`deleted_at`), cohérente avec la corbeille
  d’administration actuelle.
- Les migrations D1 sont des fichiers numérotés dans
  `worker-accounts/migrations/`, appliqués par le workflow de déploiement. On
  n’en supprime jamais une, comme pour `drizzle/`.

## Phases

Chaque phase se termine par une préversion alpha installée et vérifiée.

### Phase 0 : socle (aucun changement visible)

- `worker-accounts/package.json` et tests du Worker sur une D1 locale (il
  n’en a aucun aujourd’hui).
- Migrations D1 numérotées, en plus de `schema.sql`.
- Base D1 de préproduction, créée par le workflow de déploiement.
- Droits par rôle et par propriétaire dans le Worker. Fermer au passage la
  faille de `shared_records` : aujourd’hui, n’importe quel compte peut lire
  et écrire n’importe quel scope.
- Version d’Eraser envoyée à chaque appel ; version minimale annoncée par le
  Worker.
- Interrupteurs par domaine (`sheets | d1`), tous sur `sheets`.
- Couche `lib/data/` par domaine, avec deux implémentations (Sheets, D1)
  choisies par l’interrupteur. `lib/google-sheets.ts` (≈ 5 900 lignes) est
  découpé progressivement dans cette couche.

### Phase 1 : moteur de synchronisation (aucun changement visible)

- Copie locale dans la SQLite, route de synchronisation par différences,
  file d’écriture locale et envois groupés.
- Signaux Trystero, connexion partagée entre fenêtres.
- Garde-fous et compteur de requêtes dans l’administration.
- Testé de bout en bout sur un domaine factice avant tout domaine réel.

### Phase 2 : Exporter et sauvegarde automatique

- Téléchargement `.xlsx` et `.csv` de toutes les données (ajout d’une
  bibliothèque d’écriture Excel, aucune n’est présente aujourd’hui).
- Mise à jour des feuilles Eraser existantes sur le Drive, sans jamais en
  recréer une qui existe déjà.
- Sauvegarde automatique vers le Drive.
- Construit sur `lib/data/` : fonctionne avant et après chaque bascule. C’est
  le filet de sécurité avant de migrer quoi que ce soit.

### Phase 3 : données de référence

Vocabulaire, index du monde (créatures, lieux, religions, peuples, langues),
catalogue des classes et leur contenu (présentation, sorts), catalogue
d’objets (onglet Objets et dossier « Objets »), types de contenants.
Peu d’écritures, risque faible : c’est le premier vrai domaine basculé.

### Phase 4 : campagnes

Campagnes, appartenance des personnages aux campagnes.

### Phase 5 : personnages

Feuilles de personnage, relations, contenants et inventaires (personnage et
campagne).

### Phase 6 : PNJ et magasins

### Phase 7 : Importer

- Depuis les feuilles du Drive ou depuis un `.xlsx` / `.csv`.
- Aperçu : ajouts, modifications et suppressions, domaine par domaine.
- Les suppressions ne s’appliquent que si on les coche explicitement.
- Une sauvegarde est exportée automatiquement avant d’appliquer.
- Doit exister avant la phase 8 : une fois la recopie vers Sheets arrêtée,
  c’est le seul chemin d’une feuille modifiée à la main vers Eraser.

### Phase 8 : fin de transition

- Arrêt de la recopie vers Sheets, domaine par domaine, après quelques
  semaines sans retour en arrière.
- Les index locaux (`character_index`, `campaign_index`, `class_index`,
  `sheet_index_syncs`) sont remplacés par la copie locale synchronisée, par
  des migrations `drizzle/` ajoutées (jamais supprimées).
- Mise à jour d’`AGENTS.md` et d’`ARCHITECTURE.md`.
- Tant que le tabletop reste sur Sheets, l’accès Google garde ses droits
  Sheets.

## Pour chaque domaine (phases 3 à 6)

1. Tables et routes D1 + tests du Worker.
2. Script d’import depuis Sheets, idempotent, testé sur la D1 de
   préproduction, avec rapport.
3. Lecture depuis D1 ; comparaison automatique avec Sheets pendant quelques
   jours pour repérer les écarts.
4. Bascule de l’interrupteur sur `d1`, avec recopie des écritures vers Sheets.
5. Vérification en partie réelle, puis domaine suivant.
