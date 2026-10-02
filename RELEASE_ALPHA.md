# Eraser 0.1.1-alpha.98 — États sur la fiche, pages plus rapides

Cette version arrive par la mise à jour sans réinstallation.

## Fiche de personnage et états

- **Les totaux s'affichent** : un état à +100 sur Folie affiche maintenant 100, au lieu de
  « 0 » avec un « +100 » à côté. La case vide valait « rien » au lieu de 0, c'était le bug.
  Même chose pour Destin, Notoriété, Moralité, les compteurs ajoutés, les
  caractéristiques (Force…) et les points de vie.
- **Survol de Folie, Destin, Notoriété, Moralité** : comme les autres cartes, le survol
  montre le calcul (valeur de base modifiable, modificateur, total) et les états et
  objets qui la changent. − et + changent la valeur de base.
- **Colonne « Appliqué à la page » (onglet Effets)** : c'est maintenant une liste à
  choix multiples : Page entière, Compétence liée, Portrait. La couleur de l'effet ne
  s'applique qu'à ce qui est choisi : toute la fiche, les caractéristiques et compétences
  visées (Folie en rouge si l'effet est rouge), le portrait. Rien de choisi : la couleur
  ne s'applique nulle part. L'ancienne colonne « Non lié aux caractéristiques » est
  renommée sur place ; une case qui était cochée vaut « Page entière ». Le changement de
  valeur s'applique toujours aux cibles.

## Icônes

- **Les icônes pleines sont vraiment pleines** : le cerveau (et la main) se remplissait
  par morceaux. La silhouette est maintenant calculée pour chaque icône, intérieur
  compris.

## Vitesse

- **Les pages n'attendent plus Google Sheets quand le cache a vieilli** : jusqu'ici,
  toutes les 3 minutes (et toutes les minutes pour le schéma des colonnes), la page
  suivante attendait une nouvelle lecture de Google, ce qui coûtait plusieurs secondes.
  Maintenant, la dernière version lue s'affiche tout de suite et Google est relu en
  arrière-plan. Ce qui est modifié depuis Eraser reste visible immédiatement.
- Le schéma des colonnes ne vide plus tout le cache de son classeur à chaque relecture.
- Une feuille Eraser absente du Drive n'est plus recherchée chaque minute (toutes les dix
  minutes ; « Relier mes feuilles existantes » la retrouve aussitôt).
