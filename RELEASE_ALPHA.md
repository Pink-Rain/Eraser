# Eraser 0.1.1-alpha.97 — États et Effets synchronisés, couleurs enregistrées

Cette version arrive par la mise à jour sans réinstallation.

## Index

- **Les onglets se tiennent à jour entre eux** : un effet ajouté ou renommé dans « Effets »
  apparaît aussitôt dans les listes « Niveau 1 » / « Niveau 2 » de « États », même ouvert
  dans un autre onglet ou une autre fenêtre. Plus besoin d'« Actualiser » ni de recharger.
  Valable pour tous les index et leurs listes liées.
- **La fiche de personnage suit aussi** : un état ou un effet modifié dans l'Index des états
  est relu par les fiches ouvertes.

## Icônes et couleurs dans les cellules

- **Plus d'erreur « Cette modification n'a pas pu être enregistrée »** en changeant une
  couleur : le sélecteur envoyait une écriture à Google Sheets à chaque mouvement, et
  Google refusait. L'aperçu suit maintenant en direct, et une seule écriture part quand la
  fenêtre se ferme. Cela vaut pour la palette de la jauge par ligne (icône et couleur) et
  pour la colonne Couleur.
- Si Google Sheets refuse encore une modification, le message dit maintenant pourquoi.
