# Eraser 0.1.1-alpha.26 — visuels partagés et application plus rapide

## Les visuels sont enfin partagés

Les portraits de personnages, portraits de PNJ, bannières de campagne et
fonds de carte étaient écrits dans le dossier local de l'ordinateur qui
les envoyait. Autrement dit : la personne qui envoyait une image était la
seule à pouvoir la voir, pour toujours. Dans une application partagée,
c'est un non-sens.

Ils vivent maintenant dans un dossier du Drive partagé
(« Eraser - Visuels »). Le stockage local devient un simple cache : une
image n'est téléchargée qu'une fois par ordinateur. Les images envoyées
avant cette version sont automatiquement remontées sur le Drive à leur
première lecture — elles cessent donc d'être invisibles pour les autres.

## Les liens d'identité sont partagés

Le lien « ce compte correspond à cet identifiant historique » était lui
aussi local : une réattribution faite sur un ordinateur restait invisible
de tous les autres. Il vit maintenant sur le serveur de comptes partagé,
à côté des comptes et des rôles qu'il décrit.

## Rapidité

- **Chaque page faisait un aller-retour réseau vers le serveur de comptes
  avant d'afficher quoi que ce soit** (validation de la session). Ce
  résultat est maintenant gardé en mémoire quelques secondes : la latence
  disparaît de la navigation. Un changement de rôle ou de statut reste
  appliqué immédiatement.
- **La synchronisation des index réécrivait toutes les lignes de toutes
  les feuilles à chaque chargement de page** — des centaines d'écritures
  successives, même quand rien n'avait changé. Elle ne réécrit plus que
  les lignes réellement modifiées, et n'est plus relancée à chaque page.
- Les images ne déclenchent plus une recherche Drive chacune : une seule
  liste du dossier les sert toutes.

## Vérifications

- compilation complète de l'application (Sites et desktop) réussie ;
- lint et vérification des types sans nouvelle erreur ;
- build production (`npm run build`) réussi.
