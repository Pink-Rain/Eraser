# Eraser

Eraser est une application de gestion de jeu de rôle : personnages, campagnes,
classes, inventaires, PNJ, magasins, tabletop partagé et pont Roll20.

Ce dépôt public est désormais la source principale du projet. Il contient le
code complet récupéré depuis l’ancienne version Sites. La migration vers une
application Windows autonome est en cours : l’objectif final est que les MJ et
les joueur·euses téléchargent uniquement `Eraser-Setup.exe` depuis les Releases
GitHub, sans installer d’outil de développement.

Après la première installation, Eraser vérifie les Releases GitHub au démarrage
et toutes les six heures. Une nouvelle version est téléchargée en arrière-plan,
puis installée au redémarrage ou à la fermeture de l’application.

## État actuel

Le code présent dans `app/`, `components/`, `lib/`, `db/` et `worker/` est la
source complète de la version actuellement publiée sur Sites. Cette version
utilise encore des services propres à l’hébergement d’origine :

- Cloudflare D1 pour les comptes, sessions et index internes ;
- Cloudflare R2 pour certains portraits, cartes et bannières ;
- un Worker pour les routes serveur ;
- Google Drive et Google Sheets pour les données JDR partagées ;
- Trystero pour le temps réel du tabletop ;
- l’extension et le mod présents dans `integrations/roll20/` pour Roll20.

Ces dépendances sont inventoriées dans [MIGRATION.md](MIGRATION.md). Ne supprimez
pas l’ancienne version Sites tant que toutes les données n’ont pas été exportées,
migrées et vérifiées dans l’application Windows.

## Règles importantes pour les IA et contributeur·ices

- GitHub est la source principale : toute modification durable doit être faite
  dans ce dépôt.
- Ne jamais ajouter de mot de passe, jeton Google, clé privée ou secret dans le
  dépôt.
- Préserver le fonctionnement existant pendant la migration.
- Google Sheets reste la source partagée des données de jeu tant que la
  migration n’indique pas explicitement le contraire.
- Ne pas réactiver une application qui se contente d’ouvrir l’URL du site :
  l’application finale doit embarquer son interface et son fonctionnement.
- Une Release n’est publiable qu’après vérification de l’installation Windows
  et des fonctions critiques.

## Développement historique

La version Sites est une application Next/Vinext construite pour Cloudflare
Workers. Les commandes et dépendances historiques restent dans `package.json`
pendant la migration afin que le projet existant demeure reproductible.
