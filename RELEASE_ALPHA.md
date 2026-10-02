# Eraser 0.1.1-alpha.93 — Profils des autres comptes, objets reçus partout, index d'objets regroupables

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage

- **Nouveau sort** : le texte des cartes est posé sur un panneau clair, lisible quelle
  que soit la couleur du sort (gris actif, blanc passif, violet bonus).
- **Sorts tout juste obtenus** : une petite pastille, comme pour les objets reçus. Elle
  disparaît au survol.
- **Objets reçus** : un objet donné à un personnage est annoncé (notification, son,
  pastille sur l'objet) à la prochaine ouverture de sa fiche, même s'il est arrivé
  pendant que tu étais déconnecté, en vue MJ ou sur un autre personnage. Les objets
  donnés à l'un de tes propres personnages sont annoncés aussi.

## Accueil et profils

- **Joueurs et MJ** : l'accueil liste les autres comptes. Un clic ouvre leur profil :
  personnages, campagnes et succès. Leur adresse e-mail n'est jamais affichée.
- **Ce qui s'ouvre depuis un profil** :
  - en vue joueur, aucune fiche d'un autre joueur ; une campagne seulement si l'un de
    tes personnages y joue (tu arrives sur son tableau de bord) ;
  - en vue MJ, les fiches des personnages de tes campagnes, et tes campagnes ;
  - en vue administrateur, tout.
  Les autres cartes restent visibles, sans lien.
- Sur ton propre profil, les campagnes où tu joues s'ouvrent aussi.

## Campagnes

- **Inventaire de campagne** : chaque joueur dont un personnage est dans la campagne le
  modifie comme le sien (ajouter, créer, ranger, quantités, donner). Il ne donne qu'aux
  destinataires qu'il voit : les personnages et les PNJs du groupe ou de la campagne.

## Index des objets

- **Regrouper les index d'objets** (vue administrateur, en haut de l'Index des objets) :
  les classeurs du dossier « Objets » deviennent un seul classeur « Index des objets »,
  avec un onglet par index (Objets, Équipement, Parchemins, Consommables, Armes).
  - Chaque tableau est copié tel quel (valeurs, couleurs, images).
  - Les objets sans identifiant gardent celui que connaissent déjà les inventaires,
    boutiques et fouilles, écrit dans une colonne ID.
  - Les types de colonnes (« Modifier ») et les onglets-fenêtres suivent.
  - La copie est relue et comparée ligne par ligne : à la moindre différence, rien ne
    change et les index restent comme avant.
  - Les anciens classeurs ne sont ni modifiés ni supprimés : ils sont rangés dans le
    sous-dossier « Anciens index d'objets (avant regroupement) ».
  - **Annuler le regroupement** remet les anciens classeurs en place. Ce qui a été changé
    dans le classeur regroupé entre-temps y reste.
  - Rien ne se fait tout seul : le regroupement attend ton clic.
