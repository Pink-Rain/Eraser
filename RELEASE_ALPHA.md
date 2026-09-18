# Eraser 0.1.1-alpha.2 — préversion Windows autonome

Cette préversion installe une vraie application Windows autonome. Elle embarque
le serveur Eraser, utilise une base SQLite locale et un stockage local pour les
images. L’utilisateur n’a pas besoin d’installer Node.js, Git, Tauri ou un autre
outil de développement.

## Vérifications effectuées

- compilation du projet historique Cloudflare sans régression ;
- démarrage du serveur local sur le port stable `32147` et réponse HTTP 200 ;
- création de `Eraser-Setup.exe` ;
- installation silencieuse sur Windows ;
- lancement de `Eraser.exe`, création d’un témoin de démarrage et contrôle de la
  vraie page de connexion ;
- premier compte local automatiquement administrateur.

## Corrigé depuis alpha.1

- l’erreur vague `fetch failed` est remplacée par un démarrage plus patient, un
  diagnostic précis et un journal local ;
- Google Drive/Sheets dispose d’un flux OAuth adapté à l’application Windows ;
- les feuilles Eraser déjà présentes sur le Drive peuvent être reliées sans les
  supprimer ni les recréer ;
- le compagnon Chrome Roll20 v0.4.0 appelle directement l’application locale.

## Limites connues de cette préversion

- elle ne contient pas encore les données D1/R2 du site publié ;
- Google demande encore une validation unique du compte `eraser.jdr@gmail.com`
  sur cette nouvelle installation ;
- le compagnon Chrome et le script Mod Roll20 doivent être remplacés par leurs
  versions 0.4.0 téléchargeables depuis la page Roll20 d’Eraser ;
- les mises à jour automatiques sont préparées, mais un dépôt privé ne permet pas
  de distribuer publiquement le flux de mise à jour sans authentification.

Le site actuel reste en ligne et inchangé. Cette préversion sert à tester le socle
Windows sans remplacer ni supprimer la version Sites.
