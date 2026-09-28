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
4. **Une requête par écran.** Les routes du Worker renvoient tout ce qu’un
   écran affiche (par exemple une campagne avec ses personnages, PNJ et
   magasins), pas une ligne à la fois. Le quota gratuit est de 100 000
   requêtes par jour et 10 ms de calcul par requête. Les calculs lourds
   (génération, mise en forme) restent dans l’application locale.
5. **Pas d’interrogation répétée du serveur.** Les autres joueurs sont
   prévenus d’un changement par Trystero (« le personnage X a changé ») et ne
   rechargent que ce qui a changé.
6. **Les droits sont vérifiés par le Worker.** Un joueur modifie ses
   personnages, un MJ ses campagnes, un admin tout. Masquer un bouton côté
   application ne suffit pas.

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

### Phase 6 : tabletop

Cartes, dossiers, jetons, journal (chat et jets). La sauvegarde des jetons
toutes les 15 s est regroupée en une requête par envoi.

### Phase 7 : fin de transition

- Arrêt de la recopie vers Sheets, domaine par domaine, après quelques
  semaines sans retour en arrière.
- Suppression des index locaux devenus inutiles (`character_index`,
  `campaign_index`, `class_index`, `sheet_index_syncs`) par une migration
  `drizzle/` dédiée.
- Google ne sert plus qu’aux médias : les droits OAuth sont réduits à Drive.
- Mise à jour d’`AGENTS.md` et d’`ARCHITECTURE.md`.

### Phase 8 : Importer

- Depuis les feuilles du Drive ou depuis un `.xlsx` / `.csv`.
- Aperçu : ajouts, modifications et suppressions, domaine par domaine.
- Les suppressions ne s’appliquent que si on les coche explicitement.
- Une sauvegarde est exportée automatiquement avant d’appliquer.

## Pour chaque domaine (phases 2 à 6)

1. Tables et routes D1 + tests du Worker.
2. Script d’import depuis Sheets, idempotent, testé sur une D1 de
   préproduction, avec rapport.
3. Lecture depuis D1 ; comparaison automatique avec Sheets pendant quelques
   jours pour repérer les écarts.
4. Bascule de l’interrupteur sur `d1`, avec recopie des écritures vers Sheets.
5. Vérification en partie réelle, puis domaine suivant.
