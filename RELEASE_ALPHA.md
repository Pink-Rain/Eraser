# Eraser 0.1.1-alpha.267 — Des colonnes qui se remplissent seules

Cette version arrive **sans réinstallation** (enveloppe 10, comme l'alpha 266) : Eraser la
télécharge, redémarre son serveur et recharge la page tout seul. Rien n'est réécrit dans Google
Sheets tant qu'on ne règle pas une colonne.

- **Remplissage automatique, dans tous les index** : « Modifier » › une colonne › « Remplissage
  automatique ». Choisis la colonne d'après laquelle elle se remplit (par exemple « Rangement »
  d'après « Genre ») : toutes les valeurs de cette colonne s'affichent, et pour chacune tu saisis
  ce que la case reçoit, avec le champ de son type : un nombre, du texte, une jauge (des charges),
  une liste, des noms liés, des sections, une couleur, une icône…
- La case se remplit dès que la valeur change, dans le tableau, la fiche ou une nouvelle ligne,
  et s'affiche aussitôt. Elle reste modifiable à la main jusqu'au changement suivant. Une valeur
  sans réglage ne touche pas la case ; « Toute autre valeur » règle tout le reste.
- **Les lignes déjà là** : à l'enregistrement, elles reçoivent aussi leur valeur (case à décocher
  si tu ne le veux pas) ; ensuite, « Remplir les lignes existantes » recommence d'un clic. Tout
  part en un ou deux envois à Google, pour ménager le quota partagé.
- Une colonne liée ↔ remplie ainsi se met à jour en face, comme une saisie. Une colonne remplie
  peut en remplir une autre (jamais en boucle), et le réglage suit la colonne source si elle est
  renommée.
