# Eraser 0.1.1-alpha.29 — la vraie cause, et de quoi la voir

## Ce qui n'allait pas

Chaque feuille Google a un nom de classeur et un nom d'onglet. Quand
l'app **crée** un classeur, elle renomme son onglet comme prévu. Quand
elle **relie** un classeur déjà présent dans le Drive — ce qu'elle fait
seule depuis l'alpha.24 — elle enregistrait le nom d'onglet attendu sans
jamais vérifier celui du classeur. Si l'onglet s'appelait encore
« Feuille 1 », toutes les plages construites ensuite pointaient vers un
onglet inexistant : chaque lecture et chaque écriture de cette feuille
échouaient, toujours avec le même message illisible.

C'est ce qui empêchait d'ajouter un personnage à une campagne.

## Corrigé

- **Vérification des onglets.** Avant de s'en servir, l'app compare
  l'onglet attendu à ceux réellement présents. S'il manque et que le
  classeur n'a qu'un onglet, elle le renomme, sans perdre une ligne ;
  s'il y en a plusieurs, elle ajoute l'onglet attendu. Le nom corrigé est
  mémorisé.
- **Ajouter un personnage ne peut plus échouer.** Le lien est créé dans
  tous les cas et le personnage apparaît tout de suite. Si la feuille
  partagée n'a pas pu être écrite, un avertissement orange le dit
  franchement — au lieu d'une erreur rouge sur une action qui avait
  pourtant réussi à moitié.
- **Retirer un personnage d'une campagne** suit la même règle.

## Nouveau : diagnostic des feuilles

Administration › Google Drive et Sheets affiche maintenant, feuille par
feuille : l'onglet attendu, le nombre de lignes lues, et en cas de
problème **l'erreur brute renvoyée par Google** ainsi que les onglets
réellement présents dans le classeur.

Les messages d'erreur des magasins et des personnages donnent eux aussi
ce code brut aux administrateurs. Un seul coup d'œil suffit désormais
pour savoir quelle feuille est en cause et pourquoi.

## Vérifications

- `npm run build` réussi ;
- lint sans erreur ;
- `npm run desktop:parity` : 0 fichier manquant, 0 style modifié.
