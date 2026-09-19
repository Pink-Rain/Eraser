# Eraser 0.1.1-alpha.7 — connexion et mises à jour corrigées

Cette version corrige l’écran de connexion de l’application installée et active
les mises à jour automatiques depuis le dépôt GitHub public.

## Corrigé

- « Se connecter » et « Créer un compte » fonctionnent aussi si le JavaScript de
  l’écran tarde à démarrer ;
- le premier compte créé devient administrateur ;
- la réinitialisation publique « Réparer l’accès » est supprimée ;
- seul un administrateur connecté peut attribuer un nouveau mot de passe ;
- les mises à jour sont téléchargées automatiquement et s’installent sans
  retélécharger manuellement l’installateur ;
- la session reste enregistrée après la fermeture d’Eraser.

## Vérifications automatiques

- comparaison complète avec la source du site, y compris les fichiers CSS ;
- chargement interactif réel de l’écran de connexion dans l’application installée ;
- création du premier compte administrateur depuis l’interface ;
- vérification de la session créée par l’interface ;
- construction et installation de l’exécutable Windows ;
- présence de `latest.yml` et du fichier de mise à jour différentielle.

Les profils restent privés : connaître un nom de profil ne permet pas de s’y
connecter sans son mot de passe.
