# Eraser 0.1.1-alpha.120 — Inventaire réparé, action de rechargement, icônes des modificateurs

Cette version arrive par la mise à jour sans réinstallation.

## L'inventaire reste correct après un rafraîchissement

Au chargement, la page reçoit d'abord un inventaire rapide (sans le catalogue des
objets), puis le complet. Quand le rapide arrivait en second, il effaçait les colonnes
de combat des objets : « {Valeur} » restait écrit tel quel et rien ne s'affichait sous
l'effet. L'inventaire rapide garde maintenant ce que le complet a déjà apporté, et il
reprend lui-même le catalogue quand celui-ci est déjà en mémoire.

## Sous l'effet : du texte, sans étiquettes

L'action, la distance et la compétence s'affichent en texte, séparées par « · », chacune
dans le style imposé de sa colonne. Il n'y a plus d'étiquettes, ni de pastille d'unité.
Les attributs s'écrivent dans le style de leur colonne, séparés par des virgules. Les
matériaux et les runes gardent leur couleur.

## {Valeur} dans le style de sa colonne

Une valeur insérée dans l'effet ou la description par {Valeur}, {Valeur 2}, {Distance}…
prend le style imposé de sa colonne (par exemple en gras).

## Colonne « Action de rechargement »

Nouvelle colonne de l'Index des objets, ajoutée à droite, avec la même liste que
l'Action. Sous l'effet, elle s'affiche avant l'action, seulement si elle est remplie.
Elle s'écrit aussi {Action de rechargement} dans un effet.

## Icônes des modificateurs d'armes

« Armes - Modificateurs » reçoit une colonne **Icône** (ajoutée à droite), avec toutes
les icônes d'Eraser ou un émoji. L'icône s'affiche devant le nom de l'attribut, du
matériau ou de la rune : sous l'effet des objets, dans les survols et dans les noms
cités entre accolades.
