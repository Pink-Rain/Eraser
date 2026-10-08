# Eraser 0.1.1-alpha.150 — Bonus de rang, passage de rang et Déplacement

Cette version arrive par la mise à jour sans réinstallation.

## Le tableau « Bonus de rang »

- Chaque ligne est un rang (« Rang 1 », « Rang 2 »…). Les rangs ne s'arrêtent plus à 20 :
  **Ajouter un rang** ajoute le suivant, sans limite.
- Les colonnes ont chacune leur rôle, comme dans les index des états et des modificateurs :
  - **Cible 1 à 4** : une liste de toutes les caractéristiques et compétences de la fiche,
    rangées comme elle, plus **Caractéristique** (le joueur répartit la valeur entre ses
    caractéristiques principales) et **Déplacement** (l'action de déplacement gratuite) ;
  - **Valeur 1 à 4** : ce que gagne la cible du même numéro (+5, -2…) ;
  - **Choix** (1 à 4) : combien de ces bonus le joueur choisit ; vide, il les a tous ;
  - **Sort sur mesure** : coché, le joueur cherche un sort à ajouter à sa fiche ;
  - **Autre** : un texte libre.
- Une cible ou deux suffisent : les colonnes vides sont simplement ignorées.
- L'onglet existant est mis à jour sans rien perdre : l'ancienne colonne « Bonus », restée
  vide, devient « Cible 1 » et les autres colonnes s'ajoutent à droite.
- La fiche d'un rang (clic sur « Rang N » ou clic droit › Ouvrir la fiche) reprend les
  mêmes listes et la même case à cocher.

## Le passage de rang sur la fiche de personnage

- La fenêtre « Nouveau sort » montre les bonus du rang au-dessus des cartes : les bonus à
  choisir, la répartition d'un bonus « Caractéristique » (+2 en Charisme, +5 en Force… au
  choix, avec ce qu'il reste à répartir), la recherche du sort sur mesure et le texte « Autre ».
- Quand le sort est choisi, les bonus s'ajoutent au **bonus/malus** de leur cible (jamais au
  modificateur, réservé au temporaire), « Déplacement » à l'action gratuite, et le sort sur
  mesure rejoint les sorts de la fiche. Un rang n'est donné qu'une fois.
- Un rang sans sort à choisir (au-delà de 20, par exemple) ouvre une fenêtre « Bonus de
  rang » avec un bouton **Obtenir les bonus**.
- Seuls les nouveaux rangs donnent leurs bonus : un personnage existant ne reçoit pas après
  coup ceux des rangs qu'il avait déjà.
- Le fond de la fenêtre reprend les couleurs du site ; seules les cartes de sorts gardent
  leur style. Dans l'onglet Sorts, chaque rang indique « Obtenus » une fois ses bonus reçus.

## Déplacement

- Nouveau type dans l'Index des caractéristiques et compétences : **Déplacement**, avec
  Action de déplacement gratuite, mineure et majeure (ajoutées une seule fois à l'index
  existant, et en colonnes à droite de la feuille de personnage).
- Sur la fiche, la case **Déplacement** se place à droite du Destin, au-dessus de la
  Rapidité (qui passe à droite du Critique) : Gratuite · Mineure · Majeure. Mineure et
  majeure affichent l'action gratuite en plus de la leur.
- Au survol de chacune : bonus/malus (modifiable), modificateur des objets et états, total.
- Les objets et les états peuvent viser les trois actions de déplacement.
