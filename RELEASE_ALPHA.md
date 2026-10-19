# Eraser 0.1.1-alpha.239 — L'Index des items suit son classeur

Cette version arrive **sans réinstallation** pour les installations déjà passées à l'alpha 238
(même enveloppe, la 10) : Eraser la télécharge, redémarre son serveur et recharge la page tout
seul. Rien n'est modifié dans Google Sheets.

## Corrections

- **Index des items vide (« Aucun onglet »)** après avoir réuni, renommé ou supprimé des onglets
  dans Sheets : Eraser gardait en mémoire l'ancienne liste des onglets et ne montrait plus rien
  jusqu'à son redémarrage. La liste suit maintenant le classeur tout de suite.
- **Le classeur des items peut être renommé dans le Drive** (« Index des items ») : Eraser le
  reconnaît à son historique de regroupement, plus à son nom.
