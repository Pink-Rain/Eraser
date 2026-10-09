# Eraser 0.1.1-alpha.180 — Presque trois fois moins de requêtes Google par joueur

Cette version arrive par la mise à jour sans réinstallation.

## Pourquoi c'était lent à cinq

Toutes les installations d'Eraser utilisent le même compte Google, et Google limite le nombre
de requêtes par minute. Les versions 176 à 178 font patienter les requêtes ensemble quand
Google refuse, donnent à chaque installation son propre identifiant de quota et partagent la
liste des classes. Restait la quantité : mesurée sur une copie complète des feuilles, avec un
joueur qui navigue entre sa fiche et la campagne :

| Situation | alpha.179 | alpha.180 |
|---|---|---|
| Un joueur en séance | 12,5 requêtes / minute | 4,6 requêtes / minute |
| Nouvelle installation (accueil, création, fiche, campagne) | 71 requêtes | 52 requêtes |
| Relancer Eraser | 54 requêtes | 28 requêtes |

## Ce qui change

- **Inventaire.** Il faisait à lui seul la moitié des requêtes : chaque fiche ouverte le
  relisait deux fois. Il est maintenant lu une seule fois et gardé deux minutes. Un objet reçu
  d'un autre joueur le fait relire aussitôt, et il apparaît tout de suite.
- **Index (caractéristiques, états, peuples…).** Leurs onglets sont lus en une seule requête.
  La liste des onglets n'est plus redemandée trois fois de suite, et les colonnes ne sont plus
  revérifiées à chaque démarrage (une fois toutes les 12 h, ou quand une version en attend
  de nouvelles).
- **Spécificités de classe.** Les quatre onglets (jauges, formes, decks, cartes) sont lus en
  une seule requête.
- **Personnages et campagnes des autres installations.** Ils sont resynchronisés toutes les
  5 minutes au lieu de 2. Les pages qui ont besoin du tout dernier état relisent toujours
  d'elles-mêmes.
- **Création de personnage.** Si Google est saturé, la liste des classes est redemandée toute
  seule, toutes les 15 secondes, sans avoir à cliquer sur « Réessayer ».

## Pour l'administrateur

Dans **Administration → Google Drive**, section « Lenteurs », s'affichent maintenant :

- le nombre de requêtes Google faites par cet ordinateur dans la dernière minute ;
- le nombre de refus de Google, s'il y en a eu.
