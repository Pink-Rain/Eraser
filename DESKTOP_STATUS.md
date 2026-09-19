# État de l’application Windows

Ce document sépare ce qui est déjà vérifié de ce qui doit encore être migré.
Le site Sites/Cloudflare publié n’est pas modifié par ce travail.

## Vérifié automatiquement

- La source historique continue à compiler dans son mode Cloudflare.
- Le build Windows produit un serveur Node autonome ; il ne charge pas le site
  public dans une fenêtre.
- Le serveur Windows démarre sur `127.0.0.1:32147`, initialise une base SQLite locale
  avec les 14 migrations existantes et répond en HTTP 200.
- Les portraits, bannières et fonds de carte sont enregistrés dans le dossier de
  données local de l’application au lieu de R2.
- Le premier compte créé dans une installation neuve devient administrateur.
- GitHub Actions fabrique `Eraser-Setup.exe`, `latest.yml` et le fichier de mise à
  jour différentielle `.blockmap`.
- L’installateur est exécuté silencieusement sur une machine Windows de test ;
  GitHub vérifie ensuite que `Eraser.exe` existe, que le serveur local est prêt et
  que la vraie page de connexion répond en HTTP 200.
- Le test Windows attend l’hydratation de l’interface, remplit le formulaire de
  création, crée réellement le premier compte administrateur et vérifie sa session.
- La branche Windows contient tous les fichiers de `main`, sans suppression ni
  renommage, et aucun fichier CSS historique n’est modifié.

## Données et connexions à migrer avant une version stable

### Données D1 et R2 du site actuel

La nouvelle application possède sa propre base locale et ne contient pas encore
les lignes de la base D1 de production ni les images R2. Ces données ne doivent
jamais être copiées dans GitHub, même si le dépôt est privé. Il faut préparer un
export/import séparé et chiffré, puis le tester sur une copie.

### Google Sheets et Google Drive

Le code Sheets/Drive est conservé. Les secrets ne sont pas placés dans GitHub,
même si le dépôt est public.
La connexion se fait dans le navigateur système avec une redirection locale vers
`http://127.0.0.1:32147/api/admin/google-drive/oauth/callback`. Les feuilles
existantes sont retrouvées par leur nom exact et reliées sans suppression. Une
nouvelle feuille n’est créée que si une feuille indispensable manque réellement.
Après la liaison, l’administrateur associe son compte local au groupe de données
qui contient ses campagnes et personnages. Cette association reste dans SQLite :
elle ne contacte aucun site et ne réécrit aucun identifiant dans Google Sheets.

### Roll20

Le compagnon navigateur v0.4.0 appelle l’application locale sur
`http://127.0.0.1:32147/api/roll20/bridge`. Il conserve la synchronisation des
PNJ, magasins, portraits, jetons et le renvoi des PV. L’application doit rester
ouverte pendant l’utilisation de Roll20.

## Mises à jour automatiques

Le dépôt et ses Releases sont publics. Eraser vérifie les versions au démarrage
et toutes les six heures, télécharge automatiquement l’installateur différentiel,
puis propose de redémarrer immédiatement. Si la personne choisit d’attendre, la
version téléchargée s’installe lors de la fermeture de l’application. Aucun jeton
GitHub personnel n’est embarqué.

## Règle de publication

Ne pas fusionner cette branche dans `main`, ne pas publier une Release stable et
ne pas retirer le site actuel tant que l’import des données et les connexions
Google/Roll20 n’ont pas été validés sur une copie.
