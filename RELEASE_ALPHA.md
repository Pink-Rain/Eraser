# Eraser 0.1.1-alpha.57 — Index des classes plus rapide

Cette version arrive par la mise à jour sans réinstallation.

## Index des classes, onglet « Par classe »

- **Les sorts sans titre s’affichent.** Une ligne de la feuille « Sorts de classe »
  sans nom ni ID n’apparaissait nulle part. Elle est maintenant affichée dès
  qu’elle contient un effet, une description ou une classe. Le champ du nom indique
  « Sans titre », et un sort peut être enregistré sans titre.
- Plusieurs sorts sans titre ne sont plus signalés comme doublons entre eux : seul
  leur texte compte.
- **Enregistrement plus rapide.** Avant, chaque modification relisait toute la
  feuille des sorts avec sa mise en forme, relançait une recherche dans Drive puis
  envoyait quatre écritures l’une après l’autre. Maintenant, Eraser relit seulement
  les valeurs et la ligne modifiée, puis écrit en une seule fois les cellules qui
  ont vraiment changé.
- **Plus de double enregistrement.** Une petite différence de forme entre le sort
  saisi et le sort enregistré (espaces, ID généré) relançait une seconde sauvegarde.
  C’est corrigé : une modification = un envoi.
- **Plus de bouton « Enregistrer » sur les cartes.** Le sort s’enregistre seul
  après une courte pause de frappe, et aussi quand on change de classe ou de page.
  À la place du bouton, la carte affiche « Enregistrement… », « Enregistré » ou
  « Non enregistré » avec un bouton « Réessayer ». Les fenêtres de création
  gardent leur bouton.

## Protection des données

- Des charges notées « ✦ » dans la feuille étaient effacées quand on enregistrait
  le sort depuis Eraser. Elles sont maintenant conservées.
- Une cellule qui ne change pas n’est plus réécrite : sa mise en forme ou sa
  formule faite dans Sheets reste intacte.
- Si la ligne d’un sort a bougé dans Sheets entre-temps (ligne insérée ou
  supprimée), Eraser n’écrit rien et demande d’actualiser, au lieu d’écrire sur
  le mauvais sort.

## Vérifications

- dans un vrai navigateur : un sort sans titre affiché et modifié, un seul envoi
  par modification, une frappe pendant un envoi bien enregistrée ensuite ;
- enregistrement testé sur une copie simulée de la feuille des sorts : une seule
  écriture limitée à la cellule modifiée, « ✦ » conservé, couleur du type reprise
  au changement de catégorie, ligne déplacée détectée, ajout d’un sort sans titre ;
- lint sans erreur, 20 tests d’interface au vert, serveur desktop vérifié en
  HTTP 200.
