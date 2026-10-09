# Eraser 0.1.1-alpha.168 — Des formes qui posent des états

Cette version passe par l'installateur, en mode silencieux : l'enveloppe Windows change
(journal Discord).

## Une forme peut poser des états

Dans l'éditeur de formes, chaque forme a maintenant **« États posés par cette forme »** :
des états de l'Index des états (niveau 1 ou 2), posés tout seuls tant que la forme est
active. Ils partent quand on change de forme, et ceux de la nouvelle forme arrivent.

- Sur la fiche, ils apparaissent dans les États avec la mention **Auto**. Le survol dit
  quelle forme les pose. Le joueur ne peut ni les retirer ni changer leur niveau à la main.
- Leurs effets temporaires, couleurs, images et FX s'appliquent comme pour un état posé à
  la main, et s'ajoutent aux effets propres de la forme.
- Un état déjà posé à la main reste celui du joueur.
- Nouvelle colonne **« États »** à droite de l'onglet Formes (« Effrayé », « Effrayé :
  niveau 2 », un par ligne).

Les effets de forme acceptent aussi des formules plus longues (jusqu'à 200 caractères).

## Discord : un journal pour comprendre

Eraser note dans son journal (`%APPDATA%/Eraser/logs/eraser-startup.log`, lignes
`[discord]`) ce qui se passe avec Discord : canal trouvé ou non, compte Discord connecté,
statut accepté ou refusé, et pourquoi.
