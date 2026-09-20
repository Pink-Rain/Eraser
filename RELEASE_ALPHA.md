# Eraser 0.1.1-alpha.28 — personnages d'une campagne, et magasins

## Ajouter un personnage à une campagne

L'erreur « La connexion à Google Sheets a échoué » s'affichait alors que le
personnage était bel et bien ajouté après actualisation. L'app écrivait
d'abord dans son index local, puis dans la feuille partagée : quand la
seconde écriture échouait, l'erreur était affichée alors que le lien
existait déjà localement — et restait invisible depuis les autres
installations.

L'ordre est inversé : la feuille partagée d'abord, l'index local ensuite.
Une fois le lien écrit des deux côtés, plus rien ne peut le faire passer
pour un échec, et le personnage apparaît immédiatement dans la liste,
sans actualiser la page.

## Retirer un personnage d'une campagne

Nouveau bouton sur chaque carte de la section « Personnages joueurs »,
réservé au MJ et aux administrateurs, avec confirmation. La fiche et
l'inventaire du personnage ne sont pas supprimés : il peut être rajouté
plus tard ou rejoindre une autre campagne. La ligne est retirée de la
feuille partagée, sinon la prochaine synchronisation la réimporterait.

## « Dernier tirage sauvegardé » n'est plus un mensonge

Le tirage d'une campagne était bien enregistré, mais plus rien ne le
relisait : partir de la page ou actualiser le faisait disparaître. Il est
maintenant restauré à l'ouverture de la page, avec la taille de ville
correspondante. Même chose dans le bac à sable.

## Magasins : message d'erreur exploitable

Pour un administrateur, le message générique est complété par le code
d'erreur réel de Google (quota, onglet absent, feuille non reliée…), au
lieu de renvoyer tout le monde vers la connexion Drive quelle que soit la
cause.

## Vérifications

- `npm run build` réussi ;
- lint sans erreur ;
- `npm run desktop:parity` : 0 fichier manquant, 0 style modifié.
