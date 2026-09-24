# Eraser 0.1.1-alpha.64 — Fouilles, PNJs du groupe et liens entre les pages

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **Sous 0 PV, toute la fiche passe en gris.** À moins la vie totale ou en
  dessous (50 PV max → −50 PV), elle passe en **rouge sang**. C’est un simple
  filtre : tout reste cliquable et modifiable, et la couleur revient dès que la
  vie remonte.

## Campagne

- La section redevient **« PNJs du groupe »**. Elle montre les PNJs qui
  voyagent avec le groupe, grâce à la colonne « Dans le groupe joueur » déjà
  présente dans la feuille « PNJs » (elle n’était plus lue).
- **Joueurs** : chaque PNJ du groupe se déplie. On y lit ses notes visibles par
  les joueurs, sa vie, et on gère **son sac à dos** (ajouter, retirer, modifier,
  transférer vers un personnage ou un autre PNJ du groupe). C’est le seul
  endroit où un joueur voit et modifie l’inventaire d’un PNJ.
- **MJ et administrateurs** : bouton « Ajouter » pour faire entrer un PNJ de la
  campagne dans le groupe, crayon pour modifier sa fiche sans quitter la page,
  et bouton pour le retirer du groupe.
- Page **PNJs** et **Créateur de session** : chaque carte a un bouton
  « PNJs du groupe » (à côté de « Ajouter à la session ») et un **Sac à dos**
  modifiable directement, sans ouvrir le formulaire. Les notes s’affichent avec
  leur mise en forme.
- **Tabletop** : la fenêtre d’un PNJ permet de modifier son sac à dos (MJ, ou
  joueur pour un PNJ du groupe).

## Magasins et Fouilles

- « Magasins et fouilles » devient **Magasins**.
- Nouvelle page **Fouilles**, juste en dessous. Le MJ choisit le lieu (Marais,
  Désert, Savane, Forêt, Forêt noire, Jungle, Plaine, Montagne, Caverne, Ville,
  Aquatique, Ruine / donjon, Maison, Maison noble, Bateau, Corps, Corps noble),
  puis clique le résultat du test : **Échec critique, Échec, Réussite,
  Réussite critique** (ou touches **1 à 4**). Le d100 et l’objet sont tirés
  aussitôt, sans attendre le réseau.
  - Réussite : 100–61 Commun, 60–20 Rare, 19–2 Très rare, 1 Ultime.
  - Réussite critique : 100–60 Rare, 59–25 Très rare, 24–1 Ultime.
  - Échec : 100–16 Très commun, 15–1 Commun.
  - Échec critique : 100–1 Très commun.
  Ce sont les plages du dé qui comptent (« 100 à 61 » fait 40 faces sur 100).
- L’objet vient des index d’objets, d’après leurs colonnes « Emplacement
  principal / secondaire » (« Marais - Désert - Forêt ordinaire - Forêt
  noire… »). « Forêt » ne confond pas la forêt noire, ni « Maison » la maison
  noble. Si aucun objet de la rareté tirée n’existe pour ce lieu, la carte le
  dit et propose d’en prendre un d’un autre lieu.
- Les **20 derniers tirages** sont enregistrés tout seuls, le plus récent en
  premier. La **punaise** garde un tirage dans la liste. Chaque tirage peut être
  relancé (autre objet de même rareté) ou **transféré** comme dans les
  inventaires : inventaire de campagne, joueur·euses ou PNJs.

## Index des PNJs

- **Tous les PNJs** apparaissent : bibliothèque, bac à sable et campagnes. La
  colonne Campagnes montre la campagne de chacun.
- Les **notes MJ**, la **vie actuelle** et le **sac à dos** n’existent que dans
  la campagne : l’index ne les affiche pas et ne les envoie même pas. Un
  enregistrement depuis l’index ne peut pas les effacer.
- Nouvelle note **« Description, Histoire, Lore, Autre »**, comme pour les
  créatures, dans toutes les fiches de PNJ.
- Un PNJ d’une campagne qu’on ne mène pas se consulte sans se modifier.

## Éditeur de texte (partout)

- Le bouton **Lien** ouvre une recherche parmi les pages d’Eraser : campagnes
  et leurs pages, personnages, classes, index, règles. On peut aussi coller une
  adresse web. Le texte sélectionné devient le lien ; sans sélection, le nom de
  la page est inséré. Avant, le bouton demandait une adresse dans une fenêtre
  que l’application Windows n’affiche pas.
- Un lien vers une page d’Eraser s’ouvre sur place, sans recharger.

## Dans Google Sheets

- La feuille « PNJs » reçoit une colonne **« Histoire / Lore »**, ajoutée à la
  fin. Aucune colonne existante ne bouge.
- La colonne « Dans le groupe joueur » est de nouveau lue et écrite.
- Un lien vers une page d’Eraser est écrit dans Sheets avec l’adresse du
  serveur local, et relu comme lien interne.
- Les tirages de Fouille sont gardés dans le serveur partagé (pas dans Sheets).

## Vérifications

- dans un vrai navigateur : fiche grise puis rouge et toujours cliquable ; lien
  interne inséré au curseur et lien externe sur une sélection ; PNJ du groupe
  déplié avec notes et sac à dos modifiable, ajout d’un PNJ au groupe, fiche
  modifiée depuis la campagne ; 45 tirages de fouille (20 gardés + l’épinglé),
  transfert vers un joueur, affichage mobile ;
- découpage des emplacements vérifié sur les vraies valeurs des index d’objets ;
- lint sans erreur, tests d’interface et du pont Roll20 au vert, serveur desktop
  vérifié en HTTP 200.
