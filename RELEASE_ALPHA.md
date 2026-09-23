# Eraser 0.1.1-alpha.63 — Retour au cadre unique

Cette version arrive par la mise à jour sans réinstallation. Rien à changer côté
Roll20.

- La fenêtre « Token » retrouve un seul cadre par type (doré, cuivré, argenté,
  devanture) : le choix de style ajouté en alpha.62 était un essai, les nouveaux
  cadres sont d’abord discutés avant d’entrer dans l’application.
- La réparation automatique des sessions (alpha.62) est conservée : si la feuille
  « Sessions de campagne » ou son onglet a été supprimé à la main, Eraser la
  retrouve ou recrée l’onglet, puis relit les sessions.

## Vérifications

- lint sans erreur, build de production et build desktop réussis, serveur desktop
  vérifié en HTTP 200 ;
- 22 tests d’interface et 6 tests du pont Roll20 au vert.
