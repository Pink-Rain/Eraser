# Eraser 0.1.1-alpha.5 — réparation de l’accès local

Cette version ajoute un troisième onglet sur l’écran de connexion :
**Réparer l’accès**.

Il permet de définir un nouveau mot de passe pour un compte local créé par une
ancienne installation, sans supprimer les campagnes, les réglages, Drive,
Google Sheets ou Roll20.

GitHub vérifie automatiquement :

- la création du premier compte administrateur ;
- la présence du cookie de session local ;
- la réinitialisation du mot de passe ;
- la reconnexion avec le nouveau mot de passe ;
- l’installation et le lancement réel d’Eraser sur Windows ;
- la réponse HTTP 200 de la page de connexion.

L’application utilise le même Drive et les mêmes Google Sheets, mais ne dépend
d’aucun site web.
