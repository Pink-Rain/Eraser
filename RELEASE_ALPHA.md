# Eraser 0.1.1-alpha.51 — des doublons de sorts qu’on peut vraiment traiter

L’onglet **Doublons** de l’Index des classes est entièrement repensé.

## Des groupes, pas des paires

Les sorts semblables sont regroupés : si A ressemble à B et B à C, les trois se
comparent ensemble. La liste de gauche se filtre par type de ressemblance
(doublon exact, même description, même nom, très proche) et par recherche.

## Une comparaison côte à côte

Chaque sort du groupe a sa colonne, avec :

- **d’où il vient** : ses classes et ses rangs, aux couleurs de chaque classe ;
- son ID et sa ligne dans la feuille ;
- tous ses champs, ceux qui diffèrent étant surlignés ;
- **Modifier** (l’éditeur complet) et **Supprimer**.

## La fusion champ par champ

1. Choisis le sort à **garder**.
2. Pour chaque champ qui diffère, clique la version à conserver.
3. Les **classes et rangs sont réunis** sur le sort gardé ; si une même classe a
   deux rangs, tu choisis lequel.
4. **Fusionner** : le sort gardé est mis à jour, les autres sont supprimés.

Les créatures qui utilisaient un sort supprimé passent automatiquement au sort
gardé. Si la feuille a changé entre-temps, rien n’est écrit et l’application
demande d’actualiser.

## « Ce ne sont pas des doublons »

Un faux positif ne revient plus : il est noté dans un onglet **« Doublons
ignorés »** de la feuille des sorts.

Le bouton **Doublons** d’un sort (et le menu d’une ligne) ouvre directement son
groupe ; il n’apparaît que si le sort a des doublons.
