# Eraser 0.1.1-alpha.33 — magasins, index et PNJs consolidés

Cette préversion applique la migration fonctionnelle de l’application Windows
en conservant Google Sheets comme source métier et Google Drive pour les médias.

## Changements principaux

- persistance des magasins fiabilisée avec contrôle de la plage réellement
  écrite, vérification complète des en-têtes et relecture après sauvegarde ;
- relance d’un magasin entier, relances depuis le Créateur de session et prix
  propres à chaque magasin ;
- index Objets et Classes redimensionnables, hauteur commune persistante,
  cellules multilignes et éditeur riche stabilisé ;
- couleurs de texte normalisées et compatibles avec les anciens formats Google
  Sheets ;
- modèle PNJ simplifié autour des PV, six caractéristiques, Notes, Notes MJ et
  un Sac à dos unique, avec migration non destructive des anciennes données ;
- cartes PNJ en lecture seule et formulaire unique pour créer ou modifier ;
- confidentialité Tabletop corrigée : Notes visibles, Notes MJ protégées côté
  serveur ;
- bridge Roll20 en schema 2, inventaire réel, attributs PV/CON/FOR/DEX/INT/SAG/CHA,
  conservation des permissions du MJ et nettoyage ciblé des anciens attributs ;
- Mod Roll20 et compagnon Chrome mis à jour ensemble en version 0.5.0.

## Vérifications

- installation propre des dépendances ;
- lint, build Vinext et tests CI ;
- tests Roll20 de non-duplication, attributs, permissions, Bio et GM Notes ;
- build et vérification du serveur desktop ;
- paquet compagnon reconstruit avec le manifest à la racine.
