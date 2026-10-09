# Eraser 0.1.1-alpha.158 — Invocations : templates et mini-fiches

Cette version arrive par la mise à jour sans réinstallation.

## Créer un template d'invocation

L'onglet **Invocation** de la fiche (ajouté avec le « + » des onglets) n'est plus vide.
« Créer un template d'invocation » ouvre un éditeur avec un aperçu en direct :

- **Points de vie** (actuels / maximum) ;
- **Caractéristiques principales**, pré-remplies avec celles de l'index, et
  **Caractéristiques secondaires** : chaque nom se choisit dans la liste ou s'écrit à la main ;
- **Sort** écrit à la main, avec au choix Action, Distance, Charge (1 à 5 étoiles) et
  Compétence ;
- **Champ libre** court ou **Texte long**.

Chaque champ se renomme, se pré-remplit, monte, descend ou se retire. Le template a un nom et
une couleur.

## Invoquer

- Les templates sont proposés en haut de l'onglet : « Invoquer » fait apparaître une
  invocation (vie et charges pleines), autant de fois que voulu (« Loup », « Loup 2 »…).
- Les invocations sont **rangées par type**, chacune en **mini-fiche** : nom modifiable, vie
  avec − / + ou une valeur tapée (« -5 », « +3 », « *2 »), caractéristiques, sorts et leurs
  étoiles de charge, champs libres. À 0 PV, elle est marquée **Vaincue**.
- Le crayon modifie les champs de cette invocation seulement ; elle se duplique (avec son
  état actuel), se replie ou se renvoie (avec confirmation).
- Modifier un template ne touche pas aux invocations déjà présentes : seules les suivantes
  en profitent. Supprimer un template garde ses invocations.

## Sécurité des données

- Tout est enregistré dans l'onglet lui-même (case « Onglets personnalisés » de la feuille) :
  aucune colonne nouvelle, aucune migration.
- Retirer un onglet Invocation ou Compagnon qui contient quelque chose demande maintenant
  confirmation.
- Si les onglets d'une fiche devenaient trop lourds pour une case Google Sheets, rien n'est
  écrit et un message le dit, au lieu d'abîmer la case.
