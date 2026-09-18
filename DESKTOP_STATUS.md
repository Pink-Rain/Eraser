# État de l’application Windows

Ce document sépare ce qui est déjà vérifié de ce qui doit encore être migré.
Le site Sites/Cloudflare publié n’est pas modifié par ce travail.

## Vérifié automatiquement

- La source historique continue à compiler dans son mode Cloudflare.
- Le build Windows produit un serveur Node autonome ; il ne charge pas le site
  public dans une fenêtre.
- Le serveur Windows démarre sur `127.0.0.1`, initialise une base SQLite locale
  avec les 13 migrations existantes et répond en HTTP 200.
- Les portraits, bannières et fonds de carte sont enregistrés dans le dossier de
  données local de l’application au lieu de R2.
- Le premier compte créé dans une installation neuve devient administrateur.
- GitHub Actions fabrique `Eraser-Setup.exe`, `latest.yml` et le fichier de mise à
  jour différentielle `.blockmap`.
- L’installateur est exécuté silencieusement sur une machine Windows de test ;
  GitHub vérifie ensuite que `Eraser.exe` existe, démarre et reste actif.

## Données et connexions à migrer avant une version stable

### Données D1 et R2 du site actuel

La nouvelle application possède sa propre base locale et ne contient pas encore
les lignes de la base D1 de production ni les images R2. Ces données ne doivent
jamais être copiées dans GitHub, même si le dépôt est privé. Il faut préparer un
export/import séparé et chiffré, puis le tester sur une copie.

### Google Sheets et Google Drive

Le code Sheets/Drive est conservé. Les secrets ne sont pas placés dans GitHub.
La connexion doit être revalidée avec un client OAuth Google de type application
de bureau et une redirection locale. Les feuilles existantes ne sont ni effacées
ni recréées automatiquement pendant cette phase.

### Roll20

Le compagnon navigateur actuel appelle explicitement l’adresse du site publié :
`https://eraser-jdr.eliot-myr-0.chatgpt.site/api/roll20/bridge`.
Il ne peut donc pas encore joindre le port local dynamique de l’application.
Il faudra reconstruire le compagnon Roll20 avec une découverte locale sûre ou
un petit relais distant. Le script Mod et ses formats de données restent dans le
dépôt afin de préserver le comportement à adapter.

## Mises à jour automatiques

Le format electron-builder (`latest.yml` et `.blockmap`) et le code de vérification
des mises à jour sont préparés. Le dépôt GitHub est actuellement privé : une
application distribuée ne doit pas embarquer de jeton GitHub personnel. Avant
d’activer les mises à jour silencieuses, il faudra rendre les Releases accessibles
publiquement ou choisir un flux de mise à jour authentifié distinct.

## Règle de publication

Ne pas fusionner cette branche dans `main`, ne pas publier une Release stable et
ne pas retirer le site actuel tant que l’import des données et les connexions
Google/Roll20 n’ont pas été validés sur une copie.
