# Eraser 0.1.1-alpha.19 — comptes, rôles et connexion Drive partagés

Jusqu'ici, chaque installation Windows lançait son propre serveur local avec
sa propre base de données : le premier compte créé sur une machine devenait
automatiquement administrateur sur cette machine, restait invisible dans la
page « Comptes et rôles » d'une autre installation, et la connexion Google
Drive d'un admin ne profitait à personne d'autre.

## Ajouté

- un petit Worker Cloudflare séparé et dédié (`eraser-accounts`, voir
  `worker-accounts/`), distinct du site Sites/Cloudflare historique, héberge
  désormais l'annuaire partagé des comptes, des rôles et de la connexion
  Google Drive ;
- une fois `ERASER_ACCOUNTS_API_URL`/`ERASER_ACCOUNTS_API_KEY` configurés
  (c'est le cas pour cette Release), toute installation Windows lit et écrit
  comptes/rôles/connexion Drive sur ce Worker au lieu de sa base locale ;
- un nouveau compte reste « en attente » tant qu'un·e admin ne lui attribue
  pas de rôle, où qu'il se connecte ; seul le compte configuré via
  `ADMIN_EMAIL` + le code d'installation devient admin automatiquement ;
- une fois la connexion Google Drive faite par un·e admin, toutes les
  installations la voient et peuvent l'utiliser, sans repasser par l'écran
  de connexion Google.

## Notes techniques

- sans ces deux variables (déploiement Cloudflare Sites historique), le
  comportement local d'origine est strictement inchangé ;
- `google_oauth_flows` (état PKCE éphémère) et `user_identity_links`
  restent strictement locaux, comme avant ;
- les données de jeu (personnages, campagnes, classes) restent sur Google
  Sheets/Drive, inchangé.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint sans erreur ;
- Worker de comptes testé localement (inscription, connexion, liste des
  comptes, changement de rôle, paramètres Google OAuth) avant déploiement ;
- Worker déployé et secrets configurés avec succès sur Cloudflare ;
- serveur Windows autonome construit et vérifié en HTTP 200.
