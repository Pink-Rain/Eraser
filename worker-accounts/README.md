# eraser-accounts

Petit Worker Cloudflare séparé qui héberge l'annuaire partagé des comptes,
des rôles et de la connexion Google Drive pour toutes les installations
Windows d'Eraser. Voir la section « Correctif » dans
[`../MIGRATION.md`](../MIGRATION.md) pour le contexte complet.

Ce Worker est totalement indépendant du site Sites/Cloudflare historique
(nom de déploiement différent, base D1 différente). Ne jamais le confondre
avec ce dernier ni le déployer à sa place.

## Déploiement

Le déploiement se fait via le workflow GitHub Actions
`.github/workflows/deploy-accounts-worker.yml` (`workflow_dispatch`), jamais
depuis un poste local, pour ne jamais avoir besoin de faire circuler le jeton
API Cloudflare ailleurs que dans les secrets du dépôt.

Secrets de dépôt nécessaires (Settings → Secrets and variables → Actions) :

| Secret | Rôle |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Autorise `wrangler` à créer/déployer (Workers Scripts: Edit, D1: Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Compte Cloudflare cible |
| `ERASER_ACCOUNTS_API_KEY` | Clé partagée que tous les clients Eraser légitimes envoient (`x-eraser-client-key`) ; aussi utilisée par `windows-release.yml` pour la builder dans l'app |
| `ERASER_ACCOUNTS_TOKEN_ENCRYPTION_KEY` | Clé AES-256 (32 octets, base64url) chiffrant les secrets Google au repos |
| `ERASER_ADMIN_EMAIL` | Email qui peut devenir admin via le code d'installation |
| `ERASER_ADMIN_SETUP_CODE` | Code d'installation associé |

Une fois le Worker déployé, récupérer son URL `https://eraser-accounts.<sous-domaine>.workers.dev`
dans les logs du job et l'ajouter comme secret `ERASER_ACCOUNTS_API_URL` (utilisé
par `windows-release.yml` pour la builder dans l'app desktop).

Relancer le workflow pour tout changement de schéma ou de code : il est
idempotent (réutilise la base D1 existante si elle existe déjà).

## Schéma

Voir `schema.sql`. Sous-ensemble des tables `db/schema.ts` du dépôt principal
directement lié aux comptes : `users`, `sessions`,
`google_drive_authorizations`, `google_oauth_settings`.
