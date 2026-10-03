# Eraser 0.1.1-alpha.118 — Objets : affichage revu, Matériaux et Runes

Cette version arrive par la mise à jour sans réinstallation.

## Un objet dans un inventaire ou un magasin

Sous la description, dans cet ordre :

1. **Effet : …** (c'est là que s'écrit la valeur, avec {Valeur}) ;
2. les **attributs, matériaux et runes** de l'objet, en pastilles à leur couleur, sans
   titre. Au survol : leur nom et leur description ;
3. l'**action**, la **distance** et la **compétence**, en pastilles comme dans leurs
   colonnes, sans titre.

La ligne « Valeur » ne s'affiche plus. C'est pareil dans la fouille et la fenêtre de
magasin sur la table.

## Index des objets : colonnes Matériaux et Runes

Deux nouvelles colonnes, ajoutées à droite de chaque tableau : **Matériaux** et **Runes**.
Elles proposent les matériaux et les runes d'« Armes - Modificateurs » et acceptent
plusieurs choix. Elles sont masquées dans le tableau (le bouton « Colonnes masquées » les
montre) mais présentes dans la fiche et le formulaire d'ajout.

## Rareté principale et rareté secondaire

Les onglets qui avaient deux colonnes « Rareté » les voient renommées « Rareté
principale » (celle de l'emplacement principal) et « Rareté secondaire ». Seuls les
en-têtes changent : aucune case n'est modifiée. L'onglet Armes, qui les nommait déjà,
ne change pas.

## Les magasins lisent les colonnes par leur nom

Les magasins et la fouille lisaient l'emplacement et la rareté par la position des
colonnes, ce qui était dangereux. Dans l'onglet Parchemins, dont l'ordre diffère, la
rareté était même associée au mauvais emplacement. Ils les lisent maintenant par le nom
des colonnes (« Emplacement principal » avec « Rareté principale », « Emplacement
secondaire » avec « Rareté secondaire »), quel que soit leur ordre.
