# Eraser 0.1.1-alpha.73 — Sorts personnels, objets reçus, Journal en colonnes

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Sorts des classes

- Onglet « Par classe » : dans chaque carte, le champ **Compétences** est encadré
  de rouge léger, **Distance** de gris léger et **Charges** de violet léger.
- Un petit **rail vertical des rangs** (C, 1 à 20) reste au bord droit de l’écran :
  un clic amène au rang, le rang affiché est mis en avant, les rangs vides sont
  grisés.

## Fiche de personnage

- **Sorts personnels** : dans l’onglet Sorts, un double-clic sur le nom, l’effet, la
  description, le type, les compétences, la distance ou les charges d’un sort le
  modifie **pour ce personnage seulement**. L’index des sorts ne change pas. Un sort
  modifié porte l’étiquette « Personnalisé » ; « Version de l’index » le remet comme
  avant.
- **Retirer un sort** : la corbeille d’un sort le retire de la fiche (avec
  confirmation). Les sorts retirés restent listés sous les capacités, un clic les
  rétablit.
- Ces changements sont rangés avec les choix de classe du personnage, dans sa ligne
  de la feuille : rien de nouveau n’est créé dans Google Sheets.
- **Journal** : les relations sont présentées en trois colonnes (Allié·es,
  Connaissances, Ennemi·es) avec un mini-portrait, le peuple et un niveau coloré,
  plus soutenu quand la relation est forte. Le carnet de notes passe en dessous, sur
  toute la largeur.
- Le « + » des onglets ne propose plus que **Invocation** et **Compagnon**. Les
  onglets déjà ajoutés restent en place.

## Objets reçus

- Quand un joueur ou un MJ t’envoie un objet (depuis un inventaire, un PNJ,
  l’inventaire de campagne ou une Fouille), une petite carte apparaît : « Maëlle
  vous a envoyé 2 × Corde — Reçu par Lina ». L’inventaire ouvert se met à jour tout
  seul.
- L’alerte passe par le serveur de comptes partagé et arrive en une quinzaine de
  secondes au plus (plus vite quand tu reviens sur la fenêtre). Elle n’est montrée
  qu’une fois.

## Chat

- Une petite pastille rouge apparaît sur le bouton du chat quand un message arrive
  dans le salon suivi alors que le chat est fermé. Elle disparaît à l’ouverture.

## Vérifications

- dans un vrai navigateur, avec des données d’exemple : relations en colonnes,
  carte d’objet reçu, sorts modifiés au double-clic (la carte s’ouvre toujours au
  clic simple), sort retiré puis rétabli, rail des rangs et champs encadrés ;
- un sort personnalisé garde l’index intact ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
