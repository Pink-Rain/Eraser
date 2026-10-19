# Eraser 0.1.1-alpha.235 — Les items, un index du moteur

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## Les items sont un index du moteur, comme tous les autres

- L'Index des items n'a plus de code à lui : c'est le moteur des index qui le lit, l'écrit et le
  règle, exactement comme les créatures, les lieux ou un index créé.
- Il a donc tout ce qu'a le moteur, **relations comprises** : colonne liée ↔ (avec un autre index
  ou entre onglets), liste liée, recherche, agrégat, valeur d'une nouvelle ligne, rangement en
  onglets, « Corriger N fautes ».
- Les autres index peuvent viser les items : une liste liée ou une colonne liée vers « Items »,
  une recherche du prix d'un item, un tirage d'un item au hasard.
- Ce que les items avaient en propre reste là : « Actions » (envoyer dans un inventaire, changer
  d'onglet), l'import d'icône, les colonnes lues par l'inventaire et les magasins (verrouillées
  sous leur nom), les ID des items.
- L'inventaire, les magasins et les fouilles voient tout de suite ce que le tableau écrit.

## Pour tous les index

- **Changer une ligne d'onglet** est possible vers n'importe quel onglet de l'index : une colonne
  remplie que l'onglet d'arrivée n'a pas y est ajoutée, avec ses réglages. Rien ne se perd.
- « Valeur d'une nouvelle ligne » est réglable dans les items aussi.
