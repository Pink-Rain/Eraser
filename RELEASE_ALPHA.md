# Eraser 0.1.1-alpha.243 — Le relevé qui montre d'où vient chaque gel

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

## Fluidité de cet ordinateur

- **Le panneau ne gèle plus l'écran.** Ouvert, il se redessinait à chaque nouvelle mesure ; ce
  redessin gelait l'écran un quart de seconde, ce gel devenait une mesure, qui le faisait
  redessiner… toutes les secondes et demie tant qu'il restait ouvert. Les nouvelles mesures sont
  maintenant seulement comptées : « N nouvelles mesures : afficher » les montre.
- **Chaque gros gel a son profil.** Quand l'écran reste figé plus de 0,4 s, Eraser note quelles
  fonctions tournaient pendant ce temps, et combien de ce temps était du calcul ou du dessin de
  la page. « Copier le relevé » y joint quelques caractères de leur code : de quoi viser
  exactement ce qui fige l'index des items chez vous, sans deviner.
- Le relevé copié contient toutes les mesures, même celles arrivées après l'ouverture du
  panneau.

## Magasins : une relance, un seul aller-retour

- Relancer un tirage, une ligne ou un magasin, renommer, sauvegarder, envoyer dans une campagne
  ou lier un PNJ relisait toute la feuille des magasins deux fois : une fois sur le serveur, pour
  vérifier l'enregistrement, puis une fois de plus depuis la page. La page reprend maintenant la
  vérification du serveur : 0,5 à 1 s de moins à chaque clic, avec la même garantie (ce qui
  s'affiche est ce que Google a vraiment enregistré).
