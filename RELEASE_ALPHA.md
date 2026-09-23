# Eraser 0.1.1-alpha.62 — Sessions réparées et nouveaux cadres à l’essai

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Correction : « Les sessions Eraser n’ont pas pu être chargées »

- Après une suppression faite à la main dans Google (onglet « Sessions »
  supprimé ou renommé, classeur « Sessions de campagne » effacé), Eraser gardait
  en mémoire l’ancienne feuille et ne pouvait plus lire les sessions, dans
  l’application comme dans le compagnon Roll20.
- Maintenant, si la lecture échoue, Eraser revérifie la feuille : il recrée
  l’onglet manquant, ou retrouve le classeur par son nom dans Drive (il n’en crée
  un nouveau que s’il a vraiment disparu), puis relit. Aucune donnée n’est
  modifiée.
- Si le compagnon affiche encore une erreur, son message indique désormais le
  code technique entre parenthèses.

## Style du cadre dans la fenêtre « Token »

La fenêtre « Token » propose maintenant plusieurs styles, avec un aperçu de
chacun sur l’image en cours. Les cadres par défaut ne changent pas tant qu’on
n’en a pas choisi d’autres.

- **Joueurs, PNJs, créatures** :
  - **Orné** : le cadre actuel (perles et losanges) ;
  - **Ancien** : un anneau de métal martelé, sobre, usé, au bord ébréché, avec
    un voile sépia sur l’image ;
  - **Relique** : deux fins anneaux fendus, rongés par la patine (vert-de-gris
    pour le cuivre, noirci pour l’argent), avec quatre clous.
  L’or, le cuivre et l’argent restent la couleur de chaque type.
- **Magasins** :
  - **Médaillon** : la devanture ronde actuelle ;
  - **Échoppe** : un vrai étal de marché, pas rond, dans un style ancien et
    patiné : poteaux et comptoir en planches, écriteau du métier, et un toit
    différent par magasin (auvent festonné rouge pour le marché, auvent à
    franges bleu pour la librairie, tente rayée pour l’antiquaire, toit de
    bardeaux et bannière pour l’armurerie, toile rapiécée et trouée pour le
    marché noir, fanions pour l’alchimiste, chaume pour la taverne). Le vendeur
    se tient derrière le comptoir ; sans vendeur, le fond prend les couleurs du
    magasin.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 22 tests d’interface et 6 tests du pont Roll20 au vert (dont chaque nouveau
  cadre et chaque échoppe) ;
- tous les cadres dessinés et vérifiés à l’écran.
