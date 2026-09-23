# Eraser 0.1.1-alpha.50 — langues, lieux en onglets et fiches de créatures

## Ressources → Index des langues

Nouveau classeur **« Index des langues »** : Nom, Lieu, Peuple, Langue-mère,
Langue-fille. Toutes les colonnes sont liées :

- **Langue-mère ↔ Langue-fille**, dans les deux sens ;
- **Lieu** ↔ la nouvelle colonne **Langues** de l’Index des lieux ;
- **Peuple** ↔ la nouvelle colonne **Langues** de l’Index des peuples.

Comme ailleurs, un nom inconnu crée l’entrée manquante.

## Index des lieux en cinq onglets

**Zone géographique, Pays, Régions, Villes, Points d’intérêt**, avec les mêmes
colonnes. L’ancien onglet « Lieux » devient « Zone géographique » : rien n’est
perdu.

Un lieu créé par un lien (depuis un peuple ou une langue) arrive dans « Zone
géographique ». Clic droit sur la poignée de la ligne → **Déplacer vers** pour
le ranger dans le bon onglet. Les liens le retrouvent où qu’il soit.

## Fiche des créatures

Le petit bouton dans le nom ouvre désormais une **fiche complète**, pré-remplie
avec ce que la ligne contient déjà :

- portrait (image importée ou URL) ;
- Nom, Rang, Environnement, Type, Climat, Sous-type, Sous-type secondaire,
  Dressable (case à cocher) ;
- Organisation, Comportement, Rencontre (texte enrichi) ;
- Langue (suggestions tirées de l’Index des langues), Taille, Poids ;
- caractéristiques : Force, Dextérité, Intelligence, Perception, Charisme,
  Vitesse, Vitalité ;
- **sorts actifs** et **sorts passifs**, choisis dans l’Index des classes.

Ces nouvelles colonnes sont ajoutées à droite dans la feuille « Index des
créatures » ; le tableau de l’application garde ses onze colonnes.

## Sous le capot

Ajouter des colonnes à une feuille existante ne décale plus rien : les colonnes
sont retrouvées par leur nom, les manquantes s’ajoutent à droite.
