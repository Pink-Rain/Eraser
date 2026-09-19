# Eraser 0.1.1-alpha.14 — logo final et retour clair sur les mises à jour

Deux correctifs demandés juste après l'alpha.13 : le logo définitif remplace
l'image provisoire utilisée pour l'icône, et le bouton « Chercher les mises
à jour » dit enfin ce qu'il se passe au lieu d'un message vague identique
dans tous les cas.

## Corrigé

- l'icône de l'application (fenêtre, barre des tâches, onglet navigateur) et
  l'avatar du sélecteur de rôle utilisent maintenant l'image finale du logo
  fournie par l'utilisateur ;
- « Chercher les mises à jour » distingue désormais clairement chaque
  résultat au lieu d'un message flou et identique à chaque clic :
  « Mise à jour X.Y.Z trouvée, téléchargement en cours… », « Aucune mise à
  jour disponible, tu as déjà la dernière version », un message d'erreur
  explicite en cas d'échec, ou un avertissement si la vérification prend
  trop de temps ;
- côté application de bureau, la vérification manuelle attend désormais la
  réponse réelle du service de mise à jour (electron-updater) avant de
  répondre, au lieu de renvoyer un succès immédiat sans savoir si une mise
  à jour existe.

## Vérifications

- compilation complète de l'application réussie ;
- lint sans erreur ;
- vérification de fidélité avec la source du site réussie (aucun fichier CSS
  historique modifié, aucune suppression) ;
- serveur Windows autonome construit et vérifié en HTTP 200 sur
  « /connexion » ;
- build Windows complet en CI (installateur signé, installation silencieuse,
  démarrage, création de compte et session admin) vérifié en succès.
