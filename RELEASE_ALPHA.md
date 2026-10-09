# Eraser 0.1.1-alpha.162 — Formes, Discord, et Eraser qui ne s'arrête plus

Cette version change l'enveloppe de l'application : elle s'installe par l'installateur, en
mode silencieux (rien à faire).

## Eraser ne s'arrête plus

- Une erreur imprévue en arrière-plan est écrite dans le journal et le service local
  continue, **dès le démarrage** d'Eraser.
- Si le service local s'arrête malgré tout, Eraser **le relance tout seul** et recharge la
  page. L'avertissement « Eraser s'est arrêté » n'apparaît plus que si la relance échoue ou
  si les arrêts se répètent.

## Discord

- Eraser ouvert, Discord affiche « Joue à **Eraser - JDR** » avec son icône (image
  « eraser » de l'application Discord). Sans Discord, rien ne change.

## Spécificités de classe : les Formes

Dans **Création des classes**, « Ajouter une spécificité » propose maintenant **Formes** :

- un groupe (« Forme », « Posture »…) avec son emplacement sur la fiche, et ses formes :
  nom, couleur, forme de départ, **effets** et description mise en forme (références « { ») ;
- un effet vise une caractéristique, une secondaire, une compétence ou les points de vie
  actuels : « +10 », « -5 », « =0 », « ≥3 », « ≤5 ». Il ne vaut **que tant que la forme est
  active** : la valeur de base de la fiche n'est jamais modifiée, comme pour un état ;
- sur la fiche, un sélecteur montre les formes ; un clic change de forme, le survol montre
  ses effets et sa description, et les valeurs touchées l'indiquent au survol.

Une **jauge peut être liée à des formes** : elle ne s'affiche que dans celles-ci et peut
revenir à sa valeur de départ quand on les quitte (une « folie temporaire », par exemple).

Les formes s'enregistrent dans un nouvel onglet **« Formes »** du classeur « Sorts de
classe » (créé à la première forme), une ligne par forme.
