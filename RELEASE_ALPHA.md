# Eraser 0.1.1-alpha.6 — connexion persistante

Eraser conserve les comptes protégés par mot de passe.

## Corrigé

- les cookies de connexion utilisent maintenant un stockage Electron persistant ;
- ils sont enregistrés immédiatement lorsqu’ils changent ;
- fermer la fenêtre attend l’enregistrement du cookie avant d’arrêter Eraser ;
- une session locale reste valable un an ;
- l’onglet « Réparer l’accès » permet de choisir un nouveau mot de passe si une
  ancienne installation a déjà créé le compte local.

## Vérifications automatiques

- création du premier compte administrateur avec mot de passe ;
- réinitialisation du mot de passe ;
- reconnexion et nouvelle session ;
- construction et installation de l’exécutable Windows ;
- ouverture réelle d’Eraser et réponse HTTP 200.

Les profils restent privés : connaître un nom de profil ne permet pas de s’y
connecter sans son mot de passe.
