# Eraser 0.1.1-alpha.245 — Fiche de personnage et ajouts plus rapides

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 238) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est modifié dans Google
Sheets.

Relevé de l'alpha 244 sur un vrai poste : les clics sont passés d'une médiane de 568 ms (pire
1,1 s) à 144 ms (pire 0,34 s) ; « Ouvrir la fiche » d'un item 960 → 168 ms, « Suivante »
300 ms à 1,1 s → 104 ms. Les deux lenteurs qu'il montrait encore :

- **Fiche de personnage** : à son ouverture, Eraser créait le moteur audio de Windows pour
  préparer les sons (monter de niveau, choisir un sort, équiper…), ce qui figeait la page un
  quart de seconde. Les sons sont toujours téléchargés d'avance ; le moteur n'est créé qu'au
  premier son joué, juste après l'affichage du clic.
- **Ajouter une ligne** (une note, un message du chat, une relation, une entrée du journal) :
  chaque ajout relisait d'abord chez Google la description du classeur (le numéro et la
  largeur de l'onglet), souvent plus long que l'ajout lui-même — 0,7 à 1,4 s de plus chez
  vous. Elle est gardée en mémoire ; si l'onglet a été recréé ou rétréci ailleurs, Google
  refuse l'ajout sans rien écrire, et Eraser le refait une fois avec la description relue.
