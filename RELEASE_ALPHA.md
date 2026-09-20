# Eraser 0.1.1-alpha.20 — connexion Google Drive réparée

L'alpha.19 (comptes, rôles et Drive partagés) a introduit une régression :
démarrer la connexion Google Drive échouait avec « La connexion Google n'a
pas pu démarrer. ».

## Corrigé

- **la connexion Google Drive démarre à nouveau** : `google_oauth_flows` et
  `user_identity_links` référençaient la table locale `users` par clé
  étrangère. Avec l'annuaire de comptes partagé, cette table locale reste
  vide (les comptes vivent sur le Worker), donc chaque tentative de
  connexion Google échouait silencieusement en violation de contrainte.
  Ces deux tables ne référencent plus `users` localement.

## Notes techniques

- migration `drizzle/0015_desktop_drop_local_uid_fks.sql` : recrée les deux
  tables sans la clé étrangère, en conservant leurs données existantes ;
- vérifié de bout en bout en local (Worker + serveur desktop réels,
  inscription admin, enregistrement des identifiants OAuth, démarrage du
  flux d'autorisation) avant publication.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint sans erreur ;
- reproduction et correction vérifiées localement (Worker de comptes réel +
  serveur desktop réel) ;
- serveur Windows autonome construit et vérifié en HTTP 200.
