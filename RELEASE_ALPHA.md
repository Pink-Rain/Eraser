# Eraser 0.1.1-alpha.94 — États sur la fiche, choix de sort au passage de niveau, pages plus rapides

Cette version arrive par la mise à jour sans réinstallation.

## États

- **Index des états** : un deuxième onglet **« Effets »** (Nom, Cible, Couleur, Changement
  de valeur, Image) et, dans l'onglet États, deux colonnes **« Niveau 1 »** et
  **« Niveau 2 »** qui lient un ou plusieurs effets. Ils s'ajoutent à droite et à la suite,
  sans rien déplacer ni modifier dans ce qui existe.
  - Cible : une ou plusieurs caractéristiques ou compétences, prises dans l'Index des
    caractéristiques et compétences.
  - Changement de valeur : un nombre (« -10 », « +20 »).
- **Fiche de personnage** : sous le portrait et le token, **« États »** permet d'en
  ajouter un ou plusieurs (recherche, rangés par type).
  - Chaque état affiche sa jauge (l'icône de la colonne Jauge de l'index) : un clic choisit
    le niveau 1 ou 2.
  - Au survol : descriptions des deux niveaux (celui en cours mis en avant), effets liés
    et règles liées.
  - Les effets du niveau atteint s'appliquent aux valeurs de la fiche, comme un objet
    équipé ; le survol d'une valeur montre les états qui la changent. Le niveau 2 remplace
    le niveau 1.
  - La couleur des effets teinte le portrait, et leur image s'y pose.

## Sorts

- **Passage de niveau** : la fenêtre « Nouveau sort » s'ouvre aussitôt, quel que soit
  l'onglet affiché.
- **« Choisir plus tard »** ferme la fenêtre ; « Nouveau sort » attend dans l'onglet Sorts.
- **Retirer un sort choisi à un rang** propose tout de suite le nouveau choix (on peut aussi
  choisir plus tard).
- **Pastille des sorts récents** : elle ne s'efface plus toute seule quand le sort apparaît
  sous la souris ; elle part quand on passe dessus. Elle vaut aussi pour un sort ajouté à la
  main ou rétabli, et pour les objets reçus.

## Index

- **Poignée de recopie** (coin bas-droit) pour tous les types de colonnes qu'on peut saisir :
  listes, listes liées, cases à cocher, jauges, nombres, couleurs, fichiers, sorts. Les
  colonnes calculées, l'ID et les liens automatiques restent exclus.
- **Jauge en icônes** : une icône pleine garde ses traits visibles (aiguilles de l'horloge,
  yeux du sourire). Nouveau réglage « Couleur des traits » ; par défaut, ils sont clairs.

## Pages plus rapides

- Une page n'attend plus la relecture de l'index des personnages et campagnes (jusqu'à
  2,5 s, une fois par minute) : elle s'affiche avec l'index connu, qui se met à jour en
  arrière-plan. Une relecture ratée n'est plus retentée à chaque page.
- La session n'est plus revérifiée en attendant toutes les 30 s : la revérification se fait
  en arrière-plan.
- **Administration › Google Drive et Sheets › Lenteurs** : les appels à Google et au
  serveur partagé qui ont fait attendre les pages depuis le démarrage d'Eraser.
