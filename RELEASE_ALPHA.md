# Eraser — préversion Windows autonome

Cette préversion installe une vraie application Windows autonome. Elle embarque
le serveur Eraser, utilise une base SQLite locale et un stockage local pour les
images. L’utilisateur n’a pas besoin d’installer Node.js, Git, Tauri ou un autre
outil de développement.

## Vérifications effectuées

- compilation du projet historique Cloudflare sans régression ;
- démarrage du serveur local et réponse HTTP 200 ;
- création de `Eraser-Setup.exe` ;
- installation silencieuse sur Windows ;
- lancement de `Eraser.exe` et contrôle qu’il reste actif ;
- premier compte local automatiquement administrateur.

## Limites connues de cette préversion

- elle ne contient pas encore les données D1/R2 du site publié ;
- Google Sheets/Drive doit être revalidé avec une configuration OAuth de bureau ;
- le compagnon Roll20 appelle encore l’adresse du site publié et doit être adapté
  pour découvrir l’application locale ;
- les mises à jour automatiques sont préparées, mais un dépôt privé ne permet pas
  de distribuer publiquement le flux de mise à jour sans authentification.

Le site actuel reste en ligne et inchangé. Cette préversion sert à tester le socle
Windows sans remplacer ni supprimer la version Sites.
