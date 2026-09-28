# Feuille de route : données JDR de Google Sheets vers D1

Décision (septembre 2026) :

- toutes les données JDR passent dans la base D1 du Worker partagé
  `worker-accounts/` ;
- les médias (images, cartes, portraits) restent sur Google Drive ;
- une seule application pour joueurs et MJ, qui s’adapte au rôle ;
- Google Sheets devient une copie : bouton **Exporter** (mettre à jour les
  feuilles du Drive, ou télécharger un `.xlsx` / `.csv`) et bouton
  **Importer** (depuis les feuilles du Drive ou un fichier, avec aperçu des
  différences avant d’appliquer).

Tant que la phase 7 n’est pas terminée, les règles d’`AGENTS.md` restent
valables : Sheets reste la source prioritaire pour chaque domaine qui n’a pas
encore basculé.

## Principes

1. **Un domaine à la fois, réversible.** Chaque domaine (vocabulaire, classes,
   campagnes…) a un interrupteur `sheets | d1` stocké dans le Worker. Pendant
   la transition, D1 est la source et chaque écriture est recopiée dans Sheets.
   Revenir en arrière consiste à rebasculer l’interrupteur sur `sheets`.
2. **Migration testée sur copie.** L’import initial tourne d’abord sur une
   base D1 de préproduction, avec un rapport (lignes lues, importées,
   rejetées) avant tout import réel.
3. **Aucune ancienne version ne doit écrire dans Sheets après la bascule.**
   Le Worker annonce une version minimale d’Eraser. En dessous, l’app
   s’installe à jour avant d’écrire. Sans cela, une installation restée
   ancienne continuerait à écrire dans des feuilles devenues simples copies.
4. **Copie locale, synchronisation par différences.** Voir « Budget de
   requêtes » ci-dessous. L’application lit toujours sa SQLite locale ;
   D1 n’est interrogé que pour récupérer ce qui a changé depuis la dernière
   synchronisation, et jamais à l’ouverture d’une page.
5. **Les droits sont vérifiés par le Worker.** Un joueur modifie ses
   personnages, un MJ ses campagnes, un admin tout. Masquer un bouton côté
   application ne suffit pas.

## Budget de requêtes

Limites gratuites (par jour, remise à zéro à 00:00 UTC) : 100 000 requêtes
Worker (partagées par tous les Workers du compte Cloudflare), 5 millions de
lignes D1 lues, 100 000 lignes D1 écrites. Une requête Worker peut exécuter
plusieurs requêtes D1 : c’est le nombre d’appels au Worker qui compte.

1. **Lecture locale.** Chaque installation garde une copie des données JDR
   dans sa SQLite. Ouvrir une page ne fait aucune requête.
2. **Une seule route de synchronisation** : « tout ce qui a changé depuis le
   curseur N », tous domaines confondus, en une réponse. Premier lancement :
   copie complète, une fois.
3. **Quand synchroniser** : au démarrage ; au retour sur l’application après
   plus de quelques minutes ; quand un signal de changement arrive (signaux
   regroupés sur quelques secondes, une seule synchronisation pour tous) ;
   toutes les 10 à 15 minutes seulement si l’application est visible et
   qu’aucun signal n’est arrivé. Jamais à la navigation.
   Deux vitesses : les personnages et campagnes suivent les signaux en
   quelques secondes ; les données de référence (index, catalogues,
   vocabulaire, classes) au plus toutes les 5 minutes, ou dès l’ouverture de
   la page concernée si un signal est en attente.
4. **Écritures groupées.** L’interface enregistre immédiatement auprès du
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
5. **Signaux de changement par Trystero**, dans un salon par campagne protégé
   par une clé secrète stockée dans D1. Le signal ne contient que « le
   domaine X a changé » ; les données viennent toujours de D1.
6. **Pas de requête de session séparée** : chaque appel au Worker valide
   déjà le jeton, le cache de session local peut donc durer plus longtemps.
7. **Index sur `updated_at`** dans chaque table : D1 compte les lignes
   parcourues, pas les lignes renvoyées. Sans cet index, chaque
   synchronisation relirait toutes les tables.
8. **Peu d’index** : chaque index ajoute une ligne écrite par modification.
9. **Garde-fous** : attente croissante après une erreur, plafond de requêtes
   par minute côté application, compteur de requêtes par installation visible
   dans l’administration.

Estimation pour 8 joueurs un jour de partie (4 h) : environ 200 requêtes
par personne, soit environ 1 600 par jour, moins de 2 % du quota.
Un MJ qui modifie 20 cellules par minute pendant 3 heures : au plus
1 080 envois et environ 7 000 lignes écrites (index compris), et moins de 300
synchronisations pour les 7 autres joueurs grâce aux deux vitesses.

## Modèle de données D1

- Une table par domaine. Colonnes indexées pour ce qui sert à filtrer (`id`,
  `owner_uid`, `campaign_id`, `page_linked`, `name`, `updated_at`,
  `deleted_at`), plus une colonne `data` en JSON pour le reste. La feuille de
  personnage compte plusieurs centaines de colonnes : elle devient un seul
  document JSON par personnage, pas une table de plusieurs centaines de
  colonnes.
- Une colonne `version` par ligne. Une modification envoie la version
  qu’elle a lue ; si quelqu’un a écrit entre-temps, le Worker refuse (409)
  au lieu d’écraser silencieusement.
- Suppression douce (`deleted_at`), cohérente avec la corbeille
  d’administration actuelle.
- Les migrations D1 deviennent des fichiers numérotés dans
  `worker-accounts/migrations/`, appliqués par le workflow de déploiement. On
  n’en supprime jamais une, comme pour `drizzle/`.

## Phases

### Phase 0 : socle (aucun changement visible)

- `worker-accounts/package.json` et des tests du Worker sur une D1 locale
  (il n’en a aucun aujourd’hui).
- Système de migrations D1 numérotées, en plus de `schema.sql`.
- Modèle d’autorisation par rôle et par propriétaire dans le Worker.
  Au passage, fermer la faille actuelle de `shared_records` : n’importe quel
  compte peut aujourd’hui lire et écrire n’importe quel scope.
- Version minimale d’application annoncée par le Worker.
- Interrupteurs par domaine (`sheets | d1`), tous sur `sheets`.
- Côté application, une couche `lib/data/` par domaine, avec deux
  implémentations (Sheets, D1) choisies par l’interrupteur.
  `lib/google-sheets.ts` (≈ 5 900 lignes) est découpé progressivement dans
  cette couche.

### Phase 1 : Exporter (filet de sécurité avant de migrer)

- Téléchargement `.xlsx` et `.csv` de toutes les données. Ajouter une
  bibliothèque d’écriture Excel (aucune n’est présente aujourd’hui).
- Mise à jour des feuilles Eraser existantes sur le Drive, sans jamais en
  recréer une qui existe déjà.
- Construit sur la couche `lib/data/` : le même bouton fonctionne avant et
  après la bascule.

### Phase 2 : données de référence (peu d’écritures, risque faible)

Vocabulaire, index du monde (créatures, lieux, religions, peuples, langues),
catalogue des classes et leur contenu (présentation, sorts), catalogue
d’objets (onglet Objets et dossier « Objets »), types de contenants.

### Phase 3 : campagnes

Campagnes, appartenance des personnages aux campagnes.

### Phase 4 : personnages

Feuilles de personnage, relations, contenants et inventaires (personnage et
campagne).

### Phase 5 : PNJ et magasins

### Phase 6 : tabletop (reportée)

Le tabletop n’est pas touché pour l’instant : il reste sur Google Sheets
jusqu’à décision contraire.

### Phase 7 : fin de transition

- Arrêt de la recopie vers Sheets, domaine par domaine, après quelques
  semaines sans retour en arrière.
- Les index locaux (`character_index`, `campaign_index`, `class_index`,
  `sheet_index_syncs`) sont remplacés par la copie locale synchronisée depuis
  D1, par des migrations `drizzle/` ajoutées (jamais supprimées).
- Une fois le tabletop migré lui aussi, Google ne sert plus qu’aux médias :
  les droits OAuth sont réduits à Drive.
- Mise à jour d’`AGENTS.md` et d’`ARCHITECTURE.md`.

### Phase 8 : Importer

- Depuis les feuilles du Drive ou depuis un `.xlsx` / `.csv`.
- Aperçu : ajouts, modifications et suppressions, domaine par domaine.
- Les suppressions ne s’appliquent que si on les coche explicitement.
- Une sauvegarde est exportée automatiquement avant d’appliquer.

## Pour chaque domaine (phases 2 à 5)

1. Tables et routes D1 + tests du Worker.
2. Script d’import depuis Sheets, idempotent, testé sur une D1 de
   préproduction, avec rapport.
3. Lecture depuis D1 ; comparaison automatique avec Sheets pendant quelques
   jours pour repérer les écarts.
4. Bascule de l’interrupteur sur `d1`, avec recopie des écritures vers Sheets.
5. Vérification en partie réelle, puis domaine suivant.
