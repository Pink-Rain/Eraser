# Eraser

Eraser est une application Windows de gestion de jeu de rôle : personnages,
campagnes, classes, inventaires, PNJ, magasins, tabletop partagé et pont
Roll20.

Les MJ et les joueur·euses installent `Eraser-Setup.exe` depuis les Releases
GitHub. L’application embarque Electron et un serveur Node/Vinext local servi
sur `http://127.0.0.1:32147` ; aucune installation de Node.js, Git, Rust ou
outil de développement n’est requise.

## Architecture

- Electron démarre et supervise le serveur local, la fenêtre et les mises à
  jour automatiques.
- SQLite conserve les données techniques locales, les caches et certains
  pointeurs nécessaires au serveur embarqué.
- Le Worker Cloudflare `eraser-accounts`, dans `worker-accounts/`, partage les
  comptes, sessions, rôles, réglages OAuth Google, liens d’identité et certains
  états communs entre installations.
- Google Sheets reste la source principale des données JDR.
- Google Drive reste la source principale des médias partagés ; le stockage
  local sert de cache et de repli.
- Trystero assure le temps réel du tabletop.
- Le compagnon et le Mod Roll20 communiquent avec le serveur local pendant
  qu’Eraser est ouvert.

Le détail des responsabilités et des flux se trouve dans
[ARCHITECTURE.md](ARCHITECTURE.md).

## Développement

Prérequis : Node.js 22.13 ou plus récent.

```bash
npm ci
npm run dev
```

Vérifications principales :

```bash
npm run lint
npm run build
npm run test:ci
npm run desktop:build
npm run desktop:verify
```

Le packaging Windows complet s’exécute avec `npm run desktop:dist` sur Windows
ou dans le workflow `.github/workflows/windows-release.yml`.

## Distribution et mises à jour

Le workflow Windows construit l’installateur NSIS, l’installe sur une machine
de test, vérifie le lancement et publie les métadonnées `latest.yml` et
`.blockmap` utilisées par `electron-updater`.

Après installation, Eraser cherche une nouvelle Release au démarrage puis
toutes les six heures. Le téléchargement se fait en arrière-plan et la mise à
jour s’installe au redémarrage ou à la fermeture de l’application.

## Sécurité des données

- Ne jamais ajouter de mot de passe, jeton OAuth, clé privée, secret ou export
  de données utilisateur dans le dépôt.
- Ne jamais recréer une feuille Google lorsqu’une feuille Eraser du même nom
  existe déjà dans le Drive connecté.
- Ne jamais supprimer une migration SQL : les installations existantes les
  appliquent directement.
- Tester les migrations de données sur une copie et prévoir un retour arrière.
