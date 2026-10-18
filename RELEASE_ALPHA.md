# Eraser 0.1.1-alpha.231 — « Modifier » qui laisse la main, l'étoile qui reste en place, des colonnes jusqu'à 5 %

Cette version arrive **sans réinstallation** (même enveloppe que l'alpha 227) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est effacé dans Google
Sheets, ni dans les réglages, ni dans les pages : aucune clé enregistrée ne change.

## « Modifier » d'un index ne bloque plus le reste

- La fenêtre se pose **sur la zone des pages seulement** : les onglets du haut, la navigation à
  gauche et l'en-tête restent visibles et **cliquables** pendant qu'elle est ouverte. On peut donc
  vraiment changer d'onglet ou de page sans la fermer ; elle garde ses modifications.
- Elle suit la place disponible : replier la navigation ou agrandir la fenêtre d'Eraser l'élargit.
- Un clic à côté ne la ferme toujours pas. **Échap** la ferme seulement s'il est tapé dans la
  fenêtre (un Échap tapé dans une autre page ne la ferme plus par surprise).

## L'étoile ne suit plus la sélection (vues)

- Dans la Liste (liste, kanban, maître-détail), choisir une version pour la modifier ne déplace
  plus l'étoile : chaque forme garde **sa** version étoilée, marquée ★ dans la liste.
- Choisir une version kanban ne fait plus surgir le kanban principal dans la liste.
- Les flèches « avancer / reculer » n'apparaissent plus sur une version étoilée, qui reste en tête.

## Colonnes des pages

- Une colonne peut descendre jusqu'à **5 %** de la section (15 % avant), à la règle, aux poignées
  ou en tapant sa part. Une colonne très étroite affiche sa part sans le signe %.
- Précision sur l'alpha 230 : les colonnes de l'atelier s'empilaient quand **la zone de l'atelier**
  était étroite (moins de 38rem), y compris sur un PC ; ce n'était pas lié au type d'écran.
  Depuis l'alpha 230, elles restent côte à côte dès 28rem.
