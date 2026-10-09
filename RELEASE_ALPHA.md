# Eraser 0.1.1-alpha.174 — Plus de « Lecture des classes… » sans fin

Cette version arrive par la mise à jour sans réinstallation.

## Les classes ne font plus attendre indéfiniment

- **Une limite de temps** : la fiche et la création de personnage n'attendent plus jamais
  sans fin la liste des classes. Au-delà de 25 secondes, elles disent que Google Sheets
  traîne et proposent **Réessayer**. La lecture continue derrière et sera prête au
  prochain essai.
- **La synchronisation des images de classes est réservée à l'administrateur.** Elle
  parcourt tout le Drive et réécrit la feuille des classes. Lancée depuis le PC neuf d'un
  joueur, elle consommait le quota Google commun à toutes les installations, et ralentissait
  la lecture des classes.

## Création de personnage : une vraie raison en cas d'échec

« Le personnage n'a pas pu être créé » dit maintenant pourquoi : la raison donnée par
Google, le code de l'erreur, ou que le service local d'Eraser n'a pas répondu. Le détail est
aussi écrit dans `%APPDATA%/Eraser/logs/eraser-startup.log` (lignes `CHARACTER_CREATE_FAILED`).
