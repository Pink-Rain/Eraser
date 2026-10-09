# Eraser 0.1.1-alpha.161 — Navigation, volume, jauges mises en forme, plus de fermeture « code 7 »

Cette version arrive par la mise à jour sans réinstallation.

## La barre du haut devient une vraie navigation

- **Fil d'Ariane cliquable** : Eraser › Campagne - … › PNJs, chaque étape ouvre sa page ;
  une flèche à gauche revient à la page précédente.
- **Chercher une page** (bouton en haut, ou **Ctrl + K** de partout) : seulement les pages
  auxquelles le compte a accès — un joueur y trouve ses personnages, ses campagnes et les
  règles, pas les index. Flèches pour choisir, Entrée pour ouvrir.

## Volume des sons

- Une icône de haut-parleur en haut à droite règle le volume de tous les sons d'Eraser, ou
  les coupe. **50 % au premier lancement**, puis gardé sur l'ordinateur, même après avoir
  fermé Eraser.

## Jauges de classe

- **Seuils et description mis en forme** : barre d'édition (gras, italique, couleurs, liens,
  titres, listes) et **références « { » vers une ligne d'index**. Dans l'onglet « Jauges »,
  ces deux cases gardent leur mise en forme.
- **Au survol** de toute jauge : le seuil atteint et la description, références cliquables.
  Sous la barre de vie, le seuil n'apparaît plus qu'au survol.
- Sous la barre de vie, la jauge garde **la même carte colorée** que partout ailleurs.

## Fermeture « Le service local s'est fermé (code 7) »

Une seule erreur imprévue en arrière-plan (une requête Google ratée, par exemple) suffisait
à arrêter tout le service local. Elle est désormais écrite dans le journal
(`eraser-startup.log`) et Eraser continue de fonctionner.
