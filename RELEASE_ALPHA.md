# Eraser 0.1.1-alpha.23 — faux échec à l'ajout d'un personnage, erreurs plus précises

## Corrigé

- **Ajouter un personnage à une campagne pouvait afficher une erreur alors
  que l'ajout avait réellement fonctionné**, visible seulement après avoir
  rafraîchi la page : la liste des membres de la campagne relit ensuite
  Google Sheets pour enrichir l'affichage (classe, niveau, titre), et une
  lecture ratée sur ce point faisait échouer toute l'opération alors que
  le lien campagne/personnage était déjà enregistré. Cette lecture
  d'enrichissement ne fait plus échouer l'opération si elle rate.

## Diagnostic

Ces écrans affichent maintenant la vraie raison technique au lieu d'un
message générique, ce qui permettra de cerner précisément les bugs encore
signalés (classes invisibles pour un compte, magasins qui ne
s'enregistrent pas) :

- Règles > Classe et Ressources > Index des classes affichent le code
  d'erreur réel (visible par les administrateurs) sous le message
  générique quand le chargement échoue.
- Les magasins et l'ajout de personnage à une campagne distinguent
  maintenant une vraie panne de connexion Google Sheets/Drive des autres
  échecs.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
