# Eraser 0.1.1-alpha.179 — « Actualiser » relit vraiment tout

Cette version arrive par la mise à jour sans réinstallation.

## Le bouton Actualiser (et F5) fait une actualisation complète

Avant, Actualiser ne redemandait que la page affichée. Le serveur local d'Eraser pouvait
alors resservir ce qu'il gardait déjà en mémoire, si bien qu'une modification faite
ailleurs (dans Google Sheets, ou par un autre joueur) n'apparaissait pas tout de suite.

Désormais, Actualiser :

1. **laisse finir les enregistrements en cours** : une case de fiche qui part vers Google
   n'est ni perdue ni bloquée ;
2. **vide la mémoire du serveur local** : feuilles, index, classes, sorts, spécificités,
   bonus de rang, références. Personnages, campagnes et classes sont resynchronisés ;
3. **recharge toute la fenêtre**, qui relit tout dans Google.

Les onglets ouverts restent ouverts. Ctrl+F5 fait la même chose que F5.

Rien n'est supprimé ni modifié : ni dans Google, ni sur le serveur partagé.
