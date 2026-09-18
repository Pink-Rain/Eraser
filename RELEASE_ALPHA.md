# Eraser 0.1.1-alpha.4 — application Windows autonome

Cette préversion corrige le démarrage et clarifie l’architecture finale :
l’application remplace le site sans dépendre de lui.

## Fonctionnement

- l’application ouvre son propre serveur local sur `127.0.0.1:32147` ;
- elle utilise directement le même compte Google Drive et les mêmes Google Sheets ;
- elle ne charge, n’appelle et ne synchronise aucun site web ;
- ses comptes et sa base SQLite sont locaux ;
- l’association des propriétaires déjà présents dans Sheets reste uniquement
  dans SQLite et ne modifie aucune cellule ;
- Roll20 communique uniquement avec l’application locale.

## Vérifications automatiques

- compilation complète ;
- création de `Eraser-Setup.exe` ;
- installation silencieuse sur Windows ;
- lancement réel de `Eraser.exe` ;
- réponse HTTP 200 de la page de connexion.

Le site en ligne et la branche `main` ne sont pas modifiés.
