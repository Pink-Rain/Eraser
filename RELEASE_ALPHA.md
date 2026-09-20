# Eraser 0.1.1-alpha.32 — nettoyage de l’application Windows

Cette version retire les derniers éléments techniques de l’ancien environnement
Sites sans supprimer les fonctions actuelles d’Eraser.

## Changements principaux

- retrait du scaffolding OpenAI/Sites et de ses scripts de build ;
- simplification du build Vinext pour l’application locale ;
- remplacement de l’ancienne vérification de parité par une vraie CI desktop ;
- retrait de l’ancien flux d’authentification ChatGPT ;
- conservation du flux OAuth Google PKCE utilisé par l’application Windows ;
- suppression des composants UI génériques inutilisés et de leurs dépendances ;
- documentation actualisée de l’architecture Electron, SQLite, Worker partagé,
  Google Sheets/Drive, tabletop et Roll20.

## Éléments préservés

- le Worker partagé `eraser-accounts` ;
- toutes les migrations SQL ;
- Google Drive et Google Sheets ;
- le tabletop et Trystero ;
- l’intégration et les téléchargements Roll20 ;
- l’installateur Windows et les mises à jour automatiques.

## Vérifications

- installation propre des dépendances ;
- lint sans erreur ;
- build Vinext réussi ;
- tests stables réussis ;
- serveur desktop construit et vérifié ;
- installateur Windows construit ;
- `latest.yml` et `.blockmap` vérifiés ;
- installation et démarrage réels d’Eraser réussis sur Windows.

Le test Roll20 historiquement rouge reste conservé et sera réparé dans un
chantier séparé.
