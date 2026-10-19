# Eraser 0.1.1-alpha.234 — L'Index des items sur le moteur des index

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## Les items ont maintenant le même moteur que les autres index

- La page **Items** est celle de tous les index : mêmes présentations (liste, kanban, galerie…),
  mêmes cartes, vues, statistiques, « Modifier », fiches, boutons et formules.
- **Rangement en onglets** : le type est maintenant proposé pour les items (colonne « Genre »,
  par exemple). Une valeur qui porte le nom de l'onglet de la ligne ne crée pas d'onglet en plus.
- Ce qui était propre aux items reste là : la colonne « Actions » (envoyer dans un inventaire,
  changer d'onglet), l'import d'une icône dans le dossier « icone objet », « Corriger N prix ».
- Les items gardent leur ID : inventaires, magasins, fouilles et citations « { » les
  retrouvent comme avant. Les vues des items enregistrées avant restent valables.

## Pour tous les index

- **« Corriger N prix »** (pièces d'argent ou de bronze réécrites en pièces de cuivre) existe
  maintenant dans tous les index qui ont une colonne de prix, plus seulement les items.
- **« Corriger N fautes »** existe aussi pour les items.
- Une liste à ajout libre propose les valeurs déjà écrites dans la colonne, dans tous les index.
- Les cadenas des colonnes d'items posés dans « Modifier » sont bien appliqués par le serveur.

## Pas encore pour les items

Les relations entre index (colonne liée, recherche, agrégat) ne sont pas encore proposées aux
items : leurs cases sont lues comme du texte par l'inventaire et les magasins.

Au premier affichage, la page des items oublie ses préférences locales (tableau ou cartes, tri,
largeurs) : elle reprend celles du moteur.
