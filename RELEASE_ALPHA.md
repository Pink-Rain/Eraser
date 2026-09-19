# Eraser 0.1.1-alpha.17 — icône de fenêtre, nom officiel, épingler & réduire

Trois demandes : l'icône cassée en haut à gauche de la fenêtre, le nom
officiel de l'application, et un nouveau mode « épingler » pour garder
Eraser au premier plan pendant une partie.

## Ajouté

- un bouton **épingle** dans la barre du haut, à côté de réduire/agrandir/
  fermer : épingle la fenêtre au premier plan de tout ce qui est ouvert, et
  allège légèrement la bordure de la fenêtre pour le signaler visuellement ;
- une fois épinglée, **double-cliquer sur la barre du haut (ou sur le
  titre)** réduit la fenêtre à une mini-barre flottante semi-transparente
  ne montrant que le titre, toujours au premier plan ; double-cliquer à
  nouveau la restaure exactement à sa taille et position précédentes.
  Pensé comme un compagnon de JDR léger à garder ouvert par-dessus Roll20
  ou un partage d'écran.

## Corrigé

- l'icône affichée en haut à gauche de la fenêtre (celle qu'on voit à côté
  du titre, dans la barre des tâches au survol, et dans l'Alt+Tab) était
  coupée/cassée ; elle utilise maintenant le même fichier d'icône vérifié
  que la barre des tâches ;
- l'application s'appelle maintenant officiellement **« Eraser - JDR »**
  (titre de la fenêtre, raccourcis Bureau/Menu Démarrer, liste des
  applications installées). Le fichier exécutable lui-même reste nommé
  `Eraser.exe` pour ne pas casser les raccourcis déjà épinglés par les
  joueurs qui ont l'app depuis une version précédente.

## Notes techniques

- la fenêtre est désormais dessinée sans cadre natif (barre de titre, tri,
  agrandir/réduire/fermer redessinés à la main) pour pouvoir placer le
  bouton épingle à côté des trois autres — impossible autrement, Windows
  ne permet pas d'ajouter un bouton dans sa propre barre de titre native ;
- ce changement de fenêtre (cadre, glisser-déplacer, redimensionnement lors
  de la réduction) ne peut pas être vérifié visuellement depuis
  l'environnement de build utilisé ici (Linux, sans affichage Windows) —
  seuls la compilation, le typage, le lint et le démarrage du serveur ont
  pu être vérifiés automatiquement. Un test manuel sur la version installée
  est nécessaire pour confirmer que la fenêtre se déplace, se redimensionne
  et se réduit comme attendu.

## Vérifications

- compilation complète de l'application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 sur
  « /connexion » et les pages protégées (redirection d'authentification
  attendue, HTTP 307).
