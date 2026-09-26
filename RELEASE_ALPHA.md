# Eraser 0.1.1-alpha.70 — Page de connexion épurée et fenêtre « Mon compte »

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

## Connexion

- La page de connexion ne garde que l’essentiel : le logo, deux onglets
  **Se connecter / Créer un compte**, les champs et le bouton. Les textes
  d’explication de l’ancien site ont disparu.
- Le code administrateur reste disponible derrière un petit lien « J’ai un code
  administrateur » sous la création de compte.

## Mon compte

- En bas du menu, ton nom et ton type de compte s’ouvrent d’un clic sur une
  fenêtre **Mon compte** :
  - **avatar** : importer une image ou la prendre depuis un lien (elle est copiée
    dans le Drive partagé, comme les portraits) ; l’avatar remplace les initiales
    dans le menu ;
  - **pseudo** ;
  - **adresse e-mail**, avec le mot de passe actuel ;
  - **mot de passe** (actuel, nouveau, confirmation). Changer de mot de passe ferme
    tes autres sessions ouvertes, pas celle où tu te trouves ;
  - **se déconnecter**.
- Le serveur de comptes partagé apprend à modifier son propre compte ; il se met à
  jour automatiquement avec cette version.

## Vérifications

- testé sur un serveur local : pseudo, e-mail (refusé avec un mauvais mot de passe),
  mot de passe (l’autre session est fermée, la session courante reste ouverte,
  reconnexion avec le nouveau mot de passe) ;
- page de connexion et fenêtre Mon compte rendues dans un vrai navigateur ; le
  parcours de création de compte du test d’installation Windows fonctionne toujours ;
- lint sans erreur, tests au vert, build et serveur desktop vérifiés en HTTP 200.
