# Migration d’Eraser vers une application Windows autonome

## Objectif définitif

Le dépôt GitHub contient toute la source. GitHub Actions construit une
application Windows installable et publie `Eraser-Setup.exe` dans les Releases.
L’application ne doit pas ouvrir ou dépendre de l’ancienne URL Sites.

L’utilisateur·ice final·e ne doit installer ni Git, ni Node.js, ni Rust, ni
Tauri et ne doit exécuter aucune commande.

## Dépendances de la version Sites à remplacer

| Élément actuel | Usage observé | Destination de migration |
| --- | --- | --- |
| Worker Cloudflare | Pages dynamiques et routes API | Serveur local embarqué dans l’application |
| D1 `DB` | Comptes, sessions, index, connexions et liens Roll20 | Base locale + données partagées déplacées vers Google Sheets/Drive |
| R2 `BUCKET` | Portraits, cartes et bannières | Google Drive et cache local |
| Variables Sites | Configuration administrative et chiffrement | Coffre sécurisé du système et configuration locale |
| Google OAuth | Drive, Sheets et Apps Script | Connexion Google depuis l’application |
| Trystero | Synchronisation directe du tabletop | Conservé après tests dans l’application |
| API Roll20 | Échanges avec l’extension et le mod | Service local de l’application + extension adaptée |

## Données D1 identifiées

- `users`
- `sessions`
- `drive_connections`
- `google_drive_authorizations`
- `google_oauth_settings`
- `jdr_google_sheets`
- `character_index`
- `campaign_index`
- `campaign_characters`
- `roll20_campaign_links`
- `class_index`
- `sheet_index_syncs`
- `admin_todos`
- `google_apps_script_integrations`

## Étapes de migration

1. Conserver un instantané complet et sans secret sur GitHub.
2. Séparer l’interface des services exclusivement disponibles dans Sites.
3. Ajouter le serveur local et la base locale embarqués.
4. Déplacer les données qui doivent rester partagées vers Google Sheets/Drive.
5. Adapter l’authentification Google, les images, le tabletop et Roll20.
6. Exporter puis importer les données existantes sans supprimer la source.
7. Construire l’installateur Windows avec GitHub Actions.
8. Tester l’installation, la connexion, les rôles, les campagnes, les fiches,
   les inventaires, le tabletop et Roll20.
9. Publier la première Release stable.
10. Activer ensuite les mises à jour automatiques signées.

## Garde-fous

- Aucune donnée Sites n’est supprimée pendant la migration.
- Les secrets et jetons ne sont jamais stockés dans GitHub.
- Les fonctions critiques sont migrées et testées une par une.
- L’ancien site reste un filet de sécurité jusqu’à validation de l’application.
