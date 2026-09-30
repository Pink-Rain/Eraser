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
  modifié jusqu’à décision contraire. Cela inclut son onglet Journal, qui
  contient aussi le chat de campagne (`/api/campaign-chat`).
- Plan B si les quotas deviennent justes : forfait Cloudflare payant, ou
  Turso (voir « Plan B »).
- **Porte de secours Drive** : si le serveur est plein ou injoignable,
  l’application bascule seule sur Google Sheets, puis revient sur D1 quand
  il répond de nouveau (voir « Mode secours Drive »). La recopie vers Sheets
  est donc permanente et l’accès Sheets est conservé.

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
   version minimale, d’abord comme simple avertissement dans l’application,
   puis, après un délai d’au moins une semaine, en refusant le jeton Google
   aux versions plus anciennes : elles ne peuvent plus écrire dans des
   feuilles devenues des copies. Le message de refus explique comment
   installer la mise à jour.
4. **Copie locale, synchronisation par différences.** L’application lit
   toujours sa SQLite locale ; D1 n’est interrogé que pour récupérer ce qui a
   changé, jamais à l’ouverture d’une page.
5. **Les droits sont vérifiés par le Worker.** Un joueur modifie ses
   personnages, un MJ ses campagnes, un admin tout. Masquer un bouton côté
   application ne suffit pas.
6. **Les secrets du MJ ne quittent pas le Worker.** La synchronisation
   applique les règles de visibilité actuelles : ce qu’un joueur ne peut pas
   voir aujourd’hui (notes de PNJ, contenu réservé au MJ…) n’est jamais
   envoyé dans sa copie locale. L’inventaire exact de ces champs est fait
   domaine par domaine avant chaque bascule.
7. **Pas de changement de l’enveloppe.** Tout le travail est dans le serveur
   local (`app/`, `lib/`, `components/`) et le Worker : les mises à jour
   passent par la mise à jour à chaud, sans incrément d’`eraserShell`.
8. **Jamais le jour d’une partie.** Pas de bascule de domaine, pas de hausse
   de version minimale et pas de préversion touchant aux données le jour ou
   la veille d’une partie.

## Ne jamais être bloqué en partie

Chaque panne possible et ce qui se passe :

| Panne | Conséquence | Prévu |
|---|---|---|
| Worker injoignable (réseau, panne Cloudflare) | Lecture normale, écritures en attente | Copie locale, file d’écriture, session hors ligne ; mode secours Drive si la panne dure |
| Quota D1 du jour atteint (les requêtes échouent jusqu’à 00:00 UTC, appliqué depuis le 1ᵉʳ septembre 2026) | Plus de partage par le serveur | Mode secours Drive, alertes à 50 % et 80 %, forfait payant activable en quelques minutes |
| Trystero sans connexion (4G, réseau filtré, relais en panne) | Les changements des autres arrivent moins vite | Synchronisation lente toutes les 5 minutes, indicateur « direct indisponible » |
| Google Drive injoignable ou autorisation expirée | Images non chargées | Cache local des médias, préchargement avant la partie |
| Bug dans une préversion | Données mal lues ou mal écrites | Interrupteurs par domaine, coupe-circuits, Time Travel D1, sauvegardes Drive |
| Mise à jour impossible sur un PC | Ancienne version | Délai d’au moins une semaine avant tout refus, message d’installation |

Mesures correspondantes :

1. **Session hors ligne.** Aujourd’hui, si le Worker ne répond pas,
   `accountFromSession` (`lib/site-auth.ts`) renvoie « pas de compte » et
   l’utilisateur se retrouve déconnecté. À corriger en phase 0 : le dernier
   compte validé est gardé localement ; en cas d’erreur réseau ou de quota
   (pas en cas de session révoquée), l’application reste ouverte, en lecture
   et avec la file d’écriture.
2. **Coupe-circuits dans le Worker**, modifiables par un admin sans
   nouvelle version : couper les signaux Trystero, forcer la synchronisation
   lente, suspendre la recopie vers Sheets, rebasculer un domaine sur
   `sheets`. Ces réglages sont gardés en cache sur chaque PC, pour rester
   connus quand D1 ne répond plus.
3. **Préchargement des médias** : à l’ouverture d’une campagne, les images
   de la campagne sont mises dans le cache local, pour qu’une panne Google
   pendant la partie ne vide pas l’écran.
4. **Recopie vers Sheets jamais bloquante** : si Google refuse ou ralentit,
   la recopie attend dans sa propre file ; D1 et la partie continuent.
5. **Procédure d’urgence** (voir plus bas), connue de l’admin.

## Mode secours Drive

Pendant une panne ou un quota atteint, la copie locale permet déjà de lire
et d’écrire, mais les joueurs ne voient plus les modifications des autres.
Le mode secours rétablit ce partage en passant par Google Sheets, qui a ses
propres limites (par minute, pas par jour : un pic ralentit sans bloquer la
journée).

1. **Sheets toujours à jour.** Chaque écriture confirmée dans D1 est recopiée
   dans Sheets par une file séparée, qui ne bloque jamais le reste. Les
   feuilles gardent pour chaque ligne sa révision et sa version D1. Toute
   nouvelle colonne ajoutée dans D1 l’est aussi dans les feuilles.
2. **Entrée automatique.** Quand le Worker répond « quota D1 atteint » ou
   « quota Worker atteint », ou reste injoignable plus de quelques minutes,
   l’application passe en mode secours. Tous les PC reçoivent la même erreur
   et basculent ensemble. Pas besoin de lire un réglage dans D1 : il serait
   lui aussi inaccessible. Un admin peut aussi forcer le mode secours sur
   son PC ; les derniers réglages connus sont gardés en local.
3. **Pendant le mode secours.**
   - Les écritures partent dans Sheets, comme avant la migration, **et**
     restent dans la file d’écriture D1 de chaque PC, marquées « secours ».
   - Les autres PC lisent les changements dans Sheets (ancienne méthode, plus
     lente) et mettent à jour leur copie locale.
   - Les signaux Trystero continuent de prévenir les autres.
   - Bandeau visible : « Mode secours : synchronisation par Google Drive ».
   - Les droits ne sont plus vérifiés par le Worker, comme aujourd’hui.
4. **Sortie automatique.** Une requête de test toutes les 15 minutes ; dès
   que D1 répond (au plus tard après 00:00 UTC pour un quota), chaque PC vide
   sa file vers D1, avec la gestion habituelle des conflits.
5. **Rattrapage.** Un PC éteint avant la fin de la panne vide sa file au
   prochain démarrage. Pour ne rien perdre si un PC ne revient jamais, le
   premier PC d’un admin ou d’un MJ qui revient sur D1 compare les lignes
   modifiées dans Sheets pendant le mode secours avec D1, et propose un
   import avec aperçu (même écran que le bouton Importer) pour ce qui
   manque.
6. **Le tabletop** n’est pas concerné : il reste sur Sheets en permanence.

Coût : la recopie vers Sheets consomme le quota Google (une écriture groupée
par envoi, largement sous les 60 écritures par minute et par utilisateur),
et l’implémentation Sheets de `lib/data/` est conservée et testée au lieu
d’être supprimée.

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
   changé la même cellule. La réponse à une écriture contient les
   différences, sans relecture derrière. Si le Worker est injoignable ou le
   quota atteint, la file attend et l’application reste utilisable.
6. **Signaux de changement par Trystero** : un salon global pour les données
   de référence et un salon par campagne, protégés par des clés secrètes
   stockées dans D1 (pas l’identifiant de campagne, qui n’est pas secret).
   Une seule connexion par application, partagée entre ses fenêtres par
   `BroadcastChannel`. Un signal part seulement après la confirmation de
   l’écriture par le Worker, pour que les autres ne rechargent pas avant que
   la donnée y soit. Il contient le type et l’identifiant de l’élément,
   jamais son contenu ; le nom affiché dans les notifications est lu dans la
   copie locale. Si Trystero ne se connecte pas, la synchronisation lente
   passe à toutes les 5 minutes tant que l’application est visible.
7. **Pas de requête de session séparée** : chaque appel au Worker valide
   déjà le jeton, le cache de session local peut donc durer plus longtemps.
8. **Index SQL sur la colonne de révision** dans chaque table : D1 compte
   les lignes parcourues, pas les lignes renvoyées. Sans cet index, chaque
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

### Limites techniques du Worker gratuit à respecter

Dépasser l’une d’elles fait échouer la requête : la file d’écriture la
renverrait sans fin et resterait bloquée. D’où :

- **10 ms de calcul par requête.** Le Worker ne lit ni ne réécrit le JSON
  des lignes : la fusion des cellules se fait dans SQLite
  (`json_patch`), la synchronisation renvoie le JSON tel qu’il est stocké.
- **50 requêtes D1 par appel au Worker et 100 paramètres par requête.** Les
  écritures groupées passent en une requête par table, avec les lignes
  envoyées comme un seul paramètre JSON lu par `json_each`, au lieu d’une
  requête par ligne.
- **1 Mio par ligne D1.** Taille de chaque ligne vérifiée avant l’envoi ;
  une feuille de personnage qui approcherait la limite voit ses parties
  volumineuses (onglets personnalisés, sorts) rangées dans des lignes à part.
- **Paquets limités en taille** (environ 500 Ko) plutôt qu’en nombre de
  lignes, pour les collages et imports.
- Un test automatique mesure le temps de calcul des routes sur des données
  de taille réelle.

### Ce que voit l’utilisateur

- **Page affichée modifiée par quelqu’un d’autre, sans saisie en cours** :
  elle se met à jour seule, sans bandeau.
- **Page affichée modifiée par quelqu’un d’autre pendant une saisie non
  enregistrée** : bandeau « [Nom de la page] a reçu des modifications »
  avec un bouton Actualiser ; rien n’est écrasé tant qu’on n’a pas choisi.
- **Conflit** (la même cellule changée par deux personnes) : message « [Nom]
  a modifié cette valeur entre-temps », avec le choix de garder la sienne ou
  la vôtre. Après une longue période hors ligne, les conflits sont regroupés
  dans une liste à traiter, pas affichés un par un.
- **Indicateur de synchronisation** discret : à jour, envoi en cours,
  « N modifications en attente d’envoi » (hors ligne ou quota atteint),
  synchronisation en direct indisponible (Trystero non connecté).
- **Autres fenêtres d’Eraser sur le même PC** : mises à jour immédiatement
  par `BroadcastChannel`, sans requête.
- **Version trop ancienne** : avertissement, puis message avec la marche à
  suivre pour installer la mise à jour.
- **Administration** : compteur de requêtes et de lignes écrites, alerte à
  50 % puis 80 % des quotas du jour, état des coupe-circuits et des
  interrupteurs de domaine.

### Estimations

- 8 joueurs, 4 h de partie : environ 1 600 appels au Worker (moins de 2 %).
- Journée complète : 6 h de préparation (MJ à 20 cellules par minute, admin
  à 1 modification par minute), puis 5 h de partie à 8. Environ 6 800 appels
  au Worker (7 %), 23 000 lignes écrites (23 %), moins de 150 000 lignes lues
  (3 %). Les lignes écrites sont la limite la plus proche.
- Ces chiffres sont vérifiés en phase 1 par une simulation de cette journée
  sur la base de préproduction, avant tout domaine réel.

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
standard (`json_patch` et `json_each` en font partie), sans fonction propre
à D1.

## Modèle de données D1

- Une table par domaine. Colonnes pour ce qui sert à filtrer (`id`,
  `owner_uid`, `campaign_id`, `page_linked`, `name`, `deleted_at`), plus une
  colonne `data` en JSON pour le reste. La feuille de personnage compte
  plusieurs centaines de colonnes : elle devient un seul document JSON par
  personnage.
- **Curseur de synchronisation = numéro de révision attribué par le
  Worker**, pas une date. Chaque envoi groupé incrémente un compteur unique
  et le pose sur les lignes modifiées. Une date fournie par les PC serait
  faussée par des horloges décalées ou deux écritures dans la même
  milliseconde, et des changements seraient perdus sans bruit.
- Une colonne `version` par ligne. Une modification envoie la version
  qu’elle a lue ; si la même cellule a été changée entre-temps, le Worker
  refuse (409) au lieu d’écraser silencieusement.
- Suppression douce (`deleted_at`), cohérente avec la corbeille
  d’administration actuelle. Les lignes supprimées depuis plus de 90 jours
  peuvent être purgées ; une installation dont le curseur est plus ancien
  que la purge refait une copie complète.
- Les migrations D1 sont des fichiers numérotés dans
  `worker-accounts/migrations/`, appliqués par le workflow de déploiement. On
  n’en supprime jamais une, comme pour `drizzle/`.
- La copie locale suit le même schéma, par des migrations `drizzle/`
  ajoutées.

## Déploiement, compatibilité et retour arrière

- **Worker de préproduction séparé** (`eraser-accounts-staging`, avec sa
  propre D1), déployé par le même workflow. Les tests et les imports d’essai
  ne touchent jamais la base réelle.
- **Le Worker reste compatible avec les versions précédentes de
  l’application.** Une route n’est retirée que lorsque plus aucune version
  en service ne l’appelle.
- **Ordre de mise en service** : Worker déployé et vérifié d’abord,
  préversion de l’application ensuite.
- **Retour arrière du Worker** : la version précédente reste redéployable
  immédiatement.
- **Retour arrière des données** : Time Travel de D1 (n’importe quelle
  minute des 7 derniers jours sur l’offre gratuite), plus les sauvegardes
  Drive.

## Tests

- Tests du Worker sur une D1 locale : droits (joueur, MJ, admin, compte
  inactif), filtrage des secrets du MJ, conflits, curseur de révision,
  limites de taille et de nombre de requêtes.
- Tests de la file d’écriture : fermeture de l’application pendant un envoi,
  Worker injoignable, quota atteint, reprise.
- Tests du mode secours : entrée et sortie automatiques, deux PC qui
  modifient la même cellule pendant le secours, PC éteint avant le retour,
  rattrapage depuis Sheets.
- Simulation de la journée complète sur la préproduction (voir
  « Estimations »), avec relevé des lignes écrites et lues.
- Pour chaque domaine : comparaison automatique D1 / Sheets pendant quelques
  jours avant la bascule.
- Parcours manuel avant chaque bascule : connexion, campagne, personnages,
  PNJ, pont Roll20, Exporter, fonctionnement hors ligne.

## Phases

Chaque phase se termine par une préversion alpha installée et vérifiée.

### Phase 0 : socle (aucun changement visible)

- `worker-accounts/package.json` et tests du Worker sur une D1 locale (il
  n’en a aucun aujourd’hui).
- Migrations D1 numérotées, en plus de `schema.sql`.
- Worker et D1 de préproduction, créés par le workflow de déploiement.
- Droits par rôle et par propriétaire dans le Worker. Fermer au passage la
  faille de `shared_records` : aujourd’hui, n’importe quel compte peut lire
  et écrire n’importe quel scope.
- Session hors ligne (voir « Ne jamais être bloqué en partie »).
- Version d’Eraser envoyée à chaque appel ; version minimale annoncée par le
  Worker.
- Interrupteurs par domaine (`sheets | d1`), tous sur `sheets`, et
  coupe-circuits.
- Couche `lib/data/` par domaine, avec deux implémentations (Sheets, D1)
  choisies par l’interrupteur. `lib/google-sheets.ts` (≈ 5 900 lignes) est
  découpé progressivement dans cette couche. Le pont Roll20
  (`lib/roll20-bridge.ts`) lit et écrit aussi par cette couche.

### Phase 1 : moteur de synchronisation (aucun changement visible)

- Copie locale dans la SQLite, route de synchronisation par différences,
  curseur de révision, file d’écriture locale et envois groupés.
- Signaux Trystero, connexion partagée entre fenêtres.
- Bandeau « a reçu des modifications », messages et liste de conflits,
  indicateur de synchronisation (voir « Ce que voit l’utilisateur »).
- Garde-fous, compteur de requêtes et alertes dans l’administration.
- Préchargement des médias de la campagne.
- Testé de bout en bout sur un domaine factice, puis simulation de la
  journée complète, avant tout domaine réel.

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
campagne). Vérifier le pont Roll20 avant la bascule.

### Phase 6 : PNJ et magasins

Vérifier le pont Roll20 (il lit et enregistre des PNJ) avant la bascule.

### Phase 7 : Importer

- Depuis les feuilles du Drive ou depuis un `.xlsx` / `.csv`.
- Réservé aux admins et aux MJ (pour leurs campagnes).
- Aperçu : ajouts, modifications et suppressions, domaine par domaine.
- Les suppressions ne s’appliquent que si on les coche explicitement.
- Une sauvegarde est exportée automatiquement avant d’appliquer.
- Doit exister avant la phase 8 : c’est le seul chemin d’une feuille
  modifiée à la main vers Eraser, et le rattrapage du mode secours s’appuie
  sur lui.

### Phase 8 : mode secours Drive et fin de transition

- Mode secours Drive (voir la section dédiée), testé sur la préproduction en
  simulant un quota atteint, puis une panne longue avec un PC éteint.
- La recopie vers Sheets n’est pas arrêtée : elle devient permanente et
  sert le mode secours. Les feuilles ne sont plus la source, mais restent
  complètes et à jour.
- Les index locaux (`character_index`, `campaign_index`, `class_index`,
  `sheet_index_syncs`) sont remplacés par la copie locale synchronisée, par
  des migrations `drizzle/` ajoutées (jamais supprimées).
- Mise à jour d’`AGENTS.md` et d’`ARCHITECTURE.md`.
- L’accès Google garde ses droits Sheets, pour le mode secours et pour le
  tabletop.

## Pour chaque domaine (phases 3 à 6)

1. Inventaire des champs réservés au MJ et des règles de visibilité.
2. Tables et routes D1 + tests du Worker.
3. Script d’import depuis Sheets, idempotent, testé sur la D1 de
   préproduction, avec rapport à faire valider.
4. Lecture depuis D1 ; comparaison automatique avec Sheets pendant quelques
   jours pour repérer les écarts.
5. Bascule de l’interrupteur sur `d1`, hors jour de partie, avec recopie des
   écritures vers Sheets.
6. Vérification en partie réelle, puis domaine suivant.

## Procédure d’urgence un soir de partie

1. Regarder l’indicateur de synchronisation. « En attente d’envoi » : on
   peut continuer à jouer, rien n’est perdu.
2. Quota atteint ou serveur en panne : le mode secours Drive s’active seul,
   on continue à jouer. Si la lenteur gêne, activer le forfait Cloudflare
   payant (quelques minutes, sans nouvelle version).
3. Comportement anormal après une bascule : l’admin rebascule le domaine
   sur `sheets` et coupe les signaux depuis l’administration.
4. Données abîmées : Time Travel D1 ou dernière sauvegarde Drive, après la
   partie.

## Vérifications à faire par les responsables

- Le site historique tourne-t-il sur le même compte Cloudflare que
  `eraser-accounts` ? Si oui, il partage le quota de 100 000 requêtes.
- Dans la console Google Cloud, l’écran de consentement OAuth est-il « En
  production » ? En mode « Test », l’autorisation Drive expire au bout de
  7 jours, ce qui couperait les médias.

## Idées pour plus tard (hors plan)

- Version web pour les joueurs, rendue possible par les données en ligne.
- Interface plus simple pour les joueurs, dans la même application.
- Signalisation Trystero par un Worker à soi (Durable Objects) au lieu des
  relais publics, avec vérification du rôle par le serveur.
